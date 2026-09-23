'use client';

import React, { useState, useEffect } from 'react';
import {
  Shield,
  Terminal,
  FileCode,
  Check,
  X,
  CheckCheck,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Copy,
  CheckIcon,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { AestheticFileIcon } from '@/components/common/aesthetic-file-icon';

export interface PermissionCardProps {
  toolCallId: string;
  toolName: string;
  actionType: 'COMMAND' | 'FILE_WRITE' | 'READ';
  targetResource: string;
  reason?: string;
  arguments?: Record<string, any>;
  mode?: 'ASK' | 'AUTO' | 'FULL_ACCESS';
  onRespond: (decision: 'APPROVED' | 'REJECTED', alwaysAllow?: boolean) => void;
}

export const PermissionCard: React.FC<PermissionCardProps> = ({
  toolName,
  actionType,
  targetResource,
  reason,
  arguments: toolArgs = {},
  mode = 'ASK',
  onRespond,
}) => {
  const isCommand = actionType === 'COMMAND';
  const isFileWrite = actionType === 'FILE_WRITE';

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionTaken, setActionTaken] = useState<'APPROVED' | 'ALWAYS' | 'REJECTED' | null>(null);
  const [isDetailsExpanded, setIsDetailsExpanded] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  // Keyboard shortcuts: Enter to approve, Esc to deny
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isSubmitting) return;

      // Only handle if user is not actively typing in an input/textarea/contenteditable
      const activeEl = document.activeElement;
      const isTyping =
        activeEl &&
        (activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'TEXTAREA' ||
          activeEl.getAttribute('contenteditable') === 'true');

      if (isTyping) return;

      if (e.key === 'Enter') {
        e.preventDefault();
        handleAction('APPROVED', false);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleAction('REJECTED', false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSubmitting]);

  const handleAction = async (decision: 'APPROVED' | 'REJECTED', alwaysAllow = false) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setActionTaken(alwaysAllow ? 'ALWAYS' : decision);

    try {
      await onRespond(decision, alwaysAllow);
    } catch {
      setIsSubmitting(false);
      setActionTaken(null);
    }
  };

  const handleCopyCommand = (text: string) => {
    navigator.clipboard.writeText(text);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  // Inspect payload content
  const patchContent: string | undefined = toolArgs?.patch;
  const writeContent: string | undefined = toolArgs?.content;
  const commandText: string = toolArgs?.command || (isCommand ? targetResource : '');
  const hasInspectableData = Boolean(patchContent || writeContent || commandText);

  return (
    <div className="my-3 rounded-xl border border-amber-500/30 bg-[#16171d]/95 backdrop-blur-sm p-3.5 text-xs space-y-3 shadow-xl animate-slide-down select-none font-sans">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 font-medium text-amber-300">
          <div className="w-6 h-6 rounded-md bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0 shadow-xs">
            <Shield className="w-3.5 h-3.5 text-amber-400" strokeWidth={1.75} />
          </div>
          <div>
            <span className="text-[12.5px] font-semibold tracking-tight text-amber-200">
              Action Authorization Required
            </span>
            <div className="text-[10.5px] text-zinc-400 font-normal">
              The agent needs permission before modifying your project.
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300/90 border border-amber-500/20 font-medium">
            Mode: {mode}
          </span>
        </div>
      </div>

      {/* Target Resource Card */}
      <div className="bg-[#0e1015] p-2.5 rounded-lg border border-white/[0.08] space-y-1.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            {isFileWrite ? (
              <AestheticFileIcon filePath={targetResource} className="w-4 h-4 shrink-0" />
            ) : isCommand ? (
              <Terminal className="w-4 h-4 text-sky-400 shrink-0" strokeWidth={1.75} />
            ) : (
              <FileCode className="w-4 h-4 text-zinc-400 shrink-0" strokeWidth={1.75} />
            )}

            <span className="px-1.5 py-0.5 rounded bg-white/[0.05] text-[10.5px] font-mono font-semibold text-zinc-300 border border-white/[0.06]">
              {toolName}
            </span>

            <span className="font-mono text-zinc-200 text-xs font-medium truncate" title={targetResource}>
              {targetResource}
            </span>
          </div>

          {/* Toggle details if content/diff/command is available */}
          {hasInspectableData && (
            <button
              type="button"
              onClick={() => setIsDetailsExpanded(!isDetailsExpanded)}
              className="text-[11px] text-zinc-400 hover:text-white flex items-center gap-1 transition cursor-pointer shrink-0 ml-2 group select-none"
            >
              <span>{isDetailsExpanded ? 'Hide Details' : 'View Code / Diff'}</span>
              <ChevronRight
                className={`w-3.5 h-3.5 text-zinc-400 group-hover:text-white transition-transform duration-200 shrink-0 ${
                  isDetailsExpanded ? 'rotate-90' : ''
                }`}
              />
            </button>
          )}
        </div>

        {reason && (
          <div className="text-[11px] text-zinc-400 flex items-start gap-1 pt-0.5">
            <AlertCircle className="w-3 h-3 text-amber-400/80 shrink-0 mt-0.5" />
            <span>{reason}</span>
          </div>
        )}

        {/* Collapsible Inspection Details with smooth accordion animation */}
        {hasInspectableData && (
          <div className={`accordion-grid ${isDetailsExpanded ? 'open' : ''}`}>
            <div className="accordion-inner">
              <div className="pt-2 border-t border-white/[0.06] space-y-2">
                {/* Command inspection */}
                {isCommand && commandText && (
                  <div className="relative group/cmd">
                    <pre className="p-2.5 rounded bg-[#07080a] text-zinc-300 font-mono text-[11.5px] overflow-x-auto border border-white/[0.06]">
                      <span className="text-sky-400 select-none">$ </span>
                      {commandText}
                    </pre>
                    <button
                      type="button"
                      onClick={() => handleCopyCommand(commandText)}
                      className="absolute top-2 right-2 p-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition cursor-pointer opacity-0 group-hover/cmd:opacity-100"
                      title="Copy command"
                    >
                      {isCopied ? (
                        <CheckIcon className="w-3 h-3 text-emerald-400" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                    </button>
                  </div>
                )}

                {/* Patch / Diff inspection */}
                {isFileWrite && patchContent && (
                  <div className="space-y-1">
                    <div className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider">
                      Unified Patch Preview
                    </div>
                    <pre className="p-2 rounded bg-[#07080a] font-mono text-[11px] overflow-x-auto max-h-52 overflow-y-auto leading-relaxed border border-white/[0.06] select-text">
                      {patchContent.split('\n').map((line: string, idx: number) => {
                        if (line.startsWith('+') && !line.startsWith('+++')) {
                          return (
                            <div key={idx} className="bg-emerald-950/30 text-emerald-300 px-1 rounded-xs">
                              {line}
                            </div>
                          );
                        }
                        if (line.startsWith('-') && !line.startsWith('---')) {
                          return (
                            <div key={idx} className="bg-rose-950/30 text-rose-300 px-1 rounded-xs">
                              {line}
                            </div>
                          );
                        }
                        if (line.startsWith('@@')) {
                          return (
                            <div key={idx} className="text-blue-400 font-semibold px-1">
                              {line}
                            </div>
                          );
                        }
                        return (
                          <div key={idx} className="text-zinc-400 px-1">
                            {line}
                          </div>
                        );
                      })}
                    </pre>
                  </div>
                )}

                {/* Full File Write Content inspection */}
                {isFileWrite && !patchContent && writeContent && (
                  <div className="space-y-1">
                    <div className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider flex items-center justify-between">
                      <span>File Content Preview</span>
                      <span>{writeContent.split('\n').length} lines</span>
                    </div>
                    <pre className="p-2.5 rounded bg-[#07080a] text-zinc-300 font-mono text-[11px] overflow-x-auto max-h-52 overflow-y-auto leading-relaxed border border-white/[0.06] select-text">
                      {writeContent}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap items-center gap-2 pt-0.5">
        {/* Approve Once */}
        <button
          type="button"
          disabled={isSubmitting}
          onClick={() => handleAction('APPROVED', false)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 active:scale-95 text-emerald-200 font-medium text-xs border border-emerald-500/40 hover:border-emerald-500/60 shadow-xs transition-all cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
        >
          {isSubmitting && actionTaken === 'APPROVED' ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Check className="w-3.5 h-3.5 text-emerald-400" strokeWidth={2} />
          )}
          <span>Approve Once</span>
          <span className="text-[10px] opacity-60 font-mono hidden sm:inline">[Enter]</span>
        </button>

        {/* Always Allow (Session Mode -> AUTO) */}
        <button
          type="button"
          disabled={isSubmitting}
          onClick={() => handleAction('APPROVED', true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 active:scale-95 text-blue-200 hover:text-white font-medium text-xs border border-blue-500/30 hover:border-blue-500/50 shadow-xs transition-all cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
          title="Switches session policy to AUTO (automatically allows future safe workspace edits)"
        >
          {isSubmitting && actionTaken === 'ALWAYS' ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <CheckCheck className="w-3.5 h-3.5 text-blue-400" strokeWidth={2} />
          )}
          <span>Always Allow in this Session</span>
        </button>

        {/* Deny / Reject */}
        <button
          type="button"
          disabled={isSubmitting}
          onClick={() => handleAction('REJECTED', false)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-transparent hover:bg-rose-950/30 active:scale-95 text-zinc-400 hover:text-rose-300 border border-white/[0.08] hover:border-rose-900/40 text-xs transition-all cursor-pointer disabled:opacity-50 disabled:pointer-events-none ml-auto"
          title="Reject this action and ask AI to continue"
        >
          {isSubmitting && actionTaken === 'REJECTED' ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <X className="w-3.5 h-3.5" strokeWidth={2} />
          )}
          <span>Deny</span>
          <span className="text-[10px] opacity-60 font-mono hidden sm:inline">[Esc]</span>
        </button>
      </div>
    </div>
  );
};
