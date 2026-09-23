import { MessageRecord, SessionCompactionRecord, compactionRepo, messageRepo, sessionRepo } from './db';
import { getOpenAIClient, getModelContextWindow } from './gateway';
import { loadSettings } from './storage';

export { getModelContextWindow };

export const COMPACTION_CONSTANTS = {
  DEFAULT_CONTEXT_RATIO: 0.75, // Auto-compact when active tokens exceed 75% of context window
  FALLBACK_CONTEXT_WINDOW: 128000,
  DEFAULT_TOKEN_THRESHOLD: 45000, // Legacy fallback
  MIN_MESSAGES_TO_COMPACT: 6,
  DEFAULT_RECENT_TURNS: 5,
  MIN_COOLDOWN_TURNS: 5,
  CHARS_PER_TOKEN: 3.5,
  MAX_TOOL_OUTPUT_CHARS_FOR_SUMMARY: 3000,
};

/**
 * Estimates token count from text using standard 3.5 chars/token heuristic.
 */
export function estimateTokens(text: string | null | undefined): number {
  if (!text) return 0;
  return Math.ceil(text.length / COMPACTION_CONSTANTS.CHARS_PER_TOKEN);
}

/**
 * Estimates token count of a single MessageRecord.
 */
export function estimateMessageTokens(msg: MessageRecord): number {
  let count = 4; // role + structure overhead
  if (msg.content) count += estimateTokens(msg.content);
  if (msg.reasoning_content) count += estimateTokens(msg.reasoning_content);
  if (msg.tool_name) count += estimateTokens(msg.tool_name);
  if (msg.tool_arguments) count += estimateTokens(msg.tool_arguments);
  if (msg.tool_result) count += estimateTokens(msg.tool_result);
  return count;
}

/**
 * Estimates total tokens for an entire array of MessageRecords.
 */
export function estimateHistoryTokens(history: MessageRecord[]): number {
  return history.reduce((sum, msg) => sum + estimateMessageTokens(msg), 0);
}

export interface PartitionedHistory {
  initialGoalMessage: MessageRecord | null;
  messagesToCompact: MessageRecord[];
  recentBuffer: MessageRecord[];
  tokensBefore: number;
}

/**
 * Partitions the session history into:
 * 1. initialGoalMessage: The very first user message of the session (anchored)
 * 2. messagesToCompact: Older middle turns to be summarized
 * 3. recentBuffer: The last K turns (minimum 5 turns, or up to 50% adaptive buffer)
 */
