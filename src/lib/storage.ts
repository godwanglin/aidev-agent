import fs from 'fs';
import path from 'path';
import os from 'os';

export interface AidevSettings {
  gatewayUrl: string;
  apiKey?: string;
  defaultModel: string;
  permissionMode: 'ASK' | 'AUTO' | 'FULL_ACCESS';
  theme: 'dark' | 'light' | 'system';
  maxTokensPerTurn: number;
  responseLanguage?: 'auto' | 'id' | 'en';
  defaultShell?: 'powershell' | 'cmd' | 'bash' | string;
  reasoningEffort?: 'low' | 'medium' | 'high';
  soundNotifications?: boolean;
  autoScrollStreaming?: boolean;
  workspaceConfinement?: boolean;
  permissionPreset?: 'auto' | 'ask' | 'full';
  commandTimeout?: number;
  queuedMessagesMode?: 'queue' | 'immediately';
  browserJsPolicy?: 'Request Review' | 'Always Proceed' | 'Disable';
  browserActuationRules?: string[];
  projectLocalPermissions?: { fileRules: string[]; networkRules: string[]; terminalRules: string[] };
  autoDiscoverSkills?: boolean;
  verboseChat?: boolean;
}

export const DEFAULT_SETTINGS: AidevSettings = {
  gatewayUrl: process.env.AIDEV_GATEWAY_URL || 'http://localhost:3000/v1',
  apiKey: process.env.AIDEV_GATEWAY_KEY || 'sk-int-testbench999900001111222233334444',
  defaultModel: 'gemini-3.8-flash-high',
  permissionMode: 'AUTO',
  theme: 'dark',
  maxTokensPerTurn: 4096,
  responseLanguage: 'auto',
  defaultShell: 'powershell',
  reasoningEffort: 'high',
  soundNotifications: true,
  autoScrollStreaming: true,
  workspaceConfinement: true,
  permissionPreset: 'auto',
  commandTimeout: 120,
  queuedMessagesMode: 'queue',
  browserJsPolicy: 'Request Review',
  browserActuationRules: ['https://github.com/*', 'https://*.google.com/*', 'https://stackoverflow.com/*'],
  projectLocalPermissions: { fileRules: ['1'], networkRules: ['4'], terminalRules: ['6'] },
  autoDiscoverSkills: true,
  verboseChat: true,
};

export function getAidevHome(): string {
  const home = process.env.USERPROFILE || process.env.HOME || os.homedir();
  return path.join(home, '.aidev');
}

export interface ChatStoragePaths {
  base: string;
  artifacts: string;
  uploads: string;
  snapshots: string;
  tasks: string;
  scripts: string;
  sandbox: string;
}

/**
 * Returns strictly isolated paths for a specific project and chat session.
 * Path: .aidev/projects/<projectId>/<chatId>/
 */
export function getChatStorage(projectId: string = 'default', chatId: string = 'default'): ChatStoragePaths {
  const root = getAidevHome();
  const safeProj = projectId || 'no_project';
  const safeChat = chatId || 'default';
  let base: string;
  if (!projectId || projectId === 'no_project' || projectId === 'default') {
    base = path.join(root, 'sandbox', 'generated', safeChat);
  } else {
    base = path.join(root, 'projects', safeProj, safeChat);
  }
  return {
    base,
    artifacts: path.join(base, 'artifacts'),
    uploads: path.join(base, 'user_uploads'),
    snapshots: path.join(base, 'snapshots'),
    tasks: path.join(base, 'tasks'),
    scripts: path.join(base, 'scripts'),
    sandbox: path.join(base, 'code-sandbox'),
  };
}

/**
 * Ensures all encapsulated subdirectories exist for a specific project and chat session.
 */
export function ensureChatStorageInitialized(projectId: string = 'default', chatId: string = 'default'): ChatStoragePaths {
  const paths = getChatStorage(projectId, chatId);
  const dirs = [
    paths.base,
    paths.artifacts,
    paths.uploads,
    paths.snapshots,
    paths.tasks,
    paths.scripts,
    paths.sandbox,
  ];

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  return paths;
}

