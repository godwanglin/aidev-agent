'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Server,
  Plus,
  RefreshCw,
  Trash2,
  Terminal,
  Code,
  Check,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Edit2,
  Play,
  Square,
  Shield,
  Zap,
  FileCode,
  X,
  Copy,
  Sparkles,
} from 'lucide-react';
import type { McpServerRuntimeInfo, McpServerConfig, McpConfigFile } from '@/lib/mcp/types';
import { useConfirm } from '@/context/confirm-context';
import { McpStoreView } from './mcp-store-view';
import type { McpCatalogItem } from '@/lib/mcp/catalog';

// Sleek iOS/Antigravity-styled compact toggle switch (matches settings-modal.tsx)
const ToggleSwitch: React.FC<{
  checked: boolean;
  onChange: (val: boolean) => void;
  ariaLabel?: string;
}> = ({ checked, onChange, ariaLabel }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={ariaLabel}
    onClick={() => onChange(!checked)}
    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full p-0.5 transition-colors duration-200 ease-in-out focus:outline-none ${
      checked ? 'bg-blue-600' : 'bg-[#28282d] border border-[#38383e]'
    }`}
  >
    <span
      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 ease-in-out ${
        checked ? 'translate-x-4' : 'translate-x-0'
      }`}
    />
  </button>
);


function parseArgs(raw: string): string[] {
  const regex = /[^\s"']+|"([^"]*)"|'([^']*)'/g;
  const args: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(raw)) !== null) {
    if (match[1] !== undefined) {
      args.push(match[1]);
    } else if (match[2] !== undefined) {
      args.push(match[2]);
    } else {
      args.push(match[0]);
    }
  }
  return args;
}

