export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    try {
      const { telegramBotManager } = await import('@/lib/telegram/telegram-service');
      const { loadSettings } = await import('@/lib/storage');
      const settings = loadSettings();
      if (settings.telegramBotEnabled && settings.telegramBotToken && !telegramBotManager.getStatus().isRunning) {
        await telegramBotManager.start();
        console.log('[System] Telegram bot auto-started on server boot');
      }
    } catch (e) {
      console.error('[System] Failed to auto-start Telegram bot on boot:', e);
    }
  }
}
