import type { ProjectRecord } from './db';

/**
 * Extract or compute an 8-character hex ID for a project
 */
export function getProjectHexId(project: { id?: string; workdir_path?: string }): string {
  if (!project) return '00000000';
  const idStr = project.id || '';
  const cleanId = idStr.replace(/^proj_/, '');
  // If already an 8-character hex string
  if (/^[0-9a-fA-F]{8}/.test(cleanId)) {
    return cleanId.slice(0, 8).toLowerCase();
  }
  // Deterministic 8-char hex hash from workdir or id (FNV-1a)
  const seed = (project.workdir_path || idStr || 'project').toLowerCase().replace(/\\/g, '/');
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0').slice(0, 8);
}

/**
 * Generate a friendly URL slug for a project matching Antigravity format:
 * e.g. "a3f81c92-test-agent" from 8-char hex id and name
 */
export function getProjectSlug(project: { id: string; name: string; workdir_path?: string }): string {
  if (!project) return 'default-project';
  const hexId = getProjectHexId(project);
  const cleanName = (project.name || 'project')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${hexId}-${cleanName}`;
}

/**
 * Match a project from URL slug parameter
 */
export function findProjectBySlug(projects: ProjectRecord[], slug: string): ProjectRecord | undefined {
  if (!slug || !projects || projects.length === 0) return undefined;
  const decoded = decodeURIComponent(slug).trim();

  // 1. Direct ID match
  const directId = projects.find((p) => p.id === decoded);
  if (directId) return directId;

  // 2. Computed slug match (e.g. a3f81c92-test-agent)
  const slugMatch = projects.find((p) => getProjectSlug(p) === decoded);
  if (slugMatch) return slugMatch;

  // 3. Hex ID match (e.g. a3f81c92)
  const hexMatch = projects.find((p) => getProjectHexId(p) === decoded);
  if (hexMatch) return hexMatch;

  // 4. Prefix match (e.g. slug starts with hex ID)
  const prefix = decoded.split('-')[0].toLowerCase();
  if (prefix && prefix.length >= 6) {
    const prefixMatch = projects.find((p) => getProjectHexId(p) === prefix || p.id.startsWith(prefix));
    if (prefixMatch) return prefixMatch;
  }

  // 5. Case-insensitive name match
  const nameMatch = projects.find((p) => p.name.toLowerCase() === decoded.toLowerCase());
  if (nameMatch) return nameMatch;

  return undefined;
}

/**
 * Format relative time matching Antigravity (e.g. "5h", "13h", "41m", "now", "2d")
 */
export function formatRelativeTime(timestamp: number): string {
  if (!timestamp) return '';
  const diff = Math.max(0, Date.now() - timestamp);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}
