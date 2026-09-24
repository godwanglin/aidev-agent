import { WebSocketServer, WebSocket } from 'ws';
import { spawn, execFileSync } from 'child_process';
import type { ChildProcessWithoutNullStreams } from 'child_process';
import type { IncomingMessage } from 'http';
import url from 'url';
import fs from 'fs';
import os from 'os';
import { loadSettings } from './storage';

interface TerminalSession {
  id: string;
  process: ChildProcessWithoutNullStreams;
  ws: WebSocket | null;
  workdir: string;
  buffer: string;
  lineBuffer: string;
  history: string[];
  historyIdx: number;
  disconnectTimer: NodeJS.Timeout | null;
  handleInput: ((inputData: string) => void) | null;
}

const activeTerminals =
  (globalThis as any).__aidev_activeTerminals ||
  ((globalThis as any).__aidev_activeTerminals = new Map<string, any>());

export function setupTerminalWebSocket(wss: WebSocketServer) {
  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const parsedUrl = url.parse(req.url || '', true);
    if (!parsedUrl.pathname?.startsWith('/api/terminal/ws')) {
      return;
    }

    const sessionId = (parsedUrl.query.sessionId as string) || `term_${Date.now()}`;
    const rawWorkdir = (parsedUrl.query.workdir as string) || process.cwd();
    let safeWorkdir = rawWorkdir;
    let workdirFallbackUsed = false;

    if (!fs.existsSync(safeWorkdir)) {
      try {
        fs.mkdirSync(safeWorkdir, { recursive: true });
      } catch {
        safeWorkdir = process.env.USERPROFILE || process.env.HOME || os.homedir() || process.cwd();
        workdirFallbackUsed = true;
      }
    }
    if (!fs.existsSync(safeWorkdir)) {
      safeWorkdir = process.cwd();
      workdirFallbackUsed = true;
    }

    const existing = activeTerminals.get(sessionId);

    // If session already exists and process is alive, RE-ATTACH (Persisted Terminal Session)
    if (existing && existing.process && !existing.process.killed) {
      if (existing.disconnectTimer) {
        clearTimeout(existing.disconnectTimer);
        existing.disconnectTimer = null;
      }
      existing.ws = ws;

      // Replay entire scrollback history buffer to xterm
      if (existing.buffer) {
        ws.send(JSON.stringify({ type: 'output', data: existing.buffer }));
      }

      ws.on('message', (message: any) => {
        try {
          const payload = JSON.parse(message.toString());
          if (payload.type === 'input' && typeof payload.data === 'string') {
            existing.handleInput?.(payload.data);
          }
        } catch {
          existing.handleInput?.(message.toString());
        }
      });

      ws.on('close', () => {
        existing.ws = null;
        // Keep child process alive with a 30-minute grace period
        if (existing.disconnectTimer) clearTimeout(existing.disconnectTimer);
        existing.disconnectTimer = setTimeout(() => {
          try {
            existing.process.kill();
          } catch {}
          activeTerminals.delete(sessionId);
        }, 30 * 60 * 1000);
      });

      return;
    }

    const settings = loadSettings();
    const isWindows = process.platform === 'win32';
    const chosenShell = (settings.defaultShell || (isWindows ? 'powershell' : 'bash')).toLowerCase();

    let shell = isWindows
      ? (process.env.COMSPEC || 'cmd.exe')
      : (process.env.SHELL || '/bin/bash');
    let shellArgs = isWindows ? ['/Q'] : ['-i'];

    if (isWindows) {
      if (chosenShell === 'powershell') {
        shell = 'powershell.exe';
        shellArgs = ['-NoLogo'];
      } else if (chosenShell === 'cmd') {
        shell = process.env.COMSPEC || 'cmd.exe';
        shellArgs = ['/Q'];
      } else if (chosenShell === 'bash') {
        shell = 'bash.exe';
        shellArgs = ['-i'];
      }
    } else {
      if (chosenShell === 'zsh') {
        shell = '/bin/zsh';
        shellArgs = ['-i'];
      } else if (chosenShell === 'sh') {
        shell = '/bin/sh';
        shellArgs = ['-i'];
      } else if (chosenShell === 'fish') {
        shell = 'fish';
        shellArgs = ['-i'];
      } else {
        shell = process.env.SHELL || '/bin/bash';
        shellArgs = ['-i'];
      }
    }

    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawn(shell, shellArgs, {
        cwd: safeWorkdir,
        env: {
          ...process.env,
          TERM: 'xterm-256color',
          COLORTERM: 'truecolor',
        },
      });
    } catch (err: any) {
      ws.send(JSON.stringify({ type: 'output', data: `\r\nFailed to spawn terminal: ${err.message}\r\n` }));
      ws.close();
      return;
    }

    const terminalSession: TerminalSession = {
      id: sessionId,
      process: child,
      ws,
      workdir: safeWorkdir,
      buffer: '',
      lineBuffer: '',
      history: [],
      historyIdx: -1,
      disconnectTimer: null,
      handleInput: null,
    };
    activeTerminals.set(sessionId, terminalSession);

    const sendOutput = (data: string) => {
      // Append to scrollback ring buffer (max 60,000 chars)
      terminalSession.buffer += data;
      if (terminalSession.buffer.length > 60000) {
        terminalSession.buffer = terminalSession.buffer.slice(-50000);
      }
      if (terminalSession.ws && terminalSession.ws.readyState === WebSocket.OPEN) {
        terminalSession.ws.send(JSON.stringify({ type: 'output', data }));
      }
    };

    if (workdirFallbackUsed || safeWorkdir !== rawWorkdir) {
      const notice = `\r\n\x1b[33m[Aidev Terminal] Notice: Project directory "${rawWorkdir}" does not exist on disk.\x1b[0m\r\n\x1b[36m-> Fallback working directory: "${safeWorkdir}"\x1b[0m\r\n\r\n`;
      sendOutput(notice);
    }

    // Forward stdout & stderr to xterm.js
    child.stdout.on('data', (data: Buffer) => {
      sendOutput(data.toString('utf-8'));
    });

    child.stderr.on('data', (data: Buffer) => {
      sendOutput(data.toString('utf-8'));
    });

    child.on('close', (code: number | null) => {
      if (terminalSession.ws && terminalSession.ws.readyState === WebSocket.OPEN) {
        terminalSession.ws.send(JSON.stringify({ type: 'exit', code: code ?? 0 }));
      }
      activeTerminals.delete(sessionId);
    });

    // Interactive terminal line buffer & history
    const handleInput = (inputData: string) => {
      for (let i = 0; i < inputData.length; i++) {
        // Up arrow: \x1b[A
        if (inputData.slice(i, i + 3) === '\x1b[A') {
          i += 2;
          if (terminalSession.history.length > 0) {
            if (terminalSession.historyIdx === -1) {
              terminalSession.historyIdx = terminalSession.history.length - 1;
            } else if (terminalSession.historyIdx > 0) {
              terminalSession.historyIdx--;
            }
            const prevCmd = terminalSession.history[terminalSession.historyIdx];
            sendOutput('\b \b'.repeat(terminalSession.lineBuffer.length));
            terminalSession.lineBuffer = prevCmd;
            sendOutput(terminalSession.lineBuffer);
          }
          continue;
        }

        // Down arrow: \x1b[B
        if (inputData.slice(i, i + 3) === '\x1b[B') {
          i += 2;
          if (terminalSession.historyIdx !== -1) {
            if (terminalSession.historyIdx < terminalSession.history.length - 1) {
              terminalSession.historyIdx++;
              const nextCmd = terminalSession.history[terminalSession.historyIdx];
              sendOutput('\b \b'.repeat(terminalSession.lineBuffer.length));
              terminalSession.lineBuffer = nextCmd;
              sendOutput(terminalSession.lineBuffer);
            } else {
              terminalSession.historyIdx = -1;
              sendOutput('\b \b'.repeat(terminalSession.lineBuffer.length));
              terminalSession.lineBuffer = '';
            }
          }
          continue;
        }

        // Right / Left arrows
        if (inputData.slice(i, i + 3) === '\x1b[C' || inputData.slice(i, i + 3) === '\x1b[D') {
          i += 2;
          continue;
        }

        const ch = inputData[i];

        if (ch === '\r' || ch === '\n') {
          sendOutput('\r\n');
          child.stdin.write(terminalSession.lineBuffer + '\r\n');
          if (terminalSession.lineBuffer.trim()) {
            terminalSession.history.push(terminalSession.lineBuffer);
          }
          terminalSession.lineBuffer = '';
          terminalSession.historyIdx = -1;
        } else if (ch === '\x7f' || ch === '\x08') { // Backspace
          if (terminalSession.lineBuffer.length > 0) {
            terminalSession.lineBuffer = terminalSession.lineBuffer.slice(0, -1);
            sendOutput('\b \b');
          }
        } else if (ch === '\x03') { // Ctrl+C
          sendOutput('^C\r\n');
          terminalSession.lineBuffer = '';
          terminalSession.historyIdx = -1;
          try {
            child.stdin.write('\x03');
          } catch {}
        } else if (ch >= ' ') {
          terminalSession.lineBuffer += ch;
          sendOutput(ch);
        }
      }
    };

    terminalSession.handleInput = handleInput;

    // Handle incoming messages from xterm.js
    ws.on('message', (message: any) => {
      try {
        const payload = JSON.parse(message.toString());
        if (payload.type === 'input' && typeof payload.data === 'string') {
          handleInput(payload.data);
        }
      } catch {
        handleInput(message.toString());
      }
    });

    ws.on('close', () => {
      terminalSession.ws = null;
      if (terminalSession.disconnectTimer) clearTimeout(terminalSession.disconnectTimer);
      terminalSession.disconnectTimer = setTimeout(() => {
        try {
          child.kill();
        } catch {}
        activeTerminals.delete(sessionId);
      }, 30 * 60 * 1000);
    });
  });
}

