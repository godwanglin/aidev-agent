'use client';

import React, { useState } from 'react';
import { ChevronRight, FileDiff } from 'lucide-react';
import { AestheticFileIcon } from '@/components/common/aesthetic-file-icon';
import type { TurnStep } from './activity-group';

export interface TurnChangedFile {
  filePath: string;
  additions: number;
  deletions: number;
}

export interface TurnChanges {
  fileCount: number;
  additions: number;
  deletions: number;
  files: TurnChangedFile[];
}

export function extractTurnChanges(steps: TurnStep[]): TurnChanges | null {
  const fileMap = new Map<string, TurnChangedFile>();
  let totalAdditions = 0;
  let totalDeletions = 0;
  let hasEdit = false;

  for (const step of steps) {
    if (step.type !== 'tool' || !step.toolMessage) continue;
    const msg = step.toolMessage;
    const name = msg.tool_name || '';

    let args: any = null;
    try {
      if (msg.tool_arguments) args = JSON.parse(msg.tool_arguments);
    } catch {}

    let res: any = null;
    try {
      if (msg.tool_result) res = JSON.parse(msg.tool_result);
    } catch {}

    const isEdit =
      name === 'write_file' ||
      name === 'apply_patch' ||
      name === 'create_file' ||
      name === 'edit_file' ||
      Boolean(args?.patchText) ||
      Boolean(args?.diff);

    if (isEdit) {
      const rawPath =
        res?.path ||
        args?.path ||
        args?.filePath ||
        args?.file ||
        args?.AbsolutePath ||
        args?.TargetFile ||
        '';

      const filePath = rawPath ? rawPath.replace(/\\/g, '/') : 'modified-file';

      // Ignore session artifacts and scripts (they are session metadata, not project code diffs)
      if (
        res?.isArtifact ||
        filePath === 'walkthrough.md' ||
        filePath === 'implementation_plan.md' ||
        filePath.startsWith('artifacts/') ||
        filePath.startsWith('.aidev/') ||
        filePath.startsWith('scripts/')
      ) {
        continue;
      }

      hasEdit = true;

      let add = res?.additions ?? args?.additions ?? 0;
      let del = res?.deletions ?? args?.deletions ?? 0;

      if (!add && !del && msg.tool_result) {
        const addMatch = /\+(\d+)/.exec(msg.tool_result);
        const delMatch = /-(\d+)/.exec(msg.tool_result);
        if (addMatch) add = parseInt(addMatch[1], 10);
        if (delMatch) del = parseInt(delMatch[1], 10);
      }

      if (add === 0 && del === 0) {
        add = 2;
        del = 2;
      }

      totalAdditions += add;
      totalDeletions += del;

      const existing = fileMap.get(filePath);
      if (existing) {
        existing.additions += add;
        existing.deletions += del;
      } else {
        fileMap.set(filePath, {
          filePath,
          additions: add,
          deletions: del,
        });
      }
    }
  }

  if (!hasEdit) return null;

  const files = Array.from(fileMap.values());
  const fileCount = Math.max(1, files.length);

  return {
    fileCount,
    additions: totalAdditions,
    deletions: totalDeletions,
    files,
  };
}

interface TurnDiffCardProps {
  changes: TurnChanges;
  onOpenFileDiff?: (filePath: string) => void;
  onOpenFile?: (filePath: string) => void;
  onOpenReview?: () => void;
  className?: string;
}

export const TurnDiffCard = React.memo<TurnDiffCardProps>(function TurnDiffCard({
  changes,
  onOpenFileDiff,
  onOpenFile,
  onOpenReview,
  className = 'max-w-3xl mx-auto w-full px-4 pt-1 pb-3 select-none',
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { fileCount, additions, deletions, files } = changes;

  return (
    <div className={className}>
      <div className="rounded-xl bg-[#141414] border border-[#222222] p-2.5 shadow-sm transition hover:border-[#2d2d2d]">
        {/* Header Row: '2 files changed +9 -9 >' and 'Review' Button */}
        <div className="flex items-center justify-between px-1.5">
          {/* Left Side: Accordion toggle */}
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-2 text-xs hover:opacity-90 transition cursor-pointer group text-left py-0.5"
            title={isExpanded ? 'Click to hide changed files' : 'Click to show changed files'}
          >
            <span className="text-[#cccccc] font-sans font-medium">
              {fileCount} {fileCount === 1 ? 'file' : 'files'} changed
            </span>
            <div className="flex items-center gap-1 font-mono text-[12px]">
              {additions > 0 && (
                <span className="text-[#7ee787] font-medium">+{additions}</span>
              )}
              {deletions > 0 && (
                <span className="text-[#ff7b72] font-medium">-{deletions}</span>
              )}
            </div>
            <ChevronRight
              className={`w-3.5 h-3.5 text-[#6e6e6e] group-hover:text-[#999999] transition-transform duration-200 ml-0.5 shrink-0 ${
                isExpanded ? 'rotate-90 text-[#cccccc]' : ''
              }`}
            />
          </button>

          {/* Right Side: 'Review' Button (Only this opens the sidebar) */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenReview?.();
            }}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#1e1e1e] hover:bg-[#282828] active:bg-[#323232] border border-[#2e2e2e] text-[#d4d4d4] hover:text-white text-xs font-sans font-medium transition cursor-pointer shadow-sm shrink-0"
            title="Open Review mode in sidebar"
          >
            <FileDiff className="w-3.5 h-3.5 text-[#8c8c8c]" strokeWidth={1.75} />
            <span>Review</span>
          </button>
        </div>

        {/* Expanded Changed Files List (Inline inside chat turn with smooth accordion animation) */}
        <div className={`accordion-grid ${isExpanded ? 'open' : ''}`}>
          <div className="accordion-inner">
            <div className="border-t border-[#1f1f1f] mt-2 pt-1.5 space-y-1">
              {files.map((file) => {
                const segments = file.filePath.split('/');
                const fileName = segments.pop() || file.filePath;
                const dirPath = segments.join('/');

                return (
                  <div
                    key={file.filePath}
                    className="flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-white/[0.04] transition group/file text-xs"
                  >
                    {/* Left: Aesthetic Icon + File Name + Directory */}
                    <div
                      onClick={() => onOpenFile?.(file.filePath)}
                      className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer pr-3"
                      title={`Open ${file.filePath} in editor`}
                    >
                      <AestheticFileIcon filePath={file.filePath} className="w-3.5 h-3.5 shrink-0 opacity-80" />
                      <span className="text-[#e1e1e1] group-hover/file:text-white group-hover/file:underline font-mono text-[11.5px] truncate">
                        {fileName}
                      </span>
                      {dirPath && (
                        <span className="text-[#666666] font-mono text-[10.5px] truncate">
                          {dirPath}
                        </span>
                      )}
                    </div>

                    {/* Right: +X -Y Diff Pill */}
                    <button
                      type="button"
                      onClick={() => onOpenFileDiff?.(file.filePath)}
                      className="flex items-center gap-1 font-mono text-[11px] px-1.5 py-0.5 rounded hover:bg-white/10 transition cursor-pointer shrink-0"
                      title="Open file diff in sidebar"
                    >
                      {file.additions > 0 && (
                        <span className="text-[#7ee787]">+{file.additions}</span>
                      )}
                      {file.deletions > 0 && (
                        <span className="text-[#ff7b72]">-{file.deletions}</span>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});
