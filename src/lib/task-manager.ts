import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn, ChildProcess } from 'child_process';
import { getStoragePaths, getChatStorage, ensureChatStorageInitialized, loadSettings } from './storage';
import { taskRepo, BackgroundTaskRecord, sessionRepo } from './db';

export function cleanBackgroundCommand(cmd: string): string {
  let cleaned = cmd.trim();
  // Strip cmd.exe /c
  cleaned = cleaned.replace(/^\s*cmd(\.exe)?\s+(\/[a-zA-Z]\s+)*/i, '').trim();
  // Strip start /b, start "", start
  cleaned = cleaned.replace(/^\s*start(\s+""|\s+\/b|\s+\/[a-zA-Z])*\s+/i, '').trim();
  // Strip trailing &
  cleaned = cleaned.replace(/\s*&\s*$/, '').trim();
  return cleaned || cmd;
}

interface StartTaskParams {
  command: string;
  workdir: string;
  sessionId?: string;
  projectId?: string;
  replaceTaskId?: string;
}

class TaskManager {
  private activeProcesses = new Map<string, ChildProcess>();

  constructor() {
    // Clean up or check any dangling tasks from previous server runs
    this.reconcileDanglingTasks();
  }

  private reconcileDanglingTasks() {
    try {
      const allTasks = taskRepo.list();
      for (const task of allTasks) {
        if (task.status === 'RUNNING') {
          // If server just started, activeProcesses is empty so these processes are no longer managed
          taskRepo.update(task.id, {
            status: 'STOPPED',
            completed_at: Date.now(),
          });
        }
      }
    } catch {
      // Ignore if DB not ready yet
    }
  }

