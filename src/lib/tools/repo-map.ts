import fs from 'fs';
import path from 'path';
import fg from 'fast-glob';
import { sanitizeAndResolvePath } from '../security';

export interface RepoMapParams {
  directory?: string;
  maxDepth?: number;
  maxFiles?: number;
  includeSignatures?: boolean;
}

export interface RepoMapResult {
  rootDirectory: string;
  totalFilesScanned: number;
  totalSymbolsFound: number;
  repoMapText: string;
}

export interface FileSymbolsParams {
  path: string;
}

export interface SymbolItem {
  name: string;
  kind: 'function' | 'class' | 'interface' | 'type' | 'enum' | 'const' | 'method';
  line: number;
  signature?: string;
}

export interface FileSymbolsResult {
  path: string;
  totalSymbols: number;
  symbols: SymbolItem[];
}

const DEFAULT_IGNORES = [
  '**/node_modules/**',
  '**/.git/**',
  '**/.next/**',
  '**/dist/**',
  '**/build/**',
  '**/out/**',
  '**/.aidev/**',
  '**/.gemini/**',
  '**/.turbo/**',
  '**/.cache/**',
  '**/coverage/**',
  '**/*.lock',
  '**/*.log',
  '**/*.min.js',
  '**/*.map',
];

const CODE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.go', '.rs', '.java', '.cs', '.php', '.rb'];

/**
 * Extracts symbols from a single file content using fast, lightweight regex
 */
export function extractSymbolsFromFile(content: string, ext: string, includeSignatures = true): SymbolItem[] {
  const lines = content.split(/\r?\n/);
  const symbols: SymbolItem[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const lineNum = i + 1;

    // Skip comments or empty lines
    if (!line || line.startsWith('//') || line.startsWith('/*') || line.startsWith('*') || line.startsWith('#')) {
      continue;
    }

    if (ext === '.ts' || ext === '.tsx' || ext === '.js' || ext === '.jsx' || ext === '.mjs' || ext === '.cjs') {
      // 1. Interfaces
      const ifaceMatch = /^(?:export\s+)?interface\s+([A-Za-z0-9_$]+)/.exec(line);
      if (ifaceMatch) {
        symbols.push({ name: ifaceMatch[1], kind: 'interface', line: lineNum, signature: includeSignatures ? line.replace(/\{$/, '').trim() : undefined });
        continue;
      }

      // 2. Types
      const typeMatch = /^(?:export\s+)?type\s+([A-Za-z0-9_$]+)/.exec(line);
      if (typeMatch) {
        symbols.push({ name: typeMatch[1], kind: 'type', line: lineNum, signature: includeSignatures ? line.slice(0, 80).trim() : undefined });
        continue;
      }

      // 3. Classes
      const classMatch = /^(?:export\s+)?(?:abstract\s+)?class\s+([A-Za-z0-9_$]+)/.exec(line);
      if (classMatch) {
        symbols.push({ name: classMatch[1], kind: 'class', line: lineNum, signature: includeSignatures ? line.replace(/\{$/, '').trim() : undefined });
        continue;
      }

      // 4. Enums
      const enumMatch = /^(?:export\s+)?enum\s+([A-Za-z0-9_$]+)/.exec(line);
      if (enumMatch) {
        symbols.push({ name: enumMatch[1], kind: 'enum', line: lineNum, signature: includeSignatures ? line.replace(/\{$/, '').trim() : undefined });
        continue;
      }

      // 5. Functions (single-line and multi-line parameter signatures)
      const fnMatch = /^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_$]+)\s*(?:\(([^)]*)\))?/.exec(line);
      if (fnMatch) {
        const fnName = fnMatch[1];
        const params = fnMatch[2] !== undefined ? `${fnMatch[2].slice(0, 40)}${fnMatch[2].length > 40 ? '...' : ''}` : '...';
        symbols.push({
          name: fnName,
          kind: 'function',
          line: lineNum,
          signature: includeSignatures ? `${fnName}(${params})` : undefined,
        });
        continue;
      }

      // 6. Exported const / arrow functions
      const constMatch = /^export\s+(?:const|let|var)\s+([A-Za-z0-9_$]+)(?:\s*:\s*([^=]+))?\s*=\s*(?:async\s*)?(?:\(([^)]*)\)|([A-Za-z0-9_$]+))\s*=>/.exec(line);
      if (constMatch) {
        const params = constMatch[3] !== undefined ? constMatch[3] : constMatch[4] || '';
        symbols.push({
          name: constMatch[1],
          kind: 'function',
          line: lineNum,
          signature: includeSignatures ? `${constMatch[1]}(${params.slice(0, 30)})` : undefined,
        });
        continue;
      }

      // 7. General exported const objects / repos
      const simpleExportMatch = /^export\s+(?:const|let|var)\s+([A-Za-z0-9_$]+)/.exec(line);
      if (simpleExportMatch) {
        symbols.push({ name: simpleExportMatch[1], kind: 'const', line: lineNum, signature: includeSignatures ? line.slice(0, 60).trim() : undefined });
        continue;
      }
    } else if (ext === '.py') {
      const pyClass = /^class\s+([A-Za-z0-9_]+)/.exec(line);
      if (pyClass) {
        symbols.push({ name: pyClass[1], kind: 'class', line: lineNum, signature: includeSignatures ? line : undefined });
        continue;
      }
      const pyFn = /^(?:async\s+)?def\s+([A-Za-z0-9_]+)\s*\(([^)]*)\)/.exec(line);
      if (pyFn) {
        symbols.push({ name: pyFn[1], kind: 'function', line: lineNum, signature: includeSignatures ? `${pyFn[1]}(${pyFn[2].slice(0, 30)})` : undefined });
        continue;
      }
    } else if (ext === '.go') {
      const goFn = /^func\s+(?:\([^)]+\)\s+)?([A-Za-z0-9_]+)\s*\(([^)]*)\)/.exec(line);
      if (goFn) {
        symbols.push({ name: goFn[1], kind: 'function', line: lineNum, signature: includeSignatures ? `${goFn[1]}(${goFn[2].slice(0, 30)})` : undefined });
        continue;
      }
      const goType = /^type\s+([A-Za-z0-9_]+)\s+(struct|interface)/.exec(line);
      if (goType) {
        symbols.push({ name: goType[1], kind: goType[2] as any, line: lineNum, signature: includeSignatures ? line : undefined });
        continue;
      }
    }
  }

  return symbols;
}

