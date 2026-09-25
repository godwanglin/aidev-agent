import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import fg from 'fast-glob';
import { loadSettings } from './storage';

export interface DiscoveredSkill {
  name: string;
  path: string;
  description: string;
  scope: 'workspace' | 'global' | 'builtin' | 'installed';
  used?: boolean;
}

export interface ScanSkillsOptions {
  autoDiscover?: boolean;
}

interface SkillsCacheEntry {
  timestamp: number;
  skills: Omit<DiscoveredSkill, 'used'>[];
}

const skillsCache = new Map<string, SkillsCacheEntry>();
const SKILLS_CACHE_TTL_MS = 5000; // 5-second in-memory TTL to eliminate repetitive disk I/O lag

/**
 * Invalidates the skills scan cache. Call this after installing or deleting skills.
 */
export function invalidateSkillsCache(): void {
  skillsCache.clear();
}

/**
 * Scans available skills across Installed (skills/installed), Workspace,
 * Global user folder (~/.aidev/skills), and Builtin skills (~/.aidev/builtin/skills, ./builtin/skills).
 * Higher priority scopes override lower ones with the same skill name.
 */
export function scanAvailableSkills(
  workdir?: string,
  sessionContextText?: string,
  options?: ScanSkillsOptions
): DiscoveredSkill[] {
  let shouldAutoDiscover = true;
  if (options?.autoDiscover !== undefined) {
    shouldAutoDiscover = options.autoDiscover;
  } else {
    try {
      shouldAutoDiscover = loadSettings().autoDiscoverSkills !== false;
    } catch {
      shouldAutoDiscover = true;
    }
  }

  const targetWorkdir = workdir || process.cwd();
  const cacheKey = `${targetWorkdir}::${shouldAutoDiscover}`;
  const now = Date.now();
  const cached = skillsCache.get(cacheKey);

  let rawSkills: Omit<DiscoveredSkill, 'used'>[];

  if (cached && now - cached.timestamp < SKILLS_CACHE_TTL_MS) {
    rawSkills = cached.skills;
  } else {
    const homeDir = process.env.USERPROFILE || process.env.HOME || 'C:\\Users\\aiden';
    const skillsMap = new Map<string, Omit<DiscoveredSkill, 'used'>>();

    // Helper to extract skill details from a directory containing SKILL.md
    const inspectSkillDir = (
      skillFolder: string,
      defaultName: string,
      scope: 'workspace' | 'global' | 'builtin' | 'installed'
    ) => {
      const skillMd = path.join(skillFolder, 'SKILL.md');
      if (!fs.existsSync(skillMd)) return;

      let skillName = defaultName.replace(/_/g, '-');
      let description = '';

      try {
        const content = fs.readFileSync(skillMd, 'utf-8');
        const nameMatch = /^name:\s*([^\r\n]+)/m.exec(content);
        if (nameMatch && nameMatch[1]) {
          skillName = nameMatch[1].trim();
        }

        const descMatch = /^description:\s*([^\r\n]+)/m.exec(content);
        const rawDesc = descMatch && descMatch[1] ? descMatch[1].trim() : '';
        if (rawDesc && !['>-', '>', '|-', '|'].includes(rawDesc)) {
          description = rawDesc;
        } else {
          const multiDescMatch = /description:\s*[>|]-?\s*\r?\n((?:[ \t]+[^\r\n]+\r?\n?)+)/.exec(content);
          if (multiDescMatch && multiDescMatch[1]) {
            description = multiDescMatch[1]
              .split(/\r?\n/)
              .map((l) => l.trim())
              .filter(Boolean)
              .join(' ');
          }
        }
      } catch {
        // ignore read error
      }

      const normalizedKey = skillName.toLowerCase();
      if (!skillsMap.has(normalizedKey)) {
        // Auto-detect installed if inside an installed folder
        const finalScope =
          scope === 'installed' || skillFolder.replace(/\\/g, '/').toLowerCase().includes('/skills/installed/')
            ? 'installed'
            : scope;

        skillsMap.set(normalizedKey, {
          name: skillName,
          path: skillFolder,
          description: description || `Specialized skill for ${skillName}`,
          scope: finalScope,
        });
      }
    };

  // Helper to recursively scan folders for SKILL.md (supports nested categories like disciplines, other-engines, etc.)
  const scanDirectoryRecursively = (
    baseDir: string,
    scope: 'workspace' | 'global' | 'builtin' | 'installed',
    depth = 0,
    maxDepth = 4
  ) => {
    if (!fs.existsSync(baseDir) || depth > maxDepth) return;
    try {
      const entries = fs.readdirSync(baseDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const entryNameLower = entry.name.toLowerCase();
        if (
          entryNameLower === 'node_modules' ||
          entryNameLower === '.git' ||
          entryNameLower === '.next' ||
          entryNameLower === 'dist' ||
          entryNameLower === 'build'
        ) {
          continue;
        }
        const fullPath = path.join(baseDir, entry.name);
        if (fs.existsSync(path.join(fullPath, 'SKILL.md'))) {
          inspectSkillDir(fullPath, entry.name, scope);
        } else {
          // If no SKILL.md directly in this folder, recurse into subdirectories (e.g. categories like other-engines, disciplines)
          scanDirectoryRecursively(fullPath, scope, depth + 1, maxDepth);
        }
      }
    } catch {}
  };

  const targetWorkdir = workdir || process.cwd();

  // 1. Installed Skills (Highest Priority, stored in skills/installed)
  const installedDirs = [
    path.join(targetWorkdir, 'skills', 'installed'),
    path.join(process.cwd(), 'skills', 'installed'),
    path.join(homeDir, '.aidev', 'skills', 'installed'),
  ];
  for (const instDir of installedDirs) {
    scanDirectoryRecursively(instDir, 'installed');
  }

  // 2. Workspace / Project level
  if (shouldAutoDiscover && targetWorkdir && fs.existsSync(targetWorkdir)) {
    const projectSkillDirs = [
      path.join(targetWorkdir, '.aidev', 'skills'),
      path.join(targetWorkdir, 'skills'),
      path.join(targetWorkdir, '.agents', 'skills'),
      path.join(targetWorkdir, '.agent', 'skills'),
      path.join(targetWorkdir, '.github', 'skills'),
      path.join(targetWorkdir, '.claude', 'skills'),
      path.join(targetWorkdir, '.gemini', 'skills'),
      path.join(targetWorkdir, '.cursor', 'skills'),
    ];

    // Auto-detect any folder with "skill" in its name or containing SKILL.md under workspace root
    try {
      const topEntries = fs.readdirSync(targetWorkdir, { withFileTypes: true });
      for (const entry of topEntries) {
        if (!entry.isDirectory()) continue;
        const entryNameLower = entry.name.toLowerCase();
        if (
          entryNameLower === 'node_modules' ||
          entryNameLower === '.git' ||
          entryNameLower === '.next' ||
          entryNameLower === 'dist' ||
          entryNameLower === 'build' ||
          entryNameLower === 'installed'
        ) {
          continue;
        }

        const candidatePath = path.join(targetWorkdir, entry.name);

        // Case A: The directory is itself a skill folder (contains SKILL.md)
        if (fs.existsSync(path.join(candidatePath, 'SKILL.md'))) {
          inspectSkillDir(candidatePath, entry.name, 'workspace');
        }

        // Case B: The directory name has "skill" (e.g. custom_skills, team-skills)
        if (entryNameLower.includes('skill') && !projectSkillDirs.includes(candidatePath)) {
          projectSkillDirs.push(candidatePath);
        }
      }
    } catch {}

    for (const dir of projectSkillDirs) {
      scanDirectoryRecursively(dir, 'workspace');
    }
  }

  // 3. Global Machine level (~/.aidev/skills)
  const globalDir = path.join(homeDir, '.aidev', 'skills');
  scanDirectoryRecursively(globalDir, 'global');

  // 4. Builtin Aidev skills (~/.aidev/builtin/skills, ./builtin/skills)
  const builtinDirs = [
    path.join(homeDir, '.aidev', 'builtin', 'skills'),
    path.join(process.cwd(), 'builtin', 'skills'),
    path.join(homeDir, '.gemini', 'antigravity', 'builtin', 'skills'),
  ];
  for (const dir of builtinDirs) {
    scanDirectoryRecursively(dir, 'builtin');
  }

  rawSkills = Array.from(skillsMap.values());
  skillsCache.set(cacheKey, { timestamp: now, skills: rawSkills });
}

const lowerContext = (sessionContextText || '').toLowerCase();
return rawSkills.map((s) => {
  const normKey = s.name.toLowerCase();
  const isUsed =
    lowerContext.length > 0 &&
    (lowerContext.includes(normKey) ||
      lowerContext.includes(path.basename(s.path).toLowerCase()) ||
      lowerContext.includes(path.join(s.path, 'SKILL.md').toLowerCase().replace(/\\/g, '/')));

  return {
    ...s,
    used: isUsed,
  };
});
}

