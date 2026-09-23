import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { isCommandBlacklisted } from '../security';
import { logCommand, loadSettings } from '../storage';
import { taskManager, cleanBackgroundCommand } from '../task-manager';

export interface RunCommandParams {
  command: string;
  timeoutMs?: number;
  background?: boolean;
  isBackground?: boolean;
}

export interface RunCommandResult {
  command: string;
  exitCode: number;
  durationMs: number;
  stdout: string;
  stderr: string;
  isBackground?: boolean;
  taskId?: string;
}

// Strip ANSI escape codes
function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
}

export function shouldRunInBackground(command: string, explicitBackground?: boolean): boolean {
  if (explicitBackground === true) return true;

  const trimmed = command.trim();

  // Explicit shell background operators
  if (trimmed.endsWith('&') || /\bnohup\b/i.test(trimmed)) return true;

  // Windows start background commands (e.g. start /b, start "", cmd /c start)
  if (/^\s*(start\b|cmd(\.exe)?\s+(\/[a-zA-Z]\s+)*start\b|powershell(\.exe)?\s+.*Start-Process)/i.test(trimmed)) {
    return true;
  }

  // Dev servers / long-running processes
  if (/^(npm|pnpm|yarn|bun)\s+(run\s+)?(dev|start|serve)\b/i.test(trimmed)) return true;
  if (/^(npx\s+)?(vite|next\s+dev|nodemon)\b/i.test(trimmed)) return true;
  if (/^node\s+([^\s]+\/)?(server|app|index|main|start)\.(m?js|ts)\b/i.test(trimmed)) return true;
  if (/^python(3)?\s+([^\s]+\/)?(app|server|main|manage)\.py\b/i.test(trimmed)) return true;
  if (/^(flask\s+run|uvicorn\b|fastapi\s+dev)\b/i.test(trimmed)) return true;

  // Watchers
  if (/--watch\b/i.test(trimmed)) return true;

  return false;
}

