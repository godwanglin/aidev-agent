'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Trash2, Info, Edit3, X } from 'lucide-react';

export interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string | null;
  variant?: 'danger' | 'warning' | 'info' | 'primary';
  isPrompt?: boolean;
  defaultValue?: string;
  inputPlaceholder?: string;
  onConfirm: (value?: string) => void;
  onCancel: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'danger',
  isPrompt = false,
  defaultValue = '',
  inputPlaceholder = '',
  onConfirm,
  onCancel,
}) => {
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [inputValue, setInputValue] = useState(defaultValue);

  useEffect(() => {
    if (isOpen) {
      setInputValue(defaultValue);
    }
  }, [isOpen, defaultValue]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        onConfirm(isPrompt ? inputValue : undefined);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    setTimeout(() => {
      if (isPrompt) {
        inputRef.current?.focus();
        inputRef.current?.select();
      } else {
        confirmButtonRef.current?.focus();
      }
    }, 50);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onConfirm, onCancel, isPrompt, inputValue]);

  if (!isOpen || typeof document === 'undefined') return null;

  const isDanger = variant === 'danger';
  const isWarning = variant === 'warning';

  return createPortal(
    <div
      onClick={onCancel}
      className="fixed inset-0 z-[999999] bg-black/65 backdrop-blur-sm flex items-center justify-center p-4 select-none animate-fade-in font-sans"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[420px] rounded-2xl bg-[#17171a] border border-[#2b2b30] shadow-2xl p-5 overflow-hidden animate-modal-in"
      >
        {/* Top bar with icon and close button */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
                isPrompt
                  ? 'bg-blue-500/10 border-blue-500/20 text-blue-400'
                  : isDanger
                  ? 'bg-red-500/10 border-red-500/20 text-red-400'
                  : isWarning
                  ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                  : 'bg-blue-500/10 border-blue-500/20 text-blue-400'
              }`}
            >
              {isPrompt ? (
                <Edit3 className="w-5 h-5" />
              ) : isDanger ? (
                <Trash2 className="w-5 h-5" />
              ) : isWarning ? (
                <AlertTriangle className="w-5 h-5" />
              ) : (
                <Info className="w-5 h-5" />
              )}
            </div>

            <div>
              <h3 className="text-[15px] font-semibold text-[#dededf] tracking-tight">
                {title}
              </h3>
            </div>
          </div>

          <button
            type="button"
            onClick={onCancel}
            className="p-1 rounded-lg text-[#7e7e85] hover:text-[#dededf] hover:bg-[#232328] transition cursor-pointer"
            title="Close (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Message body */}
        <div className="mt-3.5 pl-[52px]">
          {message && (
            <p className="text-[13px] text-[#98989e] leading-relaxed mb-3 whitespace-pre-wrap">
              {message}
            </p>
          )}

          {isPrompt && (
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={inputPlaceholder}
              className="w-full px-3 py-2 rounded-lg bg-[#0e0e11] border border-[#2b2b30] focus:border-[#3b82f6] text-[13px] text-[#dededf] outline-none transition"
            />
          )}
        </div>

        {/* Action Buttons */}
        <div className="mt-6 flex items-center justify-end gap-2.5">
          {Boolean(cancelText) && (
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 rounded-xl bg-[#202024] hover:bg-[#28282e] border border-[#2e2e35] text-[13px] font-medium text-[#c4c4c8] hover:text-[#dededf] transition cursor-pointer shadow-sm active:scale-95"
            >
              {cancelText}
            </button>
          )}

          <button
            ref={confirmButtonRef}
            type="button"
            onClick={() => onConfirm(isPrompt ? inputValue : undefined)}
            className={`px-4 py-2 rounded-xl text-[13px] font-medium text-white shadow-sm transition cursor-pointer active:scale-95 ${
              isDanger
                ? 'bg-[#de5555] hover:bg-[#c94444] border border-red-500/30'
                : isWarning
                ? 'bg-[#e58e26] hover:bg-[#cc7a1e] border border-amber-500/30'
                : 'bg-[#007acc] hover:bg-[#0069b3] border border-blue-500/30'
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
