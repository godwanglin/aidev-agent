'use client';

import React from 'react';
import { FileCode, RotateCcw, Check } from 'lucide-react';
import { AestheticFileIcon } from '@/components/common/aesthetic-file-icon';

export interface ChangedFileItem {
  filePath: string;
  latestSnapshotId: string;
  status: 'ACTIVE' | 'REVERTED';
  additions: number;
  deletions: number;
  originalContent?: string;
  currentContent?: string;
  unifiedDiff?: string;
}

interface ChangedFilesSectionProps {
  files: ChangedFileItem[];
  onOpenFileDiff: (file: ChangedFileItem) => void;
  onRevertFile: (snapshotId: string, filePath: string) => void;
}

export const ChangedFilesSection: React.FC<ChangedFilesSectionProps> = ({
  files,
  onOpenFileDiff,
  onRevertFile,
}) => {
  if (files.length === 0) {
    return (
      <div className="p-4 text-center text-xs text-slate-500">
        <FileCode className="w-5 h-5 mx-auto mb-1.5 opacity-30" strokeWidth={1.5} />
        No files modified yet
      </div>
    );
  }

  return (
    <div className="p-2 space-y-1 overflow-y-auto max-h-full">
      <div className="text-[10px] font-semibold text-slate-500 uppercase px-1 py-0.5">
        Modified Files ({files.length})
      </div>

      {files.map((file) => (
        <div
          key={file.filePath}
          className="group p-2 rounded-md bg-[#161a24] border border-white/[0.05] hover:border-white/[0.12] transition flex items-center justify-between gap-2 text-xs"
        >
          <button
            onClick={() => onOpenFileDiff(file)}
            className="flex items-center gap-2 min-w-0 text-left flex-1"
            title={`View diff: ${file.filePath}`}
          >
            <AestheticFileIcon filePath={file.filePath} className="w-3.5 h-3.5 shrink-0" />
            <span className="font-mono text-[11px] text-slate-300 truncate">{file.filePath}</span>
          </button>

          <div className="flex items-center gap-1.5 shrink-0 font-mono text-[10px]">
            <span className="text-emerald-400">+{file.additions}</span>
            <span className="text-rose-400">-{file.deletions}</span>

            {file.status === 'REVERTED' ? (
              <span className="text-slate-500 text-[9px] flex items-center gap-0.5">
                <Check className="w-3 h-3 text-emerald-500" strokeWidth={2} /> Reverted
              </span>
            ) : (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRevertFile(file.latestSnapshotId, file.filePath);
                }}
                className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-white/[0.08] text-slate-400 hover:text-amber-300 transition"
                title="Instant revert to pre-change snapshot"
              >
                <RotateCcw className="w-3 h-3" strokeWidth={1.75} />
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};