export function getActiveTerminalCount(): number {
  return activeTerminals.size;
}

export function killActiveTerminal(sessionId: string): boolean {
  const term = activeTerminals.get(sessionId);
  if (!term) return false;

  if (term.disconnectTimer) {
    clearTimeout(term.disconnectTimer);
    term.disconnectTimer = null;
  }

  if (term.ws && term.ws.readyState === 1) { // 1 = OPEN
    try {
      term.ws.send(JSON.stringify({ type: 'exit', code: 0 }));
      term.ws.close();
    } catch {}
  }

  const pid = term.process?.pid;
  if (pid) {
    if (process.platform === 'win32') {
      try {
        execFileSync('taskkill', ['/pid', String(pid), '/t', '/f'], { stdio: 'ignore' });
      } catch {}
    } else {
      try {
        process.kill(-pid, 'SIGKILL');
      } catch {}
    }
  }

  try {
    if (typeof term.kill === 'function') {
      term.kill();
    } else if (term.process && typeof term.process.kill === 'function') {
      term.process.kill();
    }
  } catch {}

  activeTerminals.delete(sessionId);
  return true;
}

export function killAllActiveTerminals(): number {
  let count = 0;
  const ids = Array.from(activeTerminals.keys()) as string[];
  for (const id of ids) {
    if (killActiveTerminal(id)) {
      count++;
    }
  }
  return count;
}

