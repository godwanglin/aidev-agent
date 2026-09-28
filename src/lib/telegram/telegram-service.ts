import os from 'os';
import path from 'path';
import fs from 'fs';
import { Bot, InlineKeyboard, InputFile } from 'grammy';
import { loadSettings, getStoragePaths, ensureStorageInitialized } from '../storage';
import { projectRepo, sessionRepo, messageRepo, snapshotRepo } from '../db';
import { AgentOrchestrator, AgentEvent, abortSessionOrchestrator, isSessionOrchestratorRunning } from '../orchestrator';
import { executeRunCommand } from '../tools/run-command';
import { executeGenerateImage } from '../tools/generate-image';
import { revertSnapshot } from '../snapshot';
import { getAvailableModels } from '../gateway';
import { sessionEventBus } from '../session-bus';

export interface TelegramLogEntry {
  id: string;
  timestamp: number;
  level: 'info' | 'warn' | 'error' | 'cmd';
  message: string;
  details?: string;
}

export interface TelegramBotStatus {
  isRunning: boolean;
  botUsername?: string;
  botFirstName?: string;
  allowedUserCount: number;
  lastStartedAt?: number;
  lastError?: string;
}

interface UserState {
  currentProjectId?: string;
  currentSessionId?: string;
  isCmdMode?: boolean;
  trackedMessageIds?: number[];
}

