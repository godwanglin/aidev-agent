'use client';

import React from 'react';
import { MessageSquare, Plus, Trash2, Sparkles } from 'lucide-react';
import type { SessionRecord } from '@/lib/db';

interface SessionsSectionProps {
  sessions: SessionRecord[];
  currentSessionId?: string;
  onSelectSession: (session: SessionRecord) => void;
  onNewSession: () => void;
  onDeleteSession: (sessionId: string) => void;
  onAutoRenameSession?: (sessionId: string) => void;
}

export const SessionsSection: React.FC<SessionsSectionProps> = ({
  sessions,
  currentSessionId,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  onAutoRenameSession,
}) => {
  return (
    <div className="flex flex-col h-full p-2 space-y-2 select-none">
      {/* New Conversation Button */}
      <button
        onClick={onNewSession}
        className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md bg-white/[0.05] hover:bg-white/[0.08] text-slate-200 border border-white/[0.08] text-xs font-medium transition"
      >
        <Plus className="w-3.5 h-3.5 text-slate-400" strokeWidth={1.75} />
        <span>New conversation</span>
      </button>

      <div className="px-1 pt-1 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
        History ({sessions.length})
      </div>

      {/* Sessions List */}
      <div className="flex-1 overflow-y-auto space-y-0.5 pr-0.5">
        {sessions.map((sess) => {
          const isActive = sess.id === currentSessionId;
          return (
            <div
              key={sess.id}
              onClick={() => onSelectSession(sess)}
              className={`group flex items-center justify-between p-2 rounded-md transition cursor-pointer text-xs ${
                isActive
                  ? 'bg-[#1a1e2a] text-slate-100 border border-white/[0.08]'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.03]'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0 flex-1 pr-1">
                <MessageSquare
                  className={`w-3.5 h-3.5 shrink-0 ${
                    isActive ? 'text-slate-300' : 'text-slate-600 group-hover:text-slate-500'
                  }`}
                  strokeWidth={1.5}
                />
                <span className="truncate text-[12px]">{sess.title}</span>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {onAutoRenameSession && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onAutoRenameSession(sess.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-white/[0.06] text-slate-500 hover:text-[#e8975f] transition"
                    title="Auto-rename with AI"
                  >
                    <Sparkles className="w-3 h-3" strokeWidth={1.5} />
                  </button>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteSession(sess.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-white/[0.06] text-slate-500 hover:text-rose-400 transition"
                  title="Delete conversation"
                >
                  <Trash2 className="w-3 h-3" strokeWidth={1.5} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
