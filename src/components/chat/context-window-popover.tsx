'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Loader2, ChevronDown, Sparkles } from 'lucide-react';

interface ContextWindowPopoverProps {
  estimatedTokens: number;
  modelContextWindow?: number;
  activeModelName?: string;
  onCompactSession?: () => void;
  isCompacting?: boolean;
  compactionsCount?: number;
  latestTokensSaved?: number;
}

export const ContextWindowPopover: React.FC<ContextWindowPopoverProps> = ({
  estimatedTokens,
  modelContextWindow = 128000,
  activeModelName = 'AI Model',
  onCompactSession,
  isCompacting = false,
  latestTokensSaved = 0,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const maxWindow = Math.max(1, modelContextWindow);
  const ratio = Math.min(1, Math.max(0, estimatedTokens / maxWindow));
  const percentage = (ratio * 100).toFixed(1);

  // SVG Circular Ring parameters
  const radius = 8;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - ratio * circumference;

  // Adaptive ring color based on token pressure
  const ringColor =
    ratio >= 0.9
      ? 'text-red-500'
      : ratio >= 0.7
      ? 'text-amber-400'
      : 'text-blue-500';

  const formattedActive =
    estimatedTokens >= 1000
      ? `${(estimatedTokens / 1000).toFixed(1)}k`
      : `${estimatedTokens}`;
  const formattedMax =
    maxWindow >= 1000000
      ? `${(maxWindow / 1000000).toFixed(1)}M`
      : `${Math.round(maxWindow / 1000)}k`;

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (containerRef.current && !containerRef.current.contains(target)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div ref={containerRef} className="relative inline-flex items-center">
      {/* Mobile: Minimalist Circular Progress Ring Trigger */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`sm:hidden w-7 h-7 flex items-center justify-center rounded-lg transition-all select-none cursor-pointer border ${
          isOpen
            ? 'bg-[#222226] border-[#3e3e46] text-white'
            : 'bg-[#18181b] hover:bg-[#1f1f23] border-[#27272b] hover:border-[#333338] text-[#aaaaaf]'
        }`}
        aria-label={`Context window ${formattedActive} of ${formattedMax} tokens (${percentage}%)`}
        title={`Context Window: ${formattedActive} / ${formattedMax} (${percentage}%)`}
      >
        <svg className="w-[18px] h-[18px] -rotate-90" viewBox="0 0 20 20">
          {/* Background track circle */}
          <circle
            cx="10"
            cy="10"
            r={radius}
            stroke="currentColor"
            strokeWidth="2.2"
            fill="transparent"
            className="text-[#2a2a30]"
          />
          {/* Active progress arc */}
          <circle
            cx="10"
            cy="10"
            r={radius}
            stroke="currentColor"
            strokeWidth="2.2"
            fill="transparent"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className={`${ringColor} transition-all duration-300`}
          />
        </svg>
      </button>

      {/* Desktop: Detailed Pill Trigger */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono transition-all select-none cursor-pointer border ${
          isOpen
            ? 'bg-[#222226] border-[#3e3e46] text-white'
            : 'bg-[#18181b] hover:bg-[#1f1f23] border-[#27272b] hover:border-[#333338] text-[#aaaaaf]'
        }`}
        aria-label={`Context window ${formattedActive} of ${formattedMax} tokens`}
        aria-expanded={isOpen}
      >
        <svg className="w-3.5 h-3.5 -rotate-90 shrink-0" viewBox="0 0 20 20">
          <circle
            cx="10"
            cy="10"
            r={radius}
            stroke="currentColor"
            strokeWidth="2.2"
            fill="transparent"
            className="text-[#2a2a30]"
          />
          <circle
            cx="10"
            cy="10"
            r={radius}
            stroke="currentColor"
            strokeWidth="2.2"
            fill="transparent"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className={`${ringColor} transition-all duration-300`}
          />
        </svg>
        <span className="font-medium text-[#cccccc]">
          {formattedActive} / {formattedMax}
        </span>
        <ChevronDown
          className={`w-3 h-3 text-[#55555c] transition-transform duration-150 ${
            isOpen ? 'rotate-180 text-[#aaaaaf]' : ''
          }`}
        />
      </button>

      {/* Minimalist Developer Popover */}
      {isOpen && (
        <div
          className="absolute right-0 top-full mt-1.5 w-[260px] max-w-[calc(100vw-24px)] rounded-xl bg-[#141416] border border-[#26262a] shadow-2xl p-3 z-50 text-[#cccccc] font-sans animate-in fade-in-0 zoom-in-95 duration-100 select-none text-xs"
        >
          {/* Header: Title + Model */}
          <div className="flex items-center justify-between pb-2 border-b border-[#1f1f23] text-[11px]">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
              <span className="font-medium text-white">Context Window</span>
            </div>
            <span
              className="font-mono text-[10.5px] text-[#71717a] truncate max-w-[120px]"
              title={activeModelName}
            >
              {activeModelName}
            </span>
          </div>

          {/* Token Usage & Bar */}
          <div className="py-2.5 space-y-1.5">
            <div className="flex items-baseline justify-between font-mono text-[11.5px]">
              <span className="text-white font-medium">
                {estimatedTokens.toLocaleString()}{' '}
                <span className="text-[#66666e] text-[10.5px]">/ {formattedMax}</span>
              </span>
              <span className={`text-[10.5px] font-semibold ${ringColor}`}>{percentage}%</span>
            </div>

            {/* Progress bar */}
            <div className="h-1.5 w-full bg-[#1e1e22] rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  ratio >= 0.9 ? 'bg-red-500' : ratio >= 0.7 ? 'bg-amber-400' : 'bg-blue-500'
                }`}
                style={{ width: `${Math.max(2, Math.min(100, ratio * 100))}%` }}
              />
            </div>

            <div className="flex justify-between text-[10px] font-mono text-[#52525b] pt-0.5">
              <span>Auto-compact: 75%</span>
              {latestTokensSaved > 0 && (
                <span>~{Math.round(latestTokensSaved / 1000)}k saved</span>
              )}
            </div>
          </div>

          {/* Simple Action Button */}
          {onCompactSession && (
            <button
              type="button"
              onClick={() => {
                if (!isCompacting) onCompactSession();
              }}
              disabled={isCompacting}
              className="w-full mt-1 py-1.5 px-2.5 rounded-lg bg-[#1c1c20] hover:bg-[#232328] border border-[#27272c] hover:border-[#36363d] text-[#d4d4d8] hover:text-white font-medium text-[11px] flex items-center justify-between transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="flex items-center gap-1.5">
                {isCompacting ? (
                  <Loader2 className="w-3 h-3 animate-spin text-[#888892]" />
                ) : (
                  <Sparkles className="w-3 h-3 text-[#71717a]" />
                )}
                <span>{isCompacting ? 'Compacting...' : 'Compact Memory'}</span>
              </div>
              <span className="text-[9.5px] font-mono text-[#66666e]">/compact</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};