/**
 * Installs a new custom skill into skills/installed/{slug}/SKILL.md
 */
export function installCustomSkill(params: {
  name: string;
  description: string;
  content: string;
  workdir?: string;
}): DiscoveredSkill {
  const baseDir = params.workdir || process.cwd();
  const slug = params.name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-');

  const targetDir = path.join(baseDir, 'skills', 'installed', slug);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  let finalContent = params.content.trim();
  // Ensure YAML frontmatter exists
  if (!finalContent.startsWith('---')) {
    finalContent = `---
name: ${params.name.trim()}
description: ${params.description.trim()}
---

${finalContent}`;
  }

  const skillMdPath = path.join(targetDir, 'SKILL.md');
  fs.writeFileSync(skillMdPath, finalContent, 'utf-8');
  invalidateSkillsCache();

  return {
    name: params.name.trim(),
    path: targetDir,
    description: params.description.trim(),
    scope: 'installed',
    used: false,
  };
}

/**
 * Deletes an installed skill. Fails if the skill is builtin.
 */
export function deleteCustomSkill(skillPath: string): { success: boolean; error?: string } {
  const norm = skillPath.replace(/\\/g, '/').toLowerCase();
  if (
    norm.includes('/builtin/') ||
    norm.includes('\\builtin\\') ||
    norm.includes('gemini/antigravity/builtin') ||
    norm.includes('.aidev/builtin')
  ) {
    throw new Error('Built-in skills cannot be deleted.');
  }

  // Ensure path exists
  if (!fs.existsSync(skillPath)) {
    throw new Error('Skill directory not found.');
  }

  fs.rmSync(skillPath, { recursive: true, force: true });
  invalidateSkillsCache();
  return { success: true };
}

