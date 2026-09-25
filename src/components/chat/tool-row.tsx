'use client';

import React, { useState, useMemo } from 'react';
import {
  Folder,
  FileCode2,
  FileText,
  FileSearch,
  ExternalLink,
  ChevronRight,
  Terminal,
  Clock,
  CheckCircle2,
  XCircle,
  Copy,
  Check,
  RotateCcw,
  Sparkles,
  Search,
  ListTodo,
  Layers,
  Code2,
  ShieldCheck,
  AlertTriangle,
  Loader2,
  Radio,
  FileQuestion,
  Info,
} from 'lucide-react';
import { FormattedCodeCard } from './formatted-code-card';
import { AestheticFileIcon } from '@/components/common/aesthetic-file-icon';
import { TodoCard } from './todo-card';
import { TerminalExecCard } from './terminal-exec-card';

export interface ToolRowProps {
  toolName: string;
  workdir?: string;
  argumentsText?: string;
  resultText?: string;
  status?: 'RUNNING' | 'COMPLETED' | 'FAILED';
  durationMs?: number;
  onOpenFileDiff?: (filePath: string) => void;
  onOpenFile?: (filePath: string, lineRange?: { startLine?: number; endLine?: number }) => void;
  onOpenBrowser?: (url: string) => void;
}

