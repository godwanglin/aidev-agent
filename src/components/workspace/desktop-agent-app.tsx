'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { TopBar } from '@/components/top-bar';
import { ChatHeader } from '@/components/chat/chat-header';
import { AdvancedSidebar } from '@/components/sidebar/advanced-sidebar';
import { ChatWorkspace, PendingQuestion } from '@/components/chat/chat-workspace';
import { SplitChatContainer } from '@/components/chat/split-chat-container';
import { MultiTabWorkspace, WorkspaceTab } from '@/components/workspace/multi-tab-workspace';
import type { WorkspaceMode } from '@/components/workspace/workspace-header';
import { DirectoryPickerModal } from '@/components/modals/directory-picker-modal';
import { SettingsModal } from '@/components/modals/settings-modal';
import { ScheduledTasksModal } from '@/components/modals/scheduled-tasks-modal';
import type { ProjectRecord, SessionRecord, MessageRecord, SubagentRecord, SessionCompactionRecord } from '@/lib/db';
import type { GatewayModel } from '@/lib/gateway';
import type { ActivityItem } from '@/components/sidebar/activity-section';
import type { PlanItem } from '@/components/sidebar/plan-section';
import type { ChangedFileItem } from '@/components/sidebar/changed-files-section';
import type { AidevSettings } from '@/lib/storage';
import type {
  OverviewArtifactItem,
  OverviewUploadItem,
  OverviewTaskItem,
  OverviewSkillItem,
} from '@/components/workspace/overview-view';
import { getProjectSlug, findProjectBySlug } from '@/lib/project-utils';
import { useConfirm } from '@/context/confirm-context';
import type { AttachedImage } from '@/components/chat/chat-input';
import { playNotificationChime } from '@/lib/audio';