export async function executeGetRepoMap(params: RepoMapParams, workdir: string): Promise<RepoMapResult> {
  const targetDirRel = (params?.directory || '.').trim();
  const resolvedTarget = sanitizeAndResolvePath(workdir, targetDirRel);
  const maxDepth = Math.min(Math.max(params?.maxDepth || 5, 1), 10);
  const maxFiles = Math.min(Math.max(params?.maxFiles || 80, 5), 200);
  const includeSignatures = params?.includeSignatures !== false;

  const pattern = `**/*{${CODE_EXTENSIONS.join(',')}}`;
  const matchedFiles = await fg(pattern, {
    cwd: resolvedTarget,
    deep: maxDepth,
    ignore: DEFAULT_IGNORES,
    dot: false,
    onlyFiles: true,
  });

  const selectedFiles = matchedFiles.slice(0, maxFiles);
  let totalSymbolsFound = 0;
  const fileSymbolMap: Map<string, SymbolItem[]> = new Map();

  for (const relFile of selectedFiles) {
    const fullPath = path.join(resolvedTarget, relFile);
    try {
      const stat = fs.statSync(fullPath);
      // Skip files > 250KB to keep RAM usage feather-light
      if (stat.size > 250 * 1024) continue;

      const content = fs.readFileSync(fullPath, 'utf8');
      const ext = path.extname(relFile).toLowerCase();
      const symbols = extractSymbolsFromFile(content, ext, includeSignatures);
      if (symbols.length > 0) {
        fileSymbolMap.set(relFile.replace(/\\/g, '/'), symbols);
        totalSymbolsFound += symbols.length;
      }
    } catch {
      // Ignore read errors for inaccessible files
    }
  }

  // Format into a compact hierarchical outline
  const outputLines: string[] = [];
  outputLines.push(`# Codebase Architecture Map (${fileSymbolMap.size} files, ${totalSymbolsFound} symbols)`);
  outputLines.push(`Root: ${path.relative(workdir, resolvedTarget) || '.'}\n`);

  for (const [filePathStr, symbols] of fileSymbolMap.entries()) {
    outputLines.push(`${filePathStr}:`);
    for (const sym of symbols) {
      const sig = sym.signature ? ` (${sym.signature})` : '';
      outputLines.push(`  L${sym.line} [${sym.kind}] ${sym.name}${sig}`);
    }
    outputLines.push('');
  }

  return {
    rootDirectory: targetDirRel,
    totalFilesScanned: selectedFiles.length,
    totalSymbolsFound,
    repoMapText: outputLines.join('\n').trim(),
  };
}

export async function executeGetFileSymbols(params: FileSymbolsParams, workdir: string): Promise<FileSymbolsResult> {
  const filePath = (params?.path || '').trim();
  if (!filePath) {
    throw new Error('Path parameter is required for get_file_symbols.');
  }

  const resolved = sanitizeAndResolvePath(workdir, filePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`File not found: "${filePath}"`);
  }

  const content = fs.readFileSync(resolved, 'utf8');
  const ext = path.extname(resolved).toLowerCase();
  const symbols = extractSymbolsFromFile(content, ext, true);

  return {
    path: path.relative(workdir, resolved).replace(/\\/g, '/'),
    totalSymbols: symbols.length,
    symbols,
  };
}
