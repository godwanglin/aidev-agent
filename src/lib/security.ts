import path from 'path';
import fs from 'fs';

export class SecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecurityError';
  }
}

/**
 * Validates that a requested file path resides strictly inside the workspace directory.
 * Prevents directory traversal attacks, relative escapes (../..), and symlink breakouts.
 */
export function sanitizeAndResolvePath(
  workdir: string,
  requestedPath: string,
  allowGlobalSkills: boolean = false
): string {
  if (!workdir) {
    throw new SecurityError('Workdir is not set.');
  }

  const cleanRequested = requestedPath.replace(/^file:\/\/\/?/i, '');
  const normalizedWorkdir = path.resolve(workdir);
  const resolvedTarget = path.isAbsolute(cleanRequested)
    ? path.resolve(cleanRequested)
    : path.resolve(normalizedWorkdir, cleanRequested);

  // Path traversal check: must start with workdir prefix
  const relative = path.relative(normalizedWorkdir, resolvedTarget);
  const isInsideWorkdir = !relative.startsWith('..') && !path.isAbsolute(relative);

  if (isInsideWorkdir) {
    // Symlink check: if target or its parent exists, verify realpath
    if (fs.existsSync(resolvedTarget)) {
      try {
        const realTarget = fs.realpathSync(resolvedTarget);
        const realRelative = path.relative(normalizedWorkdir, realTarget);
        if (realRelative.startsWith('..') || path.isAbsolute(realRelative)) {
          throw new SecurityError(`AccessDenied: Symlink points outside of workspace (${requestedPath})`);
        }
      } catch {
        // If realpath fails, fallback to strict resolved check
      }
    }
    return resolvedTarget;
  }

  // Trusted global skill directory access for read-only operations
  if (allowGlobalSkills) {
    const homeDir = process.env.USERPROFILE || process.env.HOME || 'C:\\Users\\aiden';
    const trustedAidevDir = path.resolve(path.join(homeDir, '.aidev'));
    const trustedBuiltinDir = path.resolve(path.join(process.cwd(), 'builtin'));
    const trustedGeminiDir = path.resolve(path.join(homeDir, '.gemini'));
    const trustedAgentsDir = path.resolve(path.join(homeDir, '.agents'));

    const relAidev = path.relative(trustedAidevDir, resolvedTarget);
    const relBuiltin = path.relative(trustedBuiltinDir, resolvedTarget);
    const relGemini = path.relative(trustedGeminiDir, resolvedTarget);
    const relAgents = path.relative(trustedAgentsDir, resolvedTarget);

    const isInsideTrusted =
      (!relAidev.startsWith('..') && !path.isAbsolute(relAidev)) ||
      (!relBuiltin.startsWith('..') && !path.isAbsolute(relBuiltin)) ||
      (!relGemini.startsWith('..') && !path.isAbsolute(relGemini)) ||
      (!relAgents.startsWith('..') && !path.isAbsolute(relAgents));

    if (isInsideTrusted) {
      return resolvedTarget;
    }
  }

  throw new SecurityError(`AccessDenied: Path traversal attempt detected (${requestedPath})`);
}

// Dangerous commands that must NEVER be executed
const COMMAND_BLACKLIST = [
  /rmdir\s+[\/\\]s\s+[\/\\]q\s+[c-zC-Z]:\\/i,
  /del\s+[\/\\]f\s+[\/\\]s\s+[\/\\]q\s+[c-zC-Z]:\\/i,
  /format\s+[c-zC-Z]:/i,
  /mkfs/i,
  /dd\s+if=/i,
  /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;/i, // Fork bomb
  /nc\s+-e/i,                                // Reverse shell
  /bash\s+-i\s+>&/i,                         // Reverse shell
  /\/dev\/tcp\//i,
  /curl.*\|\s*(bash|sh|powershell|cmd)/i,   // Remote script pipe
  /wget.*\|\s*(bash|sh|powershell|cmd)/i,
];

// Safe commands permitted automatically
const SAFE_COMMAND_WHITELIST = [
  /^(npm|npx|yarn|pnpm|bun)\s+/i,
  /^git\s+/i,
  /^(cargo|go|pytest|python|py)\s+/i,
  /^(ls|dir|echo|cat|type|pwd|cd|mkdir|touch)\s*/i,
  /^(node|node\.exe)\s*/i,
  /^(netstat|findstr|grep|awk|sed|curl|wget)\s*/i,
  /^(wmic|tasklist|taskkill|ps|kill)\s*/i,
  /^(powershell|powershell\.exe|cmd|cmd\.exe|start)\s*/i,
];

export function isCommandBlacklisted(command: string): { blacklisted: boolean; reason?: string } {
  const trimmed = command.trim();
  for (const pattern of COMMAND_BLACKLIST) {
    if (pattern.test(trimmed)) {
      return { blacklisted: true, reason: `Command blocked by system safety guard: ${pattern.toString()}` };
    }
  }
  return { blacklisted: false };
}

export function isCommandSafe(command: string): boolean {
  const trimmed = command.trim();
  return SAFE_COMMAND_WHITELIST.some(pattern => pattern.test(trimmed));
}

