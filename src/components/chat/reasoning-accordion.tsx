'use client';

import React, { useState, useEffect } from 'react';
import { ChevronRight } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface ReasoningAccordionProps {
  reasoning: string;
  isStreaming?: boolean;
}

export const ReasoningAccordion: React.FC<ReasoningAccordionProps> = ({
  reasoning,
  isStreaming = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    let timer: any;
    if (isStreaming) {
      const start = Date.now();
      timer = setInterval(() => {
        setElapsedSeconds(Math.floor((Date.now() - start) / 1000));
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [isStreaming]);

  if (!reasoning && !isStreaming) return null;

  const displayTime = elapsedSeconds > 0 ? `${elapsedSeconds}s` : '1s';

  return (
    <div className="py-0.5 select-none font-sans text-[13px] leading-relaxed">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 text-[#8c8c8c] hover:text-[#cccccc] transition cursor-pointer font-normal select-none group"
      >
        <ChevronRight
          className={`w-3.5 h-3.5 text-[#666666] group-hover:text-[#aaaaaa] transition-transform duration-200 shrink-0 ${
            isOpen ? 'rotate-90 text-[#cccccc]' : ''
          }`}
        />
        <span>
          {isStreaming
            ? `Thinking (${elapsedSeconds}s)...`
            : `Thought for ${displayTime}`}
        </span>
      </button>

      <div className={`accordion-grid ${isOpen ? 'open' : ''}`}>
        <div className="accordion-inner">
          <div className="mt-1.5 mb-2 pl-3 ml-1.5 border-l border-white/[0.1] text-[#9d9d9d] font-sans text-[12.5px] leading-relaxed select-text">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                p({ children }: any) {
                  return <p className="mb-2 last:mb-0 leading-relaxed text-[#9d9d9d]">{children}</p>;
                },
                ul({ children }: any) {
                  return <ul className="list-disc list-outside ml-4 mb-2 space-y-1 text-[#9d9d9d]">{children}</ul>;
                },
                ol({ children }: any) {
                  return <ol className="list-decimal list-outside ml-4 mb-2 space-y-1 text-[#9d9d9d]">{children}</ol>;
                },
                li({ children }: any) {
                  return <li className="leading-relaxed">{children}</li>;
                },
                code({ inline, className, children, ...props }: any) {
                  return (
                    <code
                      className="px-1.5 py-0.5 rounded bg-white/[0.05] text-[#d4d4d4] font-mono text-[11.5px] border border-white/[0.08]"
                      {...props}
                    >
                      {children}
                    </code>
                  );
                },
                pre({ children }: any) {
                  return (
                    <pre className="p-2.5 my-2 rounded-lg bg-white/[0.03] border border-white/[0.06] overflow-x-auto text-[11.5px] font-mono text-[#d4d4d4]">
                      {children}
                    </pre>
                  );
                },
                strong({ children }: any) {
                  return <strong className="font-semibold text-[#cccccc]">{children}</strong>;
                },
                em({ children }: any) {
                  return <em className="italic text-[#a8a8a8]">{children}</em>;
                },
              }}
            >
              {reasoning}
            </ReactMarkdown>
            {isStreaming && (
              <span className="inline-block w-1.5 h-3 bg-[#cccccc] animate-pulse ml-1 align-middle" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
