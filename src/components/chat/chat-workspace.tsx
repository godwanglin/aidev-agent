'use client';

import React, { useRef, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { Sliders, Terminal, Search, FileCode, ArrowDown, ArrowUp, ListOrdered, X, Clock, Loader2, ChevronUp } from 'lucide-react';
import { MessageItem } from './message-item';
import { ActivityGroup, TurnStep } from './activity-group';
import { WorkBlock } from './work-block';
import { PermissionCard } from './permission-card';
import { PlanCard } from './plan-card';
import { QuestionCard } from './question-card';
import { ChatInput, RuntimeTaskItem, AttachedImage } from './chat-input';
import { ProjectSelectorDropdown } from './project-selector-dropdown';
import { TurnDiffCard, extractTurnChanges, type TurnChanges } from './turn-diff-card';
import { SelectionQuoteButton } from '@/components/common/selection-quote-button';
import { useTheme } from '@/context/theme-context';
import { CompactionDivider } from './compaction-divider';
import { TodoCard, type TodoItemData } from './todo-card';
import { ChatTimelineMinimap, type TimelineTurnItem } from './chat-timeline-minimap';
import type { MessageRecord, ProjectRecord, SessionCompactionRecord } from '@/lib/db';
import type { GatewayModel } from '@/lib/gateway';

export interface PendingPermission {
  toolCallId: string;
  messageId: string;
  toolName: string;
  arguments: any;
  actionType: 'COMMAND' | 'FILE_WRITE' | 'READ';
  targetResource: string;
  reason?: string;
  mode?: 'ASK' | 'AUTO' | 'FULL_ACCESS';
}

export interface PendingPlan {
  sessionId: string;
  planMarkdown: string;
  goal: string;
}

export interface PendingQuestion {
  toolCallId: string;
  messageId?: string;
  question: string;
  options: string[];
  allowCustom?: boolean;
}

interface ChatWorkspaceProps {
  messages: MessageRecord[];
  compactions?: SessionCompactionRecord[];
  isStreaming: boolean;
  streamingReasoning?: string;
  streamingContent?: string;
  liveToolMessages?: MessageRecord[];
  pendingPermission: PendingPermission | null;
  pendingPlan: PendingPlan | null;
  pendingQuestion?: PendingQuestion | null;
  workspaceFiles?: string[];
  selectedModel?: string;
  models?: GatewayModel[];
  onModelChange?: (model: string) => void;
  runtimeTasks?: RuntimeTaskItem[];
  onAbortTask?: (taskId: string) => void;
  onOpenTask?: (task: RuntimeTaskItem) => void;
  projects?: ProjectRecord[];
  currentProject?: ProjectRecord | null;
  onSelectProject?: (project: ProjectRecord | null) => void;
  onOpenNewProjectModal?: () => void;
  onOpenFileDiff?: (filePath: string) => void;
  onOpenFile?: (filePath: string, lineRange?: { startLine?: number; endLine?: number }) => void;
  onOpenBrowser?: (url: string) => void;
  onRefreshModels?: () => void;
  onOpenReview?: () => void;
  onSendMessage: (text: string, images?: AttachedImage[]) => void;
  onPermissionRespond: (decision: 'APPROVED' | 'REJECTED', alwaysAllow?: boolean) => void;
  onAnswerQuestion?: (answer: string) => void;
  onCancelQuestion?: () => void;
  onApprovePlan: () => void;
  onRejectPlan: () => void;
  queuedMessage?: { text: string; images?: AttachedImage[] } | null;
  onCancelQueuedMessage?: () => void;
  queuedMessagesMode?: 'queue' | 'immediately';
  onStopStreaming?: () => void;
  isCompacting?: boolean;
  hasMoreMessages?: boolean;
  isLoadingOlderMessages?: boolean;
  isLoadingSession?: boolean;
  onLoadOlderMessages?: () => void;
  verboseChat?: boolean;
  onContinueTurn?: (errorMessageId: string) => void;
  onRevertTurn?: (message: MessageRecord, promptText: string) => Promise<void> | void;
  sessionId?: string | null;
  sessionDraft?: string | null;
  onDraftChange?: (draft: string) => void;
}

export interface TurnSegment {
  id: string;
  type: 'assistant_text' | 'work_block';
  message?: MessageRecord;
  introMessage?: MessageRecord;
  steps?: TurnStep[];
  durationMs?: number;
}

export function extractTodosFromMessage(msg?: MessageRecord | null): TodoItemData[] | null {
  if (!msg) return null;
  const toolName = (msg.tool_name || '').toLowerCase();
  if (!['update_todos', 'todo_write', 'update_todo', 'manage_tasks', 'todos', 'tasks'].includes(toolName)) {
    return null;
  }
  let parsed: any = null;
  if (msg.tool_arguments) {
    try {
      parsed = JSON.parse(msg.tool_arguments);
    } catch {}
  }
  if (!parsed && msg.content) {
    try {
      parsed = JSON.parse(msg.content);
    } catch {}
  }
  if (!parsed && msg.tool_result) {
    try {
      parsed = JSON.parse(msg.tool_result);
    } catch {}
  }

  const rawList = parsed?.todos || parsed?.items || parsed?.tasks || (Array.isArray(parsed) ? parsed : null);
  if (Array.isArray(rawList) && rawList.length > 0) {
    return rawList.map((item: any, idx: number) => ({
      id: String(item.id || item.title || idx),
      title: String(item.title || item.task || item.description || `Task ${idx + 1}`),
      status: (item.status === 'completed' || item.status === 'done'
        ? 'completed'
        : item.status === 'in_progress' || item.status === 'active' || item.status === 'running'
        ? 'in_progress'
        : 'pending') as 'pending' | 'in_progress' | 'completed',
    }));
  }
  return null;
}

interface ConversationTurn {
  id: string;
  userMessage?: MessageRecord;
  segments: TurnSegment[];
  steps: TurnStep[];
  assistantMessage?: MessageRecord;
  turnChanges?: TurnChanges | null;
  taskTodos?: TodoItemData[] | null;
}

export const ChatWorkspace: React.FC<ChatWorkspaceProps> = ({
  messages,
  compactions = [],
  isStreaming,
  isCompacting = false,
  streamingReasoning,
  streamingContent,
  liveToolMessages = [],
  pendingPermission,
  pendingPlan,
  pendingQuestion,
  workspaceFiles = [],
  selectedModel = 'gemini-3.8-flash-high',
  models = [],
  onModelChange,
  runtimeTasks = [],
  onAbortTask,
  onOpenTask,
  projects = [],
  currentProject,
  onSelectProject,
  onOpenNewProjectModal,
  onOpenFileDiff,
  onOpenFile,
  onOpenBrowser,
  onRefreshModels,
  onOpenReview,
  onSendMessage,
  onPermissionRespond,
  onAnswerQuestion,
  onCancelQuestion,
  onApprovePlan,
  onRejectPlan,
  queuedMessage,
  onCancelQueuedMessage,
  queuedMessagesMode = 'queue',
  onStopStreaming,
  hasMoreMessages = false,
  isLoadingOlderMessages = false,
  isLoadingSession = false,
  onLoadOlderMessages,
  verboseChat = true,
  onContinueTurn,
  onRevertTurn,
  sessionId,
  sessionDraft,
  onDraftChange,
}) => {
  const { chatWidthClass } = useTheme();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const isNearBottomRef = useRef(true);

  // Scroll preservation when prepending older messages
  const prevScrollHeightRef = useRef<number | null>(null);
  const prevScrollTopRef = useRef<number | null>(null);

  const triggerLoadOlderMessages = () => {
    if (!hasMoreMessages || isLoadingOlderMessages || !scrollRef.current) return;
    prevScrollHeightRef.current = scrollRef.current.scrollHeight;
    prevScrollTopRef.current = scrollRef.current.scrollTop;
    onLoadOlderMessages?.();
  };

  useLayoutEffect(() => {
    if (prevScrollHeightRef.current !== null && scrollRef.current) {
      const heightDifference = scrollRef.current.scrollHeight - prevScrollHeightRef.current;
      if (heightDifference > 0) {
        scrollRef.current.scrollTop = (prevScrollTopRef.current ?? 0) + heightDifference;
      }
      prevScrollHeightRef.current = null;
      prevScrollTopRef.current = null;
    }
  }, [messages.length]);

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;

    // Auto-load older messages when user scrolls near the top
    if (scrollTop <= 40 && hasMoreMessages && !isLoadingOlderMessages) {
      triggerLoadOlderMessages();
    }

    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    const isNearBottom = distanceFromBottom <= 120;
    isNearBottomRef.current = isNearBottom;
    setShowScrollBottom((prev) => {
      const next = !isNearBottom;
      return prev !== next ? next : prev;
    });
  };

  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth',
      });
      setShowScrollBottom(false);
      isNearBottomRef.current = true;
    }
  };

  // Auto-scroll when messages or deltas arrive, respecting autoScrollStreaming preference
  useEffect(() => {
    if (!scrollRef.current) return;
    const isAutoScrollAllowed =
      typeof window === 'undefined' ||
      localStorage.getItem('aidev_auto_scroll_streaming') !== 'false';

    if (isNearBottomRef.current && (isAutoScrollAllowed || !isStreaming)) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingContent, streamingReasoning, liveToolMessages, pendingPermission, pendingPlan, pendingQuestion, isStreaming]);

  // Latest live task todos from liveToolMessages
  const liveTodos = useMemo(() => {
    for (let i = liveToolMessages.length - 1; i >= 0; i--) {
      const todos = extractTodosFromMessage(liveToolMessages[i]);
      if (todos) return todos;
    }
    return null;
  }, [liveToolMessages]);

  // Filtered liveToolMessages without task todos for WorkBlock
  const filteredLiveToolMessages = useMemo(() => {
    return liveToolMessages.filter((m) => !extractTodosFromMessage(m));
  }, [liveToolMessages]);

  // Group messages into conversational turns and interleaved work blocks
  const turns = useMemo(() => {
    const result: ConversationTurn[] = [];
    let currentTurn: ConversationTurn | null = null;
    let seenStepKeys = new Set<string>();
    let currentSteps: TurnStep[] = [];
    let pendingAssistantIntro: MessageRecord | null = null;

    const flushWorkBlock = () => {
      if (!currentTurn) return;

      if (currentSteps.length > 0) {
        const startTime =
          pendingAssistantIntro?.created_at ||
          currentSteps[0]?.toolMessage?.created_at ||
          currentTurn.userMessage?.created_at ||
          Date.now();
        const lastToolTime =
          currentSteps[currentSteps.length - 1]?.toolMessage?.created_at || startTime;
        const durationMs = Math.max(1000, lastToolTime - startTime);

        currentTurn.segments.push({
          id: `work_${pendingAssistantIntro?.id || currentSteps[0].id}`,
          type: 'work_block',
          introMessage: pendingAssistantIntro || undefined,
          steps: [...currentSteps],
          durationMs,
        });
        pendingAssistantIntro = null;
        currentSteps = [];
      } else if (pendingAssistantIntro) {
        currentTurn.segments.push({
          id: `seg_msg_${pendingAssistantIntro.id}`,
          type: 'assistant_text',
          message: pendingAssistantIntro,
        });
        currentTurn.assistantMessage = pendingAssistantIntro;
        pendingAssistantIntro = null;
      }
    };

    const pushFinalizedTurn = (turnToPush: ConversationTurn) => {
      const changes = extractTurnChanges(turnToPush.steps);
      turnToPush.turnChanges = changes && changes.fileCount > 0 ? changes : null;
      result.push(turnToPush);
    };

    for (const msg of messages) {
      if (msg.role === 'user') {
        if (currentTurn) {
          flushWorkBlock();
          pushFinalizedTurn(currentTurn);
        }
        seenStepKeys = new Set<string>();
        currentSteps = [];
        pendingAssistantIntro = null;
        currentTurn = {
          id: `turn_${msg.id}`,
          userMessage: msg,
          segments: [],
          steps: [],
          taskTodos: null,
        };
      } else if (msg.role === 'tool') {
        if (!currentTurn) {
          currentTurn = {
            id: `turn_orphan_${msg.id}`,
            segments: [],
            steps: [],
            taskTodos: null,
          };
          seenStepKeys = new Set<string>();
          currentSteps = [];
          pendingAssistantIntro = null;
        }

        const toolTodos = extractTodosFromMessage(msg);
        if (toolTodos) {
          currentTurn.taskTodos = toolTodos;
          // Dedicated Standalone Task List: do not push into currentSteps so WorkBlock stays clean!
        } else {
          const toolKey = msg.tool_call_id ? `tc_${msg.tool_call_id}` : `msg_${msg.id}`;
          if (!seenStepKeys.has(toolKey)) {
            seenStepKeys.add(toolKey);
            const step: TurnStep = {
              id: `step_${msg.id}`,
              type: 'tool',
              toolMessage: msg,
            };
            currentSteps.push(step);
            currentTurn.steps.push(step);
          }
        }
      } else if (msg.role === 'assistant') {
        if (!currentTurn) {
          currentTurn = {
            id: `turn_orphan_${msg.id}`,
            segments: [],
            steps: [],
          };
          seenStepKeys = new Set<string>();
          currentSteps = [];
          pendingAssistantIntro = null;
        }
        if (msg.reasoning_content) {
          const thoughtKey = `thought_${msg.reasoning_content.slice(0, 50)}`;
          if (!seenStepKeys.has(thoughtKey)) {
            seenStepKeys.add(thoughtKey);
            const step: TurnStep = {
              id: `step_thought_${msg.id}`,
              type: 'thought',
              reasoning: msg.reasoning_content,
              durationSeconds: 1,
            };
            currentSteps.push(step);
            currentTurn.steps.push(step);
          }
        }
        if (msg.content) {
          flushWorkBlock();
          pendingAssistantIntro = msg;
        }
      }
    }

    if (currentTurn) {
      flushWorkBlock();
      pushFinalizedTurn(currentTurn);
    }

    return result;
  }, [messages]);

  // Cleanly map each compaction chronologically to the turn preceding its execution
  const compactionByTurnIndex = useMemo(() => {
    if (!compactions || compactions.length === 0 || turns.length === 0) {
      return new Map<number, SessionCompactionRecord>();
    }
    const map = new Map<number, SessionCompactionRecord>();

    const getTurnTimestamp = (t: ConversationTurn): number => {
      let maxTs = t.userMessage?.created_at || 0;
      if (t.assistantMessage?.created_at && t.assistantMessage.created_at > maxTs) {
        maxTs = t.assistantMessage.created_at;
      }
      for (const seg of t.segments) {
        if (seg.message?.created_at && seg.message.created_at > maxTs) {
          maxTs = seg.message.created_at;
        }
      }
      for (const step of t.steps) {
        if (step.toolMessage?.created_at && step.toolMessage.created_at > maxTs) {
          maxTs = step.toolMessage.created_at;
        }
      }
      return maxTs;
    };

    const turnTimes = turns.map((t, idx) => ({ idx, time: getTurnTimestamp(t) }));

    for (const comp of compactions) {
      let targetTurnIdx = -1;
      for (let i = turnTimes.length - 1; i >= 0; i--) {
        if (turnTimes[i].time <= comp.created_at + 1000) {
          targetTurnIdx = turnTimes[i].idx;
          break;
        }
      }
      if (targetTurnIdx === -1) {
        targetTurnIdx = Math.max(0, turns.length - 1);
      }
      map.set(targetTurnIdx, comp);
    }
    return map;
  }, [compactions, turns]);

  // Build Timeline Minimap items: strictly 1 item per chat turn (1 chat = 1 line)
  const timelineItems = useMemo<TimelineTurnItem[]>(() => {
    return turns.map((turn, idx) => {
      const isLast = idx === turns.length - 1;
      const userPrompt = (turn.userMessage?.content || '').replace(/\s+/g, ' ').trim() || `Chat #${idx + 1}`;
      const assistantTexts = turn.segments
        .filter((s) => s.type === 'assistant_text' && s.message?.content)
        .map((s) => s.message!.content)
        .filter(Boolean)
        .join(' ');
      const assistantPreview =
        assistantTexts.trim() ||
        (isLast && isStreaming && streamingContent ? streamingContent.trim() : '');

      return {
        id: turn.id,
        turnId: turn.id,
        userPrompt,
        assistantPreview,
      };
    });
  }, [turns, isStreaming, streamingContent]);

  // Auto-scroll to bottom smoothly when a compaction completes
  useEffect(() => {
    if (compactions && compactions.length > 0 && scrollRef.current) {
      setTimeout(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
        }
      }, 80);
    }
  }, [compactions.length]);

  return (
    <section className="flex-1 min-h-0 flex flex-col h-full bg-[#101010] overflow-hidden relative">
      <SelectionQuoteButton />
      {turns.length > 0 && (
        <ChatTimelineMinimap
          turns={timelineItems}
          scrollContainerRef={scrollRef}
          sessionId={messages[0]?.session_id}
        />
      )}
      {/* Messages Canvas Scroll Area */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 min-h-0 overflow-y-auto pt-4 pb-7 select-text"
        style={{
          overscrollBehavior: 'contain',
          ...(messages.length > 0 || isStreaming || queuedMessage
            ? {
                WebkitMaskImage:
                  'linear-gradient(to bottom, #000000 0%, #000000 calc(100% - 52px), rgba(0,0,0,0.52) calc(100% - 24px), rgba(0,0,0,0.12) calc(100% - 8px), transparent 100%)',
                maskImage:
                  'linear-gradient(to bottom, #000000 0%, #000000 calc(100% - 52px), rgba(0,0,0,0.52) calc(100% - 24px), rgba(0,0,0,0.12) calc(100% - 8px), transparent 100%)',
              }
            : {}),
        }}
      >
        {isLoadingSession && !isStreaming ? (
          /* Sleek Session Loading State */
          <div className={`h-full flex flex-col items-center justify-center p-8 select-none ${chatWidthClass} mx-auto w-full animate-fade-in`}>
            <div className="flex flex-col items-center gap-3.5 max-w-xs text-center">
              <div className="w-10 h-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-xs">
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">Memuat riwayat chat...</p>
                <p className="text-xs text-muted-foreground/80">Menyiapkan percakapan dan konteks kerja</p>
              </div>
            </div>
          </div>
        ) : messages.length === 0 && !isStreaming ? (
          /* Centered Initial New Conversation Box matching media_1789815532598.png */
          <div className={`h-full flex flex-col items-center justify-center p-6 select-none ${chatWidthClass} mx-auto w-full animate-fade-in`}>
            <div className="w-full flex flex-col gap-2">
              {/* Above input: Project Selector [📁 aidev ˅] */}
              {onSelectProject && onOpenNewProjectModal && (
                <div className="flex items-center pl-0.5">
                  <ProjectSelectorDropdown
                    projects={projects}
                    currentProject={currentProject || null}
                    onSelectProject={onSelectProject}
                    onOpenNewProjectModal={onOpenNewProjectModal}
                  />
                </div>
              )}

              {/* Chat Input Box Centered */}
              <ChatInput
                isCentered
                onSendMessage={onSendMessage}
                onStop={onStopStreaming}
                isStreaming={isStreaming}
                workspaceFiles={workspaceFiles}
                workdir={currentProject?.workdir_path}
                selectedModel={selectedModel}
                models={models}
                onModelChange={onModelChange}
                runtimeTasks={runtimeTasks}
                onAbortTask={onAbortTask}
                onOpenTask={onOpenTask}
                queuedMessagesMode={queuedMessagesMode}
                sessionId={sessionId || messages[0]?.session_id || null}
                initialDraft={sessionDraft}
                onDraftChange={onDraftChange}
              />
            </div>
          </div>
        ) : (
          <>
            {/* Top Pagination Control */}
            {hasMoreMessages && (
              <div className={`flex justify-center py-2.5 select-none ${chatWidthClass} mx-auto w-full px-4`}>
                {isLoadingOlderMessages ? (
                  <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-muted/60 border border-border/60 text-xs text-muted-foreground animate-pulse shadow-xs">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                    <span>Memuat 5 percakapan sebelumnya...</span>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={triggerLoadOlderMessages}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-background border border-border/60 hover:bg-muted/50 text-xs text-muted-foreground hover:text-foreground transition shadow-xs cursor-pointer active:scale-95"
                  >
                    <ChevronUp className="w-3.5 h-3.5 text-muted-foreground/70" />
                    <span>Muat percakapan sebelumnya</span>
                  </button>
                )}
              </div>
            )}

            {!hasMoreMessages && messages.length > 0 && (
              <div className={`flex items-center justify-center gap-3 py-3 select-none text-[11px] text-muted-foreground/50 ${chatWidthClass} mx-auto w-full px-4`}>
                <div className="h-px bg-border/40 w-16" />
                <span>Awal percakapan</span>
                <div className="h-px bg-border/40 w-16" />
              </div>
            )}

            {/* Find strictly the latest turn that has todos to ensure only 1 card is displayed */}
            {(() => {
              const latestTurnWithTodosId = (() => {
                for (let i = turns.length - 1; i >= 0; i--) {
                  const t = turns[i];
                  const isThisStreaming = i === turns.length - 1 && isStreaming;
                  if (isThisStreaming && liveTodos && liveTodos.length > 0) {
                    return t.id;
                  }
                  if (t.taskTodos && t.taskTodos.length > 0) {
                    return t.id;
                  }
                }
                return null;
              })();

              return turns.map((turn, turnIdx) => {
                const isLastTurn = turnIdx === turns.length - 1;
                const isThisTurnStreaming = isLastTurn && isStreaming;
                const diffCardNode = !isThisTurnStreaming && turn.turnChanges ? (
                  <TurnDiffCard
                    changes={turn.turnChanges}
                    onOpenFileDiff={onOpenFileDiff}
                    onOpenFile={onOpenFile}
                    onOpenReview={onOpenReview}
                    className="pt-2 pb-1 select-none"
                  />
                ) : null;

                const lastAssistantSegment = [...turn.segments]
                  .reverse()
                  .find((s) => s.type === 'assistant_text');

                return (
                  <div
                    key={turn.id}
                    data-turn-id={turn.id}
                    className={`space-y-2 select-text ${turnIdx > 0 ? 'pt-7' : 'pt-1'}`}
                  >
                    {/* 1. User Message Card */}
                    {turn.userMessage && (
                      <MessageItem
                        message={turn.userMessage}
                        workdir={currentProject?.workdir_path}
                        onOpenFileDiff={onOpenFileDiff}
                        onOpenFile={onOpenFile}
                        onOpenBrowser={onOpenBrowser}
                        onRevertTurn={onRevertTurn}
                      />
                    )}

                    {/* 2. Interleaved Segments (Historical & Committed in this turn) */}
                    {(() => {
                      const shouldRenderTurnTodos = turn.id === latestTurnWithTodosId;
                      const rawEffectiveTodos = isThisTurnStreaming && liveTodos ? liveTodos : turn.taskTodos;
                      const lastWorkBlockIdx = turn.segments.map((s) => s.type).lastIndexOf('work_block');
                      const lastAssistantSegIdx = turn.segments.map((s) => s.type).lastIndexOf('assistant_text');
                      const hasTurnError = turn.segments.some(
                        (s) =>
                          s.message?.status === 'ERROR' ||
                          (typeof s.message?.content === 'string' &&
                            (s.message.content.startsWith('⚠️') ||
                              /^(400|401|402|403|404|429|500)\s+/i.test(s.message.content.trim()) ||
                              s.message.content.includes('Saldo credit') ||
                              s.message.content.includes('paket langganan') ||
                              s.message.content.includes('Request Error:')))
                      );
                      const isWaitingInteraction =
                        isLastTurn && Boolean(pendingPermission || pendingQuestion || pendingPlan);
                      const hasCompletedFinalResponse =
                        !isThisTurnStreaming &&
                        !hasTurnError &&
                        !isWaitingInteraction &&
                        lastAssistantSegIdx !== -1 &&
                        lastAssistantSegIdx > lastWorkBlockIdx;

                      const effectiveTodos =
                        rawEffectiveTodos && hasCompletedFinalResponse
                          ? rawEffectiveTodos.map((item) => ({ ...item, status: 'completed' as const }))
                          : rawEffectiveTodos;
                      const hasTodos = Boolean(shouldRenderTurnTodos && effectiveTodos && effectiveTodos.length > 0);
                      let hasRenderedTodos = false;

                      return (
                        <>
                          {turn.segments.map((seg, segIdx) => {
                            if (seg.type === 'work_block' && seg.steps && seg.steps.length > 0) {
                              const isLastWork = segIdx === lastWorkBlockIdx;
                              return (
                                <React.Fragment key={seg.id}>
                                  <div className={`${chatWidthClass} mx-auto w-full px-4`}>
                                    <WorkBlock
                                      introMessage={seg.introMessage}
                                      steps={seg.steps}
                                      durationMs={seg.durationMs}
                                      isStreaming={false}
                                      onOpenFileDiff={onOpenFileDiff}
                                      onOpenFile={onOpenFile}
                                      onOpenBrowser={onOpenBrowser}
                                      verbose={verboseChat}
                                    />
                                  </div>

                                  {/* Task List Accordion Card — placed strictly UNDER Worked for */}
                                  {!isThisTurnStreaming && hasTodos && isLastWork && (
                                    (() => {
                                      hasRenderedTodos = true;
                                      return (
                                        <div className={`${chatWidthClass} mx-auto w-full px-4 pt-0.5 pb-1`}>
                                          <TodoCard todos={effectiveTodos!} title="Task List" isStreaming={false} />
                                        </div>
                                      );
                                    })()
                                  )}
                                </React.Fragment>
                              );
                            }

                            if (seg.type === 'assistant_text' && seg.message) {
                              const isLastAssistant = seg === lastAssistantSegment;
                              const isEndOfTurn = isLastAssistant && !isThisTurnStreaming;
                              const fullTurnAssistantContent = isEndOfTurn
                                ? turn.segments
                                    .filter((s) => s.type === 'assistant_text')
                                    .map((s) => s.message?.content)
                                    .filter(Boolean)
                                    .join('\n\n')
                                : undefined;

                              const hasGroupedActivity = turn.segments.some(
                                (s) => s.type === 'work_block' && s.steps && s.steps.length > 0
                              );

                              return (
                                <React.Fragment key={seg.id}>
                                  {/* Fallback Task List if turn has no work_block */}
                                  {!isThisTurnStreaming && hasTodos && !hasRenderedTodos && (
                                    (() => {
                                      hasRenderedTodos = true;
                                      return (
                                        <div className={`${chatWidthClass} mx-auto w-full px-4 pt-0.5 pb-1`}>
                                          <TodoCard todos={effectiveTodos!} title="Task List" isStreaming={false} />
                                        </div>
                                      );
                                    })()
                                  )}

                                  <MessageItem
                                    message={seg.message}
                                    hasGroupedActivity={hasGroupedActivity}
                                    workdir={currentProject?.workdir_path}
                                    onOpenFileDiff={onOpenFileDiff}
                                    onOpenFile={onOpenFile}
                                    onOpenBrowser={onOpenBrowser}
                                    footerCard={isEndOfTurn ? diffCardNode : undefined}
                                    showFooterActions={isEndOfTurn}
                                    copyText={fullTurnAssistantContent}
                                    onApprovePlan={onApprovePlan}
                                    onRejectPlan={onRejectPlan}
                                    onContinueTurn={
                                      onContinueTurn ||
                                      (() => onSendMessage('Lanjutkan pengerjaan tugas yang tadi terhenti sampai selesai.'))
                                    }
                                  />
                                </React.Fragment>
                              );
                            }

                            return null;
                          })}

                          {/* Fallback Task List if turn had no segments rendered */}
                          {!isThisTurnStreaming && hasTodos && !hasRenderedTodos && (
                            <div className={`${chatWidthClass} mx-auto w-full px-4 pt-0.5 pb-1`}>
                              <TodoCard todos={effectiveTodos!} title="Task List" isStreaming={false} />
                            </div>
                          )}
                        </>
                      );
                    })()}

                    {/* 3. Live Active Elements for the Current Streaming Turn */}
                    {isThisTurnStreaming && (
                      <>
                        {/* Live Work Block: shows running tools, streaming reasoning, or initial spinner */}
                        {(streamingReasoning ||
                          filteredLiveToolMessages.length > 0 ||
                          (!streamingContent &&
                            (turn.segments.length === 0 ||
                              turn.segments[turn.segments.length - 1].type === 'assistant_text'))) && (
                          <div className={`${chatWidthClass} mx-auto w-full px-4`}>
                            <WorkBlock
                              steps={[
                                ...(streamingReasoning
                                  ? [
                                      {
                                        id: 'step_live_reasoning',
                                        type: 'thought' as const,
                                        reasoning: streamingReasoning,
                                        durationSeconds: 1,
                                      },
                                    ]
                                  : []),
                                ...filteredLiveToolMessages.map((m) => ({
                                  id: `step_${m.id}`,
                                  type: 'tool' as const,
                                  toolMessage: m,
                                })),
                              ]}
                              isStreaming={true}
                              onOpenFileDiff={onOpenFileDiff}
                              onOpenFile={onOpenFile}
                              onOpenBrowser={onOpenBrowser}
                              verbose={verboseChat}
                            />
                          </div>
                        )}

                        {/* Live Task List Accordion Card — placed strictly UNDER live Worked for */}
                        {isThisTurnStreaming && turn.id === latestTurnWithTodosId && liveTodos && liveTodos.length > 0 && (
                          <div className={`${chatWidthClass} mx-auto w-full px-4 pt-0.5 pb-1`}>
                            <TodoCard todos={liveTodos} title="Task List" isStreaming={true} />
                          </div>
                        )}

                    {/* Live Streaming Assistant Message or Plan Indicator */}
                    {streamingContent && (
                      (() => {
                        const isStreamingPlan =
                          streamingContent.includes('Implementation Plan') ||
                          streamingContent.includes('# Implementation') ||
                          streamingContent.trim().startsWith('# Plan') ||
                          streamingContent.trim().startsWith('## Plan');

                        if (isStreamingPlan) {
                          return (
                            <div className={`${chatWidthClass} mx-auto w-full px-4 py-2`}>
                              <div className="my-1.5 p-3.5 rounded-xl border border-[#262626] bg-[#141414] space-y-2 select-none shadow-md animate-pulse font-sans">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <ListOrdered className="w-4 h-4 text-[#8c8c8c]" strokeWidth={1.75} />
                                    <span className="text-[13px] font-medium text-[#f0f0f0]">
                                      Generating implementation plan in sidebar...
                                    </span>
                                  </div>
                                  <span className="text-[10.5px] font-mono px-2 py-0.5 rounded bg-white/[0.04] text-[#8c8c8c] border border-white/[0.08]">
                                    Generating
                                  </span>
                                </div>
                                <p className="text-[12px] text-[#999999] leading-relaxed">
                                  The implementation plan is being drafted and will open in the sidebar editor.
                                </p>
                              </div>
                            </div>
                          );
                        }

                        return (
                          <MessageItem
                            message={{
                              id: 'streaming_msg',
                              session_id: 'current',
                              role: 'assistant',
                              content: streamingContent,
                              reasoning_content: null,
                              created_at: Date.now(),
                            }}
                            workdir={currentProject?.workdir_path}
                            hasGroupedActivity={Boolean(streamingReasoning || liveToolMessages.length > 0)}
                            onOpenFileDiff={onOpenFileDiff}
                            onOpenFile={onOpenFile}
                            onOpenBrowser={onOpenBrowser}
                            showFooterActions={false}
                            onApprovePlan={onApprovePlan}
                            onRejectPlan={onRejectPlan}
                          />
                        );
                      })()
                    )}
                  </>
                )}

                {/* 4. Standalone Diff Card if no assistant message exists in this turn */}
                {!isThisTurnStreaming && !lastAssistantSegment && diffCardNode && (
                  <div className={`${chatWidthClass} mx-auto w-full px-4 pt-1 pb-3`}>
                    {diffCardNode}
                  </div>
                )}

                {/* 5. Compaction Memory Divider if turn marks a compaction boundary */}
                {(() => {
                  const compactionToRender = compactionByTurnIndex.get(turnIdx);
                  if (!compactionToRender) return null;

                  return (
                    <div className={`${chatWidthClass} mx-auto w-full px-4 py-1`}>
                      <CompactionDivider compaction={compactionToRender} />
                    </div>
                  );
                })()}
              </div>
            );
          });
        })()}
          </>
        )}

        {/* Fallback Live Streaming Display ONLY when turns is empty (e.g. before initial prompt is recorded) */}
        {isStreaming && turns.length === 0 && (
          <div className="space-y-1">
            {/* Live Streaming Thought / Activity directly inside chat */}
            {(streamingReasoning || filteredLiveToolMessages.length > 0 || !streamingContent) && (
              <div className={`${chatWidthClass} mx-auto w-full px-4`}>
                <WorkBlock
                  steps={
                    liveToolMessages.length > 0
                      ? filteredLiveToolMessages.map((m) => ({
                          id: `step_${m.id}`,
                          type: 'tool' as const,
                          toolMessage: m,
                        }))
                      : streamingReasoning
                      ? [
                          {
                            id: 'step_live_reasoning',
                            type: 'thought' as const,
                            reasoning: streamingReasoning,
                            durationSeconds: 1,
                          },
                        ]
                      : []
                  }
                  isStreaming={true}
                  onOpenFileDiff={onOpenFileDiff}
                  onOpenFile={onOpenFile}
                  onOpenBrowser={onOpenBrowser}
                  verbose={verboseChat}
                />
              </div>
            )}
            {liveTodos && liveTodos.length > 0 && (
              <div className={`${chatWidthClass} mx-auto w-full px-4 pt-0.5 pb-1`}>
                <TodoCard todos={liveTodos} title="Task List" isStreaming={true} />
              </div>
            )}

            {/* Live Streaming Assistant Content */}
            {streamingContent && (
              (() => {
                const isStreamingPlan =
                  streamingContent.includes('Implementation Plan') ||
                  streamingContent.includes('# Implementation') ||
                  streamingContent.trim().startsWith('# Plan') ||
                  streamingContent.trim().startsWith('## Plan');

                if (isStreamingPlan) {
                  return (
                    <div className={`${chatWidthClass} mx-auto w-full px-4 py-2`}>
                      <div className="my-1.5 p-3.5 rounded-xl border border-[#262626] bg-[#141414] space-y-2 select-none shadow-md animate-pulse font-sans">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <ListOrdered className="w-4 h-4 text-[#8c8c8c]" strokeWidth={1.75} />
                            <span className="text-[13px] font-medium text-[#f0f0f0]">
                              Generating implementation plan in sidebar...
                            </span>
                          </div>
                          <span className="text-[10.5px] font-mono px-2 py-0.5 rounded bg-white/[0.04] text-[#8c8c8c] border border-white/[0.08]">
                            Generating
                          </span>
                        </div>
                        <p className="text-[12px] text-[#999999] leading-relaxed">
                          The implementation plan is being drafted and will open in the sidebar editor.
                        </p>
                      </div>
                    </div>
                  );
                }

                return (
                  <MessageItem
                    message={{
                      id: 'streaming_msg',
                      session_id: 'current',
                      role: 'assistant',
                      content: streamingContent,
                      reasoning_content: null,
                      created_at: Date.now(),
                    }}
                    workdir={currentProject?.workdir_path}
                    hasGroupedActivity={Boolean(streamingReasoning || liveToolMessages.length > 0)}
                    onOpenFileDiff={onOpenFileDiff}
                    onOpenFile={onOpenFile}
                    onOpenBrowser={onOpenBrowser}
                    showFooterActions={false}
                    onApprovePlan={onApprovePlan}
                    onRejectPlan={onRejectPlan}
                  />
                );
              })()
            )}
          </div>
        )}

        {/* Pending Question Clarification Card */}
        {pendingQuestion && (
          <div className={`${chatWidthClass} mx-auto w-full px-4 my-3`}>
            <QuestionCard
              toolCallId={pendingQuestion.toolCallId}
              question={pendingQuestion.question}
              options={pendingQuestion.options}
              allowCustom={pendingQuestion.allowCustom}
              onSubmit={(answer) => onAnswerQuestion?.(answer)}
              onCancel={onCancelQuestion}
            />
          </div>
        )}

        {/* Pending Plan Approval Card */}
        {pendingPlan && (
          <div className={`${chatWidthClass} mx-auto w-full px-4 my-3`}>
            <PlanCard
              goal={pendingPlan.goal}
              planMarkdown={pendingPlan.planMarkdown}
              onApprove={onApprovePlan}
              onReject={onRejectPlan}
              onOpenFile={onOpenFile}
              sessionId={pendingPlan.sessionId}
            />
          </div>
        )}

        {/* Pending Permission Confirmation Card */}
        {pendingPermission && (
          <div className={`${chatWidthClass} mx-auto w-full px-4 my-3`}>
            <PermissionCard
              toolCallId={pendingPermission.toolCallId}
              toolName={pendingPermission.toolName}
              actionType={pendingPermission.actionType}
              targetResource={pendingPermission.targetResource}
              reason={pendingPermission.reason}
              arguments={pendingPermission.arguments}
              mode={pendingPermission.mode}
              onRespond={onPermissionRespond}
            />
          </div>
        )}

        {/* Active Context Compaction in-progress banner */}
        {isCompacting && (
          <div className={`${chatWidthClass} mx-auto w-full px-4 py-3 my-2 animate-pulse`}>
            <div className="relative flex items-center justify-center">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-[#2a2a2a]" />
              </div>
              <div className="relative inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-mono text-[#e8975f] bg-[#1a1a1a] border border-[#e8975f]/40 rounded-full shadow-lg">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-[#e8975f]" />
                <span>Sedang merangkum konteks memori...</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Floating Bottom Input Dock - only shown when there are messages, streaming, or queued message! */}
      {(messages.length > 0 || isStreaming || queuedMessage) && (
        <div className="w-full shrink-0 relative z-30 pt-1">
          {/* Soft dark feather gradient above ChatInput */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-12 inset-x-0 h-12 bg-gradient-to-t from-[#101010] via-[#101010]/75 to-transparent"
          />

          {/* Floating Scroll to bottom button */}
          {showScrollBottom && messages.length > 0 && (
            <div className="absolute -top-10 inset-x-0 flex justify-center z-20 pointer-events-none animate-fade-in">
              <button
                type="button"
                onClick={scrollToBottom}
                className="pointer-events-auto w-7.5 h-7.5 p-1.5 rounded-full bg-[#181818]/90 backdrop-blur-md border border-[#2e2e34] text-[#b4b4bb] hover:text-white hover:bg-[#25252b] flex items-center justify-center shadow-lg transition-all duration-150 hover:scale-110 active:scale-95 cursor-pointer"
                title="Scroll ke paling bawah"
              >
                <ArrowDown className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {queuedMessage && (
            <div className={`${chatWidthClass} mx-auto w-full px-4 mb-2`}>
              <div className="flex items-center justify-between px-3.5 py-2 rounded-xl bg-[#141416] border border-[#26262c] text-[12px] text-[#cccccc] shadow-lg animate-fade-in">
                <div className="flex items-center gap-2.5 truncate min-w-0 flex-1">
                  <div
                    className={`w-2 h-2 rounded-full shrink-0 ${
                      isStreaming ? 'bg-[#007acc] animate-pulse' : 'bg-emerald-500'
                    }`}
                  />
                  <span className="text-[#888888] font-medium shrink-0">Queued:</span>
                  <span className="truncate text-white font-medium">"{queuedMessage.text}"</span>
                  <span className="text-[11px] text-[#777777] hidden sm:inline shrink-0">
                    {isStreaming ? '(auto-send when turn finishes)' : '(ready to send)'}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0 ml-2">
                  {!isStreaming && (
                    <button
                      type="button"
                      onClick={() => {
                        const msg = queuedMessage;
                        onCancelQueuedMessage?.();
                        if (msg) {
                          onSendMessage(msg.text, msg.images);
                        }
                      }}
                      className="px-2.5 py-1 rounded-md bg-[#007acc] hover:bg-[#008be5] text-white text-[11px] font-medium transition cursor-pointer flex items-center gap-1 shadow-sm active:scale-95"
                      title="Send queued message now"
                    >
                      <ArrowUp className="w-3 h-3 stroke-[2.5]" />
                      <span>Send</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={onCancelQueuedMessage}
                    className="text-[#888888] hover:text-white p-1 hover:bg-[#222226] rounded-md transition cursor-pointer"
                    title="Cancel queued message"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )}
          <ChatInput
            onSendMessage={onSendMessage}
            onStop={onStopStreaming}
            isStreaming={isStreaming}
            workspaceFiles={workspaceFiles}
            workdir={currentProject?.workdir_path}
            selectedModel={selectedModel}
            models={models}
            onModelChange={onModelChange}
            runtimeTasks={runtimeTasks}
            onAbortTask={onAbortTask}
            onOpenTask={onOpenTask}
            onOpenBrowser={onOpenBrowser}
            onRefreshModels={onRefreshModels}
            queuedMessagesMode={queuedMessagesMode}
            sessionId={sessionId || messages[0]?.session_id || null}
            initialDraft={sessionDraft}
            onDraftChange={onDraftChange}
          />
        </div>
      )}
    </section>
  );
};
