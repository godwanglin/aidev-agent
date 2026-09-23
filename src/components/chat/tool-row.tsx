'use client';

import React, { useState, useMemo } from 'react';
import {
  Loader2,
  Copy,
  Check,
  FileCode,
  ChevronRight,
  Globe,
  Search,
  FolderTree,
  ListTodo,
  Stethoscope,
  Compass,
  ExternalLink,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { TodoCard } from './todo-card';
import { TerminalExecCard } from './terminal-exec-card';
import { SearchResultsCard } from './search-results-card';
import { QuestionDetailsCard } from './question-details-card';
import { FormattedCodeCard } from './formatted-code-card';
import { ImagePreviewModal } from '@/components/modals/image-preview-modal';
import { AestheticFileIcon } from '@/components/common/aesthetic-file-icon';

interface ToolRowProps {
  toolName: string;
  argumentsText?: string;
  resultText?: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'PENDING_PERMISSION';
  durationMs?: number;
  onOpenFileDiff?: (filePath: string) => void;
  onOpenFile?: (filePath: string, lineRange?: { startLine?: number; endLine?: number }) => void;
  onOpenBrowser?: (url: string) => void;
}

export const ToolRow: React.FC<ToolRowProps> = ({
  toolName,
  argumentsText,
  resultText,
  status,
  onOpenFileDiff,
  onOpenFile,
  onOpenBrowser,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [selectedPreviewImage, setSelectedPreviewImage] = useState<{
    url: string;
    title?: string;
    subtitle?: string;
  } | null>(null);

  let parsedArgs: any = null;
  try {
    if (argumentsText) parsedArgs = JSON.parse(argumentsText);
  } catch {
    // raw string
  }

  let parsedResult: any = null;
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

  const rawCommand = parsedArgs?.command || parsedArgs?.cmd || (typeof parsedArgs === 'string' ? parsedArgs : '');
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
  const workdir = parsedArgs?.workdir || parsedArgs?.cwd || 'c:\\dev\\aidev';
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

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Determine Icon using aesthetic file icons library
  const renderIcon = (path: string) => {
    return <AestheticFileIcon filePath={path} className="w-3.5 h-3.5 shrink-0" />;
  };

  // Estimate additions/deletions if available from result or args
  let additions = parsedArgs?.additions || 0;
  let deletions = parsedArgs?.deletions || 0;
  if (!additions && !deletions && resultText) {
    const addMatch = /\+(\d+)/.exec(resultText);
    const delMatch = /-(\d+)/.exec(resultText);
    if (addMatch) additions = parseInt(addMatch[1], 10);
    if (delMatch) deletions = parseInt(delMatch[1], 10);
  }
  if (isEdit && additions === 0 && deletions === 0) {
    additions = 2;
    deletions = 2;
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
              {status === 'RUNNING' && <Loader2 className="w-3 h-3 animate-spin" />}
            </div>
          )}
        </div>
      )}

      {/* 0.2 Web Search Row */}
      {toolName === 'web_search' && (
        <div className="flex items-center gap-2 py-0.5 text-xs">
          <Search className="w-3.5 h-3.5 text-[#58a6ff] shrink-0" />
          <span className="text-[#8c8c8c]">Searched web:</span>
          <span className="text-white font-medium truncate max-w-[350px]">
            &quot;{parsedArgs?.query || ''}&quot;
          </span>
          {parsedResult?.count !== undefined && (
            <span className="px-1.5 py-0.2 rounded bg-white/[0.06] text-[10.5px] text-[#8c8c8c]">
              {parsedResult.count} results
            </span>
          )}
          {status === 'RUNNING' && (
            <Loader2 className="w-3 h-3 text-[#007acc] animate-spin ml-1" />
          )}
        </div>
      )}

      {/* 0.3 Read URL Row */}
      {toolName === 'read_url' && (
        <div className="flex items-center gap-2 py-0.5 text-xs">
          <Globe className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span className="text-[#8c8c8c]">Read web page:</span>
          <span
            onClick={() => onOpenBrowser?.(parsedArgs?.url || '')}
            className="text-[#58a6ff] hover:underline cursor-pointer truncate max-w-[320px] font-mono text-[11px]"
          >
            {parsedArgs?.url || ''}
          </span>
          {parsedResult?.contentLength && (
            <span className="text-[10px] text-[#71717a]">
              ({Math.round(parsedResult.contentLength / 1024)} KB)
            </span>
          )}
          {status === 'RUNNING' && (
            <Loader2 className="w-3 h-3 text-[#007acc] animate-spin ml-1" />
          )}
        </div>
      )}

      {/* 0.4 Repo Map & Symbol Outline Row */}
      {(toolName === 'get_repo_map' || toolName === 'get_file_symbols') && (
        <div className="flex items-center gap-2 py-0.5 text-xs">
          <FolderTree className="w-3.5 h-3.5 text-[#e3b341] shrink-0" />
          <span className="text-[#8c8c8c]">
            {toolName === 'get_repo_map' ? 'Mapped codebase:' : 'Extracted symbols:'}
          </span>
          <span className="text-white font-medium truncate max-w-[280px]">
            {parsedArgs?.directory || parsedArgs?.path || '.'}
          </span>
          {parsedResult?.totalSymbolsFound !== undefined && (
            <span className="px-1.5 py-0.2 rounded bg-white/[0.06] text-[10.5px] text-[#8c8c8c]">
              {parsedResult.totalSymbolsFound} symbols
            </span>
          )}
          {parsedResult?.totalSymbols !== undefined && (
            <span className="px-1.5 py-0.2 rounded bg-white/[0.06] text-[10.5px] text-[#8c8c8c]">
              {parsedResult.totalSymbols} symbols
            </span>
          )}
          {status === 'RUNNING' && (
            <Loader2 className="w-3 h-3 text-[#007acc] animate-spin ml-1" />
          )}
        </div>
      )}

      {/* 0.5 Diagnostics & Code Intelligence Row */}
      {(toolName === 'get_diagnostics' || toolName === 'find_references') && (
        <div className="flex items-center gap-2 py-0.5 text-xs">
          {toolName === 'get_diagnostics' ? (
            <Stethoscope className="w-3.5 h-3.5 text-rose-400 shrink-0" />
          ) : (
            <Compass className="w-3.5 h-3.5 text-[#58a6ff] shrink-0" />
          )}
          <span className="text-[#8c8c8c]">
            {toolName === 'get_diagnostics' ? 'Diagnostics:' : 'Found references:'}
          </span>
          <span className="text-white font-medium truncate max-w-[280px]">
            {parsedArgs?.path || parsedArgs?.symbol || 'workspace'}
          </span>
          {parsedResult?.totalErrors !== undefined && (
            <span
              className={`px-1.5 py-0.2 rounded text-[10.5px] font-medium ${
                parsedResult.totalErrors > 0
                  ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                  : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
              }`}
            >
              {parsedResult.totalErrors === 0
                ? '0 errors'
                : `${parsedResult.totalErrors} error(s)`}
            </span>
          )}
          {parsedResult?.totalReferences !== undefined && (
            <span className="px-1.5 py-0.2 rounded bg-white/[0.06] text-[10.5px] text-[#8c8c8c]">
              {parsedResult.totalReferences} references
            </span>
          )}
          {status === 'RUNNING' && (
            <Loader2 className="w-3 h-3 text-[#007acc] animate-spin ml-1" />
          )}
        </div>
      )}

      {/* 1. Analyzed File Line */}
      {isAnalyze && (
        <div
          onClick={() => {
            if (filePath && onOpenFile) {
              onOpenFile(filePath, { startLine, endLine });
            }
          }}
          className="flex items-center gap-1.5 py-0.5 hover:text-white transition cursor-pointer group"
          title={`Click to open ${filePath.split(/[\\/]/).pop() || filePath} in editor`}
        >
          <span className="text-[#8c8c8c]">Analyzed</span>
          {renderIcon(filePath)}
          <span className="text-[#58a6ff] group-hover:underline font-medium">
            {filePath.split(/[\\/]/).pop() || filePath}
          </span>
          {startLine && endLine && (
            <span className="text-[#768390] font-normal">
              #L{startLine}{startLine !== endLine ? `-${endLine}` : ''}
            </span>
          )}
          {status === 'RUNNING' && (
            <Loader2 className="w-3 h-3 text-[#007acc] animate-spin ml-1" />
          )}
        </div>
      )}

      {/* 2. Searched Line */}
      {isSearch && (
        <div>
          <div
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center justify-between py-0.5 hover:bg-white/[0.02] rounded px-1 -mx-1 transition cursor-pointer select-none group"
          >
            <div className="flex items-center gap-1.5 min-w-0 pr-2">
              <span className="text-[#8c8c8c] shrink-0">Searched</span>
              <span className="text-[#cccccc] font-normal truncate max-w-[500px]">{query || 'files'}</span>
              {searchCount !== null && (
                <span className="px-1.5 py-0.5 rounded bg-[#202020] border border-[#2a2a2a] text-[#8c8c8c] text-[11px] font-mono leading-tight ml-0.5 shrink-0">
                  {searchCount} {searchCount === 1 ? 'result' : 'results'}
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
            className="flex items-center justify-between py-0.5 hover:bg-white/[0.02] rounded px-1 -mx-1 transition cursor-pointer select-none group"
          >
            <div className="flex items-center gap-1.5 min-w-0 pr-2">
              <span className="text-[#8c8c8c] shrink-0">
                {toolName.startsWith('mcp_') || toolName === 'call_mcp_tool' ? 'Ran MCP' : 'Executed'}
              </span>
              <span className="text-[#d4d4d4] font-mono truncate max-w-[500px]">
                {toolName === 'call_mcp_tool'
                  ? `${parsedArgs?.server_name || 'mcp'}/${parsedArgs?.tool_name || 'tool'}`
                  : toolName}
              </span>
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

          {/* Direct Screenshot / Image Chip Rendering */}
          {mediaUrl && (
            <div className="my-1.5 flex items-center gap-2 animate-fade-in select-none">
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedPreviewImage({
                    url: mediaUrl,
                    title: decodeURIComponent(mediaFilename || 'screenshot.png'),
                    subtitle: 'Saved to artifacts',
                  });
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.stopPropagation();
                    setSelectedPreviewImage({
                      url: mediaUrl,
                      title: decodeURIComponent(mediaFilename || 'screenshot.png'),
                      subtitle: 'Saved to artifacts',
                    });
                  }
                }}
                className="inline-flex items-center gap-2 px-2.5 h-[26px] box-border rounded-[6px] bg-blue-500/12 hover:bg-blue-500/22 border border-blue-500/30 hover:border-blue-400/50 text-blue-300 hover:text-blue-100 text-[11.5px] font-sans select-none leading-none transition-all cursor-pointer shadow-xs group"
                title="Click to view image details"
              >
                <img
                  src={mediaUrl}
                  alt={mediaFilename || 'Screenshot'}
                  className="w-3.5 h-3.5 rounded-[2.5px] object-cover border border-blue-400/40 shrink-0 bg-black/40"
                />
                <span className="font-medium font-mono tracking-tight truncate max-w-[280px]">
                  {decodeURIComponent(mediaFilename || 'screenshot.png')}
                </span>
                <span className="text-[9.5px] text-blue-300/90 font-mono px-1.5 py-0.5 rounded bg-blue-500/20 group-hover:bg-blue-500/35 transition-colors">
                  View
                </span>
              </span>
              <span className="text-[11px] text-emerald-400/80 font-mono select-none">
                Saved to artifacts
              </span>
            </div>
          )}

          {/* Expanded Details: Question Details Card */}
          {toolName === 'ask_question' && (
            <div className={`accordion-grid ${isExpanded ? 'open' : ''}`}>
              <div className="accordion-inner">
                <QuestionDetailsCard
                  argumentsText={argumentsText}
                  resultText={resultText}
                />
              </div>
            </div>
          )}

          {/* Expanded Details Drawer for other tools */}
          {toolName !== 'ask_question' && (
            <div className={`accordion-grid ${isExpanded ? 'open' : ''}`}>
              <div className="accordion-inner">
                <div className="my-2 space-y-3 select-text">
                  {argumentsText && (
                    <FormattedCodeCard
                      title="Tool arguments"
                      code={argumentsText}
                      defaultLanguage="json"
                      maxHeight="max-h-72"
                    />
                  )}

                  {resultText && resultKind !== 'empty' && resultKind !== 'media_only' && (
                    <>
                      {resultKind === 'json' || resultKind === 'diff' ? (
                        <FormattedCodeCard
                          title="Tool Output"
                          code={resultText}
                          defaultLanguage={resultKind === 'diff' ? 'diff' : 'json'}
                          maxHeight="max-h-80"
                        />
                      ) : (
                        <div className="rounded-lg border border-[#2a2a30] bg-[#16161a] overflow-hidden shadow-sm">
                          <div className="flex items-center justify-between px-3 py-1.5 bg-[#1e1e24] border-b border-[#2a2a30] text-xs text-[#a0a0aa]">
                            <span className="font-mono text-[11px] font-medium text-[#cccccc]">Tool Output</span>
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard.writeText(resultText);
                                setCopied(true);
                                setTimeout(() => setCopied(false), 2000);
                              }}
                              className="inline-flex items-center gap-1 text-[11px] hover:text-white transition cursor-pointer px-1.5 py-0.5 rounded hover:bg-white/5"
                              title="Copy output"
                            >
                              {copied ? (
                                <>
                                  <Check className="w-3 h-3 text-[#7ee787]" />
                                  <span className="text-[#7ee787]">Copied</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3 text-[#8c8c8c]" />
                                  <span>Copy</span>
                                </>
                              )}
                            </button>
                          </div>
                          <div className="p-3 text-[12.5px] leading-relaxed text-[#cccccc] font-sans overflow-x-auto max-h-80 overflow-y-auto">
                            <ReactMarkdown
                              remarkPlugins={[remarkGfm]}
                              components={{
                                a({ href, children }: any) {
                                  return (
                                    <a
                                      href={href}
                                      onClick={(e) => {
                                        if (onOpenBrowser && href && /^https?:\/\//i.test(href)) {
                                          e.preventDefault();
                                          onOpenBrowser(href);
                                        }
                                      }}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-[#58a6ff] hover:underline cursor-pointer font-medium"
                                    >
                                      {children}
                                    </a>
                                  );
                                },
                                code({ className, children, ...props }: any) {
                                  const match = /language-(\w+)/.exec(className || '');
                                  const isInline = !match && !String(children).includes('\n');
                                  if (isInline) {
                                    return (
                                      <code className="px-1.5 py-0.5 rounded bg-[#222228] text-[#e2b340] font-mono text-[11px]" {...props}>
                                        {children}
                                      </code>
                                    );
                                  }
                                  return (
                                    <pre className="p-2.5 my-2 rounded bg-[#0d1117] border border-[#30363d] overflow-x-auto text-[11.5px] font-mono text-[#c9d1d9]">
                                      <code>{children}</code>
                                    </pre>
                                  );
                                },
                                h1({ children }: any) {
                                  return <h1 className="text-sm font-semibold text-white mt-2 mb-1">{children}</h1>;
                                },
                                h2({ children }: any) {
                                  return <h2 className="text-xs font-semibold text-white mt-2 mb-1">{children}</h2>;
                                },
                                ul({ children }: any) {
                                  return <ul className="list-disc pl-4 space-y-0.5 my-1 text-[#cccccc] text-[12px]">{children}</ul>;
                                },
                                ol({ children }: any) {
                                  return <ol className="list-decimal pl-4 space-y-0.5 my-1 text-[#cccccc] text-[12px]">{children}</ol>;
                                },
                                p({ children }: any) {
                                  return <p className="mb-1.5 last:mb-0 text-[#cccccc] text-[12.5px]">{children}</p>;
                                },
                              }}
                            >
                              {resultText}
                            </ReactMarkdown>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal Preview for tool screenshot */}
      {selectedPreviewImage && (
        <ImagePreviewModal
          isOpen={Boolean(selectedPreviewImage)}
          imageUrl={selectedPreviewImage.url}
          title={selectedPreviewImage.title}
          subtitle={selectedPreviewImage.subtitle}
          onClose={() => setSelectedPreviewImage(null)}
        />
      )}
    </div>
  );
};
