'use client';

import React from 'react';
import { TerminalExecCard } from './terminal-exec-card';

interface ToolCardProps {
  toolName: string;
  argumentsText?: string;
  resultText?: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'PENDING_PERMISSION';
  durationMs?: number;
}

export const ToolCard: React.FC<ToolCardProps> = ({
  toolName,
  argumentsText,
  resultText,
  status,
}) => {
  let parsedArgs: any = null;
  try {
    if (argumentsText) parsedArgs = JSON.parse(argumentsText);
  } catch {
    // raw
  }

  if (toolName === 'run_command') {
    const command = parsedArgs?.command || argumentsText || 'echo';
    const workdir = parsedArgs?.workdir || 'c:\\dev\\aidev';
    return (
      <TerminalExecCard
        command={command}
        workdir={workdir}
        output={resultText}
        status={status}
      />
    );
  }

  // Non-command fallback
  const target = parsedArgs?.path || parsedArgs?.query || '';
  return (
    <div className="my-1.5 p-2 rounded-xl bg-[#0a0a0a] border border-[#222222] font-mono text-xs text-[#cccccc]">
      <div className="text-[#8c8c8c]">
        {toolName}: <span className="text-[#58a6ff]">{target}</span>
      </div>
      {resultText && (
        <pre className="mt-1 text-[11.5px] text-[#9d9d9d] whitespace-pre-wrap max-h-40 overflow-y-auto">
          {resultText}
        </pre>
      )}
    </div>
  );
};
