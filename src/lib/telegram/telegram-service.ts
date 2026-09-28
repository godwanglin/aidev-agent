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
}

class TelegramBotManager {
  private bot: Bot | null = null;
  private isRunning: boolean = false;
  private botUsername?: string;
  private botFirstName?: string;
  private lastStartedAt?: number;
  private lastError?: string;
  private userStates = new Map<number, UserState>();

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
      return { valid: false, error: 'Token bot tidak boleh kosong.' };
    }

    try {
      const tempBot = new Bot(cleanToken);
      const me = await tempBot.api.getMe();
      return {
        valid: true,
        username: me.username,
        name: me.first_name,
      };
    } catch (err: any) {
      return {
        valid: false,
        error: err?.message || 'Gagal memverifikasi token ke Telegram API.',
      };
    }
  }

  /**
   * Starts the Telegram Bot long-polling daemon
   */
  public async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    const settings = loadSettings();
    if (!settings.telegramBotEnabled) {
      return;
    }

    const token = (settings.telegramBotToken || '').trim();
    if (!token) {
      this.lastError = 'Token Telegram belum diisi di Settings.';
      return;
    }

    try {
      this.bot = new Bot(token);

      // Verify connection and obtain bot metadata
      const me = await this.bot.api.getMe();
      this.botUsername = me.username;
      this.botFirstName = me.first_name;
      this.lastError = undefined;

      this.registerMiddlewaresAndHandlers(this.bot);

      // Start long-polling in background
      this.bot.start({
        onStart: (info) => {
          this.isRunning = true;
          this.lastStartedAt = Date.now();
          console.log(`[TelegramBot] Aidev Desktop bot active as @${info.username}`);
        },
      });

      this.isRunning = true;
      this.lastStartedAt = Date.now();
    } catch (err: any) {
      this.isRunning = false;
      this.lastError = err?.message || 'Gagal memulai bot Telegram.';
      console.error('[TelegramBot] Start error:', err);
    }
  }

  /**
   * Stops the running Telegram Bot instance
   */
  public async stop(): Promise<void> {
    if (!this.isRunning || !this.bot) {
      this.isRunning = false;
      return;
    }

    try {
      await this.bot.stop();
    } catch (err) {
      console.warn('[TelegramBot] Stop error:', err);
    } finally {
      this.bot = null;
      this.isRunning = false;
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
      }
    }

    return state;
  }

  private registerMiddlewaresAndHandlers(bot: Bot): void {
    // 1. Security Authorization Gatekeeper
    bot.use(async (ctx, next) => {
      const userId = ctx.from?.id;
      if (!userId) return;

      if (!this.isAuthorized(userId)) {
        const username = ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name || 'User';
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
        `• /status - Cek kondisi PC (RAM, CPU, Uptime, Model AI)\n` +
        `• /model - Pilih & ganti model AI aktif\n` +
        `• /image <prompt> - Generate gambar aset/konsep game\n` +
        `• /plan <tujuan> - Masuk interactive planning interview\n` +
        `• /new - Mulai sesi chat baru di project aktif\n` +
        `• /cmd - Masuk Mode Terminal interaktif\n` +
        `• /cmdexit - Keluar dari Mode Terminal\n` +
        `• /undo - Revert snapshot perubahan file terakhir\n` +
        `• /stop - Batalkan eksekusi agent yang sedang jalan\n\n` +
        `💬 *Atau langsung kirim pesan biasa* untuk memerintahkan AI coding di workspace kamu!`;

      await ctx.reply(text, { parse_mode: 'Markdown' });
    });

    // 3. Command /projects (Interactive Inline Keyboard)
    bot.command('projects', async (ctx) => {
      const projects = projectRepo.list();
      if (projects.length === 0) {
        await ctx.reply('⚠️ Belum ada project yang dibuat di Aidev Desktop. Buka PC kamu dan buat project terlebih dahulu.');
        return;
      }

      const state = this.getUserState(ctx.from!.id);
      const keyboard = new InlineKeyboard();

      projects.forEach((proj: any, idx: number) => {
        const isCurrent = proj.id === state.currentProjectId;
        const label = `${isCurrent ? '👉 ' : ''}${idx + 1}. ${proj.name}`;
        keyboard.text(label, `switch_proj:${proj.id}`).row();
      });

      await ctx.reply(
        `📂 *Pilih Project Workspace:*\n` +
        `Klik salah satu tombol di bawah untuk berpindah workspace:`,
        {
          parse_mode: 'Markdown',
          reply_markup: keyboard,
        }
      );
    });

    // 4. Callback Query Handler for /projects & /model
    bot.on('callback_query:data', async (ctx) => {
      const data = ctx.callbackQuery.data;
      const userId = ctx.from.id;
      const state = this.getUserState(userId);

      if (data.startsWith('switch_proj:')) {
        const projId = data.replace('switch_proj:', '');
        const proj = projectRepo.getById(projId);
        if (proj) {
          state.currentProjectId = proj.id;
          // Create or retrieve session in this project
          const settings = loadSettings();
          const newSessionId = `sess_tg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
          sessionRepo.create({
            id: newSessionId,
            project_id: proj.id,
            title: `Telegram Session (${proj.name})`,
            model_id: settings.defaultModel || 'gemini-3.8-flash-high',
            permission_mode: 'AUTO',
            created_at: Date.now(),
            updated_at: Date.now(),
          });
          state.currentSessionId = newSessionId;

          await ctx.answerCallbackQuery({ text: `Berpindah ke project ${proj.name}!` });
          await ctx.editMessageText(
            `✅ *Workspace Berhasil Dialihkan!*\n\n` +
            `📂 *Project:* \`${proj.name}\`\n` +
            `📍 *Path:* \`${proj.workdir_path}\`\n\n` +
            `Sesi baru telah dimulai. Silakan kirim instruksi coding kamu!`,
            { parse_mode: 'Markdown' }
          );
        }
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
      if (state.currentSessionId) {
        const sess = sessionRepo.getById(state.currentSessionId);
        if (sess?.model_id) activeModel = sess.model_id;
      }

      const text =
        `🖥️ *Status PC & Aidev Desktop*\n\n` +
        `💻 *OS:* ${process.platform} (${os.release()})\n` +
        `⚡ *CPU:* ${cpuModel} (${cpus.length} Cores)\n` +
        `📊 *RAM:* ${usedMem} GB / ${totalMem} GB (Free: ${freeMem} GB)\n` +
        `⏱️ *Uptime PC:* ${uptimeHours} jam\n\n` +
        `📂 *Active Project:* \`${project ? project.name : 'None'}\`\n` +
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
        await ctx.reply(`↩️ *Snapshot Reverted:*\n\`${res.message}\``, { parse_mode: 'Markdown' });
      } catch (err: any) {
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

      const waitMsg = await ctx.reply('🎨 *Sedang membuat gambar di PC lokal...*', { parse_mode: 'Markdown' });
      try {
        const result = await executeGenerateImage(
          { prompt, aspect_ratio: '1:1' },
          workdir,
          state.currentSessionId
        );

        if (result.success && fs.existsSync(result.path)) {
          await ctx.replyWithPhoto(new InputFile(result.path), {
            caption: `🎨 *Generated Image*\nPrompt: _${prompt.slice(0, 150)}_\nSaved to: \`${result.relativePath}\``,
            parse_mode: 'Markdown',
          });
          try {
            await ctx.api.deleteMessage(ctx.chat.id, waitMsg.message_id);
          } catch {}
        } else {
          await ctx.reply(`Gagal generate gambar: ${result.message}`);
        }
      } catch (err: any) {
        await ctx.reply(`Error generate gambar: ${err?.message || err}`);
      }
    });

    // 12. General Message Handler (Two-Bubble Agent Execution Engine)
    bot.on('message:text', async (ctx) => {
      const text = ctx.message.text.trim();
      if (!text || text.startsWith('/')) return;

      const state = this.getUserState(ctx.from.id);
      const project = state.currentProjectId ? projectRepo.getById(state.currentProjectId) : null;
      const workdir = project ? project.workdir_path : process.cwd();

      // If in Command/Terminal Mode
      if (state.isCmdMode) {
        const waitMsg = await ctx.reply(`⏳ *Executing:* \`${text}\`...`, { parse_mode: 'Markdown' });
        try {
          const res = await executeRunCommand({ command: text }, workdir, state.currentSessionId);
          const output = ((res.stdout || '') + (res.stderr ? '\n' + res.stderr : '')).trim() || '(No output)';
          const truncated = output.length > 3500 ? output.slice(0, 3500) + '\n...(truncated)' : output;
          await ctx.editMessageText(
            `💻 *Terminal Output (exit: ${res.exitCode}):*\n\`\`\`bash\n${truncated}\n\`\`\``,
            { parse_mode: 'Markdown' }
          );
        } catch (cmdErr: any) {
          await ctx.editMessageText(`❌ *Execution Error:*\n\`\`\`\n${cmdErr?.message || cmdErr}\n\`\`\``, {
            parse_mode: 'Markdown',
          });
        }
        return;
      }

      // Normal Agent Mode: Two-Bubble Architecture
      if (!state.currentSessionId) {
        await ctx.reply('Sesi belum siap. Ketik /new untuk memulai.');
        return;
      }

      const sessionId = state.currentSessionId;
      const activities: string[] = [];
      let isThinking = true;
      let lastEditTime = 0;
      let pendingEditTimer: any = null;
      let finalContent = '';
      let generatedImagePaths: string[] = [];

      // Create BUBBLE 1: Live Status & Activity Tracker
      const bubble1Msg = await ctx.reply(
        `🤖 *Aidev Agent Working...*\n🧠 *Thinking...*`,
        { parse_mode: 'Markdown' }
      );

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
          activities.push(`⏳ \`${toolName}\` ${target ? `(${target})` : ''}`);
          updateBubble1();
        } else if (event.type === 'tool_completed') {
          const toolName = event.data?.toolName || 'tool';
          // Find last matching activity and mark complete
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
        await orchestrator.runTurn(text);

        // Finalize BUBBLE 1
        if (pendingEditTimer) clearTimeout(pendingEditTimer);
        const durationSec = ((Date.now() - (bubble1Msg.date * 1000)) / 1000).toFixed(1);
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
          // Check last assistant message in db
          const msgs = messageRepo.listBySession(sessionId);
          const lastMsg = msgs.filter((m) => m.role === 'assistant').pop();
          finalContent = lastMsg?.content || 'Operasi berhasil diselesaikan.';
        }

        // Split long messages if exceeding Telegram 4000 char boundary
        const chunkSize = 3900;
        for (let i = 0; i < finalContent.length; i += chunkSize) {
          const chunk = finalContent.slice(i, i + chunkSize);
          try {
            await ctx.reply(chunk, { parse_mode: 'Markdown' });
          } catch {
            // Fallback without parse_mode if invalid markdown tokens
            await ctx.reply(chunk);
          }
        }

        // If turn generated images, send photos
        for (const imgPath of generatedImagePaths) {
          if (fs.existsSync(imgPath)) {
            try {
              await ctx.replyWithPhoto(new InputFile(imgPath));
            } catch {}
          }
        }
      } catch (err: any) {
        if (pendingEditTimer) clearTimeout(pendingEditTimer);
        try {
          await ctx.api.editMessageText(
            ctx.chat.id,
            bubble1Msg.message_id,
            `❌ *Gagal:* ${err?.message || err}`,
            { parse_mode: 'Markdown' }
          );
        } catch {}
      }
    });
  }
}

export const telegramBotManager = new TelegramBotManager();