export const McpSettingsTab: React.FC = () => {
  const { alert: customAlert, confirm: customConfirm } = useConfirm();
  const [servers, setServers] = useState<McpServerRuntimeInfo[]>([]);
  const [rawConfig, setRawConfig] = useState<string>('{}');
  const [viewMode, setViewMode] = useState<'cards' | 'json' | 'marketplace'>('cards');
  const [installingServerId, setInstallingServerId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Modals & Panels
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [editingServerName, setEditingServerName] = useState<string | null>(null);
  const [logsServerName, setLogsServerName] = useState<string | null>(null);
  const [serverLogs, setServerLogs] = useState<string[]>([]);
  const [expandedToolsServer, setExpandedToolsServer] = useState<string | null>(null);

  // Dropdown States in Modal
  const [openLoadingModeDropdown, setOpenLoadingModeDropdown] = useState(false);

  // Refs for click outside
  const loadingModeDropdownRef = useRef<HTMLDivElement>(null);

  // Form State for Add / Edit
  const [formName, setFormName] = useState('');
  const [formTransport, setFormTransport] = useState<'stdio' | 'sse'>('stdio');
  const [formCommand, setFormCommand] = useState('npx');
  const [formArgs, setFormArgs] = useState('-y @modelcontextprotocol/server-github');
  const [formServerUrl, setFormServerUrl] = useState('');
  const [formEnv, setFormEnv] = useState<Array<{ key: string; value: string }>>([
    { key: '', value: '' },
  ]);
  const [formLoadingMode, setFormLoadingMode] = useState<'eager' | 'lazy'>('eager');
  const [formAutoApprove, setFormAutoApprove] = useState(false);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (loadingModeDropdownRef.current && !loadingModeDropdownRef.current.contains(e.target as Node)) {
        setOpenLoadingModeDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch servers & config
  const fetchServers = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/mcp/servers');
      const data = await res.json();
      if (data.success) {
        setServers(data.servers || []);
        setRawConfig(JSON.stringify(data.rawConfig || { mcpServers: {} }, null, 2));
      } else {
        setErrorMessage(data.error || 'Failed loading MCP servers');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed connecting to MCP API');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchServers();
  }, []);

  // Restart single server
  const handleRestartServer = async (name: string) => {
    try {
      const res = await fetch(`/api/mcp/servers/${encodeURIComponent(name)}/restart`, {
        method: 'POST',
      });
      const data = await res.json();
      if (data.success) {
        await fetchServers();
      } else {
        await customAlert({
          title: 'MCP Server',
          message: `Failed restarting ${name}: ${data.error}`,
          variant: 'danger',
        });
      }
    } catch (err: any) {
      await customAlert({
        title: 'MCP Server',
        message: `Error restarting server: ${err.message}`,
        variant: 'danger',
      });
    }
  };

  // Toggle server active/disabled
  const handleToggleServer = async (server: McpServerRuntimeInfo) => {
    const updatedConfig: McpServerConfig = {
      ...server.config,
      disabled: !server.config.disabled,
    };
    try {
      const res = await fetch('/api/mcp/servers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: server.name, config: updatedConfig }),
      });
      const data = await res.json();
      if (data.success) {
        await fetchServers();
      }
    } catch (err) {
      console.error('Failed toggling server status:', err);
    }
  };

  // Toggle autoApprove for server
  const handleToggleAutoApprove = async (server: McpServerRuntimeInfo) => {
    const updatedConfig: McpServerConfig = {
      ...server.config,
      autoApprove: !server.config.autoApprove,
    };
    try {
      const res = await fetch('/api/mcp/servers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: server.name, config: updatedConfig }),
      });
      const data = await res.json();
      if (data.success) {
        await fetchServers();
      }
    } catch (err) {
      console.error('Failed updating auto-approve:', err);
    }
  };

  // Toggle loading mode (eager vs lazy)
  const handleToggleLoadingMode = async (server: McpServerRuntimeInfo) => {
    const nextMode = server.config.loadingMode === 'lazy' ? 'eager' : 'lazy';
    const updatedConfig: McpServerConfig = {
      ...server.config,
      loadingMode: nextMode,
    };
    try {
      const res = await fetch('/api/mcp/servers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: server.name, config: updatedConfig }),
      });
      const data = await res.json();
      if (data.success) {
        await fetchServers();
      }
    } catch (err) {
      console.error('Failed updating loading mode:', err);
    }
  };

  // Delete server
  const handleDeleteServer = async (name: string) => {
    const ok = await customConfirm({
      title: 'Remove MCP Server',
      message: `Are you sure you want to remove MCP server "${name}"?`,
      confirmText: 'Remove',
      cancelText: 'Cancel',
      variant: 'danger',
    });
    if (!ok) return;

    try {
      const res = await fetch(`/api/mcp/servers?name=${encodeURIComponent(name)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        await fetchServers();
      } else {
        await customAlert({
          title: 'MCP Server',
          message: `Failed deleting server: ${data.error}`,
          variant: 'danger',
        });
      }
    } catch (err: any) {
      await customAlert({
        title: 'MCP Server',
        message: `Error: ${err.message}`,
        variant: 'danger',
      });
    }
  };

  // View server stderr logs
  const handleViewLogs = async (name: string) => {
    setLogsServerName(name);
    try {
      const res = await fetch(`/api/mcp/servers/${encodeURIComponent(name)}/logs`);
      const data = await res.json();
      if (data.success) {
        setServerLogs(data.logs || []);
      }
    } catch {
      setServerLogs(['Failed fetching server logs.']);
    }
  };

  // Open Edit Modal
  const handleOpenEdit = (server: McpServerRuntimeInfo) => {
    setEditingServerName(server.name);
    setFormName(server.name);
    const cfg = server.config;
    setFormTransport(cfg.serverUrl ? 'sse' : 'stdio');
    setFormCommand(cfg.command || 'npx');
    setFormArgs((cfg.args || []).join(' '));
    setFormServerUrl(cfg.serverUrl || '');

    const envPairs = Object.entries(cfg.env || {}).map(([key, value]) => ({ key, value }));
    setFormEnv(envPairs.length > 0 ? envPairs : [{ key: '', value: '' }]);
    setFormLoadingMode(cfg.loadingMode === 'lazy' ? 'lazy' : 'eager');
    setFormAutoApprove(Boolean(cfg.autoApprove));
    setOpenLoadingModeDropdown(false);
    setShowAddModal(true);
  };

  // Open Add Modal
  const handleOpenAdd = () => {
    setEditingServerName(null);
    setFormName('');
    setFormTransport('stdio');
    setFormCommand('npx');
    setFormArgs('');
    setFormServerUrl('');
    setFormEnv([{ key: '', value: '' }]);
    setFormLoadingMode('eager');
    setFormAutoApprove(false);
    setOpenLoadingModeDropdown(false);
    setShowAddModal(true);
  };

  // Install or configure from Catalog
  const handleInstallFromCatalog = async (item: McpCatalogItem) => {
    const hasRequiredEnv = item.env && item.env.some((e) => !e.value);
    if (hasRequiredEnv || (!item.command && !item.serverUrl)) {
      setFormName(item.id);
      setFormTransport(item.transport);
      setFormCommand(item.command || 'npx');
      setFormArgs(item.args || '');
      setFormServerUrl(item.serverUrl || '');
      setFormEnv(item.env && item.env.length > 0 ? item.env : [{ key: '', value: '' }]);
      setFormLoadingMode(item.loadingMode || 'eager');
      setFormAutoApprove(false);
      setEditingServerName(null);
      setOpenLoadingModeDropdown(false);
      setShowAddModal(true);
      return;
    }

    setInstallingServerId(item.id);
    try {
      const newConfig: McpServerConfig = {
        loadingMode: item.loadingMode || 'eager',
        autoApprove: false,
        disabled: false,
      };

      if (item.transport === 'sse') {
        newConfig.serverUrl = item.serverUrl;
      } else {
        newConfig.command = item.command || 'npx';
        newConfig.args = parseArgs(item.args || '');
        if (item.env && item.env.length > 0) {
          const envObj: Record<string, string> = {};
          for (const ev of item.env) {
            if (ev.key.trim()) envObj[ev.key.trim()] = ev.value;
          }
          if (Object.keys(envObj).length > 0) newConfig.env = envObj;
        }
      }

      const res = await fetch('/api/mcp/servers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: item.id, config: newConfig }),
      });
      const data = await res.json();
      if (data.success) {
        await fetchServers();
        customAlert({
          title: 'MCP Server Installed',
          message: `Successfully installed "${item.name}". The server is now ready.`,
          variant: 'primary',
        });
      } else {
        customAlert({
          title: 'MCP Server',
          message: data.error || 'Failed to install MCP server',
          variant: 'info',
        });
      }
    } catch (err: any) {
      customAlert({
        title: 'MCP Server',
        message: err.message || 'Failed to install MCP server',
        variant: 'info',
      });
    } finally {
      setInstallingServerId(null);
    }
  };

  // Save Add / Edit Form
  const handleSaveForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) return;

    setIsSaving(true);
    const envObj: Record<string, string> = {};
    for (const item of formEnv) {
      if (item.key.trim()) {
        envObj[item.key.trim()] = item.value;
      }
    }

    const newConfig: McpServerConfig = {
      loadingMode: formLoadingMode,
      autoApprove: formAutoApprove,
    };

    if (formTransport === 'sse') {
      newConfig.serverUrl = formServerUrl.trim();
    } else {
      newConfig.command = formCommand.trim();
      newConfig.args = parseArgs(formArgs);
      if (Object.keys(envObj).length > 0) {
        newConfig.env = envObj;
      }
    }

    try {
      const res = await fetch('/api/mcp/servers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: formName.trim(), config: newConfig }),
      });
      const data = await res.json();
      if (data.success) {
        setShowAddModal(false);
        await fetchServers();
      } else {
        await customAlert({
          title: 'MCP Server',
          message: `Failed saving server: ${data.error}`,
          variant: 'danger',
        });
      }
    } catch (err: any) {
      await customAlert({
        title: 'MCP Server',
        message: `Error saving server: ${err.message}`,
        variant: 'danger',
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Save Raw JSON Config
  const handleSaveRawJson = async () => {
    try {
      const parsed = JSON.parse(rawConfig);
      setIsSaving(true);
      const res = await fetch('/api/mcp/servers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawConfig: parsed }),
      });
      const data = await res.json();
      if (data.success) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 2500);
        await fetchServers();
      } else {
        await customAlert({
          title: 'MCP Server Config',
          message: `Failed saving config: ${data.error}`,
          variant: 'danger',
        });
      }
    } catch (parseErr: any) {
      await customAlert({
        title: 'Invalid JSON',
        message: `Invalid JSON format: ${parseErr.message}`,
        variant: 'danger',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const connectedCount = servers.filter((s) => s.status === 'CONNECTED').length;

  return (
    <div className="space-y-4 animate-fade-in pr-0 sm:pr-2 pb-6 text-sans select-none">
      {viewMode === 'marketplace' ? (
        <McpStoreView
          onBack={() => setViewMode('cards')}
          onOpenCustomAdd={handleOpenAdd}
          installedServers={servers}
          onInstall={handleInstallFromCatalog}
          installingServerId={installingServerId}
        />
      ) : (
        <>
          {/* 1. Header (Clean & Uncluttered, with right margin for modal X) */}
          <div className="pb-3.5 border-b border-[#202022] pr-10">
            <div className="flex items-center gap-2.5">
              <h2 className="text-lg font-semibold text-[#f5f5f7] tracking-tight">MCP Servers</h2>
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium ${
                  connectedCount > 0
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : 'bg-zinc-800/80 text-zinc-400 border border-zinc-700/60'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    connectedCount > 0 ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-500'
                  }`}
                />
                {connectedCount} Active
              </span>
            </div>
            <p className="text-[12px] text-[#868686] mt-1 leading-relaxed">
              Connect external Model Context Protocol (MCP) tools and data services to your coding agent.
            </p>
          </div>

          {/* 2. Action Toolbar (Neat, balanced, below header) */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-0.5">
            {/* Mode Switcher Segmented Pills */}
            <div className="flex items-center p-0.5 bg-[#141416] border border-[#222226] rounded-xl self-start">
              <button
                type="button"
                onClick={() => setViewMode('cards')}
                className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition cursor-pointer ${
                  viewMode === 'cards'
                    ? 'bg-[#282830] text-white shadow-sm'
                    : 'text-[#888888] hover:text-white'
                }`}
              >
                Visual Cards
              </button>
              <button
                type="button"
                onClick={() => setViewMode('json')}
                className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition cursor-pointer ${
                  viewMode === 'json'
                    ? 'bg-[#282830] text-white shadow-sm'
                    : 'text-[#888888] hover:text-white'
                }`}
              >
                Raw JSON
              </button>
            </div>

            {/* Right Actions: Refresh + Add Server */}
            <div className="flex items-center gap-2 self-end sm:self-auto">
              <button
                type="button"
                onClick={fetchServers}
                disabled={isLoading}
                title="Refresh servers"
                className="p-2 rounded-xl border border-[#26262a] bg-[#161618] hover:bg-[#202024] text-[#a0a0a0] hover:text-white transition cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-blue-400' : ''}`} />
              </button>

              <button
                type="button"
                onClick={() => setViewMode('marketplace')}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#007acc] hover:bg-[#0066aa] text-white text-[12px] font-medium transition cursor-pointer shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Server</span>
              </button>
            </div>
          </div>

      {errorMessage && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-[12.5px] flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* 3. Content: Cards View */}
      {viewMode === 'cards' && (
        <div className="space-y-3 pt-1">
          {servers.length === 0 && !isLoading ? (
            <div className="p-8 sm:p-10 rounded-2xl bg-[#141416] border border-[#222226] text-center space-y-3.5">
              <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mx-auto text-blue-400">
                <Server className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-white">No MCP Servers Configured</h3>
                <p className="text-[12px] text-[#868686] max-w-md mx-auto leading-relaxed">
                  Add MCP servers such as GitHub, SQLite, PostgreSQL, or Brave Search to grant your coding agent external tools and real-time database access.
                </p>
              </div>
              <div className="pt-1">
                <button
                  type="button"
                  onClick={handleOpenAdd}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#007acc] hover:bg-[#0066aa] text-white text-[12.5px] font-medium transition cursor-pointer shadow-sm"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Configure First Server</span>
                </button>
              </div>
            </div>
          ) : (
            servers.map((server) => {
              const isExpanded = expandedToolsServer === server.name;
              const isConnected = server.status === 'CONNECTED';
              const isConnecting = server.status === 'CONNECTING';
              const isError = server.status === 'ERROR';
              const isDisabled = Boolean(server.config.disabled);

              return (
                <div
                  key={server.name}
                  className={`rounded-2xl border transition-all ${
                    isDisabled
                      ? 'bg-[#121214]/60 border-[#1e1e22] opacity-75'
                      : isError
                      ? 'bg-[#151214] border-red-500/20'
                      : 'bg-[#141416] border-[#242428] hover:border-[#2e2e34]'
                  }`}
                >
                  {/* Card Main Row */}
                  <div className="p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    {/* Left Info */}
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="text-[13.5px] font-semibold text-white truncate">
                              {server.name}
                            </span>
                            {isConnected && (
                              <span
                                className="w-2 h-2 rounded-full bg-emerald-500 shrink-0 inline-block shadow-[0_0_6px_rgba(16,185,129,0.6)]"
                                title="Connected"
                              />
                            )}
                          </div>

                          {/* Status Pill (only shown when not connected) */}
                          {!isConnected && (
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                                isError
                                  ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                                  : isConnecting
                                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                  : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                              }`}
                            >
                              <span
                                className={`w-1 h-1 rounded-full ${
                                  isError
                                    ? 'bg-red-400'
                                    : isConnecting
                                    ? 'bg-amber-400 animate-pulse'
                                    : 'bg-zinc-500'
                                }`}
                              />
                              {server.status}
                            </span>
                          )}

                          {/* Loading Mode Pill (Interactive toggle) */}
                          <button
                            type="button"
                            onClick={() => handleToggleLoadingMode(server)}
                            title={`Current mode: ${server.config.loadingMode || 'eager'}. Click to toggle.`}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border transition cursor-pointer ${
                              server.config.loadingMode === 'lazy'
                                ? 'bg-purple-500/10 border-purple-500/20 text-purple-300 hover:bg-purple-500/20'
                                : 'bg-blue-500/10 border-blue-500/20 text-blue-300 hover:bg-blue-500/20'
                            }`}
                          >
                            {server.config.loadingMode === 'lazy' ? (
                              <>
                                <FileCode className="w-2.5 h-2.5" />
                                <span>Lazy Mode</span>
                              </>
                            ) : (
                              <>
                                <Zap className="w-2.5 h-2.5" />
                                <span>Eager Mode</span>
                              </>
                            )}
                          </button>
                        </div>

                        {/* Subtitle / Command Info */}
                        <div className="flex items-center gap-2 text-[11px] text-[#808088] font-mono truncate">
                          <span>{server.transport.toUpperCase()}</span>
                          <span>•</span>
                          <span className="truncate">
                            {server.config.serverUrl ||
                              `${server.config.command || ''} ${(server.config.args || []).join(' ')}`}
                          </span>
                        </div>
                      </div>

                    {/* Right Controls */}
                    <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                      {/* Auto-Approve Toggle Pill */}
                      <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-[#18181c] border border-[#242428]">
                        <Shield
                          className={`w-3.5 h-3.5 ${
                            server.config.autoApprove ? 'text-emerald-400' : 'text-zinc-500'
                          }`}
                        />
                        <span className="text-[11px] text-[#a0a0a8]">Auto-Approve</span>
                        <ToggleSwitch
                          checked={Boolean(server.config.autoApprove)}
                          onChange={() => handleToggleAutoApprove(server)}
                          ariaLabel={`Toggle auto-approve for ${server.name}`}
                        />
                      </div>

                      {/* Enable / Disable Server Toggle */}
                      <div className="flex items-center gap-1.5 pl-1">
                        <ToggleSwitch
                          checked={!isDisabled}
                          onChange={() => handleToggleServer(server)}
                          ariaLabel={`Toggle active status for ${server.name}`}
                        />
                      </div>

                      {/* Restart */}
                      <button
                        type="button"
                        onClick={() => handleRestartServer(server.name)}
                        title="Restart server process"
                        className="p-1.5 rounded-lg border border-[#26262a] bg-[#161618] hover:bg-[#202024] text-[#a0a0a0] hover:text-white transition cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                      </button>

                      {/* View Stderr Logs */}
                      <button
                        type="button"
                        onClick={() => handleViewLogs(server.name)}
                        title="View server stderr logs"
                        className="p-1.5 rounded-lg border border-[#26262a] bg-[#161618] hover:bg-[#202024] text-[#a0a0a0] hover:text-white transition cursor-pointer"
                      >
                        <Terminal className="w-3.5 h-3.5" />
                      </button>

                      {/* Edit */}
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(server)}
                        title="Edit server configuration"
                        className="p-1.5 rounded-lg border border-[#26262a] bg-[#161618] hover:bg-[#202024] text-[#a0a0a0] hover:text-white transition cursor-pointer"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>

                      {/* Delete */}
                      <button
                        type="button"
                        onClick={() => handleDeleteServer(server.name)}
                        title="Delete server"
                        className="p-1.5 rounded-lg border border-[#26262a] bg-[#161618] hover:bg-red-500/20 text-[#a0a0a0] hover:text-red-400 transition cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Expandable Tools Section */}
                  {server.tools.length > 0 && (
                    <div className="border-t border-[#1f1f23] px-3.5 py-2 bg-[#101012] rounded-b-2xl">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedToolsServer(isExpanded ? null : server.name)
                        }
                        className="w-full flex items-center justify-between text-[11.5px] text-[#868686] hover:text-[#cccccc] transition cursor-pointer py-0.5"
                      >
                        <span className="flex items-center gap-1.5 font-medium">
                          <ChevronRight
                            className={`w-3.5 h-3.5 transition-transform duration-200 ${
                              isExpanded ? 'rotate-90 text-white' : ''
                            }`}
                          />
                          <span>{server.tools.length} Available Tools</span>
                        </span>
                        <span className="text-[10.5px] text-[#666666]">
                          {isExpanded ? 'Collapse' : 'Click to inspect schemas'}
                        </span>
                      </button>

                      {isExpanded && (
                        <div className="mt-2.5 pt-2 border-t border-[#1c1c20] space-y-2 animate-fade-in">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {server.tools.map((t) => (
                              <div
                                key={t.name}
                                className="p-2.5 rounded-xl bg-[#161618] border border-[#242428] space-y-1 select-text"
                              >
                                <div className="flex items-center justify-between gap-1">
                                  <span className="text-[12px] font-mono font-semibold text-blue-400 truncate">
                                    {t.name}
                                  </span>
                                  <span className="text-[9.5px] uppercase font-mono px-1.5 py-0.5 rounded bg-[#202026] text-[#888]">
                                    {t.loadingMode}
                                  </span>
                                </div>
                                <p className="text-[11px] text-[#999999] line-clamp-2 leading-relaxed font-sans">
                                  {t.description || 'No description provided.'}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* 4. Content: Raw JSON Editor View */}
      {viewMode === 'json' && (
        <div className="space-y-3 pt-1">
          <div className="p-3.5 rounded-xl bg-[#141416] border border-[#242428] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <span className="text-[12px] text-[#888]">
              Format: Standard <code className="text-[#bbb]">mcp_config.json</code> compatible with Claude Desktop &amp; Google Antigravity.
            </span>
            <button
              type="button"
              onClick={handleSaveRawJson}
              disabled={isSaving}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-[12px] font-medium transition cursor-pointer self-start sm:self-auto ${
                saveSuccess
                  ? 'bg-emerald-600 text-white'
                  : 'bg-[#007acc] hover:bg-[#0066aa] text-white'
              }`}
            >
              {saveSuccess ? <Check className="w-3.5 h-3.5" /> : <FileCode className="w-3.5 h-3.5" />}
              <span>{saveSuccess ? 'Saved & Applied!' : 'Save & Reload Servers'}</span>
            </button>
          </div>

          <div className="rounded-xl border border-[#242428] bg-[#0d0d0f] overflow-hidden">
            <textarea
              value={rawConfig}
              onChange={(e) => setRawConfig(e.target.value)}
              rows={16}
              spellCheck={false}
              className="w-full p-4 font-mono text-[12.5px] leading-relaxed text-[#d4d4d8] bg-transparent focus:outline-none resize-y"
            />
          </div>
        </div>
      )}
    </>
  )}

  {/* 5. Modal: Add / Edit Server */}
      {showAddModal && (
        <div className="fixed inset-0 z-[100050] bg-black/75 flex items-center justify-center p-3 sm:p-4 animate-fade-in">
          <div className="w-full max-w-lg bg-[#141416] border border-[#2a2a30] rounded-2xl shadow-2xl p-5 space-y-4 animate-dropdown max-h-[92vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-[#222226]">
              <div className="space-y-0.5">
                <h3 className="text-[15px] font-semibold text-white">
                  {editingServerName ? `Edit Server: ${editingServerName}` : 'Add New MCP Server'}
                </h3>
                <p className="text-[11.5px] text-[#888]">
                  Configure command or remote endpoint to mount tools.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="p-1.5 rounded-lg text-[#888] hover:text-white hover:bg-[#202024] transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveForm} className="space-y-3.5">
              {/* Name */}
              <div className="space-y-1">
                <label className="text-[11.5px] font-medium text-[#c0c0c6]">
                  Server Identifier <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  disabled={Boolean(editingServerName)}
                  placeholder="e.g. github, filesystem, chrome-devtools-mcp"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg bg-[#101012] border border-[#282830] text-[12.5px] text-white focus:border-blue-500 focus:outline-none disabled:opacity-50"
                />
              </div>

              {/* Transport Selection (Segmented Pill) */}
              <div className="space-y-1">
                <label className="text-[11.5px] font-medium text-[#c0c0c6]">Transport Protocol</label>
                <div className="grid grid-cols-2 gap-2 p-0.5 bg-[#101012] border border-[#26262e] rounded-xl">
                  <button
                    type="button"
                    onClick={() => setFormTransport('stdio')}
                    className={`py-1.5 px-3 rounded-lg text-[12px] font-medium text-center transition cursor-pointer ${
                      formTransport === 'stdio'
                        ? 'bg-[#282832] text-white shadow-sm'
                        : 'text-[#888] hover:text-white'
                    }`}
                  >
                    stdio (Local Command)
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormTransport('sse')}
                    className={`py-1.5 px-3 rounded-lg text-[12px] font-medium text-center transition cursor-pointer ${
                      formTransport === 'sse'
                        ? 'bg-[#282832] text-white shadow-sm'
                        : 'text-[#888] hover:text-white'
                    }`}
                  >
                    SSE (Remote HTTP)
                  </button>
                </div>
              </div>

              {formTransport === 'stdio' ? (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1">
                      <label className="text-[11.5px] font-medium text-[#c0c0c6]">Command</label>
                      <input
                        type="text"
                        required
                        placeholder="npx, uvx, node"
                        value={formCommand}
                        onChange={(e) => setFormCommand(e.target.value)}
                        className="w-full px-3 py-1.5 rounded-lg bg-[#101012] border border-[#282830] text-[12.5px] text-white focus:border-blue-500 focus:outline-none font-mono"
                      />
                    </div>
                    <div className="col-span-2 space-y-1">
                      <label className="text-[11.5px] font-medium text-[#c0c0c6]">Arguments</label>
                      <input
                        type="text"
                        placeholder="-y @modelcontextprotocol/server-github"
                        value={formArgs}
                        onChange={(e) => setFormArgs(e.target.value)}
                        className="w-full px-3 py-1.5 rounded-lg bg-[#101012] border border-[#282830] text-[12.5px] text-white focus:border-blue-500 focus:outline-none font-mono"
                      />
                    </div>
                  </div>

                  {/* Environment Variables */}
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center justify-between">
                      <label className="text-[11.5px] font-medium text-[#c0c0c6]">
                        Environment Variables
                      </label>
                      <button
                        type="button"
                        onClick={() => setFormEnv([...formEnv, { key: '', value: '' }])}
                        className="text-[11px] text-blue-400 hover:text-blue-300 transition cursor-pointer"
                      >
                        + Add Env
                      </button>
                    </div>

                    <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                      {formEnv.map((item, idx) => (
                        <div key={idx} className="flex items-center gap-1.5">
                          <input
                            type="text"
                            placeholder="KEY"
                            value={item.key}
                            onChange={(e) => {
                              const updated = [...formEnv];
                              updated[idx].key = e.target.value;
                              setFormEnv(updated);
                            }}
                            className="w-1/2 px-2.5 py-1 rounded-lg bg-[#101012] border border-[#282830] text-[11.5px] text-white font-mono"
                          />
                          <input
                            type="password"
                            placeholder="VALUE"
                            value={item.value}
                            onChange={(e) => {
                              const updated = [...formEnv];
                              updated[idx].value = e.target.value;
                              setFormEnv(updated);
                            }}
                            className="w-1/2 px-2.5 py-1 rounded-lg bg-[#101012] border border-[#282830] text-[11.5px] text-white font-mono"
                          />
                          {formEnv.length > 1 && (
                            <button
                              type="button"
                              onClick={() => setFormEnv(formEnv.filter((_, i) => i !== idx))}
                              className="p-1 text-zinc-500 hover:text-red-400 transition"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <div className="space-y-1">
                  <label className="text-[11.5px] font-medium text-[#c0c0c6]">Server URL (SSE Endpoint)</label>
                  <input
                    type="url"
                    required
                    placeholder="https://mcp.example.com/sse"
                    value={formServerUrl}
                    onChange={(e) => setFormServerUrl(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg bg-[#101012] border border-[#282830] text-[12.5px] text-white focus:border-blue-500 focus:outline-none font-mono"
                  />
                </div>
              )}

              {/* Custom Options: Loading Mode Dropdown & Auto-Allow Toggle */}
              <div className="pt-2 border-t border-[#222226] space-y-3">
                {/* Custom Loading Mode Dropdown */}
                <div className="space-y-1">
                  <label className="text-[11.5px] font-medium text-[#c0c0c6]">Loading Mode</label>
                  <div className="relative" ref={loadingModeDropdownRef}>
                    <button
                      type="button"
                      onClick={() => setOpenLoadingModeDropdown(!openLoadingModeDropdown)}
                      className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-[#101012] border border-[#282830] hover:border-[#383842] text-[12.5px] text-white transition cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        {formLoadingMode === 'eager' ? (
                          <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        ) : (
                          <FileCode className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                        )}
                        <span className="font-medium">
                          {formLoadingMode === 'eager'
                            ? 'Eager (Native Functions)'
                            : 'Lazy (On-Demand Schemas)'}
                        </span>
                      </div>
                      <ChevronDown
                        className={`w-3.5 h-3.5 text-[#888] transition-transform duration-150 ${
                          openLoadingModeDropdown ? 'rotate-180 text-white' : ''
                        }`}
                      />
                    </button>

                    {openLoadingModeDropdown && (
                      <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-[#18181c] border border-[#2c2c34] rounded-xl shadow-2xl p-1 animate-dropdown divide-y divide-[#222228]">
                        <button
                          type="button"
                          onClick={() => {
                            setFormLoadingMode('eager');
                            setOpenLoadingModeDropdown(false);
                          }}
                          className="w-full flex items-start justify-between p-2.5 rounded-lg text-left hover:bg-[#222228] transition cursor-pointer"
                        >
                          <div className="space-y-0.5 pr-2">
                            <div className="flex items-center gap-1.5 text-[12px] font-medium text-white">
                              <Zap className="w-3.5 h-3.5 text-amber-400" />
                              <span>Eager (Native Functions)</span>
                            </div>
                            <p className="text-[11px] text-[#888] leading-tight">
                              Injected directly into AI model functions. Best for servers with 1-10 tools.
                            </p>
                          </div>
                          {formLoadingMode === 'eager' && (
                            <Check className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setFormLoadingMode('lazy');
                            setOpenLoadingModeDropdown(false);
                          }}
                          className="w-full flex items-start justify-between p-2.5 rounded-lg text-left hover:bg-[#222228] transition cursor-pointer"
                        >
                          <div className="space-y-0.5 pr-2">
                            <div className="flex items-center gap-1.5 text-[12px] font-medium text-white">
                              <FileCode className="w-3.5 h-3.5 text-blue-400" />
                              <span>Lazy (On-Demand Schemas)</span>
                            </div>
                            <p className="text-[11px] text-[#888] leading-tight">
                              Schemas cached to disk and loaded on-demand via call_mcp_tool. Saves context tokens.
                            </p>
                          </div>
                          {formLoadingMode === 'lazy' && (
                            <Check className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Auto-Allow Toggle Card */}
                <div className="p-3 rounded-xl bg-[#101012] border border-[#282830] flex items-center justify-between gap-3">
                  <div className="space-y-0.5 min-w-0 flex-1 pr-2">
                    <div className="text-[12.5px] font-medium text-white">Auto-Allow Tool Executions</div>
                    <div className="text-[11px] text-[#888] leading-snug">
                      Bypass confirmation prompts for tools provided by this server.
                    </div>
                  </div>
                  <ToggleSwitch
                    checked={formAutoApprove}
                    onChange={setFormAutoApprove}
                    ariaLabel="Toggle auto-approve"
                  />
                </div>
              </div>

              {/* Form Buttons */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#222226]">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-1.5 rounded-xl text-[12px] text-[#a0a0a8] hover:text-white bg-transparent hover:bg-[#202026] transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-1.5 rounded-xl text-[12px] font-medium text-white bg-[#007acc] hover:bg-[#0066aa] transition cursor-pointer disabled:opacity-50 shadow-sm"
                >
                  {isSaving ? 'Connecting...' : editingServerName ? 'Save Changes' : 'Connect Server'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. Modal: Server Stderr Logs */}
      {logsServerName && (
        <div className="fixed inset-0 z-[100050] bg-black/75 flex items-center justify-center p-3 sm:p-4 animate-fade-in">
          <div className="w-full max-w-2xl bg-[#121214] border border-[#2a2a30] rounded-2xl shadow-2xl p-5 space-y-3 animate-dropdown">
            <div className="flex items-center justify-between pb-2 border-b border-[#222226]">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-blue-400" />
                <h3 className="text-[14px] font-semibold text-white">
                  Logs for MCP Server: <span className="font-mono text-blue-300">{logsServerName}</span>
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setLogsServerName(null)}
                className="p-1 rounded-lg text-[#888] hover:text-white hover:bg-[#202026] transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 rounded-xl bg-[#0a0a0c] border border-[#222226] font-mono text-[11.5px] leading-relaxed text-[#c0c0c6] max-h-80 overflow-y-auto select-text space-y-0.5">
              {serverLogs.length === 0 ? (
                <div className="text-zinc-600 italic py-4 text-center">No logs recorded yet.</div>
              ) : (
                serverLogs.map((log, i) => (
                  <div
                    key={i}
                    className={`${
                      log.includes('[error]')
                        ? 'text-red-400'
                        : log.includes('[system]')
                        ? 'text-emerald-400'
                        : 'text-zinc-400'
                    }`}
                  >
                    {log}
                  </div>
                ))
              )}
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => setLogsServerName(null)}
                className="px-4 py-1.5 rounded-xl bg-[#202026] hover:bg-[#282830] text-[12px] text-white transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
