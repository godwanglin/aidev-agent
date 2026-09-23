'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  GitBranch,
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  RefreshCw,
  Plus,
  Minus,
  Check,
  Loader2,
  Sparkles,
  Send,
  AlertCircle,
  ExternalLink,
  X,
  FileCode,
  Terminal,
  Columns,
  AlignJustify,
  ChevronDown,
  Search,
  GitCommit,
  RotateCcw,
  Trash2,
  History,
  Archive,
  Copy,
  Download,
  FileDiff,
  Calendar,
  User,
  Folder,
} from 'lucide-react';
import type {
  GitFileChange,
  GitRepoStatus,
  GitCommitLog,
  GitCommitDetail,
  GitStashItem,
} from '@/lib/git/git-service';
import type { GitResolutionStatus } from '@/lib/git/git-resolver';
import { DiffViewer } from './diff-viewer';
import { AestheticFileIcon } from '@/components/common/aesthetic-file-icon';

interface GitViewProps {
  workdir: string;
  projectName?: string;
  onOpenTerminal?: () => void;
}

export const GitView: React.FC<GitViewProps> = ({ workdir, projectName, onOpenTerminal }) => {
  const [gitStatus, setGitStatus] = useState<GitResolutionStatus | null>(null);
  const [repoStatus, setRepoStatus] = useState<GitRepoStatus | null>(() => {
    if (typeof window !== 'undefined' && workdir && workdir !== 'no_project') {
      try {
        const cached = sessionStorage.getItem(`aidev_git_status_${workdir}`);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed && typeof parsed.isRepo === 'boolean') {
            return parsed;
          }
        }
      } catch {}
    }
    return null;
  });
  const [isLoading, setIsLoading] = useState<boolean>(() => {
    if (typeof window !== 'undefined' && workdir && workdir !== 'no_project') {
      try {
        const cached = sessionStorage.getItem(`aidev_git_status_${workdir}`);
        if (cached) return false;
      } catch {}
    }
    return !workdir || workdir === 'no_project' ? false : true;
  });
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Sync repoStatus and isLoading when workdir prop changes
  useEffect(() => {
    if (!workdir || !workdir.trim() || workdir === 'no_project') {
      setRepoStatus(null);
      setIsLoading(false);
      return;
    }

    let hasCached = false;
    if (typeof window !== 'undefined') {
      try {
        const cached = sessionStorage.getItem(`aidev_git_status_${workdir}`);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed && typeof parsed.isRepo === 'boolean') {
            setRepoStatus(parsed);
            setIsLoading(false);
            hasCached = true;
          }
        }
      } catch {}
    }

    if (!hasCached) {
      setRepoStatus(null);
      setIsLoading(true);
    }
  }, [workdir]);

  const displayProjectName =
    projectName ||
    (workdir && workdir !== 'no_project'
      ? workdir.replace(/[/\\]+$/, '').split(/[/\\]/).filter(Boolean).pop()
      : '') ||
    '';

  // Sub-tab view: 'changes' | 'history' | 'stash'
  const [activeTab, setActiveTab] = useState<'changes' | 'history' | 'stash'>('changes');

  // Commit form state
  const [commitMessage, setCommitMessage] = useState('');
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [isPulling, setIsPulling] = useState(false);

  // Selected file for diff viewer in Changes tab
  const [selectedFile, setSelectedFile] = useState<{
    path: string;
    staged: boolean;
  } | null>(null);
  const [fileDiffData, setFileDiffData] = useState<{
    originalContent: string;
    currentContent: string;
  } | null>(null);
  const [isLoadingDiff, setIsLoadingDiff] = useState(false);
  const [diffMode, setDiffMode] = useState<'split' | 'stacked'>('stacked');

  // Discard modal state
  const [discardModal, setDiscardModal] = useState<{
    isOpen: boolean;
    files: string[];
    isAll?: boolean;
  } | null>(null);
  const [isDiscarding, setIsDiscarding] = useState(false);

  // History (Git Log) state
  const [commitLogs, setCommitLogs] = useState<GitCommitLog[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [selectedCommit, setSelectedCommit] = useState<GitCommitDetail | null>(null);
  const [isLoadingCommitDetail, setIsLoadingCommitDetail] = useState(false);
  const [selectedCommitFile, setSelectedCommitFile] = useState<string | null>(null);
  const [commitFileDiffData, setCommitFileDiffData] = useState<{
    originalContent: string;
    currentContent: string;
  } | null>(null);
  const [isLoadingCommitDiff, setIsLoadingCommitDiff] = useState(false);
  const [copiedHash, setCopiedHash] = useState(false);

  // Stash state
  const [stashes, setStashes] = useState<GitStashItem[]>([]);
  const [isLoadingStashes, setIsLoadingStashes] = useState(false);
  const [stashMessage, setStashMessage] = useState('');
  const [isStashing, setIsStashing] = useState(false);

  // Delete branch modal state
  const [deleteBranchConfirm, setDeleteBranchConfirm] = useState<string | null>(null);
  const [isDeletingBranch, setIsDeletingBranch] = useState(false);

  // Notifications / Auth Dialog
  const [authErrorModal, setAuthErrorModal] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Branch switcher state
  const [isBranchDropdownOpen, setIsBranchDropdownOpen] = useState(false);
  const [branchesData, setBranchesData] = useState<{
    current: string;
    local: string[];
    remote: string[];
  }>({ current: '', local: [], remote: [] });
  const [branchSearch, setBranchSearch] = useState('');
  const [isBranchLoading, setIsBranchLoading] = useState(false);
  const [isSwitchingBranch, setIsSwitchingBranch] = useState(false);
  const branchDropdownRef = useRef<HTMLDivElement>(null);

  // Close branch dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (branchDropdownRef.current && !branchDropdownRef.current.contains(e.target as Node)) {
        setIsBranchDropdownOpen(false);
      }
    };
    if (isBranchDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isBranchDropdownOpen]);

  // Commit popover state
  const [isCommitPopoverOpen, setIsCommitPopoverOpen] = useState(false);
  const commitPopoverRef = useRef<HTMLDivElement>(null);

  // Close commit popover on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (commitPopoverRef.current && !commitPopoverRef.current.contains(e.target as Node)) {
        setIsCommitPopoverOpen(false);
      }
    };
    if (isCommitPopoverOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isCommitPopoverOpen]);

  // Split panel resize state (between file list on the left and diff viewer on the right)
  const [leftPanelWidth, setLeftPanelWidth] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('aidev_git_left_panel_width');
        if (saved) {
          const parsed = parseInt(saved, 10);
          if (!isNaN(parsed) && parsed >= 180 && parsed <= 900) return parsed;
        }
      } catch {}
    }
    return 320;
  });
  const [isResizing, setIsResizing] = useState(false);
  const [stagedLimit, setStagedLimit] = useState(60);
  const [unstagedLimit, setUnstagedLimit] = useState(60);
  const [isLgScreen, setIsLgScreen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const splitPaneRef = useRef<HTMLDivElement>(null);
  const leftWidthRef = useRef(leftPanelWidth);
  leftWidthRef.current = leftPanelWidth;

  useEffect(() => {
    const handleResize = () => {
      setIsLgScreen(window.innerWidth >= 1024);
      setIsMobile(window.innerWidth < 640);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleResizerMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  };

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!splitPaneRef.current) return;
      const rect = splitPaneRef.current.getBoundingClientRect();
      const newWidth = e.clientX - rect.left;
      const minWidth = 180;
      const maxWidth = Math.max(minWidth, rect.width - 240);
      const clamped = Math.max(minWidth, Math.min(maxWidth, newWidth));
      setLeftPanelWidth(clamped);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem('aidev_git_left_panel_width', String(leftWidthRef.current));
        } catch {}
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  // Fetch status
  const fetchStatus = useCallback(async (silent = false) => {
    if (!workdir || !workdir.trim() || workdir === 'no_project') {
      setRepoStatus(null);
      setIsLoading(false);
      setIsRefreshing(false);
      return;
    }

    if (!silent) setIsRefreshing(true);
    try {
      const res = await fetch(`/api/git/status?workdir=${encodeURIComponent(workdir)}`);
      if (res.ok) {
        const data = await res.json();
        setGitStatus(data.gitStatus);
        setRepoStatus(data.repoStatus);

        if (data.repoStatus && typeof window !== 'undefined') {
          try {
            sessionStorage.setItem(`aidev_git_status_${workdir}`, JSON.stringify(data.repoStatus));
          } catch {}
        }
      }
    } catch (err: any) {
      console.error('Failed fetching git status:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [workdir]);

  const fetchBranches = useCallback(async () => {
    if (!workdir || !workdir.trim() || workdir === 'no_project') {
      setBranchesData({
        current: '',
        local: [],
        remote: [],
      });
      return;
    }

    try {
      setIsBranchLoading(true);
      const res = await fetch(`/api/git/branches?workdir=${encodeURIComponent(workdir)}`);
      if (res.ok) {
        const data = await res.json();
        setBranchesData({
          current: data.current || repoStatus?.branch || '',
          local: data.local || [],
          remote: data.remote || [],
        });
      }
    } catch (err) {
      console.error('Failed fetching branches:', err);
    } finally {
      setIsBranchLoading(false);
    }
  }, [workdir, repoStatus?.branch]);

  const handleToggleBranchDropdown = () => {
    if (!isBranchDropdownOpen) {
      setBranchSearch('');
      fetchBranches();
      setIsBranchDropdownOpen(true);
    } else {
      setIsBranchDropdownOpen(false);
    }
  };

  const handleSwitchBranch = async (targetBranch: string) => {
    if (targetBranch === repoStatus?.branch) {
      setIsBranchDropdownOpen(false);
      return;
    }
    try {
      setIsSwitchingBranch(true);
      setActionError(null);
      const res = await fetch('/api/git/branches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workdir,
          action: 'checkout',
          branch: targetBranch,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to switch branch.');
      }
      setIsBranchDropdownOpen(false);
      setActionSuccess(`Switched to branch '${targetBranch}'.`);
      if (data.repoStatus) {
        setRepoStatus(data.repoStatus);
      }
      fetchStatus(true);
      setSelectedFile(null);
      setFileDiffData(null);
    } catch (err: any) {
      setActionError(err.message || 'Failed to switch branch.');
    } finally {
      setIsSwitchingBranch(false);
    }
  };

  const handleCreateBranch = async (newBranchName: string) => {
    const cleanName = newBranchName.trim();
    if (!cleanName) return;
    try {
      setIsSwitchingBranch(true);
      setActionError(null);
      const res = await fetch('/api/git/branches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workdir,
          action: 'create',
          branch: cleanName,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to create new branch.');
      }
      setIsBranchDropdownOpen(false);
      setActionSuccess(`Branch '${cleanName}' created and checked out.`);
      if (data.repoStatus) {
        setRepoStatus(data.repoStatus);
      }
      fetchStatus(true);
      setSelectedFile(null);
      setFileDiffData(null);
    } catch (err: any) {
      setActionError(err.message || 'Failed to create branch.');
    } finally {
      setIsSwitchingBranch(false);
    }
  };

  const handleDeleteBranch = async (branchName: string) => {
    setIsDeletingBranch(true);
    setActionError(null);
    try {
      const res = await fetch('/api/git/branches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workdir, action: 'delete', branch: branchName }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to delete branch.');
      }
      setActionSuccess(`Branch '${branchName}' deleted successfully.`);
      setTimeout(() => setActionSuccess(null), 3000);
      setDeleteBranchConfirm(null);
      fetchBranches();
      if (data.repoStatus) setRepoStatus(data.repoStatus);
    } catch (err: any) {
      setActionError(err.message || 'Failed to delete branch.');
    } finally {
      setIsDeletingBranch(false);
    }
  };

  // Pull / Sync from remote
  const handlePull = async () => {
    setIsPulling(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await fetch('/api/git/pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workdir }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        if (data.requiresAuth) {
          setAuthErrorModal(data.error || 'Remote authentication required to pull.');
        } else {
          setActionError(data.error || 'Failed to pull from remote.');
        }
        return;
      }
      if (data.repoStatus) setRepoStatus(data.repoStatus);
      setActionSuccess('Pull successful! Repository is up to date.');
      setTimeout(() => setActionSuccess(null), 4000);
      fetchStatus(true);
    } catch (err: any) {
      setActionError(err.message || 'An error occurred while pulling.');
    } finally {
      setIsPulling(false);
    }
  };

  // Discard changes
  const handleDiscardConfirm = async () => {
    if (!discardModal) return;
    setIsDiscarding(true);
    setActionError(null);
    try {
      const res = await fetch('/api/git/discard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workdir,
          files: discardModal.files,
          all: Boolean(discardModal.isAll),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to discard changes.');
      }
      if (data.repoStatus) setRepoStatus(data.repoStatus);
      if (selectedFile && (discardModal.isAll || discardModal.files.includes(selectedFile.path))) {
        setSelectedFile(null);
        setFileDiffData(null);
      }
      setDiscardModal(null);
      setActionSuccess('Changes discarded successfully.');
      setTimeout(() => setActionSuccess(null), 3000);
      fetchStatus(true);
    } catch (err: any) {
      setActionError(err.message || 'Failed to discard changes.');
    } finally {
      setIsDiscarding(false);
    }
  };

  // Commit Logs (History)
  const fetchCommitLogs = useCallback(async () => {
    if (!repoStatus?.isRepo) return;
    setIsLoadingLogs(true);
    try {
      const res = await fetch(`/api/git/log?workdir=${encodeURIComponent(workdir)}&maxCount=50`);
      if (res.ok) {
        const data = await res.json();
        setCommitLogs(data.logs || []);
        if (!selectedCommit && data.logs?.length > 0) {
          handleSelectCommit(data.logs[0].hash);
        }
      }
    } catch (err) {
      console.error('Failed fetching commit logs:', err);
    } finally {
      setIsLoadingLogs(false);
    }
  }, [workdir, repoStatus?.isRepo]);

  const handleSelectCommit = async (hash: string) => {
    setIsLoadingCommitDetail(true);
    setSelectedCommitFile(null);
    setCommitFileDiffData(null);
    try {
      const res = await fetch(
        `/api/git/log?workdir=${encodeURIComponent(workdir)}&hash=${encodeURIComponent(hash)}`
      );
      if (res.ok) {
        const data = await res.json();
        setSelectedCommit(data.commit || null);
        if (data.commit?.files?.length > 0) {
          handleSelectCommitFile(hash, data.commit.files[0].path);
        }
      }
    } catch (err) {
      console.error('Failed fetching commit detail:', err);
    } finally {
      setIsLoadingCommitDetail(false);
    }
  };

  const handleSelectCommitFile = async (hash: string, filePath: string) => {
    setSelectedCommitFile(filePath);
    setIsLoadingCommitDiff(true);
    try {
      const res = await fetch(
        `/api/git/log?workdir=${encodeURIComponent(workdir)}&hash=${encodeURIComponent(
          hash
        )}&path=${encodeURIComponent(filePath)}`
      );
      if (res.ok) {
        const data = await res.json();
        setCommitFileDiffData({
          originalContent: data.diff?.originalContent || '',
          currentContent: data.diff?.currentContent || '',
        });
      }
    } catch (err) {
      console.error('Failed fetching commit diff:', err);
    } finally {
      setIsLoadingCommitDiff(false);
    }
  };

  // Stash Management
  const fetchStashes = useCallback(async () => {
    if (!repoStatus?.isRepo) return;
    setIsLoadingStashes(true);
    try {
      const res = await fetch(`/api/git/stash?workdir=${encodeURIComponent(workdir)}`);
      if (res.ok) {
        const data = await res.json();
        setStashes(data.stashes || []);
      }
    } catch (err) {
      console.error('Failed fetching stashes:', err);
    } finally {
      setIsLoadingStashes(false);
    }
  }, [workdir, repoStatus?.isRepo]);

  const handleStashAction = async (action: 'save' | 'pop' | 'drop', index = 0, msg?: string) => {
    setIsStashing(true);
    setActionError(null);
    try {
      const res = await fetch('/api/git/stash', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workdir, action, index, message: msg }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Stash operation failed.');
      }
      setStashes(data.stashes || []);
      if (data.repoStatus) setRepoStatus(data.repoStatus);
      setStashMessage('');
      setActionSuccess(
        action === 'save'
          ? 'Changes stashed successfully!'
          : action === 'pop'
          ? 'Stash popped successfully!'
          : 'Stash dropped successfully!'
      );
      setTimeout(() => setActionSuccess(null), 3000);
      fetchStatus(true);
    } catch (err: any) {
      setActionError(err.message || 'Failed stash operation.');
    } finally {
      setIsStashing(false);
    }
  };

  // Polling when downloading MinGit
  useEffect(() => {
    fetchStatus();
    const interval = setInterval(() => {
      if (gitStatus?.downloading) {
        fetchStatus(true);
      }
    }, 1500);
    return () => clearInterval(interval);
  }, [fetchStatus, gitStatus?.downloading]);

  // Fetch diff when selectedFile changes
  useEffect(() => {
    if (!selectedFile) {
      setFileDiffData(null);
      return;
    }

    let isMounted = true;
    setIsLoadingDiff(true);

    fetch(
      `/api/git/diff?workdir=${encodeURIComponent(workdir)}&path=${encodeURIComponent(
        selectedFile.path
      )}&staged=${selectedFile.staged}`
    )
      .then((res) => res.json())
      .then((data) => {
        if (isMounted) {
          if (data.error) {
            setActionError(`Diff: ${data.error}`);
            setFileDiffData({
              originalContent: '',
              currentContent: '',
            });
          } else {
            setActionError(null);
            setFileDiffData({
              originalContent: data.originalContent || '',
              currentContent: data.currentContent || '',
            });
          }
          setIsLoadingDiff(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setActionError(err.message || 'Failed to load file diff');
          setIsLoadingDiff(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [selectedFile, workdir]);

  // Stage / Unstage actions
  const handleStageAction = async (
    action: 'stage' | 'unstage' | 'stage_all' | 'unstage_all',
    files?: string[]
  ) => {
    try {
      const res = await fetch('/api/git/stage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workdir, action, files }),
      });
      const data = await res.json();
      if (data.repoStatus) {
        setRepoStatus(data.repoStatus);
        if (selectedFile) {
          const nowStaged = action === 'stage' || action === 'stage_all';
          setSelectedFile({ ...selectedFile, staged: nowStaged });
        }
      }
    } catch (err: any) {
      setActionError(err.message || 'Failed to update stage status');
    }
  };

  // AI Commit Message Generator
  const handleGenerateAICommit = async () => {
    setIsGeneratingAI(true);
    setActionError(null);
    try {
      const res = await fetch('/api/git/ai-commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workdir }),
      });
      const data = await res.json();
      if (data.message) {
        setCommitMessage(data.message);
      }
    } catch (err: any) {
      setActionError(err.message || 'Failed to generate AI commit message');
    } finally {
      setIsGeneratingAI(false);
    }
  };

  // Commit & Push Handler
  const handleCommit = async (push = false) => {
    if (!commitMessage.trim()) {
      setActionError('Please enter a commit message.');
      return;
    }

    if (push) setIsPushing(true);
    else setIsCommitting(true);

    setActionError(null);
    setActionSuccess(null);

    try {
      const res = await fetch('/api/git/commit-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workdir,
          message: commitMessage.trim(),
          push,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        if (data.requiresAuth) {
          setAuthErrorModal(
            data.pushOutput ||
              'Remote GitHub authentication required to push. Please login via terminal.'
          );
        } else {
          setActionError(data.error || data.pushOutput || 'Failed to commit or push.');
        }
        return;
      }

      setCommitMessage('');
      setSelectedFile(null);
      setIsCommitPopoverOpen(false);
      if (data.repoStatus) setRepoStatus(data.repoStatus);

      setActionSuccess(push ? 'Commit and push successful!' : 'Commit saved successfully!');
      setTimeout(() => setActionSuccess(null), 4000);
      fetchStatus(true);
    } catch (err: any) {
      setActionError(err.message || 'An error occurred during commit.');
    } finally {
      setIsCommitting(false);
      setIsPushing(false);
    }
  };

  const [isInitializing, setIsInitializing] = useState(false);

  const handleInitRepo = async () => {
    if (!workdir || workdir === 'no_project') return;
    setIsInitializing(true);
    setActionError(null);
    try {
      const res = await fetch('/api/git/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workdir }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to initialize Git repository');
      }
      if (data.repoStatus) {
        setRepoStatus(data.repoStatus);
        setActionSuccess('Git repository initialized successfully!');
        setTimeout(() => setActionSuccess(null), 3000);
      }
      fetchStatus(true);
      fetchBranches();
    } catch (err: any) {
      setActionError(err.message || 'Failed to initialize Git repository');
    } finally {
      setIsInitializing(false);
    }
  };

  const getStatusBadge = (status: GitFileChange['status']) => {
    switch (status) {
      case 'added':
        return (
          <span className="text-[10px] font-mono font-semibold text-[#7ee787] px-1 py-0.2 rounded bg-[#7ee787]/10">
            A
          </span>
        );
      case 'modified':
        return (
          <span className="text-[10px] font-mono font-semibold text-[#e3b341] px-1 py-0.2 rounded bg-[#e3b341]/10">
            M
          </span>
        );
      case 'deleted':
        return (
          <span className="text-[10px] font-mono font-semibold text-[#ff7b72] px-1 py-0.2 rounded bg-[#ff7b72]/10">
            D
          </span>
        );
      case 'renamed':
        return (
          <span className="text-[10px] font-mono font-semibold text-[#a371f7] px-1 py-0.2 rounded bg-[#a371f7]/10">
            R
          </span>
        );
      case 'untracked':
      default:
        return (
          <span className="text-[10px] font-mono font-semibold text-[#8c8c8c] px-1 py-0.2 rounded bg-[#222222] border border-[#2a2a2a]">
            U
          </span>
        );
    }
  };

  if (!workdir || workdir === 'no_project') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-[#8c8c8c] space-y-3">
        <div className="w-12 h-12 rounded-xl bg-[#181818] border border-[#262626] flex items-center justify-center text-[#a0a0a0]">
          <Folder className="w-6 h-6" />
        </div>
        <div className="space-y-1 max-w-sm">
          <span className="text-sm font-medium text-white block">No Project Open</span>
          <span className="text-xs text-[#8c8c8c] leading-relaxed block">
            Open or select a project from the sidebar to view and manage Git Source Control.
          </span>
        </div>
      </div>
    );
  }

  if (isLoading || !repoStatus) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-[#8c8c8c]">
        <Loader2 className="w-5 h-5 animate-spin mb-2 text-[#8c8c8c]" />
        <span className="text-xs font-sans">Checking Git status...</span>
      </div>
    );
  }

  const filteredLocalBranches = branchesData.local.filter((b) =>
    b.toLowerCase().includes(branchSearch.toLowerCase().trim())
  );
  const filteredRemoteBranches = branchesData.remote.filter((b) =>
    b.toLowerCase().includes(branchSearch.toLowerCase().trim())
  );

  const filteredCommitLogs = commitLogs.filter((log) => {
    const q = historySearch.toLowerCase().trim();
    if (!q) return true;
    return (
      log.message.toLowerCase().includes(q) ||
      log.authorName.toLowerCase().includes(q) ||
      log.shortHash.toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex-1 min-h-0 flex flex-col h-full bg-[#101010] text-[#cccccc] font-sans text-xs select-none">
      {/* 1. Header Toolbar */}
      <div className="h-9 sm:h-10 border-b border-[#191919] bg-[#151515] px-2 sm:px-3 flex items-center justify-between shrink-0 relative z-40 gap-1 sm:gap-2">
        <div className="flex items-center gap-1 sm:gap-2 min-w-0 flex-1">
          {/* Interactive Branch Switcher Dropdown */}
          <div className="relative shrink-0" ref={branchDropdownRef}>
            <button
              type="button"
              onClick={handleToggleBranchDropdown}
              disabled={!repoStatus?.isRepo}
              className="flex items-center gap-1 px-1.5 sm:px-2 py-1 rounded hover:bg-[#202020] text-white transition cursor-pointer border border-transparent hover:border-[#2a2a2a] disabled:opacity-50 disabled:cursor-default max-w-[100px] xs:max-w-[140px] sm:max-w-[180px]"
              title="Switch or create branch"
            >
              <GitBranch className="w-3.5 h-3.5 text-[#a0a0a0] shrink-0" />
              <span className="font-medium text-[11px] sm:text-[12.5px] truncate font-mono">
                {repoStatus?.branch || 'Git'}
              </span>
              {repoStatus?.isRepo && (
                <ChevronDown
                  className={`w-3 h-3 text-[#7a7a7a] transition-transform duration-200 shrink-0 ${
                    isBranchDropdownOpen ? 'rotate-180 text-white' : ''
                  }`}
                />
              )}
            </button>

            {/* Branch Dropdown Menu */}
            {isBranchDropdownOpen && (
              <>
                {/* Backdrop for Mobile */}
                <div
                  className="fixed inset-0 bg-black/60 backdrop-blur-xs z-40 sm:hidden"
                  onClick={() => setIsBranchDropdownOpen(false)}
                />
                <div className="fixed inset-x-3 top-14 sm:top-full sm:mt-1.5 sm:inset-x-auto sm:absolute sm:left-0 w-auto sm:w-72 bg-[#181818] border border-[#262626] rounded-2xl sm:rounded-xl shadow-2xl z-50 overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
                {/* Search Bar */}
                <div className="p-2 border-b border-[#222222] flex items-center gap-2 bg-[#141414]">
                  <Search className="w-3.5 h-3.5 text-[#777777] shrink-0" />
                  <input
                    type="text"
                    autoFocus
                    value={branchSearch}
                    onChange={(e) => setBranchSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && branchSearch.trim()) {
                        const exactMatch = branchesData.local.find(
                          (b) => b.toLowerCase() === branchSearch.trim().toLowerCase()
                        );
                        if (exactMatch) {
                          handleSwitchBranch(exactMatch);
                        } else {
                          handleCreateBranch(branchSearch.trim());
                        }
                      }
                    }}
                    placeholder="Find or create branch..."
                    className="w-full bg-transparent text-xs text-white placeholder-[#666666] focus:outline-none font-sans"
                  />
                  {isBranchLoading && <Loader2 className="w-3 h-3 animate-spin text-[#8c8c8c] shrink-0" />}
                </div>

                {/* Create Branch Option if Search doesn't match */}
                {branchSearch.trim() &&
                  !branchesData.local.some((b) => b.toLowerCase() === branchSearch.trim().toLowerCase()) && (
                    <button
                      type="button"
                      onClick={() => handleCreateBranch(branchSearch.trim())}
                      disabled={isSwitchingBranch}
                      className="w-full text-left px-3 py-2 text-xs text-[#cccccc] hover:bg-[#202020] border-b border-[#222222] flex items-center gap-2 transition cursor-pointer font-medium"
                    >
                      <Plus className="w-3.5 h-3.5 text-[#a0a0a0]" />
                      <span>
                        Create branch &apos;<span className="text-white font-mono">{branchSearch.trim()}</span>&apos;
                      </span>
                    </button>
                  )}

                {/* Branch Lists */}
                <div className="max-h-60 overflow-y-auto p-1 space-y-0.5">
                  <div className="px-2 py-1 text-[10px] font-semibold text-[#666666] uppercase tracking-wider">
                    Local Branches
                  </div>

                  {filteredLocalBranches.length === 0 ? (
                    <div className="px-3 py-2 text-[11px] text-[#666666] italic">
                      No matching local branches
                    </div>
                  ) : (
                    filteredLocalBranches.map((branch) => {
                      const isActive = branch === repoStatus?.branch;
                      return (
                        <div
                          key={branch}
                          className={`w-full px-2.5 py-1.5 rounded-lg text-xs flex items-center justify-between transition group ${
                            isActive
                              ? 'bg-[#222222] text-white font-medium border border-[#2e2e2e]'
                              : 'text-[#aaaaaa] hover:bg-[#1e1e1e] hover:text-white'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => handleSwitchBranch(branch)}
                            disabled={isSwitchingBranch}
                            className="flex items-center gap-2 truncate font-mono text-[11.5px] flex-1 text-left cursor-pointer"
                          >
                            <GitBranch className={`w-3 h-3 ${isActive ? 'text-white' : 'text-[#777777]'}`} />
                            <span className="truncate">{branch}</span>
                          </button>
                          <div className="flex items-center gap-1 shrink-0">
                            {isActive && <Check className="w-3.5 h-3.5 text-white shrink-0" />}
                            {!isActive && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeleteBranchConfirm(branch);
                                }}
                                className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-[#ff7b72]/20 text-[#777777] hover:text-[#ff7b72] transition cursor-pointer"
                                title={`Delete branch '${branch}'`}
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}

                  {/* Remote Branches */}
                  {filteredRemoteBranches.length > 0 && (
                    <>
                      <div className="px-2 pt-2 pb-1 text-[10px] font-semibold text-[#666666] uppercase tracking-wider border-t border-[#222222] mt-1">
                        Remote Branches
                      </div>
                      {filteredRemoteBranches.map((remoteBranch) => (
                        <button
                          key={remoteBranch}
                          type="button"
                          onClick={() => handleSwitchBranch(remoteBranch)}
                          disabled={isSwitchingBranch}
                          className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs flex items-center justify-between text-[#888888] hover:bg-[#1e1e1e] hover:text-white transition cursor-pointer"
                        >
                          <span className="flex items-center gap-2 truncate font-mono text-[11.5px]">
                            <ExternalLink className="w-3 h-3 text-[#777777]" />
                            <span className="truncate">{remoteBranch}</span>
                          </span>
                        </button>
                      ))}
                    </>
                  )}
                </div>

                {/* Footer hint */}
                <div className="px-3 py-1.5 bg-[#141414] border-t border-[#222222] text-[10px] text-[#666666] flex items-center justify-between">
                  <span>Press Enter to confirm</span>
                  {isSwitchingBranch && (
                    <span className="flex items-center gap-1 text-[#aaaaaa]">
                      <Loader2 className="w-2.5 h-2.5 animate-spin" />
                      Processing...
                    </span>
                  )}
                </div>
              </div>
              </>
            )}
          </div>

          {/* Upstream Info & Pull Button */}
          {repoStatus?.upstream && (
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-[#6e6e6e] text-[10.5px] sm:text-[11px] font-mono flex items-center gap-1">
                <span className="max-w-[80px] sm:max-w-[120px] truncate hidden md:inline">{repoStatus.upstream}</span>
                {(repoStatus.ahead > 0 || repoStatus.behind > 0) && (
                  <span className="inline-flex items-center gap-0.5 sm:gap-1 text-[9.5px] sm:text-[10px] px-1 sm:px-1.5 py-0.2 rounded bg-[#1c1c1c] text-[#a0a0a0] border border-[#262626]">
                    {repoStatus.ahead > 0 && (
                      <span className="inline-flex items-center text-[#7ee787]" title={`${repoStatus.ahead} commit ahead`}>
                        <ArrowUp className="w-2.5 h-2.5 mr-0.5" />
                        {repoStatus.ahead}
                      </span>
                    )}
                    {repoStatus.behind > 0 && (
                      <span className="inline-flex items-center text-[#ff7b72]" title={`${repoStatus.behind} commit behind`}>
                        <ArrowDown className="w-2.5 h-2.5 mr-0.5" />
                        {repoStatus.behind}
                      </span>
                    )}
                  </span>
                )}
              </span>

              {/* Pull button */}
              <button
                type="button"
                onClick={handlePull}
                disabled={isPulling}
                className={`flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded text-[10px] sm:text-[10.5px] transition cursor-pointer font-medium border ${
                  repoStatus.behind > 0
                    ? 'bg-blue-600/20 text-blue-400 border-blue-500/40 hover:bg-blue-600/30'
                    : 'bg-[#181818] text-[#888888] border-[#262626] hover:text-white hover:bg-[#222222]'
                }`}
                title={
                  repoStatus.behind > 0
                    ? `Pull ${repoStatus.behind} commit(s) from remote (${repoStatus.upstream})`
                    : `Pull from remote (${repoStatus.upstream})`
                }
              >
                {isPulling ? (
                  <Loader2 className="w-2.5 h-2.5 animate-spin" />
                ) : (
                  <Download className="w-2.5 h-2.5" />
                )}
                <span className="hidden sm:inline">Pull</span>
              </button>
            </div>
          )}

          {/* Sub-Tabs: Changes | History | Stash */}
          {repoStatus?.isRepo && (
            <div className="flex items-center bg-[#131313] border border-[#222222] rounded-lg p-0.5 shrink-0">
              <button
                type="button"
                onClick={() => setActiveTab('changes')}
                className={`flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded text-[10.5px] sm:text-[11px] transition cursor-pointer ${
                  activeTab === 'changes'
                    ? 'bg-[#222222] text-white font-medium border border-[#2e2e2e]'
                    : 'text-[#777777] hover:text-[#cccccc]'
                }`}
                title="Working Changes"
              >
                <FileDiff className="w-3 h-3 shrink-0" />
                <span className="hidden xs:inline">Changes</span>
                {repoStatus && repoStatus.totalChanges > 0 && (
                  <span className="text-[9px] sm:text-[9.5px] font-mono px-1 rounded-full bg-[#2a2a2a] text-[#aaaaaa]">
                    {repoStatus.totalChanges}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('history');
                  fetchCommitLogs();
                }}
                className={`flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded text-[10.5px] sm:text-[11px] transition cursor-pointer ${
                  activeTab === 'history'
                    ? 'bg-[#222222] text-white font-medium border border-[#2e2e2e]'
                    : 'text-[#777777] hover:text-[#cccccc]'
                }`}
                title="Commit History"
              >
                <History className="w-3 h-3 shrink-0" />
                <span className="hidden xs:inline">History</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('stash');
                  fetchStashes();
                }}
                className={`flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded text-[10.5px] sm:text-[11px] transition cursor-pointer ${
                  activeTab === 'stash'
                    ? 'bg-[#222222] text-white font-medium border border-[#2e2e2e]'
                    : 'text-[#777777] hover:text-[#cccccc]'
                }`}
                title="Saved Stashes"
              >
                <Archive className="w-3 h-3 shrink-0" />
                <span className="hidden xs:inline">Stash</span>
                {stashes.length > 0 && (
                  <span className="text-[9px] sm:text-[9.5px] font-mono px-1 rounded-full bg-[#2a2a2a] text-[#aaaaaa]">
                    {stashes.length}
                  </span>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Right Header Controls */}
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0 ml-1 sm:ml-2">
          {/* Diff Mode Toggle (Desktop only: Split vs Stacked) */}
          {((activeTab === 'changes' && selectedFile) || (activeTab === 'history' && selectedCommitFile)) && (
            <div className="hidden sm:flex items-center bg-[#141414] border border-[#222222] rounded-lg p-0.5 mr-0.5">
              <button
                type="button"
                onClick={() => setDiffMode('split')}
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10.5px] transition cursor-pointer ${
                  diffMode === 'split' ? 'bg-[#222222] text-white border border-[#2c2c2c]' : 'text-[#777777] hover:text-white'
                }`}
                title="Split Side-by-Side Diff"
              >
                <Columns className="w-3 h-3" />
                <span>Split</span>
              </button>
              <button
                type="button"
                onClick={() => setDiffMode('stacked')}
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10.5px] transition cursor-pointer ${
                  diffMode === 'stacked' ? 'bg-[#222222] text-white border border-[#2c2c2c]' : 'text-[#777777] hover:text-white'
                }`}
                title="Stacked Unified Diff"
              >
                <AlignJustify className="w-3 h-3" />
                <span>Stacked</span>
              </button>
            </div>
          )}

          {/* Action Buttons: Commit Popover (in Changes tab) */}
          {repoStatus?.isRepo && activeTab === 'changes' && (
            <div className="relative z-50" ref={commitPopoverRef}>
              <button
                type="button"
                onClick={() => setIsCommitPopoverOpen(!isCommitPopoverOpen)}
                disabled={repoStatus?.clean}
                className={`flex items-center gap-1 px-1.5 sm:px-2.5 py-1 rounded-md text-[11px] font-medium transition cursor-pointer border ${
                  isCommitPopoverOpen
                    ? 'bg-[#242424] text-white border-[#333333]'
                    : repoStatus?.clean
                    ? 'bg-[#161616] text-[#666666] border-[#222222] opacity-50 cursor-not-allowed'
                    : 'bg-[#1c1c1c] hover:bg-[#242424] text-[#cccccc] hover:text-white border-[#2a2a2a]'
                }`}
                title={
                  repoStatus?.clean
                    ? 'No changes to commit'
                    : 'Open commit form'
                }
              >
                <GitCommit className="w-3.5 h-3.5 text-[#a0a0a0] shrink-0" />
                <span className="hidden xs:inline">Commit</span>
                {repoStatus && repoStatus.totalChanges > 0 && (
                  <span className="text-[9.5px] px-1.5 py-0.2 rounded-full bg-[#262626] text-[#aaaaaa] font-mono">
                    {repoStatus.staged.length > 0 ? repoStatus.staged.length : repoStatus.totalChanges}
                  </span>
                )}
                <ChevronDown
                  className={`w-3 h-3 text-[#7a7a7a] transition-transform duration-200 shrink-0 ${
                    isCommitPopoverOpen ? 'rotate-180 text-white' : ''
                  }`}
                />
              </button>

              {/* Floating Commit Popover / Mobile Bottom Sheet */}
              {isCommitPopoverOpen && (
                <>
                  {/* Backdrop for Mobile */}
                  <div
                    className="fixed inset-0 bg-black/60 backdrop-blur-xs z-40 sm:hidden"
                    onClick={() => setIsCommitPopoverOpen(false)}
                  />
                  <div className="fixed inset-x-2 bottom-3 sm:bottom-auto sm:inset-x-auto sm:absolute sm:right-0 sm:top-full sm:mt-2 w-auto sm:w-96 bg-[#181818] border border-[#262626] rounded-2xl sm:rounded-xl shadow-2xl z-50 p-3 sm:p-3.5 flex flex-col gap-2.5 animate-in fade-in zoom-in-95 duration-150">
                    <div className="flex items-center justify-between border-b border-[#222222] pb-2">
                      <div className="flex items-center gap-1.5">
                        <GitCommit className="w-3.5 h-3.5 text-[#a0a0a0]" />
                        <span className="font-semibold text-white text-xs">Commit Changes</span>
                        <span className="text-[10px] font-mono text-[#888888] bg-[#222222] px-1.5 py-0.5 rounded border border-[#2c2c2c]">
                          {repoStatus.branch}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsCommitPopoverOpen(false)}
                        className="p-1 rounded text-[#777777] hover:text-white hover:bg-[#222222] transition cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="relative">
                      <textarea
                        autoFocus
                        value={commitMessage}
                        onChange={(e) => setCommitMessage(e.target.value)}
                        onKeyDown={(e) => {
                          if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                            if (!isCommitting && !isPushing && !repoStatus?.clean && commitMessage.trim()) {
                              handleCommit(false);
                            }
                          }
                        }}
                        placeholder="Commit message (e.g. feat: add login button)... [Ctrl+Enter]"
                        rows={3}
                        className="w-full bg-[#141414] border border-[#262626] rounded-lg p-2.5 text-[12px] text-white placeholder-[#666666] focus:outline-none focus:border-[#383838] transition font-sans resize-none leading-relaxed"
                      />
                    </div>

                    <div className="flex flex-wrap xs:flex-nowrap items-center justify-between gap-2 pt-0.5">
                      <button
                        type="button"
                        onClick={handleGenerateAICommit}
                        disabled={isGeneratingAI || repoStatus?.clean}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#202020] hover:bg-[#262626] border border-[#2c2c2c] text-[#cccccc] hover:text-white transition text-[11.5px] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed group shrink-0"
                        title="Generate Conventional Commit message with AI"
                      >
                        {isGeneratingAI ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-[#8c8c8c]" />
                        ) : (
                          <Sparkles className="w-3.5 h-3.5 text-[#aaaaaa] transition group-hover:scale-110" />
                        )}
                        <span>Generate AI</span>
                      </button>

                      <div className="flex items-center gap-1.5 shrink-0 ml-auto xs:ml-0">
                        <button
                          type="button"
                          onClick={() => handleCommit(false)}
                          disabled={isCommitting || isPushing || repoStatus?.clean || !commitMessage.trim()}
                          className="px-3 py-1.5 rounded-lg bg-[#252525] hover:bg-[#2e2e2e] text-white font-medium text-[11.5px] transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 border border-[#333333]"
                          title="Commit changes (Ctrl+Enter)"
                        >
                          {isCommitting && <Loader2 className="w-3 h-3 animate-spin text-[#8c8c8c]" />}
                          <span>Commit</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleCommit(true)}
                          disabled={isCommitting || isPushing || repoStatus?.clean || !commitMessage.trim()}
                          className="px-3 py-1.5 rounded-lg bg-[#2b2b2b] hover:bg-[#363636] text-white font-medium text-[11.5px] transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 border border-[#3c3c3c] shadow-xs"
                          title="Commit and push to remote branch"
                        >
                          {isPushing ? (
                            <Loader2 className="w-3 h-3 animate-spin text-white" />
                          ) : (
                            <Send className="w-3 h-3" />
                          )}
                          <span>Commit & Push</span>
                        </button>
                      </div>
                    </div>

                    {actionSuccess && (
                      <div className="px-2.5 py-1.5 rounded-md bg-[#7ee787]/10 border border-[#7ee787]/30 text-[#7ee787] text-[11px] flex items-center gap-1.5 animate-fade-in">
                        <Check className="w-3 h-3 shrink-0" />
                        <span>{actionSuccess}</span>
                      </div>
                    )}
                    {actionError && (
                      <div className="px-2.5 py-1.5 rounded-md bg-[#ff7b72]/10 border border-[#ff7b72]/30 text-[#ff7b72] text-[11px] flex items-center justify-between gap-1.5 animate-fade-in">
                        <div className="flex items-center gap-1.5">
                          <AlertCircle className="w-3 h-3 shrink-0" />
                          <span className="break-all">{actionError}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setActionError(null)}
                          className="p-0.5 text-[#ff7b72] hover:text-white cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              fetchStatus();
              if (activeTab === 'history') fetchCommitLogs();
              if (activeTab === 'stash') fetchStashes();
            }}
            disabled={isRefreshing}
            className="p-1.5 rounded-md hover:bg-[#202020] text-[#8c8c8c] hover:text-white transition cursor-pointer ml-0.5"
            title="Refresh Git Status"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-white' : ''}`} />
          </button>
        </div>
      </div>

      {/* 2. MinGit Download Progress Banner (if active) */}
      {gitStatus?.downloading && (
        <div className="bg-[#181818] border-b border-[#262626] p-3 text-xs flex flex-col gap-1.5 animate-fade-in">
          <div className="flex items-center justify-between text-[#cccccc]">
            <span className="font-medium flex items-center gap-1.5">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[#a0a0a0]" />
              {gitStatus.statusMessage || 'Setting up Portable Git...'}
            </span>
            <span className="font-mono text-[11px] text-[#8c8c8c]">{gitStatus.progress}%</span>
          </div>
          <div className="w-full bg-[#222222] h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-[#cccccc] h-full transition-all duration-300 ease-out"
              style={{ width: `${gitStatus.progress}%` }}
            />
          </div>
        </div>
      )}

      {/* 3. Main Workspace Area */}
      {!repoStatus.isRepo ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-[#8c8c8c] space-y-3">
          <div className="w-12 h-12 rounded-xl bg-[#181818] border border-[#262626] flex items-center justify-center text-[#a0a0a0]">
            <GitBranch className="w-6 h-6" />
          </div>
          <div className="space-y-1 max-w-sm">
            <span className="text-sm font-medium text-white block">Not a Git Repository</span>
            <span className="text-xs text-[#8c8c8c] leading-relaxed block">
              This directory {displayProjectName ? <code className="text-white font-mono bg-[#1f1f1f] px-1 py-0.5 rounded text-[11px]">{displayProjectName}</code> : ''} is not initialized as a Git repository. Initialize Git to start tracking version history.
            </span>
          </div>
          <button
            type="button"
            onClick={handleInitRepo}
            disabled={isInitializing}
            className="px-4 py-2 rounded-lg bg-[#242424] hover:bg-[#2c2c2c] border border-[#333333] text-white font-medium text-xs transition cursor-pointer flex items-center gap-2 shadow-sm disabled:opacity-50"
          >
            {isInitializing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[#a0a0a0]" />
            ) : (
              <Plus className="w-3.5 h-3.5 text-[#a0a0a0]" />
            )}
            <span>Initialize Git Repository (git init)</span>
          </button>
        </div>
      ) : activeTab === 'stash' ? (
        /* STASH VIEW */
        <div className="flex-1 min-h-0 flex flex-col bg-[#121212] p-4 overflow-y-auto">
          <div className="max-w-3xl w-full mx-auto space-y-4">
            {/* Create Stash Box */}
            <div className="p-3.5 rounded-xl bg-[#161616] border border-[#242424] space-y-3">
              <div className="flex items-center gap-2 text-white font-medium">
                <Archive className="w-4 h-4 text-[#a0a0a0]" />
                <span>Stash Working Changes (git stash)</span>
              </div>
              <p className="text-[#888888] text-[11.5px] leading-relaxed">
                Temporarily shelve uncommitted modifications so you can switch branches
                or pull updates without losing work.
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={stashMessage}
                  onChange={(e) => setStashMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleStashAction('save', 0, stashMessage);
                  }}
                  placeholder="Optional stash message (e.g. WIP login feature)..."
                  className="flex-1 bg-[#121212] border border-[#282828] rounded-lg px-3 py-2 text-xs text-white placeholder-[#666666] focus:outline-none focus:border-[#3a3a3a]"
                />
                <button
                  type="button"
                  onClick={() => handleStashAction('save', 0, stashMessage)}
                  disabled={isStashing || repoStatus?.clean}
                  className="px-3.5 py-2 rounded-lg bg-[#222222] hover:bg-[#2a2a2a] border border-[#333333] text-white font-medium text-xs transition cursor-pointer flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isStashing ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Archive className="w-3.5 h-3.5" />
                  )}
                  <span>Stash Changes</span>
                </button>
              </div>
            </div>

            {/* Stash List */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[#888888] px-1">
                <span className="font-semibold text-[11px] uppercase tracking-wider">
                  Saved Stashes ({stashes.length})
                </span>
                <button
                  type="button"
                  onClick={fetchStashes}
                  disabled={isLoadingStashes}
                  className="hover:text-white transition cursor-pointer text-[11px] flex items-center gap-1"
                >
                  <RefreshCw className={`w-3 h-3 ${isLoadingStashes ? 'animate-spin' : ''}`} />
                  <span>Refresh</span>
                </button>
              </div>

              {isLoadingStashes ? (
                <div className="p-8 text-center text-[#777777]">
                  <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
                  <span>Loading stashes...</span>
                </div>
              ) : stashes.length === 0 ? (
                <div className="p-8 text-center text-[#666666] border border-dashed border-[#222222] rounded-xl bg-[#141414]">
                  <Archive className="w-8 h-8 stroke-[1] text-[#333333] mx-auto mb-2" />
                  <span className="block text-xs font-medium text-[#888888]">No stashes saved</span>
                  <span className="text-[11px] text-[#555555]">
                    Use the field above to stash your working modifications.
                  </span>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {stashes.map((s) => (
                    <div
                      key={s.name}
                      className="p-3 rounded-xl bg-[#161616] border border-[#242424] flex items-center justify-between gap-3 group hover:border-[#303030] transition"
                    >
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="px-1.5 py-0.5 rounded bg-[#202020] border border-[#2a2a2a] font-mono text-[10.5px] text-white">
                            {s.name}
                          </span>
                          <span className="text-[#a0a0a0] text-[11px]">{s.date}</span>
                        </div>
                        <p className="text-white text-xs font-medium truncate">{s.message}</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleStashAction('pop', s.index)}
                          disabled={isStashing}
                          className="px-2.5 py-1.5 rounded-lg bg-[#202020] hover:bg-[#282828] border border-[#2c2c2c] text-white text-xs transition cursor-pointer font-medium"
                          title="Apply and drop from stash (git stash pop)"
                        >
                          Pop
                        </button>
                        <button
                          type="button"
                          onClick={() => handleStashAction('drop', s.index)}
                          disabled={isStashing}
                          className="p-1.5 rounded-lg hover:bg-[#ff7b72]/20 text-[#777777] hover:text-[#ff7b72] transition cursor-pointer"
                          title="Drop this stash (git stash drop)"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : activeTab === 'history' ? (
        /* HISTORY (GIT LOG) VIEW */
        <div
          ref={splitPaneRef}
          className={`flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden relative ${
            isResizing ? 'select-none cursor-col-resize' : ''
          }`}
        >
          {/* Left Panel: Commits List */}
          <div
            style={isLgScreen ? { width: `${leftPanelWidth}px` } : undefined}
            className={`w-full lg:w-auto flex flex-col h-full bg-[#141414] shrink-0 overflow-hidden border-b lg:border-b-0 border-[#191919] ${
              !isLgScreen && selectedCommit ? 'hidden' : 'flex'
            }`}
          >
            {/* Search commits */}
            <div className="p-2 border-b border-[#1c1c1c] bg-[#151515] flex items-center gap-2">
              <Search className="w-3.5 h-3.5 text-[#666666] shrink-0" />
              <input
                type="text"
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                placeholder="Search commits, author, hash..."
                className="w-full bg-transparent text-xs text-white placeholder-[#666666] focus:outline-none font-sans"
              />
              {isLoadingLogs && <Loader2 className="w-3 h-3 animate-spin text-[#888888] shrink-0" />}
            </div>

            {/* Commits Scrollable List */}
            <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1">
              {isLoadingLogs ? (
                <div className="p-8 text-center text-[#777777]">
                  <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
                  <span>Loading commit history...</span>
                </div>
              ) : filteredCommitLogs.length === 0 ? (
                <div className="p-6 text-center text-[#666666] text-xs italic">
                  No matching commits
                </div>
              ) : (
                filteredCommitLogs.map((log) => {
                  const isSelected = selectedCommit?.hash === log.hash;
                  return (
                    <div
                      key={log.hash}
                      onClick={() => handleSelectCommit(log.hash)}
                      className={`p-2.5 rounded-xl cursor-pointer transition flex flex-col gap-1 border ${
                        isSelected
                          ? 'bg-[#222222] border-[#2e2e2e] text-white shadow-xs'
                          : 'border-transparent hover:bg-[#1a1a1a] text-[#cccccc]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[10.5px] px-1.5 py-0.2 rounded bg-[#181818] border border-[#262626] text-[#999999] shrink-0">
                          {log.shortHash}
                        </span>
                        <span className="text-[10.5px] text-[#777777] truncate shrink-0">
                          {log.relativeDate}
                        </span>
                      </div>
                      <p className="text-[12px] font-medium leading-snug line-clamp-2">{log.message}</p>
                      <div className="flex items-center justify-between text-[10.5px] text-[#777777] pt-0.5">
                        <span className="truncate">{log.authorName}</span>
                        {log.refs.length > 0 && (
                          <div className="flex items-center gap-1 shrink-0 overflow-hidden">
                            {log.refs.map((ref) => (
                              <span
                                key={ref}
                                className="px-1 py-0.2 rounded bg-[#1e1e1e] border border-[#2a2a2a] text-[9.5px] font-mono text-blue-400 truncate max-w-[80px]"
                              >
                                {ref}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Resizer Divider */}
          <div
            onMouseDown={handleResizerMouseDown}
            onDoubleClick={() => {
              setLeftPanelWidth(320);
              if (typeof window !== 'undefined') {
                try {
                  localStorage.setItem('aidev_git_left_panel_width', '320');
                } catch {}
              }
            }}
            className={`hidden lg:flex w-2.5 -ml-1.5 -mr-1.5 z-30 group cursor-col-resize select-none items-center justify-center relative transition-colors shrink-0 ${
              isResizing ? 'bg-blue-500/20' : 'hover:bg-blue-500/10'
            }`}
            title="Drag to resize. Double-click to reset."
          >
            <div
              className={`w-[1px] h-full transition-colors ${
                isResizing ? 'bg-blue-500' : 'bg-[#1e1e1e] group-hover:bg-blue-400/80'
              }`}
            />
          </div>

          {/* Right Panel: Selected Commit Details & Diff */}
          <div
            className={`flex-1 min-h-0 flex flex-col h-full bg-[#101010] overflow-hidden ${
              !isLgScreen && !selectedCommit ? 'hidden' : 'flex'
            }`}
          >
            {isLoadingCommitDetail ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-[#888888]">
                <Loader2 className="w-5 h-5 animate-spin mb-2" />
                <span>Loading commit details...</span>
              </div>
            ) : selectedCommit ? (
              <div className="flex-1 min-h-0 flex flex-col h-full">
                {/* Commit Metadata Bar */}
                <div className="p-2.5 sm:p-3 bg-[#141414] border-b border-[#191919] space-y-2 shrink-0">
                  <div className="flex items-start justify-between gap-2 sm:gap-3">
                    <div className="min-w-0 flex-1 space-y-1">
                      {/* Mobile back button */}
                      <button
                        type="button"
                        onClick={() => setSelectedCommit(null)}
                        className="lg:hidden inline-flex items-center gap-1.5 text-xs text-[#8c8c8c] hover:text-white mb-1 transition cursor-pointer"
                      >
                        <ArrowLeft className="w-3.5 h-3.5" />
                        <span>All Commits</span>
                      </button>
                      <h3 className="text-sm font-semibold text-white leading-snug">
                        {selectedCommit.message}
                      </h3>
                      {selectedCommit.body && (
                        <p className="text-xs text-[#a0a0a0] whitespace-pre-wrap font-sans leading-relaxed">
                          {selectedCommit.body}
                        </p>
                      )}
                    </div>
                    {/* Hash Copy Button */}
                    <button
                      type="button"
                      onClick={() => {
                        if (typeof navigator !== 'undefined') {
                          navigator.clipboard.writeText(selectedCommit.hash);
                          setCopiedHash(true);
                          setTimeout(() => setCopiedHash(false), 2000);
                        }
                      }}
                      className="px-2 py-1 rounded bg-[#1c1c1c] hover:bg-[#242424] border border-[#2a2a2a] text-[#aaaaaa] hover:text-white text-[11px] font-mono flex items-center gap-1.5 transition cursor-pointer shrink-0"
                      title="Copy full commit hash"
                    >
                      {copiedHash ? (
                        <Check className="w-3 h-3 text-[#7ee787]" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                      <span>{selectedCommit.shortHash}</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-3 text-[11px] text-[#777777] pt-0.5 flex-wrap">
                    <span className="flex items-center gap-1 text-[#aaaaaa]">
                      <User className="w-3 h-3 text-[#666666]" />
                      <span>{selectedCommit.authorName}</span>
                      {selectedCommit.authorEmail && (
                        <span className="text-[#666666] hidden xs:inline">&lt;{selectedCommit.authorEmail}&gt;</span>
                      )}
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-[#666666]" />
                      <span>{selectedCommit.relativeDate}</span>
                    </span>
                    <span>•</span>
                    <span>{selectedCommit.files.length} file(s) changed</span>
                  </div>

                  {/* Files Changed Tabs inside this commit */}
                  <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pt-1">
                    {selectedCommit.files.map((file) => {
                      const isFileSelected = selectedCommitFile === file.path;
                      return (
                        <button
                          key={file.path}
                          type="button"
                          onClick={() => handleSelectCommitFile(selectedCommit.hash, file.path)}
                          className={`px-2 py-1 rounded-lg text-xs font-mono flex items-center gap-1.5 shrink-0 transition cursor-pointer border ${
                            isFileSelected
                              ? 'bg-[#222222] border-[#2e2e2e] text-white'
                              : 'bg-[#181818] border-transparent hover:bg-[#1f1f1f] text-[#888888] hover:text-[#cccccc]'
                          }`}
                        >
                          <AestheticFileIcon filePath={file.path} className="w-3 h-3" />
                          <span className="truncate max-w-[140px]">{file.path}</span>
                          {getStatusBadge(file.status)}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Diff of selected file in this commit */}
                <div className="flex-1 min-h-0 relative">
                  {isLoadingCommitDiff ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-[#101010]/80 z-20">
                      <Loader2 className="w-5 h-5 animate-spin text-[#a0a0a0]" />
                    </div>
                  ) : selectedCommitFile && commitFileDiffData ? (
                    <DiffViewer
                      filePath={selectedCommitFile}
                      originalContent={commitFileDiffData.originalContent}
                      currentContent={commitFileDiffData.currentContent}
                      mode={isMobile ? 'stacked' : diffMode}
                      workdir={workdir}
                    />
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-[#555555]">
                      <FileDiff className="w-8 h-8 stroke-[1] text-[#333333] mb-2" />
                      <span className="text-xs font-medium text-[#777777]">
                        Select a file above to view diff for this commit
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-[#555555]">
                <History className="w-10 h-10 stroke-[1] text-[#333333] mb-3" />
                <span className="text-sm font-medium text-[#777777] mb-1">Commit History Viewer</span>
                <span className="text-xs max-w-sm text-[#555555]">
                  Select a commit from the list on the left to inspect author, date, and changes.
                </span>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* CHANGES VIEW */
        <div
          ref={splitPaneRef}
          className={`flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden relative ${
            isResizing ? 'select-none cursor-col-resize' : ''
          }`}
        >
          {/* Left Panel: File Lists */}
          <div
            style={isLgScreen ? { width: `${leftPanelWidth}px` } : undefined}
            className={`w-full lg:w-auto flex flex-col h-full bg-[#141414] shrink-0 overflow-hidden border-b lg:border-b-0 border-[#191919] ${
              !isLgScreen && selectedFile ? 'hidden' : 'flex'
            }`}
          >
            {/* Global toast notifications */}
            {actionSuccess && !isCommitPopoverOpen && (
              <div className="m-2.5 px-2.5 py-1.5 rounded-md bg-[#7ee787]/10 border border-[#7ee787]/30 text-[#7ee787] text-[11px] flex items-center gap-1.5 animate-fade-in">
                <Check className="w-3 h-3 shrink-0" />
                <span>{actionSuccess}</span>
              </div>
            )}
            {actionError && !isCommitPopoverOpen && (
              <div className="m-2.5 px-2.5 py-1.5 rounded-md bg-[#ff7b72]/10 border border-[#ff7b72]/30 text-[#ff7b72] text-[11px] flex items-center justify-between gap-1.5 animate-fade-in">
                <div className="flex items-center gap-1.5">
                  <AlertCircle className="w-3 h-3 shrink-0" />
                  <span className="truncate">{actionError}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setActionError(null)}
                  className="p-0.5 text-[#ff7b72] hover:text-white cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}

            {/* File Lists */}
            <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-4">
              {/* Staged Changes */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[#8c8c8c] px-1">
                  <span className="font-normal text-[12px] uppercase tracking-wider text-[#6e6e6e]">
                    Staged Changes ({repoStatus?.staged.length || 0})
                  </span>
                  {repoStatus && repoStatus.staged.length > 0 && (
                    <button
                      type="button"
                      onClick={() => handleStageAction('unstage_all')}
                      className="hover:text-white text-[11px] transition cursor-pointer"
                      title="Unstage All"
                    >
                      Unstage All
                    </button>
                  )}
                </div>

                {repoStatus?.staged && repoStatus.staged.length > 0 ? (
                  <div className="space-y-0.5">
                    {repoStatus.staged.slice(0, stagedLimit).map((f) => {
                      const isSelected = selectedFile?.path === f.path && selectedFile.staged;
                      return (
                        <div
                          key={`staged_${f.path}`}
                          onClick={() => setSelectedFile({ path: f.path, staged: true })}
                          style={{ contentVisibility: 'auto', containIntrinsicSize: '0 32px' }}
                          className={`flex items-center justify-between px-2 py-1.5 rounded-lg cursor-pointer transition group ${
                            isSelected
                              ? 'bg-[#222222] text-white border border-[#2e2e2e]'
                              : 'hover:bg-[#1a1a1a] text-[#cccccc]'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0 pr-2">
                            <AestheticFileIcon filePath={f.path} className="w-3.5 h-3.5 shrink-0" />
                            <span className="text-[12px] truncate font-sans">{f.path}</span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {getStatusBadge(f.status)}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleStageAction('unstage', [f.path]);
                              }}
                              className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 p-1 sm:p-0.5 rounded hover:bg-white/10 text-[#8c8c8c] hover:text-white transition cursor-pointer"
                              title="Unstage file"
                            >
                              <Minus className="w-3.5 h-3.5 sm:w-3 sm:h-3" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                    {repoStatus.staged.length > stagedLimit && (
                      <button
                        type="button"
                        onClick={() => setStagedLimit((prev) => prev + 50)}
                        className="w-full py-1 text-center text-[11px] text-[#888888] hover:text-white bg-[#1a1a1a] rounded transition cursor-pointer mt-1"
                      >
                        + Show 50 more files ({repoStatus.staged.length - stagedLimit} remaining)
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="px-2 py-1 text-[11.5px] text-[#555555] italic font-sans">
                    No staged files
                  </div>
                )}
              </div>

              {/* Changes / Untracked */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[#8c8c8c] px-1">
                  <span className="font-normal text-[12px] uppercase tracking-wider text-[#6e6e6e]">
                    Changes ({(repoStatus?.unstaged.length || 0) + (repoStatus?.untracked.length || 0)})
                  </span>
                  {repoStatus &&
                    (repoStatus.unstaged.length > 0 || repoStatus.untracked.length > 0) && (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            const allFiles = [
                              ...repoStatus.unstaged.map((f) => f.path),
                              ...repoStatus.untracked.map((f) => f.path),
                            ];
                            setDiscardModal({ isOpen: true, files: allFiles, isAll: true });
                          }}
                          className="text-[#ff7b72]/80 hover:text-[#ff7b72] text-[11px] transition cursor-pointer hover:underline"
                          title="Discard all unstaged changes"
                        >
                          Discard All
                        </button>
                        <button
                          type="button"
                          onClick={() => handleStageAction('stage_all')}
                          className="hover:text-white text-[11px] transition cursor-pointer"
                          title="Stage All"
                        >
                          Stage All
                        </button>
                      </div>
                    )}
                </div>

                {repoStatus &&
                (repoStatus.unstaged.length > 0 || repoStatus.untracked.length > 0) ? (() => {
                  const allUnstaged = [...repoStatus.unstaged, ...repoStatus.untracked];
                  const visible = allUnstaged.slice(0, unstagedLimit);
                  return (
                    <div className="space-y-0.5">
                      {visible.map((f) => {
                        const isSelected = selectedFile?.path === f.path && !selectedFile.staged;
                        return (
                          <div
                            key={`unstaged_${f.path}`}
                            onClick={() => setSelectedFile({ path: f.path, staged: false })}
                            style={{ contentVisibility: 'auto', containIntrinsicSize: '0 32px' }}
                            className={`flex items-center justify-between px-2 py-1.5 rounded-lg cursor-pointer transition group ${
                              isSelected
                                ? 'bg-[#222222] text-white border border-[#2e2e2e]'
                                : 'hover:bg-[#1a1a1a] text-[#cccccc]'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0 pr-2">
                              <AestheticFileIcon filePath={f.path} className="w-3.5 h-3.5 shrink-0" />
                              <span className="text-[12px] truncate font-sans">{f.path}</span>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {getStatusBadge(f.status)}
                              {/* Discard button */}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDiscardModal({ isOpen: true, files: [f.path], isAll: false });
                                }}
                                className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 p-1 sm:p-0.5 rounded hover:bg-[#ff7b72]/20 text-[#8c8c8c] hover:text-[#ff7b72] transition cursor-pointer"
                                title="Discard file changes"
                              >
                                <RotateCcw className="w-3.5 h-3.5 sm:w-3 sm:h-3" />
                              </button>
                              {/* Stage button */}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleStageAction('stage', [f.path]);
                                }}
                                className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 p-1 sm:p-0.5 rounded hover:bg-white/10 text-[#8c8c8c] hover:text-white transition cursor-pointer"
                                title="Stage file"
                              >
                                <Plus className="w-3.5 h-3.5 sm:w-3 sm:h-3" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                      {allUnstaged.length > unstagedLimit && (
                        <button
                          type="button"
                          onClick={() => setUnstagedLimit((prev) => prev + 100)}
                          className="w-full py-1.5 px-2 text-center text-[11px] text-[#888888] hover:text-white bg-[#1a1a1a] hover:bg-[#222222] rounded-lg transition font-sans cursor-pointer mt-1"
                        >
                          + Show 100 more files ({allUnstaged.length - unstagedLimit} of {allUnstaged.length} remaining)
                        </button>
                      )}
                    </div>
                  );
                })() : (
                  <div className="px-2 py-1 text-[11.5px] text-[#555555] italic font-sans">
                    Working tree clean
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Resizer Divider */}
          <div
            onMouseDown={handleResizerMouseDown}
            onDoubleClick={() => {
              setLeftPanelWidth(320);
              if (typeof window !== 'undefined') {
                try {
                  localStorage.setItem('aidev_git_left_panel_width', '320');
                } catch {}
              }
            }}
            className={`hidden lg:flex w-2.5 -ml-1.5 -mr-1.5 z-30 group cursor-col-resize select-none items-center justify-center relative transition-colors shrink-0 ${
              isResizing ? 'bg-blue-500/20' : 'hover:bg-blue-500/10'
            }`}
            title="Drag to resize. Double-click to reset."
          >
            <div
              className={`w-[1px] h-full transition-colors ${
                isResizing ? 'bg-blue-500' : 'bg-[#1e1e1e] group-hover:bg-blue-400/80'
              }`}
            />
            <div
              className={`absolute top-1/2 -translate-y-1/2 w-3.5 h-8 rounded-full flex items-center justify-center transition-all ${
                isResizing
                  ? 'opacity-100 bg-blue-600 scale-105 shadow-md shadow-blue-500/30'
                  : 'opacity-0 group-hover:opacity-100 bg-[#222222] border border-[#333333] hover:scale-105'
              }`}
            >
              <div className="flex flex-col gap-0.5 pointer-events-none">
                <div className="w-0.5 h-0.5 rounded-full bg-white/70" />
                <div className="w-0.5 h-0.5 rounded-full bg-white/70" />
                <div className="w-0.5 h-0.5 rounded-full bg-white/70" />
              </div>
            </div>
          </div>

          {/* Right Panel: Visual Diff Viewer */}
          <div
            className={`flex-1 min-h-0 flex flex-col h-full bg-[#101010] overflow-hidden ${
              !isLgScreen && !selectedFile ? 'hidden' : 'flex'
            }`}
          >
            {selectedFile && fileDiffData ? (
              <div className="flex-1 min-h-0 flex flex-col h-full">
                <div className="h-9 sm:h-8 bg-[#141414] border-b border-[#191919] px-2 sm:px-3 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-1.5 sm:gap-2 text-xs min-w-0">
                    <button
                      type="button"
                      onClick={() => setSelectedFile(null)}
                      className="lg:hidden p-1 -ml-1 rounded hover:bg-white/10 text-[#8c8c8c] hover:text-white transition shrink-0 cursor-pointer"
                      title="Back to file list"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                    </button>
                    <AestheticFileIcon filePath={selectedFile.path} className="w-3.5 h-3.5 shrink-0" />
                    <span className="font-mono text-white text-[11.5px] truncate max-w-[140px] xs:max-w-[200px] sm:max-w-none">
                      {selectedFile.path}
                    </span>
                    <span className="text-[10px] text-[#8c8c8c] bg-[#1e1e1e] border border-[#262626] px-1.5 py-0.2 rounded font-sans shrink-0 hidden xs:inline">
                      {selectedFile.staged ? 'Staged' : 'Working Tree'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 sm:gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() =>
                        handleStageAction(selectedFile.staged ? 'unstage' : 'stage', [
                          selectedFile.path,
                        ])
                      }
                      className="text-[11px] text-[#8c8c8c] hover:text-white px-2 py-0.5 rounded hover:bg-white/5 transition cursor-pointer"
                    >
                      {selectedFile.staged ? 'Unstage' : 'Stage'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedFile(null)}
                      className="p-1 rounded hover:bg-white/10 text-[#8c8c8c] hover:text-white transition cursor-pointer"
                      title="Close diff"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="flex-1 min-h-0 relative">
                  {isLoadingDiff ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-[#101010]/80 z-20">
                      <Loader2 className="w-5 h-5 animate-spin text-[#a0a0a0]" />
                    </div>
                  ) : null}
                  <DiffViewer
                    filePath={selectedFile.path}
                    originalContent={fileDiffData.originalContent}
                    currentContent={fileDiffData.currentContent}
                    mode={isMobile ? 'stacked' : diffMode}
                    workdir={workdir}
                  />
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-[#555555]">
                <GitBranch className="w-10 h-10 stroke-[1] text-[#333333] mb-3" />
                <span className="text-sm font-medium text-[#777777] mb-1">Visual Diff Inspector</span>
                <span className="text-xs max-w-sm text-[#555555]">
                  Select a file from the changes list on the left to inspect visual diff.
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 4. Discard Confirmation Modal */}
      {discardModal?.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-xs p-4">
          <div className="bg-[#181818] border border-[#2c2c2c] rounded-xl max-w-md w-full p-5 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-2.5 text-[#ff7b72]">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span className="font-semibold text-sm">
                {discardModal.isAll ? 'Discard All Changes?' : 'Discard File Changes?'}
              </span>
            </div>
            <p className="text-xs text-[#a0a0a0] leading-relaxed">
              {discardModal.isAll ? (
                <>
                  This action will revert all modified files to the latest commit
                  (HEAD) and remove unstaged new files.{' '}
                  <strong className="text-[#ff7b72]">
                    All uncommitted changes will be permanently lost.
                  </strong>
                </>
              ) : (
                <>
                  Are you sure you want to discard changes in{' '}
                  <code className="text-white font-mono bg-[#141414] px-1 py-0.5 rounded border border-[#222222]">
                    {discardModal.files[0]}
                  </code>
                  ? <strong className="text-[#ff7b72]">This action cannot be undone.</strong>
                </>
              )}
            </p>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setDiscardModal(null)}
                disabled={isDiscarding}
                className="px-3 py-1.5 rounded-lg text-xs text-[#8c8c8c] hover:text-white hover:bg-white/5 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDiscardConfirm}
                disabled={isDiscarding}
                className="px-3.5 py-1.5 rounded-lg text-xs bg-[#b83838] hover:bg-[#d63f3f] text-white font-medium transition cursor-pointer flex items-center gap-1.5 shadow-sm"
              >
                {isDiscarding ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RotateCcw className="w-3.5 h-3.5" />
                )}
                <span>Discard Changes</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. Delete Branch Confirmation Modal */}
      {deleteBranchConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-xs p-4">
          <div className="bg-[#181818] border border-[#2c2c2c] rounded-xl max-w-sm w-full p-5 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-2.5 text-[#ff7b72]">
              <Trash2 className="w-5 h-5 shrink-0" />
              <span className="font-semibold text-sm">Delete Local Branch</span>
            </div>
            <p className="text-xs text-[#a0a0a0] leading-relaxed">
              Are you sure you want to delete branch{' '}
              <code className="text-white font-mono bg-[#141414] px-1 py-0.5 rounded border border-[#222222]">
                {deleteBranchConfirm}
              </code>
              ?
            </p>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setDeleteBranchConfirm(null)}
                disabled={isDeletingBranch}
                className="px-3 py-1.5 rounded-lg text-xs text-[#8c8c8c] hover:text-white hover:bg-white/5 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDeleteBranch(deleteBranchConfirm)}
                disabled={isDeletingBranch}
                className="px-3.5 py-1.5 rounded-lg text-xs bg-[#b83838] hover:bg-[#d63f3f] text-white font-medium transition cursor-pointer flex items-center gap-1.5 shadow-sm"
              >
                {isDeletingBranch ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                <span>Delete Branch</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. Auth Modal Dialog */}
      {authErrorModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-[#181818] border border-[#262626] rounded-xl max-w-md w-full p-5 shadow-2xl space-y-4 animate-scale-in">
            <div className="flex items-center gap-2.5 text-[#ff7b72]">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span className="font-semibold text-sm">Git Authentication Required</span>
            </div>
            <p className="text-xs text-[#8c8c8c] leading-relaxed">
              Remote repository requires credentials / push permissions. You can open an interactive
              terminal to login via GitHub CLI or enter Git credentials.
            </p>
            <div className="p-2.5 rounded bg-[#141414] border border-[#222222] text-[11px] font-mono text-[#ff7b72] max-h-24 overflow-y-auto">
              {authErrorModal}
            </div>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setAuthErrorModal(null)}
                className="px-3 py-1.5 rounded-lg text-xs text-[#8c8c8c] hover:text-white hover:bg-white/5 transition"
              >
                Close
              </button>
              {onOpenTerminal && (
                <button
                  type="button"
                  onClick={() => {
                    setAuthErrorModal(null);
                    onOpenTerminal();
                  }}
                  className="px-3 py-1.5 rounded-lg text-xs bg-[#242424] hover:bg-[#2c2c2c] border border-[#333333] text-white font-medium transition flex items-center gap-1.5"
                >
                  <Terminal className="w-3.5 h-3.5 text-[#a0a0a0]" />
                  <span>Open Terminal</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
