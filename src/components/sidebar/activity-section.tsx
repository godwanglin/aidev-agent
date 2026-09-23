'use client';

import React from 'react';
import { Activity, Check, X, Clock, Terminal, FileCode, Search, Wrench } from 'lucide-react';

export interface ActivityItem {
  id: string;
  name: string;
  target?: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  durationMs?: number;
  timestamp: number;
}

interface ActivitySectionProps {
  activities: ActivityItem[];
}

export const ActivitySection: React.FC<ActivitySectionProps> = ({ activities }) => {
  const getIcon = (name: string) => {
    switch (name) {
      case 'run_command':
        return <Terminal className="w-3.5 h-3.5 text-slate-400 shrink-0" strokeWidth={1.5} />;
      case 'apply_patch':
      case 'write_file':
        return <FileCode className="w-3.5 h-3.5 text-slate-400 shrink-0" strokeWidth={1.5} />;
      case 'search_files':
      case 'glob':
        return <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" strokeWidth={1.5} />;
      default:
        return <Wrench className="w-3.5 h-3.5 text-slate-400 shrink-0" strokeWidth={1.5} />;
    }
  };

  const getStatusBadge = (status: ActivityItem['status']) => {
    switch (status) {
      case 'RUNNING':
        return (
          <span className="flex items-center gap-1 text-[10px] text-blue-400 font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
            Running
          </span>
        );
      case 'COMPLETED':
        return <Check className="w-3.5 h-3.5 text-emerald-400" strokeWidth={2} />;
      case 'FAILED':
        return <X className="w-3.5 h-3.5 text-rose-400" strokeWidth={2} />;
      default:
        return <Clock className="w-3.5 h-3.5 text-slate-500" strokeWidth={1.5} />;
    }
  };

  if (activities.length === 0) {
    return (
      <div className="p-4 text-center text-xs text-slate-500">
        <Activity className="w-5 h-5 mx-auto mb-1.5 opacity-30" strokeWidth={1.5} />
        No activities recorded
      </div>
    );
  }

  return (
    <div className="p-2 space-y-1 overflow-y-auto max-h-full">
      {activities.map((act) => (
        <div
          key={act.id}
          className="p-2 rounded-md bg-[#161a24] border border-white/[0.05] text-xs flex items-center justify-between gap-2"
        >
          <div className="flex items-center gap-2 min-w-0">
            {getIcon(act.name)}
            <div className="min-w-0">
              <div className="font-mono text-[12px] text-slate-200 truncate">{act.name}</div>
              {act.target && (
                <div className="text-[11px] text-slate-400 truncate max-w-[150px]" title={act.target}>
                  {act.target}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {act.durationMs !== undefined && (
              <span className="text-[10px] text-slate-500 font-mono">
                {act.durationMs}ms
              </span>
            )}
            {getStatusBadge(act.status)}
          </div>
        </div>
      ))}
    </div>
  );
};
