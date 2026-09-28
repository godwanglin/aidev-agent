'use client';

import React, { useState, useEffect } from 'react';
import {
  Send,
  Check,
  AlertCircle,
  RefreshCw,
  Eye,
  EyeOff,
  Copy,
  Folder,
  Shield,
  HelpCircle,
  ExternalLink,
  Power,
  Terminal,
} from 'lucide-react';
import type { ProjectRecord } from '@/lib/db';

interface TelegramSettingsTabProps {
  projects: ProjectRecord[];
}

export const TelegramSettingsTab: React.FC<TelegramSettingsTabProps> = ({ projects }) => {
  const [enabled, setEnabled] = useState(false);
  const [botToken, setBotToken] = useState('');
  const [allowedUserIds, setAllowedUserIds] = useState('');
  const [defaultProjectId, setDefaultProjectId] = useState('');
  const [showToken, setShowToken] = useState(false);

  // Status state
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [botStatus, setBotStatus] = useState<{
    isRunning: boolean;
    botUsername?: string;
    botFirstName?: string;
    allowedUserCount: number;
    lastError?: string;
  } | null>(null);

  const [testResult, setTestResult] = useState<{
    success?: boolean;
    message?: string;
  } | null>(null);

  const [saveSuccess, setSaveSuccess] = useState(false);

  // Fetch current telegram configuration & status
  const fetchStatus = async () => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/telegram');
      if (res.ok) {
        const data = await res.json();
        setBotStatus(data);
        setEnabled(Boolean(data.enabled));
        setAllowedUserIds(data.allowedUserIds || '');
        setDefaultProjectId(data.defaultProjectId || (projects[0]?.id || ''));
      }

      // Also get raw token from settings
      const cfgRes = await fetch('/api/config');
      if (cfgRes.ok) {
        const cfgData = await cfgRes.json();
        if (cfgData?.settings?.telegramBotToken) {
          setBotToken(cfgData.settings.telegramBotToken);
        }
      }
    } catch (err) {
      console.error('Failed fetching telegram settings:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  // Test token validation
  const handleTestToken = async () => {
    if (!botToken.trim()) {
      setTestResult({ success: false, message: 'Harap masukkan Bot Token terlebih dahulu.' });
      return;
    }

    try {
      setIsTesting(true);
      setTestResult(null);
      const res = await fetch('/api/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'test', token: botToken.trim() }),
      });

      const data = await res.json();
      if (data.valid) {
        setTestResult({
          success: true,
          message: `Berhasil terhubung ke @${data.username} (${data.name})!`,
        });
      } else {
        setTestResult({
          success: false,
          message: data.error || 'Token tidak valid menurut Telegram API.',
        });
      }
    } catch (err: any) {
      setTestResult({ success: false, message: err?.message || 'Gagal menguji token.' });
    } finally {
      setIsTesting(false);
    }
  };

  // Save settings & restart bot daemon
  const handleSave = async () => {
    try {
      setIsSaving(true);
      setSaveSuccess(false);

      // 1. Save settings
      const cfgRes = await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telegramBotEnabled: enabled,
          telegramBotToken: botToken.trim(),
          telegramAllowedUserIds: allowedUserIds.trim(),
          telegramDefaultProjectId: defaultProjectId,
        }),
      });

      if (!cfgRes.ok) {
        throw new Error('Gagal menyimpan konfigurasi ke settings.json');
      }

      // 2. Restart / Reload bot
      const action = enabled ? 'restart' : 'stop';
      await fetch('/api/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });

      await fetchStatus();
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3500);
    } catch (err: any) {
      alert(`Error: ${err?.message || err}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in pr-0 sm:pr-6 pb-6 select-none">
      {/* 1. Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#222226]">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <Send className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-[17px] font-semibold text-white tracking-tight">Telegram Bot Remote Control</h2>
              <p className="text-[12px] text-[#8e8e93]">
                Kontrol Aidev Desktop dari jarak jauh melalui chat Telegram di HP atau tablet kamu.
              </p>
            </div>
          </div>
        </div>

        {/* Live Status Badge */}
        <div className="flex items-center gap-2">
          {botStatus?.isRunning ? (
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[12px] font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Online (@{botStatus.botUsername || 'Bot'})</span>
            </div>
          ) : (
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#1e1e22] border border-[#2b2b30] text-[#8e8e93] text-[12px] font-medium">
              <span className="w-2 h-2 rounded-full bg-neutral-500" />
              <span>Offline</span>
            </div>
          )}

          <button
            type="button"
            onClick={fetchStatus}
            title="Refresh Status"
            className="p-1.5 rounded-lg border border-[#2b2b30] bg-[#17171a] text-[#8e8e93] hover:text-white hover:bg-[#202024] transition cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* 2. Main Configuration Form */}
      <div className="space-y-4">
        {/* Toggle Switch Card */}
        <div className="p-4 rounded-xl bg-[#141416] border border-[#242428] flex items-center justify-between">
          <div className="space-y-0.5">
            <span className="text-[13.5px] font-medium text-white flex items-center gap-2">
              <Power className={`w-4 h-4 ${enabled ? 'text-blue-400' : 'text-[#666]'}`} />
              Enable Telegram Bot Controller
            </span>
            <p className="text-[12px] text-[#8e8e93]">
              Jalankan bot Telegram di background desktop untuk menerima instruksi remote dari HP.
            </p>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            onClick={() => setEnabled(!enabled)}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full p-0.5 transition-colors duration-200 ease-in-out focus:outline-none ${
              enabled ? 'bg-blue-600' : 'bg-[#28282d] border border-[#38383e]'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 ease-in-out ${
                enabled ? 'translate-x-4' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Bot Token Input */}
        <div className="p-4 rounded-xl bg-[#141416] border border-[#242428] space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-[13px] font-medium text-white flex items-center gap-1.5">
              <span>Telegram Bot Token</span>
              <span className="text-red-400 text-xs">*</span>
            </label>
            <a
              href="https://t.me/BotFather"
              target="_blank"
              rel="noreferrer"
              className="text-[11.5px] text-blue-400 hover:text-blue-300 flex items-center gap-1 transition"
            >
              <span>Dapatkan dari @BotFather</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type={showToken ? 'text' : 'password'}
                value={botToken}
                onChange={(e) => {
                  setBotToken(e.target.value);
                  setTestResult(null);
                }}
                placeholder="1234567890:ABCdefGhIJKlmNoPQRsTUVwxyZ..."
                className="w-full bg-[#1a1a1e] border border-[#2a2a2f] focus:border-blue-500 rounded-lg px-3 py-2 text-[13px] text-white font-mono placeholder-[#555] outline-none transition pr-10"
              />
              <button
                type="button"
                onClick={() => setShowToken(!showToken)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#777] hover:text-white transition"
              >
                {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            <button
              type="button"
              onClick={handleTestToken}
              disabled={isTesting || !botToken.trim()}
              className="px-3.5 py-2 rounded-lg bg-[#222227] hover:bg-[#2b2b32] disabled:opacity-50 text-[12.5px] font-medium text-white transition flex items-center gap-1.5 cursor-pointer shrink-0"
            >
              {isTesting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}
              <span>Test Token</span>
            </button>
          </div>

          {testResult && (
            <div
              className={`p-2.5 rounded-lg text-[12px] flex items-center gap-2 ${
                testResult.success
                  ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                  : 'bg-red-500/10 border border-red-500/20 text-red-400'
              }`}
            >
              {testResult.success ? <Check className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
              <span>{testResult.message}</span>
            </div>
          )}
        </div>

        {/* Security Whitelist: Authorized User IDs */}
        <div className="p-4 rounded-xl bg-[#141416] border border-[#242428] space-y-2.5">
          <div className="flex items-center justify-between">
            <label className="text-[13px] font-medium text-white flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-amber-400" />
              <span>Authorized Telegram User IDs</span>
              <span className="text-amber-400 text-xs">(Keamanan)</span>
            </label>
          </div>

          <p className="text-[12px] text-[#8e8e93]">
            Hanya ID Telegram ini yang diizinkan mengontrol PC kamu. Pisahkan dengan tanda koma jika lebih dari satu (contoh:{' '}
            <code className="text-blue-400 bg-blue-500/10 px-1 py-0.5 rounded">123456789, 987654321</code>).
          </p>

          <input
            type="text"
            value={allowedUserIds}
            onChange={(e) => setAllowedUserIds(e.target.value)}
            placeholder="123456789"
            className="w-full bg-[#1a1a1e] border border-[#2a2a2f] focus:border-blue-500 rounded-lg px-3 py-2 text-[13px] text-white font-mono placeholder-[#555] outline-none transition"
          />

          <div className="p-2.5 rounded-lg bg-[#18181c] border border-[#232328] text-[11.5px] text-[#888] flex items-start gap-2">
            <HelpCircle className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
            <span>
              <strong>Cara Cek ID Kamu:</strong> Kirim pesan apa saja ke bot Telegram kamu, bot otomatis menolak dan membalas nomor <strong>Chat ID kamu</strong> agar bisa kamu copy ke kolom di atas.
            </span>
          </div>
        </div>

        {/* Default Project Workspace */}
        <div className="p-4 rounded-xl bg-[#141416] border border-[#242428] space-y-2">
          <label className="text-[13px] font-medium text-white flex items-center gap-1.5">
            <Folder className="w-3.5 h-3.5 text-blue-400" />
            <span>Default Project Workspace</span>
          </label>
          <p className="text-[12px] text-[#8e8e93]">
            Project yang aktif secara otomatis saat kamu pertama kali chat dengan bot di Telegram.
          </p>

          <select
            value={defaultProjectId}
            onChange={(e) => setDefaultProjectId(e.target.value)}
            className="w-full bg-[#1a1a1e] border border-[#2a2a2f] focus:border-blue-500 rounded-lg px-3 py-2 text-[13px] text-white outline-none transition"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.workdir_path})
              </option>
            ))}
          </select>
        </div>

        {/* Save Button */}
        <div className="flex items-center justify-between pt-2">
          <div>
            {saveSuccess && (
              <span className="text-[12.5px] text-emerald-400 font-medium flex items-center gap-1.5 animate-fade-in">
                <Check className="w-4 h-4" /> Pengaturan berhasil disimpan dan bot diperbarui!
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-[13px] font-medium text-white transition flex items-center gap-2 cursor-pointer shadow-lg shadow-blue-600/20"
          >
            {isSaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}
            <span>Simpan & Terapkan</span>
          </button>
        </div>
      </div>

      {/* 3. Setup Guide in 3 Steps */}
      <div className="p-4 rounded-xl bg-[#141416]/80 border border-[#222226] space-y-3">
        <h3 className="text-[13px] font-semibold text-white flex items-center gap-2">
          <span>📖 Panduan Setup Bot Telegram (1 Menit)</span>
        </h3>
        <ol className="space-y-2 text-[12px] text-[#a0a0a5] list-decimal list-inside leading-relaxed">
          <li>
            Buka aplikasi Telegram di HP kamu, cari akun resmi <code className="text-white bg-[#222] px-1 py-0.5 rounded">@BotFather</code>.
          </li>
          <li>
            Ketik perintah <code className="text-blue-400 bg-blue-500/10 px-1 py-0.5 rounded">/newbot</code>, lalu masukkan nama bot dan username (akhiran <i>bot</i>).
          </li>
          <li>
            Copy token API yang diberikan BotFather, paste ke kolom <strong>Telegram Bot Token</strong> di atas, lalu klik <strong>Test Token</strong>.
          </li>
          <li>
            Buka bot kamu di Telegram, ketik <code className="text-white bg-[#222] px-1 py-0.5 rounded">/start</code> untuk melihat ID Telegram kamu, lalu masukkan ke kolom <strong>Authorized User IDs</strong>.
          </li>
          <li>
            Nyalakan toggle <strong>Enable</strong>, lalu klik <strong>Simpan & Terapkan</strong>. Selesai! 🎉
          </li>
        </ol>
      </div>

      {/* 4. Supported Slash Commands Reference */}
      <div className="p-4 rounded-xl bg-[#141416]/80 border border-[#222226] space-y-3">
        <h3 className="text-[13px] font-semibold text-white flex items-center gap-2">
          <Terminal className="w-4 h-4 text-emerald-400" />
          <span>Daftar Slash Commands yang Didukung:</span>
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-[12px]">
          <div className="p-2.5 rounded-lg bg-[#1a1a1e] border border-[#26262a]">
            <code className="text-blue-400 font-semibold">/menu</code>
            <p className="text-[#888] mt-0.5">Tampilkan menu interaktif & daftar command.</p>
          </div>
          <div className="p-2.5 rounded-lg bg-[#1a1a1e] border border-[#26262a]">
            <code className="text-blue-400 font-semibold">/projects</code>
            <p className="text-[#888] mt-0.5">Pilih / ganti project workspace dengan tombol Telegram.</p>
          </div>
          <div className="p-2.5 rounded-lg bg-[#1a1a1e] border border-[#26262a]">
            <code className="text-blue-400 font-semibold">/status</code>
            <p className="text-[#888] mt-0.5">Cek kondisi PC (RAM, CPU, Uptime, Model AI).</p>
          </div>
          <div className="p-2.5 rounded-lg bg-[#1a1a1e] border border-[#26262a]">
            <code className="text-blue-400 font-semibold">/image &lt;prompt&gt;</code>
            <p className="text-[#888] mt-0.5">Generate gambar di PC dan kirim foto hasilnya ke Telegram.</p>
          </div>
          <div className="p-2.5 rounded-lg bg-[#1a1a1e] border border-[#26262a]">
            <code className="text-blue-400 font-semibold">/cmd & /cmdexit</code>
            <p className="text-[#888] mt-0.5">Masuk & keluar dari Mode Terminal shell langsung dari HP.</p>
          </div>
          <div className="p-2.5 rounded-lg bg-[#1a1a1e] border border-[#26262a]">
            <code className="text-blue-400 font-semibold">/new</code>
            <p className="text-[#888] mt-0.5">Mulai sesi chat baru di project aktif.</p>
          </div>
          <div className="p-2.5 rounded-lg bg-[#1a1a1e] border border-[#26262a]">
            <code className="text-blue-400 font-semibold">/stop</code>
            <p className="text-[#888] mt-0.5">Hentikan proses turn agent yang sedang berjalan.</p>
          </div>
          <div className="p-2.5 rounded-lg bg-[#1a1a1e] border border-[#26262a]">
            <code className="text-blue-400 font-semibold">/undo</code>
            <p className="text-[#888] mt-0.5">Revert file terakhir ke snapshot sebelum diedit.</p>
          </div>
        </div>
      </div>
    </div>
  );
};