export async function executeRunCommand(
  params: RunCommandParams,
  workdir: string,
  sessionId?: string
): Promise<RunCommandResult> {
  const blacklistCheck = isCommandBlacklisted(params.command);
  if (blacklistCheck.blacklisted) {
    throw new Error(blacklistCheck.reason || 'Command blocked by security policy.');
  }

  const startTime = Date.now();

  // If command should run in background (dev servers, long tasks, or explicit background)
  if (shouldRunInBackground(params.command, params.background || params.isBackground)) {
    try {
      const cleanCmd = cleanBackgroundCommand(params.command);
      const task = await taskManager.startTask({
        command: cleanCmd,
        workdir,
        sessionId,
      });

      const durationMs = Date.now() - startTime;
      const message = `[Background Task Started]\nTask ID: ${task.id}\nCommand: "${task.command}"\nStatus: RUNNING\nPID: ${task.pid || 'Active'}\nReal-time output is available in the Background Tasks tab.`;
      logCommand(params.command, 0, durationMs, message, '');

      return {
        command: params.command,
        exitCode: 0,
        durationMs,
        stdout: message,
        stderr: '',
        isBackground: true,
        taskId: task.id,
      };
    } catch (err: any) {
      throw new Error(`Failed to launch background task: ${err.message}`);
    }
  }

  const settings = loadSettings();
  const timeoutMs = params.timeoutMs || (settings.commandTimeout ? settings.commandTimeout * 1000 : 120000);
  const isWindows = process.platform === 'win32';
  let shell = isWindows ? (process.env.ComSpec || 'cmd.exe') : '/bin/sh';
  let shellArgs = isWindows ? ['/d', '/s', '/c', params.command] : ['-c', params.command];

  if (isWindows && settings.defaultShell === 'powershell') {
    shell = 'powershell.exe';
    shellArgs = ['-NoLogo', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', params.command];
  } else if (isWindows && settings.defaultShell === 'bash') {
    shell = 'bash.exe';
    shellArgs = ['-c', params.command];
  }

  return new Promise((resolve, reject) => {
    let stdoutBuffer = '';
    let stderrBuffer = '';
    let isTerminated = false;

    const extraPaths: string[] = [];
    let extraNodePath = '';
    const userHome = process.env.USERPROFILE || process.env.HOME || '';

    // 1. Cached aidev-runtimes (Node & Git)
    const cachedNodeDir = path.join(userHome, '.cache', 'aidev-runtimes', 'node');
    if (fs.existsSync(cachedNodeDir)) {
      extraPaths.push(cachedNodeDir);
      if (fs.existsSync(path.join(cachedNodeDir, 'bin'))) {
        extraPaths.push(path.join(cachedNodeDir, 'bin'));
      }
    }
    const cachedGitCmd = path.join(userHome, '.cache', 'aidev-runtimes', 'git', 'cmd');
    if (fs.existsSync(cachedGitCmd)) {
      extraPaths.push(cachedGitCmd);
    }

    // 2. Standard system Node/NPM locations on Windows if not already in PATH
    if (process.platform === 'win32') {
      const winStandardNode = 'C:\\Program Files\\nodejs';
      if (fs.existsSync(winStandardNode)) {
        extraPaths.push(winStandardNode);
      }
      const winAppDataNpm = path.join(userHome, 'AppData', 'Roaming', 'npm');
      if (fs.existsSync(winAppDataNpm)) {
        extraPaths.push(winAppDataNpm);
      }
    }

    const mergedPath = extraPaths.length > 0
      ? `${extraPaths.join(path.delimiter)}${path.delimiter}${process.env.PATH || process.env.Path || ''}`
      : (process.env.PATH || process.env.Path);

    const mergedNodePath = extraNodePath
      ? `${extraNodePath}${path.delimiter}${process.env.NODE_PATH || ''}`
      : process.env.NODE_PATH;

    const child = spawn(shell, shellArgs, {
      cwd: workdir,
      windowsHide: true,
      env: {
        ...process.env,
        CI: 'true',
        FORCE_COLOR: '0',
        ...(mergedPath ? { PATH: mergedPath, Path: mergedPath } : {}),
        ...(mergedNodePath ? { NODE_PATH: mergedNodePath } : {}),
      },
    });

    const timer = setTimeout(() => {
      isTerminated = true;
      try {
        child.kill('SIGTERM');
        setTimeout(() => {
          if (!child.killed) child.kill('SIGKILL');
        }, 2000);
      } catch {
        // process may have already exited
      }
      const durationMs = Date.now() - startTime;
      const cleanStdout = stripAnsi(stdoutBuffer);
      const cleanStderr = stripAnsi(stderrBuffer) + `\n[Command timed out after ${timeoutMs}ms]`;
      logCommand(params.command, -1, durationMs, cleanStdout, cleanStderr);
      reject(new Error(`Command timed out after ${timeoutMs}ms: "${params.command}"`));
    }, timeoutMs);

    child.stdout.on('data', (data) => {
      stdoutBuffer += data.toString();
      // Cap buffer size to 2 MB to prevent OOM
      if (stdoutBuffer.length > 2 * 1024 * 1024) {
        stdoutBuffer = stdoutBuffer.slice(-2 * 1024 * 1024);
      }
    });

    child.stderr.on('data', (data) => {
      stderrBuffer += data.toString();
      if (stderrBuffer.length > 2 * 1024 * 1024) {
        stderrBuffer = stderrBuffer.slice(-2 * 1024 * 1024);
      }
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      const durationMs = Date.now() - startTime;
      logCommand(params.command, -1, durationMs, stdoutBuffer, err.message);
      reject(err);
    });

    child.on('close', (code) => {
      if (isTerminated) return;
      clearTimeout(timer);
      const durationMs = Date.now() - startTime;
      const cleanStdout = stripAnsi(stdoutBuffer);
      const cleanStderr = stripAnsi(stderrBuffer);

      logCommand(params.command, code ?? 0, durationMs, cleanStdout, cleanStderr);

      resolve({
        command: params.command,
        exitCode: code ?? 0,
        durationMs,
        stdout: cleanStdout,
        stderr: cleanStderr,
      });
    });
  });
}
