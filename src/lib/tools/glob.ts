import fg from 'fast-glob';
import path from 'path';

export interface GlobParams {
  pattern: string;
  ignore?: string[];
  maxResults?: number;
}

export interface GlobResult {
  pattern: string;
  matches: string[];
  totalMatches: number;
}

const DEFAULT_IGNORE = [
  '**/node_modules/**',
  '**/.git/**',
  '**/dist/**',
  '**/.next/**',
  '**/.aidev/**',
  '**/coverage/**',
  '**/.turbo/**',
];

export async function executeGlob(
  params: GlobParams,
  workdir: string
): Promise<GlobResult> {
  const ignore = [...DEFAULT_IGNORE, ...(params.ignore || [])];
  const maxResults = params.maxResults || 500;

  // Convert Windows path separators to posix for fast-glob
  const normalizedWorkdir = workdir.replace(/\\/g, '/');

  const entries = await fg(params.pattern, {
    cwd: normalizedWorkdir,
    ignore,
    dot: true,
    onlyFiles: true,
    stats: false,
    suppressErrors: true,
  });

  const matches = entries.slice(0, maxResults);

  return {
    pattern: params.pattern,
    matches,
    totalMatches: entries.length,
  };
}
