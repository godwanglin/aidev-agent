'use client';

import React, { useState } from 'react';
import {
  Globe,
  ArrowRight,
  Zap,
  Server,
  Compass,
  Monitor,
  Search,
} from 'lucide-react';
import type { OverviewTaskItem } from './overview-view';

interface BrowserWelcomeViewProps {
  onNavigate: (url: string) => void;
  tasks?: OverviewTaskItem[];
}

export const BrowserWelcomeView: React.FC<BrowserWelcomeViewProps> = ({
  onNavigate,
  tasks = [],
}) => {
  const [inputUrl, setInputUrl] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = inputUrl.trim();
    if (!trimmed) return;
    onNavigate(trimmed);
  };

  // Find active running dev server tasks
  const runningTasks = tasks.filter((t) => t.status === 'RUNNING');
  const detectedServers: Array<{ label: string; url: string; cmd: string }> = [];

  for (const t of runningTasks) {
    const cmdLower = t.cmd.toLowerCase();
    const portMatch = cmdLower.match(/(?:-p|--port|\:)\s*(\d{4,5})/);
    if (portMatch && portMatch[1]) {
      detectedServers.push({
        label: `Port :${portMatch[1]}`,
        url: `http://localhost:${portMatch[1]}`,
        cmd: t.cmd,
      });
    } else if (cmdLower.includes('next')) {
      detectedServers.push({
        label: 'Next.js Dev Server',
        url: 'http://localhost:3000',
        cmd: t.cmd,
      });
    } else if (cmdLower.includes('vite')) {
      detectedServers.push({
        label: 'Vite Dev Server',
        url: 'http://localhost:5173',
        cmd: t.cmd,
      });
    } else if (cmdLower.includes('astro')) {
      detectedServers.push({
        label: 'Astro Dev Server',
        url: 'http://localhost:4321',
        cmd: t.cmd,
      });
    }
  }

  // Quick dev port presets
  const commonPorts = [
    { port: '5173', framework: 'Vite / React' },
    { port: '3000', framework: 'Next.js / CRA' },
    { port: '4321', framework: 'Astro' },
    { port: '8080', framework: 'Webpack / Vue' },
    { port: '5000', framework: 'Flask / Python' },
    { port: '8000', framework: 'Django / FastAPI' },
  ];

  // Quick web shortcuts
  const quickLinks = [
    { title: 'Weebin Hub', url: 'https://weebinhub.com', desc: 'Streaming anime & donghua' },
    { title: 'Google', url: 'https://google.com', desc: 'Search engine' },
    { title: 'GitHub', url: 'https://github.com', desc: 'Code repository' },
  ];

  return (
    <div className="flex-1 h-full w-full bg-[#0d0d0f] text-[#cccccc] flex flex-col items-center justify-center p-6 overflow-y-auto select-none font-sans">
      <div className="w-full max-w-xl flex flex-col items-center animate-in fade-in zoom-in-95 duration-200">
        {/* 1. Header Hero Icon & Title */}
        <div className="w-13 h-13 rounded-2xl bg-gradient-to-br from-[#162744] to-[#0f1a2e] border border-[#264478]/50 flex items-center justify-center text-[#58a6ff] shadow-[0_0_30px_rgba(88,166,255,0.18)] mb-4">
          <Globe className="w-6.5 h-6.5" strokeWidth={1.75} />
        </div>
        <h1 className="text-xl font-semibold text-white tracking-tight mb-1.5">
          Browser Preview
        </h1>
        <p className="text-xs text-[#8c8c8c] text-center max-w-md mb-6 leading-relaxed">
          Preview your local development servers or browse live websites alongside your code.
        </p>

        {/* 2. Search / URL Input Bar */}
        <form onSubmit={handleSubmit} className="w-full mb-8">
          <div className="relative flex items-center bg-[#151518] border border-[#2b2b32] focus-within:border-[#007acc] focus-within:shadow-[0_0_20px_rgba(0,122,204,0.18)] rounded-xl px-3.5 py-2.5 transition-all group">
            <Search className="w-4 h-4 text-[#666672] group-focus-within:text-[#58a6ff] transition-colors shrink-0 mr-2.5" />
            <input
              type="text"
              autoFocus
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              placeholder="Enter URL or port (e.g. 5173, localhost:3000, weebinhub.com)..."
              className="flex-1 bg-transparent border-none outline-none text-[#e6edf3] placeholder-[#555560] text-xs font-mono min-w-0"
            />
            <button
              type="submit"
              disabled={!inputUrl.trim()}
              className="ml-2 px-3 py-1.5 rounded-lg bg-[#007acc] hover:bg-[#0062a3] disabled:opacity-30 disabled:hover:bg-[#007acc] text-white text-xs font-medium flex items-center gap-1 transition-all cursor-pointer disabled:cursor-not-allowed shadow-sm shrink-0"
            >
              <span>Open</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </form>

        {/* 3. Detected Running Dev Servers */}
        {detectedServers.length > 0 && (
          <div className="w-full mb-6">
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-[#7ee787] uppercase tracking-wider mb-2.5">
              <span className="w-2 h-2 rounded-full bg-[#7ee787] animate-ping" />
              <span>Active Dev Servers Detected</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {detectedServers.map((srv, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => onNavigate(srv.url)}
                  className="flex items-center justify-between p-3 rounded-xl bg-[#141418] hover:bg-[#1a1a22] border border-[#23232c] hover:border-[#388bfd]/50 text-left transition-all cursor-pointer group"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-[#238636]/15 border border-[#238636]/30 flex items-center justify-center text-[#7ee787] shrink-0">
                      <Zap className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-[#f0f6fc] group-hover:text-[#58a6ff] transition-colors truncate">
                        {srv.label}
                      </div>
                      <div className="text-[10.5px] font-mono text-[#8c8c8c] truncate">
                        {srv.url}
                      </div>
                    </div>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-[#555560] group-hover:text-white group-hover:translate-x-0.5 transition-all shrink-0 ml-2" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 4. Common Localhost Ports */}
        <div className="w-full mb-6">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-[#8c8c8c] uppercase tracking-wider mb-2.5">
            <Server className="w-3 h-3 text-[#8c8c8c]" />
            <span>Quick Localhost Ports</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {commonPorts.map((cp) => (
              <button
                key={cp.port}
                type="button"
                onClick={() => onNavigate(`http://localhost:${cp.port}`)}
                className="flex items-center justify-between p-2.5 rounded-lg bg-[#141418] hover:bg-[#1a1a22] border border-[#222228] hover:border-[#333340] text-left transition-all cursor-pointer group"
              >
                <div className="min-w-0">
                  <span className="text-xs font-mono font-medium text-[#e6edf3] group-hover:text-[#58a6ff] transition-colors">
                    :{cp.port}
                  </span>
                  <div className="text-[10px] text-[#777782] truncate">
                    {cp.framework}
                  </div>
                </div>
                <ArrowRight className="w-3 h-3 text-[#444450] group-hover:text-white group-hover:translate-x-0.5 transition-all shrink-0 ml-1.5" />
              </button>
            ))}
          </div>
        </div>

        {/* 5. Recommended Web Shortcuts */}
        <div className="w-full">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-[#8c8c8c] uppercase tracking-wider mb-2.5">
            <Compass className="w-3 h-3 text-[#8c8c8c]" />
            <span>Web Shortcuts</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {quickLinks.map((item) => (
              <button
                key={item.url}
                type="button"
                onClick={() => onNavigate(item.url)}
                className="flex flex-col p-2.5 rounded-lg bg-[#141418] hover:bg-[#1a1a22] border border-[#222228] hover:border-[#333340] text-left transition-all cursor-pointer group"
              >
                <div className="flex items-center justify-between w-full mb-0.5">
                  <span className="text-xs font-medium text-[#e6edf3] group-hover:text-[#58a6ff] transition-colors truncate">
                    {item.title}
                  </span>
                  <ArrowRight className="w-3 h-3 text-[#444450] group-hover:text-white group-hover:translate-x-0.5 transition-all shrink-0 ml-1" />
                </div>
                <span className="text-[10px] text-[#777782] truncate">
                  {item.desc}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