export function partitionHistory(
  history: MessageRecord[],
  baseRecentTurns: number = COMPACTION_CONSTANTS.DEFAULT_RECENT_TURNS,
  minMessages: number = COMPACTION_CONSTANTS.MIN_MESSAGES_TO_COMPACT,
  isManual: boolean = false
): PartitionedHistory {
  const totalTokens = estimateHistoryTokens(history);

  if (history.length < minMessages) {
    return {
      initialGoalMessage: history.find((m) => m.role === 'user') || null,
      messagesToCompact: [],
      recentBuffer: [...history],
      tokensBefore: totalTokens,
    };
  }

  // Find the first user message as initial goal anchor
  const firstUserIdx = history.findIndex((m) => m.role === 'user');
  const initialGoalMessage = firstUserIdx !== -1 ? history[firstUserIdx] : null;

  // Identify turn boundaries starting from user messages
  const userIndices: number[] = [];
  for (let i = 0; i < history.length; i++) {
    if (history[i].role === 'user') {
      userIndices.push(i);
    }
  }

  // Determine recent turns:
  // For manual compaction, strictly respect baseRecentTurns (e.g. 1-2 turns)
  // For auto-compaction, adaptively keep at least baseRecentTurns or up to 35% of turns
  const totalUserTurns = userIndices.length;
  let recentTurnsCount = isManual
    ? baseRecentTurns
    : Math.max(baseRecentTurns, Math.floor(totalUserTurns * 0.35));
  if (recentTurnsCount >= totalUserTurns) {
    recentTurnsCount = Math.max(1, totalUserTurns - 1);
  }

  // Find cutoff index for recent buffer
  let cutoffIdx = 0;
  if (totalUserTurns > recentTurnsCount) {
    cutoffIdx = userIndices[totalUserTurns - recentTurnsCount];
  } else {
    cutoffIdx = Math.max(1, Math.floor(history.length / 2));
  }

  // Ensure tool messages stay with their assistant messages
  while (cutoffIdx < history.length && history[cutoffIdx].role === 'tool') {
    cutoffIdx++;
  }

  const rawToCompact = history.slice(0, cutoffIdx);
  const recentBuffer = history.slice(cutoffIdx);

  // If initialGoalMessage is included in rawToCompact, we can exclude it from
  // rawToCompact if it's the exact first message, so it acts purely as the anchor
  const messagesToCompact = rawToCompact.filter((m) => {
    if (initialGoalMessage && m.id === initialGoalMessage.id) {
      return false;
    }
    return true;
  });

  // If messagesToCompact is empty (e.g. cutoff was right after first user message),
  // but history has multiple messages, adjust cutoff forward so we have messages to compact
  if (messagesToCompact.length === 0 && history.length > 2) {
    const nextCutoff = Math.max(2, history.length - 1);
    const adjustedRaw = history.slice(0, nextCutoff);
    const adjustedBuffer = history.slice(nextCutoff);
    const adjustedToCompact = adjustedRaw.filter((m) => !initialGoalMessage || m.id !== initialGoalMessage.id);
    if (adjustedToCompact.length > 0) {
      return {
        initialGoalMessage,
        messagesToCompact: adjustedToCompact,
        recentBuffer: adjustedBuffer,
        tokensBefore: totalTokens,
      };
    }
  }

  return {
    initialGoalMessage,
    messagesToCompact,
    recentBuffer,
    tokensBefore: totalTokens,
  };
}

/**
 * Accurately estimates active context tokens that are actually sent to the LLM.
 * Takes active compaction memory checkpoint into account instead of summing all historical messages.
 */
export function estimateActiveSessionTokens(
  history: MessageRecord[],
  latestCompaction?: SessionCompactionRecord | null
): number {
  if (!history || history.length === 0) return 0;

  if (!latestCompaction) {
    return estimateHistoryTokens(history);
  }

  const lastCompactIdx = history.findIndex((m) => m.id === latestCompaction.last_compacted_message_id);
  if (lastCompactIdx === -1) {
    return estimateHistoryTokens(history);
  }

  // Active context consists of:
  // 1. Compacted summary
  let count = estimateTokens(latestCompaction.summary) + 50;

  // 2. Initial Goal Anchor (if before cutoff)
  const firstUser = history.find((m) => m.role === 'user');
  if (firstUser && history.indexOf(firstUser) <= lastCompactIdx) {
    count += estimateMessageTokens(firstUser);
  }

  // 3. Uncompacted recent messages after the cutoff
  const recentMessages = history.slice(lastCompactIdx + 1);
  count += estimateHistoryTokens(recentMessages);

  return count;
}

/**
 * Checks whether auto-compaction should be triggered.
 * Evaluates active context tokens against the adaptive model context threshold,
 * and enforces a cooldown period to prevent "compaction storms".
 */
