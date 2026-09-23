import fs from 'fs';
import path from 'path';
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
  const homeDir = process.env.USERPROFILE || process.env.HOME || 'C:\\Users\\aiden';
  const skillsMap = new Map<string, DiscoveredSkill>();

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
      const lowerContext = (sessionContextText || '').toLowerCase();
      const isUsed =
        lowerContext.length > 0 &&
        (lowerContext.includes(normalizedKey) ||
          lowerContext.includes(defaultName.toLowerCase()) ||
          lowerContext.includes(skillMd.toLowerCase().replace(/\\/g, '/')));

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
        used: isUsed,
      });
    }
  };

  const targetWorkdir = workdir || process.cwd();

  // 1. Installed Skills (Highest Priority, stored in skills/installed)
  const installedDirs = [
    path.join(targetWorkdir, 'skills', 'installed'),
    path.join(process.cwd(), 'skills', 'installed'),
    path.join(homeDir, '.aidev', 'skills', 'installed'),
  ];
  for (const instDir of installedDirs) {
    if (!fs.existsSync(instDir)) continue;
    try {
      const entries = fs.readdirSync(instDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        inspectSkillDir(path.join(instDir, entry.name), entry.name, 'installed');
      }
    } catch {}
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
      if (!fs.existsSync(dir)) continue;
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isDirectory()) continue;
          if (entry.name.toLowerCase() === 'installed') continue; // Handled above
          inspectSkillDir(path.join(dir, entry.name), entry.name, 'workspace');
        }
      } catch {}
    }
  }

  // 3. Global Machine level (~/.aidev/skills)
  const globalDir = path.join(homeDir, '.aidev', 'skills');
  if (fs.existsSync(globalDir)) {
    try {
      const entries = fs.readdirSync(globalDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (entry.name.toLowerCase() === 'installed') continue;
        inspectSkillDir(path.join(globalDir, entry.name), entry.name, 'global');
      }
    } catch {}
  }

  // 4. Builtin Aidev skills (~/.aidev/builtin/skills, ./builtin/skills)
  const builtinDirs = [
    path.join(homeDir, '.aidev', 'builtin', 'skills'),
    path.join(process.cwd(), 'builtin', 'skills'),
    path.join(homeDir, '.gemini', 'antigravity', 'builtin', 'skills'),
  ];
  for (const dir of builtinDirs) {
    if (!fs.existsSync(dir)) continue;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        inspectSkillDir(path.join(dir, entry.name), entry.name, 'builtin');
      }
    } catch {}
  }

  return Array.from(skillsMap.values());
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
export async function installSkillFromUrl(params: {
  importUrl: string;
  workdir?: string;
  overrideName?: string;
  overrideDesc?: string;
}): Promise<DiscoveredSkill> {
  const baseDir = params.workdir || process.cwd();
  let cleanUrl = params.importUrl.trim().replace(/\/+$/, '');

  // Strip trailing /SKILL.md or /skill.md if user included it
  if (cleanUrl.toLowerCase().endsWith('/skill.md')) {
    cleanUrl = cleanUrl.slice(0, -'/skill.md'.length);
  }

  // Determine fallback skill name from the folder name (e.g. docker from .../skills/docker)
  const folderName = cleanUrl.split('/').filter(Boolean).pop() || 'custom-skill';
  let skillSlug = (params.overrideName || folderName)
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-');

  const targetDir = path.join(baseDir, 'skills', 'installed', skillSlug);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  let skillMdContent = '';
  let discoveredDescription = params.overrideDesc || '';
  let discoveredName = params.overrideName || folderName;

  // Helper to recursively fetch GitHub folder contents via API
  const fetchGitHubFolder = async (
    owner: string,
    repo: string,
    folderPath: string,
    branch: string,
    localDestDir: string
  ): Promise<boolean> => {
    try {
      const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${folderPath}${
        branch ? `?ref=${branch}` : ''
      }`;
      const res = await fetch(apiUrl, {
        redirect: 'follow',
        headers: {
          'User-Agent': 'Aidev-Desktop-Agent',
          Accept: 'application/vnd.github.v3+json',
        },
      });

      if (!res.ok) return false;
      const items = await res.json();
      if (!Array.isArray(items)) return false;

      for (const item of items) {
        const itemLocalPath = path.join(localDestDir, item.name);
        if (item.type === 'file' && item.download_url) {
          const fileRes = await fetch(item.download_url);
          if (fileRes.ok) {
            const text = await fileRes.text();
            fs.writeFileSync(itemLocalPath, text, 'utf-8');
            if (item.name.toLowerCase() === 'skill.md') {
              skillMdContent = text;
            }
          }
        } else if (item.type === 'dir') {
          if (!fs.existsSync(itemLocalPath)) {
            fs.mkdirSync(itemLocalPath, { recursive: true });
          }
          await fetchGitHubFolder(owner, repo, item.path, branch, itemLocalPath);
        }
      }
      return true;
    } catch {
      return false;
    }
  };

  let isGitHubHandled = false;

  // Pattern 1: raw.githubusercontent.com/:owner/:repo/:branch/:path...
  const rawGhMatch = /^https?:\/\/raw\.githubusercontent\.com\/([^\/]+)\/([^\/]+)\/([^\/]+)\/(.+)$/i.exec(cleanUrl);
  if (rawGhMatch) {
    const [, owner, repo, branch, folderPath] = rawGhMatch;
    isGitHubHandled = await fetchGitHubFolder(owner, repo, folderPath, branch, targetDir);
    if (!isGitHubHandled) {
      // Fallback: fetch SKILL.md directly from raw URL
      const rawSkillUrl = `${cleanUrl}/SKILL.md`;
      const fallbackRes = await fetch(rawSkillUrl);
      if (fallbackRes.ok) {
        skillMdContent = await fallbackRes.text();
        fs.writeFileSync(path.join(targetDir, 'SKILL.md'), skillMdContent, 'utf-8');
        isGitHubHandled = true;
      }
    }
  }

  // Pattern 2: github.com/:owner/:repo/tree/:branch/:path...
  if (!isGitHubHandled) {
    const treeGhMatch = /^https?:\/\/github\.com\/([^\/]+)\/([^\/]+)\/tree\/([^\/]+)\/(.+)$/i.exec(cleanUrl);
    if (treeGhMatch) {
      const [, owner, repo, branch, folderPath] = treeGhMatch;
      isGitHubHandled = await fetchGitHubFolder(owner, repo, folderPath, branch, targetDir);
      if (!isGitHubHandled) {
        const rawSkillUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${folderPath}/SKILL.md`;
        const fallbackRes = await fetch(rawSkillUrl);
        if (fallbackRes.ok) {
          skillMdContent = await fallbackRes.text();
          fs.writeFileSync(path.join(targetDir, 'SKILL.md'), skillMdContent, 'utf-8');
          isGitHubHandled = true;
        }
      }
    }
  }

  // Pattern 3: github.com/:owner/:repo/blob/:branch/:path...
  if (!isGitHubHandled) {
    const blobGhMatch = /^https?:\/\/github\.com\/([^\/]+)\/([^\/]+)\/blob\/([^\/]+)\/(.+)$/i.exec(cleanUrl);
    if (blobGhMatch) {
      const [, owner, repo, branch, fullPath] = blobGhMatch;
      const folderPath = fullPath.includes('/') ? fullPath.substring(0, fullPath.lastIndexOf('/')) : '';
      isGitHubHandled = await fetchGitHubFolder(owner, repo, folderPath, branch, targetDir);
      if (!isGitHubHandled) {
        const rawSkillUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${
          fullPath.endsWith('.md') ? fullPath : `${fullPath}/SKILL.md`
        }`;
        const fallbackRes = await fetch(rawSkillUrl);
        if (fallbackRes.ok) {
          skillMdContent = await fallbackRes.text();
          fs.writeFileSync(path.join(targetDir, 'SKILL.md'), skillMdContent, 'utf-8');
          isGitHubHandled = true;
        }
      }
    }
  }

  // Generic fallback if not handled by GitHub API
  if (!isGitHubHandled) {
    let res = await fetch(`${cleanUrl}/SKILL.md`);
    if (!res.ok) {
      res = await fetch(cleanUrl);
    }
    if (!res.ok) {
      throw new Error(`Failed to download skill from URL: HTTP ${res.status}. Please ensure the GitHub repository/folder URL is valid.`);
    }
    skillMdContent = await res.text();
    fs.writeFileSync(path.join(targetDir, 'SKILL.md'), skillMdContent, 'utf-8');
  }

  // Parse metadata from SKILL.md if downloaded
  const skillMdFile = path.join(targetDir, 'SKILL.md');
  if (fs.existsSync(skillMdFile)) {
    const content = fs.readFileSync(skillMdFile, 'utf-8');
    const nameMatch = /^name:\s*([^\r\n]+)/m.exec(content);
    if (nameMatch && nameMatch[1] && !params.overrideName) {
      discoveredName = nameMatch[1].trim();
    }
    const descMatch = /^description:\s*([^\r\n]+)/m.exec(content);
    if (descMatch && descMatch[1] && !params.overrideDesc) {
      discoveredDescription = descMatch[1].trim();
    }
  } else {
    // Create default SKILL.md if none existed in folder
    skillMdContent = `---
name: ${discoveredName}
description: ${discoveredDescription || `Imported skill from ${cleanUrl}`}
---

# ${discoveredName}

Skill imported from ${cleanUrl}.
`;
    fs.writeFileSync(skillMdFile, skillMdContent, 'utf-8');
  }

  return {
    name: discoveredName,
    path: targetDir,
    description: discoveredDescription || `Skill ${discoveredName} (Installed from URL)`,
    scope: 'installed',
    used: false,
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