export function ToolRow({
  toolName,
  argumentsText = '',
  resultText = '',
  status = 'COMPLETED',
  durationMs,
  workdir: propWorkdir,
  onOpenFileDiff,
  onOpenFile,
  onOpenBrowser,
}: ToolRowProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  // Safe parsing
  let parsedArgs: any = null;
  let parsedResult: any = null;
  try {
    if (argumentsText) parsedArgs = JSON.parse(argumentsText);
  } catch {
    // raw string
  }
  try {
    if (resultText) parsedResult = JSON.parse(resultText);
  } catch {
    // raw string
  }

  const resultKind = useMemo(() => {
    if (!resultText) return 'empty';
    const trimmed = resultText.trim();
    if (!trimmed) return 'empty';
    if (
      /^\[(?:Screenshot|Image)[^\]]*\]\((?:\/api\/media|\S+)\)$/i.test(trimmed) ||
      /^\/api\/media\?[^\s"']+$/.test(trimmed) ||
      /^data:image\/[a-zA-Z0-9+.-]+;base64,\S+$/.test(trimmed)
    ) {
      return 'media_only';
    }
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try {
        JSON.parse(trimmed);
        return 'json';
      } catch {}
    }
    const prefixMatch = trimmed.match(/^([^\{\[\r\n]+(?::|\n))\s*([\{\[][\s\S]*[\}\]])$/);
    if (prefixMatch) {
      try {
        JSON.parse(prefixMatch[2].trim());
        return 'json';
      } catch {}
    }
    if (
      (trimmed.startsWith('--- ') && trimmed.includes('\n+++ ')) ||
      trimmed.startsWith('diff --git ') ||
      trimmed.startsWith('@@ ')
    ) {
      return 'diff';
    }
    return 'markdown';
  }, [resultText]);

  // Robust command extraction: strip raw JSON and extract clean executable command
    let rawCommand = parsedArgs?.command || parsedArgs?.cmd || '';
    if (!rawCommand && argumentsText) {
      const trimmedArg = argumentsText.trim();
      if (trimmedArg.startsWith('{') && trimmedArg.endsWith('}')) {
        try {
          const p = JSON.parse(trimmedArg);
          rawCommand = p.command || p.cmd || '';
        } catch {}
      } else {
        rawCommand = trimmedArg;
      }
    }
    if (!rawCommand && parsedResult?.command) {
      rawCommand = parsedResult.command;
    }
    if (!rawCommand && typeof parsedArgs === 'string') {
      rawCommand = parsedArgs;
    }
    const isCommand =
      toolName === 'run_command' ||
      toolName === 'exec' ||
      toolName === 'execute_command' ||
      toolName === 'bash' ||
      toolName === 'cmd' ||
      toolName === 'terminal' ||
      Boolean(rawCommand);
    const command = rawCommand || 'cmd';
  
    const filePath =
      parsedArgs?.path ||
      parsedArgs?.filePath ||
      parsedArgs?.file ||
      parsedArgs?.AbsolutePath ||
      parsedArgs?.TargetFile ||
      parsedResult?.path ||
      '';
  
    // Dynamic current workdir (retrieved from prop, arguments, or fallback to current workspace)
    const workdir =
      propWorkdir ||
      parsedArgs?.workdir ||
      parsedArgs?.cwd ||
      'C:\\dev\\coding-agent';
  const query = parsedArgs?.query || parsedArgs?.pattern || parsedArgs?.Query || parsedArgs?.Pattern || '';

  // Extract startLine / endLine with full support for snake_case and resultJson
  let startLine: number | undefined =
    parsedArgs?.start_line ||
    parsedArgs?.startLine ||
    parsedArgs?.StartLine ||
    parsedResult?.startLine ||
    parsedResult?.start_line;
  let endLine: number | undefined =
    parsedArgs?.end_line ||
    parsedArgs?.endLine ||
    parsedArgs?.EndLine ||
    parsedResult?.endLine ||
    parsedResult?.end_line ||
    parsedResult?.totalLines;

  // Fallback for full-file reads: if endLine not provided, count lines from resultText
  if (!endLine && resultText && (toolName === 'read_file' || toolName === 'view_file' || toolName === 'cat')) {
    const lines = resultText.split(/\r?\n/).length;
    if (lines > 0) {
      startLine = startLine || 1;
      endLine = lines;
    }
  }

  if (!startLine && endLine) {
    startLine = 1;
  }

  // Extract media URL / screenshot from parsedResult or resultText
  const mediaUrl: string | undefined =
    parsedResult?.mediaUrl ||
    parsedResult?.url ||
    (typeof resultText === 'string'
      ? /\[(?:Screenshot|Image)[^\]]*\]\(([^)]+)\)/i.exec(resultText)?.[1] ||
        /(?:\/api\/media\?[^\s)"']+)/.exec(resultText)?.[0] ||
        /(?:data:image\/[a-zA-Z0-9+.-]+;base64,[A-Za-z0-9+/=]+)/.exec(resultText)?.[0]
      : undefined);
  const mediaFilename: string | undefined =
    parsedResult?.filename ||
    (mediaUrl ? (/file=([^&]+)/.exec(mediaUrl)?.[1] || 'screenshot.png') : undefined);

  const isSearch =
    toolName === 'search_files' ||
    toolName === 'glob' ||
    toolName === 'grep' ||
    toolName === 'find';

  const isEdit =
    toolName === 'write_file' ||
    toolName === 'apply_patch' ||
    toolName === 'create_file' ||
    toolName === 'edit_file' ||
    Boolean(parsedArgs?.patchText);

  const isAnalyze =
    toolName === 'read_file' ||
    toolName === 'view_file' ||
    toolName === 'cat' ||
    (!isCommand && !isSearch && !isEdit && Boolean(filePath));

  const isCustomRendered =
    toolName === 'update_todos' ||
    toolName === 'web_search' ||
    toolName === 'read_url' ||
    toolName === 'get_repo_map' ||
    toolName === 'get_file_symbols' ||
    toolName === 'get_diagnostics' ||
    toolName === 'find_references' ||
    toolName === 'ask_question';

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(resultText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Determine Icon using aesthetic file icons library
  const renderIcon = (path: string) => {
    return <AestheticFileIcon filePath={path} className="w-3.5 h-3.5 shrink-0" />;
  };

  // Estimate additions/deletions accurately from parsedResult, parsedArgs, or content
  let additions = parsedResult?.additions ?? parsedArgs?.additions ?? 0;
  let deletions = parsedResult?.deletions ?? parsedArgs?.deletions ?? 0;

  if (!additions && !deletions && resultText) {
    const addMatch = /(?:additions["':\s]+|\+)(\d+)/i.exec(resultText);
    const delMatch = /(?:deletions["':\s]+|-)(\d+)/i.exec(resultText);
    if (addMatch) additions = parseInt(addMatch[1], 10) || 0;
    if (delMatch) deletions = parseInt(delMatch[1], 10) || 0;
  }

  if (isEdit && additions === 0 && deletions === 0 && parsedArgs?.patchText) {
    const patchLines = String(parsedArgs.patchText).split('\n');
    for (const line of patchLines) {
      if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('@@')) continue;
      if (line.startsWith('+')) additions++;
      else if (line.startsWith('-')) deletions++;
    }
  }

  if (isEdit && additions === 0 && deletions === 0 && parsedArgs?.content) {
    additions = String(parsedArgs.content).split('\n').length;
  }

  if (isEdit && additions === 0 && deletions === 0) {
    additions = 1;
  }

  // Count search results
  let searchCount: number | null = null;
  if (isSearch && resultText) {
    try {
      const parsedRes = JSON.parse(resultText);
      if (Array.isArray(parsedRes)) searchCount = parsedRes.length;
      else if (Array.isArray(parsedRes.matches)) searchCount = parsedRes.matches.length;
      else if (typeof parsedRes.count === 'number') searchCount = parsedRes.count;
      else if (typeof parsedRes.totalMatches === 'number') searchCount = parsedRes.totalMatches;
      else if (Array.isArray(parsedRes.files)) searchCount = parsedRes.files.length;
    } catch {
      const matchLines = resultText.split('\n').filter((l) => l.trim()).length;
      if (matchLines > 0) searchCount = Math.min(matchLines, 16);
    }
  }

  return (
    <div className="text-[13px] font-sans select-none leading-relaxed">
      {/* 0. Asked Question Clarification Line */}
      {toolName === 'ask_question' && (
        <div className="flex items-center gap-2 py-0.5 text-xs">
          <span className="text-slate-500 dark:text-[#8c8c8c]">Clarification:</span>
          <span className="text-slate-800 dark:text-slate-200 font-medium truncate max-w-[400px]">
            {parsedArgs?.question || 'Clarification question'}
          </span>
          {status === 'RUNNING' && (
            <Loader2 className="w-3 h-3 text-[#007acc] animate-spin ml-1" />
          )}
        </div>
      )}

      {/* 0.1 Update Todos Task Progress */}
      {toolName === 'update_todos' && (
        <div className="py-1">
          {parsedArgs?.todos && Array.isArray(parsedArgs.todos) ? (
            <TodoCard todos={parsedArgs.todos} />
          ) : (
            <div className="flex items-center gap-2 text-xs py-0.5 text-[#58a6ff]">
              <ListTodo className="w-3.5 h-3.5" />
              <span>Updating tasks checklist...</span>
            </div>
          )}
        </div>
      )}

      {/* 0.2 Web Search Line */}
      {toolName === 'web_search' && (
        <div className="flex items-center gap-2 py-0.5 text-xs">
          <span className="text-[#8c8c8c]">Searched web for</span>
          <span className="text-[#58a6ff] font-medium truncate max-w-[400px]">
            "{parsedArgs?.query || ''}"
          </span>
          {status === 'RUNNING' && (
            <Loader2 className="w-3 h-3 text-[#007acc] animate-spin ml-1" />
          )}
        </div>
      )}

      {/* 0.3 Read URL Line */}
      {toolName === 'read_url' && (
        <div className="flex items-center gap-2 py-0.5 text-xs">
          <span className="text-[#8c8c8c]">Read web page</span>
          <span className="text-[#58a6ff] font-mono truncate max-w-[400px]">
            {parsedArgs?.url || ''}
          </span>
          {status === 'RUNNING' && (
            <Loader2 className="w-3 h-3 text-[#007acc] animate-spin ml-1" />
          )}
        </div>
      )}

      {/* 0.4 Codebase Tools (get_repo_map, get_file_symbols, etc.) */}
      {(toolName === 'get_repo_map' ||
        toolName === 'get_file_symbols' ||
        toolName === 'get_diagnostics' ||
        toolName === 'find_references') && (
        <div className="flex items-center gap-2 py-0.5 text-xs">
          <span className="text-[#8c8c8c]">
            {toolName === 'get_repo_map'
              ? 'Mapped repository architecture'
              : toolName === 'get_file_symbols'
              ? 'Inspected file symbols'
              : toolName === 'get_diagnostics'
              ? 'Checked code diagnostics'
              : 'Found symbol references'}
          </span>
          {parsedArgs?.path && (
            <span className="text-[#cccccc] font-mono truncate max-w-[300px]">
              {parsedArgs.path}
            </span>
          )}
          {status === 'RUNNING' && (
            <Loader2 className="w-3 h-3 text-[#007acc] animate-spin ml-1" />
          )}
        </div>
      )}

      {/* 1. Analyzed File Line (read_file, view_file) */}
      {isAnalyze && (
        <div
          onClick={() => {
            const lineRange =
              endLine !== undefined
                ? { startLine: startLine || 1, endLine }
                : startLine !== undefined
                ? { startLine, endLine: startLine }
                : undefined;
            onOpenFile?.(filePath, lineRange);
          }}
          className="flex items-center gap-1.5 py-0.5 hover:bg-white/[0.04] rounded px-1 -mx-1 transition cursor-pointer group select-none text-[13px]"
          title={`Click to open ${filePath}${endLine !== undefined ? ` at lines ${startLine || 1}-${endLine}` : ''} in sidebar editor`}
        >
          <span className="text-[#8c8c8c] shrink-0">Analyzed</span>
          {renderIcon(filePath)}
          <span className="text-[#58a6ff] group-hover:underline font-medium truncate">
            {filePath.split(/[\\/]/).pop() || filePath}
          </span>
          {endLine !== undefined && (
            <span className="text-[#71717a] font-mono text-[11.5px] shrink-0">
              :{startLine || 1}-{endLine}
            </span>
          )}
          {status === 'RUNNING' && (
            <Loader2 className="w-3 h-3 text-[#007acc] animate-spin shrink-0 ml-1" />
          )}
        </div>
      )}

      {/* 2. Searched Pattern / Glob Line */}
      {isSearch && (
        <div>
          <div
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center justify-between py-0.5 hover:bg-white/[0.02] rounded px-1 -mx-1 transition cursor-pointer group select-none"
          >
            <div className="flex items-center gap-1.5 min-w-0 pr-2">
              <span className="text-[#8c8c8c] shrink-0">Searched</span>
              <span className="text-[#d4d4d4] font-mono text-[12.5px] truncate max-w-[340px]">
                "{query}"
              </span>
              {filePath && (
                <span className="text-[#71717a] font-mono text-[11.5px] truncate max-w-[200px]">
                  in {filePath}
                </span>
              )}
              {searchCount !== null && (
                <span className="text-[#71717a] font-mono text-[11px] shrink-0">
                  ({searchCount} {searchCount === 1 ? 'result' : 'results'})
                </span>
              )}
              {status === 'RUNNING' && (
                <Loader2 className="w-3 h-3 text-[#007acc] animate-spin shrink-0 ml-1" />
              )}
            </div>
            <ChevronRight
              className={`w-3.5 h-3.5 text-[#666666] group-hover:text-[#aaaaaa] shrink-0 transition-transform duration-200 ${
                isExpanded ? 'rotate-90 text-[#cccccc]' : ''
              }`}
            />
          </div>

          <div className={`accordion-grid ${isExpanded ? 'open' : ''}`}>
            <div className="accordion-inner">
              <SearchResultsCard
                argumentsText={argumentsText}
                resultText={resultText}
                onOpenFile={onOpenFile}
              />
            </div>
          </div>
        </div>
      )}

      {/* 3. Ran Command Line */}
      {isCommand && (
        <div>
          <div
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center justify-between py-0.5 hover:bg-white/[0.02] rounded px-1 -mx-1 transition cursor-pointer group select-none"
          >
            <div className="flex items-center gap-1.5 min-w-0 pr-2">
              <span className="text-[#8c8c8c] shrink-0">Ran</span>
              <span className="text-[#d4d4d4] font-mono text-[12.5px] truncate max-w-[620px]">
                {command}
              </span>
              {status === 'RUNNING' && (
                <Loader2 className="w-3 h-3 text-[#007acc] animate-spin shrink-0 ml-1" />
              )}
            </div>
            <ChevronRight
              className={`w-3.5 h-3.5 text-[#666666] group-hover:text-[#aaaaaa] shrink-0 transition-transform duration-200 ${
                isExpanded ? 'rotate-90 text-[#cccccc]' : ''
              }`}
            />
          </div>

          <div className={`accordion-grid ${isExpanded ? 'open' : ''}`}>
            <div className="accordion-inner pl-1">
              <TerminalExecCard
                command={command}
                workdir={workdir}
                output={resultText || '(Command completed with no output)'}
                status={status}
                durationMs={durationMs}
                onOpenBrowser={onOpenBrowser}
              />
            </div>
          </div>
        </div>
      )}

      {/* 4. Edited File Line */}
      {isEdit && !isCommand && (
        <div>
          <div className="flex items-center gap-1.5 py-0.5">
            <span className="text-[#8c8c8c]">Edited</span>
            {renderIcon(filePath)}
            <span
              onClick={() => onOpenFile?.(filePath)}
              className="text-[#58a6ff] hover:underline cursor-pointer font-medium"
              title="Click to view file content in editor"
            >
              {filePath.split(/[\\/]/).pop() || filePath}
            </span>
            {(additions > 0 || deletions > 0) && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenFileDiff?.(filePath);
                }}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-white/10 active:bg-white/15 transition cursor-pointer font-mono text-[12px] group/diff"
                title="Click to view diff in sidebar"
              >
                {additions > 0 && (
                  <span className="text-[#7ee787] group-hover/diff:underline">+{additions}</span>
                )}
                {deletions > 0 && (
                  <span className="text-[#ff7b72] group-hover/diff:underline">-{deletions}</span>
                )}
              </button>
            )}
            {status === 'RUNNING' && (
              <Loader2 className="w-3 h-3 text-[#007acc] animate-spin ml-1" />
            )}
          </div>
        </div>
      )}

      {/* 5. Fallback for other tools */}
      {!isAnalyze && !isSearch && !isCommand && !isEdit && !isCustomRendered && (
        <div>
          <div
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center justify-between py-0.5 hover:bg-white/[0.02] rounded px-1 -mx-1 transition cursor-pointer group select-none"
          >
            <div className="flex items-center gap-2 text-xs">
              <span className="text-[#8c8c8c]">Used</span>
              <span className="text-white font-mono">{toolName}</span>
              {status === 'RUNNING' && (
                <Loader2 className="w-3 h-3 text-[#007acc] animate-spin ml-1" />
              )}
            </div>
            <ChevronRight
              className={`w-3.5 h-3.5 text-[#666666] group-hover:text-[#aaaaaa] shrink-0 transition-transform duration-200 ${
                isExpanded ? 'rotate-90 text-[#cccccc]' : ''
              }`}
            />
          </div>

          <div className={`accordion-grid ${isExpanded ? 'open' : ''}`}>
            <div className="accordion-inner pl-1">
              <GenericToolResultCard
                argumentsText={argumentsText}
                resultText={resultText}
                resultKind={resultKind}
                mediaUrl={mediaUrl}
                mediaFilename={mediaFilename}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


/**
 * Aesthetic Card: Search Results (Grep / Glob)
 */
function SearchResultsCard({
  argumentsText,
  resultText,
  onOpenFile,
}: {
  argumentsText: string;
  resultText: string;
  onOpenFile?: (path: string) => void;
}) {
  const [copied, setCopied] = useState(false);

  let parsed: any = null;
  try {
    parsed = JSON.parse(resultText);
  } catch {}

  const handleCopy = () => {
    navigator.clipboard.writeText(resultText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isFileList = Array.isArray(parsed) && parsed.every((x) => typeof x === 'string');

  return (
    <div className="my-1.5 rounded-lg border border-[#27272a] bg-[#121214] overflow-hidden text-xs shadow-sm">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#18181b] border-b border-[#27272a]">
        <div className="flex items-center gap-1.5 text-[#a1a1aa] font-mono text-[11px]">
          <Search className="w-3 h-3 text-[#38bdf8]" />
          <span>Search Output</span>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] text-[#a1a1aa] hover:text-white hover:bg-white/10 transition cursor-pointer"
        >
          {copied ? <Check className="w-3 h-3 text-[#4ade80]" /> : <Copy className="w-3 h-3" />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>

      <div className="p-2 max-h-[280px] overflow-y-auto font-mono text-[11.5px] leading-relaxed">
        {isFileList ? (
          <div className="space-y-1">
            {parsed.map((file: string, idx: number) => (
              <div
                key={idx}
                onClick={() => onOpenFile?.(file)}
                className="flex items-center gap-2 px-1.5 py-0.5 rounded hover:bg-white/5 cursor-pointer text-[#38bdf8] hover:underline"
              >
                <AestheticFileIcon filePath={file} className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{file}</span>
              </div>
            ))}
          </div>
        ) : (
          <pre className="text-[#d4d4d8] whitespace-pre-wrap">{resultText}</pre>
        )}
      </div>
    </div>
  );
}

/**
 * Generic Fallback Tool Output Card
 */
function GenericToolResultCard({
  argumentsText,
  resultText,
  resultKind,
  mediaUrl,
  mediaFilename,
}: {
  argumentsText: string;
  resultText: string;
  resultKind: string;
  mediaUrl?: string;
  mediaFilename?: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(resultText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-1.5 rounded-lg border border-[#27272a] bg-[#121214] overflow-hidden text-xs shadow-sm">
      <div className="flex items-center justify-between px-3 py-1 bg-[#18181b] border-b border-[#27272a]">
        <span className="text-[#a1a1aa] font-mono text-[10.5px]">Result</span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] text-[#a1a1aa] hover:text-white hover:bg-white/10 transition cursor-pointer"
        >
          {copied ? <Check className="w-3 h-3 text-[#4ade80]" /> : <Copy className="w-3 h-3" />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>

      <div className="p-2.5 max-h-[280px] overflow-y-auto">
        {mediaUrl ? (
          <div className="rounded border border-[#27272a] overflow-hidden max-w-sm">
            <img src={mediaUrl} alt={mediaFilename || 'Capture'} className="w-full object-cover" />
          </div>
        ) : (
          <pre className="font-mono text-[11.5px] text-[#d4d4d8] whitespace-pre-wrap">
            {resultText}
          </pre>
        )}
      </div>
    </div>
  );
}
