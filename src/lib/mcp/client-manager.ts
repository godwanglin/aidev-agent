import fs from 'fs';
import path from 'path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { getAidevHome, getChatStorage, ensureChatStorageInitialized } from '../storage';
import { sessionRepo } from '../db';
import type {
  McpConfigFile,
  McpServerConfig,
  McpServerRuntimeInfo,
  McpServerStatus,
  McpTool,
} from './types';

interface ActiveServer {
  name: string;
  config: McpServerConfig;
  client?: Client;
  transport?: StdioClientTransport | SSEClientTransport;
  status: McpServerStatus;
  error?: string;
  tools: McpTool[];
  logs: string[];
  connectedAt?: number;
}

function normalizeCommand(cmd: string): string {
  if (process.platform === 'win32') {
    const trimmed = cmd.trim();
    const lower = trimmed.toLowerCase();
    if (['npx', 'npm', 'pnpm', 'yarn', 'uvx'].includes(lower)) {
      return `${trimmed}.cmd`;
    }
  }
  return cmd;
}

function sanitizeIdentifier(str: string): string {
  return str.replace(/[^a-zA-Z0-9_]/g, '_');
}

export class McpClientManager {
  private static instance: McpClientManager;
  private activeServers = new Map<string, ActiveServer>();
  private initialized = false;

  public static getInstance(): McpClientManager {
    if (!McpClientManager.instance) {
      McpClientManager.instance = new McpClientManager();
    }
    return McpClientManager.instance;
  }

  public getMcpDir(): string {
    const dir = path.join(getAidevHome(), 'mcp');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  public getConfigPath(): string {
    return path.join(this.getMcpDir(), 'config.json');
  }

  public loadConfig(): McpConfigFile {
    const configPath = this.getConfigPath();
    if (fs.existsSync(configPath)) {
      try {
        const raw = fs.readFileSync(configPath, 'utf-8');
        return JSON.parse(raw);
      } catch (err) {
        console.error('[MCP] Failed parsing config.json:', err);
      }
    }

    // Check compatibility with ~/.aidev/mcp/mcp_config.json
    const altPath = path.join(this.getMcpDir(), 'mcp_config.json');
    if (fs.existsSync(altPath)) {
      try {
        const raw = fs.readFileSync(altPath, 'utf-8');
        return JSON.parse(raw);
      } catch {}
    }

    // Default template
    const defaultCfg: McpConfigFile = { mcpServers: {} };
    this.saveConfig(defaultCfg);
    return defaultCfg;
  }

  public saveConfig(config: McpConfigFile): void {
    const configPath = this.getConfigPath();
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
  }

  public async init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    const config = this.loadConfig();
    const servers = config.mcpServers || {};

    for (const [name, serverConfig] of Object.entries(servers)) {
      if (serverConfig.disabled) {
        this.activeServers.set(name, {
          name,
          config: serverConfig,
          status: 'DISCONNECTED',
          tools: [],
          logs: ['Server is disabled in config.'],
        });
        continue;
      }

      this.connectServer(name, serverConfig).catch((err) => {
        console.error(`[MCP] Failed connecting to server ${name}:`, err);
      });
    }
  }

