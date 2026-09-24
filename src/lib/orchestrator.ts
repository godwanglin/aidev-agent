import fs from 'fs';
import path from 'path';
import { getOpenAIClient } from './gateway';
import { AGENT_TOOLS, CALL_MCP_TOOL_DEF, formatMcpToolForOpenAi, dispatchToolCall } from './tools';
import { mcpClientManager } from './mcp/client-manager';
import {
  messageRepo,
  sessionRepo,
  auditRepo,
  compactionRepo,
  MessageRecord,
  SessionRecord,
} from './db';
import { evaluatePermission, ActionType } from './security';
import { logAgent, ensureChatStorageInitialized, loadSettings } from './storage';
import { scanAvailableSkills, formatSkillsSystemPrompt } from './skills';
import { formatModelDisplayName } from './model-utils';
import {
  runCompaction,
  partitionHistory,
  shouldAutoCompact,
  estimateActiveSessionTokens,
  getModelContextWindow,
  COMPACTION_CONSTANTS,
} from './compaction';

export interface ParsedInlineToolCall {
  id: string;
  name: string;
  arguments: string;
}

/**
 * Extracts inline text-based tool calls (e.g. <call to=functions.run_command>...</call>, <function_call>...</function_call>, or markdown tool_call blocks)
 * that models may emit when falling back to text generation or attempting to simulate loops.
 */
export function parseInlineToolCalls(content: string): {
  cleanContent: string;
  toolCalls: ParsedInlineToolCall[];
} {
  if (!content) return { cleanContent: content, toolCalls: [] };

  const toolCalls: ParsedInlineToolCall[] = [];

  // Pattern 1: <call to=(?:functions\.)?([a-zA-Z0-9_\-\.]+)>([\s\S]*?)<\/call>
  const callToRegex = /<call\s+to=(?:functions\.)?([a-zA-Z0-9_\-\.]+)>([\s\S]*?)<\/call>/gi;
  let match: RegExpExecArray | null;
  while ((match = callToRegex.exec(content)) !== null) {
    const rawName = match[1].trim().replace(/^functions\./, '');
    const rawArgs = match[2].trim();
    toolCalls.push({
      id: `call_inline_${Date.now()}_${toolCalls.length}`,
      name: rawName,
      arguments: rawArgs,
    });
  }

  // Pattern 2: <function_call>([\s\S]*?)<\/function_call> or <tool_call>([\s\S]*?)<\/tool_call>
  if (toolCalls.length === 0) {
    const xmlToolRegex = /<(?:function_call|tool_call)>([\s\S]*?)<\/(?:function_call|tool_call)>/gi;
    while ((match = xmlToolRegex.exec(content)) !== null) {
      try {
        const parsed = JSON.parse(match[1].trim());
        const name = parsed.name || parsed.function || parsed.tool;
        const args = parsed.arguments || parsed.parameters || parsed.args || {};
        if (name) {
          toolCalls.push({
            id: `call_inline_${Date.now()}_${toolCalls.length}`,
            name: String(name),
            arguments: typeof args === 'string' ? args : JSON.stringify(args),
          });
        }
      } catch {}
    }
  }

  // Pattern 3: ```(?:tool_call|function_call)\s*\n([\s\S]*?)\n```
  if (toolCalls.length === 0) {
    const mdToolRegex = /```(?:tool_call|function_call)\s*\n([\s\S]*?)\n```/gi;
    while ((match = mdToolRegex.exec(content)) !== null) {
      try {
        const parsed = JSON.parse(match[1].trim());
        const name = parsed.name || parsed.function || parsed.tool;
        const args = parsed.arguments || parsed.parameters || parsed.args || {};
        if (name) {
          toolCalls.push({
            id: `call_inline_${Date.now()}_${toolCalls.length}`,
            name: String(name),
            arguments: typeof args === 'string' ? args : JSON.stringify(args),
          });
        }
      } catch {}
    }
  }

  // Clean out the raw tool call tags from the message content so chat bubbles stay clean
  let clean = content
    .replace(/<call\s+to=[^>]+>[\s\S]*?<\/call>/gi, '')
    .replace(/<(?:function_call|tool_call)>[\s\S]*?<\/(?:function_call|tool_call)>/gi, '')
    .replace(/```(?:tool_call|function_call)\s*\n[\s\S]*?\n```/gi, '')
    .trim();

  return { cleanContent: clean, toolCalls };
}

export interface AgentEvent {
  type:
    | 'reasoning_delta'
    | 'content_delta'
    | 'assistant_message_committed'
    | 'tool_start'
    | 'tool_completed'
    | 'permission_required'
    | 'question_required'
    | 'file_changed'
    | 'task_started'
    | 'plan_created'
    | 'compaction_completed'
    | 'done'
    | 'error';
  data: any;
}

export type EventCallback = (event: AgentEvent) => void;

// Active orchestrators map to support immediate abort/cancellation per session
const activeOrchestrators = new Map<string, AgentOrchestrator>();

export function isSessionOrchestratorRunning(sessionId: string): boolean {
  return activeOrchestrators.has(sessionId);
}

export function abortSessionOrchestrator(sessionId: string): boolean {
  const orchestrator = activeOrchestrators.get(sessionId);
  if (orchestrator) {
    orchestrator.abort();
    activeOrchestrators.delete(sessionId);
    return true;
  }
  return false;
}

export class AgentOrchestrator {
  private sessionId: string;
  private workdir: string;
  private onEvent: EventCallback;
  private isTurnApproved: boolean = false;
  private abortController = new AbortController();

  constructor(sessionId: string, workdir: string, onEvent: EventCallback) {
    this.sessionId = sessionId;
    this.workdir = workdir;
    this.onEvent = onEvent;
  }

  public abort(): void {
    this.abortController.abort();
  }

  public get isAborted(): boolean {
    return this.abortController.signal.aborted;
  }

