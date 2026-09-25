'use client';

import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { ReasoningAccordion } from './reasoning-accordion';
import { ToolRow } from './tool-row';
import type { MessageRecord } from '@/lib/db';

export interface TurnStep {
  id: string;
  type: 'thought' | 'tool';
  reasoning?: string;
  toolMessage?: MessageRecord;
  durationSeconds?: number;
}

export interface ActivityGroupProps {
  steps?: TurnStep[];
  toolMessages?: MessageRecord[];
  reasoningContent?: string | null;
  isStreaming?: boolean;
  hideHeader?: boolean;
  onOpenFileDiff?: (filePath: string) => void;
  onOpenFile?: (filePath: string, lineRange?: { startLine?: number; endLine?: number }) => void;
  onOpenBrowser?: (url: string) => void;
  workdir?: string;
  verbose?: boolean;
  latestUpdateTodosId?: string | null;
}

export function computeSummary(steps: TurnStep[], isStreaming: boolean = false): string {
  let filesExplored = 0;
  let searches = 0;
  let commands = 0;
  let filesEdited = 0;
  let mcpCalls = 0;

  for (const step of steps) {
    if (step.type === 'tool' && step.toolMessage) {
      const name = (step.toolMessage.tool_name || '').toLowerCase();
      if (
        name === 'read_file' ||
        name === 'view_file' ||
        name === 'list_dir' ||
        name === 'cat'
      ) {
        filesExplored++;
      } else if (
        name === 'search_files' ||
        name === 'glob' ||
        name === 'grep' ||
        name === 'grep_search' ||
        name === 'find' ||
        name === 'find_by_name'
      ) {
        searches++;
      } else if (
        name === 'run_command' ||
        name === 'exec' ||
        name === 'execute_command' ||
        name === 'terminal' ||
        name === 'bash' ||
        name === 'cmd'
      ) {
        commands++;
      } else if (
        name === 'write_file' ||
        name === 'apply_patch' ||
        name === 'create_file' ||
        name === 'edit_file' ||
        name === 'replace_file_content'
      ) {
        filesEdited++;
      } else if (name.startsWith('mcp_') || name === 'call_mcp_tool') {
        mcpCalls++;
      }
    }
  }

  // 1. If files were edited: "Edited X files" (+ commands if any)
  if (filesEdited > 0) {
    const parts: string[] = [`Edited ${filesEdited} file${filesEdited > 1 ? 's' : ''}`];
    if (commands > 0) {
      parts.push(`ran ${commands} command${commands > 1 ? 's' : ''}`);
    }
    if (filesExplored > 0) {
      parts.push(`explored ${filesExplored} file${filesExplored > 1 ? 's' : ''}`);
    }
    return parts.join(', ');
  }

  // 2. If commands were run: "Ran X commands" (+ explored if any)
  if (commands > 0) {
    const parts: string[] = [`Ran ${commands} command${commands > 1 ? 's' : ''}`];
    if (filesExplored > 0) {
      parts.push(`explored ${filesExplored} file${filesExplored > 1 ? 's' : ''}`);
    }
    if (searches > 0) {
      parts.push(`${searches} search${searches > 1 ? 'es' : ''}`);
    }
    return parts.join(', ');
  }

  // 3. If files were explored or searched: "Exploring X files, Y searches"
  if (filesExplored > 0 || searches > 0) {
    const parts: string[] = [];
    if (filesExplored > 0) {
      parts.push(`${filesExplored} file${filesExplored > 1 ? 's' : ''}`);
    }
    if (searches > 0) {
      parts.push(`${searches} search${searches > 1 ? 'es' : ''}`);
    }
    return `Exploring ${parts.join(', ')}`;
  }

  // 4. If MCP tools were used
  if (mcpCalls > 0) {
    return `Used ${mcpCalls} MCP tool${mcpCalls > 1 ? 's' : ''}`;
  }

  // 5. If only thoughts
  const hasThoughts = steps.some((s) => s.type === 'thought');
  if (hasThoughts) {
    return isStreaming ? 'Thinking...' : 'Thought for 1s';
  }

  return isStreaming ? 'Working...' : 'Explored files';
}

