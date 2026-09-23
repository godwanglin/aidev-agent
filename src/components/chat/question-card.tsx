'use client';

import React, { useState, useEffect, useRef } from 'react';
import { HelpCircle, Send, Loader2, X } from 'lucide-react';

export interface QuestionCardProps {
  toolCallId: string;
  question: string;
  options: string[];
  allowCustom?: boolean;
  onSubmit: (answer: string) => void;
  onCancel?: () => void;
  isSubmitting?: boolean;
}

export const QuestionCard: React.FC<QuestionCardProps> = ({
  question,
  options = [],
  allowCustom = true,
  onSubmit,
  onCancel,
  isSubmitting = false,
}) => {
  // Default to selecting the recommended first option (index 0) if options exist
  const [selectedIndex, setSelectedIndex] = useState<number | null>(options.length > 0 ? 0 : null);
  const [isCustomSelected, setIsCustomSelected] = useState<boolean>(false);
  const [customText, setCustomText] = useState<string>('');
  const customInputRef = useRef<HTMLInputElement>(null);

  // Keyboard shortcut: Enter to submit, Escape to cancel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isSubmitting) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel?.();
        return;
      }

      if (e.key === 'Enter') {
        const canSubmit = isCustomSelected
          ? customText.trim().length > 0
          : selectedIndex !== null;
        if (canSubmit) {
          e.preventDefault();
          handleSubmit();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIndex, isCustomSelected, customText, isSubmitting, onCancel]);

  const handleSelectOption = (index: number) => {
    setSelectedIndex(index);
    setIsCustomSelected(false);
  };

  const handleSelectCustom = () => {
    setIsCustomSelected(true);
    setSelectedIndex(null);
    customInputRef.current?.focus();
  };

  const handleSubmit = () => {
    if (isSubmitting) return;

    if (isCustomSelected) {
      if (customText.trim()) {
        onSubmit(customText.trim());
      }
      return;
    }

    if (selectedIndex !== null && options[selectedIndex]) {
      onSubmit(options[selectedIndex]);
    }
  };

  const isSubmitDisabled = isSubmitting || (isCustomSelected ? !customText.trim() : selectedIndex === null);

  return (
    <div className="my-3 rounded-xl border border-slate-200 dark:border-[#262626] bg-white dark:bg-[#161616] p-3.5 space-y-3 text-xs select-none shadow-md dark:shadow-lg font-sans">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#262626] pb-2.5">
        <div className="flex items-center gap-2">
          <HelpCircle className="w-3.5 h-3.5 text-slate-500 dark:text-[#8c8c8c]" strokeWidth={1.75} />
          <span className="text-[12px] font-medium text-slate-800 dark:text-[#cccccc]">Clarification Question</span>
        </div>
        <span className="text-[10.5px] font-mono text-slate-500 dark:text-[#8c8c8c] px-2 py-0.5 rounded bg-slate-100 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06]">
          Clarification
        </span>
      </div>

      {/* Question Prompt */}
      <div className="text-[13px] font-medium text-slate-900 dark:text-[#e0e0e0] leading-snug select-text">
        {question}
      </div>

      {/* Options List */}
      <div className="space-y-1.5 pt-0.5">
        {options.map((option, idx) => {
          const isSelected = !isCustomSelected && selectedIndex === idx;
          const isRecommended = idx === 0;

          return (
            <div
              key={idx}
              onClick={() => handleSelectOption(idx)}
              className={`group flex items-start gap-2.5 px-3 py-2.5 rounded-lg border transition-all cursor-pointer ${
                isSelected
                  ? 'bg-slate-100 dark:bg-[#222222] border-slate-300 dark:border-[#444444] text-slate-950 dark:text-[#ffffff] font-medium'
                  : 'bg-slate-50/70 hover:bg-slate-100 dark:bg-[#1a1a1a] dark:hover:bg-[#1f1f1f] border-slate-200 hover:border-slate-300 dark:border-[#262626] dark:hover:border-[#333333] text-slate-700 hover:text-slate-950 dark:text-[#b3b3b3] dark:hover:text-[#d4d4d4]'
              }`}
            >
              {/* Minimal Radio Indicator */}
              <div className="mt-0.5 shrink-0">
                <div
                  className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center transition-all ${
                    isSelected
                      ? 'border-[#58a6ff] bg-[#58a6ff]'
                      : 'border-slate-300 dark:border-[#444444] group-hover:border-slate-400 dark:group-hover:border-[#666666] bg-transparent'
                  }`}
                >
                  {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white dark:bg-[#161616]" />}
                </div>
              </div>

              {/* Option Text & Badge */}
              <div className="flex-1 min-w-0 flex items-baseline justify-between gap-2">
                <span className="text-[12.5px] leading-relaxed">
                  {option}
                </span>

                {isRecommended && (
                  <span className="text-[10px] font-mono text-slate-600 dark:text-[#8c8c8c] bg-slate-200 dark:bg-white/[0.04] px-1.5 py-0.5 rounded border border-slate-300 dark:border-white/[0.08] shrink-0 font-normal">
                    Recommended
                  </span>
                )}
              </div>
            </div>
          );
        })}

        {/* Custom Answer Option at the Bottom */}
        {allowCustom && (
          <div
            onClick={handleSelectCustom}
            className={`group flex items-center gap-2.5 px-3 py-2 rounded-lg border transition-all cursor-pointer ${
              isCustomSelected
                ? 'bg-slate-100 dark:bg-[#222222] border-slate-300 dark:border-[#444444] text-slate-950 dark:text-[#ffffff]'
                : 'bg-slate-50/70 hover:bg-slate-100 dark:bg-[#1a1a1a] dark:hover:bg-[#1f1f1f] border-slate-200 hover:border-slate-300 dark:border-[#262626] dark:hover:border-[#333333] text-slate-700 dark:text-[#b3b3b3]'
            }`}
          >
            {/* Minimal Radio Indicator */}
            <div className="shrink-0">
              <div
                className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center transition-all ${
                  isCustomSelected
                    ? 'border-[#58a6ff] bg-[#58a6ff]'
                    : 'border-slate-300 dark:border-[#444444] group-hover:border-slate-400 dark:group-hover:border-[#666666] bg-transparent'
                }`}
              >
                {isCustomSelected && <div className="w-1.5 h-1.5 rounded-full bg-white dark:bg-[#161616]" />}
              </div>
            </div>

            {/* Direct Inline Input */}
            <input
              ref={customInputRef}
              type="text"
              value={customText}
              onChange={(e) => {
                setCustomText(e.target.value);
                setIsCustomSelected(true);
                setSelectedIndex(null);
              }}
              onFocus={() => {
                setIsCustomSelected(true);
                setSelectedIndex(null);
              }}
              placeholder="Type custom answer..."
              className="flex-1 bg-transparent text-[12.5px] text-slate-900 dark:text-[#ffffff] placeholder-slate-400 dark:placeholder-[#666666] focus:outline-none py-0.5"
            />
          </div>
        )}
      </div>

      {/* Footer Controls */}
      <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-[#262626]">
        <div className="flex items-center gap-2">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              disabled={isSubmitting}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-300 hover:border-slate-400 dark:text-[#8c8c8c] dark:hover:text-[#e0e0e0] dark:hover:bg-white/[0.05] dark:border-[#2a2a2a] dark:hover:border-[#383838] transition cursor-pointer"
              title="Cancel plan and clarification session (Esc)"
            >
              <X className="w-3.5 h-3.5" />
              <span>Cancel</span>
            </button>
          )}

          <div className="text-[11px] text-slate-500 dark:text-[#666666] hidden sm:flex items-center gap-1 font-sans">
            <span>Press</span>
            <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 rounded text-slate-600 dark:text-[#8c8c8c]">
              Enter ↵
            </kbd>
            {onCancel && (
              <>
                <span>or</span>
                <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 rounded text-slate-600 dark:text-[#8c8c8c]">
                  Esc
                </kbd>
              </>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={handleSubmit}
          disabled={isSubmitDisabled}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
            isSubmitDisabled
              ? 'bg-slate-100 dark:bg-[#222222] text-slate-400 dark:text-[#666666] border border-slate-200 dark:border-[#2a2a2a] cursor-not-allowed'
              : 'bg-slate-900 hover:bg-slate-800 text-white border border-slate-800 dark:bg-[#2a2a2e] dark:hover:bg-[#333338] dark:text-[#ffffff] dark:border-[#3a3a40] active:scale-[0.98]'
          }`}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-3 h-3 animate-spin text-slate-400 dark:text-[#8c8c8c]" />
              <span>Submitting...</span>
            </>
          ) : (
            <>
              <span>Submit Answer</span>
              <Send className="w-3 h-3 text-slate-400 dark:text-[#8c8c8c]" />
            </>
          )}
        </button>
      </div>
    </div>
  );
};