export function listActiveTerminals() {
  const result: Array<{ id: string; workdir: string; pid?: number; shell?: string }> = [];
  activeTerminals.forEach((term: any, id: string) => {
    result.push({
      id,
      workdir: term?.workdir || process.cwd(),
      pid: term?.process?.pid,
      shell: term?.process?.file || (process.platform === 'win32' ? 'powershell.exe' : 'bash'),
    });
  });
  return result;
}

export function checkTerminalProcesses(sessionId: string): {
  hasActiveProcess: boolean;
  processName?: string;
  command?: string;
  processes: Array<{ pid: number; name: string; command?: string }>;
} {
  const term = activeTerminals.get(sessionId);
  if (!term) return { hasActiveProcess: false, processes: [] };

  const pid = term.process?.pid;
  if (!pid) return { hasActiveProcess: false, processes: [] };

  if (process.platform === 'win32') {
    try {
      const script = `$p = @(Get-CimInstance Win32_Process -Filter "ParentProcessId=${pid}" | Select-Object ProcessId, Name, CommandLine); if ($p.Count -gt 0) { $p | ConvertTo-Json -Compress }`;
      const out = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
        encoding: 'utf-8',
        timeout: 2500,
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();

      if (!out) return { hasActiveProcess: false, processes: [] };

      let parsed: any;
      try {
        parsed = JSON.parse(out);
      } catch {
        return { hasActiveProcess: false, processes: [] };
      }

      const list = Array.isArray(parsed) ? parsed : [parsed];
      const activeList = list.filter((p: any) => {
        const name = (p.Name || '').toLowerCase();
        return name && !name.includes('conhost') && !name.includes('openconsole');
      });

      if (activeList.length === 0) return { hasActiveProcess: false, processes: [] };

      const procs = activeList.map((p: any) => ({
        pid: p.ProcessId,
        name: p.Name,
        command: p.CommandLine,
      }));

      const first = procs[0];
      return {
        hasActiveProcess: true,
        processName: first.name,
        command: first.command,
        processes: procs,
      };
    } catch {
      return { hasActiveProcess: false, processes: [] };
    }
  } else {
    try {
      const out = execFileSync('pgrep', ['-P', String(pid)], {
        encoding: 'utf-8',
        timeout: 1000,
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();

      if (!out) return { hasActiveProcess: false, processes: [] };
      const pids = out.split(/\s+/).filter(Boolean);
      return {
        hasActiveProcess: pids.length > 0,
        processName: 'background process',
        processes: pids.map((id) => ({ pid: Number(id), name: 'process' })),
      };
    } catch {
      return { hasActiveProcess: false, processes: [] };
    }
  }
}

export function checkAllTerminalsProcesses(): {
  hasActiveProcess: boolean;
  activeCount: number;
} {
  let activeCount = 0;
  const ids = Array.from(activeTerminals.keys()) as string[];
  for (const id of ids) {
    const res = checkTerminalProcesses(id);
    if (res.hasActiveProcess) activeCount++;
  }
  return {
    hasActiveProcess: activeCount > 0,
    activeCount,
  };
}


