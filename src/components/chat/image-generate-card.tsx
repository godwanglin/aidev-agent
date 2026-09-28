'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Image as ImageIcon, Loader2, X, AlertCircle, ChevronDown, Check, Sparkles } from 'lucide-react';
import { BottomSheet } from '@/components/ui/bottom-sheet';

export interface ImageGenerateCardProps {
  sessionId: string;
  initialPrompt?: string;
  onClose: () => void;
  onSuccess?: () => void;
}

const ASPECT_RATIOS = [
  { id: '1:1', label: '1:1' },
  { id: '16:9', label: '16:9' },
  { id: '9:16', label: '9:16' },
  { id: '4:3', label: '4:3' },
  { id: '3:4', label: '3:4' },
];

export const ImageGenerateCard: React.FC<ImageGenerateCardProps> = ({
  sessionId,
  initialPrompt = '',
  onClose,
  onSuccess,
}) => {
  const [prompt, setPrompt] = useState(initialPrompt);
  const [aspectRatio, setAspectRatio] = useState('1:1');
  const [selectedModel, setSelectedModel] = useState<string>('gpt-image-2.5');
  const [availableImageModels, setAvailableImageModels] = useState<Array<{ id: string; name: string }>>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(true);
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const isGeneratingRef = useRef(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-focus prompt input
  useEffect(() => {
    const timer = setTimeout(() => {
      textareaRef.current?.focus();
      if (initialPrompt) {
        textareaRef.current?.setSelectionRange(initialPrompt.length, initialPrompt.length);
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [initialPrompt]);

  // Load available image models
  useEffect(() => {
    let isMounted = true;
    async function loadModels() {
      try {
        const res = await fetch('/api/models?type=image');
        const data = await res.json();
        if (isMounted && data.models && Array.isArray(data.models)) {
          setAvailableImageModels(data.models);
          if (data.models.length > 0) {
            const hasGptImage = data.models.some((m: any) => m.id === 'gpt-image-2.5');
            if (!hasGptImage) {
              setSelectedModel(data.models[0].id);
            }
          }
        }
      } catch (err) {
        console.error('Failed to load image models:', err);
      } finally {
        if (isMounted) setIsLoadingModels(false);
      }
    }
    loadModels();
    return () => {
      isMounted = false;
    };
  }, []);

  // Keyboard shortcut: Escape to close, Ctrl+Enter or Cmd+Enter to submit
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isGenerating && !isGeneratingRef.current) {
        if (isModelDropdownOpen) {
          setIsModelDropdownOpen(false);
          return;
        }
        e.preventDefault();
        onClose();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        if (!isGenerating && !isGeneratingRef.current) {
          handleGenerate();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [prompt, selectedModel, aspectRatio, isGenerating, isModelDropdownOpen]);

  const handleGenerate = async () => {
    if (!prompt.trim() || isGenerating || isGeneratingRef.current) return;
    isGeneratingRef.current = true;
    setErrorMsg(null);
    setIsGenerating(true);

    try {
      const res = await fetch(`/api/sessions/${sessionId}/generate-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt.trim(),
          aspect_ratio: aspectRatio,
          model: selectedModel,
        }),
      });

      const json = await res.json();
      if (!res.ok || json.error) {
        throw new Error(json.error || 'Failed to generate image');
      }

      onSuccess?.();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Terjadi kesalahan saat membuat gambar');
    } finally {
      isGeneratingRef.current = false;
      setIsGenerating(false);
    }
  };

  const selectedModelObj = availableImageModels.find((m) => m.id === selectedModel);
  const selectedModelLabel = selectedModelObj?.name || selectedModel;

  return (
    <div className="relative mb-3 rounded-xl border border-slate-200 dark:border-[#262626] bg-white dark:bg-[#161616] p-3.5 space-y-3 text-xs select-none shadow-md dark:shadow-xl font-sans transition-all animate-in fade-in slide-in-from-bottom-2 duration-150">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#262626] pb-2.5">
        <div className="flex items-center gap-2">
          <ImageIcon className="w-3.5 h-3.5 text-slate-500 dark:text-[#8c8c8c]" strokeWidth={1.75} />
          <span className="text-[12px] font-medium text-slate-800 dark:text-[#cccccc]">Generate Image</span>
        </div>

        <button
          type="button"
          onClick={onClose}
          disabled={isGenerating}
          className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-md hover:bg-slate-100 dark:hover:bg-white/[0.05] transition cursor-pointer"
          title="Tutup (Esc)"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Error Alert */}
      {errorMsg && (
        <div className="flex items-start gap-2 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-medium">Gagal membuat gambar:</span>
            <p className="mt-0.5 text-[11.5px] opacity-90">{errorMsg}</p>
          </div>
        </div>
      )}

      {/* Prompt Textarea */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-[11.5px] font-medium text-slate-700 dark:text-[#b3b3b3]">
            Prompt Gambar
          </label>
          <span className="text-[10.5px] text-slate-400 dark:text-[#666666]">
            Tekan Ctrl+Enter untuk generate
          </span>
        </div>
        <textarea
          ref={textareaRef}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          disabled={isGenerating}
          placeholder="Deskripsikan gambar yang ingin dibuat secara detail..."
          rows={3}
          className="w-full rounded-lg bg-slate-50 dark:bg-[#1a1a1a] border border-slate-200 dark:border-[#262626] focus:border-slate-400 dark:focus:border-[#444444] text-[12.5px] text-slate-900 dark:text-[#e0e0e0] placeholder-slate-400 dark:placeholder-[#666666] p-2.5 outline-none resize-none transition leading-relaxed"
        />
      </div>

      {/* Controls Grid: Model & Aspect Ratio */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Custom Dropdown Model Selector */}
        <div className="space-y-1.5">
          <label className="text-[11.5px] font-medium text-slate-700 dark:text-[#b3b3b3]">
            Model Image AI
          </label>
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setIsModelDropdownOpen(!isModelDropdownOpen)}
              disabled={isGenerating || isLoadingModels}
              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-[#1a1a1a] hover:bg-slate-100 dark:hover:bg-[#202020] border border-slate-200 dark:border-[#262626] text-[12px] text-slate-800 dark:text-[#cccccc] transition cursor-pointer select-none ${
                isModelDropdownOpen ? 'border-slate-400 dark:border-[#444444]' : ''
              }`}
            >
              <div className="flex items-center gap-1.5 min-w-0 pr-2">
                <Sparkles className="w-3.5 h-3.5 text-slate-400 dark:text-[#737373] shrink-0" />
                <span className="truncate">{selectedModelLabel}</span>
              </div>
              <ChevronDown
                className={`w-3.5 h-3.5 text-slate-400 dark:text-[#666666] shrink-0 transition-transform duration-150 ${
                  isModelDropdownOpen ? 'rotate-180 text-slate-700 dark:text-[#e0e0e0]' : ''
                }`}
              />
            </button>

            <BottomSheet
              isOpen={isModelDropdownOpen}
              onClose={() => setIsModelDropdownOpen(false)}
              title="Pilih Model Image"
              zIndex={100020}
              className="w-full sm:w-full max-h-[70vh] sm:max-h-56 overflow-y-auto sm:top-full sm:left-0 sm:mt-1 bg-white dark:bg-[#181818] border border-slate-200 dark:border-[#2a2a2a] p-1 divide-y divide-slate-100 dark:divide-[#222222] shadow-xl"
            >
              {availableImageModels.length > 0 ? (
                availableImageModels.map((m) => {
                  const isSelected = selectedModel === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        setSelectedModel(m.id);
                        setIsModelDropdownOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2 sm:py-1.5 rounded-lg text-left transition cursor-pointer ${
                        isSelected
                          ? 'bg-slate-100 dark:bg-[#252525] text-slate-900 dark:text-white font-medium'
                          : 'text-slate-700 dark:text-[#cccccc] hover:bg-slate-50 dark:hover:bg-[#202020] hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0 pr-2">
                        <Sparkles className="w-3.5 h-3.5 text-slate-400 dark:text-[#888888] shrink-0" />
                        <span className="truncate text-[12px]">{m.name || m.id}</span>
                      </div>
                      {isSelected && (
                        <Check className="w-3.5 h-3.5 text-slate-900 dark:text-white shrink-0 ml-1.5" />
                      )}
                    </button>
                  );
                })
              ) : (
                <div className="px-3 py-2 text-slate-400 dark:text-[#888888] text-[11.5px]">
                  {isLoadingModels ? 'Memuat model...' : 'Tidak ada model tersedia'}
                </div>
              )}
            </BottomSheet>
          </div>
        </div>

        {/* Aspect Ratio Selector */}
        <div className="space-y-1.5">
          <label className="text-[11.5px] font-medium text-slate-700 dark:text-[#b3b3b3]">
            Rasio Gambar (Aspect Ratio)
          </label>
          <div className="flex items-center gap-1.5 flex-wrap">
            {ASPECT_RATIOS.map((r) => {
              const isSelected = aspectRatio === r.id;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setAspectRatio(r.id)}
                  disabled={isGenerating}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-mono transition cursor-pointer border ${
                    isSelected
                      ? 'bg-slate-200 dark:bg-[#282828] border-slate-300 dark:border-[#444444] text-slate-900 dark:text-white font-medium'
                      : 'bg-slate-50/70 hover:bg-slate-100 dark:bg-[#1a1a1a] dark:hover:bg-[#1f1f1f] border-slate-200 hover:border-slate-300 dark:border-[#262626] dark:hover:border-[#333333] text-slate-600 dark:text-[#8c8c8c]'
                  }`}
                >
                  {r.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Footer Controls */}
      <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-[#262626]">
        <div className="text-[11px] text-slate-500 dark:text-[#666666] hidden sm:flex items-center gap-1 font-sans">
          <span>Press</span>
          <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 rounded text-slate-600 dark:text-[#8c8c8c]">
            Ctrl+Enter ↵
          </kbd>
          <span>to generate</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isGenerating}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-300 hover:border-slate-400 dark:text-[#8c8c8c] dark:hover:text-[#e0e0e0] dark:hover:bg-white/[0.05] dark:border-[#2a2a2a] dark:hover:border-[#383838] transition cursor-pointer"
          >
            <span>Batal</span>
          </button>

          <button
            type="button"
            onClick={handleGenerate}
            disabled={isGenerating || !prompt.trim()}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
              isGenerating || !prompt.trim()
                ? 'bg-slate-100 dark:bg-[#222222] text-slate-400 dark:text-[#666666] border border-slate-200 dark:border-[#2a2a2a] cursor-not-allowed'
                : 'bg-slate-900 hover:bg-slate-800 text-white border border-slate-800 dark:bg-[#28282e] dark:hover:bg-[#333338] dark:text-[#ffffff] dark:border-[#3a3a40] active:scale-[0.98]'
            }`}
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin text-slate-400 dark:text-[#8c8c8c]" />
                <span>Generating...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5 text-slate-300 dark:text-[#a0a0a8]" />
                <span>Generate Image</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