  public async startTask(params: StartTaskParams): Promise<BackgroundTaskRecord> {
    const sessionId = params.sessionId || 'default';
    const projectId =
      params.projectId ||
      (params.sessionId ? sessionRepo.getById(params.sessionId)?.project_id : undefined) ||
      'default';

    const chatStorage = ensureChatStorageInitialized(projectId, sessionId);
    const tasksDir = chatStorage.tasks;

    // Clean any start /b or cmd /c start wrappers
    const effectiveCommand = cleanBackgroundCommand(params.command);

    // 1. If replaceTaskId is specified, delete that old task so it doesn't double
    if (params.replaceTaskId) {
      await this.deleteTask(params.replaceTaskId);
    }

    // 2. Also delete any existing stopped task records with the same command in this session/project
    try {
      const existing = taskRepo.list({ sessionId: params.sessionId, projectId: params.projectId });
      for (const t of existing) {
        const isLive = this.activeProcesses.has(t.id);
        const sameCmd = cleanBackgroundCommand(t.command) === effectiveCommand;
        if (sameCmd && !isLive) {
          await this.deleteTask(t.id);
        }
      }
    } catch {}

    const taskId = `task_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const logPath = path.join(tasksDir, `${taskId}.log`);

    // Write initial log header
    const startTime = Date.now();
    const startDate = new Date(startTime).toLocaleString();
    const initialHeader = [
      `======================================================`,
      `  ⚡ Background Task: ${taskId}`,
      `  📌 Command:         ${effectiveCommand}`,
      `  📂 Workdir:         ${params.workdir}`,
      `  🕒 Started At:      ${startDate}`,
      `======================================================`,
      ``,
    ].join('\n');

    fs.writeFileSync(logPath, initialHeader, 'utf-8');

    const settings = loadSettings();
    const isWindows = process.platform === 'win32';
    const chosenShell = (settings.defaultShell || (isWindows ? 'powershell' : 'bash')).toLowerCase();

    let shell = isWindows ? (process.env.ComSpec || 'cmd.exe') : '/bin/sh';
    let shellArgs = isWindows ? ['/d', '/s', '/c', effectiveCommand] : ['-c', effectiveCommand];

    if (isWindows) {
      if (chosenShell === 'powershell') {
        shell = 'powershell.exe';
        shellArgs = ['-NoLogo', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', effectiveCommand];
      } else if (chosenShell === 'bash') {
        shell = 'bash.exe';
        shellArgs = ['-c', effectiveCommand];
      }
    } else {
      if (chosenShell === 'zsh') {
        shell = '/bin/zsh';
        shellArgs = ['-c', effectiveCommand];
      } else if (chosenShell === 'fish') {
        shell = 'fish';
        shellArgs = ['-c', effectiveCommand];
      } else if (chosenShell === 'bash') {
        shell = '/bin/bash';
        shellArgs = ['-c', effectiveCommand];
      } else {
        shell = process.env.SHELL || '/bin/sh';
        shellArgs = ['-c', effectiveCommand];
      }
    }

    let safeWorkdir = params.workdir || process.cwd();
    if (!fs.existsSync(safeWorkdir)) {
      try {
        fs.mkdirSync(safeWorkdir, { recursive: true });
      } catch {
        safeWorkdir = process.env.USERPROFILE || process.env.HOME || os.homedir() || process.cwd();
      }
    }
    if (!fs.existsSync(safeWorkdir)) {
      safeWorkdir = process.cwd();
    }

    // NOTE: Do NOT use detached: true on Windows, as Node's libuv passes CREATE_NEW_CONSOLE
    // which causes an external Windows Terminal / cmd window to pop up on user's desktop!
    // windowsHide: true with detached: false ensures the process runs completely hidden/headless.
    const child = spawn(shell, shellArgs, {
      cwd: safeWorkdir,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        CI: 'false',
        FORCE_COLOR: '1',
      },
    });

    const taskRecord: BackgroundTaskRecord = {
      id: taskId,
      session_id: params.sessionId,
      project_id: params.projectId,
      command: params.command,
      workdir: safeWorkdir,
      status: 'RUNNING',
      pid: child.pid,
      log_path: logPath,
      created_at: startTime,
    };

    taskRepo.create(taskRecord);
    this.activeProcesses.set(taskId, child);

    child.stdout?.on('data', (chunk: Buffer) => {
      try {
        fs.appendFileSync(logPath, chunk);
      } catch {}
    });

    child.stderr?.on('data', (chunk: Buffer) => {
      try {
        fs.appendFileSync(logPath, chunk);
      } catch {}
    });

    child.on('error', (err: Error) => {
      this.activeProcesses.delete(taskId);
      try {
        fs.appendFileSync(logPath, `\n[Task Process Error: ${err.message}]\n`);
        taskRepo.update(taskId, {
          status: 'FAILED',
          completed_at: Date.now(),
        });
      } catch {}
    });

    child.on('close', (code: number | null) => {
      this.activeProcesses.delete(taskId);
      try {
        const exitStatus = code === 0 ? 'COMPLETED' : 'FAILED';
        fs.appendFileSync(logPath, `\n\n[Task Finished with exit code ${code ?? 0}]\n`);
        taskRepo.update(taskId, {
          status: exitStatus,
          exit_code: code ?? 0,
          completed_at: Date.now(),
        });
      } catch {}
    });

    // Unref child so Node event loop doesn't block
    child.unref();

    return taskRecord;
  }

  public async stopTask(taskId: string): Promise<boolean> {
    const child = this.activeProcesses.get(taskId);
    const task = taskRepo.getById(taskId);

    if (child && child.pid) {
      this.activeProcesses.delete(taskId);
      const isWindows = process.platform === 'win32';
      if (isWindows) {
        try {
          // Kill whole process tree forcefully
          spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
            windowsHide: true,
            stdio: 'ignore',
          });
        } catch {
          child.kill('SIGKILL');
        }
      } else {
        try {
          if (child.pid) process.kill(-child.pid, 'SIGKILL');
        } catch {
          child.kill('SIGKILL');
        }
      }
    }

    if (task) {
      try {
        if (fs.existsSync(task.log_path)) {
          fs.appendFileSync(task.log_path, `\n\n[Task Stopped by user at ${new Date().toLocaleTimeString()}]\n`);
        }
      } catch {}

      taskRepo.update(taskId, {
        status: 'STOPPED',
        completed_at: Date.now(),
      });
      return true;
    }

    return false;
  }

  public async stopAllTasks(filter?: { sessionId?: string; projectId?: string }): Promise<number> {
    const tasks = taskRepo.list(filter);
    let stoppedCount = 0;
    for (const t of tasks) {
      if (t.status === 'RUNNING' || this.activeProcesses.has(t.id)) {
        await this.stopTask(t.id);
        stoppedCount++;
      }
    }
    return stoppedCount;
  }

  public isTaskRunning(taskId: string): boolean {
    return this.activeProcesses.has(taskId);
  }

  public async deleteTask(taskId: string): Promise<boolean> {
    if (this.activeProcesses.has(taskId)) {
      await this.stopTask(taskId);
    }
    const task = taskRepo.getById(taskId);
    if (task && fs.existsSync(task.log_path)) {
      try {
        fs.unlinkSync(task.log_path);
      } catch {}
    }
    taskRepo.delete(taskId);
    return true;
  }

  public clearStoppedTasks(sessionId?: string): void {
    taskRepo.clearStopped(sessionId);
  }

  public getTask(taskId: string): BackgroundTaskRecord | undefined {
    return taskRepo.getById(taskId);
  }

  public listTasks(filter?: { sessionId?: string; projectId?: string }): BackgroundTaskRecord[] {
    const list = taskRepo.list(filter);
    const seen = new Set<string>();
    const deduplicated: BackgroundTaskRecord[] = [];

    // list is ordered by created_at DESC (newest first)
    for (const t of list) {
      const isLive = this.activeProcesses.has(t.id);
      const effectiveStatus = !isLive && t.status === 'RUNNING' ? ('STOPPED' as const) : t.status;
      const cmdKey = cleanBackgroundCommand(t.command);

      if (seen.has(cmdKey)) {
        // Stale duplicate from an older run
        if (!isLive) {
          taskRepo.delete(t.id);
        }
        continue;
      }

      seen.add(cmdKey);
      deduplicated.push({
        ...t,
        status: effectiveStatus,
      });
    }

    return deduplicated;
  }

  public getTaskLogs(
    taskId?: string | null,
    cmd?: string | null
  ): { taskId: string; cmd: string; content: string; isRunning: boolean; updatedAt: number } {
    const { tasks: tasksDir } = getStoragePaths();
    let foundTaskId = taskId || '';
    let foundCmd = cmd || '';
    let content = '';
    let isRunning = false;

    // 1. Try finding by taskId in taskRepo
    if (taskId) {
      const cleanId = taskId.replace(/^task_/, '').replace(/\.log$/, '');
      const task = taskRepo.getById(taskId) || taskRepo.getById(`task_${cleanId}`);
      if (task) {
        foundCmd = task.command;
        foundTaskId = task.id;
        isRunning = this.activeProcesses.has(task.id);
        if (fs.existsSync(task.log_path)) {
          try {
            content = fs.readFileSync(task.log_path, 'utf-8');
          } catch {}
        }
      }
    }

    // 2. Direct lookup in session-specific tasks directory or legacy .aidev/tasks/ directory
    if (!content && taskId) {
      const cleanId = taskId.replace(/^task_/, '').replace(/\.log$/, '');
      const task = taskRepo.getById(taskId) || taskRepo.getById(`task_${cleanId}`);
      if (task?.session_id) {
        const projId = task.project_id || sessionRepo.getById(task.session_id)?.project_id || 'default';
        const sessionTasksDir = getChatStorage(projId, task.session_id).tasks;
        const candidate = path.join(sessionTasksDir, `${task.id}.log`);
        if (fs.existsSync(candidate)) {
          try {
            content = fs.readFileSync(candidate, 'utf-8');
            foundTaskId = task.id;
            isRunning = this.activeProcesses.has(task.id);
          } catch {}
        }
      }
    }

    if (!content && fs.existsSync(tasksDir)) {
      if (taskId) {
        const possibleFiles = [
          path.join(tasksDir, `${taskId}.log`),
          path.join(tasksDir, `${taskId}`),
          path.join(tasksDir, `task_${taskId}.log`),
        ];
        for (const p of possibleFiles) {
          if (fs.existsSync(p)) {
            try {
              content = fs.readFileSync(p, 'utf-8');
              foundTaskId = path.basename(p, '.log');
              isRunning = this.activeProcesses.has(foundTaskId);
              break;
            } catch {}
          }
        }
      }

      // If still no content, get latest task log from .aidev/tasks/
      if (!content) {
        try {
          const files = fs
            .readdirSync(tasksDir)
            .filter((f) => f.endsWith('.log'))
            .map((f) => {
              const p = path.join(tasksDir, f);
              const stat = fs.statSync(p);
              return { file: f, path: p, mtime: stat.mtimeMs, size: stat.size };
            })
            .sort((a, b) => b.mtime - a.mtime);

          if (files.length > 0) {
            const latest = files[0];
            content = fs.readFileSync(latest.path, 'utf-8');
            foundTaskId = latest.file.replace('.log', '');
            isRunning = this.activeProcesses.has(foundTaskId);
          }
        } catch {}
      }
    }

    // 3. Fallback: Antigravity task directory (for compatibility/history)
    if (!content) {
      const homeDir = process.env.USERPROFILE || process.env.HOME || '';
      const convId = 'd2ea4463-8a40-43c4-bc52-21d52f5ac836';
      const agyDir = path.join(homeDir, '.gemini', 'antigravity', 'brain', convId, '.system_generated', 'tasks');

      if (fs.existsSync(agyDir)) {
        try {
          const files = fs
            .readdirSync(agyDir)
            .filter((f) => f.endsWith('.log'))
            .map((f) => {
              const p = path.join(agyDir, f);
              const stat = fs.statSync(p);
              return { file: f, path: p, mtime: stat.mtimeMs, size: stat.size };
            })
            .sort((a, b) => b.mtime - a.mtime);

          if (files.length > 0) {
            const latest = files[0];
            content = fs.readFileSync(latest.path, 'utf-8');
            foundTaskId = latest.file.replace('.log', '');
            isRunning = true;
          }
        } catch {}
      }
    }

    if (!content) {
      content = `[${foundCmd || 'Background Task'}] Running in background...\nWaiting for process output...`;
    }

    return {
      taskId: foundTaskId || 'task_default',
      cmd: foundCmd || 'node server.mjs',
      content,
      isRunning,
      updatedAt: Date.now(),
    };
  }
}

export const taskManager = new TaskManager();
