'use client';

import React, { useState } from 'react';
import { X, Plus, Trash2, FileText, Globe, Terminal, Shield, Check, RotateCcw } from 'lucide-react';

export type PermissionRuleCategory = 'files' | 'network' | 'terminal';

export interface LocalPermissionsState {
  fileRules: string[];
  networkRules: string[];
  terminalRules: string[];
}

interface PermissionsRulesModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialCategory?: PermissionRuleCategory;
  permissions: LocalPermissionsState;
  onSavePermissions: (updated: LocalPermissionsState) => void;
}

export const PermissionsRulesModal: React.FC<PermissionsRulesModalProps> = ({
  isOpen,
  onClose,
  initialCategory = 'files',
  permissions,
  onSavePermissions,
}) => {
  const [activeCategory, setActiveCategory] = useState<PermissionRuleCategory>(initialCategory);
  const [newRuleInput, setNewRuleInput] = useState('');
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const currentRules =
    activeCategory === 'files'
      ? permissions.fileRules
      : activeCategory === 'network'
      ? permissions.networkRules
      : permissions.terminalRules;

  const handleAddRule = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = newRuleInput.trim();
    if (!trimmed) return;

    if (currentRules.includes(trimmed)) {
      setFeedbackMsg('Rule already exists.');
      setTimeout(() => setFeedbackMsg(null), 2000);
      return;
    }

    const updated: LocalPermissionsState = {
      ...permissions,
      [activeCategory === 'files'
        ? 'fileRules'
        : activeCategory === 'network'
        ? 'networkRules'
        : 'terminalRules']: [...currentRules, trimmed],
    };

    onSavePermissions(updated);
    setNewRuleInput('');
  };

  const handleRemoveRule = (idx: number) => {
    const nextList = currentRules.filter((_, i) => i !== idx);
    const updated: LocalPermissionsState = {
      ...permissions,
      [activeCategory === 'files'
        ? 'fileRules'
        : activeCategory === 'network'
        ? 'networkRules'
        : 'terminalRules']: nextList,
    };
    onSavePermissions(updated);
  };

  const handleResetDefaults = () => {
    const defaults: LocalPermissionsState = {
      fileRules: ['src/**', 'package.json', 'public/**', 'tsconfig.json'],
      networkRules: ['https://github.com/*', 'https://*.google.com/*', 'https://registry.npmjs.org/*'],
      terminalRules: ['npm run *', 'git status', 'git diff', 'ls', 'dir', 'pnpm *'],
    };
    onSavePermissions(defaults);
    setFeedbackMsg('Reset to defaults.');
    setTimeout(() => setFeedbackMsg(null), 2000);
  };

  const getPlaceholder = () => {
    switch (activeCategory) {
      case 'files':
        return 'e.g. src/** or !.env*';
      case 'network':
        return 'e.g. https://api.github.com/*';
      case 'terminal':
        return 'e.g. cargo build or python test.py';
    }
  };

  return (
    <div
      className="fixed inset-0 z-[999999] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-xl bg-[#121214] border border-[#26262a] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#202024] bg-[#161618]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#202026] border border-[#2a2a32] flex items-center justify-center text-[#3b82f6]">
              <Shield className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[13.5px] font-semibold text-white">Local Permissions Editor</div>
              <div className="text-[11px] text-[#868686]">Manage granular security rules for this workspace</div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-[#737373] hover:text-white hover:bg-[#202024] transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-[#202024] bg-[#141416] px-3 pt-2 gap-1 select-none">
          <button
            type="button"
            onClick={() => {
              setActiveCategory('files');
              setNewRuleInput('');
            }}
            className={`flex items-center gap-2 px-3 py-2 rounded-t-lg text-[12px] font-medium transition cursor-pointer border-b-2 ${
              activeCategory === 'files'
                ? 'border-[#3b82f6] text-white bg-[#1a1a1e]'
                : 'border-transparent text-[#888888] hover:text-white hover:bg-[#18181c]'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>File Access ({permissions.fileRules.length})</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveCategory('network');
              setNewRuleInput('');
            }}
            className={`flex items-center gap-2 px-3 py-2 rounded-t-lg text-[12px] font-medium transition cursor-pointer border-b-2 ${
              activeCategory === 'network'
                ? 'border-[#3b82f6] text-white bg-[#1a1a1e]'
                : 'border-transparent text-[#888888] hover:text-white hover:bg-[#18181c]'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>Network Access ({permissions.networkRules.length})</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveCategory('terminal');
              setNewRuleInput('');
            }}
            className={`flex items-center gap-2 px-3 py-2 rounded-t-lg text-[12px] font-medium transition cursor-pointer border-b-2 ${
              activeCategory === 'terminal'
                ? 'border-[#3b82f6] text-white bg-[#1a1a1e]'
                : 'border-transparent text-[#888888] hover:text-white hover:bg-[#18181c]'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>Terminal ({permissions.terminalRules.length})</span>
          </button>
        </div>

        {/* Body Content */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {/* Add Rule Form */}
          <form onSubmit={handleAddRule} className="flex gap-2">
            <input
              type="text"
              value={newRuleInput}
              onChange={(e) => setNewRuleInput(e.target.value)}
              placeholder={getPlaceholder()}
              className="flex-1 bg-[#18181c] border border-[#2a2a30] focus:border-[#3b82f6] rounded-lg px-3 py-2 text-[12px] font-mono text-white placeholder-[#606066] outline-none transition"
            />
            <button
              type="submit"
              disabled={!newRuleInput.trim()}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#3b82f6] hover:bg-[#2563eb] disabled:opacity-40 disabled:pointer-events-none text-white text-[12px] font-medium transition cursor-pointer shrink-0 shadow"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add</span>
            </button>
          </form>

          {feedbackMsg && (
            <div className="flex items-center gap-1.5 text-[11px] text-[#3b82f6] animate-fade-in">
              <Check className="w-3 h-3" />
              <span>{feedbackMsg}</span>
            </div>
          )}

          {/* Rule Items List */}
          <div className="space-y-1.5 pt-1">
            <div className="text-[11px] font-medium text-[#737373] uppercase tracking-wider px-1">
              Active Whitelist Patterns
            </div>
            {currentRules.length === 0 ? (
              <div className="text-center py-8 text-[12px] text-[#666666] border border-dashed border-[#26262a] rounded-xl bg-[#141416]">
                No rules defined for this category. All standard actions follow permission presets.
              </div>
            ) : (
              <div className="border border-[#222226] rounded-xl divide-y divide-[#1e1e22] bg-[#141416] overflow-hidden">
                {currentRules.map((rule, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between px-3.5 py-2.5 hover:bg-[#1a1a1e] transition group"
                  >
                    <div className="font-mono text-[11.5px] text-[#dededf] truncate flex-1 pr-3">
                      {rule}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveRule(idx)}
                      className="p-1 rounded text-[#707076] hover:text-red-400 hover:bg-red-500/10 transition cursor-pointer shrink-0"
                      title="Delete rule"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-[#202024] bg-[#161618] flex items-center justify-between">
          <button
            type="button"
            onClick={handleResetDefaults}
            className="flex items-center gap-1.5 text-[11.5px] text-[#868686] hover:text-white transition cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset Defaults</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-[#202024] hover:bg-[#28282e] border border-[#2e2e34] text-[12px] font-medium text-white transition cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
