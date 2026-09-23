'use client';

import React, { useState } from 'react';
import { Copy, Check, Code, FileText, ExternalLink } from 'lucide-react';
import { FileChip } from './file-chip';

interface SearchResultsCardProps {
  argumentsText?: string;
  resultText?: string;
  onOpenFile?: (filePath: string, lineRange?: { startLine?: number; endLine?: number }) => void;
}

interface GrepMatch {
  Filename: string;
  LineNumber?: number;
  LineContent?: string;
}

export const SearchResultsCard: React.FC<SearchResultsCardProps> = ({
  argumentsText,
  resultText,
  onOpenFile,
}) => {
  const [showRaw, setShowRaw] = useState(false);
  const [copied, setCopied] = useState(false);

  // Parse arguments
  let pattern = '';
  try {
    if (argumentsText) {
      const parsedArgs = JSON.parse(argumentsText);
      pattern = parsedArgs.pattern || parsedArgs.query || parsedArgs.Query || parsedArgs.Pattern || '';
    }
  } catch {
    pattern = argumentsText || '';
  }

  // Parse results
  let fileList: string[] = [];
  let grepMatches: GrepMatch[] = [];

  try {
    if (resultText) {
      const parsedRes = JSON.parse(resultText);
      if (Array.isArray(parsedRes)) {
        if (typeof parsedRes[0] === 'string') {
          fileList = parsedRes;
        } else if (parsedRes[0]?.Filename || parsedRes[0]?.file) {
          grepMatches = parsedRes.map((m: any) => ({
            Filename: m.Filename || m.file || '',
            LineNumber: m.LineNumber ?? m.lineNumber,
            LineContent: m.LineContent ?? m.lineContent ?? '',
          }));
        }
      } else if (parsedRes.matches && Array.isArray(parsedRes.matches)) {
        if (typeof parsedRes.matches[0] === 'string') {
          fileList = parsedRes.matches;
        } else if (parsedRes.matches[0]?.Filename || parsedRes.matches[0]?.file) {
          grepMatches = parsedRes.matches.map((m: any) => ({
            Filename: m.Filename || m.file || '',
            LineNumber: m.LineNumber ?? m.lineNumber,
            LineContent: m.LineContent ?? m.lineContent ?? '',
          }));
        }
      } else if (parsedRes.files && Array.isArray(parsedRes.files)) {
        fileList = parsedRes.files;
      }
    }
  } catch {
    // If raw newline-separated text
    if (resultText) {
      const lines = resultText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      fileList = lines.filter((l) => l.includes('.') || l.includes('/'));
    }
  }

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const totalResults = fileList.length > 0 ? fileList.length : grepMatches.length;

  return (
    <div className="my-1.5 rounded-xl bg-[#141414] border border-[#262626] overflow-hidden text-xs shadow-md animate-fade-in font-sans">
      {/* Subheader: Search Pattern & Counts */}
      <div className="px-3 py-2 bg-[#181818] border-b border-[#262626] flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[#8c8c8c] font-mono text-[11px]">pattern:</span>
          <span className="font-mono text-[11.5px] px-1.5 py-0.5 rounded bg-[#202020] border border-[#2d2d2d] text-[#e0e0e0] truncate max-w-sm">
            {pattern || '*'}
          </span>
          <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-[#101010] text-[#7ee787] border border-[#262626]">
            {totalResults} {totalResults === 1 ? 'match' : 'matches'}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setShowRaw(!showRaw)}
            className={`px-2 py-0.5 rounded text-[11px] font-medium transition cursor-pointer ${
              showRaw
                ? 'bg-[#2a2a2a] text-white'
                : 'text-[#8c8c8c] hover:text-[#cccccc] hover:bg-[#202020]'
            }`}
            title="Toggle Raw JSON Output"
          >
            {showRaw ? 'Matches' : 'Raw JSON'}
          </button>
          <button
            type="button"
            onClick={() => handleCopy(resultText || '')}
            className="p-1 rounded text-[#8c8c8c] hover:text-white hover:bg-[#202020] transition cursor-pointer"
            title="Copy search results"
          >
            {copied ? <Check className="w-3 h-3 text-[#7ee787]" /> : <Copy className="w-3 h-3" />}
          </button>
        </div>
      </div>

      {/* Content Area */}
      {showRaw ? (
        <pre className="p-3 font-mono text-[11.5px] text-[#9d9d9d] leading-relaxed max-h-56 overflow-y-auto whitespace-pre-wrap bg-[#101010]">
          {resultText || argumentsText || 'No output recorded'}
        </pre>
      ) : (
        <div className="p-2.5 max-h-64 overflow-y-auto space-y-1">
          {/* File Matches List */}
          {fileList.length > 0 && (
            <div className="space-y-1">
              {fileList.map((file, idx) => (
                <div
                  key={idx}
                  onClick={() => onOpenFile?.(file)}
                  className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-[#191919] hover:bg-[#222222] border border-[#222222] hover:border-[#333333] transition-colors cursor-pointer group"
                  title={`Open ${file} in editor`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <FileChip filePath={file} onOpenFile={onOpenFile} />
                    <span className="text-[11px] text-[#6e6e6e] truncate font-mono">
                      {file}
                    </span>
                  </div>
                  <ExternalLink className="w-3 h-3 text-[#6e6e6e] group-hover:text-[#58a6ff] opacity-0 group-hover:opacity-100 transition shrink-0 ml-2" />
                </div>
              ))}
            </div>
          )}

          {/* Grep Matches with Line numbers and snippets */}
          {grepMatches.length > 0 && (
            <div className="space-y-1.5">
              {grepMatches.map((m, idx) => (
                <div
                  key={idx}
                  onClick={() =>
                    onOpenFile?.(m.Filename, {
                      startLine: m.LineNumber,
                      endLine: m.LineNumber,
                    })
                  }
                  className="p-2 rounded-lg bg-[#191919] hover:bg-[#222222] border border-[#222222] transition cursor-pointer group space-y-1"
                >
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-[#58a6ff] font-mono group-hover:underline">
                      {m.Filename}
                      {m.LineNumber ? `:${m.LineNumber}` : ''}
                    </span>
                    <span className="text-[10px] text-[#6e6e6e]">Click to open line</span>
                  </div>
                  {m.LineContent && (
                    <div className="p-1.5 rounded bg-[#101010] text-[11px] font-mono text-[#cccccc] truncate border border-[#1e1e1e]">
                      {m.LineContent}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {fileList.length === 0 && grepMatches.length === 0 && (
            <div className="p-3 text-center text-[#6e6e6e] font-sans text-xs italic">
              No matching files found.
            </div>
          )}
        </div>
      )}
    </div>
  );
};