function formatTimeAgo(timestamp: number): string {
  if (!timestamp) return 'baru saja';
  const diff = Math.max(0, Date.now() - timestamp);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'baru saja';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

class TelegramBotManager {
  private bot: Bot | null = null;
  private isRunning: boolean = false;
  private isStarting: boolean = false;
  private botUsername?: string;
  private botFirstName?: string;
  private lastStartedAt?: number;
  private lastError?: string;
  private userStates = new Map<number, UserState>();
  private logs: TelegramLogEntry[] = [];
  private readonly maxLogs: number = 300;

  public async renderProjectsPicker(ctx: any, edit = false): Promise<void> {
    const projects = projectRepo.list();
    if (projects.length === 0) {
      const msg = '⚠️ Belum ada project yang dibuat di Aidev Desktop. Buka PC kamu dan buat project terlebih dahulu.';
      if (edit && ctx.callbackQuery?.message) {
        try {
          await ctx.editMessageText(msg);
          return;
        } catch {}
      }
      await ctx.reply(msg);
      return;
    }

    const state = this.getUserState(ctx.from!.id);
    const keyboard = new InlineKeyboard();

    projects.forEach((proj: any, idx: number) => {
      const isCurrent = proj.id === state.currentProjectId;
      const label = `${isCurrent ? '👉 ' : ''}${idx + 1}. ${proj.name}`;
      keyboard.text(label, `switch_proj:${proj.id}`).row();
    });

    const body =
      `📂 *Pilih Project Workspace:*\n` +
      `Klik salah satu project di bawah untuk melihat & memilih sesi chat:`;

    if (edit && ctx.callbackQuery?.message) {
      try {
        await ctx.editMessageText(body, {
          parse_mode: 'Markdown',
          reply_markup: keyboard,
        });
        return;
      } catch {}
    }

    const sent = await ctx.reply(body, {
      parse_mode: 'Markdown',
      reply_markup: keyboard,
    });
    this.trackMsgId(state, sent.message_id);
  }

  public async renderSessionPicker(ctx: any, projectId: string, edit = false): Promise<void> {
    const project = projectRepo.getById(projectId);
    if (!project) {
      await ctx.reply('⚠️ Project tidak ditemukan.');
      return;
    }

    const state = this.getUserState(ctx.from!.id);
    const sessions = sessionRepo.list(projectId);
    const keyboard = new InlineKeyboard();

    let currentSessTitle = 'Belum Ada';
    if (state.currentSessionId) {
      const cur = sessionRepo.getById(state.currentSessionId);
      if (cur) currentSessTitle = cur.title || cur.id;
    }

    if (sessions.length > 0) {
      // Show top 8 most recent sessions
      sessions.slice(0, 8).forEach((sess) => {
        let title = (sess.title || 'Untitled Session').trim();
        if (title.length > 24) {
          title = title.substring(0, 24) + '...';
        }
        const timeAgo = formatTimeAgo(sess.updated_at || sess.created_at);
        const isCurrent = sess.id === state.currentSessionId;
        const label = `${isCurrent ? '👉 ' : ''}${title} (${timeAgo})`;
        keyboard.text(label, `switch_sess:${sess.id}`).row();
      });
    }

    // Add Action Buttons
    keyboard.text('➕ Mulai Sesi Baru (+)', `new_sess:${projectId}`).row();
    keyboard.text('📁 Ganti Project Workspace', 'open_projects').row();

    const text =
      `💬 *Pilih Sesi Chat di ${project.name}:*\n\n` +
      `📂 *Workspace:* \`${project.workdir_path}\`\n` +
      `📌 *Sesi Aktif:* \`${currentSessTitle}\`\n\n` +
      (sessions.length > 0
        ? `_Klik salah satu sesi di bawah untuk langsung masuk ke sesi tersebut:_`
        : `_Belum ada sesi di project ini. Klik tombol di bawah untuk membuat sesi pertama:_`);

    if (edit && ctx.callbackQuery?.message) {
      try {
        await ctx.editMessageText(text, {
          parse_mode: 'Markdown',
          reply_markup: keyboard,
        });
        return;
      } catch {}
    }

    const sent = await ctx.reply(text, {
      parse_mode: 'Markdown',
      reply_markup: keyboard,
    });
    this.trackMsgId(state, sent.message_id);
  }

  public trackMsgId(state: UserState, msgId: number): void {
    if (!state.trackedMessageIds) {
      state.trackedMessageIds = [];
    }
    state.trackedMessageIds.push(msgId);
    if (state.trackedMessageIds.length > 250) {
      state.trackedMessageIds.splice(0, state.trackedMessageIds.length - 250);
    }
  }

  public log(level: 'info' | 'warn' | 'error' | 'cmd', message: string, details?: string): void {
    const entry: TelegramLogEntry = {
      id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: Date.now(),
      level,
      message,
      details,
    };
    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.splice(0, this.logs.length - this.maxLogs);
    }
    console.log(`[TelegramBot][${level.toUpperCase()}] ${message}${details ? ' - ' + details : ''}`);
  }

  public getLogs(limit: number = 100): TelegramLogEntry[] {
    return this.logs.slice(-limit);
  }

  public clearLogs(): void {
    this.logs = [];
    this.log('info', 'Log riwayat aktivitas Telegram bot dibersihkan.');
  }

  public getStatus(): TelegramBotStatus {
    const settings = loadSettings();
    const allowed = (settings.telegramAllowedUserIds || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    return {
      isRunning: this.isRunning,
      botUsername: this.botUsername,
      botFirstName: this.botFirstName,
      allowedUserCount: allowed.length,
      lastStartedAt: this.lastStartedAt,
      lastError: this.lastError,
    };
  }

  /**
   * Tests a bot token against Telegram API without running polling
   */
  public async testToken(token: string): Promise<{ valid: boolean; username?: string; name?: string; error?: string }> {
    const cleanToken = token.trim();
    if (!cleanToken) {
      this.log('warn', 'Uji token dibatalkan: token kosong.');
      return { valid: false, error: 'Token bot tidak boleh kosong.' };
    }

    try {
      this.log('info', 'Menguji koneksi token bot ke Telegram API...');
      const tempBot = new Bot(cleanToken);
      const me = await tempBot.api.getMe();
      this.log('info', `Uji token berhasil! Bot terverifikasi: @${me.username} (${me.first_name})`);
      return {
        valid: true,
        username: me.username,
        name: me.first_name,
      };
    } catch (err: any) {
      const errMsg = err?.message || 'Gagal memverifikasi token ke Telegram API.';
      this.log('error', `Uji token gagal: ${errMsg}`);
      return {
        valid: false,
        error: errMsg,
      };
    }
  }

  /**
   * Starts the Telegram Bot long-polling daemon
   */
  public async start(): Promise<void> {
    if (this.isRunning || this.isStarting) {
      return;
    }

    const settings = loadSettings();
    if (!settings.telegramBotEnabled) {
      return;
    }

    const token = (settings.telegramBotToken || '').trim();
    if (!token) {
      this.lastError = 'Token Telegram belum diisi di Settings.';
      this.log('warn', 'Gagal start: Telegram bot token belum diisi.');
      return;
    }

    this.isStarting = true;

    // Clean up any lingering previous bot instance before creating a new one
    if (this.bot) {
      try {
        await this.bot.stop();
      } catch {}
      this.bot = null;
    }

    try {
      this.log('info', 'Inisialisasi bot Grammy instance...');
      this.bot = new Bot(token);

      // Verify connection and obtain bot metadata
      const me = await this.bot.api.getMe();
      this.botUsername = me.username;
      this.botFirstName = me.first_name;
      this.lastError = undefined;

      // Auto-register native Telegram slash commands menu popup
      try {
        await this.bot.api.setMyCommands([
          { command: 'menu', description: 'Tampilkan menu navigasi & slash commands' },
          { command: 'projects', description: 'Pilih / ganti workspace project' },
          { command: 'sessions', description: 'Pilih & masuk sesi chat di project aktif' },
          { command: 'status', description: 'Cek kondisi PC (RAM, CPU, Uptime, Model AI)' },
          { command: 'cmd', description: 'Masuk Mode Terminal shell interaktif' },
          { command: 'cmdexit', description: 'Keluar dari Mode Terminal' },
          { command: 'new', description: 'Mulai sesi chat baru di project aktif' },
          { command: 'image', description: 'Generate gambar di PC lokal' },
          { command: 'plan', description: 'Interview & perencanaan arsitektur' },
          { command: 'model', description: 'Pilih & ganti foundation model AI' },
          { command: 'undo', description: 'Revert snapshot perubahan file terakhir' },
          { command: 'cls', description: 'Bersihkan tampilan chat di Telegram' },
          { command: 'stop', description: 'Batalkan eksekusi agent yang aktif' },
        ]);
        this.log('info', 'Command menu Telegram berhasil diregistrasikan otomatis ke Telegram API.');
      } catch (cmdRegErr: any) {
        this.log('warn', `Gagal register bot commands ke Telegram: ${cmdRegErr?.message || cmdRegErr}`);
      }

      this.registerMiddlewaresAndHandlers(this.bot);

      // Register catch handler so any unhandled error inside update processing NEVER terminates the polling loop
      this.bot.catch((err) => {
        const errorMsg = err.error instanceof Error ? err.error.message : String(err.error || err);
        this.log('error', `Bot runtime error caught: ${errorMsg}`);
        console.error('[TelegramBot] Global error caught:', err);
      });

      this.log('info', `Memulai background polling service untuk @${me.username}...`);

      // Start long-polling in background with robust rejection handler
      this.bot
        .start({
          onStart: (info) => {
            this.isRunning = true;
            this.isStarting = false;
            this.lastStartedAt = Date.now();
            this.log('info', `🟢 Bot aktif & polling berjalan sebagai @${info.username} (${info.first_name})`);
          },
        })
        .catch((err: any) => {
          this.isRunning = false;
          this.isStarting = false;
          const errMsg = err?.message || String(err);
          const isConflict = errMsg.includes('409') || errMsg.includes('terminated by other getUpdates');
          if (isConflict) {
            this.log('warn', `Polling Telegram dihentikan karena instance bot lain sedang berjalan (409 Conflict).`);
          } else {
            this.log('error', `Polling Telegram terhenti: ${errMsg}`);
          }
          this.lastError = errMsg;
        });

      this.isRunning = true;
      this.isStarting = false;
      this.lastStartedAt = Date.now();
    } catch (err: any) {
      this.isRunning = false;
      this.isStarting = false;
      this.lastError = err?.message || 'Gagal memulai bot Telegram.';
      this.log('error', `Gagal memulai bot: ${this.lastError}`);
      console.error('[TelegramBot] Start error:', err);
    }
  }

  /**
   * Stops the running Telegram Bot instance
   */
  public async stop(): Promise<void> {
    this.isStarting = false;
    if (!this.isRunning && !this.bot) {
      this.isRunning = false;
      return;
    }

    try {
      this.log('info', 'Menghentikan polling bot Telegram...');
      if (this.bot) {
        await this.bot.stop();
      }
      this.log('info', '🔴 Bot Telegram berhasil dinonaktifkan.');
    } catch (err: any) {
      this.log('warn', `Peringatan saat menghentikan bot: ${err?.message || err}`);
      console.warn('[TelegramBot] Stop error:', err);
    } finally {
      this.bot = null;
      this.isRunning = false;
      this.isStarting = false;
    }
  }

  /**
   * Restarts the bot with updated settings
   */
  public async restart(): Promise<void> {
    await this.stop();
    await this.start();
  }

  private isAuthorized(userId: number): boolean {
    const settings = loadSettings();
    const raw = settings.telegramAllowedUserIds || '';
    if (!raw.trim()) {
      return false; // Strict by default: requires at least 1 whitelist ID
    }

    const allowed = raw
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    return allowed.includes(String(userId));
  }

  private getUserState(userId: number): UserState {
    let state = this.userStates.get(userId);
    if (!state) {
      state = {};
      this.userStates.set(userId, state);
    }

    // Ensure state has valid active project and session
    const settings = loadSettings();
    const projects = projectRepo.list();

    if (!state.currentProjectId) {
      if (settings.telegramDefaultProjectId && projects.some((p: any) => p.id === settings.telegramDefaultProjectId)) {
        state.currentProjectId = settings.telegramDefaultProjectId;
      } else if (projects.length > 0) {
        state.currentProjectId = projects[0].id;
      }
    }

    if (!state.currentSessionId && state.currentProjectId) {
      const projSessions = sessionRepo.list(state.currentProjectId);
      if (projSessions.length > 0) {
        state.currentSessionId = projSessions[0].id;
      } else {
        const newId = `sess_tg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        sessionRepo.create({
          id: newId,
          project_id: state.currentProjectId,
          title: 'Telegram Remote Session',
          model_id: settings.defaultModel || 'gemini-3.8-flash-high',
          permission_mode: 'AUTO',
          created_at: Date.now(),
          updated_at: Date.now(),
        });
        state.currentSessionId = newId;
        sessionEventBus.broadcast('global', {
          type: 'sessions_updated',
          data: { projectId: state.currentProjectId, sessionId: newId },
        });
      }
    }

    return state;
  }

  private registerMiddlewaresAndHandlers(bot: Bot): void {
    // 1. Security Authorization Gatekeeper & Message Tracker
    bot.use(async (ctx, next) => {
      const userId = ctx.from?.id;
      if (!userId) return;

      const state = this.getUserState(userId);
      if (ctx.message?.message_id) {
        this.trackMsgId(state, ctx.message.message_id);
      }

      if (!this.isAuthorized(userId)) {
        const username = ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name || 'User';
        this.log('warn', `Akses ditolak: User ID ${userId} (${username}) belum di-whitelist.`);
        await ctx.reply(
          `⛔ *Access Denied — Aidev Security Guard*\n\n` +
          `Halo ${username}! Akun Telegram kamu belum diotorisasi untuk mengontrol Aidev Desktop di PC ini.\n\n` +
          `🆔 *Chat/User ID kamu:* \`${userId}\`\n\n` +
          `💡 *Cara Mengaktifkan:*\n` +
          `1. Buka aplikasi *Aidev Desktop* di PC kamu.\n` +
          `2. Buka *Settings* ⚙️ -> Tab *Telegram Bot*.\n` +
          `3. Masukkan ID \`${userId}\` ke dalam kolom *Authorized User IDs* lalu simpan.`,
          { parse_mode: 'Markdown' }
        );
        return;
      }

      await next();
    });

    // 2. Command /start & /menu
    bot.command(['start', 'menu', 'help'], async (ctx) => {
      const state = this.getUserState(ctx.from!.id);
      const project = state.currentProjectId ? projectRepo.getById(state.currentProjectId) : null;
      const projName = project ? project.name : 'Belum Dipilih';

      const text =
        `⚡ *Aidev Desktop Remote Controller*\n` +
        `Asisten AI Coding otonom berjalan langsung di PC kamu!\n\n` +
        `📂 *Project Aktif:* \`${projName}\`\n` +
        `💻 *Terminal Mode:* ${state.isCmdMode ? '🟢 Aktif' : '⚪ Nonaktif'}\n\n` +
        `🛠️ *Daftar Perintah (Slash Commands):*\n` +
        `• /menu - Tampilkan menu ini\n` +
        `• /projects - Pilih / ganti workspace project (Inline Buttons)\n` +
        `• /sessions - Pilih sesi chat di project aktif\n` +
        `• /status - Cek kondisi PC (RAM, CPU, Uptime, Model AI)\n` +
        `• /model - Pilih & ganti model AI aktif\n` +
        `• /image <prompt> - Generate gambar aset/konsep game\n` +
        `• /plan <tujuan> - Masuk interactive planning interview\n` +
        `• /new - Mulai sesi chat baru di project aktif\n` +
        `• /cmd - Masuk Mode Terminal interaktif\n` +
        `• /cmdexit - Keluar dari Mode Terminal\n` +
        `• /undo - Revert snapshot perubahan file terakhir\n` +
        `• /cls - Bersihkan riwayat chat di layar Telegram\n` +
        `• /stop - Batalkan eksekusi agent yang sedang jalan\n\n` +
        `💬 *Atau langsung kirim pesan biasa* untuk memerintahkan AI coding di workspace kamu!`;

      const msg = await ctx.reply(text, { parse_mode: 'Markdown' });
      this.trackMsgId(state, msg.message_id);
    });

    // 3. Command /projects (Interactive Inline Keyboard)
    bot.command('projects', async (ctx) => {
      this.log('cmd', `User ${ctx.from!.id} membuka daftar project (/projects)`);
      await this.renderProjectsPicker(ctx);
    });

    // 3.5. Command /sessions & /chat (Interactive Session Switcher)
    bot.command(['sessions', 'chat', 'session'], async (ctx) => {
      const state = this.getUserState(ctx.from!.id);
      if (!state.currentProjectId) {
        await ctx.reply('⚠️ Pilih project terlebih dahulu dengan /projects');
        return;
      }
      this.log('cmd', `User ${ctx.from!.id} membuka daftar sesi (/sessions)`);
      await this.renderSessionPicker(ctx, state.currentProjectId);
    });

    // 4. Callback Query Handler for /projects, /sessions, & /model
    bot.on('callback_query:data', async (ctx) => {
      const data = ctx.callbackQuery.data;
      const userId = ctx.from.id;
      const state = this.getUserState(userId);

      if (data.startsWith('switch_proj:')) {
        const projId = data.replace('switch_proj:', '');
        const proj = projectRepo.getById(projId);
        if (proj) {
          state.currentProjectId = proj.id;
          // Set default session if current session is not in this project
          const curSess = state.currentSessionId ? sessionRepo.getById(state.currentSessionId) : null;
          if (!curSess || curSess.project_id !== proj.id) {
            const projSessions = sessionRepo.list(proj.id);
            if (projSessions.length > 0) {
              state.currentSessionId = projSessions[0].id;
            }
          }

          await ctx.answerCallbackQuery({ text: `Project: ${proj.name}` });
          this.log('info', `User ${userId} memilih project ${proj.name}`);
          // Instantly pop up the session picker for this project
          await this.renderSessionPicker(ctx, proj.id, true);
        }
      } else if (data.startsWith('switch_sess:')) {
        const sessId = data.replace('switch_sess:', '');
        const sess = sessionRepo.getById(sessId);
        if (sess) {
          state.currentSessionId = sess.id;
          state.currentProjectId = sess.project_id;
          const proj = projectRepo.getById(sess.project_id);

          await ctx.answerCallbackQuery({ text: `Masuk: ${sess.title}` });
          this.log('info', `User ${userId} masuk ke sesi "${sess.title}" (${sess.id})`);
          await ctx.editMessageText(
            `✅ *Berpindah ke Sesi Chat!*\n\n` +
            `📌 *Sesi:* \`${sess.title || sess.id}\`\n` +
            `📂 *Project:* \`${proj ? proj.name : 'Unknown'}\`\n` +
            `🧠 *Model:* \`${sess.model_id || 'Default'}\`\n\n` +
            `Konteks percakapan siap dilanjutkan dari Telegram! Kirim pesan biasa untuk mulai coding. 🚀`,
            { parse_mode: 'Markdown' }
          );
        }
      } else if (data.startsWith('new_sess:')) {
        const projId = data.replace('new_sess:', '');
        const proj = projectRepo.getById(projId);
        const settings = loadSettings();
        const newSessionId = `sess_tg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        sessionRepo.create({
          id: newSessionId,
          project_id: projId,
          title: `Telegram Session (${new Date().toLocaleTimeString()})`,
          model_id: settings.defaultModel || 'gemini-3.8-flash-high',
          permission_mode: 'AUTO',
          created_at: Date.now(),
          updated_at: Date.now(),
        });
        state.currentProjectId = projId;
        state.currentSessionId = newSessionId;
        sessionEventBus.broadcast('global', {
          type: 'sessions_updated',
          data: { projectId: projId, sessionId: newSessionId },
        });

        await ctx.answerCallbackQuery({ text: 'Sesi baru dibuat!' });
        this.log('info', `User ${userId} membuat sesi baru: ${newSessionId} di project ${proj?.name}`);
        await ctx.editMessageText(
          `✨ *Sesi Baru Dimulai!*\n\n` +
          `📂 *Project:* \`${proj?.name}\`\n` +
          `📌 *ID Sesi:* \`${newSessionId}\`\n\n` +
          `Konteks baru telah dibuat. Silakan kirim pesan atau instruksi coding kamu!`,
          { parse_mode: 'Markdown' }
        );
      } else if (data === 'open_projects') {
        await ctx.answerCallbackQuery();
        await this.renderProjectsPicker(ctx, true);
      } else if (data.startsWith('set_model:')) {
        const modelId = data.replace('set_model:', '');
        if (state.currentSessionId) {
          sessionRepo.update(state.currentSessionId, { model_id: modelId });
        }
        await ctx.answerCallbackQuery({ text: `Model diubah ke ${modelId}!` });
        await ctx.editMessageText(
          `🧠 *Model AI Berhasil Diubah!*\n\n` +
          `Sekarang menggunakan model: \`${modelId}\``,
          { parse_mode: 'Markdown' }
        );
      }
    });

    // 5. Command /status
    bot.command('status', async (ctx) => {
      const state = this.getUserState(ctx.from!.id);
      const project = state.currentProjectId ? projectRepo.getById(state.currentProjectId) : null;
      const totalMem = (os.totalmem() / (1024 * 1024 * 1024)).toFixed(1);
      const freeMem = (os.freemem() / (1024 * 1024 * 1024)).toFixed(1);
      const usedMem = ((os.totalmem() - os.freemem()) / (1024 * 1024 * 1024)).toFixed(1);
      const uptimeHours = (os.uptime() / 3600).toFixed(1);
      const cpus = os.cpus();
      const cpuModel = cpus.length > 0 ? cpus[0].model.trim() : 'Unknown CPU';
      const settings = loadSettings();

      let activeModel = settings.defaultModel;
      let activeSessionTitle = 'None';
      if (state.currentSessionId) {
        const sess = sessionRepo.getById(state.currentSessionId);
        if (sess) {
          activeSessionTitle = sess.title || sess.id;
          if (sess.model_id) activeModel = sess.model_id;
        }
      }

      const text =
        `🖥️ *Status PC & Aidev Desktop*\n\n` +
        `💻 *OS:* ${process.platform} (${os.release()})\n` +
        `⚡ *CPU:* ${cpuModel} (${cpus.length} Cores)\n` +
        `📊 *RAM:* ${usedMem} GB / ${totalMem} GB (Free: ${freeMem} GB)\n` +
        `⏱️ *Uptime PC:* ${uptimeHours} jam\n\n` +
        `📂 *Active Project:* \`${project ? project.name : 'None'}\`\n` +
        `💬 *Active Session:* \`${activeSessionTitle}\`\n` +
        `📁 *Workspace Path:* \`${project ? project.workdir_path : '-'}\`\n` +
        `🧠 *Active Model:* \`${activeModel}\`\n` +
        `🟢 *Bot Service:* Active & Connected`;

      await ctx.reply(text, { parse_mode: 'Markdown' });
    });

    // 6. Command /model (Select Model via Buttons)
    bot.command('model', async (ctx) => {
      try {
        const models = await getAvailableModels();
        const keyboard = new InlineKeyboard();
        models.slice(0, 8).forEach((m) => {
          keyboard.text(m.name || m.id, `set_model:${m.id}`).row();
        });

        await ctx.reply(
          `🧠 *Pilih Foundation Model AI:*\n` +
          `Pilih model untuk sesi chat aktif kamu:`,
          {
            parse_mode: 'Markdown',
            reply_markup: keyboard,
          }
        );
      } catch (err: any) {
        await ctx.reply(`Gagal memuat daftar model: ${err?.message || err}`);
      }
    });

    // 7. Command /cmd & /cmdexit (Terminal Mode)
    bot.command('cmd', async (ctx) => {
      const state = this.getUserState(ctx.from!.id);
      state.isCmdMode = true;
      const project = state.currentProjectId ? projectRepo.getById(state.currentProjectId) : null;
      this.log('cmd', `User ${ctx.from!.id} mengaktifkan Terminal Mode di: ${project?.workdir_path || process.cwd()}`);

      await ctx.reply(
        `💻 *Mode Terminal Aktif!*\n\n` +
        `Setiap pesan yang kamu kirim sekarang akan langsung dieksekusi sebagai shell command di:\n` +
        `📂 \`${project?.workdir_path || process.cwd()}\`\n\n` +
        `_Contoh: \`git status\`, \`npm test\`, \`node -v\`_\n` +
        `Ketik /cmdexit untuk kembali ke mode Agent AI.`,
        { parse_mode: 'Markdown' }
      );
    });

    bot.command('cmdexit', async (ctx) => {
      const state = this.getUserState(ctx.from!.id);
      state.isCmdMode = false;
      this.log('cmd', `User ${ctx.from!.id} keluar dari Terminal Mode`);
      await ctx.reply('🔙 *Keluar dari Mode Terminal.* Sekarang kembali ke mode Agent AI!', { parse_mode: 'Markdown' });
    });

    // 8. Command /new (Reset Session)
    bot.command('new', async (ctx) => {
      const state = this.getUserState(ctx.from!.id);
      if (!state.currentProjectId) {
        await ctx.reply('Pilih project terlebih dahulu dengan /projects');
        return;
      }

      const proj = projectRepo.getById(state.currentProjectId);
      const settings = loadSettings();
      const newSessionId = `sess_tg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      sessionRepo.create({
        id: newSessionId,
        project_id: state.currentProjectId,
        title: `Telegram Session (${new Date().toLocaleTimeString()})`,
        model_id: settings.defaultModel || 'gemini-3.8-flash-high',
        permission_mode: 'AUTO',
        created_at: Date.now(),
        updated_at: Date.now(),
      });
      state.currentSessionId = newSessionId;
      sessionEventBus.broadcast('global', {
        type: 'sessions_updated',
        data: { projectId: state.currentProjectId, sessionId: newSessionId },
      });
      this.log('info', `User ${ctx.from!.id} membuat sesi baru: ${newSessionId} di project ${proj?.name}`);

      await ctx.reply(
        `✨ *Sesi Baru Dimulai!*\n` +
        `Project: \`${proj?.name}\`\n` +
        `ID Sesi: \`${newSessionId}\`\n\n` +
        `Konteks percakapan telah di-reset. Silakan beri instruksi baru!`,
        { parse_mode: 'Markdown' }
      );
    });

    // 9. Command /stop & /cancel
    bot.command(['stop', 'cancel'], async (ctx) => {
      const state = this.getUserState(ctx.from!.id);
      if (state.currentSessionId && isSessionOrchestratorRunning(state.currentSessionId)) {
        abortSessionOrchestrator(state.currentSessionId);
        this.log('warn', `User ${ctx.from!.id} membatalkan turn aktif di session ${state.currentSessionId}`);
        await ctx.reply('🛑 *Eksekusi turn agent berhasil dihentikan!*', { parse_mode: 'Markdown' });
      } else {
        await ctx.reply('ℹ️ Tidak ada proses agent yang sedang berjalan.');
      }
    });

    // 10. Command /undo (Snapshot Revert)
    bot.command('undo', async (ctx) => {
      const state = this.getUserState(ctx.from!.id);
      if (!state.currentProjectId) {
        await ctx.reply('Pilih project terlebih dahulu dengan /projects');
        return;
      }
      const proj = projectRepo.getById(state.currentProjectId);
      if (!proj || !state.currentSessionId) return;

      try {
        const snaps = snapshotRepo.listBySession(state.currentSessionId);
        if (snaps.length === 0) {
          await ctx.reply('ℹ️ Belum ada snapshot perubahan file di sesi ini.');
          return;
        }

        const latestSnap = snaps[snaps.length - 1];
        const res = await revertSnapshot(latestSnap.id, proj.workdir_path);
        this.log('info', `User ${ctx.from!.id} revert snapshot ${latestSnap.id}: ${res.message}`);
        await ctx.reply(`↩️ *Snapshot Reverted:*\n\`${res.message}\``, { parse_mode: 'Markdown' });
      } catch (err: any) {
        this.log('error', `User ${ctx.from!.id} gagal revert snapshot: ${err?.message || err}`);
        await ctx.reply(`Gagal me-revert: ${err?.message || err}`);
      }
    });

    // 11. Command /image <prompt>
    bot.command('image', async (ctx) => {
      const prompt = (ctx.match || '').trim();
      if (!prompt) {
        await ctx.reply('Kasih prompt gambarnya lek. Contoh: `/image cute cyber samurai girl in A-pose`', { parse_mode: 'Markdown' });
        return;
      }

      const state = this.getUserState(ctx.from!.id);
      const project = state.currentProjectId ? projectRepo.getById(state.currentProjectId) : null;
      const workdir = project ? project.workdir_path : process.cwd();

      this.log('info', `User ${ctx.from!.id} generate image: "${prompt}"`);
      const waitMsg = await ctx.reply('🎨 *Sedang membuat gambar di PC lokal...*', { parse_mode: 'Markdown' });
      try {
        const result = await executeGenerateImage(
          { prompt, aspect_ratio: '1:1' },
          workdir,
          state.currentSessionId
        );

        if (result.success && fs.existsSync(result.path)) {
          this.log('info', `Generate image sukses: ${result.path}`);
          await ctx.replyWithPhoto(new InputFile(result.path), {
            caption: `🎨 *Generated Image*\nPrompt: _${prompt.slice(0, 150)}_\nSaved to: \`${result.relativePath}\``,
            parse_mode: 'Markdown',
          });
          try {
            await ctx.api.deleteMessage(ctx.chat.id, waitMsg.message_id);
          } catch {}
        } else {
          this.log('warn', `Generate image gagal: ${result.message}`);
          await ctx.reply(`Gagal generate gambar: ${result.message}`);
        }
      } catch (err: any) {
        this.log('error', `Error generate image: ${err?.message || err}`);
        await ctx.reply(`Error generate gambar: ${err?.message || err}`);
      }
    });

    // 12. Command /plan <goal>
    bot.command('plan', async (ctx) => {
      const match = (ctx.match || '').trim();
      const promptText = match ? `/plan ${match}` : '/plan Buat rencana implementasi fitur secara komprehensif';
      this.log('cmd', `User ${ctx.from!.id} menjalankan /plan: "${promptText}"`);
      await this.executeAgentTurn(ctx, promptText);
    });

    // 13. Command /cls & /clear (Clear chat screen in Telegram)
    bot.command(['cls', 'clear'], async (ctx) => {
      const state = this.getUserState(ctx.from!.id);
      this.log('cmd', `User ${ctx.from!.id} membersihkan tampilan chat Telegram (/cls)`);

      const currentMsgId = ctx.message?.message_id;
      const idSet = new Set<number>(state.trackedMessageIds || []);
      if (currentMsgId) {
        idSet.add(currentMsgId);
        // Also sweep back up to 80 message IDs from currentMsgId to catch older messages
        for (let i = 0; i <= 80; i++) {
          const candidate = currentMsgId - i;
          if (candidate > 0) idSet.add(candidate);
        }
      }

      const idsToDelete = Array.from(idSet).sort((a, b) => b - a);

      // Delete in batches of 50
      for (let i = 0; i < idsToDelete.length; i += 50) {
        const batch = idsToDelete.slice(i, i + 50);
        try {
          if (typeof ctx.api.deleteMessages === 'function') {
            await ctx.api.deleteMessages(ctx.chat.id, batch);
          } else {
            throw new Error('Fallback to single delete');
          }
        } catch {
          // Fallback to individual deletions
          await Promise.allSettled(
            batch.map((id) => ctx.api.deleteMessage(ctx.chat.id, id).catch(() => {}))
          );
        }
      }

      state.trackedMessageIds = [];

      try {
        const cleanMsg = await ctx.reply(
          `🧹 *Layar Chat Dibersihkan!* (/cls)\n\n` +
          `Pesan sebelumnya telah dihapus dari layar Telegram agar rapi kembali.\n` +
          `_Catatan: Riwayat percakapan sesi tetap tersimpan aman di SQLite desktop._\n` +
          `Ketik /menu untuk bantuan atau langsung kirim pesan baru!`,
          { parse_mode: 'Markdown' }
        );
        this.trackMsgId(state, cleanMsg.message_id);
      } catch {
        const cleanMsg = await ctx.reply('🧹 Layar chat Telegram berhasil dibersihkan.');
        this.trackMsgId(state, cleanMsg.message_id);
      }
    });

    // 14. General Message Handler (Two-Bubble Agent Execution Engine)
    bot.on('message:text', async (ctx) => {
      const text = ctx.message.text.trim();
      if (!text || text.startsWith('/')) return;

      const state = this.getUserState(ctx.from.id);
      const project = state.currentProjectId ? projectRepo.getById(state.currentProjectId) : null;
      const workdir = project ? project.workdir_path : process.cwd();

      // If in Command/Terminal Mode
      if (state.isCmdMode) {
        this.log('cmd', `[Terminal] Menerima command dari ${ctx.from.id}: "${text}" (dir: ${workdir})`);
        let waitMsg: any = null;
        try {
          waitMsg = await ctx.reply(`⏳ *Executing:* \`${text}\`...`, { parse_mode: 'Markdown' });
        } catch {
          waitMsg = await ctx.reply(`⏳ Executing: ${text}...`);
        }
        if (waitMsg?.message_id) {
          this.trackMsgId(state, waitMsg.message_id);
        }

        try {
          const res = await executeRunCommand({ command: text }, workdir, state.currentSessionId);
          const stdout = (res.stdout || '').trim();
          const stderr = (res.stderr || '').trim();
          let output = '';
          if (stdout && stderr) {
            output = `${stdout}\n\n[stderr]\n${stderr}`;
          } else {
            output = stdout || stderr || '(No output)';
          }
          const truncated = output.length > 3500 ? output.slice(0, 3500) + '\n...(truncated)' : output;
          this.log('cmd', `[Terminal] Selesai "${text}" (exit code: ${res.exitCode}, durasi: ${res.durationMs}ms)`);

          const replyText = `💻 *Terminal Output (exit: ${res.exitCode}):*\n\`\`\`\n${truncated}\n\`\`\``;
          try {
            await ctx.api.editMessageText(ctx.chat.id, waitMsg.message_id, replyText, {
              parse_mode: 'Markdown',
            });
          } catch {
            await ctx.api.editMessageText(
              ctx.chat.id,
              waitMsg.message_id,
              `💻 Terminal Output (exit: ${res.exitCode}):\n\n${truncated}`
            );
          }
        } catch (cmdErr: any) {
          const errMsg = cmdErr?.message || String(cmdErr);
          this.log('error', `[Terminal] Error eksekusi "${text}": ${errMsg}`);
          try {
            await ctx.api.editMessageText(
              ctx.chat.id,
              waitMsg.message_id,
              `❌ *Execution Error:*\n\`\`\`\n${errMsg}\n\`\`\``,
              { parse_mode: 'Markdown' }
            );
          } catch {
            await ctx.api.editMessageText(ctx.chat.id, waitMsg.message_id, `❌ Execution Error:\n${errMsg}`);
          }
        }
        return;
      }

      // Normal Agent Mode
      await this.executeAgentTurn(ctx, text);
    });
  }

  /**
   * Executes an AI Agent turn with Two-Bubble Streaming Architecture
   */
  private async executeAgentTurn(ctx: any, promptText: string): Promise<void> {
    const state = this.getUserState(ctx.from.id);
    const project = state.currentProjectId ? projectRepo.getById(state.currentProjectId) : null;
    const workdir = project ? project.workdir_path : process.cwd();

    if (!state.currentSessionId) {
      this.log('warn', `User ${ctx.from.id} mengirim instruksi tapi sesi belum aktif`);
      await ctx.reply('Sesi belum siap. Ketik /new untuk memulai.');
      return;
    }

    const sessionId = state.currentSessionId;
    this.log('info', `Memulai Agent Turn di session ${sessionId}: "${promptText.slice(0, 60)}"`);

    const activities: string[] = [];
    let isThinking = true;
    let lastEditTime = 0;
    let pendingEditTimer: any = null;
    let finalContent = '';
    const generatedImagePaths: string[] = [];

    // Create BUBBLE 1: Live Status & Activity Tracker
    const bubble1Msg = await ctx.reply(
      `🤖 *Aidev Agent Working...*\n🧠 *Thinking...*`,
      { parse_mode: 'Markdown' }
    );
    if (bubble1Msg?.message_id) {
      this.trackMsgId(state, bubble1Msg.message_id);
    }

    const updateBubble1 = async (force: boolean = false) => {
      const now = Date.now();
      // Respect Telegram edit message rate-limit (1 per second)
      if (!force && now - lastEditTime < 1100) {
        if (!pendingEditTimer) {
          pendingEditTimer = setTimeout(() => {
            pendingEditTimer = null;
            updateBubble1(false);
          }, 1200 - (now - lastEditTime));
        }
        return;
      }

      lastEditTime = now;
      let body = `🤖 *Aidev Agent Working...*\n`;
      if (isThinking) {
        body += `🧠 *Thinking...*\n\n`;
      } else {
        body += `\n`;
      }

      if (activities.length > 0) {
        body += `⚙️ *Activity:*\n` + activities.slice(-6).join('\n');
      }

      try {
        await ctx.api.editMessageText(ctx.chat.id, bubble1Msg.message_id, body, {
          parse_mode: 'Markdown',
        });
      } catch {}
    };

    const sendEvent = (event: AgentEvent) => {
      if (event.type === 'reasoning_delta') {
        isThinking = true;
        updateBubble1();
      } else if (event.type === 'tool_start') {
        isThinking = false;
        const toolName = event.data?.toolName || 'tool';
        const args = event.data?.args || {};
        let target = args.path || args.file || args.query || args.command || args.prompt || '';
        if (typeof target === 'string' && target.length > 30) {
          target = target.slice(0, 30) + '...';
        }
        this.log('info', `Tool dipanggil: ${toolName} ${target}`);
        activities.push(`⏳ \`${toolName}\` ${target ? `(${target})` : ''}`);
        updateBubble1();
      } else if (event.type === 'tool_completed') {
        const toolName = event.data?.toolName || 'tool';
        this.log('info', `Tool selesai: ${toolName}`);
        for (let i = activities.length - 1; i >= 0; i--) {
          if (activities[i].startsWith('⏳') && activities[i].includes(toolName)) {
            activities[i] = activities[i].replace('⏳', '✅');
            break;
          }
        }
        if (toolName === 'generate_image' && event.data?.result?.path) {
          generatedImagePaths.push(event.data.result.path);
        }
        updateBubble1();
      } else if (event.type === 'content_delta') {
        isThinking = false;
        finalContent += event.data?.delta || '';
      }
    };

    try {
      const orchestrator = new AgentOrchestrator(sessionId, workdir, sendEvent);
      await orchestrator.runTurn(promptText);

      // Finalize BUBBLE 1
      if (pendingEditTimer) clearTimeout(pendingEditTimer);
      const durationSec = ((Date.now() - (bubble1Msg.date * 1000)) / 1000).toFixed(1);
      this.log('info', `Agent turn selesai (${activities.length} tools dalam ${durationSec}s)`);

      try {
        await ctx.api.editMessageText(
          ctx.chat.id,
          bubble1Msg.message_id,
          `✅ *Selesai!* (${activities.length} tools dijalankan dalam ${durationSec}s)`,
          { parse_mode: 'Markdown' }
        );
      } catch {}

      // Send BUBBLE 2: Final Response in clean Markdown
      if (!finalContent.trim()) {
        const msgs = messageRepo.listBySession(sessionId);
        const lastMsg = msgs.filter((m) => m.role === 'assistant').pop();
        finalContent = lastMsg?.content || 'Operasi berhasil diselesaikan.';
      }

      // Split long messages if exceeding Telegram 4000 char boundary
      const chunkSize = 3900;
      for (let i = 0; i < finalContent.length; i += chunkSize) {
        const chunk = finalContent.slice(i, i + chunkSize);
        let chunkMsg: any = null;
        try {
          chunkMsg = await ctx.reply(chunk, { parse_mode: 'Markdown' });
        } catch {
          // Fallback without parse_mode if invalid markdown tokens
          chunkMsg = await ctx.reply(chunk);
        }
        if (chunkMsg?.message_id) {
          this.trackMsgId(state, chunkMsg.message_id);
        }
      }

      // If turn generated images, send photos
      for (const imgPath of generatedImagePaths) {
        if (fs.existsSync(imgPath)) {
          try {
            const photoMsg = await ctx.replyWithPhoto(new InputFile(imgPath));
            if (photoMsg?.message_id) {
              this.trackMsgId(state, photoMsg.message_id);
            }
          } catch {}
        }
      }
    } catch (err: any) {
      if (pendingEditTimer) clearTimeout(pendingEditTimer);
      const errMsg = err?.message || String(err);
      this.log('error', `Agent turn error: ${errMsg}`);
      try {
        await ctx.api.editMessageText(
          ctx.chat.id,
          bubble1Msg.message_id,
          `❌ *Gagal:* ${errMsg}`,
          { parse_mode: 'Markdown' }
        );
      } catch {}
    }
  }
}

const globalForTelegram = globalThis as unknown as {
  telegramBotManager?: TelegramBotManager;
};

export const telegramBotManager =
  globalForTelegram.telegramBotManager || new TelegramBotManager();

globalForTelegram.telegramBotManager = telegramBotManager;
