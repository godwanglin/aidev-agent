'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Folder,
  HardDrive,
  ChevronRight,
  Search,
  Plus,
  X,
  Check,
  Code,
  Monitor,
  FileText,
  Download,
  Home,
  Loader2,
  ArrowUp,
  Edit2,
  ExternalLink,
  Layers,
  Copy,
} from 'lucide-react';

interface DirectoryItemInfo {
  name: string;
  isGit: boolean;
  isHidden: boolean;
}

interface QuickAccessItem {
  label: string;
  path: string;
  type: string;
}

interface DirectoryPickerModalProps {
  isOpen: boolean;
  initialPath?: string;
  onClose: () => void;
  onSelectDirectory: (directoryPath: string) => void;
}

export const DirectoryPickerModal: React.FC<DirectoryPickerModalProps> = ({
  isOpen,
  initialPath,
  onClose,
  onSelectDirectory,
}) => {
  const [currentPath, setCurrentPath] = useState('');
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [items, setItems] = useState<DirectoryItemInfo[]>([]);
  const [drives, setDrives] = useState<string[]>([]);
  const [quickAccess, setQuickAccess] = useState<QuickAccessItem[]>([]);
  const [selectedDir, setSelectedDir] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Manual path editing state
  const [isEditingPath, setIsEditingPath] = useState(false);
  const [manualPath, setManualPath] = useState('');

  // New folder creation state
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [isCreatingLoading, setIsCreatingLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Copied feedback
  const [isCopied, setIsCopied] = useState(false);

  // Detect Electron / desktop environment
  const isElectron = typeof window !== 'undefined' && Boolean(
    (window as any).electron ||
    (window as any).electronAPI ||
    (window as any).process?.versions?.electron ||
    navigator.userAgent.toLowerCase().includes('electron')
  );

  const loadDirectory = useCallback(async (pathQuery?: string) => {
    setLoading(true);
    setError(null);
    setSelectedDir(null);
    setIsCreatingFolder(false);
    setCreateError(null);
    try {
      const url = pathQuery
        ? `/api/files/dirs?path=${encodeURIComponent(pathQuery)}`
        : '/api/files/dirs';
      const res = await fetch(url);
      const data = await res.json();

      if (data.error && (!data.dirs || data.dirs.length === 0)) {
        setError(data.error);
      } else {
        setCurrentPath(data.currentPath);
        setManualPath(data.currentPath);
        setParentPath(data.parentPath);

        // Map items
        if (Array.isArray(data.items) && data.items.length > 0) {
          setItems(data.items);
        } else if (Array.isArray(data.dirs)) {
          setItems(
            data.dirs.map((d: string) => ({
              name: d,
              isGit: false,
              isHidden: d.startsWith('.'),
            }))
          );
        } else {
          setItems([]);
        }

        if (Array.isArray(data.drives)) {
          setDrives(data.drives);
        }
        if (Array.isArray(data.quickAccess)) {
          setQuickAccess(data.quickAccess);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to read directory');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      setIsEditingPath(false);
      setSearchQuery('');
      loadDirectory(initialPath);
    }
  }, [isOpen, initialPath, loadDirectory]);

  // Breadcrumbs calculation
  const breadcrumbSegments = useMemo(() => {
    if (!currentPath) return [];
    // Normalize path separators to forward slash for uniform splitting
    const normalized = currentPath.replace(/\\/g, '/');
    const parts = normalized.split('/').filter(Boolean);

    // If starts with drive letter like C:
    const segments: { label: string; fullPath: string }[] = [];
    let acc = '';

    if (/^[a-zA-Z]:/.test(normalized)) {
      const driveRoot = normalized.substring(0, 2) + '\\';
      acc = driveRoot;
      segments.push({ label: normalized.substring(0, 2), fullPath: driveRoot });
      const rest = parts.slice(1);
      for (const part of rest) {
        acc = acc.endsWith('\\') ? `${acc}${part}` : `${acc}\\${part}`;
        segments.push({ label: part, fullPath: acc });
      }
    } else {
      // Posix / root
      acc = '/';
      segments.push({ label: 'root', fullPath: '/' });
      for (const part of parts) {
        acc = acc === '/' ? `/${part}` : `${acc}/${part}`;
        segments.push({ label: part, fullPath: acc });
      }
    }

    return segments;
  }, [currentPath]);

  // Filtered folder items (dotfiles always hidden/off)
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (item.isHidden) return false;
      if (searchQuery.trim()) {
        return item.name.toLowerCase().includes(searchQuery.trim().toLowerCase());
      }
      return true;
    });
  }, [items, searchQuery]);

  // Selected full path
  const effectiveSelectedPath = useMemo(() => {
    if (selectedDir) {
      const sep = currentPath.endsWith('\\') || currentPath.endsWith('/') ? '' : '\\';
      return `${currentPath}${sep}${selectedDir}`;
    }
    return currentPath;
  }, [currentPath, selectedDir]);

  // Navigation handlers
  const handleSelectShortcut = (targetPath: string) => {
    loadDirectory(targetPath);
  };

  const handleDirClick = (dirName: string) => {
    setSelectedDir(dirName);
  };

  const handleDirDoubleClick = (dirName: string) => {
    const sep = currentPath.endsWith('\\') || currentPath.endsWith('/') ? '' : '\\';
    loadDirectory(`${currentPath}${sep}${dirName}`);
  };

  const handleNavigateUp = () => {
    if (parentPath) {
      loadDirectory(parentPath);
    }
  };

  // Submit manual path
  const handleManualPathSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (manualPath.trim()) {
      setIsEditingPath(false);
      loadDirectory(manualPath.trim());
    }
  };

  // Create new folder
  const handleCreateNewFolder = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newFolderName.trim()) return;

    setIsCreatingLoading(true);
    setCreateError(null);
    try {
      const res = await fetch('/api/files/dirs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parentPath: currentPath,
          folderName: newFolderName.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to create folder');
      }

      setIsCreatingFolder(false);
      setNewFolderName('');
      await loadDirectory(currentPath);
      setSelectedDir(data.name);
    } catch (err: any) {
      setCreateError(err.message || 'Failed to create folder');
    } finally {
      setIsCreatingLoading(false);
    }
  };

  // Confirm selection
  const handleConfirm = () => {
    if (effectiveSelectedPath) {
      onSelectDirectory(effectiveSelectedPath);
      onClose();
    }
  };

  // Copy path helper
  const handleCopyPath = () => {
    if (effectiveSelectedPath && typeof navigator !== 'undefined') {
      navigator.clipboard.writeText(effectiveSelectedPath);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }
  };

  // Render quick access icon
  const renderQuickAccessIcon = (type: string) => {
    switch (type) {
      case 'dev':
        return <Code className="w-3.5 h-3.5 text-[#007acc]" />;
      case 'desktop':
        return <Monitor className="w-3.5 h-3.5 text-[#888888]" />;
      case 'documents':
        return <FileText className="w-3.5 h-3.5 text-[#888888]" />;
      case 'downloads':
        return <Download className="w-3.5 h-3.5 text-[#888888]" />;
      case 'projects':
        return <Layers className="w-3.5 h-3.5 text-[#888888]" />;
      case 'home':
      default:
        return <Home className="w-3.5 h-3.5 text-[#888888]" />;
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center z-50 p-4 select-none animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-[760px] h-[520px] bg-[#141414] border border-[#262626] rounded-2xl shadow-2xl overflow-hidden flex flex-col font-sans animate-in zoom-in-95 duration-150">
        
        {/* 1. Header Bar */}
        <div className="px-4 py-3 border-b border-[#202020] bg-[#161616] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-[#202020] border border-[#2b2b2b] flex items-center justify-center text-[#aaaaaa] shrink-0">
              <Folder className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-xs font-semibold text-white tracking-wide truncate">
                Open Workspace / Project
              </h2>
              <p className="text-[10.5px] text-[#777777] truncate">
                Select a project directory to load into Aidev
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Native picker button (only in Electron desktop environment) */}
            {isElectron && (
              <button
                type="button"
                onClick={() => {
                  try {
                    (window as any).electronAPI?.openDirectoryPicker?.();
                  } catch {}
                }}
                className="px-2.5 py-1 rounded-lg bg-[#1f1f1f] hover:bg-[#282828] border border-[#2d2d2d] text-[#aaaaaa] hover:text-white text-[11px] font-medium transition cursor-pointer flex items-center gap-1.5"
                title="Open native Windows Explorer dialog"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Windows Explorer</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-[#666666] hover:text-white hover:bg-[#222222] transition cursor-pointer"
              title="Close (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 2. Navigation & Breadcrumb Toolbar */}
        <div className="px-3 py-2 border-b border-[#202020] bg-[#121212] flex items-center gap-2 shrink-0">
          {/* Breadcrumb Path Bar or Direct Input */}
          <div className="flex-1 min-w-0 bg-[#171717] border border-[#262626] rounded-lg px-2.5 py-1 flex items-center gap-1 text-[11.5px] font-mono overflow-x-auto scrollbar-none">
            {isEditingPath ? (
              <form onSubmit={handleManualPathSubmit} className="w-full flex items-center gap-1">
                <input
                  type="text"
                  autoFocus
                  value={manualPath}
                  onChange={(e) => setManualPath(e.target.value)}
                  onBlur={() => setIsEditingPath(false)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      setManualPath(currentPath);
                      setIsEditingPath(false);
                    }
                  }}
                  className="w-full bg-transparent text-white text-[11.5px] font-mono focus:outline-none"
                  placeholder="Enter directory path (e.g. C:\dev\my-app)..."
                />
                <button
                  type="submit"
                  className="px-2 py-0.5 rounded bg-[#007acc] text-white text-[10.5px] font-sans font-medium"
                >
                  Go
                </button>
              </form>
            ) : (
              <div className="w-full flex items-center justify-between gap-2">
                <div className="flex items-center gap-1 min-w-0 overflow-x-auto scrollbar-none">
                  {breadcrumbSegments.map((seg, idx) => {
                    const isLast = idx === breadcrumbSegments.length - 1;
                    return (
                      <React.Fragment key={seg.fullPath}>
                        {idx > 0 && <span className="text-[#555555] select-none">/</span>}
                        <button
                          type="button"
                          onClick={() => loadDirectory(seg.fullPath)}
                          className={`px-1.5 py-0.5 rounded transition truncate shrink-0 cursor-pointer ${
                            isLast
                              ? 'bg-[#222222] text-white font-semibold'
                              : 'text-[#888888] hover:text-white hover:bg-[#1f1f1f]'
                          }`}
                          title={seg.fullPath}
                        >
                          {seg.label}
                        </button>
                      </React.Fragment>
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={() => setIsEditingPath(true)}
                  className="p-1 text-[#666666] hover:text-white rounded hover:bg-[#222222] transition shrink-0"
                  title="Edit or paste path manually"
                >
                  <Edit2 className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>

          {/* Search / Filter Input in Current Directory */}
          <div className="relative w-40 shrink-0">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter folders..."
              className="w-full bg-[#171717] border border-[#262626] rounded-lg pl-7 pr-2 py-1 text-[11.5px] text-white placeholder-[#666666] focus:outline-none focus:border-[#383838] transition font-sans"
            />
            <Search className="w-3.5 h-3.5 text-[#666666] absolute left-2 top-2 pointer-events-none" />
          </div>


          {/* New Folder Action Button */}
          <button
            type="button"
            onClick={() => {
              setIsCreatingFolder(true);
              setNewFolderName('');
              setCreateError(null);
            }}
            className="px-2.5 py-1 rounded-lg bg-[#1e1e1e] hover:bg-[#262626] border border-[#2d2d2d] text-white text-[11px] font-medium transition cursor-pointer flex items-center gap-1 shrink-0"
            title="Create new folder in this directory"
          >
            <Plus className="w-3.5 h-3.5 text-[#aaaaaa]" />
            <span>New Folder</span>
          </button>
        </div>

        {/* 3. Main Body: Dual-Pane (Shortcuts Sidebar + Folder Grid) */}
        <div className="flex-1 min-h-0 flex overflow-hidden">
          
          {/* Left Shortcuts Sidebar */}
          <div className="w-48 bg-[#121212] border-r border-[#202020] p-2.5 space-y-3.5 overflow-y-auto shrink-0 select-none scrollbar-thin scrollbar-thumb-[#242424]">
            {/* Quick Access Section */}
            <div>
              <div className="px-2 py-0.5 text-[9.5px] font-semibold text-[#555555] uppercase tracking-wider">
                Quick Access
              </div>
              <div className="space-y-0.5 mt-1">
                {quickAccess.map((qa) => {
                  const isActive = currentPath.toLowerCase() === qa.path.toLowerCase();
                  return (
                    <button
                      key={qa.path}
                      type="button"
                      onClick={() => handleSelectShortcut(qa.path)}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[11px] transition text-left cursor-pointer ${
                        isActive
                          ? 'bg-[#222222] text-white font-medium border border-[#2b2b2b]'
                          : 'text-[#999999] hover:bg-[#1a1a1a] hover:text-white border border-transparent'
                      }`}
                      title={qa.path}
                    >
                      {renderQuickAccessIcon(qa.type)}
                      <span className="truncate">{qa.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Drives Section (Windows) */}
            {drives.length > 0 && (
              <div>
                <div className="px-2 py-0.5 text-[9.5px] font-semibold text-[#555555] uppercase tracking-wider">
                  Drives
                </div>
                <div className="space-y-0.5 mt-1">
                  {drives.map((drv) => {
                    const isActive = currentPath.toLowerCase().startsWith(drv.toLowerCase());
                    return (
                      <button
                        key={drv}
                        type="button"
                        onClick={() => handleSelectShortcut(drv)}
                        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[11px] transition text-left cursor-pointer ${
                          isActive
                            ? 'bg-[#222222] text-white font-medium border border-[#2b2b2b]'
                            : 'text-[#999999] hover:bg-[#1a1a1a] hover:text-white border border-transparent'
                        }`}
                        title={drv}
                      >
                        <HardDrive className={`w-3.5 h-3.5 ${isActive ? 'text-[#38bdf8]' : 'text-[#777777]'}`} />
                        <span className="truncate">{drv}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Right Folder Grid Area */}
          <div className="flex-1 bg-[#141414] p-3 overflow-y-auto flex flex-col scrollbar-thin scrollbar-thumb-[#242424]">
            
            {/* Inline New Folder Form */}
            {isCreatingFolder && (
              <form
                onSubmit={handleCreateNewFolder}
                className="mb-3 p-2.5 rounded-xl bg-[#1a1a1a] border border-[#2e2e2e] flex items-center gap-2 animate-in fade-in zoom-in-95 duration-100"
              >
                <Folder className="w-4 h-4 text-[#007acc] shrink-0" />
                <input
                  type="text"
                  autoFocus
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="New folder name..."
                  className="flex-1 bg-[#121212] border border-[#333333] rounded-lg px-2.5 py-1 text-xs text-white placeholder-[#666666] focus:outline-none focus:border-[#007acc]"
                />
                <button
                  type="submit"
                  disabled={isCreatingLoading || !newFolderName.trim()}
                  className="px-3 py-1 rounded-lg bg-[#007acc] hover:bg-[#0069b3] text-white text-xs font-medium transition cursor-pointer disabled:opacity-50 flex items-center gap-1"
                >
                  {isCreatingLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                  <span>Create</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsCreatingFolder(false)}
                  className="px-2.5 py-1 rounded-lg bg-[#222222] hover:bg-[#282828] text-[#aaaaaa] hover:text-white text-xs transition cursor-pointer"
                >
                  Cancel
                </button>
              </form>
            )}

            {createError && (
              <div className="mb-2 p-2 rounded-lg bg-red-900/20 border border-red-800/40 text-red-400 text-xs">
                {createError}
              </div>
            )}

            {/* Error banner */}
            {error && (
              <div className="mb-3 p-3 rounded-xl bg-red-900/20 border border-red-800/40 text-red-400 text-xs">
                {error}
              </div>
            )}

            {/* Parent Directory Item (Go Up) */}
            {parentPath && (
              <button
                type="button"
                onClick={handleNavigateUp}
                className="mb-2 w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[#888888] hover:text-white hover:bg-[#1c1c1c] border border-dashed border-[#262626] transition text-left cursor-pointer group"
                title={`Go up to parent directory: ${parentPath}`}
              >
                <ArrowUp className="w-3.5 h-3.5 text-[#666666] group-hover:text-white transition" />
                <span className="font-mono text-xs text-[#888888] group-hover:text-white">.. (Parent Directory)</span>
              </button>
            )}

            {/* Loading Indicator */}
            {loading ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-[#777777] space-y-2">
                <Loader2 className="w-5 h-5 animate-spin text-[#007acc]" />
                <span className="text-xs">Loading directory...</span>
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-[#555555] space-y-1.5 text-center">
                <Folder className="w-8 h-8 text-[#333333]" />
                <span className="text-xs text-[#777777]">
                  {searchQuery ? `No folders matching "${searchQuery}"` : 'This directory is empty'}
                </span>
                {!searchQuery && (
                  <button
                    type="button"
                    onClick={() => setIsCreatingFolder(true)}
                    className="mt-2 text-xs text-[#007acc] hover:underline"
                  >
                    + Create a new folder here
                  </button>
                )}
              </div>
            ) : (
              /* Folder Cards Grid */
              <div className="grid grid-cols-2 gap-2">
                {filteredItems.map((item) => {
                  const isSelected = selectedDir === item.name;
                  return (
                    <div
                      key={item.name}
                      onClick={() => handleDirClick(item.name)}
                      onDoubleClick={() => handleDirDoubleClick(item.name)}
                      className={`p-2.5 rounded-xl border transition cursor-pointer flex items-center justify-between group select-none ${
                        isSelected
                          ? 'bg-[#1e1e1e] border-[#007acc] text-white shadow-xs'
                          : 'bg-[#181818] border-[#242424] hover:border-[#333333] text-[#cccccc] hover:bg-[#1b1b1b]'
                      }`}
                      title={`${item.name} (Double-click to open folder)`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <div
                          className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition ${
                            isSelected
                              ? 'bg-[#007acc]/20 text-[#38bdf8]'
                              : 'bg-[#222222] text-[#888888] group-hover:text-[#aaaaaa]'
                          }`}
                        >
                          <Folder className="w-4 h-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-[12px] font-medium truncate flex items-center gap-1.5">
                            <span className="truncate">{item.name}</span>
                            {item.isGit && (
                              <span
                                className="text-[9px] font-mono px-1 py-0.2 rounded bg-[#242424] text-[#7ee787] border border-[#2e2e2e] shrink-0"
                                title="Git Repository"
                              >
                                git
                              </span>
                            )}
                            {item.isHidden && (
                              <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-[#222222] text-[#666666] border border-[#2a2a2a] shrink-0">
                                dot
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right Indicator (Checkmark if selected, Chevron on hover) */}
                      <div className="shrink-0 ml-1">
                        {isSelected ? (
                          <Check className="w-4 h-4 text-[#007acc]" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5 text-transparent group-hover:text-[#555555] transition" />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* 4. Bottom Footer */}
        <div className="px-4 py-2.5 border-t border-[#202020] bg-[#161616] flex items-center justify-between shrink-0">
          {/* Selected Path Display */}
          <div className="flex items-center gap-2 min-w-0 pr-3 flex-1">
            <span className="text-[11px] text-[#777777] shrink-0">Selected Directory:</span>
            <span
              className="font-mono text-xs text-white truncate font-medium bg-[#1a1a1a] px-2 py-1 rounded-md border border-[#262626] flex-1 max-w-[420px]"
              title={effectiveSelectedPath}
            >
              {effectiveSelectedPath || '-'}
            </span>
            {effectiveSelectedPath && (
              <button
                type="button"
                onClick={handleCopyPath}
                className="p-1 rounded text-[#777777] hover:text-white hover:bg-[#222222] transition shrink-0"
                title="Copy directory path"
              >
                {isCopied ? <Check className="w-3.5 h-3.5 text-[#7ee787]" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg bg-[#202020] hover:bg-[#282828] border border-[#2c2c2c] text-[#cccccc] hover:text-white text-xs font-medium transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={!effectiveSelectedPath}
              className="px-4 py-1.5 rounded-lg bg-[#007acc] hover:bg-[#0069b3] active:scale-98 text-white text-xs font-semibold shadow-sm transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Open Workspace</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
