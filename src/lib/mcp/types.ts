export interface McpServerConfig {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  serverUrl?: string;
  disabled?: boolean;
  loadingMode?: 'eager' | 'lazy';
  autoApprove?: boolean;
}

export interface McpConfigFile {
  mcpServers: Record<string, McpServerConfig>;
}

export type McpServerStatus = 'CONNECTED' | 'CONNECTING' | 'ERROR' | 'DISCONNECTED';

export interface McpTool {
  serverName: string;
  name: string;
  prefixedName: string;
  description?: string;
  inputSchema: any;
  loadingMode: 'eager' | 'lazy';
}

export interface McpServerRuntimeInfo {
  name: string;
  status: McpServerStatus;
  error?: string;
  transport: 'stdio' | 'sse';
  config: McpServerConfig;
  tools: McpTool[];
  logs: string[];
  connectedAt?: number;
}
