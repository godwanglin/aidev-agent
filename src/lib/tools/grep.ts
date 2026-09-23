import fs from 'fs';
import path from 'path';
import fg from 'fast-glob';

export interface GrepParams {
  query: string;
  path?: string;
  searchPath?: string;
  isRegex?: boolean;
  caseSensitive?: boolean;
  filePattern?: string;
  maxResults?: number;
}

export interface GrepMatch {
  file: string;
  lineNumber: number;
  lineContent: string;
  // PascalCase aliases for UI component compatibility
  Filename: string;
  LineNumber: number;
  LineContent: string;
}

export interface GrepResult {
  query: string;
  searchPath?: string;
  matches: GrepMatch[];
  totalMatches: number;
  filesSearched: number;
  truncated: boolean;
  summary: string;
}

const DEFAULT_IGNORE = [
  '**/node_modules/**',
  '**/.git/**',
  '**/dist/**',
  '**/.next/**',
  '**/.aidev/**',
  '**/build/**',
  '**/.turbo/**',
  '**/.cache/**',
  '**/*.png',
  '**/*.jpg',
  '**/*.jpeg',
  '**/*.gif',
  '**/*.webp',
  '**/*.ico',
  '**/*.pdf',
  '**/*.zip',
  '**/*.tar',
  '**/*.gz',
  '**/*.7z',
  '**/*.exe',
  '**/*.dll',
  '**/*.so',
  '**/*.dylib',
  '**/*.woff',
  '**/*.woff2',
  '**/*.ttf',
  '**/*.eot',
  '**/*.mp4',
  '**/*.mp3',
  '**/*.wasm',
];

export async function executeGrep(
  params: GrepParams,
  workdir: string
): Promise<GrepResult> {
  const query = (params.query || '').trim();
  if (!query) {
    throw new Error('Grep query parameter cannot be empty.');
  }

  const maxResults = params.maxResults && params.maxResults > 0 ? params.maxResults : 100;
  const targetSubpath = params.path || params.searchPath || '';
  const normalizedWorkdir = workdir.replace(/\\/g, '/');

  let regex: RegExp;
  try {
    const flags = params.caseSensitive ? 'g' : 'gi';
    if (params.isRegex) {
      regex = new RegExp(params.query, flags);
    } else {
      const escaped = params.query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      regex = new RegExp(escaped, flags);
    }
  } catch (err: any) {
    throw new Error(`Invalid regex grep pattern: ${err.message}`);
  }

  const matches: GrepMatch[] = [];
  let totalCount = 0;
  let filesSearched = 0;

  // Check if target is a specific single file
  if (targetSubpath) {
    const resolvedPath = path.isAbsolute(targetSubpath)
      ? targetSubpath
      : path.join(workdir, targetSubpath);

    if (fs.existsSync(resolvedPath)) {
      const stat = fs.statSync(resolvedPath);
      if (stat.isFile()) {
        filesSearched = 1;
        try {
          if (stat.size <= 2 * 1024 * 1024) {
            const content = fs.readFileSync(resolvedPath, 'utf-8');
            const lines = content.split(/\r?\n/);
            const relFile = path.relative(workdir, resolvedPath).replace(/\\/g, '/');

            for (let i = 0; i < lines.length; i++) {
              const line = lines[i];
              if (regex.test(line)) {
                totalCount++;
                if (matches.length < maxResults) {
                  const snippet = line.trimEnd().substring(0, 300);
                  matches.push({
                    file: relFile,
                    lineNumber: i + 1,
                    lineContent: snippet,
                    Filename: relFile,
                    LineNumber: i + 1,
                    LineContent: snippet,
                  });
                }
                regex.lastIndex = 0;
              }
            }
          }
        } catch {
          // File read error ignored
        }

        const summary = `Found ${totalCount} ${totalCount === 1 ? 'match' : 'matches'} in 1 file for '${query}'`;
        return {
          query,
          searchPath: targetSubpath,
          matches,
          totalMatches: totalCount,
          filesSearched,
          truncated: totalCount > maxResults,
          summary,
        };
      }
    }
  }

  // Directory scan mode
  let searchDir = normalizedWorkdir;
  if (targetSubpath) {
    const resolvedDir = path.isAbsolute(targetSubpath)
      ? targetSubpath
      : path.join(workdir, targetSubpath);
    if (fs.existsSync(resolvedDir) && fs.statSync(resolvedDir).isDirectory()) {
      searchDir = resolvedDir.replace(/\\/g, '/');
    }
  }

  const pattern = params.filePattern || '**/*';
  const files = await fg(pattern, {
    cwd: searchDir,
    ignore: DEFAULT_IGNORE,
    onlyFiles: true,
    suppressErrors: true,
  });

  filesSearched = files.length;

  for (const file of files) {
    if (matches.length >= maxResults) break;

    const fullPath = path.join(searchDir, file);
    try {
      const stat = fs.statSync(fullPath);
      if (stat.size > 2 * 1024 * 1024) continue; // Skip files > 2 MB

      const content = fs.readFileSync(fullPath, 'utf-8');
      const lines = content.split(/\r?\n/);
      const relativeToWorkdir = path.relative(workdir, fullPath).replace(/\\/g, '/');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (regex.test(line)) {
          totalCount++;
          if (matches.length < maxResults) {
            const snippet = line.trimEnd().substring(0, 300);
            matches.push({
              file: relativeToWorkdir,
              lineNumber: i + 1,
              lineContent: snippet,
              Filename: relativeToWorkdir,
              LineNumber: i + 1,
              LineContent: snippet,
            });
          }
          regex.lastIndex = 0;
        }
      }
    } catch {
      // Ignore unreadable files
    }
  }

  const uniqueFiles = new Set(matches.map((m) => m.file)).size;
  const summary = `Found ${totalCount} ${totalCount === 1 ? 'match' : 'matches'} across ${uniqueFiles} ${uniqueFiles === 1 ? 'file' : 'files'} for '${query}'`;

  return {
    query,
    searchPath: targetSubpath || undefined,
    matches,
    totalMatches: totalCount,
    filesSearched,
    truncated: totalCount > maxResults,
    summary,
  };
}

// Backward compatibility alias for executeSearchFiles
export const executeSearchFiles = executeGrep;
export type SearchFilesParams = GrepParams;
export type SearchMatch = GrepMatch;
export type SearchFilesResult = GrepResult;