export const ActivityGroup: React.FC<ActivityGroupProps> = ({
  steps: explicitSteps,
  toolMessages = [],
  reasoningContent,
  isStreaming = false,
  hideHeader = false,
  onOpenFileDiff,
  onOpenFile,
  onOpenBrowser,
  workdir,
  verbose = true,
  latestUpdateTodosId,
}) => {
  // Normalize steps if not explicitly provided
  const normalizedSteps: TurnStep[] = React.useMemo(() => {
    if (explicitSteps && explicitSteps.length > 0) {
      return explicitSteps;
    }

    const list: TurnStep[] = [];
    if (reasoningContent) {
      list.push({
        id: 'step_live_reasoning',
        type: 'thought',
        reasoning: reasoningContent,
        durationSeconds: 1,
      });
    }
    for (const tmsg of toolMessages) {
      list.push({
        id: `step_${tmsg.id}`,
        type: 'tool',
        toolMessage: tmsg,
      });
    }
    return list;
  }, [explicitSteps, toolMessages, reasoningContent]);

  // Identify latest update_todos id so older/stale progress cards are hidden
  const effectiveLatestTodoId = React.useMemo(() => {
    if (latestUpdateTodosId !== undefined) {
      return latestUpdateTodosId;
    }
    for (let i = normalizedSteps.length - 1; i >= 0; i--) {
      const step = normalizedSteps[i];
      if (step.type === 'tool' && step.toolMessage?.tool_name === 'update_todos') {
        return step.toolMessage.id;
      }
    }
    return null;
  }, [latestUpdateTodosId, normalizedSteps]);

  // Open by default while streaming only if verbose is true; collapsed otherwise
  const [isOpen, setIsOpen] = useState((isStreaming && verbose) || (verbose && !hideHeader));

  // If no steps and not streaming, render nothing
  if (normalizedSteps.length === 0 && !isStreaming) {
    return null;
  }

  // If hideHeader is requested (e.g. inside a WorkBlock), render rows directly without inner button
  if (hideHeader) {
    return (
      <div className="space-y-0.5 pt-0.5 select-none">
        {normalizedSteps.map((step) => {
          if (step.type === 'thought') {
            return (
              <ReasoningAccordion
                key={step.id}
                reasoning={step.reasoning || ''}
                isStreaming={isStreaming}
              />
            );
          }

          if (step.type === 'tool' && step.toolMessage) {
            const lowerTool = (step.toolMessage.tool_name || '').toLowerCase();
            if (['update_todos', 'update_todo', 'todo_write', 'manage_tasks', 'todos', 'tasks'].includes(lowerTool)) {
              return null;
            }

            return (
              <ToolRow
                key={step.id}
                toolName={step.toolMessage.tool_name || 'tool'}
                argumentsText={step.toolMessage.tool_arguments || undefined}
                resultText={step.toolMessage.tool_result || step.toolMessage.content || undefined}
                status={(step.toolMessage.status as any) || 'COMPLETED'}
                onOpenFileDiff={onOpenFileDiff}
                onOpenFile={onOpenFile}
                onOpenBrowser={onOpenBrowser}
              />
            );
          }

          return null;
        })}

        {/* Live Working indicator at bottom */}
        {isStreaming && (
          <div className="flex items-center gap-2 text-[#8c8c8c] text-[13px] py-0.5 font-sans">
            <Loader2 className="w-3 h-3 text-[#007acc] animate-spin" />
            <span>Working...</span>
          </div>
        )}
      </div>
    );
  }

  const summaryTitle = computeSummary(normalizedSteps, isStreaming);

  return (
    <div className="my-2 space-y-1 select-none font-sans text-[13px] leading-relaxed">
      {/* 1. Header matching Antigravity: e.g. Exploring 1 file, 2 searches ⌵ */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 text-[#8c8c8c] hover:text-[#cccccc] transition cursor-pointer font-normal py-0.5 select-none group"
      >
        <span>{summaryTitle}</span>
        {isStreaming && (
          <Loader2 className="w-3 h-3 text-[#007acc] animate-spin shrink-0 ml-0.5" />
        )}
        <ChevronRight
          className={`w-3.5 h-3.5 text-[#666666] group-hover:text-[#aaaaaa] transition-transform duration-200 shrink-0 ${
            isOpen ? 'rotate-90 text-[#cccccc]' : ''
          }`}
        />
      </button>

      {/* 2. Indented Steps Container with smooth accordion animation */}
      <div className={`accordion-grid ${isOpen ? 'open' : ''}`}>
        <div className="accordion-inner pl-3.5 space-y-0.5 pt-0.5">
          {normalizedSteps.map((step) => {
            if (step.type === 'thought') {
              return (
                <ReasoningAccordion
                  key={step.id}
                  reasoning={step.reasoning || ''}
                  isStreaming={isStreaming}
                />
              );
            }

            if (step.type === 'tool' && step.toolMessage) {
              const lowerTool = (step.toolMessage.tool_name || '').toLowerCase();
              if (['update_todos', 'update_todo', 'todo_write', 'manage_tasks', 'todos', 'tasks'].includes(lowerTool)) {
                return null;
              }

              return (
                <ToolRow
                  key={step.id}
                  toolName={step.toolMessage.tool_name || 'tool'}
                  argumentsText={step.toolMessage.tool_arguments || undefined}
                  resultText={step.toolMessage.tool_result || step.toolMessage.content || undefined}
                  status={(step.toolMessage.status as any) || 'COMPLETED'}
                  workdir={workdir}
                  onOpenFileDiff={onOpenFileDiff}
                  onOpenFile={onOpenFile}
                  onOpenBrowser={onOpenBrowser}
                />
              );
            }

            return null;
          })}

          {/* 3. Live Working indicator at bottom */}
          {isStreaming && (
            <div className="flex items-center gap-2 text-[#8c8c8c] text-[13px] py-0.5 font-sans">
              <Loader2 className="w-3 h-3 text-[#007acc] animate-spin" />
              <span>Working.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
