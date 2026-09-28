'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Image as ImageIcon, Sparkles, Loader2, X, AlertCircle } from 'lucide-react';

export interface ImageGenerateCardProps {
  sessionId: string;
  initialPrompt?: string;
  onClose: () => void;
  onSuccess?: () => void;
}

const ASPECT_RATIOS = [
  { id: '1:1', label: '1:1 Square' },
  { id: '16:9', label: '16:9 Landscape' },
  { id: '9:16', label: '9:16 Portrait' },
  { id: '4:3', label: '4:3 Standard' },
  { id: '3:4', label: '3:4 Vertical' },
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
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-focus prompt input
  useEffect(() => {
    setTimeout(() => {
      textareaRef.current?.focus();
      if (initialPrompt) {
        textareaRef.current?.setSelectionRange(initialPrompt.length, initialPrompt.length);
      }
    }, 50);
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
          // If gpt-image-2.5 exists in list, keep it; otherwise pick first
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

  // Keyboard shortcut: Escape to close, Ctrl+Enter or Enter to submit
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isGenerating) {
        e.preventDefault();
        onClose();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        handleGenerate();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [prompt, selectedModel, aspectRatio, isGenerating]);

  const handleGenerate = async () => {
    if (!prompt.trim() || isGenerating) return;
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
      setErrorMsg(err.message || 'Error occurred while generating image');
      setIsGenerating(false);
    }
  };

  return (
    <div className="relative mb-3 rounded-2xl border border-purple-500/30 bg-slate-900/95 dark:bg-[#16131f]/95 backdrop-blur-md shadow-2xl p-4 transition-all animate-in fade-in slide-in-from-bottom-2 duration-200">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-purple-500/20 mb-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-400">
            <ImageIcon size={15} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-purple-200">Generate Image</span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                Direct Tool Trigger (0 AI Tokens)
              </span>
            </div>
            <p className="text-[11px] text-slate-400 dark:text-[#a09bb5]">
              Langsung generate gambar via Gateway tanpa request prompt LLM tambahan.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          disabled={isGenerating}
          className="text-slate-400 hover:text-slate-200 p-1 rounded-md hover:bg-white/5 transition cursor-pointer"
          title="Tutup (Esc)"
        >
          <X size={15} />
        </button>
      </div>

      {/* Error Alert */}
      {errorMsg && (
        <div className="mb-3 flex items-start gap-2 p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-xs">
          <AlertCircle size={14} className="shrink-0 mt-0.5" />
          <div className="flex-1">
            <strong>Gagal membuat gambar:</strong>
            <p className="mt-0.5 text-[11.5px] text-red-200">{errorMsg}</p>
          </div>
        </div>
      )}

      {/* Prompt Textarea */}
      <div className="space-y-1.5 mb-3">
        <label className="text-[11px] font-semibold text-slate-300 dark:text-[#d4cde6] flex items-center justify-between">
          <span>Prompt Gambar</span>
          <span className="text-[10px] text-slate-500 font-normal">Tekan Ctrl+Enter untuk generate</span>
        </label>
        <textarea
          ref={textareaRef}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          disabled={isGenerating}
          placeholder="Contoh: A hyperrealistic cyberpunk cat samurai wearing neon katana in rainy Tokyo alley, cinematic lighting 8k..."
          rows={3}
          className="w-full rounded-xl bg-slate-950/80 dark:bg-[#0e0b17] border border-purple-500/25 focus:border-purple-400 text-xs text-slate-100 placeholder-slate-500 p-3 outline-none resize-none transition"
        />
      </div>

      {/* Controls Grid: Model & Aspect Ratio */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        {/* Model Selector */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold text-slate-300 dark:text-[#d4cde6]">
            Model Image AI
          </label>
          <div className="relative">
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              disabled={isGenerating || isLoadingModels}
              className="w-full appearance-none rounded-lg bg-slate-950/80 dark:bg-[#0e0b17] border border-purple-500/25 text-xs text-slate-200 px-3 py-2 outline-none focus:border-purple-400 cursor-pointer pr-8 font-mono"
            >
              {availableImageModels.length > 0 ? (
                availableImageModels.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name || m.id}
                  </option>
                ))
              ) : (
                <>
                  <option value="gpt-image-2.5">gpt-image-2.5 (Aidev Gateway)</option>
                  <option value="flux">flux (Pollinations / Fal)</option>
                  <option value="turbo">turbo (SDXL Fast)</option>
                </>
              )}
            </select>
            <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-purple-400 text-xs">
              ▾
            </div>
          </div>
        </div>

        {/* Aspect Ratio Selector */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold text-slate-300 dark:text-[#d4cde6]">
            Rasio Gambar (Aspect Ratio)
          </label>
          <div className="flex items-center gap-1.5 flex-wrap">
            {ASPECT_RATIOS.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setAspectRatio(r.id)}
                disabled={isGenerating}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-mono transition cursor-pointer border ${
                  aspectRatio === r.id
                    ? 'bg-purple-500/25 border-purple-400 text-purple-200 font-semibold shadow-sm'
                    : 'bg-slate-950/60 dark:bg-[#0e0b17] border-slate-700/60 text-slate-400 hover:text-slate-200 hover:border-slate-600'
                }`}
              >
                {r.id}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Footer Controls */}
      <div className="flex items-center justify-between pt-3 border-t border-purple-500/20">
        <span className="text-[11px] text-slate-400 dark:text-[#8d87a3]">
          Hasil generate langsung tersimpan di artifacts & workspace.
        </span>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isGenerating}
            className="px-3 py-1.5 rounded-lg text-xs text-slate-300 hover:text-white hover:bg-white/5 border border-slate-700 transition cursor-pointer"
          >
            Batal (Esc)
          </button>

          <button
            type="button"
            onClick={handleGenerate}
            disabled={isGenerating || !prompt.trim()}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 shadow-md shadow-purple-900/30 transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {isGenerating ? (
              <>
                <Loader2 size={13} className="animate-spin" />
                <span>Generating...</span>
              </>
            ) : (
              <>
                <Sparkles size={13} />
                <span>Generate Image</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
