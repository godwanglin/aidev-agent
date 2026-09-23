'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Search,
  Filter,
  MoreVertical,
  Folder,
  ArrowLeft,
  Columns2,
  Clock,
  Trash2,
  Sparkles,
  Pencil,
} from 'lucide-react';
import type { SessionRecord, ProjectRecord } from '@/lib/db';
import { getProjectSlug, formatRelativeTime } from '@/lib/project-utils';
import { SessionMenu } from '@/components/sidebar/session-menu';
import { FolderIcon } from '@/components/ui/folder-icon';
import { useConfirm } from '@/context/confirm-context';
import { BottomSheet } from '@/components/ui/bottom-sheet';

export default function ConversationHistoryPage() {
  const router = useRouter();
  const { confirm, prompt: promptDialog } = useConfirm();
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState<string>('all');
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [loading, setLoading] = useState(true);

  // Load projects and all sessions
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [projRes, sessRes] = await Promise.all([
          fetch('/api/projects'),
          fetch('/api/sessions'),
        ]);
        const projData = await projRes.json();
        const sessData = await sessRes.json();
        if (projData.projects) setProjects(projData.projects);
        if (sessData.sessions) setSessions(sessData.sessions);
      } catch (err) {
        console.error('Failed to load history:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const projectMap = useMemo(() => {
    const map = new Map<string, ProjectRecord>();
    for (const p of projects) {
      map.set(p.id, p);
    }
    return map;
  }, [projects]);

  // Filtered sessions
  const filteredSessions = useMemo(() => {
    return sessions.filter((s) => {
      const proj = projectMap.get(s.project_id);
      const projName = proj?.name || '';
      const matchesSearch =
        s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        projName.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesProject = selectedProjectId === 'all' || s.project_id === selectedProjectId;
      return matchesSearch && matchesProject;
    });
  }, [sessions, searchQuery, selectedProjectId, projectMap]);

  const handleOpenConversation = (session: SessionRecord) => {
    const proj = projectMap.get(session.project_id);
    const slug = proj ? getProjectSlug(proj) : session.project_id;
    router.push(`/projects/${slug}/${session.id}`);
  };

  const handleSplitSession = (session: SessionRecord, direction: 'right' | 'down') => {
    const proj = projectMap.get(session.project_id);
    const slug = proj ? getProjectSlug(proj) : session.project_id;
    router.push(`/projects/${slug}/${session.id}?spd=${direction}`);
  };

  const handleDeleteSession = async (sessionId: string) => {
    const ok = await confirm({
      title: 'Delete Conversation',
      message: 'Are you sure you want to delete this conversation? All messages, context, and history will be permanently deleted.',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await fetch(`/api/sessions/${sessionId}`, { method: 'DELETE' });
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    } catch (err) {
      console.error('Failed to delete session:', err);
    }
  };

  const handleToggleUnread = async (session: SessionRecord) => {
    const newStatus = session.is_unread ? 0 : 1;
    try {
      await fetch(`/api/sessions/${session.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_unread: newStatus }),
      });
      setSessions((prev) =>
        prev.map((s) => (s.id === session.id ? { ...s, is_unread: newStatus } : s))
      );
    } catch (err) {
      console.error('Failed to toggle unread:', err);
    }
  };

  const handleAutoRename = async (sessionId: string) => {
    try {
      const res = await fetch(`/api/sessions/${sessionId}/auto-rename`, { method: 'POST' });
      const data = await res.json();
      if (data.title) {
        setSessions((prev) =>
          prev.map((s) => (s.id === sessionId ? { ...s, title: data.title } : s))
        );
      }
    } catch (err) {
      console.error('Failed to auto rename:', err);
    }
  };

  return (
    <div className="min-h-screen bg-[#101010] text-[#cccccc] font-sans flex flex-col">
      {/* Top Header Bar */}
      <header className="h-12 px-6 border-b border-[#1f1f1f] bg-[#141414] flex items-center justify-between shrink-0 select-none">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="p-1.5 rounded-lg text-[#8c8c8c] hover:text-white hover:bg-[#202020] transition cursor-pointer flex items-center gap-1 text-xs"
            title="Back to Agent"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Workspace</span>
          </Link>
          <span className="text-[#333333]">/</span>
          <span className="text-sm font-semibold text-white">Conversation History</span>
        </div>
      </header>

      {/* Main Content Area matching Image 2 */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-6 py-10">
        <h1 className="text-2xl font-semibold text-white tracking-tight mb-6">
          Conversation History
        </h1>

        {/* Search & Filter Bar */}
        <div className="flex items-center gap-2 mb-8">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-[#6e6e6e] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search conversations..."
              className="w-full bg-[#161616] border border-[#262626] focus:border-[#3a3a3a] rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-[#666666] focus:outline-none transition-colors shadow-sm"
            />
          </div>

          {/* Filter Button */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowFilterDropdown(!showFilterDropdown)}
              className={`h-10 px-3 rounded-xl border flex items-center gap-1.5 text-xs transition cursor-pointer ${
                selectedProjectId !== 'all' || showFilterDropdown
                  ? 'bg-[#222222] border-[#3a3a3a] text-white'
                  : 'bg-[#161616] border-[#262626] text-[#8c8c8c] hover:text-white hover:bg-[#202020]'
              }`}
              title="Filter by project"
            >
              <Filter className="w-3.5 h-3.5" />
            </button>

            <BottomSheet
              isOpen={showFilterDropdown}
              onClose={() => setShowFilterDropdown(false)}
              title="Filter by Project"
              zIndex={1000}
              className="w-full sm:w-52 max-h-[75vh] sm:max-h-none overflow-y-auto bg-[#181818] border-t sm:border border-[#2a2a2a] sm:top-full sm:right-0 sm:mt-1.5 p-2 sm:p-1 text-sm sm:text-xs"
            >
              <div className="hidden sm:block px-2.5 py-1 text-[10px] font-semibold text-[#8c8c8c] border-b border-[#242424] uppercase tracking-wider mb-1">
                Filter by Project
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedProjectId('all');
                  setShowFilterDropdown(false);
                }}
                className={`w-full px-3 sm:px-2.5 py-2.5 sm:py-1.5 rounded-lg text-left transition cursor-pointer text-[13px] sm:text-xs ${
                  selectedProjectId === 'all'
                    ? 'bg-[#252525] text-white font-medium'
                    : 'text-[#9d9d9d] hover:bg-[#202020] hover:text-white'
                }`}
              >
                All Projects ({sessions.length})
              </button>
              {projects.map((p) => {
                const count = sessions.filter((s) => s.project_id === p.id).length;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setSelectedProjectId(p.id);
                      setShowFilterDropdown(false);
                    }}
                    className={`w-full px-3 sm:px-2.5 py-2.5 sm:py-1.5 rounded-lg text-left flex items-center justify-between transition cursor-pointer text-[13px] sm:text-xs ${
                      selectedProjectId === p.id
                        ? 'bg-[#252525] text-white font-medium'
                        : 'text-[#9d9d9d] hover:bg-[#202020] hover:text-white'
                    }`}
                  >
                    <span className="truncate">{p.name}</span>
                    <span className="text-[10px] text-[#666666] font-mono">{count}</span>
                  </button>
                );
              })}
            </BottomSheet>
          </div>
        </div>

        {/* Conversation List */}
        {loading ? (
          <div className="py-20 text-center text-xs text-[#6e6e6e]">Loading history...</div>
        ) : filteredSessions.length === 0 ? (
          <div className="py-20 text-center text-xs text-[#6e6e6e]">
            {searchQuery ? 'No matching conversations found.' : 'No conversations recorded yet.'}
          </div>
        ) : (
          <div className="space-y-1.5">
            {filteredSessions.map((sess) => {
              const proj = projectMap.get(sess.project_id);
              const isUnread = Boolean(sess.is_unread);

              return (
                <div
                  key={sess.id}
                  onClick={() => handleOpenConversation(sess)}
                  className="group px-4 py-3 rounded-xl bg-[#141414] hover:bg-[#191919] border border-[#202020] hover:border-[#2a2a2a] transition-all flex items-center justify-between cursor-pointer shadow-sm"
                >
                  {/* Left: Title & Project Sublabel */}
                  <div className="flex flex-col gap-1 min-w-0 pr-4">
                    <div className="flex items-center gap-2">
                      {isUnread && (
                        <div
                          className="w-2 h-2 rounded-full bg-[#3b82f6] shrink-0"
                          title="Unread conversation"
                        />
                      )}
                      <span className="text-[13.5px] font-medium text-[#e0e0e0] group-hover:text-white group-hover:underline transition truncate">
                        {sess.title}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 text-[11px] text-[#6e6e6e]">
                      <FolderIcon isOpen={false} className="w-3 h-3 text-[#6e6e6e] shrink-0" />
                      <span className="truncate">{proj?.name || 'aidev'}</span>
                      <span className="text-[#333333]">•</span>
                      <span className="font-mono">
                        {formatRelativeTime(sess.updated_at || sess.created_at)}
                      </span>
                    </div>
                  </div>

                  {/* Right: Actions on Hover matching Image 2 */}
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center gap-1 shrink-0"
                  >
                    {/* Split Button */}
                    <button
                      type="button"
                      onClick={() => handleSplitSession(sess, 'right')}
                      className="p-1.5 rounded-lg text-[#6e6e6e] hover:text-white hover:bg-[#222222] opacity-0 group-hover:opacity-100 transition cursor-pointer"
                      title="Open in Split View"
                    >
                      <Columns2 className="w-4 h-4" />
                    </button>

                    {/* 3-dots Menu matching Image 2 */}
                    <SessionMenu
                      session={sess}
                      projectName={proj?.name}
                      onStartRename={async () => {
                        const newTitle = await promptDialog({
                          title: 'Rename Conversation',
                          message: 'Enter a new title for this conversation:',
                          defaultValue: sess.title,
                          placeholder: 'Conversation title',
                        });
                        if (newTitle && newTitle.trim()) {
                          fetch(`/api/sessions/${sess.id}`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ title: newTitle.trim() }),
                          }).then(() => {
                            setSessions((prev) =>
                              prev.map((s) => (s.id === sess.id ? { ...s, title: newTitle.trim() } : s))
                            );
                          });
                        }
                      }}
                      onAutoRename={handleAutoRename}
                      onToggleUnread={handleToggleUnread}
                      onSplitSession={handleSplitSession}
                      onDeleteSession={handleDeleteSession}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
