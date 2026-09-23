'use client';

import React, { useState, useEffect } from 'react';
import { ListOrdered, Check, X, ArrowRight, FileText, ExternalLink } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface PlanCardProps {
  goal: string;
  planMarkdown: string;
  onApprove: () => void;
  onReject: () => void;
  onOpenFile?: (filePath: string) => void;
  sessionId?: string;
}

export const PlanCard: React.FC<PlanCardProps> = ({
  goal,
  planMarkdown,
  onApprove,
  onReject,
  onOpenFile,
  sessionId,
}) => {
  const [content, setContent] = useState(planMarkdown || '');

  useEffect(() => {
    if (planMarkdown && planMarkdown.trim()) {
      setContent(planMarkdown);
      return;
    }
    if (sessionId) {
      fetch(`/api/files/read?path=implementation_plan.md&sessionId=${encodeURIComponent(sessionId)}&workdir=default`)
        .then((res) => res.json())
        .then((data) => {
          if (data?.content) {
            setContent(data.content);
          }
        })
        .catch(() => {});
    }
  }, [planMarkdown, sessionId]);

  return (
    <div className="my-3 rounded-xl border border-[#262626] bg-[#141414] p-3.5 space-y-3 text-xs select-none shadow-lg animate-expand font-sans">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#262626] pb-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <ListOrdered className="w-3.5 h-3.5 text-[#8c8c8c]" strokeWidth={1.75} />
          <span className="font-medium text-[#cccccc] text-[12px] truncate">
            Implementation Plan Review
          </span>

          {/* Direct Clickable Artifact Badge */}
          <button
            type="button"
            onClick={() => onOpenFile?.('implementation_plan.md')}
            className="flex items-center gap-1 px-2 py-0.5 rounded bg-white/[0.04] hover:bg-white/[0.08] text-[#8c8c8c] hover:text-[#cccccc] font-mono text-[10.5px] border border-white/[0.08] transition cursor-pointer shrink-0"
            title="Open implementation_plan.md in editor"
          >
            <FileText className="w-3 h-3 text-[#8c8c8c]" />
            <span>implementation_plan.md</span>
            <ExternalLink className="w-2.5 h-2.5 opacity-60" />
          </button>
        </div>

        <span className="text-[10px] px-2 py-0.5 rounded bg-white/[0.04] text-[#8c8c8c] font-mono border border-white/[0.08] shrink-0">
          Pending Approval
        </span>
      </div>

      {/* Target Goal Summary */}
      {goal && (
        <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-[#181818] border border-[#242424] text-xs">
          <span className="text-[#8c8c8c] font-medium">Target Goal:</span>
          <span className="text-[#ffffff] font-medium truncate max-w-[500px]">{goal}</span>
        </div>
      )}

      {/* Markdown Plan Content */}
      <div className="p-3.5 rounded-lg bg-[#181818] border border-[#242424] max-h-[380px] overflow-y-auto pr-2 space-y-2 select-text font-sans">
        {content ? (
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              h1: ({ children }: any) => (
                <h1 className="text-[14px] font-semibold text-[#f0f0f0] mb-2 pb-1 border-b border-[#262626]">
                  {children}
                </h1>
              ),
              h2: ({ children }: any) => (
                <h2 className="text-[13px] font-medium text-[#e4e4e7] mt-3 mb-1.5">
                  {children}
                </h2>
              ),
              h3: ({ children }: any) => (
                <h3 className="text-[12px] font-medium text-[#d4d4d8] mt-2 mb-1">
                  {children}
                </h3>
              ),
              p: ({ children }: any) => (
                <p className="text-[12px] text-[#cccccc] leading-relaxed mb-2 last:mb-0">
                  {children}
                </p>
              ),
              ul: ({ className, children }: any) => {
                const isTaskList =
                  className?.includes('contains-task-list') ||
                  React.Children.toArray(children).some(
                    (child: any) =>
                      child?.props?.className?.includes('task-list-item') ||
                      (child?.props?.children &&
                        React.Children.toArray(child.props.children).some(
                          (c: any) => c?.props?.type === 'checkbox'
                        ))
                  );
                return (
                  <ul
                    className={`${
                      isTaskList ? 'list-none pl-0 space-y-1.5' : 'list-disc pl-4 space-y-1'
                    } mb-2 text-[12px] text-[#cccccc]`}
                  >
                    {children}
                  </ul>
                );
              },
              ol: ({ children }: any) => (
                <ol className="list-decimal pl-4 mb-2 space-y-1 text-[12px] text-[#cccccc]">
                  {children}
                </ol>
              ),
              li: ({ className, children }: any) => {
                const childrenArray = React.Children.toArray(children);
                let checkbox: React.ReactNode = null;
                const content: React.ReactNode[] = [];

                childrenArray.forEach((child: any) => {
                  if (
                    child?.props?.type === 'checkbox' ||
                    child?.type === 'input' ||
                    child?.props?.node?.tagName === 'input'
                  ) {
                    checkbox = child;
                  } else {
                    content.push(child);
                  }
                });

                if (checkbox) {
                  return (
                    <li className="list-none flex items-start gap-2 my-1 text-[#e2e8f0] text-[12px] leading-relaxed">
                      <span className="shrink-0 mt-0.5 inline-flex items-center">{checkbox}</span>
                      <div className="flex-1 min-w-0 break-words leading-relaxed text-[#cccccc]">
                        {content}
                      </div>
                    </li>
                  );
                }

                return (
                  <li className="leading-relaxed text-[#cccccc] my-1 text-[12px]">
                    {children}
                  </li>
                );
              },
              code: ({ node, className, children, ...props }: any) => {
                const match = /language-(\w+)/.exec(className || '');
                const isInline = !match && !String(children).includes('\n');
                if (isInline) {
                  return (
                    <code
                      className="inline-block px-1.5 py-0.5 rounded bg-[#222222] text-[#d7ba7d] font-mono text-[11px] whitespace-nowrap mx-0.5 align-baseline break-keep"
                      {...props}
                    >
                      {children}
                    </code>
                  );
                }
                return (
                  <pre className="p-2.5 my-2 rounded-lg bg-[#121212] border border-[#222222] overflow-x-auto text-[11.5px] font-mono text-[#cccccc]">
                    <code className={className} {...props}>
                      {children}
                    </code>
                  </pre>
                );
              },
              input: ({ type, checked }: any) => {
                if (type === 'checkbox') {
                  return (
                    <span
                      className={`inline-flex items-center justify-center w-3.5 h-3.5 rounded-[3px] shrink-0 mt-[2px] transition-all select-none ${
                        checked
                          ? 'bg-[#38bdf8]/15 border border-[#38bdf8]/60 text-[#38bdf8] shadow-[0_0_8px_rgba(56,189,248,0.2)]'
                          : 'bg-[#16161c] border border-[#333340] text-transparent'
                      }`}
                    >
                      {checked && (
                        <svg
                          className="w-2.5 h-2.5 stroke-[3] fill-none stroke-current"
                          viewBox="0 0 24 24"
                        >
                          <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </span>
                  );
                }
                return null;
              },
            }}
          >
            {content}
          </ReactMarkdown>
        ) : (
          <p className="text-[12px] text-[#8c8c8c] italic">
            Loading implementation plan...
          </p>
        )}
      </div>

      {/* Footer / Controls */}
      <div className="flex items-center justify-between pt-1.5 border-t border-[#262626]">
        <div className="flex items-center gap-1.5 text-[11px] text-[#737373] font-mono truncate">
          <span>Saved to artifacts:</span>
          <button
            type="button"
            onClick={() => onOpenFile?.('implementation_plan.md')}
            className="text-[#a3a3a3] hover:text-white hover:underline transition cursor-pointer"
          >
            implementation_plan.md
          </button>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onReject}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-[#8c8c8c] hover:text-[#e0e0e0] hover:bg-white/[0.05] border border-[#2a2a2a] hover:border-[#383838] transition cursor-pointer font-sans"
            title="Reject and revise plan"
          >
            <X className="w-3 h-3" strokeWidth={1.75} />
            <span>Revise</span>
          </button>
          <button
            type="button"
            onClick={onApprove}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#222226] hover:bg-[#2c2c32] text-white font-medium text-xs border border-[#383842] active:scale-[0.98] transition cursor-pointer font-sans shadow-sm"
            title="Yes, approve and start implementation"
          >
            <Check className="w-3.5 h-3.5 text-[#a1a1aa]" strokeWidth={2} />
            <span>Yes, Implement Plan</span>
            <ArrowRight className="w-3 h-3 text-[#71717a]" strokeWidth={1.75} />
          </button>
        </div>
      </div>
    </div>
  );
};