  public async runTurn(
    userPrompt: string,
    images?: Array<{ id: string; url: string; name?: string; mimeType?: string }>,
    clientMessageId?: string
  ): Promise<void> {
    activeOrchestrators.set(this.sessionId, this);
    this.isTurnApproved = false;
    const session = sessionRepo.getById(this.sessionId);
    if (!session) {
      activeOrchestrators.delete(this.sessionId);
      throw new Error(`Session ${this.sessionId} not found`);
    }

    // 0. Auto-cancel / supersede any stale PENDING_PERMISSION or PENDING_QUESTION messages from previous turns
    const prevHistory = messageRepo.listBySession(this.sessionId);
    for (const msg of prevHistory) {
      if (msg.status === 'PENDING_PERMISSION' || msg.status === 'PENDING_QUESTION') {
        const cancelResult = JSON.stringify({ error: 'Superseded by new user prompt.' });
        messageRepo.update(msg.id, {
          status: 'FAILED',
          tool_result: cancelResult,
          content: cancelResult,
        });
      }
    }

    // Check if this is a slash command prompt (/plan, /test, /review, /browser, /skill:<name>)
    const trimmedPrompt = userPrompt.trim();
    let commandMode: 'plan' | 'test' | 'review' | 'browser' | 'skill' | null = null;
    let cleanPrompt = userPrompt;
    let targetSkillName: string | null = null;

    const skillPrefixMatch = trimmedPrompt.match(/^\/skill:([a-zA-Z0-9_-]+)(?:\s+(.*))?$/s);
    if (skillPrefixMatch) {
      commandMode = 'skill';
      targetSkillName = skillPrefixMatch[1];
      cleanPrompt = (skillPrefixMatch[2] || '').trim();
    } else if (trimmedPrompt.startsWith('/plan')) {
      commandMode = 'plan';
      cleanPrompt = trimmedPrompt.substring(5).trim() || 'Implementation Plan';
    } else if (trimmedPrompt.startsWith('/test')) {
      commandMode = 'test';
      cleanPrompt = trimmedPrompt.substring(5).trim() || 'Run project automated tests and verify suites';
    } else if (trimmedPrompt.startsWith('/review')) {
      commandMode = 'review';
      cleanPrompt = trimmedPrompt.substring(7).trim() || 'Perform rigorous code review and git diff audit';
    } else if (trimmedPrompt.startsWith('/browser')) {
      commandMode = 'browser';
      cleanPrompt = trimmedPrompt.substring(8).trim() || 'Open Chrome DevTools browser to inspect page';
    }

    // 1. Record User Message (Multimodal support)
    const userMsgId = clientMessageId || `msg_${Date.now()}_user`;
    let storedContent: string = userPrompt;
    if (images && images.length > 0) {
      const parts: any[] = [{ type: 'text', text: userPrompt }];
      const chatStorage = ensureChatStorageInitialized(session.project_id, this.sessionId);

      for (let idx = 0; idx < images.length; idx++) {
        const img = images[idx];
        let savedFileName = img.name || '';

        // If base64 data URL, persist physically to session user_uploads directory
        if (img.url && typeof img.url === 'string' && img.url.startsWith('data:')) {
          try {
            const match = /^data:(image\/[a-zA-Z0-9+]+);base64,(.+)$/.exec(img.url);
            if (match) {
              const mimeType = match[1];
              const base64Data = match[2];
              let ext = '.png';
              if (mimeType.includes('jpeg') || mimeType.includes('jpg')) ext = '.jpg';
              else if (mimeType.includes('gif')) ext = '.gif';
              else if (mimeType.includes('webp')) ext = '.webp';
              else if (mimeType.includes('svg')) ext = '.svg';

              savedFileName = `media_${Date.now()}_${idx}${ext}`;
              const filePath = path.join(chatStorage.uploads, savedFileName);
              fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));
            }
          } catch (saveErr) {
            console.error('Failed saving uploaded image to chatStorage.uploads:', saveErr);
          }
        }

        parts.push({
          type: 'image_url',
          image_id: img.id,
          name: img.name || savedFileName,
          filename: savedFileName,
          image_url: { url: img.url },
        });
      }
      storedContent = JSON.stringify(parts);
    }

    // Special administrative command: /compact should not create user/assistant chat bubbles
    if (trimmedPrompt.startsWith('/compact')) {
      try {
        const compactedRecord = await runCompaction(this.sessionId, true);
        if (compactedRecord) {
          this.onEvent({
            type: 'compaction_completed',
            data: compactedRecord,
          });
        }
        this.onEvent({ type: 'done', data: { status: 'COMPLETED' } });
        return;
      } catch (compactErr: any) {
        logAgent(`Failed manual compaction in session ${this.sessionId}:`, compactErr.message);
        this.onEvent({
          type: 'error',
          data: { message: `Failed to run memory compaction: ${compactErr.message || 'Unknown error'}` },
        });
        this.onEvent({ type: 'done', data: { status: 'ERROR' } });
        return;
      }
    }

    // Clean up any previous error cards in this session when resuming or starting a turn
    try {
      messageRepo.deleteErrorsBySession(this.sessionId);
    } catch {}

    const isSeamlessContinue = trimmedPrompt === '__CONTINUE_TURN__';
    if (!isSeamlessContinue) {
      messageRepo.create({
        id: userMsgId,
        session_id: this.sessionId,
        role: 'user',
        content: storedContent,
        created_at: Date.now(),
      });
    }

    try {
      await this.executeLoop(
        session,
        commandMode,
        isSeamlessContinue
          ? 'Lanjutkan pengerjaan tugas dan daftar Task List yang tadi terhenti sampai selesai.'
          : cleanPrompt,
        targetSkillName
      );
    } catch (err: any) {
      if (!this.isAborted) {
        logAgent(`Error during turn in session ${this.sessionId}:`, err.message);
        const rawErrMsg = err.message || 'Unknown orchestration error';
        const errMsg = rawErrMsg.replace(
          /https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?\/(billing|pricing|keys)[^\s)]*/gi,
          'https://aidev.weebinhub.biz.id/$1'
        );
        const errRecord: MessageRecord = {
          id: `msg_${Date.now()}_error`,
          session_id: this.sessionId,
          role: 'assistant',
          content: errMsg,
          status: 'ERROR',
          created_at: Date.now(),
        };
        try {
          messageRepo.create(errRecord);
        } catch (dbErr) {
          logAgent(`Failed saving error message to database in session ${this.sessionId}:`, dbErr);
        }
        this.onEvent({
          type: 'error',
          data: { message: errMsg, messageId: errRecord.id },
        });
        this.onEvent({
          type: 'done',
          data: { status: 'ERROR' },
        });
      }
    } finally {
      activeOrchestrators.delete(this.sessionId);
    }
  }

  private async executeLoop(
    session: SessionRecord,
    commandModeInput: 'plan' | 'test' | 'review' | 'browser' | 'skill' | boolean | null,
    userGoal: string,
    targetSkillName?: string | null
  ): Promise<void> {
    const commandMode: 'plan' | 'test' | 'review' | 'browser' | 'skill' | null =
      commandModeInput === true ? 'plan' : commandModeInput === false ? null : commandModeInput;
    const isPlanRequest = commandMode === 'plan';

    const client = getOpenAIClient();
    let keepRunning = true;
    let iteration = 0;
    const maxIterations = 25;

    while (keepRunning && iteration < maxIterations) {
      if (this.isAborted) {
        keepRunning = false;
        try {
          const currentHistory = messageRepo.listBySession(this.sessionId);
          const lastMsg = currentHistory.length > 0 ? currentHistory[currentHistory.length - 1] : null;
          if (lastMsg && (lastMsg.role === 'tool' || (lastMsg.role === 'assistant' && !lastMsg.content))) {
            messageRepo.create({
              id: `msg_${Date.now()}_assistant`,
              session_id: this.sessionId,
              role: 'assistant',
              content: '[Proses dihentikan oleh pengguna]',
              created_at: Date.now(),
            });
          }
        } catch {}
        this.onEvent({ type: 'done', data: { status: 'STOPPED' } });
        return;
      }

      iteration++;

      // Check for automatic context compaction at the beginning of the turn
      if (iteration === 1) {
        try {
          const preHistory = messageRepo.listBySession(this.sessionId);
          const latestCompaction = compactionRepo.getLatestBySession(this.sessionId);
          const contextWindow = getModelContextWindow(session.model_id);
          const adaptiveThreshold = Math.floor(contextWindow * COMPACTION_CONSTANTS.DEFAULT_CONTEXT_RATIO);
          if (shouldAutoCompact(preHistory, adaptiveThreshold, latestCompaction, session.model_id)) {
            const compactedRecord = await runCompaction(this.sessionId, false);
            if (compactedRecord) {
              this.onEvent({
                type: 'compaction_completed',
                data: compactedRecord,
              });
            }
          }
        } catch (autoCompactErr) {
          console.error('Auto-compaction error (non-fatal):', autoCompactErr);
        }
      }

      // Retrieve full session message history
      const history = messageRepo.listBySession(this.sessionId);
      const openAiMessages = this.formatOpenAiMessages(
        history,
        commandMode,
        userGoal,
        targetSkillName,
        session.model_id
      );

      let fullContent = '';
      let fullReasoning = '';
      let currentToolCalls: Array<{
        id: string;
        name: string;
        arguments: string;
      }> = [];

      this.onEvent({
        type: 'tool_start',
        data: { status: 'THINKING', iteration },
      });

      let stream: any;
      const settings = loadSettings();
      // Ensure active MCP servers are connected
      await mcpClientManager.init();
      const eagerMcpTools = mcpClientManager.getEagerTools().map(formatMcpToolForOpenAi);
      const lazyMcpTools = mcpClientManager.getLazyTools();
      const activeToolsPayload: any[] = [...AGENT_TOOLS, ...eagerMcpTools];
      if (lazyMcpTools.length > 0) {
        activeToolsPayload.push(CALL_MCP_TOOL_DEF);
      }

      const requestPayload: any = {
        model: session.model_id || 'aidev-auto',
        messages: openAiMessages as any,
        tools: activeToolsPayload,
        stream: true,
      };
      const isReasoningModel = Boolean(
        session.model_id &&
          (session.model_id.startsWith('o1') ||
            session.model_id.startsWith('o3') ||
            session.model_id.includes('reasoner') ||
            session.model_id.includes('thinking'))
      );
      if (settings.reasoningEffort && isReasoningModel) {
        requestPayload.reasoning_effort = settings.reasoningEffort;
      }

      try {
        stream = await client.chat.completions.create(
          requestPayload,
          { signal: this.abortController.signal }
        );
      } catch (err: any) {
        if (this.isAborted || err.name === 'AbortError') {
          keepRunning = false;
          this.onEvent({ type: 'done', data: { status: 'STOPPED' } });
          return;
        }

        let retrySuccess = false;
        // Retry without reasoning_effort if provider rejected that specific parameter
        if (requestPayload.reasoning_effort && err.message && (err.message.includes('reasoning') || err.status === 400)) {
          delete requestPayload.reasoning_effort;
          try {
            stream = await client.chat.completions.create(
              requestPayload,
              { signal: this.abortController.signal }
            );
            retrySuccess = true;
          } catch (retryErr: any) {
            err = retryErr;
          }
        }

        if (!retrySuccess) {
          // Fallback without tools if the model doesn't support tools parameter
          if (
            err.message &&
            (err.message.includes('tools') ||
              err.message.includes('tool_calls') ||
              err.message.includes('function'))
          ) {
            try {
              stream = await client.chat.completions.create(
                {
                  model: session.model_id || 'aidev-auto',
                  messages: openAiMessages as any,
                  stream: true,
                },
                { signal: this.abortController.signal }
              );
            } catch (fallbackErr: any) {
              if (this.isAborted || fallbackErr.name === 'AbortError') {
                keepRunning = false;
                this.onEvent({ type: 'done', data: { status: 'STOPPED' } });
                return;
              }
              throw fallbackErr;
            }
          } else {
            throw err;
          }
        }
      }

      let insideThinkTag = false;
      let tagBuffer = '';

      const processContentChunk = (chunkText: string) => {
        tagBuffer += chunkText;
        while (tagBuffer.length > 0) {
          if (!insideThinkTag) {
            const ltIdx = tagBuffer.indexOf('<');
            if (ltIdx === -1) {
              fullContent += tagBuffer;
              this.onEvent({
                type: 'content_delta',
                data: { text: tagBuffer, full: fullContent },
              });
              tagBuffer = '';
              break;
            }
            if (ltIdx > 0) {
              const textBefore = tagBuffer.slice(0, ltIdx);
              fullContent += textBefore;
              this.onEvent({
                type: 'content_delta',
                data: { text: textBefore, full: fullContent },
              });
              tagBuffer = tagBuffer.slice(ltIdx);
            }
            const lower = tagBuffer.toLowerCase();
            const matchedOpen = ['<think>', '<thinking>', '<thought>'].find((t) =>
              lower.startsWith(t)
            );
            if (matchedOpen) {
              insideThinkTag = true;
              tagBuffer = tagBuffer.slice(matchedOpen.length);
              if (tagBuffer.startsWith('\n')) {
                tagBuffer = tagBuffer.slice(1);
              }
              continue;
            }
            const isPrefix = ['<think>', '<thinking>', '<thought>'].some((t) =>
              t.startsWith(lower)
            );
            if (isPrefix && tagBuffer.length < 10) {
              break;
            }
            const char = tagBuffer.charAt(0);
            fullContent += char;
            this.onEvent({
              type: 'content_delta',
              data: { text: char, full: fullContent },
            });
            tagBuffer = tagBuffer.slice(1);
          } else {
            const ltIdx = tagBuffer.indexOf('<');
            if (ltIdx === -1) {
              fullReasoning += tagBuffer;
              this.onEvent({
                type: 'reasoning_delta',
                data: { text: tagBuffer, full: fullReasoning },
              });
              tagBuffer = '';
              break;
            }
            if (ltIdx > 0) {
              const textBefore = tagBuffer.slice(0, ltIdx);
              fullReasoning += textBefore;
              this.onEvent({
                type: 'reasoning_delta',
                data: { text: textBefore, full: fullReasoning },
              });
              tagBuffer = tagBuffer.slice(ltIdx);
            }
            const lower = tagBuffer.toLowerCase();
            const matchedClose = ['</think>', '</thinking>', '</thought>'].find((t) =>
              lower.startsWith(t)
            );
            if (matchedClose) {
              insideThinkTag = false;
              tagBuffer = tagBuffer.slice(matchedClose.length);
              if (tagBuffer.startsWith('\n')) {
                tagBuffer = tagBuffer.slice(1);
              }
              continue;
            }
            const isPrefix = ['</think>', '</thinking>', '</thought>'].some((t) =>
              t.startsWith(lower)
            );
            if (isPrefix && tagBuffer.length < 11) {
              break;
            }
            const char = tagBuffer.charAt(0);
            fullReasoning += char;
            this.onEvent({
              type: 'reasoning_delta',
              data: { text: char, full: fullReasoning },
            });
            tagBuffer = tagBuffer.slice(1);
          }
        }
      };

      try {
        for await (const chunk of stream) {
          if (this.isAborted) {
            break;
          }

          const delta = chunk.choices[0]?.delta as any;
          if (!delta) continue;

          // Capture native reasoning content (DeepSeek R1, Gemini via gateway, o1, etc.)
          const nativeReasoning = delta.reasoning_content || delta.reasoning || delta.thinking;
          if (nativeReasoning) {
            fullReasoning += nativeReasoning;
            this.onEvent({
              type: 'reasoning_delta',
              data: { text: nativeReasoning, full: fullReasoning },
            });
          }

          // Capture standard content and parse any embedded <think> / <thinking> / <thought> tags
          if (delta.content) {
            processContentChunk(delta.content);
          }

          // Capture streaming tool calls
          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              const index = tc.index;
              if (!currentToolCalls[index]) {
                currentToolCalls[index] = {
                  id: tc.id || `call_${Date.now()}_${index}`,
                  name: tc.function?.name || '',
                  arguments: '',
                };
              }
              if (tc.function?.name) {
                currentToolCalls[index].name = tc.function.name;
              }
              if (tc.function?.arguments) {
                currentToolCalls[index].arguments += tc.function.arguments;
              }
            }
          }
        }

        // Flush any buffered characters left at end of stream
        if (tagBuffer.length > 0) {
          if (insideThinkTag) {
            fullReasoning += tagBuffer;
            this.onEvent({
              type: 'reasoning_delta',
              data: { text: tagBuffer, full: fullReasoning },
            });
          } else {
            fullContent += tagBuffer;
            this.onEvent({
              type: 'content_delta',
              data: { text: tagBuffer, full: fullContent },
            });
          }
          tagBuffer = '';
        }
      } catch (streamErr: any) {
        if (!this.isAborted && streamErr.name !== 'AbortError') {
          throw streamErr;
        }
      }

      // Fallback: If no structured tool_calls were emitted by the API, check if model outputted inline text tool calls
      if (currentToolCalls.length === 0 && fullContent) {
        const inlineResult = parseInlineToolCalls(fullContent);
        if (inlineResult.toolCalls.length > 0) {
          for (let i = 0; i < inlineResult.toolCalls.length; i++) {
            currentToolCalls[i] = inlineResult.toolCalls[i];
          }
          fullContent = inlineResult.cleanContent;
          this.onEvent({
            type: 'content_delta',
            data: { text: '', full: fullContent },
          });
        }
      }

      // If user interrupted during LLM generation: save whatever partial text was generated and exit immediately!
      if (this.isAborted) {
        if (fullContent || fullReasoning) {
          const assistantMsgId = `msg_${Date.now()}_assistant`;
          messageRepo.create({
            id: assistantMsgId,
            session_id: this.sessionId,
            role: 'assistant',
            content: fullContent || null,
            reasoning_content: fullReasoning || null,
            tool_call_id: null,
            tool_name: null,
            tool_arguments: null,
            created_at: Date.now(),
          });
        }
        keepRunning = false;
        this.onEvent({ type: 'done', data: { status: 'STOPPED' } });
        return;
      }

      // Extract effectiveGoal if not provided
      let effectiveGoal = userGoal;
      if (!effectiveGoal || effectiveGoal.trim() === '' || effectiveGoal.includes('Plan approved')) {
        try {
          const chatStorage = ensureChatStorageInitialized(session.project_id, this.sessionId);
          const metaPath = path.join(chatStorage.artifacts, '.metadata.json');
          if (fs.existsSync(metaPath)) {
            const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
            if (meta['implementation_plan.md']?.title) {
              effectiveGoal = meta['implementation_plan.md'].title.replace(/^Implementation Plan:\s*/i, '').trim();
            } else if (meta['walkthrough.md']?.title) {
              effectiveGoal = meta['walkthrough.md'].title.replace(/^Walkthrough:\s*/i, '').trim();
            }
          }
        } catch {}
      }

      if (!effectiveGoal || effectiveGoal.trim() === '' || effectiveGoal.includes('Plan approved')) {
        const goalMatch = fullContent.match(/Implementation Plan:\s*([^\n\r]+)/i) ||
                          fullContent.match(/Goal Description[^\n\r]*\n+([^\n\r]+)/i) ||
                          fullContent.match(/Walkthrough:\s*([^\n\r]+)/i);
        if (goalMatch && goalMatch[1]) {
          effectiveGoal = goalMatch[1].replace(/^#+\s*/, '').trim();
        } else {
          effectiveGoal = session.title && session.title !== 'New Coding Session' ? session.title : 'Task Implementation';
        }
      }

      const hasPlanHeader =
        /Implementation Plan/i.test(fullContent) ||
        /(?:^|\n)#+\s*Plan/i.test(fullContent) ||
        fullContent.includes('implementation_plan.md');

      const hasPlanStructure =
        /Goal Description/i.test(fullContent) ||
        /Phase/i.test(fullContent) ||
        /Target Files/i.test(fullContent) ||
        /Proposed Changes/i.test(fullContent) ||
        /Verification Plan/i.test(fullContent) ||
        /User Review/i.test(fullContent) ||
        /Tahap\s*\d/i.test(fullContent) ||
        /Langkah\s*\d/i.test(fullContent) ||
        /Step\s*\d/i.test(fullContent);

      const isPlanResult =
        currentToolCalls.length === 0 &&
        ((isPlanRequest && (hasPlanHeader || hasPlanStructure || fullContent.length > 150)) ||
         (hasPlanHeader && hasPlanStructure));

      if (isPlanResult) {
        try {
          const chatStorage = ensureChatStorageInitialized(session.project_id, this.sessionId);
          const cleanPlan = fullContent.trim();

          // 1. Write implementation_plan.md directly to session artifacts
          fs.writeFileSync(path.join(chatStorage.artifacts, 'implementation_plan.md'), cleanPlan, 'utf-8');

          // 2. Update .metadata.json in artifacts directory for the Overview API
          const metaPath = path.join(chatStorage.artifacts, '.metadata.json');
          let metadata: Record<string, any> = {};
          if (fs.existsSync(metaPath)) {
            try {
              metadata = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
            } catch {}
          }
          metadata['implementation_plan.md'] = {
            title: `Implementation Plan: ${effectiveGoal}`,
            updatedAt: Date.now(),
          };
          fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2), 'utf-8');
        } catch (err) {
          console.error('Failed saving implementation_plan.md artifact:', err);
        }

        this.onEvent({
          type: 'plan_created',
          data: {
            sessionId: this.sessionId,
            planMarkdown: fullContent,
            goal: effectiveGoal,
          },
        });
      }

      // Record Assistant message (store concise notification for plan turns so room chat is never flooded)
      const assistantMsgId = `msg_${Date.now()}_assistant`;
      const cleanContent = fullContent.replace(/^\s*\n+/, '').trimEnd();
      const savedContent = isPlanResult
        ? `I have generated the implementation plan for **${effectiveGoal}**. The plan has been opened in the sidebar (\`implementation_plan.md\`) for review.`
        : (cleanContent || null);

      messageRepo.create({
        id: assistantMsgId,
        session_id: this.sessionId,
        role: 'assistant',
        content: savedContent,
        reasoning_content: fullReasoning || null,
        tool_call_id: currentToolCalls.length > 0 ? currentToolCalls[0].id : null,
        tool_name: currentToolCalls.length > 0 ? currentToolCalls[0].name : null,
        tool_arguments: currentToolCalls.length > 0 ? JSON.stringify(currentToolCalls) : null,
        created_at: Date.now(),
      });

      this.onEvent({
        type: 'assistant_message_committed',
        data: {
          id: assistantMsgId,
          sessionId: this.sessionId,
          content: savedContent,
          reasoning_content: fullReasoning || null,
          hasMoreTools: currentToolCalls.length > 0,
        },
      });

      // If no tool calls, turn is finished
      if (currentToolCalls.length === 0) {
        if (!isPlanResult && !this.isAborted && cleanContent.length > 0) {
          try {
            const turnHistory = messageRepo.listBySession(this.sessionId);
            let lastUserIdx = -1;
            for (let i = turnHistory.length - 1; i >= 0; i--) {
              if (turnHistory[i].role === 'user') {
                lastUserIdx = i;
                break;
              }
            }
            const currentTurnMsgs = lastUserIdx >= 0 ? turnHistory.slice(lastUserIdx + 1) : turnHistory;
            const todoToolNames = new Set([
              'update_todos',
              'update_todo',
              'todo_write',
              'manage_tasks',
              'todos',
              'tasks',
            ]);
            for (let i = currentTurnMsgs.length - 1; i >= 0; i--) {
              const m = currentTurnMsgs[i];
              if (m.role === 'tool' && todoToolNames.has((m.tool_name || '').toLowerCase())) {
                let argsObj: any = null;
                let resObj: any = null;
                try {
                  if (m.tool_arguments) argsObj = JSON.parse(m.tool_arguments);
                } catch {}
                try {
                  if (m.tool_result) resObj = JSON.parse(m.tool_result);
                } catch {}

                const markAllCompleted = (arr: any[]) =>
                  arr.map((item: any) =>
                    typeof item === 'object' && item !== null
                      ? { ...item, status: 'completed' }
                      : item
                  );

                let changed = false;
                if (argsObj && Array.isArray(argsObj.todos)) {
                  if (argsObj.todos.some((t: any) => t?.status !== 'completed')) {
                    argsObj.todos = markAllCompleted(argsObj.todos);
                    changed = true;
                  }
                } else if (argsObj && Array.isArray(argsObj.tasks)) {
                  if (argsObj.tasks.some((t: any) => t?.status !== 'completed')) {
                    argsObj.tasks = markAllCompleted(argsObj.tasks);
                    changed = true;
                  }
                }
                if (resObj && Array.isArray(resObj.todos)) {
                  if (resObj.todos.some((t: any) => t?.status !== 'completed')) {
                    resObj.todos = markAllCompleted(resObj.todos);
                    changed = true;
                  }
                } else if (resObj && Array.isArray(resObj.tasks)) {
                  if (resObj.tasks.some((t: any) => t?.status !== 'completed')) {
                    resObj.tasks = markAllCompleted(resObj.tasks);
                    changed = true;
                  }
                }

                if (changed) {
                  const updatedArgsStr = argsObj ? JSON.stringify(argsObj) : m.tool_arguments;
                  const updatedResObj = resObj || argsObj;
                  const updatedResStr = updatedResObj ? JSON.stringify(updatedResObj) : m.tool_result;
                  messageRepo.update(m.id, {
                    tool_arguments: updatedArgsStr || undefined,
                    tool_result: updatedResStr || undefined,
                    content: updatedResStr || undefined,
                    status: 'COMPLETED',
                  });
                  this.onEvent({
                    type: 'tool_completed',
                    data: {
                      messageId: m.id,
                      toolCallId: m.tool_call_id || `todo_done_${Date.now()}`,
                      toolName: m.tool_name || 'update_todos',
                      arguments: argsObj,
                      result: updatedResObj,
                      durationMs: 0,
                      status: 'COMPLETED',
                    },
                  });
                }
                break;
              }
            }
          } catch {}
        }

        keepRunning = false;
        this.onEvent({ type: 'done', data: { status: 'COMPLETED' } });
        break;
      }

      if (this.isAborted) {
        keepRunning = false;
        this.onEvent({ type: 'done', data: { status: 'STOPPED' } });
        return;
      }

      // Execute each tool call
      for (const tc of currentToolCalls) {
        if (this.isAborted) {
          keepRunning = false;
          this.onEvent({ type: 'done', data: { status: 'STOPPED' } });
          return;
        }
        let parsedArgs: any = {};
        try {
          parsedArgs = JSON.parse(tc.arguments || '{}');
        } catch {
          parsedArgs = { raw: tc.arguments };
        }

        // Handle Interactive Question Card for /plan or Clarifications
        if (tc.name === 'ask_question') {
          const pendingMsgId = `msg_${Date.now()}_tool_${tc.id}`;
          messageRepo.create({
            id: pendingMsgId,
            session_id: this.sessionId,
            role: 'tool',
            content: null,
            tool_call_id: tc.id,
            tool_name: tc.name,
            tool_arguments: JSON.stringify(parsedArgs),
            status: 'PENDING_QUESTION',
            created_at: Date.now(),
          });

          this.onEvent({
            type: 'question_required',
            data: {
              toolCallId: tc.id,
              messageId: pendingMsgId,
              question: parsedArgs.question || 'Select one of the following options:',
              options: Array.isArray(parsedArgs.options) ? parsedArgs.options : [],
              allowCustom: parsedArgs.allowCustom !== false,
            },
          });

          // Stop loop and wait for user's interactive response
          keepRunning = false;
          return;
        }

        const mcpFound = mcpClientManager.findTool(tc.name);
        const isMcpCall = Boolean(mcpFound || tc.name === 'call_mcp_tool');
        const mcpServerName = mcpFound?.serverName || parsedArgs.server_name || parsedArgs.serverName || '';
        const mcpServerConfig = mcpServerName ? mcpClientManager.loadConfig().mcpServers?.[mcpServerName] : undefined;

        // Evaluate Permission
        const actionType: ActionType =
          tc.name === 'run_command'
            ? 'COMMAND'
            : tc.name === 'apply_patch' || tc.name === 'write_file'
            ? 'FILE_WRITE'
            : 'READ';

        const targetResource = parsedArgs.path || parsedArgs.command || tc.name;
        const effectiveMode =
          this.isTurnApproved || session.permission_mode === 'AUTO' || session.permission_mode === 'FULL_ACCESS'
            ? 'AUTO'
            : session.permission_mode;

        const currentSettings = loadSettings();
        let permCheck = evaluatePermission(
          effectiveMode,
          actionType,
          targetResource,
          currentSettings.projectLocalPermissions
        );

        if (isMcpCall && mcpServerConfig?.autoApprove) {
          permCheck = { allowed: true, requiresConfirmation: false };
        } else if (isMcpCall && effectiveMode === 'ASK') {
          permCheck = {
            allowed: true,
            requiresConfirmation: true,
            reason: `Execute MCP tool [${mcpServerName}] ${mcpFound?.tool.name || parsedArgs.tool_name || tc.name}`,
          };
        }

        if (!permCheck.allowed) {
          // Blocked by system guard (blacklist or traversal)
          const blockedResult = JSON.stringify({ error: permCheck.reason || 'Action blocked by safety policy' });
          const toolMsgId = `msg_${Date.now()}_tool_${tc.id}`;
          messageRepo.create({
            id: toolMsgId,
            session_id: this.sessionId,
            role: 'tool',
            content: blockedResult,
            tool_call_id: tc.id,
            tool_name: tc.name,
            tool_arguments: JSON.stringify(parsedArgs),
            tool_result: blockedResult,
            status: 'FAILED',
            created_at: Date.now(),
          });
          continue;
        }

        if (permCheck.requiresConfirmation) {
          // Pause execution and ask user for confirmation via UI card
          const pendingMsgId = `msg_${Date.now()}_tool_${tc.id}`;
          messageRepo.create({
            id: pendingMsgId,
            session_id: this.sessionId,
            role: 'tool',
            content: null,
            tool_call_id: tc.id,
            tool_name: tc.name,
            tool_arguments: JSON.stringify(parsedArgs),
            status: 'PENDING_PERMISSION',
            created_at: Date.now(),
          });

          this.onEvent({
            type: 'permission_required',
            data: {
              toolCallId: tc.id,
              messageId: pendingMsgId,
              toolName: tc.name,
              arguments: parsedArgs,
              actionType,
              targetResource,
              reason: permCheck.reason,
              mode: session.permission_mode,
            },
          });

          // Stop loop until user explicitly responds to permission
          keepRunning = false;
          return;
        }

        // Action is allowed automatically: execute tool
        this.onEvent({
          type: 'tool_start',
          data: { toolCallId: tc.id, toolName: tc.name, arguments: parsedArgs },
        });

        const startTime = Date.now();
        let toolOutput: any;
        let toolStatus = 'COMPLETED';

        try {
          toolOutput = await dispatchToolCall(
            tc.name,
            parsedArgs,
            this.workdir,
            this.sessionId,
            assistantMsgId,
            this.onEvent
          );
        } catch (err: any) {
          toolStatus = 'FAILED';
          toolOutput = { error: err.message };
        }

        const durationMs = Date.now() - startTime;
        const stringifiedResult = typeof toolOutput === 'string' ? toolOutput : JSON.stringify(toolOutput);

        const toolMsgId = `msg_${Date.now()}_tool_${tc.id}`;
        messageRepo.create({
          id: toolMsgId,
          session_id: this.sessionId,
          role: 'tool',
          content: stringifiedResult,
          tool_call_id: tc.id,
          tool_name: tc.name,
          tool_arguments: JSON.stringify(parsedArgs),
          tool_result: stringifiedResult,
          status: toolStatus,
          created_at: Date.now(),
        });

        // Record audit
        auditRepo.record({
          id: `audit_${Date.now()}_${tc.id}`,
          session_id: this.sessionId,
          action_type: actionType === 'COMMAND' ? 'COMMAND' : 'FILE_WRITE',
          target_resource: targetResource,
          decision: 'AUTO_ALLOWED',
          created_at: Date.now(),
        });

        this.onEvent({
          type: 'tool_completed',
          data: {
            messageId: toolMsgId,
            toolCallId: tc.id,
            toolName: tc.name,
            arguments: parsedArgs,
            result: toolOutput,
            durationMs,
            status: toolStatus,
          },
        });

        // If file was changed, emit FILE_CHANGED event
        if (tc.name === 'apply_patch' || tc.name === 'write_file') {
          if (toolOutput?.success) {
            this.onEvent({
              type: 'file_changed',
              data: {
                path: toolOutput.path,
                additions: toolOutput.additions || 0,
                deletions: toolOutput.deletions || 0,
                snapshotId: toolOutput.snapshotId,
              },
            });

            // Universal Living Walkthrough Tracker Hook
            try {
              const chatStorage = ensureChatStorageInitialized(session.project_id, this.sessionId);
              const wtPath = path.join(chatStorage.artifacts, 'walkthrough.md');
              const changedFilePath = (toolOutput.path || parsedArgs.path || '').replace(/\\/g, '/');

              if (changedFilePath === 'walkthrough.md' || changedFilePath.endsWith('/walkthrough.md')) {
                this.onEvent({
                  type: 'file_changed',
                  data: {
                    path: 'walkthrough.md',
                    additions: toolOutput.additions || 0,
                    deletions: toolOutput.deletions || 0,
                  },
                });
              } else if (!fs.existsSync(wtPath) && !changedFilePath.startsWith('.aidev')) {
                const initialContent = `# Walkthrough: ${effectiveGoal}\n\n## Summary of Changes\nInitiated execution for **${effectiveGoal}**.\n\n### Changes Made & Task Checklist\n- [x] Initialized changes on \`${changedFilePath}\`\n- [ ] Implement remaining logic & updates\n- [ ] Verify build and tests\n\n### Modified Files\n- \`${changedFilePath}\`\n\n## Verification Results\n*(Pending verification)*\n`;
                fs.writeFileSync(wtPath, initialContent, 'utf-8');

                const metaPath = path.join(chatStorage.artifacts, '.metadata.json');
                let metadata: Record<string, any> = {};
                if (fs.existsSync(metaPath)) {
                  try { metadata = JSON.parse(fs.readFileSync(metaPath, 'utf-8')); } catch {}
                }
                metadata['walkthrough.md'] = {
                  title: `Walkthrough: ${effectiveGoal}`,
                  updatedAt: Date.now(),
                };
                fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2), 'utf-8');
              }
            } catch (wtErr) {
              console.error('Failed syncing living walkthrough.md:', wtErr);
            }
          }
        }

        // If background task was started, emit task_started event
        if (toolOutput?.isBackground && toolOutput?.taskId) {
          this.onEvent({
            type: 'task_started',
            data: {
              taskId: toolOutput.taskId,
              command: toolOutput.command || parsedArgs.command,
              status: 'RUNNING',
              timestamp: Date.now(),
            },
          });
        }
      }
    }

    // Ensure the AI always concludes with a conversational response to the user.
    // If the turn ended after executing tools without a concluding assistant message (or hit maxIterations):
    const latestHistory = messageRepo.listBySession(this.sessionId);
    const lastMessage = latestHistory.length > 0 ? latestHistory[latestHistory.length - 1] : null;

    if (
      !this.isAborted &&
      lastMessage &&
      (lastMessage.role === 'tool' || (lastMessage.role === 'assistant' && !lastMessage.content))
    ) {
      this.onEvent({
        type: 'tool_start',
        data: { status: 'SUMMARIZING', iteration: iteration + 1 },
      });

      try {
        const finalOpenAiMessages = this.formatOpenAiMessages(
          latestHistory,
          commandMode,
          userGoal,
          targetSkillName,
          session.model_id
        );

        finalOpenAiMessages.push({
          role: 'user',
          content:
            '[System Directive]: All tool operations for this turn have finished. Do NOT call any more tools. Please provide a clear, conversational concluding response directly to the user in their language (Indonesian/English). Summarize what actions you performed, files modified or created, background tasks or servers started, and instructions on how the user can test or proceed.',
        });

        await mcpClientManager.init();
        const eagerMcpTools = mcpClientManager.getEagerTools().map(formatMcpToolForOpenAi);
        const lazyMcpTools = mcpClientManager.getLazyTools();
        const activeToolsPayload: any[] = [...AGENT_TOOLS, ...eagerMcpTools];
        if (lazyMcpTools.length > 0) {
          activeToolsPayload.push(CALL_MCP_TOOL_DEF);
        }

        const finalStream = await client.chat.completions.create(
          {
            model: session.model_id || 'aidev-auto',
            messages: finalOpenAiMessages as any,
            tools: activeToolsPayload,
            tool_choice: 'none',
            stream: true,
          },
          { signal: this.abortController.signal }
        );

        let finalContent = '';
        for await (const chunk of finalStream) {
          if (this.isAborted) break;
          const delta = chunk.choices[0]?.delta;
          if (delta?.content) {
            finalContent += delta.content;
            this.onEvent({
              type: 'content_delta',
              data: { text: delta.content, full: finalContent },
            });
          }
        }

        const trimmed = finalContent.trim();
        if (trimmed) {
          const finalMsgId = `msg_${Date.now()}_assistant`;
          messageRepo.create({
            id: finalMsgId,
            session_id: this.sessionId,
            role: 'assistant',
            content: trimmed,
            created_at: Date.now(),
          });
          this.onEvent({
            type: 'assistant_message_committed',
            data: {
              id: finalMsgId,
              sessionId: this.sessionId,
              content: trimmed,
              hasMoreTools: false,
            },
          });
        } else {
          const fallbackMsgId = `msg_${Date.now()}_assistant`;
          const fallbackText =
            'Tool execution completed. Please review the file changes above or provide the next instruction.';
          messageRepo.create({
            id: fallbackMsgId,
            session_id: this.sessionId,
            role: 'assistant',
            content: fallbackText,
            created_at: Date.now(),
          });
          this.onEvent({
            type: 'assistant_message_committed',
            data: {
              id: fallbackMsgId,
              sessionId: this.sessionId,
              content: fallbackText,
              hasMoreTools: false,
            },
          });
        }
      } catch (finalErr: any) {
        if (!this.isAborted) {
          console.error('Failed generating concluding summary:', finalErr);
          const fallbackMsgId = `msg_${Date.now()}_assistant`;
          const fallbackText =
            'Tool execution completed. Please review the file changes above or provide the next instruction.';
          messageRepo.create({
            id: fallbackMsgId,
            session_id: this.sessionId,
            role: 'assistant',
            content: fallbackText,
            created_at: Date.now(),
          });
          this.onEvent({
            type: 'assistant_message_committed',
            data: {
              id: fallbackMsgId,
              sessionId: this.sessionId,
              content: fallbackText,
              hasMoreTools: false,
            },
          });
        }
      }
    }

    this.onEvent({ type: 'done', data: { status: 'COMPLETED' } });
  }

  /**
   * Resumes a tool execution after user grants approval.
   */
  public async resumeWithPermission(
    toolCallId: string,
    decision: 'APPROVED' | 'REJECTED',
    alwaysAllow = false
  ): Promise<void> {
    const session = sessionRepo.getById(this.sessionId);
    if (!session) throw new Error(`Session ${this.sessionId} not found`);

    if (decision === 'APPROVED') {
      this.isTurnApproved = true;
      if (alwaysAllow) {
        sessionRepo.update(this.sessionId, { permission_mode: 'AUTO' });
        session.permission_mode = 'AUTO';
      }
    }

    const history = messageRepo.listBySession(this.sessionId);

    // If approved, mark any other pending permission messages in this session as resolved
    // so they never resurrect or trap the user in an endless popup loop
    if (decision === 'APPROVED') {
      for (const m of history) {
        if (m.status === 'PENDING_PERMISSION' && m.tool_call_id !== toolCallId) {
          messageRepo.update(m.id, {
            status: 'COMPLETED',
            tool_result: JSON.stringify({ status: 'auto_approved_in_batch' }),
            content: JSON.stringify({ status: 'auto_approved_in_batch' }),
          });
        }
      }
    }

    const pendingMsg = history.find(m => m.tool_call_id === toolCallId && m.status === 'PENDING_PERMISSION');
    if (!pendingMsg) {
      // If already resolved by a prior batch approval, return cleanly without throwing error
      return;
    }

    const parsedArgs = JSON.parse(pendingMsg.tool_arguments || '{}');
    const toolName = pendingMsg.tool_name || '';

    // Extract userGoal and commandMode from recent message history
    let commandMode: 'plan' | 'test' | 'review' | 'browser' | 'skill' | null = null;
    let userGoal = '';
    const lastUserMsg = [...history].reverse().find(m => m.role === 'user');
    if (lastUserMsg && lastUserMsg.content) {
      let textContent = lastUserMsg.content;
      if (textContent.startsWith('[')) {
        try {
          const parsed = JSON.parse(textContent);
          if (Array.isArray(parsed)) {
            const textPart = parsed.find((p: any) => p.type === 'text');
            if (textPart?.text) textContent = textPart.text;
          }
        } catch {}
      }
      const trimmed = textContent.trim();
      if (trimmed.startsWith('/plan')) {
        commandMode = 'plan';
        userGoal = trimmed.substring(5).trim() || 'Implementation Plan';
      } else if (trimmed.startsWith('/test')) {
        commandMode = 'test';
        userGoal = trimmed.substring(5).trim() || 'Run project automated tests and verify suites';
      } else if (trimmed.startsWith('/review')) {
        commandMode = 'review';
        userGoal = trimmed.substring(7).trim() || 'Perform rigorous code review and git diff audit';
      } else if (trimmed.startsWith('/browser')) {
        commandMode = 'browser';
        userGoal = trimmed.substring(8).trim() || 'Open Chrome DevTools browser to inspect page';
      } else {
        userGoal = textContent;
      }
    }

    if (decision === 'REJECTED') {
      const rejectResult = JSON.stringify({ error: 'User rejected permission to execute this action.' });
      messageRepo.update(pendingMsg.id, {
        status: 'FAILED',
        tool_result: rejectResult,
        content: rejectResult,
      });

      auditRepo.record({
        id: `audit_${Date.now()}_${toolCallId}`,
        session_id: this.sessionId,
        action_type: toolName === 'run_command' ? 'COMMAND' : 'FILE_WRITE',
        target_resource: parsedArgs.path || parsedArgs.command || toolName,
        decision: 'REJECTED',
        created_at: Date.now(),
      });

      this.onEvent({
        type: 'tool_completed',
        data: {
          toolCallId,
          toolName,
          result: { error: 'Rejected by user' },
          durationMs: 0,
          status: 'FAILED',
        },
      });

      // Resume LLM loop with the rejection message
      await this.executeLoop(session, commandMode, userGoal);
      return;
    }

    // APPROVED: Execute tool
    this.onEvent({
      type: 'tool_start',
      data: { toolCallId, toolName, arguments: parsedArgs },
    });

    const startTime = Date.now();
    let toolOutput: any;
    let toolStatus = 'COMPLETED';

    try {
      toolOutput = await dispatchToolCall(
        toolName,
        parsedArgs,
        this.workdir,
        this.sessionId,
        pendingMsg.id,
        this.onEvent
      );
    } catch (err: any) {
      toolStatus = 'FAILED';
      toolOutput = { error: err.message };
    }

    const durationMs = Date.now() - startTime;
    const stringifiedResult = typeof toolOutput === 'string' ? toolOutput : JSON.stringify(toolOutput);

    messageRepo.update(pendingMsg.id, {
      status: toolStatus,
      tool_result: stringifiedResult,
      content: stringifiedResult,
    });

    auditRepo.record({
      id: `audit_${Date.now()}_${toolCallId}`,
      session_id: this.sessionId,
      action_type: toolName === 'run_command' ? 'COMMAND' : 'FILE_WRITE',
      target_resource: parsedArgs.path || parsedArgs.command || toolName,
      decision: 'APPROVED',
      created_at: Date.now(),
    });

    this.onEvent({
      type: 'tool_completed',
      data: {
        toolCallId,
        toolName,
        result: toolOutput,
        durationMs,
        status: toolStatus,
      },
    });

    if (toolName === 'apply_patch' || toolName === 'write_file') {
      if (toolOutput?.success && !toolOutput?.isArtifact) {
        this.onEvent({
          type: 'file_changed',
          data: {
            path: toolOutput.path,
            additions: toolOutput.additions || 0,
            deletions: toolOutput.deletions || 0,
            snapshotId: toolOutput.snapshotId,
          },
        });
      }
    }

    if (toolOutput?.isBackground && toolOutput?.taskId) {
      this.onEvent({
        type: 'task_started',
        data: {
          taskId: toolOutput.taskId,
          command: toolOutput.command || parsedArgs.command,
          status: 'RUNNING',
          timestamp: Date.now(),
        },
      });
    }

    // Continue loop
    try {
      await this.executeLoop(session, commandMode, userGoal);
    } catch (err: any) {
      if (!this.isAborted) {
        logAgent(`Error during turn resumption in session ${this.sessionId}:`, err.message);
        const errMsg = err.message || 'Error during turn resumption';
        const errRecord: MessageRecord = {
          id: `msg_${Date.now()}_error`,
          session_id: this.sessionId,
          role: 'assistant',
          content: errMsg,
          status: 'ERROR',
          created_at: Date.now(),
        };
        try {
          messageRepo.create(errRecord);
        } catch (dbErr) {
          logAgent(`Failed saving error message to database in session ${this.sessionId}:`, dbErr);
        }
        this.onEvent({
          type: 'error',
          data: { message: errMsg, messageId: errRecord.id },
        });
        this.onEvent({
          type: 'done',
          data: { status: 'ERROR' },
        });
      }
    }
  }

  /**
   * Resumes tool execution after user answers an interactive clarification question.
   */
  public async resumeWithAnswer(
    toolCallId: string,
    answer: string
  ): Promise<void> {
    activeOrchestrators.set(this.sessionId, this);
    const session = sessionRepo.getById(this.sessionId);
    if (!session) {
      activeOrchestrators.delete(this.sessionId);
      throw new Error(`Session ${this.sessionId} not found`);
    }

    const history = messageRepo.listBySession(this.sessionId);
    const pendingMsg = history.find(
      (m) => m.tool_call_id === toolCallId && m.status === 'PENDING_QUESTION'
    );
    if (!pendingMsg) {
      return;
    }

    // Mark pending question tool message as COMPLETED with the answer
    const resultStr = JSON.stringify({ answer });
    messageRepo.update(pendingMsg.id, {
      status: 'COMPLETED',
      tool_result: resultStr,
      content: answer,
    });

    this.onEvent({
      type: 'tool_completed',
      data: {
        toolCallId,
        toolName: 'ask_question',
        result: { answer },
        durationMs: 0,
        status: 'COMPLETED',
      },
    });

    // Extract userGoal and commandMode from recent message history
    let commandMode: 'plan' | 'test' | 'review' | 'browser' | 'skill' | null = null;
    let userGoal = '';
    const lastUserMsg = [...history].reverse().find((m) => m.role === 'user');
    if (lastUserMsg && lastUserMsg.content) {
      let textContent = lastUserMsg.content;
      if (textContent.startsWith('[')) {
        try {
          const parsed = JSON.parse(textContent);
          if (Array.isArray(parsed)) {
            const textPart = parsed.find((p: any) => p.type === 'text');
            if (textPart?.text) textContent = textPart.text;
          }
        } catch {}
      }
      const trimmed = textContent.trim();
      if (trimmed.startsWith('/plan')) {
        commandMode = 'plan';
        userGoal = trimmed.substring(5).trim() || 'Implementation Plan';
      } else if (trimmed.startsWith('/test')) {
        commandMode = 'test';
        userGoal = trimmed.substring(5).trim() || 'Run project automated tests and verify suites';
      } else if (trimmed.startsWith('/review')) {
        commandMode = 'review';
        userGoal = trimmed.substring(7).trim() || 'Perform rigorous code review and git diff audit';
      } else if (trimmed.startsWith('/browser')) {
        commandMode = 'browser';
        userGoal = trimmed.substring(8).trim() || 'Open Chrome DevTools browser to inspect page';
      } else {
        userGoal = textContent;
      }
    }

    try {
      await this.executeLoop(session, commandMode, userGoal);
    } catch (err: any) {
      if (!this.isAborted) {
        logAgent(`Error during question resumption in session ${this.sessionId}:`, err.message);
        const errMsg = err.message || 'Error during question resumption';
        const errRecord: MessageRecord = {
          id: `msg_${Date.now()}_error`,
          session_id: this.sessionId,
          role: 'assistant',
          content: errMsg,
          status: 'ERROR',
          created_at: Date.now(),
        };
        try {
          messageRepo.create(errRecord);
        } catch (dbErr) {
          logAgent(`Failed saving error message to database in session ${this.sessionId}:`, dbErr);
        }
        this.onEvent({
          type: 'error',
          data: { message: errMsg, messageId: errRecord.id },
        });
        this.onEvent({
          type: 'done',
          data: { status: 'ERROR' },
        });
      }
    } finally {
      activeOrchestrators.delete(this.sessionId);
    }
  }

  /**
   * Cancels an interactive clarification question and aborts the ongoing plan session.
   */
  public async cancelQuestion(toolCallId: string): Promise<void> {
    activeOrchestrators.delete(this.sessionId);
    const session = sessionRepo.getById(this.sessionId);
    if (!session) return;

    const history = messageRepo.listBySession(this.sessionId);
    const pendingMsg = history.find(
      (m) => m.tool_call_id === toolCallId && m.status === 'PENDING_QUESTION'
    );

    if (pendingMsg) {
      const cancelResult = JSON.stringify({
        status: 'cancelled',
        message: 'Plan and clarification session cancelled by user.',
      });
      messageRepo.update(pendingMsg.id, {
        status: 'FAILED',
        tool_result: cancelResult,
        content: cancelResult,
      });
    }

    messageRepo.create({
      id: `msg_${Date.now()}_cancel_plan`,
      session_id: this.sessionId,
      role: 'assistant',
      content: '*(Plan and clarification session was cancelled by user)*',
      created_at: Date.now(),
    });

    this.onEvent({
      type: 'tool_completed',
      data: {
        toolCallId,
        toolName: 'ask_question',
        result: { status: 'cancelled' },
        durationMs: 0,
        status: 'FAILED',
      },
    });

    this.onEvent({
      type: 'done',
      data: { status: 'CANCELLED' },
    });
  }

  private formatOpenAiMessages(
    history: MessageRecord[],
    commandModeInput: 'plan' | 'test' | 'review' | 'browser' | 'skill' | boolean | null = null,
    userGoal: string = '',
    targetSkillName?: string | null,
    modelId?: string | null
  ): any[] {
    const commandMode: 'plan' | 'test' | 'review' | 'browser' | 'skill' | null =
      commandModeInput === true ? 'plan' : commandModeInput === false ? null : commandModeInput;
    const isPlanRequest = commandMode === 'plan';
    const isTestRequest = commandMode === 'test';
    const isReviewRequest = commandMode === 'review';
    const isBrowserRequest = commandMode === 'browser';
    const isSkillRequest = commandMode === 'skill';

    const effectiveModelId = modelId || 'aidev-auto';
    const modelDisplayName = formatModelDisplayName(effectiveModelId);

    const availableSkills = scanAvailableSkills(this.workdir);
    const skillsPrompt = formatSkillsSystemPrompt(availableSkills);

    let activeSkillContext = '';
    if (isSkillRequest && targetSkillName) {
      const normalizedTarget = targetSkillName.toLowerCase().replace(/_/g, '-');
      const matchedSkill = availableSkills.find(
        (s) => s.name.toLowerCase().replace(/_/g, '-') === normalizedTarget
      );
      if (matchedSkill) {
        try {
          const skillMdPath = path.join(matchedSkill.path, 'SKILL.md');
          if (fs.existsSync(skillMdPath)) {
            const skillDoc = fs.readFileSync(skillMdPath, 'utf-8');
            activeSkillContext = `\nCURRENT TASK: SPECIALIZED SKILL ACTIVATION (/skill:${matchedSkill.name})\nYou have been explicitly invoked with skill: '${matchedSkill.name}'.\nSkill Source: ${skillMdPath}\n\nSkill Instructions from SKILL.md:\n${skillDoc}\n\nUser Request: ${userGoal || 'Follow the instructions of this skill and fulfill the request.'}\nAdhere strictly to the directives and workflow defined in the skill documentation above.\n`;
          }
        } catch (err) {
          console.error(`Failed reading skill instructions for ${targetSkillName}:`, err);
        }
      }
    }

    const mcpServers = mcpClientManager.getServersRuntime().filter((s) => s.status === 'CONNECTED');
    let mcpPrompt = '';
    if (mcpServers.length > 0) {
      mcpPrompt = '\n\nActive Model Context Protocol (MCP) Servers:';
      for (const s of mcpServers) {
        const eagerTools = s.tools.filter((t) => t.loadingMode === 'eager');
        const lazyTools = s.tools.filter((t) => t.loadingMode === 'lazy');
        mcpPrompt += `\n# Server: ${s.name} (${s.transport})`;
        if (eagerTools.length > 0) {
          mcpPrompt += `\nEager Tools (call directly as native functions):\n` + eagerTools.map((t) => `- ${t.prefixedName}: ${t.description || t.name}`).join('\n');
        }
        if (lazyTools.length > 0) {
          mcpPrompt += `\nLazy Tools (read schemas at ~/.aidev/mcp/${s.name}/<toolName>.json, call via 'call_mcp_tool'):\n` + lazyTools.map((t) => `- ${t.name}: ${t.description || t.name}`).join('\n');
        }
      }
    }

    const currentSettings = loadSettings();
    let languageDirective = '';
    if (currentSettings.responseLanguage === 'id') {
      languageDirective = `\n11. Language Directive:
   Always communicate, explain, and write responses in natural, friendly, and professional Indonesian (Bahasa Indonesia). Keep code snippets, function names, file paths, commands, and technical terms in English.`;
    } else if (currentSettings.responseLanguage === 'en') {
      languageDirective = `\n11. Language Directive:
   Always communicate, explain, and write responses in clear, concise, and professional English.`;
    } else {
      languageDirective = `\n11. Language Directive:
   Automatically detect and match the primary language used by the user in their prompt. If prompt is in Indonesian, reply in Indonesian; if English, reply in English.`;
    }

    const systemPrompt = `You are Aidev Desktop Coding Agent, an autonomous, production-ready coding assistant powered by ${modelDisplayName} (${effectiveModelId}).
Working directory: ${this.workdir}
Active Foundation Model: ${modelDisplayName} (model id: '${effectiveModelId}')

Capabilities & Rules:
1. You can inspect files using read_file, glob, and grep (search text or regex patterns across the codebase).
2. You can directly edit files using apply_patch (unified diffs with @@ hunks) or write_file. Every change is backed up with an automatic immutable snapshot.
3. You can execute shell commands headlessly using run_command.
4. For dev servers (e.g. npm run dev, node server.mjs, vite), background downloads, or test watchers, use run_command with background: true. They will be launched as managed background tasks and will not block your response.
5. Codebase Mapping: Use 'get_repo_map' for a token-efficient architectural map of classes, functions, and interfaces across the project. Use 'get_file_symbols' for an instant outline of a specific file.
6. Task Tracking: Proactively use 'update_todos' to maintain a live, interactive checklist of steps with statuses ('pending', 'in_progress', 'completed') during multi-step implementations.
7. Web Research: Use 'web_search' to query developer docs, tutorials, and latest library updates, and 'read_url' to read documentation pages cleanly converted to Markdown.
8. Instant Diagnostics: Use 'get_diagnostics' to immediately catch TypeScript/JavaScript syntax and typing errors on modified files, and 'find_references' to track symbol usages across the workspace.
9. Always explore the codebase first before modifying files.
10. Always provide a clear, helpful, and conversational text response after finishing tool executions. Never end your turn with only tool calls; always explain what was accomplished, what changed, and the current workspace status so the user is informed.
11. Living Walkthrough Progress Tracker:
   Whenever executing coding tasks (implementing new features, fixing bugs, updating existing features, or executing plans/PRDs):
   - You MUST maintain a living progress tracker file 'walkthrough.md' in artifacts (using write_file with path: 'walkthrough.md' or 'artifacts/walkthrough.md').
   - Keep it structured cleanly:
     # Walkthrough: <Title of Feature, Bug Fix, or Update>
     ## Summary of Changes
     Initiated execution for **Feature/Bug Fix/Update**.
     ### Changes Made & Task Checklist
     - [ ] ...
     ### Modified Files
     - \`path/to/file\`
     ## Verification Results
     - Details of verification steps
   - Keep updating walkthrough.md as work progresses.
8. Artifacts vs Workspace Code vs Uploads:
   - artifacts/ is for session artifacts: markdown documents (walkthrough.md, implementation_plan.md), interactive HTML widgets (Generative UI embeds), and tool-generated visual captures.
   - IMPORTANT: Artifacts are stored in the system's isolated session storage (~/.aidev/projects/.../artifacts/). They are NOT saved in the user's project codebase/workdir, and will NEVER pollute git history, diffs, or production builds.
   - uploads/ is strictly for media uploaded by the user in the chat.
9. Specialized Skills:
${skillsPrompt}
${activeSkillContext}10. Model Identity Awareness:
    You are running on the ${modelDisplayName} foundation model (ID: '${effectiveModelId}') selected by the user for this session. When asked what model you are, which model powers you, or who you are, state accurately that you are Aidev Desktop Coding Agent powered by ${modelDisplayName}.
11. Reasoning & Thought Process:
    Before calling tools or formulating solutions to complex questions, articulate your internal reasoning and step-by-step thinking inside <think>...</think> tags. This reasoning is automatically captured and presented in the collapsible Thought / Work Block in the UI. Keep your final output outside the tags clear, direct, and professional.
12. Model Context Protocol (MCP):
    You have access to tools from active MCP servers. Eager tools can be called directly as native functions. Lazy tools can be called using 'call_mcp_tool'. Always adhere to tool schemas.${mcpPrompt}
13. Screenshots & Visual Content:
    Whenever tools (such as chrome-devtools-mcp 'take_screenshot' or browser actions) capture images, they are automatically saved to session artifacts and assigned a clean media URL (/api/media?file=...&sessionId=...).
    CRITICAL: NEVER output, generate, or stream raw base64 image strings (e.g. data:image/png;base64,...). Streaming raw base64 is strictly forbidden because it wastes tokens and causes extreme latency. Always reference the image via its clean media URL or markdown link provided in the tool result: ![Screenshot](/api/media?file=...&sessionId=...).${languageDirective}
14. Tool Invocation & Direct Execution:
    - Whenever you need to investigate the codebase, run commands, fetch data, check diagnostics, update todos, or perform tasks, directly INVOKE the appropriate structured tools immediately.
    - NEVER respond with conversational commentary alone (e.g. saying "Saya akan menjalankan tool X...") without invoking the tool in that same turn! Always invoke the tool call directly.
    - NEVER write pseudo-code XML tags (such as <call to=functions...>, <call to=...>, or <function_call>) as plain text in your response.
    - If a task involves multiple sequential tool executions or a loop of commands, invoke the tool for the CURRENT step. The system executes it immediately and returns the real output to you in the subsequent turn so you can respond with the next action. Do not simulate or anticipate multiple tool steps in a single response text.

${
  isPlanRequest
    ? `\nCURRENT TASK: PLANNING MODE (/plan)
Goal: ${userGoal}
Analyze the codebase thoroughly using read-only tools (glob, grep, read_file).

IMPORTANT INTERACTIVE Q&A REQUIREMENT:
Before finalizing the implementation plan, if there are technical choices, architecture decisions, trade-offs, styling/library preferences, or ambiguities, you MUST ask the user questions using the 'ask_question' tool!
- Provide 2 to 3 clear candidate answers/options.
- Put your strongest, most recommended option at index 0 (the top).
- Do not make assumptions when multiple valid approaches exist.
- Wait for the user to answer via the interactive confirmation card.

Once all required clarifications are answered (or if the requirements are completely unequivocal), generate a structured Implementation Plan in Markdown.
The final plan will be automatically saved to artifacts as 'implementation_plan.md'. Structure it as:
# Implementation Plan: ${userGoal}
## 1. Goal Description
## 2. Target Files & Dependencies
## 3. Phase Breakdown
- [ ] Phase 1: ...
- [ ] Phase 2: ...
Do NOT write or patch any files until the user reviews and approves this plan.`
    : isTestRequest
    ? `\nCURRENT TASK: AUTOMATED TEST & VERIFICATION MODE (/test)
Target/Scope: ${userGoal}
1. Investigate the project structure and testing tools configured in this workspace (inspect package.json scripts, vitest.config.*, jest.config.*, playwright.config.*, pytest.ini, etc.).
2. Execute the appropriate automated test command using run_command (e.g. \`npm test\`, \`npx vitest run\`, \`npx jest\`, or user-specified test target).
3. Thoroughly analyze test failure outputs and error logs.
4. If tests fail, inspect the affected files, fix the root causes using apply_patch or write_file, and re-run tests to confirm resolution.
5. Record all executed commands, test results, pass/fail counts, and diagnostics in 'walkthrough.md'.
6. Present a concise, clear summary of test outcomes to the user.`
    : isReviewRequest
    ? `\nCURRENT TASK: RIGOROUS CODE REVIEW & AUDIT MODE (/review)
Scope/Focus: ${userGoal}
1. Use run_command to execute \`git status\` and \`git diff\` (or inspect recently modified files) to examine all uncommitted or recent changes.
2. Conduct an in-depth, rigorous code review evaluating:
   - Logic correctness, edge cases, error handling, and null safety
   - Security vulnerabilities (injection, XSS, insecure data exposure, auth, secret leaks)
   - Performance bottlenecks and resource leaks
   - Code cleanliness, typing precision, and architectural consistency
3. Provide a structured review report in chat:
   - Executive Summary (Verdict: Approve / Request Changes / Comment)
   - Critical & High Severity Issues (with line references and suggested fixes)
   - Minor Suggestions & Polish
   - Detailed Diff Analysis
4. Update 'walkthrough.md' with the code review summary.`
    : isBrowserRequest
    ? `\nCURRENT TASK: CHROME DEVTOOLS BROWSER AUTOMATION (/browser)
Scope/Goal: ${userGoal || 'Use Chrome DevTools MCP to inspect the page'}
Directives:
1. Prioritize using Chrome DevTools MCP tools (such as 'navigate_page', 'take_screenshot', 'evaluate_script', 'click', 'fill', 'list_pages', 'list_console_messages', etc. via 'call_mcp_tool' with server_name: 'chrome-devtools-mcp' or native eager tools).
2. If the user provided a URL or asks to inspect a page:
   - Use 'navigate_page' to open the page.
   - Use 'evaluate_script' to inspect elements, DOM structure, or styles.
   - Use 'take_screenshot' to capture visual state.
   - Use 'list_console_messages' to inspect console logs or errors if debugging.
3. Screenshots are automatically saved to session artifacts and rendered cleanly in the chat. Do not stream raw base64 data.
4. Report your inspection results, observations, console errors (if any), and actions clearly in natural Indonesian (Bahasa Indonesia).`
    : ''
}`;

    let activePlanContext = '';
    let activeWalkthroughContext = '';
    try {
      const session = sessionRepo.getById(this.sessionId);
      if (session) {
        const chatStorage = ensureChatStorageInitialized(session.project_id, this.sessionId);
        const planPath = path.join(chatStorage.artifacts, 'implementation_plan.md');
        if (fs.existsSync(planPath)) {
          const planText = fs.readFileSync(planPath, 'utf-8');
          if (planText.trim()) {
            activePlanContext = `\n\nActive Implementation Plan (artifacts/implementation_plan.md):\n${planText.trim()}\n`;
          }
        }
        const wtPath = path.join(chatStorage.artifacts, 'walkthrough.md');
        if (fs.existsSync(wtPath)) {
          const wtText = fs.readFileSync(wtPath, 'utf-8');
          if (wtText.trim()) {
            activeWalkthroughContext = `\n\nCurrent Living Walkthrough Tracker (artifacts/walkthrough.md):\n${wtText.trim()}\n`;
          }
        }
      }
    } catch {}

    const rawMessages: any[] = [{ role: 'system', content: systemPrompt + activePlanContext + activeWalkthroughContext }];

    let messagesToProcess = history;
    try {
      const latestCompaction = compactionRepo.getLatestBySession(this.sessionId);
      if (latestCompaction && history.length >= COMPACTION_CONSTANTS.MIN_MESSAGES_TO_COMPACT) {
        const lastIdx = history.findIndex((m) => m.id === latestCompaction.last_compacted_message_id);
        if (lastIdx !== -1) {
          // Anchor the initial session goal
          const firstUser = history.find((m) => m.role === 'user');
          if (firstUser && history.indexOf(firstUser) <= lastIdx && firstUser.content) {
            rawMessages.push({
              role: 'user',
              content: `[Session Initial Goal Anchor]:\n${firstUser.content}`,
            });
          }
          // Inject the compacted memory checkpoint
          rawMessages.push({
            role: 'assistant',
            content: `[Context Memory Checkpoint]\n${latestCompaction.summary}\n\n(Note: Earlier turns have been compacted into this memory checkpoint. Continue assisting based on this checkpoint, living artifacts, and recent messages below.)`,
          });
          messagesToProcess = history.slice(lastIdx + 1);
        } else {
          const partition = partitionHistory(history, COMPACTION_CONSTANTS.DEFAULT_RECENT_TURNS);
          if (partition.messagesToCompact.length > 0) {
            if (partition.initialGoalMessage && partition.initialGoalMessage.content) {
              rawMessages.push({
                role: 'user',
                content: `[Session Initial Goal Anchor]:\n${partition.initialGoalMessage.content}`,
              });
            }
            rawMessages.push({
              role: 'assistant',
              content: `[Context Memory Checkpoint]\n${latestCompaction.summary}\n\n(Note: Earlier turns have been compacted into this memory checkpoint. Continue assisting based on this checkpoint, living artifacts, and recent messages below.)`,
            });
            messagesToProcess = partition.recentBuffer;
          }
        }
      }
    } catch (compactInspectErr) {
      console.error('Failed inspecting session compaction for formatOpenAiMessages:', compactInspectErr);
    }

    for (let i = 0; i < messagesToProcess.length; i++) {
      const msg = messagesToProcess[i];

      if (msg.role === 'tool') {
        const toolCallId = msg.tool_call_id || `call_${i}`;
        const toolName = msg.tool_name || 'unknown_tool';
        const toolArgs = msg.tool_arguments || '{}';

        // Check the last message in rawMessages
        let prevMsg = rawMessages[rawMessages.length - 1];

        // If previous message is NOT an assistant, or is an assistant without this tool_call_id:
        if (!prevMsg || prevMsg.role !== 'assistant') {
          prevMsg = {
            role: 'assistant',
            content: null,
            tool_calls: [
              {
                id: toolCallId,
                type: 'function',
                function: {
                  name: toolName,
                  arguments: toolArgs,
                },
              },
            ],
          };
          rawMessages.push(prevMsg);
        } else {
          // prevMsg is assistant. Ensure it has tool_calls with this toolCallId
          if (!prevMsg.tool_calls) {
            prevMsg.tool_calls = [];
          }
          if (!prevMsg.tool_calls.some((tc: any) => tc.id === toolCallId)) {
            prevMsg.tool_calls.push({
              id: toolCallId,
              type: 'function',
              function: {
                name: toolName,
                arguments: toolArgs,
              },
            });
          }
        }

        rawMessages.push({
          role: 'tool',
          tool_call_id: toolCallId,
          content: msg.content || '{}',
        });
      } else if (msg.role === 'assistant') {
        // Skip error records and dummy "..." placeholder assistant messages left when an iteration crashed
        if (msg.status === 'ERROR') {
          continue;
        }
        if (msg.content === '...' && !msg.tool_call_id && !msg.tool_arguments) {
          continue;
        }

        const item: any = { role: 'assistant', content: msg.content || null };
        if (msg.tool_arguments) {
          try {
            const parsed = JSON.parse(msg.tool_arguments);
            if (Array.isArray(parsed) && parsed.length > 0) {
              item.tool_calls = parsed.map((tc: any) => ({
                id: tc.id,
                type: 'function',
                function: {
                  name: tc.name,
                  arguments: typeof tc.arguments === 'string' ? tc.arguments : JSON.stringify(tc.arguments || {}),
                },
              }));
            } else if (msg.tool_call_id) {
              item.tool_calls = [
                {
                  id: msg.tool_call_id,
                  type: 'function',
                  function: {
                    name: msg.tool_name || '',
                    arguments: msg.tool_arguments,
                  },
                },
              ];
            }
          } catch {
            if (msg.tool_call_id) {
              item.tool_calls = [
                {
                  id: msg.tool_call_id,
                  type: 'function',
                  function: {
                    name: msg.tool_name || '',
                    arguments: msg.tool_arguments || '{}',
                  },
                },
              ];
            }
          }
        } else if (msg.tool_call_id) {
          item.tool_calls = [
            {
              id: msg.tool_call_id,
              type: 'function',
              function: {
                name: msg.tool_name || '',
                arguments: '{}',
              },
            },
          ];
        }

        // If there are no tool_calls, content cannot be null in OpenAI specification
        if (!item.tool_calls && item.content === null) {
          item.content = '';
        }

        rawMessages.push(item);
      } else {
        let content: any = msg.content || '';
        if (msg.role === 'user' && typeof content === 'string' && content.startsWith('[{"type":')) {
          try {
            const parsed = JSON.parse(content);
            if (Array.isArray(parsed)) {
              content = parsed.map((p: any) => {
                if (p.type === 'image_url') {
                  return {
                    type: 'image_url',
                    image_url: { url: p.image_url?.url || p.url },
                  };
                }
                return p;
              });
            }
          } catch {}
        }
        rawMessages.push({
          role: msg.role,
          content,
        });
      }
    }

    // Final pass: ensure every tool_call in any assistant message has a corresponding tool message following it
    const cleanMessages: any[] = [];
    for (let i = 0; i < rawMessages.length; i++) {
      const current = rawMessages[i];
      cleanMessages.push(current);

      if (current.role === 'assistant' && current.tool_calls && current.tool_calls.length > 0) {
        const existingToolCallIds = new Set<string>();
        let j = i + 1;
        while (j < rawMessages.length && rawMessages[j].role === 'tool') {
          existingToolCallIds.add(rawMessages[j].tool_call_id);
          j++;
        }

        // For any tool_call that has no response in the message list, insert a fallback result
        for (const tc of current.tool_calls) {
          if (!existingToolCallIds.has(tc.id)) {
            cleanMessages.push({
              role: 'tool',
              tool_call_id: tc.id,
              content: '{"status":"completed"}',
            });
          }
        }
      }
    }

    // If resuming an interrupted turn and the last message is an assistant message without tool calls,
    // append a continuation instruction so the model continues executing the task list seamlessly.
    const lastMsg = cleanMessages[cleanMessages.length - 1];
    if (lastMsg && lastMsg.role === 'assistant' && (!lastMsg.tool_calls || lastMsg.tool_calls.length === 0)) {
      cleanMessages.push({
        role: 'user',
        content: 'Lanjutkan pengerjaan tugas dan daftar Task List yang tadi terhenti sampai selesai.',
      });
    }

    return cleanMessages;
  }
}