  public async connectServer(name: string, config: McpServerConfig): Promise<ActiveServer> {
    const existing = this.activeServers.get(name);
    if (existing?.client) {
      await this.disconnectServer(name);
    }

    const serverEntry: ActiveServer = {
      name,
      config,
      status: 'CONNECTING',
      tools: [],
      logs: existing?.logs || [],
    };
    this.activeServers.set(name, serverEntry);

    try {
      const client = new Client(
        { name: 'aidev-coding-agent', version: '1.0.0' },
        { capabilities: {} }
      );

      let transport: StdioClientTransport | SSEClientTransport;

      if (config.serverUrl) {
        // SSE transport
        transport = new SSEClientTransport(new URL(config.serverUrl));
      } else if (config.command) {
        // Stdio transport
        const executable = normalizeCommand(config.command);
        const args = config.args || [];
        const env = {
          ...process.env,
          ...(config.env || {}),
        };

        transport = new StdioClientTransport({
          command: executable,
          args,
          env: env as Record<string, string>,
          stderr: 'pipe',
        });

        // Capture stderr logs
        transport.stderr?.on('data', (chunk: Buffer) => {
          const text = chunk.toString('utf-8');
          serverEntry.logs.push(`[stderr] ${text.trimEnd()}`);
          if (serverEntry.logs.length > 200) serverEntry.logs.shift();
        });
      } else {
        throw new Error(`Server ${name} has neither 'command' nor 'serverUrl' specified.`);
      }

      serverEntry.client = client;
      serverEntry.transport = transport;

      // Connect with 15s timeout
      const connectPromise = client.connect(transport);
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Connection timed out after 15s')), 15000)
      );
      await Promise.race([connectPromise, timeoutPromise]);

      // Discover tools
      const toolsResult = await client.listTools();
      const rawTools = toolsResult.tools || [];

      // Determine default loadingMode: servers with > 12 tools default to lazy
      const isLazy = config.loadingMode === 'lazy' || (!config.loadingMode && rawTools.length > 12);
      const loadingMode = isLazy ? 'lazy' : 'eager';

      const serverToolsDir = path.join(this.getMcpDir(), name);
      if (!fs.existsSync(serverToolsDir)) {
        fs.mkdirSync(serverToolsDir, { recursive: true });
      }

      const mappedTools: McpTool[] = [];
      for (const t of rawTools) {
        const toolItem: McpTool = {
          serverName: name,
          name: t.name,
          prefixedName: `mcp_${sanitizeIdentifier(name)}_${sanitizeIdentifier(t.name)}`,
          description: t.description || '',
          inputSchema: t.inputSchema || { type: 'object', properties: {} },
          loadingMode,
        };
        mappedTools.push(toolItem);

        // Save schema to ~/.aidev/mcp/<serverName>/<toolName>.json (matching Antigravity architecture)
        try {
          const schemaPath = path.join(serverToolsDir, `${t.name}.json`);
          fs.writeFileSync(schemaPath, JSON.stringify(t, null, 2), 'utf-8');
        } catch (schemaErr) {
          console.error(`[MCP] Failed saving schema for tool ${t.name}:`, schemaErr);
        }
      }

      serverEntry.status = 'CONNECTED';
      serverEntry.tools = mappedTools;
      serverEntry.connectedAt = Date.now();
      serverEntry.logs.push(`[system] Connected successfully. Discovered ${mappedTools.length} tools.`);

      return serverEntry;
    } catch (err: any) {
      serverEntry.status = 'ERROR';
      serverEntry.error = err.message || String(err);
      serverEntry.logs.push(`[error] Failed to connect: ${serverEntry.error}`);
      return serverEntry;
    }
  }

  public async disconnectServer(name: string): Promise<void> {
    const server = this.activeServers.get(name);
    if (!server) return;

    try {
      if (server.client) {
        await server.client.close();
      }
    } catch {}

    server.status = 'DISCONNECTED';
    server.client = undefined;
    server.transport = undefined;
    server.tools = [];
  }

  public toRuntimeInfo(serverEntry: ActiveServer): McpServerRuntimeInfo {
    return {
      name: serverEntry.name,
      status: serverEntry.status,
      error: serverEntry.error,
      transport: serverEntry.config.serverUrl ? 'sse' : 'stdio',
      config: serverEntry.config,
      tools: serverEntry.tools || [],
      logs: serverEntry.logs || [],
      connectedAt: serverEntry.connectedAt,
    };
  }

  public getServerRuntime(name: string): McpServerRuntimeInfo | null {
    const active = this.activeServers.get(name);
    if (active) return this.toRuntimeInfo(active);
    const config = this.loadConfig();
    const serverConfig = config.mcpServers?.[name];
    if (serverConfig) {
      return {
        name,
        status: serverConfig.disabled ? 'DISCONNECTED' : 'CONNECTING',
        transport: serverConfig.serverUrl ? 'sse' : 'stdio',
        config: serverConfig,
        tools: [],
        logs: [],
      };
    }
    return null;
  }

  public async restartServer(name: string): Promise<McpServerRuntimeInfo> {
    const config = this.loadConfig();
    const serverConfig = config.mcpServers?.[name];
    if (!serverConfig) {
      throw new Error(`Server '${name}' not found in configuration.`);
    }
    await this.disconnectServer(name);
    const active = await this.connectServer(name, serverConfig);
    return this.toRuntimeInfo(active);
  }

  public async callTool(
    serverName: string,
    toolName: string,
    toolArgs: any,
    sessionId?: string
  ): Promise<{
    success: boolean;
    content: string;
    isError?: boolean;
    mediaUrl?: string;
    filename?: string;
  }> {
    let server = this.activeServers.get(serverName);

    // If server is not connected or errored, attempt one reconnect
    if (!server || server.status !== 'CONNECTED' || !server.client) {
      const config = this.loadConfig();
      const serverConfig = config.mcpServers?.[serverName];
      if (!serverConfig) {
        throw new Error(`MCP Server '${serverName}' is not configured.`);
      }
      server = await this.connectServer(serverName, serverConfig);
    }

    if (server.status !== 'CONNECTED' || !server.client) {
      throw new Error(`MCP Server '${serverName}' is currently ${server.status}: ${server.error || 'Not connected'}`);
    }

    try {
      const result = await server.client.callTool({
        name: toolName,
        arguments: toolArgs || {},
      });

      let capturedMediaUrl: string | undefined;
      let capturedFilename: string | undefined;

      const processItem = (item: any): string => {
        // 1. Check if item is an image or contains base64 image data
        const imageInfo = this.extractImage(item);
        if (imageInfo) {
          const ext = imageInfo.ext || 'png';
          const filename = `screenshot_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.${ext}`;
          capturedFilename = filename;
          capturedMediaUrl = `/api/media?file=${encodeURIComponent(filename)}`;
          if (sessionId) {
            capturedMediaUrl += `&sessionId=${encodeURIComponent(sessionId)}`;
          }

          // Persist image buffer strictly to session artifacts
          try {
            const buffer = Buffer.from(imageInfo.base64, 'base64');
            if (sessionId) {
              const session = sessionRepo.getById(sessionId);
              const projectId = session?.project_id || 'default';
              const chatStorage = ensureChatStorageInitialized(projectId, sessionId);

              fs.writeFileSync(path.join(chatStorage.artifacts, filename), buffer);

              // Register in .metadata.json for workspace overview and artifact tracking
              try {
                const metaPath = path.join(chatStorage.artifacts, '.metadata.json');
                let meta: Record<string, any> = {};
                if (fs.existsSync(metaPath)) {
                  try {
                    meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
                  } catch {}
                }
                meta[filename] = {
                  title: `Screenshot (${serverName}/${toolName})`,
                  type: 'image',
                  mimeType: imageInfo.mimeType || 'image/png',
                  updatedAt: Date.now(),
                };
                fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
              } catch (metaErr) {
                console.error('[MCP] Failed updating .metadata.json in artifacts:', metaErr);
              }
            } else {
              const mcpMediaDir = path.join(this.getMcpDir(), 'media');
              if (!fs.existsSync(mcpMediaDir)) fs.mkdirSync(mcpMediaDir, { recursive: true });
              fs.writeFileSync(path.join(mcpMediaDir, filename), buffer);
            }
          } catch (imgSaveErr) {
            console.error('[MCP] Failed saving captured image to artifacts:', imgSaveErr);
          }

          return `[Screenshot captured and saved to artifacts: ${filename}]\nMedia URL: ${capturedMediaUrl}\nMarkdown to display: ![Screenshot](${capturedMediaUrl})\n[CRITICAL NOTE TO ASSISTANT: The screenshot is already saved to session artifacts and rendered automatically as an image chip in the UI. DO NOT generate or stream raw base64 data. Simply refer to the image using the markdown link above.]`;
        }

        if (item?.type === 'text') return item.text;
        if (item?.type === 'resource') return JSON.stringify(item.resource);
        return typeof item === 'string' ? item : JSON.stringify(item);
      };

      let contentStr = '';
      if (Array.isArray(result.content)) {
        contentStr = result.content.map(processItem).join('\n');
      } else if (result.content) {
        contentStr = typeof result.content === 'object' ? processItem(result.content) : String(result.content);
      } else {
        contentStr = JSON.stringify(result);
      }

      return {
        success: !result.isError,
        content: contentStr,
        isError: Boolean(result.isError),
        mediaUrl: capturedMediaUrl,
        filename: capturedFilename,
      };
    } catch (callErr: any) {
      server.logs.push(`[error] callTool('${toolName}') failed: ${callErr.message}`);
      return {
        success: false,
        content: `MCP Tool Execution Failed: ${callErr.message}`,
        isError: true,
      };
    }
  }

  private extractImage(item: any): { base64: string; mimeType: string; ext: string } | null {
    if (!item) return null;
    if (item.type === 'image' && item.data && typeof item.data === 'string') {
      const mimeType = item.mimeType || 'image/png';
      const ext = mimeType.includes('jpeg') || mimeType.includes('jpg') ? 'jpg' : mimeType.includes('webp') ? 'webp' : 'png';
      return { base64: item.data, mimeType, ext };
    }
    if (item.type === 'text' && typeof item.text === 'string') {
      const trimmed = item.text.trim();
      const dataUrlMatch = /^data:(image\/[a-zA-Z0-9+.-]+);base64,([A-Za-z0-9+/=]+)$/s.exec(trimmed);
      if (dataUrlMatch) {
        const mimeType = dataUrlMatch[1];
        const ext = mimeType.includes('jpeg') || mimeType.includes('jpg') ? 'jpg' : mimeType.includes('webp') ? 'webp' : 'png';
        return { base64: dataUrlMatch[2], mimeType, ext };
      }
    }
    return null;
  }

  public getServersRuntime(): McpServerRuntimeInfo[] {
    const config = this.loadConfig();
    const result: McpServerRuntimeInfo[] = [];

    const allNames = new Set([
      ...Object.keys(config.mcpServers || {}),
      ...Array.from(this.activeServers.keys()),
    ]);

    for (const name of allNames) {
      const active = this.activeServers.get(name);
      const serverConfig = config.mcpServers?.[name] || active?.config || {};

      result.push({
        name,
        status: active?.status || (serverConfig.disabled ? 'DISCONNECTED' : 'CONNECTING'),
        error: active?.error,
        transport: serverConfig.serverUrl ? 'sse' : 'stdio',
        config: serverConfig,
        tools: active?.tools || [],
        logs: active?.logs || [],
        connectedAt: active?.connectedAt,
      });
    }

    return result;
  }

  public getEagerTools(): McpTool[] {
    const list: McpTool[] = [];
    for (const s of this.activeServers.values()) {
      if (s.status === 'CONNECTED') {
        for (const t of s.tools) {
          if (t.loadingMode === 'eager') {
            list.push(t);
          }
        }
      }
    }
    return list;
  }

  public getLazyTools(): McpTool[] {
    const list: McpTool[] = [];
    for (const s of this.activeServers.values()) {
      if (s.status === 'CONNECTED') {
        for (const t of s.tools) {
          if (t.loadingMode === 'lazy') {
            list.push(t);
          }
        }
      }
    }
    return list;
  }

  public findTool(toolNameOrPrefixed: string): { serverName: string; tool: McpTool; isLazy: boolean } | null {
    for (const s of this.activeServers.values()) {
      for (const t of s.tools) {
        if (t.prefixedName === toolNameOrPrefixed || t.name === toolNameOrPrefixed) {
          return { serverName: s.name, tool: t, isLazy: t.loadingMode === 'lazy' };
        }
      }
    }
    return null;
  }

  public async addOrUpdateServer(name: string, serverConfig: McpServerConfig): Promise<McpServerRuntimeInfo> {
    const config = this.loadConfig();
    if (!config.mcpServers) config.mcpServers = {};
    config.mcpServers[name] = serverConfig;
    this.saveConfig(config);

    if (serverConfig.disabled) {
      await this.disconnectServer(name);
      const entry: ActiveServer = {
        name,
        config: serverConfig,
        status: 'DISCONNECTED',
        tools: [],
        logs: ['Server disabled by user.'],
      };
      this.activeServers.set(name, entry);
      return this.toRuntimeInfo(entry);
    }

    return this.restartServer(name);
  }

  public async deleteServer(name: string): Promise<void> {
    await this.disconnectServer(name);
    this.activeServers.delete(name);

    const config = this.loadConfig();
    if (config.mcpServers && config.mcpServers[name]) {
      delete config.mcpServers[name];
      this.saveConfig(config);
    }

    // Clean up cached tool schemas folder
    try {
      const serverToolsDir = path.join(this.getMcpDir(), name);
      if (fs.existsSync(serverToolsDir)) {
        fs.rmSync(serverToolsDir, { recursive: true, force: true });
      }
    } catch {}
  }
}

export const mcpClientManager = McpClientManager.getInstance();
