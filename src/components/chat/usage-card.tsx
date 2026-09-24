'use client';

import React from 'react';
import { Gauge, X, ExternalLink, RefreshCw, Globe, ShieldCheck } from 'lucide-react';
import type { UserUsageData } from '@/lib/gateway';

interface UsageCardProps {
  usage: UserUsageData;
  onClose: () => void;
  onRefresh?: () => void;
  isLoading?: boolean;
}

export const UsageCard: React.FC<UsageCardProps> = ({
  usage,
  onClose,
  onRefresh,
  isLoading = false,
}) => {
  // BYOK / Direct Upstream Provider Mode
  if (usage.mode === 'byok') {
    const byok = usage.byokInfo;
    const providerName = byok?.providerName || 'Direct Upstream';
    const host = byok?.host || 'Custom Endpoint';
    const dashboardUrl = byok?.dashboardUrl;

    return (
      <div className="mb-2.5 rounded-2xl usage-card-border-active p-3.5 sm:p-4 select-none animate-in fade-in slide-in-from-bottom-2 duration-150 text-white font-sans">
        {/* Top Header */}
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-xl bg-white/[0.05] border border-white/[0.1] flex items-center justify-center text-[#9ca3af] shrink-0">
              <Globe className="w-3.5 h-3.5" />
            </div>
            <div className="flex items-center gap-2 truncate min-w-0">
              <span className="text-[13px] sm:text-[13.5px] font-semibold text-[#f4f4f5] tracking-tight truncate">
                {providerName}
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-medium border border-white/[0.1] bg-white/[0.05] text-[#9ca3af] tracking-wide uppercase shrink-0">
                BYOK Mode
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                disabled={isLoading}
                className="p-1.5 rounded-lg text-[#8c8c8c] hover:text-white hover:bg-white/10 transition cursor-pointer disabled:opacity-50"
                title="Refresh connection status"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-[#8c8c8c] hover:text-white hover:bg-white/10 transition cursor-pointer"
              title="Close usage card (/usage)"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Info Box */}
        <div className="p-3 rounded-xl bg-[#121214]/60 border border-white/[0.04] mb-3 space-y-1.5">
          <div className="flex items-center gap-2 text-[12px] text-[#e4e4e7]">
            <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block shrink-0" />
            <span className="font-medium">Direct Provider Connection Active</span>
          </div>
          <p className="text-[11px] text-[#8c8c8c] leading-relaxed">
            Connected directly to <span className="font-mono text-[#d4d4d8]">{host}</span>. Quotas, rate limits, and billing are managed directly through your provider console.
          </p>
        </div>

        {/* 2 Metric Info Tiles */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div className="bg-[#1a1a1e]/80 border border-white/[0.06] rounded-xl p-2.5 flex flex-col justify-between">
            <span className="text-[10px] sm:text-[10.5px] text-[#8c8c8c] font-medium truncate">
              Billing Source
            </span>
            <span className="text-[12px] sm:text-[12.5px] font-semibold text-white font-mono mt-0.5 truncate">
              Direct API Key
            </span>
          </div>

          <div className="bg-[#1a1a1e]/80 border border-white/[0.06] rounded-xl p-2.5 flex flex-col justify-between">
            <span className="text-[10px] sm:text-[10.5px] text-[#8c8c8c] font-medium truncate">
              Gateway Proxy
            </span>
            <span className="text-[12px] sm:text-[12.5px] font-semibold text-emerald-400 font-mono mt-0.5 truncate">
              Unmetered
            </span>
          </div>
        </div>

        {/* Bottom Footer */}
        <div className="flex items-center justify-between pt-1 text-[11.5px] text-[#71717a]">
          <span className="truncate">Unmetered by Aidev Credits</span>

          {dashboardUrl ? (
            <button
              type="button"
              onClick={() => {
                if (typeof window !== 'undefined') window.open(dashboardUrl, '_blank');
              }}
              className="inline-flex items-center gap-1 text-[#60a5fa] hover:text-[#93c5fd] font-medium transition cursor-pointer hover:underline"
            >
              <span>Open Provider Console</span>
              <ExternalLink className="w-3 h-3" />
            </button>
          ) : (
            <span className="text-[11px] text-[#52525b]">Self-Managed Provider</span>
          )}
        </div>
      </div>
    );
  }

  const { tier, credits, requestsToday } = usage;
  const percentage = Math.min(100, Math.max(0, credits.percentageUsed || 0));

  const handleOpenBilling = () => {
    const billingUrl = 'https://aidev.weebinhub.biz.id/billing';
    if (typeof window !== 'undefined') {
      const api = (window as any).electronAPI;
      if (api?.openExternal) {
        api.openExternal(billingUrl);
      } else {
        window.open(billingUrl, '_blank', 'noopener,noreferrer');
      }
    }
  };

  return (
    <div className="mb-2.5 rounded-2xl usage-card-border-active p-3.5 sm:p-4 select-none animate-in fade-in slide-in-from-bottom-2 duration-150 text-white font-sans">
      {/* Top Header */}
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-xl bg-white/[0.05] border border-white/[0.1] flex items-center justify-center text-[#9ca3af] shrink-0">
            <Gauge className="w-3.5 h-3.5" />
          </div>
          <div className="flex items-center gap-2 truncate min-w-0">
            <span className="text-[13px] sm:text-[13.5px] font-semibold text-[#f4f4f5] tracking-tight">
              Credits &amp; Plan Usage
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium border border-white/[0.1] bg-white/[0.05] text-[#9ca3af] tracking-wide uppercase shrink-0">
              {tier.name || tier.id}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={isLoading}
              className="p-1.5 rounded-lg text-[#8c8c8c] hover:text-white hover:bg-white/10 transition cursor-pointer disabled:opacity-50"
              title="Refresh usage data"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#8c8c8c] hover:text-white hover:bg-white/10 transition cursor-pointer"
            title="Close usage card (/usage)"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="space-y-1.5 mb-3.5 bg-[#121214]/60 p-2.5 rounded-xl border border-white/[0.04]">
        <div className="flex items-center justify-between text-xs text-[#a1a1aa]">
          <span className="text-[11.5px] font-medium text-[#d4d4d8]">Total Credit Usage</span>
          <span className="font-mono font-semibold text-[12px] text-white">
            {percentage.toFixed(1)}%
          </span>
        </div>
        <div className="h-2 w-full bg-[#27272a] rounded-full overflow-hidden p-0.5">
          {percentage > 0 && (
            <div
              className="h-full rounded-full transition-all duration-500 ease-out bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 shadow-[0_0_8px_rgba(99,102,241,0.4)]"
              style={{ width: `${Math.min(100, percentage)}%` }}
            />
          )}
        </div>
      </div>

      {/* 2 Metric Cards: Remaining Balance & Used */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="bg-[#1a1a1e]/80 border border-white/[0.06] rounded-xl p-2.5 flex flex-col justify-between">
          <span className="text-[10px] sm:text-[10.5px] text-[#8c8c8c] font-medium truncate">
            Remaining Balance
          </span>
          <span className="text-[13px] sm:text-[14px] font-semibold text-white font-mono mt-0.5 truncate">
            {credits.balance.toLocaleString()} <span className="text-[10px] text-[#71717a] font-normal">CR</span>
          </span>
        </div>

        <div className="bg-[#1a1a1e]/80 border border-white/[0.06] rounded-xl p-2.5 flex flex-col justify-between">
          <span className="text-[10px] sm:text-[10.5px] text-[#8c8c8c] font-medium truncate">
            Used
          </span>
          <span className="text-[13px] sm:text-[14px] font-semibold text-white font-mono mt-0.5 truncate">
            {credits.used.toLocaleString()} <span className="text-[10px] text-[#71717a] font-normal">CR</span>
          </span>
        </div>
      </div>

      {/* Bottom Footer Info & Action */}
      <div className="flex items-center justify-between pt-1 text-[11.5px] text-[#71717a]">
        <div className="flex items-center gap-1.5 truncate">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
          <span className="truncate">
            {requestsToday === 1 ? '1 request today' : `${requestsToday} requests today`}
          </span>
        </div>

        <button
          type="button"
          onClick={handleOpenBilling}
          className="inline-flex items-center gap-1 text-[#60a5fa] hover:text-[#93c5fd] font-medium transition cursor-pointer hover:underline"
        >
          <span>Manage in Billing</span>
          <ExternalLink className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
};