function getSavedSessionWorkspace(sessionId?: string) {
  if (typeof window === 'undefined' || !sessionId) return null;
  try {
    const raw = localStorage.getItem(`aidev_workspace_${sessionId}`);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

function getInitialTargetSessionId(initialSessionId?: string): string | null {
  if (initialSessionId) return initialSessionId;
  if (typeof window === 'undefined') return null;
  try {
    const parts = window.location.pathname.split('/').filter(Boolean);
    if (parts.length >= 3 && parts[0] === 'projects') {
      return parts[2];
    }
    return localStorage.getItem('aidev_last_active_session_id') || null;
  } catch {
    return null;
  }
}

interface DesktopAgentAppProps {
  initialProjectSlug?: string;
  initialSessionId?: string;
  initialSpwId?: string;
  initialSpd?: 'right' | 'down';
  initialSettingsOpen?: boolean;
}

export const DesktopAgentApp: React.FC<DesktopAgentAppProps> = ({
  initialProjectSlug,
  initialSessionId,
  initialSpwId,
  initialSpd = 'right',
  initialSettingsOpen = false,
}) => {
  const router = useRouter();
  const { confirm, alert: customAlert } = useConfirm();

  // Instant synchronous workspace pre-hydration on client mount (zero sliding animation, zero layout delay)
  const initialTargetSessId = useMemo(() => getInitialTargetSessionId(initialSessionId), [initialSessionId]);
  const initialSavedWorkspace = useMemo(() => getSavedSessionWorkspace(initialTargetSessId || undefined), [initialTargetSessId]);

  // Config & Settings
  const [settings, setSettings] = useState<AidevSettings | null>(null);
  const [models, setModels] = useState<GatewayModel[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('gemini-3.8-flash-high');
  const [permissionMode, setPermissionMode] = useState<'ASK' | 'AUTO' | 'FULL_ACCESS'>('AUTO');

  // Projects & Sessions
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [currentProject, setCurrentProject] = useState<ProjectRecord | null>(null);
  const [allSessions, setAllSessions] = useState<SessionRecord[]>([]);
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [currentSession, setCurrentSession] = useState<SessionRecord | null>(null);

  const currentSessionRef = useRef<SessionRecord | null>(null);
  useEffect(() => {
    currentSessionRef.current = currentSession;
  }, [currentSession]);

  const currentProjectRef = useRef<ProjectRecord | null>(null);
  useEffect(() => {
    currentProjectRef.current = currentProject;
  }, [currentProject]);

  // Split Session State (Requirement 8 & 9)
  const [splitSession, setSplitSession] = useState<SessionRecord | null>(null);
  const [splitDirection, setSplitDirection] = useState<'right' | 'down'>(initialSpd);
  const [splitMessages, setSplitMessages] = useState<MessageRecord[]>([]);
  const [isSplitStreaming, setIsSplitStreaming] = useState(false);
  const [splitStreamingReasoning, setSplitStreamingReasoning] = useState('');
  const [splitStreamingContent, setSplitStreamingContent] = useState('');
  const [splitLiveToolMessages, setSplitLiveToolMessages] = useState<MessageRecord[]>([]);

  // Messages & Stream State (Primary)
  const [messages, setMessages] = useState<MessageRecord[]>([]);
  const [hasMoreMessages, setHasMoreMessages] = useState<boolean>(false);
  const [isLoadingOlderMessages, setIsLoadingOlderMessages] = useState<boolean>(false);
  const [isLoadingSession, setIsLoadingSession] = useState<boolean>(true);
  const lastLoadedSessionIdRef = useRef<string | null>(null);
  const [compactions, setCompactions] = useState<SessionCompactionRecord[]>([]);
  const [isCompacting, setIsCompacting] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingReasoning, setStreamingReasoning] = useState('');
  const [streamingContent, setStreamingContent] = useState('');
  const [liveToolMessages, setLiveToolMessages] = useState<MessageRecord[]>([]);
  const [runningTask, setRunningTask] = useState<string | undefined>(undefined);
  const [pendingPermission, setPendingPermission] = useState<any | null>(null);
  const [splitPendingPermission, setSplitPendingPermission] = useState<any | null>(null);
  const [pendingPlan, setPendingPlan] = useState<any | null>(null);
  const [pendingQuestion, setPendingQuestion] = useState<PendingQuestion | null>(null);
  const [splitPendingQuestion, setSplitPendingQuestion] = useState<PendingQuestion | null>(null);

  // Streaming status reference to prevent premature message overwriting
  const isStreamingRef = useRef(false);
  useEffect(() => {
    isStreamingRef.current = isStreaming;
  }, [isStreaming]);

  // Active stream counter to prevent superseded stream race conditions
  const activeStreamIdRef = useRef<number>(0);
  const sendMessageRef = useRef<(prompt: string, images?: AttachedImage[]) => Promise<void>>(async () => {});

  // Queued Follow-up Message State
  const [queuedMessage, setQueuedMessage] = useState<{ text: string; images?: AttachedImage[] } | null>(null);
  const queuedMessageRef = useRef<{ text: string; images?: AttachedImage[] } | null>(null);
  useEffect(() => {
    queuedMessageRef.current = queuedMessage;
  }, [queuedMessage]);

  const [queuedMessagesMode, setQueuedMessagesMode] = useState<'queue' | 'immediately'>('queue');
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('aidev_queued_messages') as 'queue' | 'immediately' | null;
      if (saved === 'queue' || saved === 'immediately') {
        setQueuedMessagesMode(saved);
        return;
      }
    }
    if (settings?.queuedMessagesMode) {
      setQueuedMessagesMode(settings.queuedMessagesMode);
    }
  }, [settings?.queuedMessagesMode]);

  const [verboseChat, setVerboseChat] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('aidev_verbose_chat');
      if (saved !== null) return saved === 'true';
    }
    return true;
  });

  useEffect(() => {
    if (settings?.verboseChat !== undefined) {
      setVerboseChat(settings.verboseChat);
    }
  }, [settings?.verboseChat]);

  useEffect(() => {
    const handleVerboseChange = (e: any) => {
      if (e?.detail !== undefined) {
        setVerboseChat(Boolean(e.detail));
      }
    };
    window.addEventListener('aidev-verbose-chat-change', handleVerboseChange);
    return () => {
      window.removeEventListener('aidev-verbose-chat-change', handleVerboseChange);
    };
  }, []);

  // Inspector & Workspace Data
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [planTitle, setPlanTitle] = useState<string | undefined>();
  const [planItems, setPlanItems] = useState<PlanItem[]>([]);
  const [changedFiles, setChangedFiles] = useState<ChangedFileItem[]>([]);
  const [terminals, setTerminals] = useState<Array<{ id: string; workdir: string }>>(() =>
    Array.isArray(initialSavedWorkspace?.terminals) ? initialSavedWorkspace.terminals : []
  );
  const [subagents, setSubagents] = useState<SubagentRecord[]>([]);
  const [workspaceFiles, setWorkspaceFiles] = useState<string[]>([]);
  const [overviewArtifacts, setOverviewArtifacts] = useState<OverviewArtifactItem[]>([]);
  const [overviewUploads, setOverviewUploads] = useState<OverviewUploadItem[]>([]);
  const [overviewSkills, setOverviewSkills] = useState<OverviewSkillItem[]>([]);
  const [tasks, setTasks] = useState<OverviewTaskItem[]>([]);

  // Multi-Tab Workspace State (Instantly hydrated, no sliding animation)
  const [tabs, setTabs] = useState<WorkspaceTab[]>(() =>
    Array.isArray(initialSavedWorkspace?.tabs) ? initialSavedWorkspace.tabs : []
  );
  const [activeTabId, setActiveTabId] = useState<string | null>(() =>
    initialSavedWorkspace?.activeTabId || (initialSavedWorkspace?.tabs?.[0]?.id ?? null)
  );
  const [isRightPanelOpen, setIsRightPanelOpen] = useState<boolean>(() =>
    Boolean(initialSavedWorkspace?.isRightPanelOpen)
  );

  // Sidebar Resizing & Collapse State
  const [leftSidebarWidth, setLeftSidebarWidth] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('aidev_sidebar_width');
      if (saved) {
        const parsed = parseInt(saved, 10);
        if (parsed >= 180 && parsed <= 460) return parsed;
      }
    }
    return 240;
  }); // min 180, max 460
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      if (window.innerWidth < 768) return true;
      return localStorage.getItem('aidev_sidebar_collapsed') === 'true';
    }
    return false;
  });
  const [isMobile, setIsMobile] = useState<boolean>(false);
  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) {
        setIsSidebarCollapsed(true);
      }
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
  const [rightPanelWidth, setRightPanelWidth] = useState<number>(() =>
    typeof initialSavedWorkspace?.rightPanelWidth === 'number' && initialSavedWorkspace.rightPanelWidth >= 320
      ? initialSavedWorkspace.rightPanelWidth
      : 540
  ); // min 320, max 950
  const [isResizingLeft, setIsResizingLeft] = useState(false);
  const [isResizingRight, setIsResizingRight] = useState(false);
  const [isRightPanelMaximized, setIsRightPanelMaximized] = useState(false);
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>(() =>
    initialSavedWorkspace?.workspaceMode || 'file'
  );
  const prevRightPanelWidthRef = useRef<number>(540);
  const prevSidebarCollapsedRef = useRef<boolean>(false);

  // Persistence Refs
  const loadedSessionIdRef = useRef<string | null>(initialSavedWorkspace ? initialTargetSessId : null);
  const isHydratingRef = useRef<boolean>(false);
  const isInitialMountRef = useRef<boolean>(true);
  const [hasMounted, setHasMounted] = useState<boolean>(false);

  useEffect(() => {
    isInitialMountRef.current = false;
    setHasMounted(true);
  }, []);

  // Modals
  const [isDirectoryPickerOpen, setIsDirectoryPickerOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState<boolean>(() => {
    if (initialSettingsOpen) return true;
    if (typeof window !== 'undefined' && window.location.pathname === '/settings') return true;
    return false;
  });
  const [isScheduledTasksModalOpen, setIsScheduledTasksModalOpen] = useState(false);
  const [isRenamingSession, setIsRenamingSession] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<string>('general');

  const abortControllerRef = useRef<AbortController | null>(null);
  const splitAbortControllerRef = useRef<AbortController | null>(null);

  const handleOpenSettings = useCallback((tab?: string) => {
    if (tab && typeof tab === 'string') {
      setSettingsInitialTab(tab);
    } else {
      setSettingsInitialTab('general');
    }
    setIsSettingsModalOpen(true);
    if (typeof window !== 'undefined' && window.location.pathname !== '/settings') {
      window.history.pushState({ modal: 'settings' }, '', '/settings');
    }
  }, []);

  const handleOpenProjectSettings = useCallback(
    (project: ProjectRecord) => {
      handleOpenSettings(`project_${project.id}`);
    },
    [handleOpenSettings]
  );

  const handleUpdateProject = useCallback(
    (updated: ProjectRecord) => {
      setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      if (currentProject?.id === updated.id) {
        setCurrentProject(updated);
      }
    },
    [currentProject]
  );

  const handleCloseSettings = useCallback(() => {
    setIsSettingsModalOpen(false);
    if (typeof window !== 'undefined' && window.location.pathname === '/settings') {
      if (window.history.length > 1) {
        window.history.back();
      } else if (currentProject) {
        const slug = getProjectSlug(currentProject);
        const sessPath = currentSession ? `/${currentSession.id}` : '';
        window.history.replaceState(null, '', `/projects/${slug}${sessPath}`);
      } else {
        window.history.replaceState(null, '', '/');
      }
    }
  }, [currentProject, currentSession]);

  // Global Keyboard Shortcut: Ctrl+, or Cmd+, to open Settings
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        e.preventDefault();
        handleOpenSettings();
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [handleOpenSettings]);


  // URL Sync Helper (Requirement 4 & 8)
  const syncUrl = useCallback(
    (
      proj: ProjectRecord | null,
      sess: SessionRecord | null,
      spwId?: string | null,
      spdDir?: 'right' | 'down'
    ) => {
      if (typeof window === 'undefined') return;
      let targetPath = '/';
      if (proj) {
        const slug = getProjectSlug(proj);
        targetPath = `/projects/${slug}`;
        if (sess) {
          targetPath += `/${sess.id}`;
        }
      }
      const params = new URLSearchParams();
      if (!proj && sess) {
        params.set('session', sess.id);
      }
      if (spwId) {
        params.set('spw', spwId);
        if (spdDir && spdDir !== 'right') {
          params.set('spd', spdDir);
        }
      }
      const qs = params.toString();
      const finalUrl = qs ? `${targetPath}?${qs}` : targetPath;
      if (window.location.pathname + window.location.search !== finalUrl) {
        window.history.pushState(null, '', finalUrl);
      }
    },
    []
  );

  const handleDeleteProject = useCallback(
    (projectId: string) => {
      setProjects((prev) => {
        const remaining = prev.filter((p) => p.id !== projectId);
        if (currentProject?.id === projectId) {
          if (remaining.length > 0) {
            setCurrentProject(remaining[0]);
            syncUrl(remaining[0], null);
          } else {
            setCurrentProject(null);
            setCurrentSession(null);
            setMessages([]);
          }
        }
        return remaining;
      });
      setAllSessions((prev) => prev.filter((s) => s.project_id !== projectId));
    },
    [currentProject?.id, syncUrl]
  );

  // Browser History Navigation (Back / Forward) Synchronization (Requirement 3)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handlePopState = () => {
      const pathname = window.location.pathname;
      if (pathname === '/settings') {
        setIsSettingsModalOpen(true);
        return;
      } else {
        setIsSettingsModalOpen(false);
      }

      const search = window.location.search;
      const searchParams = new URLSearchParams(search);
      const spwId = searchParams.get('spw') || undefined;
      const spdDir = (searchParams.get('spd') as 'right' | 'down') || 'right';

      // Parse /projects/:projectSlug/:sessionId?
      const match = pathname.match(/^\/projects\/([^\/]+)(?:\/([^\/]+))?/);
      if (match) {
        const slug = match[1];
        const sessId = match[2];

        // Match project
        const targetProj = findProjectBySlug(projects, slug) || projects.find((p) => p.id === slug);
        if (targetProj) {
          if (targetProj.id !== currentProject?.id) {
            setCurrentProject(targetProj);
          }

          if (sessId) {
            const targetSess = allSessions.find((s) => s.id === sessId);
            if (targetSess) {
              if (currentSession?.id !== targetSess.id) {
                setCurrentSession(targetSess);
                if (targetSess.model_id) setSelectedModel(targetSess.model_id);
                if (targetSess.permission_mode) setPermissionMode(targetSess.permission_mode);
              }
            } else {
              // Session not yet in local state, fetch from API
              fetch(`/api/sessions/${sessId}`)
                .then((r) => r.json())
                .then((d) => {
                  if (d.session) {
                    setAllSessions((prev) => [d.session, ...prev.filter((s) => s.id !== d.session.id)]);
                    setCurrentSession(d.session);
                  }
                })
                .catch(console.error);
            }
          } else {
            // Project root route (/projects/slug) -> empty conversation
            loadedSessionIdRef.current = null;
            setCurrentSession(null);
            setMessages([]);
            setStreamingReasoning('');
            setStreamingContent('');
            setLiveToolMessages([]);
            setActivities([]);
            setPlanItems([]);
            setChangedFiles([]);
            setPendingPermission(null);
            setPendingPlan(null);
            setPendingQuestion(null);
            setTabs([]);
            setActiveTabId(null);
          }

          // Split pane sync
          if (spwId) {
            const splitSess = allSessions.find((s) => s.id === spwId);
            if (splitSess) {
              setSplitSession(splitSess);
              setSplitDirection(spdDir);
            }
          } else {
            setSplitSession(null);
          }
        }
      } else if (pathname === '/' || pathname === '') {
        // App root
        if (projects.length > 0) {
          setCurrentProject(projects[0]);
          loadedSessionIdRef.current = null;
          setCurrentSession(null);
          setMessages([]);
        }
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [projects, allSessions, currentProject?.id, currentSession?.id]);

  // 1. Initial Load: Config, Models, Projects & All Sessions
  useEffect(() => {
    const initApp = async () => {
      try {
        setIsLoadingSession(true);

        // Fetch core data in parallel (ultra-fast ~10-15ms)
        const [cfgRes, projRes, sessRes] = await Promise.all([
          fetch('/api/config'),
          fetch('/api/projects'),
          fetch('/api/sessions'),
        ]);

        const cfgData = await cfgRes.json();
        const projData = await projRes.json();
        const sessData = await sessRes.json();

        // Concurrently load available models without blocking session and chat rendering
        fetch('/api/models')
          .then((r) => r.json())
          .then((d) => {
            if (d.models) setModels(d.models);
          })
          .catch(console.error);

        if (cfgData.settings) {
          setSettings(cfgData.settings);
          setSelectedModel(cfgData.settings.defaultModel || 'gemini-3.8-flash-high');
          setPermissionMode(cfgData.settings.permissionMode || 'AUTO');
        }

        const loadedProjects: ProjectRecord[] = projData.projects || [];
        setProjects(loadedProjects);

        const loadedAllSessions: SessionRecord[] = sessData.sessions || [];
        setAllSessions(loadedAllSessions);

        const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
        const effectiveSessionId = initialSessionId || urlParams?.get('session') || undefined;

        // Determine target project from URL or session
        let targetProj: ProjectRecord | undefined;
        if (initialProjectSlug) {
          targetProj = findProjectBySlug(loadedProjects, initialProjectSlug);
        }

        let targetSess: SessionRecord | undefined;
        if (effectiveSessionId) {
          targetSess = loadedAllSessions.find((s) => s.id === effectiveSessionId);
          if (targetSess && !targetProj && targetSess.project_id && targetSess.project_id !== 'no_project') {
            targetProj = loadedProjects.find((p) => p.id === targetSess!.project_id);
          }
        }

        // If no explicit project or session requested from URL, pick first project if available
        if (!targetProj && !effectiveSessionId && loadedProjects.length > 0) {
          targetProj = loadedProjects[0];
        }

        if (targetProj) {
          setCurrentProject(targetProj);
          if (!targetSess) {
            targetSess = loadedAllSessions.find((s) => s.project_id === targetProj!.id);
          }
        } else {
          setCurrentProject(null);
        }

        if (targetSess) {
          setCurrentSession(targetSess);
          if (targetSess.model_id) setSelectedModel(targetSess.model_id);
          if (targetSess.permission_mode) setPermissionMode(targetSess.permission_mode);
          // Clear unread if opening
          if (targetSess.is_unread) {
            fetch(`/api/sessions/${targetSess.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ is_unread: 0 }),
            });
          }
        } else {
          setCurrentSession(null);
        }

        // Handle split session from URL if present
        if (initialSpwId) {
          if (initialSpwId === 'new') {
            const draftSession: SessionRecord = {
              id: `draft_${Date.now()}`,
              project_id: targetProj?.id || 'no_project',
              title: 'New Conversation',
              model_id: 'gemini-3.8-flash-high',
              permission_mode: permissionMode || 'AUTO',
              is_unread: 0,
              created_at: Date.now(),
              updated_at: Date.now(),
            };
            setSplitSession(draftSession);
            setSplitMessages([]);
            setSplitDirection(initialSpd);
          } else {
            const splitSess = loadedAllSessions.find((s) => s.id === initialSpwId);
            if (splitSess) {
              setSplitSession(splitSess);
              setSplitDirection(initialSpd);
              // Load split messages
              fetch(`/api/sessions/${splitSess.id}`)
                .then((r) => r.json())
                .then((d) => {
                  if (d.messages) setSplitMessages(d.messages);
                })
                .catch(console.error);
            }
          }
        }

        syncUrl(targetProj || null, targetSess || null, initialSpwId, initialSpd);
        setIsLoadingSession(false);
      } catch (err) {
        console.error('Failed to initialize app state:', err);
        setIsLoadingSession(false);
      }
    };

    initApp();
  }, [initialProjectSlug, initialSessionId, initialSpwId, initialSpd, syncUrl]);

  // 2. Project Change: Load Workspace Files and Project Sessions
  useEffect(() => {
    if (!currentProject) {
      setWorkspaceFiles([]);
      setSessions([]);
      return;
    }

    const loadProjectData = async () => {
      try {
        const filesRes = await fetch(
          `/api/files/list?workdir=${encodeURIComponent(currentProject.workdir_path)}`
        );
        const filesData = await filesRes.json();
        if (filesData.files) setWorkspaceFiles(filesData.files);

        const projSessions = allSessions.filter((s) => s.project_id === currentProject.id);
        setSessions(projSessions);
      } catch (err) {
        console.error('Failed to load project files:', err);
      }
    };

    loadProjectData();
  }, [currentProject, allSessions]);

  // 3. Session Change: Load Message History & Workspace Inspector Data
  const refreshSessionData = useCallback(async (options?: { skipMessages?: boolean; forceMessages?: boolean; targetSessionId?: string }) => {
    const activeSession = options?.targetSessionId
      ? (allSessions.find((s) => s.id === options.targetSessionId) ||
         (currentSessionRef.current?.id === options.targetSessionId ? currentSessionRef.current : null) ||
         ({ id: options.targetSessionId } as SessionRecord))
      : (currentSessionRef.current || currentSession);

    if (!activeSession || !activeSession.id) {
      setOverviewArtifacts([]);
      setOverviewUploads([]);
      setOverviewSkills([]);
      setChangedFiles([]);
      setSubagents([]);
      setMessages([]);
      setHasMoreMessages(false);
      setIsLoadingSession(false);
      setCompactions([]);
      lastLoadedSessionIdRef.current = null;
      return;
    }

    const sessionId = activeSession.id;
    try {
      const isDifferentSession = lastLoadedSessionIdRef.current !== sessionId;
      if (isDifferentSession && !options?.skipMessages) {
        setIsLoadingSession(true);
      }
      const detailRes = await fetch(`/api/sessions/${sessionId}`);
      const detailData = await detailRes.json();
      if (detailData.compactions) {
        setCompactions(detailData.compactions);
      } else {
        setCompactions([]);
      }
      if (detailData.isRunning) {
        setIsStreaming(true);
      }
      lastLoadedSessionIdRef.current = sessionId;
      if (typeof detailData.hasMore === 'boolean') {
        setHasMoreMessages(detailData.hasMore);
      }
      const shouldUpdateMessages = !options?.skipMessages && (!isStreamingRef.current || options?.forceMessages || detailData.isRunning);
      if (detailData.messages && shouldUpdateMessages) {
        setMessages((prev) => {
          // If server returns empty messages, but local state already has messages (e.g. optimistic user message just added), KEEP local messages!
          if (detailData.messages.length === 0 && prev.length > 0) {
            return prev;
          }
          if (isDifferentSession || prev.length === 0) {
            return detailData.messages;
          }

          const serverMsgIds = new Set(detailData.messages.map((m: MessageRecord) => m.id));
          const serverUserMsgs = detailData.messages.filter((m: MessageRecord) => m.role === 'user');

          // Helper to check if a local message is an optimistic duplicate of a server user message
          const isOptimisticUserDuplicate = (localMsg: MessageRecord) => {
            if (localMsg.role !== 'user') return false;
            if (serverMsgIds.has(localMsg.id)) return true;
            return serverUserMsgs.some((sm: MessageRecord) => {
              if (sm.id === localMsg.id) return true;
              if (sm.content === localMsg.content) return true;
              return Math.abs((sm.created_at || 0) - (localMsg.created_at || 0)) < 30000;
            });
          };

          // If detailData has all messages (!detailData.hasMore):
          // detailData.messages contains the complete history from session start!
          if (!detailData.hasMore) {
            const uncommitted = prev.filter((m) => {
              if (serverMsgIds.has(m.id)) return false;
              if (isOptimisticUserDuplicate(m)) return false;
              if (m.tool_call_id && detailData.messages.some((sm: MessageRecord) => sm.tool_call_id === m.tool_call_id)) return false;
              return true;
            });
            const latestServerCreatedAt = detailData.messages[detailData.messages.length - 1]?.created_at || 0;
            const validUncommitted = uncommitted.filter((u) => (u.created_at || 0) >= latestServerCreatedAt);
            return [...detailData.messages, ...validUncommitted];
          }

          // If detailData.hasMore is true (there are older messages in history before detailData.messages[0]):
          const oldestNewCreatedAt = detailData.messages[0].created_at;
          const olderKept = prev.filter((m) => {
            if (serverMsgIds.has(m.id)) return false;
            if (isOptimisticUserDuplicate(m)) return false;
            if (m.id.startsWith('user_') || m.id.startsWith('temp_')) return false;
            return (m.created_at || 0) < oldestNewCreatedAt;
          });

          return [...olderKept, ...detailData.messages];
        });
        setIsLoadingSession(false);
        const lastMsg = detailData.messages.length > 0 ? detailData.messages[detailData.messages.length - 1] : null;
        if (lastMsg && lastMsg.status === 'PENDING_PERMISSION') {
          let parsedArgs: any = {};
          try {
            parsedArgs = JSON.parse(lastMsg.tool_arguments || '{}');
          } catch {}
          setPendingPermission({
            toolCallId: lastMsg.tool_call_id,
            messageId: lastMsg.id,
            toolName: lastMsg.tool_name || 'tool',
            arguments: parsedArgs,
            actionType: lastMsg.tool_name === 'run_command' ? 'COMMAND' : 'FILE_WRITE',
            targetResource: parsedArgs.path || parsedArgs.command || lastMsg.tool_name,
            reason: `Interactive approval required for ${lastMsg.tool_name}`,
            mode: activeSession?.permission_mode || 'ASK',
          });
          setPendingQuestion(null);
        } else if (lastMsg && lastMsg.status === 'PENDING_QUESTION') {
          let parsedArgs: any = {};
          try {
            parsedArgs = JSON.parse(lastMsg.tool_arguments || '{}');
          } catch {}
          setPendingQuestion({
            toolCallId: lastMsg.tool_call_id,
            messageId: lastMsg.id,
            question: parsedArgs.question || 'Select one of the following options:',
            options: Array.isArray(parsedArgs.options) ? parsedArgs.options : [],
            allowCustom: parsedArgs.allowCustom !== false,
          });
          setPendingPermission(null);
        } else {
          setPendingPermission(null);
          setPendingQuestion(null);
        }

        // Restore pendingPlan if the last message was an implementation plan waiting for review
        const isPlanLastMsg =
          lastMsg &&
          lastMsg.role === 'assistant' &&
          typeof lastMsg.content === 'string' &&
          (lastMsg.content.includes('generated the implementation plan for') ||
           lastMsg.content.includes('implementation_plan.md') ||
           lastMsg.content.trim().startsWith('# Implementation Plan') ||
           lastMsg.content.trim().startsWith('Implementation Plan:'));

        if (isPlanLastMsg) {
          let extractedGoal = '';
          if (typeof lastMsg.content === 'string') {
            const m = lastMsg.content.match(/generated the implementation plan for \*\*([^*]+)\*\*/i) ||
                      lastMsg.content.match(/Implementation Plan:\s*([^\n\r]+)/i);
            if (m && m[1]) extractedGoal = m[1].trim();
          }
          setPendingPlan((prev: any) => prev || {
            sessionId,
            planMarkdown: '',
            goal: extractedGoal || (activeSession.title !== 'New Coding Session' ? activeSession.title : 'Task Implementation'),
          });
        } else if (lastMsg && lastMsg.role === 'user') {
          setPendingPlan(null);
        }
      } else {
        setIsLoadingSession(false);
      }
      if (detailData.subagents) setSubagents(detailData.subagents);

      // Fetch sidebar data (changed files, file tree, workspace overview/skills, tasks) in parallel
      const effectiveWorkdir = currentProjectRef.current?.workdir_path || currentProject?.workdir_path;
      const fetchList: Promise<any>[] = [
        fetch(`/api/tasks?sessionId=${sessionId}`).then((r) => r.json()),
      ];
      if (effectiveWorkdir) {
        const encodedWorkdir = encodeURIComponent(effectiveWorkdir);
        fetchList.push(
          fetch(`/api/files/changed?sessionId=${sessionId}&workdir=${encodedWorkdir}`).then((r) => r.json()),
          fetch(`/api/files/list?workdir=${encodedWorkdir}`).then((r) => r.json()),
          fetch(`/api/workspace/overview?sessionId=${sessionId}&workdir=${encodedWorkdir}`).then((r) => r.json()),
        );
      } else {
        fetchList.push(
          fetch(`/api/workspace/overview?sessionId=${sessionId}`).then((r) => r.json()),
        );
      }
      const settled = await Promise.allSettled(fetchList);

      const tasksResult = settled[0];
      if (tasksResult.status === 'fulfilled' && Array.isArray(tasksResult.value?.tasks)) {
        setTasks(
          tasksResult.value.tasks.map((t: any) => ({
            id: t.id,
            cmd: t.command,
            status: t.status,
            timestamp: t.created_at,
          }))
        );
      }

      if (effectiveWorkdir) {
        const changedResult = settled[1];
        const filesResult = settled[2];
        const overResult = settled[3];

        if (changedResult.status === 'fulfilled' && changedResult.value?.changedFiles) {
          setChangedFiles(changedResult.value.changedFiles);
        }
        if (filesResult.status === 'fulfilled' && filesResult.value?.files) {
          setWorkspaceFiles(filesResult.value.files);
        }
        if (overResult.status === 'fulfilled' && overResult.value) {
          if (overResult.value.artifacts) setOverviewArtifacts(overResult.value.artifacts);
          if (overResult.value.uploads) setOverviewUploads(overResult.value.uploads);
          if (overResult.value.skills) setOverviewSkills(overResult.value.skills);
        }
      } else {
        setChangedFiles([]);
        setWorkspaceFiles([]);
        const overResult = settled[1];
        if (overResult && overResult.status === 'fulfilled' && overResult.value) {
          if (overResult.value.artifacts) setOverviewArtifacts(overResult.value.artifacts);
          if (overResult.value.uploads) setOverviewUploads(overResult.value.uploads);
          if (overResult.value.skills) setOverviewSkills(overResult.value.skills);
        }
      }
    } catch (err) {
      console.error('Failed to load session details:', err);
    } finally {
      setIsLoadingSession(false);
    }
  }, [currentSession, currentProject, allSessions]);

  const handleLoadOlderMessages = useCallback(async () => {
    if (!currentSession?.id || isLoadingOlderMessages || !hasMoreMessages || messages.length === 0) {
      return;
    }
    setIsLoadingOlderMessages(true);
    try {
      const earliestCreatedAt = messages[0].created_at;
      const res = await fetch(`/api/sessions/${currentSession.id}/messages?before=${earliestCreatedAt}&limitTurns=5`);
      const data = await res.json();
      if (Array.isArray(data.messages) && data.messages.length > 0) {
        setMessages((prev) => {
          const existingIds = new Set(prev.map((m) => m.id));
          const newOlder = data.messages.filter((m: MessageRecord) => !existingIds.has(m.id));
          return [...newOlder, ...prev];
        });
      }
      setHasMoreMessages(Boolean(data.hasMore));
    } catch (err) {
      console.error('Failed to load older messages:', err);
    } finally {
      setIsLoadingOlderMessages(false);
    }
  }, [currentSession?.id, isLoadingOlderMessages, hasMoreMessages, messages]);

  useEffect(() => {
    refreshSessionData();
  }, [refreshSessionData]);

  // Periodically poll session orchestrator status when running across page reloads
  useEffect(() => {
    if (!isStreaming || !currentSession?.id) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/sessions/${currentSession.id}`);
        const data = await res.json();
        if (data.isRunning) {
          refreshSessionData({ forceMessages: true });
        } else {
          setIsStreaming(false);
          refreshSessionData({ forceMessages: true });
          if (typeof window !== 'undefined' && localStorage.getItem('aidev_sound_notifications') !== 'false') {
            playNotificationChime();
          }
        }
      } catch (pollErr) {
        console.error('Failed polling session orchestrator:', pollErr);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [isStreaming, currentSession?.id, refreshSessionData]);

  // Periodically refresh tasks when at least one task is running
  useEffect(() => {
    const hasRunningTask = tasks.some((t) => t.status === 'RUNNING');
    if (!hasRunningTask) return;

    const interval = setInterval(() => {
      if (currentSession?.id) {
        fetch(`/api/tasks?sessionId=${currentSession.id}`)
          .then((r) => r.json())
          .then((data) => {
            if (Array.isArray(data.tasks)) {
              setTasks(
                data.tasks.map((t: any) => ({
                  id: t.id,
                  cmd: t.command,
                  status: t.status,
                  timestamp: t.created_at,
                }))
              );
            }
          })
          .catch(() => {});
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [tasks, currentSession?.id]);

  // Load split messages when splitSession changes
  useEffect(() => {
    if (!splitSession) {
      setSplitMessages([]);
      setSplitPendingPermission(null);
      return;
    }
    fetch(`/api/sessions/${splitSession.id}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.messages) {
          setSplitMessages(d.messages);
          const lastMsg = d.messages.length > 0 ? d.messages[d.messages.length - 1] : null;
          if (lastMsg && lastMsg.status === 'PENDING_PERMISSION') {
            let parsedArgs: any = {};
            try {
              parsedArgs = JSON.parse(lastMsg.tool_arguments || '{}');
            } catch {}
            setSplitPendingPermission({
              toolCallId: lastMsg.tool_call_id,
              messageId: lastMsg.id,
              toolName: lastMsg.tool_name || 'tool',
              arguments: parsedArgs,
              actionType: lastMsg.tool_name === 'run_command' ? 'COMMAND' : 'FILE_WRITE',
              targetResource: parsedArgs.path || parsedArgs.command || lastMsg.tool_name,
              reason: `Interactive approval required for ${lastMsg.tool_name}`,
              mode: splitSession?.permission_mode || 'ASK',
            });
          } else {
            setSplitPendingPermission(null);
          }
        }
      })
      .catch(console.error);
  }, [splitSession?.id]);

  // Helper to refresh disk content for restored open file tabs
  const refreshOpenTabContents = useCallback(
    async (tabsToRefresh: WorkspaceTab[], workdir: string) => {
      try {
        const fileTabs = tabsToRefresh.filter((t) => t.type === 'file' && t.filePath);
        if (fileTabs.length === 0) return;

        const updated = await Promise.all(
          tabsToRefresh.map(async (tab) => {
            if (tab.type === 'file' && tab.filePath) {
              try {
                const res = await fetch(
                  `/api/files/read?workdir=${encodeURIComponent(workdir)}&path=${encodeURIComponent(
                    tab.filePath
                  )}`
                );
                const data = await res.json();
                if (data.content !== undefined) {
                  return { ...tab, currentContent: data.content };
                }
              } catch {}
            }
            return tab;
          })
        );
        setTabs(updated);
      } catch (err) {
        console.error('Failed to refresh open tab contents:', err);
      }
    },
    []
  );

  // Helper to refresh disk content for a single changed file or artifact (e.g. living walkthrough.md)
  const refreshSingleOpenTab = useCallback(
    async (changedPath: string) => {
      if (!currentProject?.workdir_path || !changedPath) return;
      const cleanPath = changedPath.replace(/^file:\/\/\/?/i, '').replace(/\\/g, '/');

      setTabs((prevTabs) => {
        const matchingTab = prevTabs.find(
          (t) =>
            t.type === 'file' &&
            t.filePath &&
            (t.filePath === cleanPath ||
              t.filePath.endsWith('/' + cleanPath) ||
              cleanPath.endsWith('/' + t.filePath) ||
              (cleanPath.includes('walkthrough.md') && t.filePath.includes('walkthrough.md')) ||
              (cleanPath.includes('implementation_plan.md') && t.filePath.includes('implementation_plan.md')))
        );

        if (!matchingTab) return prevTabs;

        fetch(
          `/api/files/read?workdir=${encodeURIComponent(
            currentProject.workdir_path
          )}&path=${encodeURIComponent(matchingTab.filePath || cleanPath)}&sessionId=${encodeURIComponent(
            currentSession?.id || ''
          )}`
        )
          .then((res) => res.json())
          .then((data) => {
            if (data.content !== undefined) {
              setTabs((curr) =>
                curr.map((t) => {
                  if (t.id === matchingTab.id) {
                    return { ...t, content: data.content, currentContent: data.content };
                  }
                  return t;
                })
              );
            }
          })
          .catch((err) => console.error('Failed refreshing changed tab:', err));

        return prevTabs;
      });
    },
    [currentProject?.workdir_path, currentSession?.id]
  );

  // 4. Hydrate Workspace State (Tabs, Panel Open, Mode, Terminals, Width) on Session Change or Reload
  useEffect(() => {
    if (!currentSession?.id) {
      loadedSessionIdRef.current = null;
      return;
    }

    try {
      localStorage.setItem('aidev_last_active_session_id', currentSession.id);
    } catch {}

    if (loadedSessionIdRef.current === currentSession.id) {
      if (currentProject?.workdir_path && tabs.length > 0) {
        refreshOpenTabContents(tabs, currentProject.workdir_path);
      }
      return;
    }

    isHydratingRef.current = true;
    loadedSessionIdRef.current = currentSession.id;

    try {
      const savedRaw = localStorage.getItem(`aidev_workspace_${currentSession.id}`);
      if (savedRaw) {
        const saved = JSON.parse(savedRaw);
        const restoredTabs: WorkspaceTab[] = Array.isArray(saved.tabs) ? saved.tabs : [];
        setTabs(restoredTabs);
        setActiveTabId(saved.activeTabId || (restoredTabs[0]?.id ?? null));
        setIsRightPanelOpen(Boolean(saved.isRightPanelOpen));
        if (saved.workspaceMode) {
          setWorkspaceMode(saved.workspaceMode);
        }
        if (Array.isArray(saved.terminals)) {
          setTerminals(saved.terminals);
        }
        if (typeof saved.rightPanelWidth === 'number' && saved.rightPanelWidth >= 320) {
          setRightPanelWidth(saved.rightPanelWidth);
        }

        if (currentProject?.workdir_path && restoredTabs.length > 0) {
          refreshOpenTabContents(restoredTabs, currentProject.workdir_path);
        }
      } else {
        const hasExistingState = tabs.length > 0 || terminals.length > 0 || isRightPanelOpen;
        if (!hasExistingState) {
          setTabs([]);
          setActiveTabId(null);
          setIsRightPanelOpen(false);
          setWorkspaceMode('file');
          setTerminals([]);
        }
      }
    } catch (e) {
      console.error('Failed to restore workspace state:', e);
    } finally {
      setTimeout(() => {
        isHydratingRef.current = false;
      }, 60);
    }
  }, [currentSession?.id, currentProject?.workdir_path, refreshOpenTabContents]);

  // 5. Auto-save Workspace State per Session
  useEffect(() => {
    if (!currentSession?.id) return;
    if (isHydratingRef.current) return;
    if (loadedSessionIdRef.current !== currentSession.id) return;

    try {
      const stateToSave = {
        tabs,
        activeTabId,
        isRightPanelOpen,
        workspaceMode,
        terminals,
        rightPanelWidth,
      };
      localStorage.setItem(`aidev_workspace_${currentSession.id}`, JSON.stringify(stateToSave));
    } catch (e) {
      console.error('Failed to save workspace state:', e);
    }
  }, [
    tabs,
    activeTabId,
    isRightPanelOpen,
    workspaceMode,
    terminals,
    rightPanelWidth,
    currentSession?.id,
  ]);

  // 6. Persist Left Sidebar Settings
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('aidev_sidebar_width', String(leftSidebarWidth));
    }
  }, [leftSidebarWidth]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('aidev_sidebar_collapsed', String(isSidebarCollapsed));
    }
  }, [isSidebarCollapsed]);

  // Actions
  const handleModelChange = async (newModel: string) => {
    setSelectedModel(newModel);
    if (currentSession) {
      setCurrentSession((prev) => (prev ? { ...prev, model_id: newModel } : null));
      setAllSessions((prev) =>
        prev.map((s) => (s.id === currentSession.id ? { ...s, model_id: newModel } : s))
      );
      try {
        await fetch(`/api/sessions/${currentSession.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model_id: newModel }),
        });
      } catch (err) {
        console.error('Failed to update session model:', err);
      }
    }
  };

  const handleRefreshModels = useCallback(async () => {
    try {
      const res = await fetch('/api/models?refresh=true');
      const data = await res.json();
      if (data.models && Array.isArray(data.models)) {
        setModels(data.models);
      }
    } catch (err) {
      console.error('Failed to refresh models:', err);
    }
  }, []);

  const handleSelectSession = (session: SessionRecord, project?: ProjectRecord | null) => {
    if (isMobile) setIsSidebarCollapsed(true);
    let targetProj: ProjectRecord | null = null;
    if (project !== undefined) {
      targetProj = project;
    } else if (session.project_id && session.project_id !== 'no_project') {
      targetProj = projects.find((p) => p.id === session.project_id) || null;
    } else {
      targetProj = null;
    }

    currentSessionRef.current = session;
    currentProjectRef.current = targetProj;
    setCurrentProject(targetProj);
    setCurrentSession(session);
    if (session.model_id) setSelectedModel(session.model_id);
    if (session.permission_mode) setPermissionMode(session.permission_mode);

    // Clear unread
    if (session.is_unread) {
      fetch(`/api/sessions/${session.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_unread: 0 }),
      });
      setAllSessions((prev) =>
        prev.map((s) => (s.id === session.id ? { ...s, is_unread: 0 } : s))
      );
    }

    syncUrl(targetProj, session, splitSession?.id, splitDirection);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('aidev:focus-prompt'));
    }
  };

  const handleStartNewConversation = () => {
    if (isMobile) setIsSidebarCollapsed(true);
    loadedSessionIdRef.current = null;
    currentSessionRef.current = null;
    currentProjectRef.current = null;
    setCurrentProject(null);
    setCurrentSession(null);
    setMessages([]);
    setStreamingReasoning('');
    setStreamingContent('');
    setLiveToolMessages([]);
    setActivities([]);
    setPlanItems([]);
    setChangedFiles([]);
    setPendingPermission(null);
    setPendingPlan(null);
    setTabs([]);
    setActiveTabId(null);
    setIsRightPanelOpen(false);
    setWorkspaceMode('file');
    setTerminals([]);
    syncUrl(null, null, splitSession?.id, splitDirection);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('aidev:focus-prompt'));
    }
  };

  // Listen for actions dispatched from Electron Desktop Titlebar (Gambar 2)
  useEffect(() => {
    const onToggleSidebar = () => {
      setIsSidebarCollapsed((prev) => !prev);
    };
    const onOpenSettings = () => {
      handleOpenSettings();
    };
    const onOpenFolder = () => {
      setIsDirectoryPickerOpen(true);
    };
    const onNewSession = () => {
      handleStartNewConversation();
    };
    const onToggleRightPanel = () => {
      setIsRightPanelOpen((prev) => !prev);
    };

    window.addEventListener('aidev:toggle-sidebar', onToggleSidebar);
    window.addEventListener('aidev:open-settings', onOpenSettings);
    window.addEventListener('aidev:open-folder', onOpenFolder);
    window.addEventListener('aidev:new-session', onNewSession);
    window.addEventListener('aidev:toggle-auxiliary', onToggleRightPanel);

    return () => {
      window.removeEventListener('aidev:toggle-sidebar', onToggleSidebar);
      window.removeEventListener('aidev:open-settings', onOpenSettings);
      window.removeEventListener('aidev:open-folder', onOpenFolder);
      window.removeEventListener('aidev:new-session', onNewSession);
      window.removeEventListener('aidev:toggle-auxiliary', onToggleRightPanel);
    };
  }, [handleOpenSettings, handleStartNewConversation]);

  // Requirement 2: New Conversation in Specific Project (Lazy session creation - leave empty until first prompt)
  const handleNewSessionInProject = (projectId: string) => {
    const proj = projects.find((p) => p.id === projectId);
    if (!proj) return;
    setCurrentProject(proj);
    loadedSessionIdRef.current = null;
    setCurrentSession(null);
    setMessages([]);
    setStreamingReasoning('');
    setStreamingContent('');
    setLiveToolMessages([]);
    setActivities([]);
    setPlanItems([]);
    setChangedFiles([]);
    setPendingPermission(null);
    setPendingPlan(null);
    setPendingQuestion(null);
    setTabs([]);
    setActiveTabId(null);
    setIsRightPanelOpen(false);
    setWorkspaceMode('file');
    setTerminals([]);
    syncUrl(proj, null, splitSession?.id, splitDirection);
  };

  // Requirement 7: Manual Rename
  const handleRenameSession = async (sessionId: string, newTitle: string) => {
    try {
      await fetch(`/api/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle }),
      });
      setAllSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? { ...s, title: newTitle } : s))
      );
      if (currentSession?.id === sessionId) {
        setCurrentSession((prev) => (prev ? { ...prev, title: newTitle } : null));
      }
      if (splitSession?.id === sessionId) {
        setSplitSession((prev) => (prev ? { ...prev, title: newTitle } : null));
      }
    } catch (err) {
      console.error('Failed to rename session:', err);
    }
  };

  // Requirement 8: Auto Rename
  const handleAutoRenameSession = async (sessionId: string, promptHint?: string) => {
    try {
      setIsRenamingSession(true);
      const res = await fetch(`/api/sessions/${sessionId}/auto-rename`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: promptHint }),
      });
      const data = await res.json();
      if (data.title) {
        setAllSessions((prev) =>
          prev.map((s) => (s.id === sessionId ? { ...s, title: data.title } : s))
        );
        if (currentSession?.id === sessionId) {
          setCurrentSession((prev) => (prev ? { ...prev, title: data.title } : null));
        }
        if (splitSession?.id === sessionId) {
          setSplitSession((prev) => (prev ? { ...prev, title: data.title } : null));
        }
      }
    } catch (err) {
      console.error('Auto-rename failed:', err);
    } finally {
      setIsRenamingSession(false);
    }
  };

  // Requirement 6: Read / Unread
  const handleToggleUnreadSession = async (session: SessionRecord) => {
    const newStatus = session.is_unread ? 0 : 1;
    try {
      await fetch(`/api/sessions/${session.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_unread: newStatus }),
      });
      setAllSessions((prev) =>
        prev.map((s) => (s.id === session.id ? { ...s, is_unread: newStatus } : s))
      );
    } catch (err) {
      console.error('Failed to toggle unread:', err);
    }
  };

  // Estimated Token Count for Context Badge taking compactions into account
  const estimatedTokens = useMemo(() => {
    if (!compactions || compactions.length === 0) {
      let count = 0;
      for (const m of messages) {
        count += Math.ceil(((m.content?.length || 0) + (m.tool_arguments?.length || 0) + 20) / 3.5);
      }
      return count;
    }

    const latest = compactions[compactions.length - 1];
    const lastCompactIdx = messages.findIndex((m) => m.id === latest.last_compacted_message_id);

    if (lastCompactIdx !== -1) {
      let count = Math.ceil(((latest.summary?.length || 0) + 50) / 3.5);
      const firstUser = messages.find((m) => m.role === 'user');
      if (firstUser && messages.indexOf(firstUser) <= lastCompactIdx) {
        count += Math.ceil(((firstUser.content?.length || 0) + 20) / 3.5);
      }
      for (let i = lastCompactIdx + 1; i < messages.length; i++) {
        const m = messages[i];
        count += Math.ceil(((m.content?.length || 0) + (m.tool_arguments?.length || 0) + 20) / 3.5);
      }
      return count;
    }

    let postCompactTokens = 0;
    for (const m of messages) {
      if (m.created_at > latest.created_at) {
        postCompactTokens += Math.ceil(((m.content?.length || 0) + (m.tool_arguments?.length || 0) + 20) / 3.5);
      }
    }
    return (latest.tokens_after || 0) + postCompactTokens;
  }, [messages, compactions]);

  // Resolve active model context window and display name
  const { activeModelContextWindow, activeModelName } = useMemo(() => {
    const activeModelId = currentSession?.model_id || selectedModel;
    const found = models.find((m) => m.id === activeModelId);
    let windowLen = 128000;
    if (activeModelId.includes('claude') || activeModelId.includes('sonnet') || activeModelId.includes('opus')) {
      windowLen = 200000;
    } else if (found?.context_length && found.context_length > 0) {
      windowLen = found.context_length;
    } else if (found?.capabilities?.contextWindow && found.capabilities.contextWindow > 0) {
      windowLen = found.capabilities.contextWindow;
    } else if (
      activeModelId.includes('gemini') ||
      activeModelId.includes('deepseek') ||
      activeModelId.includes('gpt-6')
    ) {
      windowLen = 1000000;
    } else if (activeModelId.includes('gpt-5')) {
      windowLen = 400000;
    }
    return {
      activeModelContextWindow: windowLen,
      activeModelName: found?.name || activeModelId,
    };
  }, [models, currentSession?.model_id, selectedModel]);

  const handleCompactSession = useCallback(async () => {
    if (!currentSession?.id || isCompacting) return;
    setIsCompacting(true);
    try {
      const res = await fetch(`/api/sessions/${currentSession.id}/compaction`, {
        method: 'POST',
      });
      const data = await res.json();
      if (data.record) {
        setCompactions((prev) => [...prev.filter((c) => c.id !== data.record.id), data.record]);
        await refreshSessionData({ forceMessages: true });
        window.dispatchEvent(new CustomEvent('aidev-scroll-bottom'));
      } else if (data.message) {
        console.warn('[Compaction]', data.message);
      }
    } catch (err) {
      console.error('Failed triggering manual compaction:', err);
    } finally {
      setIsCompacting(false);
    }
  }, [currentSession, isCompacting, refreshSessionData]);

  // Requirement 8: Split Session
  const handleSplitSession = (session: SessionRecord, direction: 'right' | 'down') => {
    // If splitting with the same active session (or if currentSession is null):
    // automatically make the split pane a New Chat (draft session), but DO NOT create it in DB yet!
    if (currentSession && session.id === currentSession.id) {
      const draftSession: SessionRecord = {
        id: `draft_${Date.now()}`,
        project_id: currentProject?.id || session.project_id,
        title: 'New Conversation',
        model_id: selectedModel,
        permission_mode: permissionMode,
        is_unread: 0,
        created_at: Date.now(),
        updated_at: Date.now(),
      };
      setSplitSession(draftSession);
      setSplitMessages([]);
      setSplitDirection(direction);
      syncUrl(currentProject, currentSession, 'new', direction);
      return;
    }

    setSplitSession(session);
    setSplitDirection(direction);
    // Load existing messages of the split session
    fetch(`/api/sessions/${session.id}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.messages) setSplitMessages(d.messages);
      })
      .catch(console.error);

    syncUrl(currentProject, currentSession, session.id, direction);
  };

  const handleRemoveFromSplit = () => {
    setSplitSession(null);
    setSplitPendingPermission(null);
    setSplitMessages([]);
    syncUrl(currentProject, currentSession, null);
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
      try {
        localStorage.removeItem(`aidev_workspace_${sessionId}`);
      } catch {}
      setAllSessions((prev) => prev.filter((s) => s.id !== sessionId));
      if (currentSession?.id === sessionId) {
        const remaining = allSessions.filter(
          (s) =>
            s.id !== sessionId &&
            (currentProject
              ? s.project_id === currentProject.id
              : !s.project_id || s.project_id === 'no_project')
        );
        if (remaining.length > 0) {
          handleSelectSession(remaining[0]);
        } else {
          handleStartNewConversation();
        }
      }
      if (splitSession?.id === sessionId) {
        handleRemoveFromSplit();
      }
    } catch (err) {
      console.error('Failed to delete session:', err);
    }
  };

  const handleTaskStarted = useCallback((taskData: any) => {
    const taskId = taskData.taskId || taskData.id;
    const taskCmd = taskData.command || taskData.cmd || 'Background Task';
    setTasks((prev) => {
      const filtered = prev.filter(
        (t) => !(t.id !== taskId && t.status !== 'RUNNING' && t.cmd.trim() === taskCmd.trim())
      );
      const exists = filtered.some((t) => t.id === taskId);
      if (exists) {
        return filtered.map((t) => (t.id === taskId ? { ...t, status: 'RUNNING' } : t));
      }
      return [
        {
          id: taskId,
          cmd: taskCmd,
          status: 'RUNNING',
          timestamp: Date.now(),
        },
        ...filtered,
      ];
    });

    const tabId = `task_${taskId}`;
    setTabs((prev) => {
      const existingCmdTabIdx = prev.findIndex(
        (t) => t.type === 'task' && t.taskCmd?.trim() === taskCmd.trim()
      );
      if (existingCmdTabIdx !== -1) {
        const updated = [...prev];
        updated[existingCmdTabIdx] = {
          ...updated[existingCmdTabIdx],
          id: tabId,
          taskId: taskId,
          taskCmd: taskCmd,
          title: taskCmd,
        };
        return updated;
      }

      const exists = prev.some((t) => t.id === tabId);
      if (exists) return prev;
      return [
        ...prev,
        {
          id: tabId,
          type: 'task',
          title: taskCmd,
          taskId: taskId,
          taskCmd: taskCmd,
        },
      ];
    });
    setActiveTabId(tabId);
    setWorkspaceMode('file');
    setIsRightPanelOpen(true);
  }, []);

  const handleOpenTask = useCallback((task: OverviewTaskItem) => {
    const tabId = `task_${task.id}`;
    const existing = tabs.find((t) => t.id === tabId);
    if (existing) {
      setActiveTabId(tabId);
      setWorkspaceMode('file');
      setIsRightPanelOpen(true);
      return;
    }
    const newTab: WorkspaceTab = {
      id: tabId,
      type: 'task',
      title: task.cmd,
      taskId: task.id,
      taskCmd: task.cmd,
    };
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(tabId);
    setWorkspaceMode('file');
    setIsRightPanelOpen(true);
  }, [tabs]);

  const handleStopTask = useCallback(async (taskId: string) => {
    try {
      await fetch('/api/tasks/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId }),
      });
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, status: 'STOPPED' } : t))
      );
    } catch (err) {
      console.error('Failed to stop task:', err);
    }
  }, []);

  const handleStopAllTasks = useCallback(async () => {
    try {
      await fetch('/api/tasks/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true, sessionId: currentSession?.id }),
      });
      setTasks((prev) =>
        prev.map((t) => ({ ...t, status: 'STOPPED' }))
      );
    } catch (err) {
      console.error('Failed to stop all tasks:', err);
    }
  }, [currentSession?.id]);

  const handleRestartTask = useCallback(async (task: OverviewTaskItem) => {
    try {
      // Optimistically update status to RUNNING in-place
      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? { ...t, status: 'RUNNING' } : t))
      );

      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: task.cmd,
          workdir: currentProject?.workdir_path || '',
          sessionId: currentSession?.id,
          projectId: currentProject?.id,
          replaceTaskId: task.id,
        }),
      });
      const data = await res.json();
      if (data.task) {
        const newTaskId = data.task.id;
        const oldTaskId = task.id;

        // Replace old task entry in state
        setTasks((prev) => {
          const filtered = prev.filter(
            (t) => t.id !== oldTaskId && !(t.cmd.trim() === task.cmd.trim() && t.id !== newTaskId)
          );
          return [
            {
              id: newTaskId,
              cmd: data.task.command,
              status: 'RUNNING',
              timestamp: data.task.created_at || Date.now(),
            },
            ...filtered,
          ];
        });

        // Update tabs: replace old tab in-place
        const oldTabId = `task_${oldTaskId}`;
        const newTabId = `task_${newTaskId}`;
        setTabs((prev) => {
          const tabIndex = prev.findIndex(
            (t) =>
              t.id === oldTabId ||
              t.taskId === oldTaskId ||
              (t.type === 'task' && t.taskCmd?.trim() === task.cmd.trim())
          );
          if (tabIndex !== -1) {
            const updated = [...prev];
            updated[tabIndex] = {
              ...updated[tabIndex],
              id: newTabId,
              taskId: newTaskId,
              title: data.task.command,
              taskCmd: data.task.command,
            };
            return updated;
          }
          return [
            ...prev,
            {
              id: newTabId,
              type: 'task',
              title: data.task.command,
              taskId: newTaskId,
              taskCmd: data.task.command,
            },
          ];
        });

        setActiveTabId(newTabId);
        setWorkspaceMode('file');
        setIsRightPanelOpen(true);
      }
    } catch (err) {
      console.error('Failed to restart task:', err);
    }
  }, [currentProject?.workdir_path, currentProject?.id, currentSession?.id]);

  const handleDeleteTask = useCallback(async (taskId: string) => {
    try {
      await fetch(`/api/tasks?id=${encodeURIComponent(taskId)}`, {
        method: 'DELETE',
      });
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
      setTabs((prev) => {
        const remaining = prev.filter((t) => t.taskId !== taskId && t.id !== `task_${taskId}`);
        if (prev.some((t) => (t.taskId === taskId || t.id === `task_${taskId}`) && t.id === activeTabId)) {
          setActiveTabId(remaining[0]?.id || null);
        }
        return remaining;
      });
    } catch (err) {
      console.error('Failed to delete task:', err);
    }
  }, [activeTabId]);

  const handleClearTasks = useCallback(async () => {
    try {
      const url = currentSession?.id
        ? `/api/tasks?clearStopped=true&sessionId=${encodeURIComponent(currentSession.id)}`
        : '/api/tasks?clearStopped=true';
      await fetch(url, { method: 'DELETE' });
      setTasks((prev) => prev.filter((t) => t.status === 'RUNNING'));
      setTabs((prev) => {
        const remaining = prev.filter((t) => {
          if (t.type !== 'task') return true;
          const matching = tasks.find((tk) => tk.id === t.taskId || `task_${tk.id}` === t.id);
          return matching?.status === 'RUNNING';
        });
        if (!remaining.some((t) => t.id === activeTabId)) {
          setActiveTabId(remaining[0]?.id || null);
        }
        return remaining;
      });
    } catch (err) {
      console.error('Failed to clear stopped tasks:', err);
    }
  }, [currentSession?.id, tasks, activeTabId]);

  // Chat Send Handler (Primary Pane)
  const handleSendMessage = async (prompt: string, images?: AttachedImage[]) => {
    if (!prompt.trim() && (!images || images.length === 0)) return;

    // Special administrative command: /compact triggers compaction directly without creating chat bubbles
    if (prompt.trim() === '/compact') {
      handleCompactSession();
      return;
    }

    const mode: 'queue' | 'immediately' =
      (typeof window !== 'undefined' ? (localStorage.getItem('aidev_queued_messages') as 'queue' | 'immediately') : null) ||
      queuedMessagesMode ||
      settings?.queuedMessagesMode ||
      'queue';

    // If currently running an active stream:
    if (isStreamingRef.current) {
      if (mode === 'queue') {
        let item: { text: string; images?: AttachedImage[] };
        if (queuedMessageRef.current) {
          const combinedText = `${queuedMessageRef.current.text}\n${prompt}`;
          const combinedImages = [
            ...(queuedMessageRef.current.images || []),
            ...(images || []),
          ];
          item = { text: combinedText, images: combinedImages.length > 0 ? combinedImages : undefined };
        } else {
          item = { text: prompt, images };
        }
        setQueuedMessage(item);
        queuedMessageRef.current = item;
        return;
      }

      // mode === 'immediately': Interrupt and abort running execution cleanly!
      activeStreamIdRef.current++;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      if (currentSession?.id) {
        fetch(`/api/sessions/${currentSession.id}/abort`, { method: 'POST' }).catch(() => {});
      }
      setQueuedMessage(null);
      queuedMessageRef.current = null;
      setStreamingContent('');
      setStreamingReasoning('');
      setLiveToolMessages([]);
      setPendingPermission(null);
      setPendingQuestion(null);
    }

    let targetSession = currentSession;
    if (!targetSession) {
      try {
        const title = prompt.trim().slice(0, 40) || 'New Conversation';
        const sessRes = await fetch('/api/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            project_id: currentProject ? currentProject.id : 'no_project',
            title,
            model_id: selectedModel,
            permission_mode: permissionMode,
          }),
        });
        const sessData = await sessRes.json();
        if (sessData.session) {
          const createdSess: SessionRecord = sessData.session;
          targetSession = createdSess;
          currentSessionRef.current = createdSess;
          lastLoadedSessionIdRef.current = createdSess.id;
          loadedSessionIdRef.current = createdSess.id;
          setAllSessions((prev) => [createdSess, ...prev]);
          if (currentProject) {
            setSessions((prev) => [createdSess, ...prev]);
          }
          setCurrentSession(createdSess);
          syncUrl(currentProject, createdSess, splitSession?.id, splitDirection);
        }
      } catch (err) {
        console.error('Failed to create session on first prompt:', err);
        return;
      }
    }

    if (!targetSession) return;

    const currentStreamId = ++activeStreamIdRef.current;
    isStreamingRef.current = true;
    setIsStreaming(true);
    setStreamingReasoning('');
    setStreamingContent('');
    setLiveToolMessages([]);
    setPendingPermission(null);
    setPendingQuestion(null);

    let initialUserContent = prompt;
    if (images && images.length > 0) {
      const parts: any[] = [{ type: 'text', text: prompt }];
      for (const img of images) {
        parts.push({
          type: 'image_url',
          image_id: img.id,
          name: img.name,
          image_url: { url: img.url },
        });
      }
      initialUserContent = JSON.stringify(parts);
    }

    const tempUserMsgId = `user_${Date.now()}`;
    const tempUserMsg: MessageRecord = {
      id: tempUserMsgId,
      session_id: targetSession.id,
      role: 'user',
      content: initialUserContent,
      created_at: Date.now(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);

    const controller = new AbortController();
    abortControllerRef.current = controller;
    let isDoneHandled = false;

    try {
      const res = await fetch(`/api/sessions/${targetSession.id}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          images,
          model: selectedModel,
          permissionMode,
          clientMessageId: tempUserMsgId,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        if (activeStreamIdRef.current !== currentStreamId) return;
        let errText = `HTTP Error ${res.status}`;
        try {
          const errJson = await res.json();
          errText = errJson.error || errJson.message || errText;
        } catch {
          try {
            errText = (await res.text()) || errText;
          } catch {}
        }
        isStreamingRef.current = false;
        setIsStreaming(false);
        setStreamingContent('');
        setStreamingReasoning('');
        setLiveToolMessages([]);
        setMessages((prev) => [
          ...prev,
          {
            id: `msg_err_${Date.now()}`,
            session_id: targetSession.id,
            role: 'assistant',
            content: errText,
            status: 'ERROR',
            created_at: Date.now(),
          },
        ]);
        return;
      }

      if (!res.body) return;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        if (activeStreamIdRef.current !== currentStreamId) break;
        const { value, done } = await reader.read();
        if (done) break;
        if (activeStreamIdRef.current !== currentStreamId) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (activeStreamIdRef.current !== currentStreamId) break;
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6);
            if (dataStr === '[DONE]') {
              break;
            }
            try {
              const event = JSON.parse(dataStr);
              if (activeStreamIdRef.current !== currentStreamId) break;

              if (event.type === 'reasoning_delta') {
                const delta = event.delta || event.data?.text || '';
                setStreamingReasoning((prev) => prev + delta);
              } else if (event.type === 'content_delta') {
                const delta = event.delta || event.data?.text || '';
                const full = event.data?.full;
                setLiveToolMessages((currentLive) => {
                  if (currentLive.length > 0 && currentLive.every((m) => m.status !== 'RUNNING')) {
                    setMessages((prev) => {
                      const unadded = currentLive.filter(
                        (lt) => !prev.some((p) => (lt.tool_call_id && p.tool_call_id === lt.tool_call_id) || p.id === lt.id)
                      );
                      if (unadded.length === 0) return prev;
                      return [...prev, ...unadded];
                    });
                    return [];
                  }
                  return currentLive;
                });
                if (typeof full === 'string' && delta === '') {
                  setStreamingContent(full);
                } else {
                  setStreamingContent((prev) => prev + delta);
                }
              } else if (event.type === 'assistant_message_committed') {
                if (event.data?.content || event.data?.reasoning_content) {
                  const committedMsg: MessageRecord = {
                    id: event.data.id || `msg_${Date.now()}_assistant`,
                    session_id: targetSession.id,
                    role: 'assistant',
                    content: event.data.content,
                    reasoning_content: event.data.reasoning_content || null,
                    created_at: Date.now(),
                  };
                  setMessages((prev) => {
                    if (prev.some((m) => m.id === committedMsg.id)) return prev;
                    return [...prev, committedMsg];
                  });
                }
                setStreamingContent('');
                setStreamingReasoning('');
              } else if (event.type === 'tool_start') {
                if (event.data?.toolCallId && event.data?.toolName) {
                  const newToolMsg: MessageRecord = {
                    id: `live_${event.data.toolCallId}`,
                    session_id: targetSession.id,
                    role: 'tool',
                    content: null,
                    tool_call_id: event.data.toolCallId,
                    tool_name: event.data.toolName,
                    tool_arguments: typeof event.data.arguments === 'string'
                      ? event.data.arguments
                      : JSON.stringify(event.data.arguments || {}),
                    tool_result: null,
                    status: 'RUNNING',
                    created_at: Date.now(),
                  };
                  setLiveToolMessages((prev) => {
                    const idx = prev.findIndex((m) => m.tool_call_id === event.data.toolCallId);
                    if (idx >= 0) {
                      const updated = [...prev];
                      updated[idx] = { ...updated[idx], ...newToolMsg };
                      return updated;
                    }
                    return [...prev, newToolMsg];
                  });
                }
              } else if (event.type === 'tool_completed') {
                if (event.data?.toolCallId) {
                  const resultStr = typeof event.data.result === 'string'
                    ? event.data.result
                    : JSON.stringify(event.data.result ?? '');
                  setLiveToolMessages((prev) => {
                    const idx = prev.findIndex((m) => m.tool_call_id === event.data.toolCallId);
                    if (idx >= 0) {
                      const updated = [...prev];
                      updated[idx] = {
                        ...updated[idx],
                        status: event.data.status || 'COMPLETED',
                        tool_result: resultStr,
                        content: resultStr,
                      };
                      return updated;
                    }
                    return [
                      ...prev,
                      {
                        id: `live_${event.data.toolCallId}`,
                        session_id: targetSession.id,
                        role: 'tool',
                        content: resultStr,
                        tool_call_id: event.data.toolCallId,
                        tool_name: event.data.toolName || 'tool',
                        tool_arguments: JSON.stringify(event.data.arguments || {}),
                        tool_result: resultStr,
                        status: event.data.status || 'COMPLETED',
                        created_at: Date.now(),
                      },
                    ];
                  });
                }
              } else if (event.type === 'permission_required') {
                setPendingPermission(event.data);
                isStreamingRef.current = false;
                setIsStreaming(false);
                refreshSessionData({ forceMessages: true, targetSessionId: targetSession.id });
              } else if (event.type === 'question_required') {
                setPendingQuestion(event.data);
                isStreamingRef.current = false;
                setIsStreaming(false);
                refreshSessionData({ forceMessages: true, targetSessionId: targetSession.id });
                if (typeof window !== 'undefined' && localStorage.getItem('aidev_sound_notifications') !== 'false') {
                  playNotificationChime();
                }
              } else if (event.type === 'plan_created') {
                setPendingPlan(event.data);
                refreshSessionData({ skipMessages: true, targetSessionId: targetSession.id });
                openFileTab('implementation_plan.md');
              } else if (event.type === 'file_changed') {
                refreshSessionData({ skipMessages: true, targetSessionId: targetSession.id });
                if (event.data?.path) {
                  refreshSingleOpenTab(event.data.path);
                }
              } else if (event.type === 'task_started') {
                handleTaskStarted(event.data);
                refreshSessionData({ skipMessages: true, targetSessionId: targetSession.id });
              } else if (event.type === 'subagent_started' || event.type === 'subagent_completed') {
                refreshSessionData({ skipMessages: true, targetSessionId: targetSession.id });
                if (event.data) {
                  setSubagents((prev) => {
                    const idx = prev.findIndex((s) => s.id === event.data.id);
                    if (idx >= 0) {
                      const next = [...prev];
                      next[idx] = { ...next[idx], ...event.data };
                      return next;
                    }
                    return [...prev, event.data];
                  });
                }
              } else if (event.type === 'compaction_completed') {
                if (event.data) {
                  setCompactions((prev) => [...prev.filter((c) => c.id !== event.data.id), event.data]);
                }
                refreshSessionData({ forceMessages: true, targetSessionId: targetSession.id });
              } else if (event.type === 'error') {
                if (activeStreamIdRef.current !== currentStreamId) return;
                isDoneHandled = true;
                const errorMessage = event.data?.message || 'An unexpected error occurred.';
                isStreamingRef.current = false;
                setIsStreaming(false);
                setStreamingContent('');
                setStreamingReasoning('');
                setLiveToolMessages([]);
                setPendingPermission(null);
                setPendingQuestion(null);
                const errorId = event.data?.messageId || `msg_err_${Date.now()}`;
                setMessages((prev) => {
                  if (prev.some((m) => m.id === errorId)) return prev;
                  return [
                    ...prev,
                    {
                      id: errorId,
                      session_id: targetSession.id,
                      role: 'assistant',
                      content: errorMessage,
                      status: 'ERROR',
                      created_at: Date.now(),
                    },
                  ];
                });
                refreshSessionData({ forceMessages: true, targetSessionId: targetSession.id });
              } else if (event.type === 'done') {
                if (activeStreamIdRef.current !== currentStreamId) return;
                isDoneHandled = true;
                isStreamingRef.current = false;
                setIsStreaming(false);
                setPendingPermission(null);
                setPendingQuestion(null);
                if (typeof window !== 'undefined' && localStorage.getItem('aidev_sound_notifications') !== 'false') {
                  playNotificationChime();
                }
                refreshSessionData({ forceMessages: true, targetSessionId: targetSession.id }).finally(() => {
                  if (activeStreamIdRef.current !== currentStreamId) return;
                  setStreamingContent('');
                  setStreamingReasoning('');
                  setLiveToolMessages([]);

                  // Automatically trigger auto-rename if session has a default title
                  const titleToCheck = targetSession.title || '';
                  const isDefaultTitle =
                    !titleToCheck ||
                    titleToCheck === 'New Conversation' ||
                    titleToCheck === 'New Coding Session' ||
                    titleToCheck === 'New Session' ||
                    titleToCheck.startsWith('New ');
                  if (isDefaultTitle) {
                    handleAutoRenameSession(targetSession.id, prompt);
                  }

                  // Auto-dispatch queued follow-up message if present
                  if (queuedMessageRef.current) {
                    const nextMsg = queuedMessageRef.current;
                    setQueuedMessage(null);
                    queuedMessageRef.current = null;
                    setTimeout(() => {
                      sendMessageRef.current(nextMsg.text, nextMsg.images);
                    }, 120);
                  }
                });
              }
            } catch (err) {
              console.error('SSE parse error:', err);
            }
          }
        }
      }

      // If stream finished without receiving an explicit 'done' event:
      if (!isDoneHandled && activeStreamIdRef.current === currentStreamId) {
        isDoneHandled = true;
        isStreamingRef.current = false;
        setIsStreaming(false);
        setPendingPermission(null);
        setPendingQuestion(null);
        refreshSessionData({ forceMessages: true, targetSessionId: targetSession.id }).finally(() => {
          if (activeStreamIdRef.current !== currentStreamId) return;
          setStreamingContent('');
          setStreamingReasoning('');
          setLiveToolMessages([]);
          if (queuedMessageRef.current) {
            const nextMsg = queuedMessageRef.current;
            setQueuedMessage(null);
            queuedMessageRef.current = null;
            setTimeout(() => {
              sendMessageRef.current(nextMsg.text, nextMsg.images);
            }, 120);
          }
        });
      }
    } catch (err: any) {
      if (err.name !== 'AbortError' && activeStreamIdRef.current === currentStreamId) {
        console.error('Chat error:', err);
      }
    } finally {
      if (activeStreamIdRef.current === currentStreamId) {
        isStreamingRef.current = false;
        setIsStreaming(false);
        setStreamingContent('');
        setStreamingReasoning('');
        setLiveToolMessages([]);
        refreshSessionData({ forceMessages: true, targetSessionId: targetSession.id });
      }
    }
  };

  useEffect(() => {
    sendMessageRef.current = handleSendMessage;
  });

  // Chat Send Handler (Split Pane)
  const handleSendSplitMessage = async (prompt: string, images?: AttachedImage[]) => {
    if ((!prompt.trim() && (!images || images.length === 0)) || !splitSession || isSplitStreaming) return;

    let targetSession = splitSession;

    // If splitSession is a draft (not yet saved to DB), create it now upon sending first message
    if (targetSession.id.startsWith('draft_')) {
      try {
        const createRes = await fetch('/api/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            project_id: targetSession.project_id,
            title: prompt.slice(0, 40) || 'New Coding Session',
            model_id: selectedModel,
            permission_mode: permissionMode,
          }),
        });
        const createData = await createRes.json();
        if (createData.session) {
          targetSession = createData.session;
          setSplitSession(targetSession);
          setAllSessions((prev) => [targetSession, ...prev]);
          syncUrl(currentProject, currentSession, targetSession.id, splitDirection);
          handleAutoRenameSession(targetSession.id);
        } else {
          throw new Error('Failed to create session in database');
        }
      } catch (err) {
        console.error('Failed to create session for split pane:', err);
        return;
      }
    }

    setIsSplitStreaming(true);
    let initialUserContent = prompt;
    if (images && images.length > 0) {
      const parts: any[] = [{ type: 'text', text: prompt }];
      for (const img of images) {
        parts.push({
          type: 'image_url',
          image_id: img.id,
          name: img.name,
          image_url: { url: img.url },
        });
      }
      initialUserContent = JSON.stringify(parts);
    }

    const tempUserMsg: MessageRecord = {
      id: `user_split_${Date.now()}`,
      session_id: targetSession.id,
      role: 'user',
      content: initialUserContent,
      created_at: Date.now(),
    };
    setSplitMessages((prev) => [...prev, tempUserMsg]);

    const controller = new AbortController();
    splitAbortControllerRef.current = controller;

    try {
      const res = await fetch(`/api/sessions/${targetSession.id}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, images, model: selectedModel, permissionMode }),
        signal: controller.signal,
      });

      if (!res.ok) {
        let errText = `HTTP Error ${res.status}`;
        try {
          const errJson = await res.json();
          errText = errJson.error || errJson.message || errText;
        } catch {
          try {
            errText = (await res.text()) || errText;
          } catch {}
        }
        setIsSplitStreaming(false);
        setSplitStreamingContent('');
        setSplitStreamingReasoning('');
        setSplitLiveToolMessages([]);
        setSplitMessages((prev) => [
          ...prev,
          {
            id: `msg_err_${Date.now()}`,
            session_id: targetSession.id,
            role: 'assistant',
            content: errText,
            status: 'ERROR',
            created_at: Date.now(),
          },
        ]);
        return;
      }

      if (!res.body) return;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6);
            if (dataStr === '[DONE]') break;
            try {
              const event = JSON.parse(dataStr);
              if (event.type === 'reasoning_delta') {
                const delta = event.delta || event.data?.text || '';
                setSplitStreamingReasoning((prev) => prev + delta);
              } else if (event.type === 'content_delta') {
                const delta = event.delta || event.data?.text || '';
                const full = event.data?.full;
                if (typeof full === 'string' && delta === '') {
                  setSplitStreamingContent(full);
                } else {
                  setSplitStreamingContent((prev) => prev + delta);
                }
              } else if (event.type === 'assistant_message_committed') {
                if (event.data?.content || event.data?.reasoning_content) {
                  const committedMsg: MessageRecord = {
                    id: event.data.id || `msg_${Date.now()}_assistant`,
                    session_id: targetSession.id,
                    role: 'assistant',
                    content: event.data.content,
                    reasoning_content: event.data.reasoning_content || null,
                    created_at: Date.now(),
                  };
                  setSplitMessages((prev) => {
                    if (prev.some((m) => m.id === committedMsg.id)) return prev;
                    return [...prev, committedMsg];
                  });
                }
                setSplitStreamingContent('');
                setSplitStreamingReasoning('');
              } else if (event.type === 'tool_start') {
                if (event.data?.toolCallId && event.data?.toolName) {
                  const newToolMsg: MessageRecord = {
                    id: `live_${event.data.toolCallId}`,
                    session_id: targetSession.id,
                    role: 'tool',
                    content: null,
                    tool_call_id: event.data.toolCallId,
                    tool_name: event.data.toolName,
                    tool_arguments: typeof event.data.arguments === 'string'
                      ? event.data.arguments
                      : JSON.stringify(event.data.arguments || {}),
                    tool_result: null,
                    status: 'RUNNING',
                    created_at: Date.now(),
                  };
                  setSplitLiveToolMessages((prev) => {
                    const idx = prev.findIndex((m) => m.tool_call_id === event.data.toolCallId);
                    if (idx >= 0) {
                      const updated = [...prev];
                      updated[idx] = { ...updated[idx], ...newToolMsg };
                      return updated;
                    }
                    return [...prev, newToolMsg];
                  });
                }
              } else if (event.type === 'tool_completed') {
                if (event.data?.toolCallId) {
                  const resultStr = typeof event.data.result === 'string'
                    ? event.data.result
                    : JSON.stringify(event.data.result ?? '');
                  setSplitLiveToolMessages((prev) => {
                    const idx = prev.findIndex((m) => m.tool_call_id === event.data.toolCallId);
                    if (idx >= 0) {
                      const updated = [...prev];
                      updated[idx] = {
                        ...updated[idx],
                        status: event.data.status || 'COMPLETED',
                        tool_result: resultStr,
                        content: resultStr,
                      };
                      return updated;
                    }
                    return [
                      ...prev,
                      {
                        id: `live_${event.data.toolCallId}`,
                        session_id: targetSession.id,
                        role: 'tool',
                        content: resultStr,
                        tool_call_id: event.data.toolCallId,
                        tool_name: event.data.toolName || 'tool',
                        tool_arguments: JSON.stringify(event.data.arguments || {}),
                        tool_result: resultStr,
                        status: event.data.status || 'COMPLETED',
                        created_at: Date.now(),
                      },
                    ];
                  });
                }
              } else if (event.type === 'permission_required') {
                setSplitPendingPermission(event.data);
                setIsSplitStreaming(false);
                fetch(`/api/sessions/${targetSession.id}`)
                  .then((r) => r.json())
                  .then((d) => {
                    if (d.messages) setSplitMessages(d.messages);
                  });
              } else if (event.type === 'question_required') {
                setSplitPendingQuestion(event.data);
                setIsSplitStreaming(false);
                if (typeof window !== 'undefined' && localStorage.getItem('aidev_sound_notifications') !== 'false') {
                  playNotificationChime();
                }
                fetch(`/api/sessions/${targetSession.id}`)
                  .then((r) => r.json())
                  .then((d) => {
                    if (d.messages) setSplitMessages(d.messages);
                  });
              } else if (event.type === 'task_started') {
                handleTaskStarted(event.data);
              } else if (event.type === 'error') {
                const errorMessage = event.data?.message || 'An unexpected error occurred.';
                setIsSplitStreaming(false);
                setSplitStreamingContent('');
                setSplitStreamingReasoning('');
                setSplitLiveToolMessages([]);
                setSplitPendingPermission(null);
                setSplitPendingQuestion(null);
                const errorId = event.data?.messageId || `msg_err_${Date.now()}`;
                setSplitMessages((prev) => {
                  if (prev.some((m) => m.id === errorId)) return prev;
                  return [
                    ...prev,
                    {
                      id: errorId,
                      session_id: targetSession.id,
                      role: 'assistant',
                      content: errorMessage,
                      status: 'ERROR',
                      created_at: Date.now(),
                    },
                  ];
                });
                fetch(`/api/sessions/${targetSession.id}`)
                  .then((r) => r.json())
                  .then((d) => {
                    if (d.messages) setSplitMessages(d.messages);
                  })
                  .catch(() => {});
              } else if (event.type === 'done') {
                setIsSplitStreaming(false);
                setSplitPendingPermission(null);
                setSplitPendingQuestion(null);
                if (typeof window !== 'undefined' && localStorage.getItem('aidev_sound_notifications') !== 'false') {
                  playNotificationChime();
                }
                fetch(`/api/sessions/${targetSession.id}`)
                  .then((r) => r.json())
                  .then((d) => {
                    if (d.messages) setSplitMessages(d.messages);
                  })
                  .finally(() => {
                    setSplitStreamingContent('');
                    setSplitStreamingReasoning('');
                    setSplitLiveToolMessages([]);

                    // Automatically trigger auto-rename if split session has a default title
                    const titleToCheck = targetSession.title || '';
                    const isDefaultTitle =
                      !titleToCheck ||
                      titleToCheck === 'New Conversation' ||
                      titleToCheck === 'New Coding Session' ||
                      titleToCheck === 'New Session' ||
                      titleToCheck.startsWith('New ');
                    if (isDefaultTitle) {
                      handleAutoRenameSession(targetSession.id, prompt);
                    }
                  });
              }
            } catch {}
          }
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') console.error('Split chat error:', err);
    } finally {
      setIsSplitStreaming(false);
      setSplitStreamingContent('');
      setSplitStreamingReasoning('');
      setSplitLiveToolMessages([]);
      fetch(`/api/sessions/${targetSession.id}`)
        .then((r) => r.json())
        .then((d) => {
          if (d.messages) setSplitMessages(d.messages);
        })
        .catch(() => {});
    }
  };

  const handlePermissionRespond = async (decision: 'APPROVED' | 'REJECTED', alwaysAllow?: boolean) => {
    if (!pendingPermission || !currentSession) return;
    const toolCallId = pendingPermission.toolCallId;
    setPendingPermission(null);
    setIsStreaming(true);

    try {
      if (alwaysAllow) {
        setPermissionMode('AUTO');
        setCurrentSession((prev) => (prev ? { ...prev, permission_mode: 'AUTO' } : null));
        setAllSessions((prev) =>
          prev.map((s) => (s.id === currentSession.id ? { ...s, permission_mode: 'AUTO' } : s))
        );
      }

      const res = await fetch(`/api/sessions/${currentSession.id}/permissions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toolCallId, decision, alwaysAllow }),
      });

      if (!res.ok) {
        console.error('Permission respond failed:', await res.text());
        setIsStreaming(false);
        refreshSessionData();
        return;
      }

      if (!res.body) return;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6);
            if (dataStr === '[DONE]') {
              setIsStreaming(false);
              break;
            }
            try {
              const event = JSON.parse(dataStr);
              if (event.type === 'reasoning_delta') {
                const delta = event.delta || event.data?.text || '';
                setStreamingReasoning((prev) => prev + delta);
              } else if (event.type === 'content_delta') {
                const delta = event.delta || event.data?.text || '';
                setStreamingContent((prev) => prev + delta);
              } else if (event.type === 'tool_start') {
                if (event.data?.toolCallId && event.data?.toolName) {
                  const newToolMsg: MessageRecord = {
                    id: `live_${event.data.toolCallId}`,
                    session_id: currentSession.id,
                    role: 'tool',
                    content: null,
                    tool_call_id: event.data.toolCallId,
                    tool_name: event.data.toolName,
                    tool_arguments: typeof event.data.arguments === 'string'
                      ? event.data.arguments
                      : JSON.stringify(event.data.arguments || {}),
                    tool_result: null,
                    status: 'RUNNING',
                    created_at: Date.now(),
                  };
                  setLiveToolMessages((prev) => {
                    const idx = prev.findIndex((m) => m.tool_call_id === event.data.toolCallId);
                    if (idx >= 0) {
                      const updated = [...prev];
                      updated[idx] = { ...updated[idx], ...newToolMsg };
                      return updated;
                    }
                    return [...prev, newToolMsg];
                  });
                }
              } else if (event.type === 'tool_completed') {
                if (event.data?.toolCallId) {
                  const resultStr = typeof event.data.result === 'string'
                    ? event.data.result
                    : JSON.stringify(event.data.result ?? '');
                  setLiveToolMessages((prev) => {
                    const idx = prev.findIndex((m) => m.tool_call_id === event.data.toolCallId);
                    if (idx >= 0) {
                      const updated = [...prev];
                      updated[idx] = {
                        ...updated[idx],
                        status: event.data.status || 'COMPLETED',
                        tool_result: resultStr,
                        content: resultStr,
                      };
                      return updated;
                    }
                    return [
                      ...prev,
                      {
                        id: `live_${event.data.toolCallId}`,
                        session_id: currentSession.id,
                        role: 'tool',
                        content: resultStr,
                        tool_call_id: event.data.toolCallId,
                        tool_name: event.data.toolName || 'tool',
                        tool_arguments: JSON.stringify(event.data.arguments || {}),
                        tool_result: resultStr,
                        status: event.data.status || 'COMPLETED',
                        created_at: Date.now(),
                      },
                    ];
                  });
                }
              } else if (event.type === 'permission_required') {
                setPendingPermission(event.data);
                setIsStreaming(false);
                refreshSessionData({ forceMessages: true });
              } else if (event.type === 'plan_created') {
                setPendingPlan(event.data);
                refreshSessionData({ skipMessages: true });
                openFileTab('implementation_plan.md');
              } else if (event.type === 'file_changed') {
                refreshSessionData({ skipMessages: true });
                if (event.data?.path) {
                  refreshSingleOpenTab(event.data.path);
                }
              } else if (event.type === 'task_started') {
                handleTaskStarted(event.data);
                refreshSessionData({ skipMessages: true });
              } else if (event.type === 'error') {
                console.error('Permission response stream error:', event.data?.message);
                const errorMessage = event.data?.message || 'Permission response failed.';
                setIsStreaming(false);
                setStreamingContent('');
                setStreamingReasoning('');
                setLiveToolMessages([]);
                setPendingPermission(null);
                setPendingQuestion(null);
                const errorId = event.data?.messageId || `msg_err_${Date.now()}`;
                setMessages((prev) => {
                  if (prev.some((m) => m.id === errorId)) return prev;
                  return [
                    ...prev,
                    {
                      id: errorId,
                      session_id: currentSession.id,
                      role: 'assistant',
                      content: errorMessage,
                      status: 'ERROR',
                      created_at: Date.now(),
                    },
                  ];
                });
                refreshSessionData({ forceMessages: true });
                return;
              } else if (event.type === 'done') {
                setIsStreaming(false);
                setPendingPermission(null);
                refreshSessionData({ forceMessages: true }).finally(() => {
                  setStreamingContent('');
                  setStreamingReasoning('');
                  setLiveToolMessages([]);
                });
              }
            } catch (err) {
              console.error('SSE parse error:', err);
            }
          }
        }
      }
    } catch (err) {
      console.error('Permission respond error:', err);
    } finally {
      setIsStreaming(false);
      refreshSessionData({ forceMessages: true });
    }
  };

  const handleAnswerQuestion = async (answer: string) => {
    if (!pendingQuestion || !currentSession) return;
    const toolCallId = pendingQuestion.toolCallId;
    setPendingQuestion(null);
    setIsStreaming(true);

    try {
      const res = await fetch(`/api/sessions/${currentSession.id}/questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toolCallId, answer }),
      });

      if (!res.ok) {
        console.error('Answer question failed:', await res.text());
        setIsStreaming(false);
        refreshSessionData();
        return;
      }

      if (!res.body) return;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6);
            if (dataStr === '[DONE]') {
              setIsStreaming(false);
              break;
            }
            try {
              const event = JSON.parse(dataStr);
              if (event.type === 'reasoning_delta') {
                const delta = event.delta || event.data?.text || '';
                setStreamingReasoning((prev) => prev + delta);
              } else if (event.type === 'content_delta') {
                const delta = event.delta || event.data?.text || '';
                setStreamingContent((prev) => prev + delta);
              } else if (event.type === 'tool_start') {
                if (event.data?.toolCallId && event.data?.toolName) {
                  const newToolMsg: MessageRecord = {
                    id: `live_${event.data.toolCallId}`,
                    session_id: currentSession.id,
                    role: 'tool',
                    content: null,
                    tool_call_id: event.data.toolCallId,
                    tool_name: event.data.toolName,
                    tool_arguments: typeof event.data.arguments === 'string'
                      ? event.data.arguments
                      : JSON.stringify(event.data.arguments || {}),
                    tool_result: null,
                    status: 'RUNNING',
                    created_at: Date.now(),
                  };
                  setLiveToolMessages((prev) => {
                    const idx = prev.findIndex((m) => m.tool_call_id === event.data.toolCallId);
                    if (idx >= 0) {
                      const updated = [...prev];
                      updated[idx] = { ...updated[idx], ...newToolMsg };
                      return updated;
                    }
                    return [...prev, newToolMsg];
                  });
                }
              } else if (event.type === 'tool_completed') {
                if (event.data?.toolCallId) {
                  const resultStr = typeof event.data.result === 'string'
                    ? event.data.result
                    : JSON.stringify(event.data.result ?? '');
                  setLiveToolMessages((prev) => {
                    const idx = prev.findIndex((m) => m.tool_call_id === event.data.toolCallId);
                    if (idx >= 0) {
                      const updated = [...prev];
                      updated[idx] = {
                        ...updated[idx],
                        status: event.data.status || 'COMPLETED',
                        tool_result: resultStr,
                        content: resultStr,
                      };
                      return updated;
                    }
                    return prev;
                  });
                }
              } else if (event.type === 'permission_required') {
                setPendingPermission(event.data);
                setIsStreaming(false);
                refreshSessionData({ forceMessages: true });
              } else if (event.type === 'question_required') {
                setPendingQuestion(event.data);
                setIsStreaming(false);
                refreshSessionData({ forceMessages: true });
              } else if (event.type === 'plan_created') {
                setPendingPlan(event.data);
                refreshSessionData({ skipMessages: true });
                openFileTab('implementation_plan.md');
              } else if (event.type === 'file_changed') {
                refreshSessionData({ skipMessages: true });
                if (event.data?.path) {
                  refreshSingleOpenTab(event.data.path);
                }
              } else if (event.type === 'task_started') {
                handleTaskStarted(event.data);
                refreshSessionData({ skipMessages: true });
              } else if (event.type === 'error') {
                console.error('Question response error:', event.data?.message);
                const errorMessage = event.data?.message || 'Question response failed.';
                setIsStreaming(false);
                setStreamingContent('');
                setStreamingReasoning('');
                setLiveToolMessages([]);
                setPendingPermission(null);
                setPendingQuestion(null);
                const errorId = event.data?.messageId || `msg_err_${Date.now()}`;
                setMessages((prev) => {
                  if (prev.some((m) => m.id === errorId)) return prev;
                  return [
                    ...prev,
                    {
                      id: errorId,
                      session_id: currentSession.id,
                      role: 'assistant',
                      content: errorMessage,
                      status: 'ERROR',
                      created_at: Date.now(),
                    },
                  ];
                });
                refreshSessionData({ forceMessages: true });
                return;
              } else if (event.type === 'done') {
                setIsStreaming(false);
                setPendingPermission(null);
                setPendingQuestion(null);
                refreshSessionData({ forceMessages: true }).finally(() => {
                  setStreamingContent('');
                  setStreamingReasoning('');
                  setLiveToolMessages([]);
                });
              }
            } catch (err) {
              console.error('SSE parse error:', err);
            }
          }
        }
      }
    } catch (err) {
      console.error('Answer question error:', err);
    } finally {
      setIsStreaming(false);
      setStreamingContent('');
      setStreamingReasoning('');
      setLiveToolMessages([]);
      refreshSessionData({ forceMessages: true });
    }
  };

  const handleCancelQuestion = async () => {
    if (!pendingQuestion || !currentSession) return;
    const toolCallId = pendingQuestion.toolCallId;
    setPendingQuestion(null);
    setIsStreaming(false);

    try {
      await fetch(`/api/sessions/${currentSession.id}/questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toolCallId, action: 'CANCEL' }),
      });
    } catch (err) {
      console.error('Cancel question error:', err);
    } finally {
      refreshSessionData();
    }
  };

  const handleSplitAnswerQuestion = async (answer: string) => {
    if (!splitPendingQuestion || !splitSession) return;
    const toolCallId = splitPendingQuestion.toolCallId;
    setSplitPendingQuestion(null);
    setIsSplitStreaming(true);

    try {
      const res = await fetch(`/api/sessions/${splitSession.id}/questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toolCallId, answer }),
      });

      if (!res.ok) {
        console.error('Split answer question failed:', await res.text());
        setIsSplitStreaming(false);
        return;
      }

      if (!res.body) return;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6);
            if (dataStr === '[DONE]') {
              setIsSplitStreaming(false);
              break;
            }
            try {
              const event = JSON.parse(dataStr);
              if (event.type === 'reasoning_delta') {
                const delta = event.delta || event.data?.text || '';
                setSplitStreamingReasoning((prev) => prev + delta);
              } else if (event.type === 'content_delta') {
                const delta = event.delta || event.data?.text || '';
                setSplitStreamingContent((prev) => prev + delta);
              } else if (event.type === 'permission_required') {
                setSplitPendingPermission(event.data);
                setIsSplitStreaming(false);
              } else if (event.type === 'question_required') {
                setSplitPendingQuestion(event.data);
                setIsSplitStreaming(false);
              } else if (event.type === 'done') {
                setIsSplitStreaming(false);
                setSplitPendingPermission(null);
                setSplitPendingQuestion(null);
                fetch(`/api/sessions/${splitSession.id}`)
                  .then((r) => r.json())
                  .then((d) => {
                    if (d.messages) setSplitMessages(d.messages);
                  })
                  .finally(() => {
                    setSplitStreamingContent('');
                    setSplitStreamingReasoning('');
                    setSplitLiveToolMessages([]);
                  });
              }
            } catch {}
          }
        }
      }
    } catch (err) {
      console.error('Split answer question error:', err);
    } finally {
      setIsSplitStreaming(false);
      setSplitStreamingContent('');
      setSplitStreamingReasoning('');
      setSplitLiveToolMessages([]);
      fetch(`/api/sessions/${splitSession.id}`)
        .then((r) => r.json())
        .then((d) => {
          if (d.messages) setSplitMessages(d.messages);
        })
        .catch(() => {});
    }
  };

  const handleSplitPermissionRespond = async (decision: 'APPROVED' | 'REJECTED', alwaysAllow?: boolean) => {
    if (!splitPendingPermission || !splitSession) return;
    const toolCallId = splitPendingPermission.toolCallId;
    setSplitPendingPermission(null);
    setIsSplitStreaming(true);

    try {
      if (alwaysAllow) {
        setSplitSession((prev) => (prev ? { ...prev, permission_mode: 'AUTO' } : null));
        setAllSessions((prev) =>
          prev.map((s) => (s.id === splitSession.id ? { ...s, permission_mode: 'AUTO' } : s))
        );
      }

      const res = await fetch(`/api/sessions/${splitSession.id}/permissions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toolCallId, decision, alwaysAllow }),
      });

      if (!res.ok) {
        console.error('Split permission respond failed:', await res.text());
        return;
      }

      if (!res.body) return;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6);
            if (dataStr === '[DONE]') {
              setIsSplitStreaming(false);
              break;
            }
            try {
              const event = JSON.parse(dataStr);
              if (event.type === 'reasoning_delta') {
                const delta = event.delta || event.data?.text || '';
                setSplitStreamingReasoning((prev) => prev + delta);
              } else if (event.type === 'content_delta') {
                const delta = event.delta || event.data?.text || '';
                setSplitLiveToolMessages((currentLive) => {
                  if (currentLive.length > 0 && currentLive.every((m) => m.status !== 'RUNNING')) {
                    setSplitMessages((prev) => {
                      const unadded = currentLive.filter(
                        (lt) => !prev.some((p) => (lt.tool_call_id && p.tool_call_id === lt.tool_call_id) || p.id === lt.id)
                      );
                      if (unadded.length === 0) return prev;
                      return [...prev, ...unadded];
                    });
                    return [];
                  }
                  return currentLive;
                });
                setSplitStreamingContent((prev) => prev + delta);
              } else if (event.type === 'assistant_message_committed') {
                if (event.data?.content || event.data?.reasoning_content) {
                  const committedMsg: MessageRecord = {
                    id: event.data.id || `msg_${Date.now()}_assistant`,
                    session_id: splitSession.id,
                    role: 'assistant',
                    content: event.data.content,
                    reasoning_content: event.data.reasoning_content || null,
                    created_at: Date.now(),
                  };
                  setSplitMessages((prev) => {
                    if (prev.some((m) => m.id === committedMsg.id)) return prev;
                    return [...prev, committedMsg];
                  });
                }
                setSplitStreamingContent('');
                setSplitStreamingReasoning('');
              } else if (event.type === 'tool_start') {
                if (event.data?.toolCallId && event.data?.toolName) {
                  const newToolMsg: MessageRecord = {
                    id: `live_${event.data.toolCallId}`,
                    session_id: splitSession.id,
                    role: 'tool',
                    content: null,
                    tool_call_id: event.data.toolCallId,
                    tool_name: event.data.toolName,
                    tool_arguments: typeof event.data.arguments === 'string'
                      ? event.data.arguments
                      : JSON.stringify(event.data.arguments || {}),
                    tool_result: null,
                    status: 'RUNNING',
                    created_at: Date.now(),
                  };
                  setSplitLiveToolMessages((prev) => {
                    const idx = prev.findIndex((m) => m.tool_call_id === event.data.toolCallId);
                    if (idx >= 0) {
                      const updated = [...prev];
                      updated[idx] = { ...updated[idx], ...newToolMsg };
                      return updated;
                    }
                    return [...prev, newToolMsg];
                  });
                }
              } else if (event.type === 'tool_completed') {
                if (event.data?.toolCallId) {
                  const resultStr = typeof event.data.result === 'string'
                    ? event.data.result
                    : JSON.stringify(event.data.result ?? '');
                  setSplitLiveToolMessages((prev) => {
                    const idx = prev.findIndex((m) => m.tool_call_id === event.data.toolCallId);
                    if (idx >= 0) {
                      const updated = [...prev];
                      updated[idx] = {
                        ...updated[idx],
                        status: event.data.status || 'COMPLETED',
                        tool_result: resultStr,
                        content: resultStr,
                      };
                      return updated;
                    }
                    return [
                      ...prev,
                      {
                        id: `live_${event.data.toolCallId}`,
                        session_id: splitSession.id,
                        role: 'tool',
                        content: resultStr,
                        tool_call_id: event.data.toolCallId,
                        tool_name: event.data.toolName || 'tool',
                        tool_arguments: JSON.stringify(event.data.arguments || {}),
                        tool_result: resultStr,
                        status: event.data.status || 'COMPLETED',
                        created_at: Date.now(),
                      },
                    ];
                  });
                }
              } else if (event.type === 'permission_required') {
                setSplitPendingPermission(event.data);
              } else if (event.type === 'task_started') {
                handleTaskStarted(event.data);
              } else if (event.type === 'error') {
                console.error('Split permission response stream error:', event.data?.message);
                setIsSplitStreaming(false);
                return;
              } else if (event.type === 'done') {
                setIsSplitStreaming(false);
                setSplitPendingPermission(null);
                if (splitSession) {
                  fetch(`/api/sessions/${splitSession.id}`)
                    .then((r) => r.json())
                    .then((d) => {
                      if (d.messages) setSplitMessages(d.messages);
                    })
                    .finally(() => {
                      setSplitStreamingContent('');
                      setSplitStreamingReasoning('');
                      setSplitLiveToolMessages([]);
                    });
                }
              }
            } catch (err) {
              console.error('SSE parse error:', err);
            }
          }
        }
      }
    } catch (err) {
      console.error('Split permission respond error:', err);
    } finally {
      setIsSplitStreaming(false);
      if (splitSession) {
        fetch(`/api/sessions/${splitSession.id}`)
          .then((r) => r.json())
          .then((d) => {
            if (d.messages) setSplitMessages(d.messages);
          })
          .finally(() => {
            setSplitStreamingContent('');
            setSplitStreamingReasoning('');
            setSplitLiveToolMessages([]);
          })
          .catch(console.error);
      }
    }
  };

  const handleSplitCancelQuestion = async () => {
    if (!splitPendingQuestion || !splitSession) return;
    const toolCallId = splitPendingQuestion.toolCallId;
    setSplitPendingQuestion(null);
    setIsSplitStreaming(false);

    try {
      await fetch(`/api/sessions/${splitSession.id}/questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toolCallId, action: 'CANCEL' }),
      });
    } catch (err) {
      console.error('Split cancel question error:', err);
    } finally {
      if (splitSession) {
        fetch(`/api/sessions/${splitSession.id}`)
          .then((r) => r.json())
          .then((d) => {
            if (d.messages) setSplitMessages(d.messages);
          })
          .catch(console.error);
      }
    }
  };

  const handleApprovePlan = () => {
    setPendingPlan(null);
    handleSendMessage('Plan approved. Please proceed with implementation.');
    // Pre-open or switch to walkthrough.md tab so user can follow the live task progress
    setTimeout(() => {
      openFileTab('walkthrough.md');
    }, 300);
  };

  const handleRejectPlan = () => {
    setPendingPlan(null);
    handleSendMessage('Plan rejected. Please revise the plan.');
  };

  // Tab & File Handlers
  const openFileTab = async (
    filePath: string,
    lineRange?: { startLine?: number; endLine?: number }
  ) => {
    let cleanPath = filePath.replace(/^file:\/\/\/?/i, '').replace(/\\/g, '/');
    const effectiveWorkdir = currentProject?.workdir_path || '';
    const currentSessionId = currentSession?.id || '';
    const tabId = `file_${cleanPath}`;
    const existing = tabs.find((t) => t.id === tabId);
    if (existing) {
      if (!cleanPath.startsWith('/api/media') && !/\.(png|jpg|jpeg|gif|webp|svg|ico)$/i.test(cleanPath)) {
        try {
          const res = await fetch(
            `/api/files/read?workdir=${encodeURIComponent(
              effectiveWorkdir
            )}&path=${encodeURIComponent(cleanPath)}&sessionId=${encodeURIComponent(currentSessionId)}`
          );
          const data = await res.json();
          if (data.content !== undefined) {
            setTabs((prev) =>
              prev.map((t) =>
                t.id === tabId
                  ? { ...t, content: data.content, highlightRange: lineRange ?? t.highlightRange }
                  : t
              )
            );
          }
        } catch {}
      } else if (lineRange) {
        setTabs((prev) =>
          prev.map((t) => (t.id === tabId ? { ...t, highlightRange: lineRange } : t))
        );
      }
      setActiveTabId(tabId);
      setWorkspaceMode('file');
      setIsRightPanelOpen(true);
      return;
    }

    let content = '';
    const isImageFile =
      cleanPath.startsWith('/api/media') ||
      /\.(png|jpg|jpeg|gif|webp|svg|ico)$/i.test(cleanPath);

    if (!isImageFile) {
      try {
        const res = await fetch(
          `/api/files/read?workdir=${encodeURIComponent(
            effectiveWorkdir
          )}&path=${encodeURIComponent(cleanPath)}&sessionId=${encodeURIComponent(currentSessionId)}`
        );
        const data = await res.json();
        if (data.content !== undefined) content = data.content;
      } catch {}
    }

    let tabTitle = cleanPath.split('/').pop() || cleanPath;
    if (cleanPath.startsWith('/api/media')) {
      try {
        const urlObj = new URL(cleanPath, 'http://localhost');
        const fileParam = urlObj.searchParams.get('file');
        if (fileParam) tabTitle = fileParam;
      } catch {}
    }

    const newTab: WorkspaceTab = {
      id: tabId,
      type: 'file',
      title: tabTitle,
      filePath: cleanPath,
      currentContent: content,
      highlightRange: lineRange,
    };
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(tabId);
    setWorkspaceMode('file');
    setIsRightPanelOpen(true);
  };

  const openDiffTabForFile = async (filePath: string) => {
    if (!currentProject || !currentSession) return;
    const cleanPath = filePath.replace(/^file:\/\/\/?/i, '').replace(/\\/g, '/');
    const tabId = `diff_${cleanPath}`;
    const existing = tabs.find((t) => t.id === tabId);
    if (existing) {
      setActiveTabId(tabId);
      setWorkspaceMode('file');
      setIsRightPanelOpen(true);
      return;
    }

    let changedItem = changedFiles.find(
      (f) =>
        f.filePath.replace(/\\/g, '/') === cleanPath ||
        cleanPath.endsWith(f.filePath.replace(/\\/g, '/')) ||
        f.filePath.replace(/\\/g, '/').endsWith(cleanPath)
    );

    let original = changedItem?.originalContent || '';
    let current = changedItem?.currentContent || '';
    let snapshotId = changedItem?.latestSnapshotId;

    if (!changedItem || !original) {
      try {
        const changedRes = await fetch(
          `/api/files/changed?sessionId=${currentSession.id}&workdir=${encodeURIComponent(
            currentProject.workdir_path
          )}`
        );
        const changedData = await changedRes.json();
        if (changedData.changedFiles) {
          setChangedFiles(changedData.changedFiles);
          const found = changedData.changedFiles.find(
            (f: any) =>
              f.filePath.replace(/\\/g, '/') === cleanPath ||
              cleanPath.endsWith(f.filePath.replace(/\\/g, '/')) ||
              f.filePath.replace(/\\/g, '/').endsWith(cleanPath)
          );
          if (found) {
            original = found.originalContent || '';
            current = found.currentContent || '';
            snapshotId = found.latestSnapshotId;
          }
        }
      } catch (err) {
        console.error('Failed to fetch changed files for diff:', err);
      }
    }

    if (!current) {
      try {
        const res = await fetch(
          `/api/files/read?workdir=${encodeURIComponent(
            currentProject.workdir_path
          )}&path=${encodeURIComponent(cleanPath)}`
        );
        const data = await res.json();
        if (data.content !== undefined) current = data.content;
      } catch {}
    }

    const newTab: WorkspaceTab = {
      id: tabId,
      type: 'diff',
      title: `${cleanPath.split('/').pop() || cleanPath} (single edit)`,
      filePath: cleanPath,
      originalContent: original,
      currentContent: current,
      snapshotId,
    };
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(tabId);
    setWorkspaceMode('file');
    setIsRightPanelOpen(true);
  };

  const handleOpenReview = () => {
    setIsRightPanelOpen(true);
    setWorkspaceMode('review');
  };

  const handleSelectWorkspaceMode = (mode: WorkspaceMode) => {
    setWorkspaceMode(mode);
    if (mode === 'terminal' && terminals.length === 0) {
      const termId = currentSession?.id ? `term_${currentSession.id}` : `term_${Date.now()}`;
      setTerminals([{ id: termId, workdir: currentProject?.workdir_path || '' }]);
    }
  };

  const handleDeleteTerminal = async (terminalId: string): Promise<boolean> => {
    try {
      const checkRes = await fetch(`/api/terminal/sessions?check=${encodeURIComponent(terminalId)}`, {
        signal: AbortSignal.timeout(3000),
      });
      if (checkRes.ok) {
        const checkData = await checkRes.json();
        if (checkData?.hasActiveProcess) {
          const procName = checkData.processName || 'background process';
          let displayCmd = '';
          if (checkData.command) {
            const cleaned = checkData.command
              .replace(/^[A-Z]:\\[^\s]+\\(cmd|powershell|pwsh)\.exe\s+(\/c|\-c)\s+/i, '')
              .replace(/^"C:\\[^"]*\\node\.exe"\s+/i, 'node ')
              .trim();
            displayCmd = cleaned.length > 65 ? cleaned.slice(0, 62) + '...' : cleaned;
          }

          const procDetail = displayCmd ? `${procName} (${displayCmd})` : procName;
          const ok = await confirm({
            title: 'Active Process Running',
            message: `This terminal session has an active process running: ${procDetail}.\n\nClosing this terminal will terminate all running processes. Are you sure you want to proceed?`,
            confirmText: 'Terminate & Close',
            cancelText: 'Keep Running',
            variant: 'danger',
          });

          if (!ok) {
            return false;
          }
        }
      }
    } catch (err) {
      console.warn('Error checking active terminal processes, proceeding with close:', err);
    }

    try {
      fetch(`/api/terminal/sessions?id=${encodeURIComponent(terminalId)}`, {
        method: 'DELETE',
      }).catch(() => {});
    } catch {}

    setTerminals((prev) => prev.filter((t) => t.id !== terminalId));

    setTabs((prev) => {
      const remaining = prev.filter((t) => !(t.type === 'terminal' && t.terminalId === terminalId));
      if (activeTabId && prev.find((t) => t.id === activeTabId && t.terminalId === terminalId)) {
        const closedIdx = prev.findIndex((t) => t.terminalId === terminalId);
        const nextActive = remaining[closedIdx] || remaining[closedIdx - 1] || null;
        setActiveTabId(nextActive?.id || null);
        if (!nextActive) {
          setWorkspaceMode('overview');
        }
      }
      return remaining;
    });

    return true;
  };

  const handleDeleteAllTerminals = async (): Promise<boolean> => {
    try {
      const checkRes = await fetch('/api/terminal/sessions?checkAll=true', {
        signal: AbortSignal.timeout(3000),
      });
      if (checkRes.ok) {
        const checkData = await checkRes.json();
        if (checkData?.hasActiveProcess) {
          const count = checkData.activeCount || 1;
          const ok = await confirm({
            title: 'Active Processes Running',
            message: `${count} terminal session${count > 1 ? 's have' : ' has'} active running processes.\n\nClosing all terminals will terminate all running processes. Are you sure you want to proceed?`,
            confirmText: 'Terminate All & Close',
            cancelText: 'Keep Running',
            variant: 'danger',
          });

          if (!ok) {
            return false;
          }
        }
      }
    } catch (err) {
      console.warn('Error checking all terminal process status, proceeding with close:', err);
    }

    try {
      fetch('/api/terminal/sessions?all=true', {
        method: 'DELETE',
      }).catch(() => {});
    } catch {}

    setTerminals([]);
    setTabs((prev) => {
      const remaining = prev.filter((t) => t.type !== 'terminal');
      if (activeTabId && prev.find((t) => t.id === activeTabId && t.type === 'terminal')) {
        const nextActive = remaining[0] || null;
        setActiveTabId(nextActive?.id || null);
        if (!nextActive) {
          setWorkspaceMode('overview');
        }
      }
      return remaining;
    });

    return true;
  };

  const handleOpenTerminal = (termIdParam?: string) => {
    setIsRightPanelOpen(true);
    let termId = termIdParam;
    if (!termId) {
      if (terminals.length > 0) {
        termId = terminals[0].id;
      } else {
        termId = `term_${Date.now()}`;
        setTerminals([{ id: termId, workdir: currentProject?.workdir_path || '' }]);
      }
    }

    const existingTab = tabs.find((t) => t.type === 'terminal' && t.terminalId === termId);
    if (existingTab) {
      setActiveTabId(existingTab.id);
      setWorkspaceMode('file');
    } else {
      const tabId = `terminal_tab_${termId}`;
      const newTab: WorkspaceTab = {
        id: tabId,
        type: 'terminal',
        title: `Project (${termId.slice(-4)})`,
        terminalId: termId,
      };
      setTabs((prev) => [...prev, newTab]);
      setActiveTabId(tabId);
      setWorkspaceMode('file');
    }
  };

  const handleNewTerminal = () => {
    setIsRightPanelOpen(true);
    const termId = `term_${Date.now()}`;
    setTerminals((prev) => [
      ...prev,
      { id: termId, workdir: currentProject?.workdir_path || '' },
    ]);

    // Spawn new terminal in a new tab
    const tabId = `terminal_tab_${termId}`;
    const newTab: WorkspaceTab = {
      id: tabId,
      type: 'terminal',
      title: `Project (${termId.slice(-4)})`,
      terminalId: termId,
    };
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(tabId);
    setWorkspaceMode('file');
  };

  // Listen for terminal events from Titlebar / Keyboard shortcuts
  useEffect(() => {
    const onNewTerminal = () => {
      handleNewTerminal();
    };

    const onToggleTerminal = () => {
      const existingTerm = tabs.find((t) => t.type === 'terminal');
      const isShowingTerminal =
        isRightPanelOpen &&
        (workspaceMode === 'terminal' ||
          (workspaceMode === 'file' && existingTerm && activeTabId === existingTerm.id));

      if (isShowingTerminal) {
        setIsRightPanelOpen(false);
      } else if (existingTerm) {
        setIsRightPanelOpen(true);
        setActiveTabId(existingTerm.id);
        setWorkspaceMode('file');
      } else {
        handleNewTerminal();
      }
    };

    window.addEventListener('aidev:new-terminal', onNewTerminal);
    window.addEventListener('aidev:toggle-terminal', onToggleTerminal);
    return () => {
      window.removeEventListener('aidev:new-terminal', onNewTerminal);
      window.removeEventListener('aidev:toggle-terminal', onToggleTerminal);
    };
  }, [tabs, currentProject, isRightPanelOpen, workspaceMode, activeTabId]);

  const handleToggleMaximize = () => {
    if (isRightPanelMaximized) {
      // Un-maximize / restore back to previous state
      setIsRightPanelMaximized(false);
      setRightPanelWidth(prevRightPanelWidthRef.current);
      setIsSidebarCollapsed(prevSidebarCollapsedRef.current);
    } else {
      // Maximize: save current state, hide sidebar, hide roomchat, expand right panel to 100%!
      prevRightPanelWidthRef.current = rightPanelWidth;
      prevSidebarCollapsedRef.current = isSidebarCollapsed;
      setIsRightPanelMaximized(true);
      setIsSidebarCollapsed(true);
    }
  };

  const handleOpenBrowserTab = (rawUrl?: string) => {
    let targetUrl = rawUrl ? rawUrl.trim() : '';

    // If no URL was passed (e.g. from "+" dropdown), ALWAYS open a brand new tab with Welcome View!
    if (!targetUrl) {
      const tabId = `browser_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const newTab: WorkspaceTab = {
        id: tabId,
        type: 'browser',
        title: 'New Tab',
        url: '',
      };
      setTabs((prev) => [...prev, newTab]);
      setActiveTabId(tabId);
      setWorkspaceMode('file');
      setIsRightPanelOpen(true);
      return;
    }

    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
      if (targetUrl.startsWith('/')) {
        targetUrl = typeof window !== 'undefined' ? `${window.location.origin}${targetUrl}` : `http://localhost:3001${targetUrl}`;
      } else if (/^\d{2,5}$/.test(targetUrl)) {
        targetUrl = `http://localhost:${targetUrl}`;
      } else if (targetUrl.startsWith(':')) {
        targetUrl = `http://localhost${targetUrl}`;
      } else if (targetUrl.startsWith('localhost') || targetUrl.startsWith('127.0.0.1')) {
        targetUrl = `http://${targetUrl}`;
      } else {
        targetUrl = `https://${targetUrl}`;
      }
    }

    let port = '';
    let tabTitle = 'Browser Preview';
    try {
      const parsed = new URL(targetUrl);
      port = parsed.port ? `:${parsed.port}` : parsed.hostname;
      tabTitle = port ? `Preview ${port}` : 'Browser Preview';
      if (parsed.pathname.includes('/api/embed')) {
        const srcParam = parsed.searchParams.get('src');
        if (srcParam) {
          const cleanName = decodeURIComponent(srcParam)
            .replace(/^file:\/\/\/?/i, '')
            .replace(/\\/g, '/')
            .split('/')
            .pop();
          if (cleanName) tabTitle = cleanName;
        }
      }
    } catch {}

    const tabId = `browser_${targetUrl}`;
    const existing = tabs.find((t) => t.id === tabId || (t.type === 'browser' && t.url === targetUrl));
    if (existing) {
      setActiveTabId(existing.id);
      setWorkspaceMode('file');
      setIsRightPanelOpen(true);
      return;
    }

    const newTab: WorkspaceTab = {
      id: tabId,
      type: 'browser',
      title: tabTitle,
      url: targetUrl,
    };
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(tabId);
    setWorkspaceMode('file');
    setIsRightPanelOpen(true);
  };

  const handleBrowserMetadataChange = (
    tabId: string,
    metadata: { title: string; favicon: string | null; url: string }
  ) => {
    setTabs((prev) =>
      prev.map((t) => {
        if (t.id === tabId) {
          return {
            ...t,
            title: metadata.title || t.title,
            favicon: metadata.favicon !== undefined ? metadata.favicon : t.favicon,
            url: metadata.url || t.url,
          };
        }
        return t;
      })
    );
  };

  const handleCloseTab = async (id: string) => {
    const tabToClose = tabs.find((t) => t.id === id);
    if (tabToClose?.type === 'terminal' && tabToClose.terminalId) {
      await handleDeleteTerminal(tabToClose.terminalId);
      return;
    }
    setTabs((prev) => {
      const remaining = prev.filter((t) => t.id !== id);
      if (activeTabId === id) {
        const closedIdx = prev.findIndex((t) => t.id === id);
        const nextActive = remaining[closedIdx] || remaining[closedIdx - 1] || null;
        setActiveTabId(nextActive?.id || null);
      }
      return remaining;
    });
  };

  const handleRevertFile = async (snapshotId: string, filePath: string) => {
    if (!currentSession || !currentProject) return;
    try {
      const res = await fetch(`/api/sessions/${currentSession.id}/revert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ snapshotId }),
      });
      const data = await res.json();
      if (data.success) {
        await refreshSessionData();
        setTabs((prev) =>
          prev.map((t) => {
            if (t.filePath === filePath || t.filePath === filePath.replace(/\\/g, '/')) {
              return { ...t, currentContent: t.originalContent || t.currentContent };
            }
            return t;
          })
        );
      }
    } catch (err) {
      console.error('Failed to revert snapshot:', err);
    }
  };

  const lastUserPrompt = useMemo(() => {
    const userMsgs = messages.filter((m) => m.role === 'user');
    return userMsgs[userMsgs.length - 1]?.content || 'Review changes';
  }, [messages]);

  const handleSelectProject = (project: ProjectRecord | null) => {
    setCurrentProject(project);
    if (project) {
      if (typeof window !== 'undefined') {
        const savedSecurity = localStorage.getItem(`aidev_project_security_${project.id}`);
        if (savedSecurity === 'ask') {
          setPermissionMode('ASK');
        } else if (savedSecurity === 'full') {
          setPermissionMode('FULL_ACCESS');
        } else if (savedSecurity === 'auto') {
          setPermissionMode('AUTO');
        }
      }
      const projSessions = allSessions.filter((s) => s.project_id === project.id);
      if (projSessions.length > 0) {
        handleSelectSession(projSessions[0], project);
      } else {
        handleStartNewConversation();
      }
    }
  };

  useEffect(() => {
    if (currentProject && typeof window !== 'undefined') {
      const savedSecurity = localStorage.getItem(`aidev_project_security_${currentProject.id}`);
      if (savedSecurity === 'ask') {
        setPermissionMode('ASK');
      } else if (savedSecurity === 'full') {
        setPermissionMode('FULL_ACCESS');
      } else if (savedSecurity === 'auto') {
        setPermissionMode('AUTO');
      }
    }
  }, [currentProject?.id]);

  // Sidebar drag resizer
  const handleLeftMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizingLeft(true);
  };

  const handleRightMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizingRight(true);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isResizingLeft) {
        const newW = Math.max(180, Math.min(460, e.clientX));
        setLeftSidebarWidth(newW);
      }
      if (isResizingRight) {
        const maxW = Math.max(320, window.innerWidth - leftSidebarWidth - 280);
        const newW = Math.max(320, Math.min(maxW, window.innerWidth - e.clientX));
        setRightPanelWidth(newW);
      }
    };
    const handleMouseUp = () => {
      setIsResizingLeft(false);
      setIsResizingRight(false);
    };

    if (isResizingLeft || isResizingRight) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isResizingLeft, isResizingRight]);

  // Keyboard shortcut Ctrl+B / Cmd+B to toggle sidebar and Ctrl+Shift+B to toggle auxiliary pane
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        if (e.shiftKey) {
          if (isRightPanelMaximized) {
            handleToggleMaximize();
            setIsRightPanelOpen(false);
          } else {
            setIsRightPanelOpen((prev) => !prev);
          }
        } else {
          if (isRightPanelMaximized) {
            handleToggleMaximize();
          } else {
            setIsSidebarCollapsed((prev) => !prev);
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isRightPanelMaximized]);

  // Route keyboard zoom shortcuts to Electron window zoom
  useEffect(() => {
    const api = (window as any).electronAPI;
    const handleZoomKeys = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === '=' || e.key === '+') {
          e.preventDefault();
          api?.zoomIn?.();
        } else if (e.key === '-' || e.key === '_') {
          e.preventDefault();
          api?.zoomOut?.();
        } else if (e.key === '0') {
          e.preventDefault();
          api?.resetZoom?.();
        }
      }
    };
    const blockZoomWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', handleZoomKeys);
    window.addEventListener('wheel', blockZoomWheel, { passive: false });
    return () => {
      window.removeEventListener('keydown', handleZoomKeys);
      window.removeEventListener('wheel', blockZoomWheel);
    };
  }, []);

  const splitProject = useMemo(() => {
    if (!splitSession) return null;
    return projects.find((p) => p.id === splitSession.project_id) || null;
  }, [splitSession, projects]);

  if (!hasMounted) {
    return (
      <div className="w-full h-full max-w-[100vw] flex flex-col overflow-hidden bg-[var(--background)] text-[var(--foreground)] font-sans antialiased select-none" />
    );
  }

  return (
    <div className="w-full h-full max-w-[100vw] flex flex-col overflow-hidden bg-[var(--background)] text-[var(--foreground)] font-sans antialiased select-none">
      {/* 1. Global Top Bar */}
      <TopBar
        onToggleSidebar={() => {
          if (isRightPanelMaximized) {
            handleToggleMaximize();
          } else {
            setIsSidebarCollapsed((prev) => !prev);
          }
        }}
        onToggleAuxiliaryPane={() => {
          if (isRightPanelMaximized) {
            handleToggleMaximize();
            setIsRightPanelOpen(false);
          } else {
            setIsRightPanelOpen((prev) => !prev);
          }
        }}
        isSidebarCollapsed={isRightPanelMaximized || isSidebarCollapsed}
        isRightPanelOpen={isRightPanelOpen}
      />

      {/* 2. Main Center Body Workspace */}
      <div className="flex-1 min-h-0 flex flex-row overflow-hidden relative">
        {/* Mobile Left Sidebar Drawer Overlay */}
        {isMobile && (
          <>
            <div
              onClick={() => setIsSidebarCollapsed(true)}
              className={`fixed inset-0 z-40 bg-black/60 transition-opacity duration-200 ${
                isSidebarCollapsed ? 'opacity-0 pointer-events-none' : 'opacity-100'
              }`}
            />
            <div
              className={`fixed inset-y-0 left-0 z-50 w-[85vw] max-w-[320px] bg-[#0e0e11] dark:bg-[#0e0e11] light:bg-[#f4f4f7] border-r border-[#1e1e24] dark:border-[#1e1e24] light:border-[#e2e2e7] shadow-2xl transition-transform duration-300 ease-out flex flex-col ${
                isSidebarCollapsed ? '-translate-x-full pointer-events-none' : 'translate-x-0'
              }`}
            >
              <AdvancedSidebar
                projects={projects}
                currentProject={currentProject}
                allSessions={allSessions}
                currentSessionId={currentSession?.id}
                splitSessionId={splitSession?.id}
                activities={activities}
                planTitle={planTitle}
                planItems={planItems}
                terminals={terminals}
                subagents={subagents}
                isStreaming={isStreaming}
                width={300}
                isResizing={false}
                onSelectSession={(s, p) => {
                  handleSelectSession(s, p);
                  setIsSidebarCollapsed(true);
                }}
                onNewSession={() => {
                  handleStartNewConversation();
                  setIsSidebarCollapsed(true);
                }}
                onNewSessionInProject={(proj) => {
                  handleNewSessionInProject(proj);
                  setIsSidebarCollapsed(true);
                }}
                onDeleteSession={handleDeleteSession}
                onRenameSession={handleRenameSession}
                onAutoRenameSession={handleAutoRenameSession}
                onToggleUnreadSession={handleToggleUnreadSession}
                onSplitSession={(s, dir) => {
                  handleSplitSession(s, dir);
                  setIsSidebarCollapsed(true);
                }}
                onRemoveFromSplit={handleRemoveFromSplit}
                onNavigateHistory={() => {
                  router.push('/projects');
                  setIsSidebarCollapsed(true);
                }}
                onOpenSettingsModal={() => {
                  handleOpenSettings();
                  setIsSidebarCollapsed(true);
                }}
                onOpenProjectSettings={(proj) => {
                  handleOpenProjectSettings(proj);
                  setIsSidebarCollapsed(true);
                }}
                onOpenProjectModal={() => {
                  setIsDirectoryPickerOpen(true);
                  setIsSidebarCollapsed(true);
                }}
                onOpenScheduledTasks={() => {
                  setIsScheduledTasksModalOpen(true);
                  setIsSidebarCollapsed(true);
                }}
                onToggleCollapse={() => setIsSidebarCollapsed(true)}
                onOpenTerminal={(tid) => {
                  handleOpenTerminal(tid);
                  setIsSidebarCollapsed(true);
                }}
                onNewTerminal={() => {
                  handleNewTerminal();
                  setIsSidebarCollapsed(true);
                }}
              />
            </div>
          </>
        )}

        {/* Desktop Left: Antigravity Project Tree (Smooth Animated Collapse & Expand) */}
        {!isMobile && (
          <div
            style={{
              width: isRightPanelMaximized || isSidebarCollapsed ? 0 : leftSidebarWidth,
              transition: isInitialMountRef.current || isResizingLeft
                ? 'none'
                : 'width 260ms cubic-bezier(0.2, 0, 0, 1)',
            }}
            className={`h-full overflow-hidden shrink-0 ${
              isRightPanelMaximized || isSidebarCollapsed ? 'pointer-events-none' : ''
            }`}
          >
            <div
              style={{
                width: leftSidebarWidth,
                minWidth: leftSidebarWidth,
                transform: isRightPanelMaximized || isSidebarCollapsed ? 'translateX(-12px)' : 'translateX(0)',
                opacity: isRightPanelMaximized || isSidebarCollapsed ? 0 : 1,
                transition: isInitialMountRef.current || isResizingLeft
                  ? 'none'
                  : 'transform 260ms cubic-bezier(0.2, 0, 0, 1), opacity 200ms ease-out',
              }}
              className="h-full flex flex-col will-change-transform"
            >
              <AdvancedSidebar
                projects={projects}
                currentProject={currentProject}
                allSessions={allSessions}
                currentSessionId={currentSession?.id}
                splitSessionId={splitSession?.id}
                activities={activities}
                planTitle={planTitle}
                planItems={planItems}
                terminals={terminals}
                subagents={subagents}
                isStreaming={isStreaming}
                width={leftSidebarWidth}
                isResizing={isResizingLeft}
                onSelectSession={handleSelectSession}
                onNewSession={handleStartNewConversation}
                onNewSessionInProject={handleNewSessionInProject}
                onDeleteSession={handleDeleteSession}
                onRenameSession={handleRenameSession}
                onAutoRenameSession={handleAutoRenameSession}
                onToggleUnreadSession={handleToggleUnreadSession}
                onSplitSession={handleSplitSession}
                onRemoveFromSplit={handleRemoveFromSplit}
                onNavigateHistory={() => router.push('/projects')}
                onOpenSettingsModal={handleOpenSettings}
                onOpenProjectSettings={handleOpenProjectSettings}
                onOpenProjectModal={() => setIsDirectoryPickerOpen(true)}
                onOpenScheduledTasks={() => setIsScheduledTasksModalOpen(true)}
                onToggleCollapse={() => setIsSidebarCollapsed(true)}
                onOpenTerminal={handleOpenTerminal}
                onNewTerminal={handleNewTerminal}
              />
            </div>
          </div>
        )}

        {/* Left Sidebar Drag Resize Handle (Desktop Only) */}
        {!isMobile && (
          <div
            onMouseDown={isRightPanelMaximized || isSidebarCollapsed ? undefined : handleLeftMouseDown}
            style={{
              transition: isInitialMountRef.current || isResizingLeft
                ? 'none'
                : 'opacity 200ms ease, width 260ms cubic-bezier(0.2, 0, 0, 1)',
            }}
            className={`shrink-0 select-none relative group transition-colors ${
              isRightPanelMaximized || isSidebarCollapsed
                ? 'w-0 opacity-0 pointer-events-none'
                : isResizingLeft
                ? 'w-[1px] bg-[#007acc] cursor-col-resize z-10'
                : 'w-[1px] bg-[#1e1e24] dark:bg-[#1e1e24] light:bg-[#e2e2e7] hover:bg-[#007acc] cursor-col-resize z-10'
            }`}
            title={isRightPanelMaximized || isSidebarCollapsed ? undefined : "Drag to resize sidebar (min 180px, max 460px)"}
          >
            {!isRightPanelMaximized && !isSidebarCollapsed && (
              <div className="absolute inset-y-0 -left-1.5 -right-1.5 cursor-col-resize z-20 bg-transparent pointer-events-auto" />
            )}
          </div>
        )}

        {/* Center: Main Chat Canvas with Resizable Split Panes */}
        <div
          style={{
            display: isRightPanelMaximized ? 'none' : 'flex',
          }}
          className="flex-1 min-h-0 flex flex-col h-full overflow-hidden min-w-0"
        >
          <SplitChatContainer
          splitSession={splitSession}
          splitProject={splitProject}
          splitDirection={splitDirection}
          isRightPanelOpen={isRightPanelOpen}
          onToggleRightPanel={() => setIsRightPanelOpen(!isRightPanelOpen)}
          onCloseSplit={handleRemoveFromSplit}
          onToggleSplitDirection={() =>
            setSplitDirection((prev) => (prev === 'right' ? 'down' : 'right'))
          }
          primaryPane={
            <div className="flex-1 min-h-0 flex flex-col h-full overflow-hidden">
              <ChatHeader
                currentProject={currentProject}
                currentSession={currentSession}
                projects={projects}
                onSelectProject={handleSelectProject}
                onOpenNewProjectModal={() => setIsDirectoryPickerOpen(true)}
                isRightPanelOpen={isRightPanelOpen}
                onToggleRightPanel={() => setIsRightPanelOpen(!isRightPanelOpen)}
                onOpenSettingsModal={handleOpenSettings}
                onAutoRenameSession={handleAutoRenameSession}
                isRenamingSession={isRenamingSession}
                estimatedTokens={estimatedTokens}
                modelContextWindow={activeModelContextWindow}
                activeModelName={activeModelName}
                onCompactSession={handleCompactSession}
                isCompacting={isCompacting}
                compactionsCount={compactions.length}
                latestTokensSaved={compactions.length > 0 ? compactions[compactions.length - 1].tokens_saved : 0}
                hideRightControls={Boolean(splitSession && splitDirection === 'right')}
                isSplitActive={Boolean(splitSession)}
                onSplitSession={handleSplitSession}
                onRemoveFromSplit={handleRemoveFromSplit}
                onDeleteSession={handleDeleteSession}
                onToggleUnreadSession={handleToggleUnreadSession}
                isSidebarCollapsed={isSidebarCollapsed}
                onToggleSidebar={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                onOpenTerminal={handleOpenTerminal}
                onNewTerminal={handleNewTerminal}
              />

              <ChatWorkspace
                verboseChat={verboseChat}
                messages={messages}
                hasMoreMessages={hasMoreMessages}
                isLoadingOlderMessages={isLoadingOlderMessages}
                isLoadingSession={isLoadingSession}
                onLoadOlderMessages={handleLoadOlderMessages}
                compactions={compactions}
                isStreaming={isStreaming}
                isCompacting={isCompacting}
                streamingReasoning={streamingReasoning}
                streamingContent={streamingContent}
                liveToolMessages={liveToolMessages}
                pendingPermission={pendingPermission}
                pendingPlan={pendingPlan}
                pendingQuestion={pendingQuestion}
                workspaceFiles={workspaceFiles}
                selectedModel={selectedModel}
                models={models}
                onModelChange={handleModelChange}
                onRefreshModels={handleRefreshModels}
                projects={projects}
                currentProject={currentProject}
                onSelectProject={handleSelectProject}
                onOpenNewProjectModal={() => setIsDirectoryPickerOpen(true)}
                onOpenFileDiff={(path) => openDiffTabForFile(path)}
                onOpenFile={openFileTab}
                onOpenBrowser={handleOpenBrowserTab}
                onOpenReview={handleOpenReview}
                onSendMessage={handleSendMessage}
                onPermissionRespond={handlePermissionRespond}
                onAnswerQuestion={handleAnswerQuestion}
                onCancelQuestion={handleCancelQuestion}
                onApprovePlan={handleApprovePlan}
                onRejectPlan={handleRejectPlan}
                queuedMessage={queuedMessage}
                onCancelQueuedMessage={() => {
                  setQueuedMessage(null);
                  queuedMessageRef.current = null;
                }}
                queuedMessagesMode={queuedMessagesMode}
                onStopStreaming={() => {
                  activeStreamIdRef.current++;
                  abortControllerRef.current?.abort();
                  abortControllerRef.current = null;
                  isStreamingRef.current = false;
                  setIsStreaming(false);
                  setStreamingContent('');
                  setStreamingReasoning('');
                  setLiveToolMessages([]);
                  if (currentSession?.id) {
                    fetch(`/api/sessions/${currentSession.id}/abort`, { method: 'POST' })
                      .catch(() => {})
                      .finally(() => {
                        setTimeout(() => {
                          refreshSessionData({ forceMessages: true });
                        }, 250);
                      });
                  }
                }}
              />
            </div>
          }
          splitPane={
            splitSession ? (
              <ChatWorkspace
                verboseChat={verboseChat}
                messages={splitMessages}
                isStreaming={isSplitStreaming}
                streamingReasoning={splitStreamingReasoning}
                streamingContent={splitStreamingContent}
                liveToolMessages={splitLiveToolMessages}
                workspaceFiles={workspaceFiles}
                selectedModel={selectedModel}
                models={models}
                onModelChange={handleModelChange}
                onRefreshModels={handleRefreshModels}
                projects={projects}
                currentProject={splitProject}
                pendingPermission={splitPendingPermission}
                pendingPlan={null}
                pendingQuestion={splitPendingQuestion}
                onOpenFile={openFileTab}
                onOpenBrowser={handleOpenBrowserTab}
                onSendMessage={handleSendSplitMessage}
                onPermissionRespond={handleSplitPermissionRespond}
                onAnswerQuestion={handleSplitAnswerQuestion}
                onCancelQuestion={handleSplitCancelQuestion}
                onApprovePlan={handleApprovePlan}
                onRejectPlan={handleRejectPlan}
                queuedMessagesMode={queuedMessagesMode}
                onStopStreaming={() => {
                  splitAbortControllerRef.current?.abort();
                  setIsSplitStreaming(false);
                  setSplitStreamingContent('');
                  setSplitStreamingReasoning('');
                  setSplitLiveToolMessages([]);
                  if (splitSession?.id) {
                    fetch(`/api/sessions/${splitSession.id}/abort`, { method: 'POST' })
                      .catch(() => {})
                      .finally(() => {
                        setTimeout(() => {
                          fetch(`/api/sessions/${splitSession.id}`)
                            .then((r) => r.json())
                            .then((d) => {
                              if (d.messages) setSplitMessages(d.messages);
                            })
                            .catch(() => {});
                        }, 250);
                      });
                  }
                }}
              />
            ) : null
          }
        />
        </div>

        {/* Right Workspace Drag Resize Handle (Desktop Only) */}
        {!isMobile && (
          <div
            onMouseDown={!isRightPanelOpen || isRightPanelMaximized ? undefined : handleRightMouseDown}
            style={{
              transition: isInitialMountRef.current || isResizingRight
                ? 'none'
                : 'opacity 200ms ease, width 260ms cubic-bezier(0.2, 0, 0, 1)',
            }}
            className={`shrink-0 select-none relative group transition-colors ${
              !isRightPanelOpen || isRightPanelMaximized
                ? 'w-0 opacity-0 pointer-events-none'
                : isResizingRight
                ? 'w-[1px] bg-[#007acc] cursor-col-resize z-10'
                : 'w-[1px] bg-[#222226] hover:bg-[#007acc] cursor-col-resize z-10'
            }`}
            title={!isRightPanelOpen || isRightPanelMaximized ? undefined : "Drag to resize panel (min 320px, max 950px)"}
          >
            {isRightPanelOpen && !isRightPanelMaximized && (
              <div className="absolute inset-y-0 -left-1.5 -right-1.5 cursor-col-resize z-20 bg-transparent pointer-events-auto" />
            )}
          </div>
        )}

        {/* Right: Multi-Tab Workspace */}
        {isMobile ? (
          <div
            className={`fixed inset-0 z-50 flex flex-col bg-[#101010] h-full w-full transition-transform duration-300 ease-out ${
              isRightPanelOpen ? 'translate-x-0' : 'translate-x-full pointer-events-none'
            }`}
          >
            <MultiTabWorkspace
              workdir={currentProject?.workdir_path || ''}
              projectName={currentProject?.name || ''}
              tabs={tabs}
              activeTabId={activeTabId}
              onSelectTab={(id) => setActiveTabId(id)}
              onCloseTab={handleCloseTab}
              onNewTerminalTab={handleNewTerminal}
              onToggleSidebar={() => {
                setIsRightPanelOpen(false);
              }}
              onToggleMaximize={handleToggleMaximize}
              isMaximized={false}
              onOpenFile={openFileTab}
              onOpenFileDiff={(path) => openDiffTabForFile(path)}
              onOpenBrowserTab={handleOpenBrowserTab}
              onBrowserMetadataChange={handleBrowserMetadataChange}
              workspaceFiles={workspaceFiles}
              artifacts={overviewArtifacts}
              uploads={overviewUploads}
              tasks={tasks}
              onOpenTask={handleOpenTask}
              onStopTask={handleStopTask}
              onRestartTask={handleRestartTask}
              onDeleteTask={handleDeleteTask}
              onClearTasks={handleClearTasks}
              onStopAllTasks={handleStopAllTasks}
              skills={overviewSkills}
              changedFiles={changedFiles}
              subagents={subagents}
              terminals={terminals}
              onDeleteTerminal={handleDeleteTerminal}
              onDeleteAllTerminals={handleDeleteAllTerminals}
              activeMode={workspaceMode}
              onSelectMode={handleSelectWorkspaceMode}
              onRevertFile={handleRevertFile}
              onSendMessage={handleSendMessage}
              currentTurnPrompt={lastUserPrompt}
            />
          </div>
        ) : (
          <div
            style={{
              width: !isRightPanelOpen
                ? 0
                : isRightPanelMaximized
                ? '100%'
                : rightPanelWidth,
              flex: isRightPanelOpen && isRightPanelMaximized ? '1 1 0%' : undefined,
              transition: isInitialMountRef.current || isResizingRight || isRightPanelMaximized
                ? 'none'
                : 'width 260ms cubic-bezier(0.2, 0, 0, 1)',
            }}
            className={`flex flex-col h-full bg-[#101010] overflow-hidden shrink-0 ${
              !isRightPanelOpen ? 'pointer-events-none' : ''
            } ${isRightPanelMaximized ? 'flex-1 w-full' : ''}`}
          >
            <div
              style={{
                width: isRightPanelMaximized ? '100%' : rightPanelWidth,
                minWidth: isRightPanelMaximized ? '100%' : rightPanelWidth,
                transform: !isRightPanelOpen ? 'translateX(12px)' : 'translateX(0)',
                opacity: !isRightPanelOpen ? 0 : 1,
                transition: isInitialMountRef.current || isResizingRight || isRightPanelMaximized
                  ? 'none'
                  : 'transform 260ms cubic-bezier(0.2, 0, 0, 1), opacity 200ms ease-out',
              }}
              className="flex-1 flex flex-col h-full overflow-hidden will-change-transform"
            >
              <MultiTabWorkspace
                workdir={currentProject?.workdir_path || ''}
                projectName={currentProject?.name || ''}
                tabs={tabs}
                activeTabId={activeTabId}
                onSelectTab={(id) => setActiveTabId(id)}
                onCloseTab={handleCloseTab}
                onNewTerminalTab={handleNewTerminal}
                onToggleSidebar={() => {
                  if (isRightPanelMaximized) {
                    handleToggleMaximize();
                  }
                  setIsRightPanelOpen(!isRightPanelOpen);
                }}
                onToggleMaximize={handleToggleMaximize}
                isMaximized={isRightPanelMaximized}
                onOpenFile={openFileTab}
                onOpenFileDiff={(path) => openDiffTabForFile(path)}
                onOpenBrowserTab={handleOpenBrowserTab}
                onBrowserMetadataChange={handleBrowserMetadataChange}
                workspaceFiles={workspaceFiles}
                artifacts={overviewArtifacts}
                uploads={overviewUploads}
                tasks={tasks}
                onOpenTask={handleOpenTask}
                onStopTask={handleStopTask}
                onRestartTask={handleRestartTask}
                onDeleteTask={handleDeleteTask}
                onClearTasks={handleClearTasks}
                onStopAllTasks={handleStopAllTasks}
                skills={overviewSkills}
                changedFiles={changedFiles}
                subagents={subagents}
                terminals={terminals}
                onDeleteTerminal={handleDeleteTerminal}
                onDeleteAllTerminals={handleDeleteAllTerminals}
                activeMode={workspaceMode}
                onSelectMode={handleSelectWorkspaceMode}
                onRevertFile={handleRevertFile}
                onSendMessage={handleSendMessage}
                currentTurnPrompt={lastUserPrompt}
              />
            </div>
          </div>
        )}
      </div>

      {/* Global Transparent Overlay while dragging resize handles */}
      {(isResizingLeft || isResizingRight) && (
        <div className="fixed inset-0 z-[9999] cursor-col-resize select-none pointer-events-auto bg-transparent" />
      )}

      {/* Directory Picker Modal */}
      <DirectoryPickerModal
        isOpen={isDirectoryPickerOpen}
        onClose={() => setIsDirectoryPickerOpen(false)}
        onSelectDirectory={(dirPath) => {
          fetch('/api/projects', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ workdir_path: dirPath }),
          })
            .then((r) => r.json())
            .then((d) => {
              if (d.project) {
                setProjects((prev) => [d.project, ...prev.filter((p) => p.id !== d.project.id)]);
                setCurrentProject(d.project);
                handleStartNewConversation();
              }
            });
          setIsDirectoryPickerOpen(false);
        }}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={handleCloseSettings}
        settings={settings}
        projects={projects}
        currentProject={currentProject}
        initialTab={settingsInitialTab}
        models={models}
        onModelsRefreshed={setModels}
        onUpdateProject={handleUpdateProject}
        onDeleteProject={handleDeleteProject}
        onSave={(newSettings: Partial<AidevSettings>) => {
          setSettings((prev) => (prev ? { ...prev, ...newSettings } : null));
          if (newSettings.queuedMessagesMode) {
            setQueuedMessagesMode(newSettings.queuedMessagesMode);
            if (typeof window !== 'undefined') {
              localStorage.setItem('aidev_queued_messages', newSettings.queuedMessagesMode);
            }
          }
        }}
      />

      {/* Scheduled & Background Tasks Modal */}
      <ScheduledTasksModal
        isOpen={isScheduledTasksModalOpen}
        onClose={() => setIsScheduledTasksModalOpen(false)}
        tasks={tasks}
        onOpenTask={handleOpenTask}
        onStopTask={handleStopTask}
        onRestartTask={handleRestartTask}
        onDeleteTask={handleDeleteTask}
        onClearTasks={handleClearTasks}
        onStopAllTasks={handleStopAllTasks}
        currentWorkdir={currentProject?.workdir_path || ''}
        sessionId={currentSession?.id}
        projectId={currentProject?.id}
        onTaskStarted={(newTask) => {
          setTasks((prev) => [
            {
              id: newTask.id,
              cmd: newTask.command,
              status: 'RUNNING',
              timestamp: newTask.created_at || Date.now(),
            },
            ...prev.filter((t) => t.id !== newTask.id),
          ]);
        }}
      />
    </div>
  );
};

export default DesktopAgentApp;
