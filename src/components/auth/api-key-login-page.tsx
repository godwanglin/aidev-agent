'use client';

import React, { useState } from 'react';
import {
  KeyRound,
  Eye,
  EyeOff,
  ArrowRight,
  Loader2,
  FileCode2,
  ClipboardPaste,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { AidevLogo } from '@/components/common/antigravity-logo';
import type { AidevSettings } from '@/lib/storage';
import type { GatewayModel } from '@/lib/gateway';

interface ApiKeyLoginPageProps {
  onLoginSuccess: (settings: AidevSettings, models?: GatewayModel[]) => void;
}

export const ApiKeyLoginPage: React.FC<ApiKeyLoginPageProps> = ({ onLoginSuccess }) => {
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isOpeningJson, setIsOpeningJson] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoToast, setInfoToast] = useState<string | null>(null);

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setApiKeyInput(text.trim());
        setErrorMsg(null);
      }
    } catch {
      // Clipboard read might be blocked if permission denied
    }
  };

  const handleOpenSettingsJson = async () => {
    try {
      setIsOpeningJson(true);
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'open-settings-file' }),
      });
      const data = await res.json();
      if (data.settingsFile) {
        setInfoToast(`Membuka ${data.settingsFile}`);
        setTimeout(() => setInfoToast(null), 4000);
      }
    } catch {
      setErrorMsg('Gagal membuka file settings.json');
    } finally {
      setIsOpeningJson(false);
    }
  };

  const handleReloadConfigFromDisk = async () => {
    try {
      setIsSubmitting(true);
      setErrorMsg(null);
      const res = await fetch('/api/config');
      const data = await res.json();
      const diskKey = data?.settings?.apiKey?.trim();
      if (diskKey) {
        const verifyRes = await fetch('/api/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'verify-api-key', apiKey: diskKey }),
        });
        const verifyData = await verifyRes.json();
        if (!verifyRes.ok || !verifyData.valid) {
          setErrorMsg(verifyData.error || 'API Key di dalam settings.json tidak valid.');
          return;
        }
        const modelsRes = await fetch('/api/models?refresh=true').catch(() => null);
        const modelsData = modelsRes ? await modelsRes.json().catch(() => null) : null;
        window.dispatchEvent(
          new CustomEvent('aidev:config-updated', {
            detail: verifyData.settings,
          })
        );
        onLoginSuccess(verifyData.settings, modelsData?.models);
      } else {
        setErrorMsg('API Key di dalam settings.json masih kosong. Silakan isi API Key terlebih dahulu.');
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Gagal memuat ulang settings.json');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = apiKeyInput.trim();
    if (!trimmed) {
      setErrorMsg('Silakan masukkan API Key terlebih dahulu.');
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMsg(null);

      // 1. Strictly validate API Key against Aidev Gateway (/v1/usage) before saving
      const verifyRes = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify-api-key', apiKey: trimmed }),
      });

      const verifyData = await verifyRes.json();
      if (!verifyRes.ok || !verifyData.valid || !verifyData.settings) {
        setErrorMsg(
          verifyData.error || 'API Key tidak valid atau tidak terdaftar. Silakan periksa kembali API Key Anda.'
        );
        return;
      }

      // 2. Refresh models list using the newly verified API key
      let loadedModels: GatewayModel[] | undefined;
      try {
        const modelsRes = await fetch('/api/models?refresh=true');
        if (modelsRes.ok) {
          const modelsData = await modelsRes.json();
          if (Array.isArray(modelsData.models)) {
            loadedModels = modelsData.models;
          }
        }
      } catch {}

      window.dispatchEvent(
        new CustomEvent('aidev:config-updated', {
          detail: verifyData.settings,
        })
      );

      onLoginSuccess(verifyData.settings, loadedModels);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Terjadi kesalahan saat memverifikasi API Key.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-[#0b0c10] text-[#e4e4e7] px-4 relative overflow-hidden select-none font-sans">
      {/* Subtle ambient radial glow */}
      <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[560px] h-[560px] rounded-full bg-blue-600/[0.06] blur-[120px]" />

      <div className="w-full max-w-[420px] relative z-10">
        {/* Main Login Card */}
        <div className="rounded-2xl bg-[#121319] border border-white/[0.08] shadow-[0_24px_80px_rgba(0,0,0,0.85)] p-6 sm:p-8 space-y-6">
          {/* Brand Header */}
          <div className="flex flex-col items-center text-center space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-[#191b24] border border-white/[0.08] flex items-center justify-center shadow-inner">
              <AidevLogo className="w-9 h-9" />
            </div>
            <div className="space-y-1">
              <h1 className="text-lg font-semibold tracking-tight text-white">
                Sign in to Aidev Desktop
              </h1>
              <p className="text-xs text-[#9ca3af] leading-relaxed max-w-[320px]">
                Masukkan API Key Anda untuk mengaktifkan AI Coding Agent dan mengakses workspace.
              </p>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-[#d4d4d8] flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-[#60a5fa]" />
                  <span>API Key</span>
                </label>
                <button
                  type="button"
                  onClick={handlePaste}
                  className="inline-flex items-center gap-1 text-[11px] text-[#9ca3af] hover:text-white transition cursor-pointer"
                  title="Tempel dari Clipboard"
                >
                  <ClipboardPaste className="w-3 h-3" />
                  <span>Paste</span>
                </button>
              </div>

              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={apiKeyInput}
                  onChange={(e) => {
                    setApiKeyInput(e.target.value);
                    if (errorMsg) setErrorMsg(null);
                  }}
                  placeholder="sk-..."
                  autoFocus
                  className="w-full bg-[#0d0e13] border border-[#272935] focus:border-[#3b82f6] rounded-xl pl-3.5 pr-10 py-2.5 text-xs font-mono text-white placeholder-[#52525b] focus:outline-none transition shadow-inner"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#71717a] hover:text-white transition cursor-pointer"
                  title={showKey ? 'Sembunyikan API Key' : 'Tampilkan API Key'}
                >
                  {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {errorMsg && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/25 text-red-300 text-xs leading-relaxed">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            {infoToast && (
              <div className="flex items-center gap-2 p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 text-xs">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="truncate">{infoToast}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting || !apiKeyInput.trim()}
              className="w-full py-2.5 px-4 rounded-xl bg-[#2563eb] hover:bg-[#1d4ed8] disabled:bg-[#1e293b] disabled:text-[#64748b] text-white text-xs font-semibold transition flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20 cursor-pointer disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Memverifikasi & Masuk...</span>
                </>
              ) : (
                <>
                  <span>Masuk ke Workspace</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Security note */}
          <div className="flex items-center justify-center gap-1.5 text-[11px] text-[#71717a]">
            <ShieldCheck className="w-3.5 h-3.5 text-[#10b981] shrink-0" />
            <span>API Key disimpan secara lokal di perangkat Anda (`~/.aidev/config/settings.json`)</span>
          </div>
        </div>

        {/* Advanced / Custom Base URL via settings.json */}
        <div className="mt-4 px-2 flex items-center justify-between text-[11px] text-[#71717a]">
          <span>Custom Base URL? Edit via konfigurasi lokal:</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleOpenSettingsJson}
              disabled={isOpeningJson}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#15161e] hover:bg-[#1e202b] border border-white/[0.07] text-[#a1a1aa] hover:text-white transition cursor-pointer"
              title="Buka ~/.aidev/config/settings.json untuk mengubah gatewayUrl"
            >
              <FileCode2 className="w-3.5 h-3.5 text-[#60a5fa]" />
              <span>Open settings.json</span>
            </button>
            <button
              type="button"
              onClick={handleReloadConfigFromDisk}
              disabled={isSubmitting}
              className="p-1 rounded-lg bg-[#15161e] hover:bg-[#1e202b] border border-white/[0.07] text-[#a1a1aa] hover:text-white transition cursor-pointer"
              title="Muat ulang dari settings.json"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