/**
 * Reads SKILL.md content from a skill directory
 */
export function getSkillContent(skillPath: string): string {
  const skillMdPath = path.join(skillPath, 'SKILL.md');
  if (!fs.existsSync(skillMdPath)) {
    throw new Error(`SKILL.md file not found in ${skillPath}`);
  }
  return fs.readFileSync(skillMdPath, 'utf-8');
}

/**
 * Automatically discovers and downloads all files from a GitHub folder or URL into skills/installed/{slug}
 */
export interface InstallSkillResult {
  name: string;
  path: string;
  description: string;
  scope: 'workspace' | 'global' | 'builtin' | 'installed';
  count: number;
  installedSkills: DiscoveredSkill[];
  isCollection?: boolean;
}

/**
 * Parses any GitHub URL (tree, blob, raw, or repo root) into repository URL, branch, and sub-path.
 */
export function parseGitHubUrl(rawUrl: string): {
  repoUrl: string;
  owner: string;
  repo: string;
  branch: string;
  subPath: string;
} | null {
  let url = rawUrl.trim().replace(/\/+$/, '');
  if (url.toLowerCase().endsWith('/skill.md')) {
    url = url.slice(0, -'/skill.md'.length);
  }

  // Pattern 1: github.com/:owner/:repo/tree/:branch/:path...
  const treeMatch = /^https?:\/\/github\.com\/([^\/]+)\/([^\/]+)\/tree\/([^\/]+)(?:\/(.*))?$/i.exec(url);
  if (treeMatch) {
    const [, owner, repo, branch, subPath = ''] = treeMatch;
    return {
      repoUrl: `https://github.com/${owner}/${repo}.git`,
      owner,
      repo: repo.replace(/\.git$/i, ''),
      branch,
      subPath: subPath.replace(/\/+$/, ''),
    };
  }

  // Pattern 2: github.com/:owner/:repo/blob/:branch/:path...
  const blobMatch = /^https?:\/\/github\.com\/([^\/]+)\/([^\/]+)\/blob\/([^\/]+)(?:\/(.*))?$/i.exec(url);
  if (blobMatch) {
    const [, owner, repo, branch, fullPath = ''] = blobMatch;
    const subPath = fullPath.includes('/') ? fullPath.substring(0, fullPath.lastIndexOf('/')) : '';
    return {
      repoUrl: `https://github.com/${owner}/${repo}.git`,
      owner,
      repo: repo.replace(/\.git$/i, ''),
      branch,
      subPath,
    };
  }

  // Pattern 3: raw.githubusercontent.com/:owner/:repo/:branch/:path...
  const rawMatch = /^https?:\/\/raw\.githubusercontent\.com\/([^\/]+)\/([^\/]+)\/([^\/]+)(?:\/(.*))?$/i.exec(url);
  if (rawMatch) {
    const [, owner, repo, branch, subPath = ''] = rawMatch;
    return {
      repoUrl: `https://github.com/${owner}/${repo}.git`,
      owner,
      repo: repo.replace(/\.git$/i, ''),
      branch,
      subPath: subPath.replace(/\/+$/, ''),
    };
  }

  // Pattern 4: github.com/:owner/:repo (repo root)
  const repoMatch = /^https?:\/\/github\.com\/([^\/]+)\/([^\/]+)(?:\/)?$/i.exec(url);
  if (repoMatch) {
    const [, owner, repo] = repoMatch;
    return {
      repoUrl: `https://github.com/${owner}/${repo.replace(/\.git$/i, '')}.git`,
      owner,
      repo: repo.replace(/\.git$/i, ''),
      branch: 'main',
      subPath: '',
    };
  }

  return null;
}

