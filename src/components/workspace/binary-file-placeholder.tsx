'use client';

import React, { useState } from 'react';
import { FileBox, Copy, Check, ExternalLink } from 'lucide-react';
import { AestheticFileIcon } from '@/components/common/aesthetic-file-icon';

export interface BinaryFilePlaceholderProps {
  filePath: string;
  fileSize?: number;
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i] || 'B'}`;
}

export const BinaryFilePlaceholder: React.FC<BinaryFilePlaceholderProps> = ({
  filePath,
  fileSize,
}) => {
  const [copied, setCopied] = useState(false);
  const fileName = filePath.split(/[\\/]/).pop() || filePath;
  const ext = fileName.split('.').pop()?.toUpperCase() || 'BINARY';

  const handleCopyPath = () => {
    navigator.clipboard.writeText(filePath);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleReveal = () => {
    if (typeof window !== 'undefined' && (window as any).electronAPI?.showItemInFolder) {
      (window as any).electronAPI.showItemInFolder(filePath);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 bg-[#0e0f12] select-none text-center">
      <div className="max-w-md w-full p-6 rounded-2xl bg-[#141519] border border-[#23252c] shadow-2xl flex flex-col items-center gap-3">
        {/* Aesthetic File Icon Container */}
        <div className="w-16 h-16 rounded-2xl bg-[#1a1c23] border border-[#2b2e38] flex items-center justify-center shadow-inner">
          <AestheticFileIcon filePath={filePath} className="w-8 h-8" />
        </div>

        {/* File Name & Extension Badge */}
        <div className="space-y-1">
          <div className="flex items-center justify-center gap-2">
            <h3 className="font-mono text-[14px] font-semibold text-zinc-100 truncate max-w-[280px]">
              {fileName}
            </h3>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
              {ext}
            </span>
          </div>
          {fileSize !== undefined && fileSize > 0 && (
            <p className="text-[11px] text-zinc-400 font-mono">{formatBytes(fileSize)}</p>
          )}
        </div>

        {/* Informative message */}
        <p className="text-[12px] text-zinc-400 leading-relaxed max-w-xs">
          The file is not displayed in the text editor because it is either binary or uses an unsupported text encoding.
        </p>

        {/* Quick Action Buttons */}
        <div className="flex items-center gap-2 pt-2">
          <button
            type="button"
            onClick={handleCopyPath}
            className="px-3 py-1.5 rounded-lg bg-[#1e2027] hover:bg-[#282b35] text-zinc-300 hover:text-white border border-[#2e313d] flex items-center gap-1.5 text-xs transition cursor-pointer"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Copy className="w-3.5 h-3.5 text-zinc-400" />
            )}
            <span>{copied ? 'Copied' : 'Copy Path'}</span>
          </button>

          {typeof window !== 'undefined' && (window as any).electronAPI?.showItemInFolder && (
            <button
              type="button"
              onClick={handleReveal}
              className="px-3 py-1.5 rounded-lg bg-[#1e2027] hover:bg-[#282b35] text-zinc-300 hover:text-white border border-[#2e313d] flex items-center gap-1.5 text-xs transition cursor-pointer"
            >
              <ExternalLink className="w-3.5 h-3.5 text-zinc-400" />
              <span>Reveal File</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