export function shouldAutoCompact(
  history: MessageRecord[],
  tokenThreshold?: number,
  latestCompaction?: SessionCompactionRecord | null,
  modelId?: string
): boolean {
  if (history.length < COMPACTION_CONSTANTS.MIN_MESSAGES_TO_COMPACT * 2) {
    return false;
  }

  // Resolve effective threshold:
  // If explicitly passed, use it; otherwise adapt to model's context window (75%)
  let effectiveThreshold = tokenThreshold;
  if (!effectiveThreshold || effectiveThreshold <= 0) {
    const contextWindow = modelId ? getModelContextWindow(modelId) : COMPACTION_CONSTANTS.FALLBACK_CONTEXT_WINDOW;
    effectiveThreshold = Math.floor(contextWindow * COMPACTION_CONSTANTS.DEFAULT_CONTEXT_RATIO);
  }

  // Calculate actual active context tokens (summary + recent uncompacted messages)
  const activeTokens = estimateActiveSessionTokens(history, latestCompaction);
  if (activeTokens < effectiveThreshold) {
    return false;
  }

  // Cooldown check: if a compaction exists, ensure at least MIN_COOLDOWN_TURNS user turns have elapsed
  if (latestCompaction) {
    const lastCompactIdx = history.findIndex((m) => m.id === latestCompaction.last_compacted_message_id);
    if (lastCompactIdx !== -1) {
      const remainingMessages = history.slice(lastCompactIdx + 1);
      const userTurnsSince = remainingMessages.filter((m) => m.role === 'user').length;
      if (userTurnsSince < COMPACTION_CONSTANTS.MIN_COOLDOWN_TURNS) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Minifies and prepares messages for the summarizer prompt by truncating bloated tool results.
 */
export function prepareMessagesForSummarizer(messages: MessageRecord[]): string {
  return messages
    .map((m, idx) => {
      let header = `[Turn #${idx + 1} | Role: ${m.role.toUpperCase()}]`;
      if (m.tool_name) {
        header += ` Tool: ${m.tool_name}`;
      }

      let body = '';
      if (m.content) {
        if (m.content.length > COMPACTION_CONSTANTS.MAX_TOOL_OUTPUT_CHARS_FOR_SUMMARY) {
          const half = Math.floor(COMPACTION_CONSTANTS.MAX_TOOL_OUTPUT_CHARS_FOR_SUMMARY / 2);
          body = `${m.content.slice(0, half)}\n\n[... ${m.content.length - COMPACTION_CONSTANTS.MAX_TOOL_OUTPUT_CHARS_FOR_SUMMARY} characters truncated for summary ...]\n\n${m.content.slice(-half)}`;
        } else {
          body = m.content;
        }
      } else if (m.tool_arguments) {
        body = `Arguments: ${m.tool_arguments}`;
      } else if (m.reasoning_content) {
        body = `Reasoning excerpt: ${m.reasoning_content.slice(0, 300)}...`;
      }

      return `${header}\n${body}`.trim();
    })
    .join('\n\n---\n\n');
}

/**
 * Calls LLM to generate a high-density, structured Markdown memory checkpoint.
 */
export async function generateCompactionSummary(
  messagesToCompact: MessageRecord[],
  previousSummary?: string | null,
  initialGoal?: string | null,
  preferredModelId?: string | null
): Promise<string> {
  const client = getOpenAIClient();
  const preparedHistory = prepareMessagesForSummarizer(messagesToCompact);

  const systemPrompt = `You are a Principal Software Architect and Context Compaction Engine.
Your task is to summarize the provided chronological conversation and tool execution history into a concise, high-density, technical memory checkpoint.
The active coding agent will use this checkpoint to continue software development without losing vital context or suffering from amnesia.

Requirements:
1. Preserve technical facts: exact file paths modified, commands executed, architecture decisions, and error root causes.
2. Filter out raw verbosity: omit verbose terminal outputs, repetitive logs, and casual pleasantries.
3. Be strictly factual: do not invent assumptions or actions not present in the history.
4. If a Previous Memory Checkpoint is provided, integrate it seamlessly into a single consolidated summary.

Required Output Format (Markdown):
## Session Context Memory Checkpoint

### Chronological User Goals
- [List each distinct user objective chronologically]

### Technical Decisions & Architecture
- [Key design choices, stack decisions, or constraints discovered]

### Files Created, Modified, or Inspected
- [file_path]: [1-sentence summary of what was done]

### Completed Milestones & Verification
- [Commands run, tests passed, or bugs successfully resolved]

### Current Pending State & Open Context
- [Unfinished tasks, pending questions, or immediate next steps prior to recent buffer]`;

  let userPrompt = '';
  if (initialGoal) {
    userPrompt += `Session Initial Goal Anchor:\n"${initialGoal}"\n\n`;
  }
  if (previousSummary) {
    userPrompt += `Previous Memory Checkpoint to Merge:\n${previousSummary}\n\n`;
  }
  userPrompt += `History To Compact (${messagesToCompact.length} messages):\n${preparedHistory}\n\nProduce the consolidated Technical Memory Checkpoint now.`;

  const model = preferredModelId || 'aidev-auto';

  try {
    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.2,
      max_tokens: 1500,
    });

    const summary = response.choices[0]?.message?.content?.trim();
    if (!summary) {
      throw new Error('LLM returned an empty summary during compaction');
    }
    return summary;
  } catch (err: any) {
    // Fallback simple structured summary if LLM call fails
    console.error('Failed to generate LLM compaction summary:', err);
    return `## Session Context Memory Checkpoint (Automated Fallback)
### Summarized Range
- Compacted ${messagesToCompact.length} earlier turns to preserve token window.
- Initial Goal: ${initialGoal || 'Not specified'}
### Files Noted in Compacted Range
${Array.from(new Set(messagesToCompact.map((m) => m.tool_name || '').filter(Boolean))).map((t) => `- Tool used: ${t}`).join('\n')}
(Detailed LLM summarization encountered an error: ${err.message || 'unknown error'})`;
  }
}

/**
 * Runs the complete compaction cycle for a session and saves the checkpoint record.
 */
export async function runCompaction(
  sessionId: string,
  isManual: boolean = false
): Promise<SessionCompactionRecord | null> {
  const session = sessionRepo.getById(sessionId);
  if (!session) return null;

  const history = messageRepo.listBySession(sessionId);
  const minRequiredMessages = isManual ? 3 : COMPACTION_CONSTANTS.MIN_MESSAGES_TO_COMPACT;
  if (history.length < minRequiredMessages) {
    return null;
  }

  const latestCompaction = compactionRepo.getLatestBySession(sessionId);

  if (!isManual && !shouldAutoCompact(history, undefined, latestCompaction, session.model_id)) {
    return null;
  }

  const userTurnCount = history.filter((m) => m.role === 'user').length;
  const recentTurns = isManual
    ? Math.min(2, Math.max(1, userTurnCount - 1))
    : COMPACTION_CONSTANTS.DEFAULT_RECENT_TURNS;
  const partition = partitionHistory(history, recentTurns, minRequiredMessages, isManual);
  if (partition.messagesToCompact.length === 0) {
    return null;
  }

  const firstMessageId = partition.messagesToCompact[0].id;
  const lastCompactedMessageId = partition.messagesToCompact[partition.messagesToCompact.length - 1].id;

  const initialGoal = partition.initialGoalMessage?.content || null;

  const summary = await generateCompactionSummary(
    partition.messagesToCompact,
    latestCompaction?.summary,
    initialGoal,
    session.model_id
  );

  const summaryTokens = estimateTokens(summary);
  const recentBufferTokens = estimateHistoryTokens(partition.recentBuffer);
  const tokensAfter = summaryTokens + recentBufferTokens + (partition.initialGoalMessage ? estimateMessageTokens(partition.initialGoalMessage) : 0);
  const tokensSaved = Math.max(0, partition.tokensBefore - tokensAfter);

  const record: SessionCompactionRecord = {
    id: `comp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    session_id: sessionId,
    summary,
    first_message_id: firstMessageId,
    last_compacted_message_id: lastCompactedMessageId,
    tokens_before: partition.tokensBefore,
    tokens_after: tokensAfter,
    tokens_saved: tokensSaved,
    created_at: Date.now(),
  };

  compactionRepo.create(record);
  return record;
}
