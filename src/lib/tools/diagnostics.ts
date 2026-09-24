import fs from 'fs';
import path from 'path';
import fg from 'fast-glob';
// Dynamic optional import for runtime safety when typescript is in devDependencies
import { sanitizeAndResolvePath } from '../security';

export interface DiagnosticsParams {
  path?: string;
  maxResults?: number;
}

export interface DiagnosticItem {
  file: string;
  line: number;
  character: number;
  code: string | number;
  message: string;
  severity: 'error' | 'warning' | 'info';
}

export interface DiagnosticsResult {
  target: string;
  totalErrors: number;
  totalWarnings: number;
  diagnostics: DiagnosticItem[];
  message: string;
}

export interface FindReferencesParams {
  symbol: string;
  path?: string;
  maxResults?: number;
}

export interface ReferenceItem {
  file: string;
  line: number;
  character: number;
  lineContent: string;
  isDefinition?: boolean;
}

export interface FindReferencesResult {
  symbol: string;
  totalReferences: number;
  references: ReferenceItem[];
}

function loadTypeScript(workdir?: string): any | null {
  const getRequire = (): any => {
    try {
      if (typeof (globalThis as any).__non_webpack_require__ !== 'undefined') {
        return (globalThis as any).__non_webpack_require__;
      }
      return eval('require');
    } catch {
      return null;
    }
  };

  const req = getRequire();
  if (!req) return null;

  if (workdir) {
    try {
      const localTsPath = path.join(workdir, 'node_modules', 'typescript');
      if (fs.existsSync(localTsPath)) {
        return req(localTsPath);
      }
    } catch {}
  }
  try {
    return req('typescript');
  } catch {}
  return null;
}

export async function executeGetDiagnostics(
  params: DiagnosticsParams,
  workdir: string
): Promise<DiagnosticsResult> {
  const targetRel = (params?.path || '').trim();
  const maxResults = Math.min(Math.max(params?.maxResults || 50, 1), 200);

  const diagnostics: DiagnosticItem[] = [];
  const ts = loadTypeScript(workdir);

  if (ts) {
    try {
      const tsConfigPath = path.join(workdir, 'tsconfig.json');
      let compilerOptions: any = {};
      let fileNames: string[] = [];

      if (fs.existsSync(tsConfigPath)) {
        const configFile = ts.readConfigFile(tsConfigPath, ts.sys.readFile);
        const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, workdir);
        compilerOptions = { ...parsed.options, noEmit: true };
        fileNames = parsed.fileNames;
      } else {
        compilerOptions = {
          allowJs: true,
          checkJs: true,
          noEmit: true,
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.ESNext,
        };
        fileNames = await fg('**/*.{ts,tsx,js,jsx}', {
          cwd: workdir,
          ignore: ['**/node_modules/**', '**/.next/**', '**/dist/**'],
          absolute: true,
        });
      }

      // If specific file targeted, filter or ensure it's in the program
      let targetFileAbs: string | undefined;
      if (targetRel) {
        targetFileAbs = sanitizeAndResolvePath(workdir, targetRel);
        const normTarget = targetFileAbs.replace(/\\/g, '/');
        if (!fileNames.some((f) => f.replace(/\\/g, '/') === normTarget)) {
          fileNames.push(targetFileAbs);
        }
      }

      const program = ts.createProgram(fileNames, compilerOptions);

      if (targetFileAbs) {
        const normTarget = targetFileAbs.replace(/\\/g, '/');
        const sourceFile = program.getSourceFile(targetFileAbs) || program.getSourceFile(normTarget);
        if (sourceFile) {
          const syntactic = program.getSyntacticDiagnostics(sourceFile);
          const semantic = program.getSemanticDiagnostics(sourceFile);
          const allDiags = [...syntactic, ...semantic];

          for (const d of allDiags) {
            if (diagnostics.length >= maxResults) break;
            const start = d.start || 0;
            const { line, character } = sourceFile.getLineAndCharacterOfPosition(start);
            const message = ts.flattenDiagnosticMessageText(d.messageText, '\n');
            diagnostics.push({
              file: path.relative(workdir, targetFileAbs).replace(/\\/g, '/'),
              line: line + 1,
              character: character + 1,
              code: `TS${d.code}`,
              message,
              severity: d.category === ts.DiagnosticCategory.Warning ? 'warning' : 'error',
            });
          }
        }
      } else {
        // Workspace-wide diagnostics
        const preEmit = ts.getPreEmitDiagnostics(program);
        for (const d of preEmit) {
          if (diagnostics.length >= maxResults) break;
          const fileName = d.file ? path.relative(workdir, d.file.fileName).replace(/\\/g, '/') : 'project';
          // Filter out node_modules
          if (fileName.includes('node_modules')) continue;

          let line = 1;
          let character = 1;
          if (d.file && d.start !== undefined) {
            const pos = d.file.getLineAndCharacterOfPosition(d.start);
            line = pos.line + 1;
            character = pos.character + 1;
          }

          const message = ts.flattenDiagnosticMessageText(d.messageText, '\n');
          diagnostics.push({
            file: fileName,
            line,
            character,
            code: `TS${d.code}`,
            message,
            severity: d.category === ts.DiagnosticCategory.Warning ? 'warning' : 'error',
          });
        }
      }
    } catch (err: any) {
      console.warn('[Diagnostics Tool] TS Compiler API warning:', err.message);
    }
  }

  // Fallback / Syntax Checker for JSON, etc.
  if (targetRel && targetRel.endsWith('.json')) {
    try {
      const fullPath = sanitizeAndResolvePath(workdir, targetRel);
      if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, 'utf8');
        try {
          JSON.parse(content);
        } catch (jsonErr: any) {
          diagnostics.push({
            file: targetRel,
            line: 1,
            character: 1,
            code: 'JSON_SYNTAX_ERROR',
            message: jsonErr.message,
            severity: 'error',
          });
        }
      }
    } catch {}
  }

  const totalErrors = diagnostics.filter((d) => d.severity === 'error').length;
  const totalWarnings = diagnostics.filter((d) => d.severity === 'warning').length;

  let message = `No syntax or type errors found in ${targetRel || 'workspace'}.`;
  if (totalErrors > 0 || totalWarnings > 0) {
    message = `Found ${totalErrors} error(s) and ${totalWarnings} warning(s) in ${targetRel || 'workspace'}.`;
  }

  return {
    target: targetRel || 'workspace',
    totalErrors,
    totalWarnings,
    diagnostics,
    message,
  };
}