export function getStoragePaths() {
  const root = getAidevHome();
  return {
    root,
    config: path.join(root, 'config'),
    settingsFile: path.join(root, 'config', 'settings.json'),
    keybindingsFile: path.join(root, 'config', 'keybindings.json'),
    data: path.join(root, 'data'),
    dbFile: path.join(root, 'data', 'aidev.db'),
    projects: path.join(root, 'projects'),
    projectsIndex: path.join(root, 'projects', 'index.json'),
    snapshots: path.join(root, 'snapshots'),
    artifacts: path.join(root, 'artifacts'),
    logs: path.join(root, 'logs'),
    agentLog: path.join(root, 'logs', 'agent.log'),
    commandsLog: path.join(root, 'logs', 'commands.log'),
    cache: path.join(root, 'cache'),
    modelsCache: path.join(root, 'cache', 'models.json'),
    tasks: path.join(root, 'tasks'),
  };
}

export function ensureStorageInitialized(): void {
  const paths = getStoragePaths();

  // Primary root-level directories to maintain
  const dirs = [
    paths.root,
    paths.config,
    paths.data,
    paths.projects,
    paths.logs,
    paths.cache,
  ];

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  // Ensure settings.json
  if (!fs.existsSync(paths.settingsFile)) {
    fs.writeFileSync(paths.settingsFile, JSON.stringify(DEFAULT_SETTINGS, null, 2), 'utf-8');
  }

  // Ensure keybindings.json
  if (!fs.existsSync(paths.keybindingsFile)) {
    const defaultKeybindings = {
      openCommandPalette: 'Ctrl+Shift+P',
      toggleSidebar: 'Ctrl+B',
      openTerminal: 'Ctrl+`',
      quickPlan: 'Ctrl+Shift+L',
    };
    fs.writeFileSync(paths.keybindingsFile, JSON.stringify(defaultKeybindings, null, 2), 'utf-8');
  }

  // Ensure projects/index.json
  if (!fs.existsSync(paths.projectsIndex)) {
    fs.writeFileSync(paths.projectsIndex, JSON.stringify([], null, 2), 'utf-8');
  }
}

export function loadSettings(): AidevSettings {
  ensureStorageInitialized();
  const { settingsFile } = getStoragePaths();
  try {
    const raw = fs.readFileSync(settingsFile, 'utf-8');
    const parsed = JSON.parse(raw);
    const settings: AidevSettings = { ...DEFAULT_SETTINGS, ...parsed };
    if (!settings.apiKey || settings.gatewayUrl.includes('9rt.topupin.store')) {
      settings.gatewayUrl = DEFAULT_SETTINGS.gatewayUrl;
      settings.apiKey = DEFAULT_SETTINGS.apiKey;
      settings.defaultModel = DEFAULT_SETTINGS.defaultModel;
    }
    if (settings.permissionPreset) {
      if (settings.permissionPreset === 'ask') settings.permissionMode = 'ASK';
      else if (settings.permissionPreset === 'full') settings.permissionMode = 'FULL_ACCESS';
      else settings.permissionMode = 'AUTO';
    }
    return settings;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: Partial<AidevSettings>): AidevSettings {
  ensureStorageInitialized();
  const current = loadSettings();
  const updated = { ...current, ...settings };
  if (updated.permissionPreset) {
    if (updated.permissionPreset === 'ask') updated.permissionMode = 'ASK';
    else if (updated.permissionPreset === 'full') updated.permissionMode = 'FULL_ACCESS';
    else updated.permissionMode = 'AUTO';
  }
  const { settingsFile } = getStoragePaths();
  fs.writeFileSync(settingsFile, JSON.stringify(updated, null, 2), 'utf-8');
  return updated;
}

export function logAgent(message: string, meta?: any): void {
  try {
    ensureStorageInitialized();
    const { agentLog } = getStoragePaths();
    const entry = `[${new Date().toISOString()}] ${message} ${meta ? JSON.stringify(meta) : ''}\n`;
    fs.appendFileSync(agentLog, entry, 'utf-8');
  } catch (err) {
    console.error('Failed to write to agent.log', err);
  }
}

export function logCommand(command: string, exitCode: number, durationMs: number, stdout: string, stderr: string): void {
  try {
    ensureStorageInitialized();
    const { commandsLog } = getStoragePaths();
    const entry = `[${new Date().toISOString()}] Command: "${command}" | Exit: ${exitCode} | Duration: ${durationMs}ms\n--- STDOUT ---\n${stdout}\n--- STDERR ---\n${stderr}\n--------------------\n`;
    fs.appendFileSync(commandsLog, entry, 'utf-8');
  } catch (err) {
    console.error('Failed to write to commands.log', err);
  }
}
