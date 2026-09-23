'use client';

import React, { useState } from 'react';
import { HelpCircle, Check, Copy, CheckIcon, Code, ChevronRight } from 'lucide-react';
import { FormattedCodeCard } from './formatted-code-card';

interface QuestionDetailsCardProps {
  argumentsText?: string;
  resultText?: string;
}

export const QuestionDetailsCard: React.FC<QuestionDetailsCardProps> = ({
  argumentsText,
  resultText,
}) => {
  const [showRaw, setShowRaw] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showOptions, setShowOptions] = useState(false);

  let question = '';
  let options: string[] = [];

  try {
    if (argumentsText) {
      const parsedArgs = JSON.parse(argumentsText);
      question = parsedArgs.question || '';
      if (Array.isArray(parsedArgs.options)) {
        options = parsedArgs.options;
      }
    }
  } catch {
    question = argumentsText || '';
  }

  let answer = '';
  let isCancelled = false;

  try {
    if (resultText) {
      const parsedRes = JSON.parse(resultText);
      if (parsedRes.answer) {
        answer = parsedRes.answer;
      } else if (parsedRes.status === 'cancelled') {
        isCancelled = true;
      } else if (typeof parsedRes === 'string') {
        answer = parsedRes;
      }
    }
  } catch {
    answer = resultText || '';
  }

  const handleCopy = () => {
    const textToCopy = showRaw
      ? JSON.stringify({ arguments: argumentsText, output: resultText }, null, 2)
      : `Question: ${question}\nAnswer: ${answer || (isCancelled ? 'Cancelled' : '-')}`;
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-1.5 rounded-xl bg-white dark:bg-[#141414] border border-slate-200 dark:border-[#262626] overflow-hidden text-xs shadow-sm dark:shadow-md animate-fade-in font-sans">
      {/* Header Bar */}
      <div className="px-3.5 py-2 bg-slate-50 dark:bg-[#181818] border-b border-slate-200 dark:border-[#262626] flex items-center justify-between gap-2 select-none">
        <div className="flex items-center gap-2 min-w-0">
          <HelpCircle className="w-3.5 h-3.5 text-slate-500 dark:text-[#8c8c8c] shrink-0" strokeWidth={1.75} />
          <span className="text-slate-800 dark:text-[#cccccc] font-medium text-[12px]">Clarification Details</span>
          {isCancelled ? (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-200 dark:bg-white/[0.04] text-slate-600 dark:text-[#8c8c8c] border border-slate-300 dark:border-white/[0.08]">
              Cancelled
            </span>
          ) : answer ? (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-200 dark:bg-white/[0.04] text-slate-700 dark:text-[#a3a3a3] border border-slate-300 dark:border-white/[0.08]">
              Answered
            </span>
          ) : (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-200 dark:bg-white/[0.04] text-slate-600 dark:text-[#8c8c8c] border border-slate-300 dark:border-white/[0.08]">
              Pending
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setShowRaw(!showRaw)}
            className={`px-2 py-0.5 rounded text-[11px] font-medium transition cursor-pointer flex items-center gap-1 ${
              showRaw
                ? 'bg-slate-200 text-slate-900 dark:bg-[#2a2a2a] dark:text-white'
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 dark:text-[#8c8c8c] dark:hover:text-[#cccccc] dark:hover:bg-[#202020]'
            }`}
            title="Toggle Raw JSON Output"
          >
            <Code className="w-3 h-3" />
            <span>Raw</span>
          </button>

          <button
            type="button"
            onClick={handleCopy}
            className="p-1 rounded text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 dark:text-[#8c8c8c] dark:hover:text-white dark:hover:bg-[#202020] transition cursor-pointer"
            title="Copy Q&A"
          >
            {copied ? (
              <CheckIcon className="w-3.5 h-3.5 text-slate-700 dark:text-[#cccccc]" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* Body */}
      {showRaw ? (
        <div className="p-3 space-y-3 bg-slate-50 dark:bg-[#101010] select-text">
          {argumentsText && (
            <FormattedCodeCard
              title="Tool arguments"
              code={argumentsText}
              defaultLanguage="json"
              maxHeight="max-h-48"
            />
          )}
          {resultText && (
            <FormattedCodeCard
              title="Tool Output"
              code={resultText}
              maxHeight="max-h-60"
            />
          )}
        </div>
      ) : (
        <div className="p-3.5 space-y-3 select-text bg-white dark:bg-[#121212]">
          {/* Question Box */}
          <div className="space-y-1.5">
            <div className="text-[10px] font-mono text-slate-500 dark:text-[#6e6e6e] uppercase tracking-wider">
              Question
            </div>
            <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#242424] text-slate-800 dark:text-[#d4d4d4] text-[12.5px] leading-relaxed">
              {question || 'No question provided'}
            </div>
          </div>

          {/* User's Answer */}
          <div className="space-y-1.5">
            <div className="text-[10px] font-mono text-slate-500 dark:text-[#6e6e6e] uppercase tracking-wider">
              User Answer
            </div>
            {isCancelled ? (
              <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#242424] text-slate-500 dark:text-[#8c8c8c] text-[12px] italic">
                Clarification session was cancelled by user.
              </div>
            ) : answer ? (
              <div className="flex items-start gap-2.5 p-2.5 rounded-lg bg-slate-50 dark:bg-[#181818] border border-slate-300 dark:border-[#2e2e2e] text-slate-900 dark:text-[#f0f0f0]">
                <Check className="w-3.5 h-3.5 text-slate-500 dark:text-[#8c8c8c] shrink-0 mt-0.5" strokeWidth={2} />
                <div className="flex-1 min-w-0 text-[12.5px] text-slate-900 dark:text-[#f0f0f0] leading-relaxed">
                  {answer}
                </div>
              </div>
            ) : (
              <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-[#181818] border border-slate-200 dark:border-[#242424] text-slate-500 dark:text-[#8c8c8c] text-[12px] italic">
                Waiting for user response...
              </div>
            )}
          </div>

          {/* Available Options (Collapsible, default closed, smooth animation) */}
          {options.length > 0 && (
            <div className="pt-1.5 border-t border-slate-200 dark:border-[#1e1e1e]">
              <button
                type="button"
                onClick={() => setShowOptions(!showOptions)}
                className="flex items-center gap-1.5 py-0.5 text-slate-600 dark:text-[#8c8c8c] hover:text-slate-900 dark:hover:text-[#d4d4d4] transition-colors cursor-pointer select-none group w-full text-left"
              >
                <ChevronRight
                  className={`w-3.5 h-3.5 text-slate-500 dark:text-[#6e6e6e] group-hover:text-slate-800 dark:group-hover:text-[#a3a3a3] transition-transform duration-200 ${
                    showOptions ? 'rotate-90 text-slate-800 dark:text-[#a3a3a3]' : ''
                  }`}
                />
                <span className="text-[10px] font-mono uppercase tracking-wider font-medium">
                  Available Options ({options.length})
                </span>
                <span className="text-[9.5px] text-slate-500 dark:text-[#555555] font-mono ml-auto">
                  {showOptions ? 'Hide' : 'View'}
                </span>
              </button>

              <div className={`accordion-grid ${showOptions ? 'open' : ''}`}>
                <div className="accordion-inner">
                  <div className="space-y-1 pt-1.5 pb-0.5">
                    {options.map((opt, idx) => {
                      const isChosen = answer === opt;
                      return (
                        <div
                          key={idx}
                          className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[11.5px] border transition-colors ${
                            isChosen
                              ? 'bg-slate-200 dark:bg-[#1c1c1c] border-slate-300 dark:border-[#383838] text-slate-900 dark:text-white font-medium'
                              : 'bg-slate-50 dark:bg-[#151515] border-slate-200 dark:border-[#222222] text-slate-600 dark:text-[#8c8c8c]'
                          }`}
                        >
                          <span className="font-mono text-[10px] text-slate-400 dark:text-[#666666] shrink-0">
                            {idx + 1}.
                          </span>
                          <span className="truncate flex-1">{opt}</span>
                          {isChosen && (
                            <span className="text-[10px] font-mono text-slate-700 dark:text-[#a3a3a3] shrink-0 font-normal">
                              ✓ Selected
                            </span>
                          )}
                          {idx === 0 && !isChosen && (
                            <span className="text-[9.5px] font-mono text-slate-500 dark:text-[#666666] shrink-0">
                              (Recommended)
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