export async function executeFindReferences(
  params: FindReferencesParams,
  workdir: string
): Promise<FindReferencesResult> {
  const symbol = (params?.symbol || '').trim();
  if (!symbol) {
    throw new Error('Symbol parameter is required for find_references.');
  }

  const targetDir = params?.path ? sanitizeAndResolvePath(workdir, params.path) : workdir;
  const maxResults = Math.min(Math.max(params?.maxResults || 50, 1), 150);

  const files = await fg('**/*.{ts,tsx,js,jsx,mjs,json,py,go,rs}', {
    cwd: targetDir,
    ignore: ['**/node_modules/**', '**/.next/**', '**/dist/**', '**/.git/**'],
    absolute: true,
  });

  const references: ReferenceItem[] = [];
  const symbolRegex = new RegExp(`\\b${symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');

  for (const absFile of files) {
    if (references.length >= maxResults) break;
    try {
      const stat = fs.statSync(absFile);
      if (stat.size > 300 * 1024) continue; // skip files > 300KB

      const content = fs.readFileSync(absFile, 'utf8');
      const lines = content.split(/\r?\n/);
      const relFile = path.relative(workdir, absFile).replace(/\\/g, '/');

      for (let i = 0; i < lines.length; i++) {
        if (references.length >= maxResults) break;
        const lineContent = lines[i];
        let match: RegExpExecArray | null;

        while ((match = symbolRegex.exec(lineContent)) !== null) {
          const char = match.index + 1;
          const trimmed = lineContent.trim();
          const isDef =
            /^(?:export\s+)?(?:const|let|var|function|class|interface|type|def|func)\s+/.test(trimmed) &&
            trimmed.includes(symbol);

          references.push({
            file: relFile,
            line: i + 1,
            character: char,
            lineContent: trimmed.slice(0, 120),
            isDefinition: isDef,
          });

          if (references.length >= maxResults) break;
        }
      }
    } catch {
      // ignore
    }
  }

  return {
    symbol,
    totalReferences: references.length,
    references,
  };
}