/**
 * Automatically discovers and downloads skills from a GitHub folder or URL into skills/installed/{slug}.
 * Natively supports multi-skill collections (unpacks all nested skills without creating fake root SKILL.md).
 */
export async function installSkillFromUrl(params: {
  importUrl: string;
  workdir?: string;
  scope?: 'global' | 'workspace';
  overrideName?: string;
  overrideDesc?: string;
}): Promise<InstallSkillResult> {
  const homeDir = process.env.USERPROFILE || process.env.HOME || 'C:\\Users\\aiden';
  const isGlobal = params.scope === 'global' || !params.workdir;
  const destBaseDir = isGlobal
    ? path.join(homeDir, '.aidev', 'skills', 'installed')
    : path.join(params.workdir!, 'skills', 'installed');

  if (!fs.existsSync(destBaseDir)) {
    fs.mkdirSync(destBaseDir, { recursive: true });
  }

  // Clean up any legacy broken dummy folder destBaseDir/skills/SKILL.md if it exists
  try {
    const oldDummy = path.join(destBaseDir, 'skills', 'SKILL.md');
    if (fs.existsSync(oldDummy)) {
      const oldTxt = fs.readFileSync(oldDummy, 'utf-8');
      if (oldTxt.includes('name: skills') || oldTxt.includes('name: custom-skill')) {
        fs.unlinkSync(oldDummy);
      }
    }
  } catch {}

  let cleanUrl = params.importUrl.trim().replace(/\/+$/, '');
  if (cleanUrl.toLowerCase().endsWith('/skill.md')) {
    cleanUrl = cleanUrl.slice(0, -'/skill.md'.length);
  }

  const folderName = cleanUrl.split('/').filter(Boolean).pop() || 'custom-skill';
  const defaultSlug = (params.overrideName || folderName)
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-');

  const gh = parseGitHubUrl(cleanUrl);
  let cloneSuccess = false;
  let tempDir = '';
  const installedList: DiscoveredSkill[] = [];

  // Strategy 1: Git shallow clone (bypasses GitHub REST API rate limits and captures all files & subtrees)
  if (gh) {
    tempDir = path.join(os.tmpdir(), `aidev-skill-import-${Date.now()}`);
    try {
      execSync(`git clone --depth 1 -b ${gh.branch} ${gh.repoUrl} "${tempDir}"`, {
        stdio: 'pipe',
        timeout: 45000,
      });
      cloneSuccess = true;
    } catch {
      try {
        execSync(`git clone --depth 1 ${gh.repoUrl} "${tempDir}"`, {
          stdio: 'pipe',
          timeout: 45000,
        });
        cloneSuccess = true;
      } catch {}
    }
  }

  if (cloneSuccess && tempDir) {
    try {
      const sourceFolder = gh?.subPath ? path.join(tempDir, gh.subPath) : tempDir;
      if (fs.existsSync(sourceFolder)) {
        const skillFiles = fg.sync('**/SKILL.md', {
          cwd: sourceFolder,
          deep: 5,
          caseSensitiveMatch: false,
        });

        if (skillFiles.length > 1) {
          // Multi-skill collection (e.g. gamedev-skills with disciplines, other-engines, etc.)
          for (const relSkillFile of skillFiles) {
            const relDir = path.dirname(relSkillFile);
            const srcSkillDir = relDir === '.' ? sourceFolder : path.join(sourceFolder, relDir);
            const destSkillDir = path.join(destBaseDir, relDir);
            if (!fs.existsSync(destSkillDir)) {
              fs.mkdirSync(destSkillDir, { recursive: true });
            }
            fs.cpSync(srcSkillDir, destSkillDir, { recursive: true, force: true });

            const skillMdPath = path.join(destSkillDir, 'SKILL.md');
            let skillName = path.basename(relDir);
            let skillDesc = '';
            if (fs.existsSync(skillMdPath)) {
              const content = fs.readFileSync(skillMdPath, 'utf-8');
              const nameMatch = /^name:\s*([^\r\n]+)/m.exec(content);
              if (nameMatch && nameMatch[1]) skillName = nameMatch[1].trim();
              const descMatch = /^description:\s*([^\r\n]+)/m.exec(content);
              if (descMatch && descMatch[1]) skillDesc = descMatch[1].trim();
            }

            installedList.push({
              name: skillName,
              path: destSkillDir,
              description: skillDesc || `Skill ${skillName}`,
              scope: isGlobal ? 'global' : 'installed',
              used: false,
            });
          }

          invalidateSkillsCache();
          return {
            name: installedList[0]?.name || defaultSlug,
            path: destBaseDir,
            description: `Collection of ${installedList.length} skills from ${cleanUrl}`,
            scope: isGlobal ? 'global' : 'installed',
            count: installedList.length,
            installedSkills: installedList,
            isCollection: true,
          };
        } else if (skillFiles.length === 1) {
          // Exactly 1 skill found in source folder
          const relDir = path.dirname(skillFiles[0]);
          const srcSkillDir = relDir === '.' ? sourceFolder : path.join(sourceFolder, relDir);
          const detectedFolder = path.basename(srcSkillDir);
          const skillSlug = (params.overrideName || (detectedFolder !== '.' ? detectedFolder : defaultSlug))
            .toLowerCase()
            .replace(/[^a-z0-9_-]/g, '-')
            .replace(/-+/g, '-');
          const destSkillDir = path.join(destBaseDir, skillSlug);
          if (!fs.existsSync(destSkillDir)) {
            fs.mkdirSync(destSkillDir, { recursive: true });
          }
          fs.cpSync(srcSkillDir, destSkillDir, { recursive: true, force: true });

          const skillMdPath = path.join(destSkillDir, 'SKILL.md');
          let skillName = skillSlug;
          let skillDesc = params.overrideDesc || '';
          if (fs.existsSync(skillMdPath)) {
            const content = fs.readFileSync(skillMdPath, 'utf-8');
            const nameMatch = /^name:\s*([^\r\n]+)/m.exec(content);
            if (nameMatch && nameMatch[1] && !params.overrideName) skillName = nameMatch[1].trim();
            const descMatch = /^description:\s*([^\r\n]+)/m.exec(content);
            if (descMatch && descMatch[1] && !params.overrideDesc) skillDesc = descMatch[1].trim();
          }

          const singleSkill: DiscoveredSkill = {
            name: skillName,
            path: destSkillDir,
            description: skillDesc || `Skill ${skillName}`,
            scope: isGlobal ? 'global' : 'installed',
            used: false,
          };

          invalidateSkillsCache();
          return {
            name: singleSkill.name,
            path: singleSkill.path,
            description: singleSkill.description,
            scope: isGlobal ? 'global' : 'installed',
            count: 1,
            installedSkills: [singleSkill],
            isCollection: false,
          };
        }
      }
    } finally {
      if (tempDir && fs.existsSync(tempDir)) {
        try {
          fs.rmSync(tempDir, { recursive: true, force: true });
        } catch {}
      }
    }
  }

  // Strategy 2: Fallback to direct HTTP fetch for raw URLs or non-git hosts
  const targetDir = path.join(destBaseDir, defaultSlug);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  let skillMdContent = '';
  let discoveredDescription = params.overrideDesc || '';
  let discoveredName = params.overrideName || folderName;

  let res = await fetch(`${cleanUrl}/SKILL.md`).catch(() => null);
  if (!res || !res.ok) {
    res = await fetch(cleanUrl).catch(() => null);
  }
  if (!res || !res.ok) {
    throw new Error(
      `Failed to download skill from URL: ${res ? `HTTP ${res.status}` : 'Network error'}. Please ensure the GitHub repository/folder URL is valid.`
    );
  }
  skillMdContent = await res.text();
  fs.writeFileSync(path.join(targetDir, 'SKILL.md'), skillMdContent, 'utf-8');

  // Parse metadata
  const nameMatch = /^name:\s*([^\r\n]+)/m.exec(skillMdContent);
  if (nameMatch && nameMatch[1] && !params.overrideName) {
    discoveredName = nameMatch[1].trim();
  }
  const descMatch = /^description:\s*([^\r\n]+)/m.exec(skillMdContent);
  if (descMatch && descMatch[1] && !params.overrideDesc) {
    discoveredDescription = descMatch[1].trim();
  }

  const singleSkill: DiscoveredSkill = {
    name: discoveredName,
    path: targetDir,
    description: discoveredDescription || `Skill ${discoveredName} (Installed from URL)`,
    scope: isGlobal ? 'global' : 'installed',
    used: false,
  };

  invalidateSkillsCache();
  return {
    name: singleSkill.name,
    path: singleSkill.path,
    description: singleSkill.description,
    scope: isGlobal ? 'global' : 'installed',
    count: 1,
    installedSkills: [singleSkill],
    isCollection: false,
  };
}

/**
 * Formats discovered skills into the AI Agent system prompt catalog.
 */
export function formatSkillsSystemPrompt(skills: DiscoveredSkill[]): string {
  if (skills.length === 0) return '';

  const lines = skills.map((s) => {
    const skillMdPath = path.join(s.path, 'SKILL.md');
    return `- ${s.name} (${skillMdPath}): ${s.description}`;
  });

  return `
Specialized Skills:
You can use specialized skills to help you with complex tasks.
Each skill contains specialized instructions, scripts, or references in its 'SKILL.md' file.
If a skill seems relevant to the user's task or question, you MUST read its 'SKILL.md' file using 'read_file' before proceeding.

Available skills:
${lines.join('\n')}
`;
}
