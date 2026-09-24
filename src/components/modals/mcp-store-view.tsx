'use client';

import React, { useState, useMemo } from 'react';
import { ArrowLeft, Search, Check, Plus, Sliders, X, Sparkles, Server } from 'lucide-react';
import { MCP_CATALOG, MCP_CATEGORIES, McpCatalogItem } from '@/lib/mcp/catalog';
import type { McpServerRuntimeInfo } from '@/lib/mcp/types';

interface McpStoreViewProps {
  onBack: () => void;
  onOpenCustomAdd: () => void;
  installedServers: McpServerRuntimeInfo[];
  onInstall: (item: McpCatalogItem) => void;
  installingServerId?: string | null;
}

export const McpStoreView: React.FC<McpStoreViewProps> = ({
  onBack,
  onOpenCustomAdd,
  installedServers,
  onInstall,
  installingServerId,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');

  // Check if a catalog item is already installed
  const isInstalled = (item: McpCatalogItem) => {
    const idLower = item.id.toLowerCase();
    const nameLower = item.name.toLowerCase();
    return installedServers.some((s) => {
      const sName = s.name.toLowerCase();
      return (
        sName === idLower ||
        sName === nameLower ||
        sName === idLower.replace(/[^a-z0-9]/g, '') ||
        (item.args && s.config.args && s.config.args.join(' ').includes(item.id))
      );
    });
  };

  // Filter items by category and search term
  const filteredItems = useMemo(() => {
    return MCP_CATALOG.filter((item) => {
      const matchesCategory =
        selectedCategory === 'All' || item.category === selectedCategory;

      if (!matchesCategory) return false;

      if (!searchQuery.trim()) return true;

      const q = searchQuery.toLowerCase().trim();
      return (
        item.name.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.id.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        (item.badge && item.badge.toLowerCase().includes(q))
      );
    });
  }, [searchQuery, selectedCategory]);

  return (
    <div className="space-y-4 animate-fade-in pr-0 sm:pr-2 pb-6 text-sans select-none">
      {/* 1. Header with Back button (Exact style from Antigravity Image 3) */}
      <div className="space-y-2 pb-2">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-[13px] text-[#a0a0a8] hover:text-white transition cursor-pointer font-medium -ml-1 py-1 px-1.5 rounded-lg hover:bg-[#202024]"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              Add MCP Servers
            </h2>
            <p className="text-[12px] text-[#86868e] mt-0.5">
              Browse official and community Model Context Protocol servers to equip your AI agent with specialized tools.
            </p>
          </div>

          <button
            type="button"
            onClick={onOpenCustomAdd}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#202026] hover:bg-[#282832] border border-[#32323a] text-white text-[12px] font-medium transition cursor-pointer self-start sm:self-auto shrink-0 shadow-sm"
          >
            <Plus className="w-3.5 h-3.5 text-blue-400" />
            <span>Configure Custom Server</span>
          </button>
        </div>
      </div>

      {/* 2. Search Box with Search Icon on Right (Exact layout as Image 3) */}
      <div className="relative">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search MCP servers by name"
          className="w-full px-4 py-2.5 pr-10 rounded-xl bg-[#141416] border border-[#26262e] text-[13px] text-white placeholder-[#686872] focus:border-[#2a75d3] focus:outline-none transition shadow-inner"
        />
        <div className="absolute right-3.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5 pointer-events-none text-[#70707a]">
          {searchQuery ? (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="pointer-events-auto text-[#888] hover:text-white p-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          ) : (
            <Search className="w-4 h-4" />
          )}
        </div>
      </div>

      {/* 3. Category Filter Pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none pt-0.5">
        {MCP_CATEGORIES.map((cat) => {
          const isActive = selectedCategory === cat;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1 rounded-lg text-[11.5px] font-medium transition whitespace-nowrap cursor-pointer ${
                isActive
                  ? 'bg-[#2a75d3] text-white shadow-sm'
                  : 'bg-[#18181c] text-[#8e8e96] hover:text-white hover:bg-[#222228] border border-[#24242a]'
              }`}
            >
              {cat}
            </button>
          );
        })}
      </div>

      {/* 4. App Store List Container (Bordered card matching Image 3) */}
      <div className="rounded-xl border border-[#242428] bg-[#141416]/70 divide-y divide-[#222226] overflow-hidden">
        {filteredItems.length === 0 ? (
          <div className="p-8 text-center space-y-2 text-[#888]">
            <Server className="w-8 h-8 mx-auto text-[#555]" />
            <p className="text-[13px] font-medium text-white">No MCP servers match &ldquo;{searchQuery}&rdquo;</p>
            <p className="text-[11.5px] text-[#777]">
              Try searching with another keyword or configure a custom MCP server manually.
            </p>
            <div className="pt-2">
              <button
                type="button"
                onClick={onOpenCustomAdd}
                className="inline-flex items-center gap-1 px-3.5 py-1.5 rounded-lg bg-[#24242c] hover:bg-[#2e2e38] text-white text-[12px] font-medium transition cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 text-blue-400" />
                <span>Add Custom Server</span>
              </button>
            </div>
          </div>
        ) : (
          filteredItems.map((item) => {
            const installed = isInstalled(item);
            const isInstalling = installingServerId === item.id;

            return (
              <div
                key={item.id}
                className="p-4 sm:p-4.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 hover:bg-[#18181c]/50 transition"
              >
                {/* Left: Title & Description */}
                <div className="min-w-0 space-y-1 sm:pr-4">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-[13.5px] font-semibold text-white tracking-tight">
                      {item.name}
                    </h3>
                    {item.badge && (
                      <span className="px-1.5 py-0.2 rounded text-[10px] font-medium bg-[#1e2430] border border-[#2e3b52] text-[#60a5fa]">
                        {item.badge}
                      </span>
                    )}
                    <span className="text-[10.5px] text-[#72727c] font-mono">
                      {item.transport.toUpperCase()}
                    </span>
                  </div>
                  <p className="text-[12px] text-[#8e8e96] leading-relaxed line-clamp-2">
                    {item.description}
                  </p>
                </div>

                {/* Right: + Add / Added Button */}
                <div className="shrink-0 self-end sm:self-auto">
                  {installed ? (
                    <span
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[12px] font-medium"
                      title="This MCP server is already added to your configuration"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Added</span>
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={isInstalling}
                      onClick={() => onInstall(item)}
                      className="inline-flex items-center gap-1 px-3.5 py-1.5 rounded-lg bg-[#2a75d3] hover:bg-[#2064be] active:bg-[#1855a4] text-white text-[12px] font-semibold transition cursor-pointer shadow-sm disabled:opacity-50"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>{isInstalling ? 'Adding...' : 'Add'}</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