export type PermissionMode = 'ASK' | 'AUTO' | 'FULL_ACCESS';
export type ActionType = 'READ' | 'FILE_WRITE' | 'COMMAND';

export interface LocalPermissionsState {
  fileRules?: string[];
  networkRules?: string[];
  terminalRules?: string[];
}

export interface PermissionCheckResult {
  allowed: boolean;
  requiresConfirmation: boolean;
  reason?: string;
}

/**
 * Matches a target string against a wildcard/glob pattern.
 * Supports '*' (matches within segment for files, across everything for URLs/commands) and '**' (matches across path separators).
 */
export function matchPattern(pattern: string, input: string): boolean {
  if (!pattern || !input) return false;
  const p = pattern.trim().replace(/\\/g, '/');
  const target = input.trim().replace(/\\/g, '/');

  if (p === target || p === '*' || p === '**') return true;

  const isUrlOrCommand = p.startsWith('http://') || p.startsWith('https://') || p.includes(' ');

  let regexStr: string;
  if (isUrlOrCommand) {
    regexStr = p
      .replace(/[.+^${}()|[\]]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
  } else {
    regexStr = p
      .replace(/[.+^${}()|[\]]/g, '\\$&')
      .replace(/\*\*/g, '§§GLOBSTAR§§')
      .replace(/\*/g, '[^/]*')
      .replace(/§§GLOBSTAR§§/g, '.*')
      .replace(/\?/g, '.');
  }

  const regex = new RegExp(`^${regexStr}$`, 'i');
  return regex.test(target);
}

export function evaluatePermission(
  mode: PermissionMode,
  action: ActionType,
  target: string,
  rules?: LocalPermissionsState
): PermissionCheckResult {
  // Read operations inside workdir are always allowed
  if (action === 'READ') {
    return { allowed: true, requiresConfirmation: false };
  }

  // Blacklist check for commands: ALWAYS enforce security against dangerous destructive commands!
  if (action === 'COMMAND') {
    const blacklistCheck = isCommandBlacklisted(target);
    if (blacklistCheck.blacklisted) {
      return { allowed: false, requiresConfirmation: false, reason: blacklistCheck.reason };
    }
  }

  // In FULL_ACCESS mode: all workspace file writes and non-blacklisted commands run automatically
  if (mode === 'FULL_ACCESS') {
    return { allowed: true, requiresConfirmation: false };
  }

  // Check local terminal rules for COMMAND
  if (action === 'COMMAND' && rules?.terminalRules && rules.terminalRules.length > 0) {
    const trimmedTarget = target.trim();

    // Check negative terminal rules (e.g. '!rm *', '!del *')
    for (const rule of rules.terminalRules) {
      if (rule.startsWith('!') && matchPattern(rule.slice(1), trimmedTarget)) {
        return {
          allowed: true,
          requiresConfirmation: true,
          reason: `Command matches restricted rule (${rule}): ${target}`,
        };
      }
    }

    // Check positive terminal rules (e.g. 'npm run *', 'git status', 'ls', 'dir')
    const positiveRules = rules.terminalRules.filter((r) => !r.startsWith('!'));
    const isWhitelisted = positiveRules.some((rule) => matchPattern(rule, trimmedTarget));

    if (isWhitelisted) {
      return { allowed: true, requiresConfirmation: false };
    }
  }

  // Check local file rules for FILE_WRITE
  if (action === 'FILE_WRITE' && rules?.fileRules && rules.fileRules.length > 0) {
    const normalizedTarget = target.replace(/\\/g, '/');
    const baseName = path.basename(normalizedTarget);

    // Check negative file rules (e.g. '!.env*', '!*.key', '!*.pem')
    for (const rule of rules.fileRules) {
      if (rule.startsWith('!')) {
        const pattern = rule.slice(1);
        if (matchPattern(pattern, normalizedTarget) || matchPattern(pattern, baseName)) {
          return {
            allowed: true,
            requiresConfirmation: true,
            reason: `Writing to sensitive file protected by rule (${rule}): ${target}`,
          };
        }
      }
    }

    // Check positive file rules (e.g. 'src/**', 'package.json', 'public/**')
    const positiveRules = rules.fileRules.filter((r) => !r.startsWith('!'));
    if (positiveRules.length > 0) {
      const isWhitelisted = positiveRules.some(
        (rule) =>
          matchPattern(rule, normalizedTarget) ||
          matchPattern(`**/${rule}`, normalizedTarget) ||
          matchPattern(rule, baseName)
      );

      if (isWhitelisted) {
        return { allowed: true, requiresConfirmation: false };
      }
    }
  }

  // In AUTO mode: non-blacklisted commands and non-restricted file writes run automatically
  if (mode === 'AUTO') {
    return { allowed: true, requiresConfirmation: false };
  }

  // In default ASK mode: interactive user confirmation is required
  return {
    allowed: true,
    requiresConfirmation: true,
    reason: `Interactive approval required for ${action}: ${target}`,
  };
}
