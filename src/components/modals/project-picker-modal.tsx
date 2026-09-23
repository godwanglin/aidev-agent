'use client';

import React, { useState } from 'react';
import { FolderOpen, X, Clock, Plus, Check } from 'lucide-react';
import type { ProjectRecord } from '@/lib/db';

interface ProjectPickerModalProps {
  isOpen: boolean;
  projects: ProjectRecord[];
  currentProjectId?: string;
  onClose: () => void;
  onSelectProject: (project: ProjectRecord) => void;
  onCreateProject: (workdirPath?: string, name?: string) => void;
}

export const ProjectPickerModal: React.FC<ProjectPickerModalProps> = ({
  isOpen,
  projects,
  currentProjectId,
  onClose,
  onSelectProject,
  onCreateProject,
}) => {
  const [customPath, setCustomPath] = useState('');
  const [customName, setCustomName] = useState('');

  if (!isOpen) return null;

  const handleCreateCustom = () => {
    if (!customPath.trim()) {
      // Create default
      onCreateProject();
    } else {
      onCreateProject(customPath.trim(), customName.trim() || undefined);
    }
    setCustomPath('');
    setCustomName('');
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 select-none">
      <div className="w-full max-w-lg rounded-xl border border-white/[0.08] bg-[#13161e] shadow-soft overflow-hidden flex flex-col max-h-[85vh]">
        {/* Modal Header */}
        <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
          <div className="flex items-center gap-2 font-medium text-sm text-zinc-200">
            <FolderOpen className="w-4 h-4 text-zinc-400" />
            <span>Select Workspace / Working Directory</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-zinc-400 hover:text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 space-y-4 overflow-y-auto">
          {/* Custom Path Input */}
          <div className="space-y-2 bg-[#0d0f14] p-3 rounded-lg border border-white/[0.06]">
            <label className="text-xs font-medium text-zinc-300 block">
              Open Local Directory Path:
            </label>
            <input
              type="text"
              value={customPath}
              onChange={(e) => setCustomPath(e.target.value)}
              placeholder="e.g. C:\dev\my-app or /home/user/projects/app"
              className="w-full bg-[#13161e] border border-white/[0.08] rounded px-3 py-1.5 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-500 font-mono"
            />
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="Optional Display Name"
                className="flex-1 bg-[#13161e] border border-white/[0.08] rounded px-3 py-1 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
              />
              <button
                onClick={handleCreateCustom}
                className="px-3 py-1 rounded bg-zinc-100 hover:bg-white text-zinc-900 text-xs font-medium transition shrink-0"
              >
                {customPath ? 'Open Directory' : 'Create Default Sandbox'}
              </button>
            </div>
            <p className="text-[10px] text-zinc-500">
              Leaving the path blank will initialize a sandbox workspace in <code className="text-zinc-400 font-mono">.aidev/projects/</code>.
            </p>
          </div>

          {/* Recent Workspaces List */}
          <div className="space-y-1.5">
            <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider block px-1">
              Recent Projects ({projects.length})
            </span>

            {projects.length === 0 ? (
              <div className="text-xs text-zinc-500 text-center py-4">
                No recent projects registered yet.
              </div>
            ) : (
              <div className="space-y-1 max-h-56 overflow-y-auto">
                {projects.map((proj) => {
                  const isCurrent = proj.id === currentProjectId;
                  return (
                    <div
                      key={proj.id}
                      onClick={() => {
                        onSelectProject(proj);
                        onClose();
                      }}
                      className={`p-2.5 rounded-lg border transition cursor-pointer flex items-center justify-between text-xs ${
                        isCurrent
                          ? 'bg-white/[0.05] border-zinc-500'
                          : 'bg-[#0d0f14] border-white/[0.06] hover:border-white/[0.12]'
                      }`}
                    >
                      <div className="min-w-0 flex-1 pr-2">
                        <div className="font-medium text-zinc-200 flex items-center gap-1.5">
                          <span>{proj.name}</span>
                          {isCurrent && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 font-mono">
                              Active
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-zinc-500 font-mono truncate" title={proj.workdir_path}>
                          {proj.workdir_path}
                        </div>
                      </div>

                      <span className="text-[10px] text-zinc-500 font-mono shrink-0">
                        {new Date(proj.last_opened_at).toLocaleDateString()}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
