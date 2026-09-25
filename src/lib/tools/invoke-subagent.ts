import type { ChatCompletionTool } from 'openai/resources/chat/completions';
import { subagentRepo, SubagentRecord, sessionRepo } from '../db';
import { getOpenAIClient } from '../gateway';
import { safeJsonParse } from '../json-repair';
import { executeReadFile } from './read-file';
import { executeGlob } from './glob';
import { executeSearchFiles } from './search-files';
import { executeRunCommand } from './run-command';
import { executeWriteFile } from './write-file';
import { executeApplyPatch } from './apply-patch';
import { formatModelDisplayName } from '../model-utils';

export interface InvokeSubagentParams {
  role_name: 'researcher' | 'tester' | 'coder' | 'debugger' | 'reviewer' | string;
  task_description: string;
}

export interface InvokeSubagentResult {
  subagentId: string;
  role: string;
  task: string;
  status: 'COMPLETED' | 'FAILED';
  summary: string;
}

const SUBAGENT_TOOLS: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read contents of a file in the workspace.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          start_line: { type: 'number' },
          end_line: { type: 'number' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'glob',
      description: 'Fast file search using glob patterns.',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string' },
        },
        required: ['pattern'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'grep',
      description: 'Search for text or regex patterns across files or directories in the workspace.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          path: { type: 'string' },
          isRegex: { type: 'boolean' },
          caseSensitive: { type: 'boolean' },
          filePattern: { type: 'string' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_files',
      description: 'Search for text or regex patterns across files (alias for grep).',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          path: { type: 'string' },
          isRegex: { type: 'boolean' },
          caseSensitive: { type: 'boolean' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_command',
      description: 'Execute a shell command headlessly.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string' },
        },
        required: ['command'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Create or overwrite a file in the workspace.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          content: { type: 'string' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'apply_patch',
      description: 'Apply unified diff patch to a file.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          patchText: { type: 'string' },
        },
        required: ['path', 'patchText'],
      },
    },
  },
];

export async function executeInvokeSubagent(
  params: InvokeSubagentParams,
  workdir: string,
  sessionId: string,
  messageId: string,
  onEvent?: (event: any) => void
): Promise<InvokeSubagentResult> {
  const subagentId = `sub_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const role = params.role_name || 'researcher';
  const task = params.task_description || '';

  const subRecord: SubagentRecord = {
    id: subagentId,
    parent_session_id: sessionId,
    role_name: role,
    task_description: task,
    status: 'RUNNING',
    started_at: Date.now(),
    completed_at: null,
  };

  subagentRepo.create(subRecord);

  if (onEvent) {
    onEvent({
      type: 'subagent_started',
      data: subRecord,
    });
  }

  const session = sessionRepo.getById(sessionId);
  const modelId = session?.model_id || 'aidev-auto';
  const client = getOpenAIClient();

  const rolePrompt =
    role === 'researcher'
      ? 'You are an autonomous Research Subagent. Your job is to thoroughly investigate the codebase, find references, inspect implementations, and compile concise, highly informative findings for the parent agent.'
      : role === 'tester'
      ? 'You are an autonomous Testing Subagent. Your job is to run tests, inspect failures, pinpoint root causes, and report verification status.'
      : role === 'reviewer'
      ? 'You are an autonomous Reviewer Subagent. Your job is to audit code diffs, identify security/logical vulnerabilities, and suggest improvements.'
      : 'You are an autonomous Specialist Subagent. Your job is to execute the assigned sub-task efficiently and provide a structured result.';

  const modelDisplayName = formatModelDisplayName(modelId);
  const messages: any[] = [
    {
      role: 'system',
      content: `${rolePrompt}\nWorking directory: ${workdir}\nPowered by Model: ${modelDisplayName} (${modelId})\nExecute your task diligently using available tools. Be concise and thorough in your final response.`,
    },
    {
      role: 'user',
      content: `Subagent Task: ${task}`,
    },
  ];

  let iterations = 0;
  const maxIterations = 5;
  let finalSummary = '';

  try {
    while (iterations < maxIterations) {
      iterations++;
      const response = await client.chat.completions.create({
        model: modelId,
        messages,
        tools: SUBAGENT_TOOLS,
        tool_choice: 'auto',
      });

      const choice = response.choices[0];
      const message = choice?.message;
      if (!message) break;

      messages.push(message);

      if (message.content) {
        finalSummary = message.content;
      }

      const toolCalls = message.tool_calls;
      if (!toolCalls || toolCalls.length === 0) {
        // Subagent finished
        break;
      }

      // Execute tool calls
      for (const tc of toolCalls) {
        const args: any = safeJsonParse(tc.function.arguments || '{}', {});

        let toolResult: any;
        try {
          const fnName = tc.function.name;
          if (fnName === 'read_file') {
            toolResult = await executeReadFile(args, workdir);
          } else if (fnName === 'glob') {
            toolResult = await executeGlob(args, workdir);
          } else if (fnName === 'grep' || fnName === 'search_files') {
            toolResult = await executeSearchFiles(args, workdir);
          } else if (fnName === 'run_command') {
            toolResult = await executeRunCommand(args, workdir, sessionId);
          } else if (fnName === 'write_file') {
            toolResult = await executeWriteFile(args, workdir, sessionId, messageId);
          } else if (fnName === 'apply_patch') {
            toolResult = await executeApplyPatch(args, workdir, sessionId, messageId);
          } else {
            toolResult = { error: `Unknown subagent tool: ${fnName}` };
          }
        } catch (err: any) {
          toolResult = { error: err.message };
        }

        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult),
        });
      }
    }

    if (!finalSummary.trim()) {
      finalSummary = `Sub-task for ${role} completed successfully.`;
    }

    subagentRepo.updateStatus(subagentId, 'COMPLETED');

    if (onEvent) {
      onEvent({
        type: 'subagent_completed',
        data: {
          id: subagentId,
          role_name: role,
          task_description: task,
          status: 'COMPLETED',
          summary: finalSummary,
        },
      });
    }

    return {
      subagentId,
      role,
      task,
      status: 'COMPLETED',
      summary: finalSummary,
    };
  } catch (err: any) {
    subagentRepo.updateStatus(subagentId, 'FAILED');

    if (onEvent) {
      onEvent({
        type: 'subagent_completed',
        data: {
          id: subagentId,
          role_name: role,
          task_description: task,
          status: 'FAILED',
          error: err.message,
        },
      });
    }

    return {
      subagentId,
      role,
      task,
      status: 'FAILED',
      summary: `Subagent execution error: ${err.message}`,
    };
  }
}
