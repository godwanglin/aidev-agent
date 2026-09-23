import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { createTwoFilesPatch } from 'diff';
import { gitResolver } from './git-resolver';

const execFileAsync = promisify(execFile);

export interface GitFileChange {
  path: string;
  status: 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked';
  statusCode: string;
  staged: boolean;
  oldPath?: string;
  additions?: number;
  deletions?: number;
}

export interface GitRepoStatus {
  isRepo: boolean;
  branch: string;
  upstream?: string;
  ahead: number;
  behind: number;
  staged: GitFileChange[];
  unstaged: GitFileChange[];
  untracked: GitFileChange[];
  clean: boolean;
  totalChanges: number;
}

export interface GitFileDiffResult {
  filePath: string;
  staged: boolean;
  originalContent: string;
  currentContent: string;
  unifiedDiff: string;
}

export interface GitBranchesResult {
  current: string;
  local: string[];
  remote: string[];
}

export interface GitCommitLog {
  hash: string;
  shortHash: string;
  authorName: string;
  authorEmail: string;
  date: string;
  relativeDate: string;
  message: string;
  refs: string[];
}

export interface GitCommitFileChange {
  path: string;
  status: 'modified' | 'added' | 'deleted' | 'renamed';
  oldPath?: string;
}

export interface GitCommitDetail extends GitCommitLog {
  body: string;
  files: GitCommitFileChange[];
}

export interface GitStashItem {
  index: number;
  name: string;
  message: string;
  date: string;
}

export class GitService {
  private static instance: GitService;

  public static getInstance(): GitService {
    if (!GitService.instance) {
      GitService.instance = new GitService();
    }
    return GitService.instance;
  }

  public async execGit(
    workdir: string,
    args: string[],
    options?: { env?: Record<string, string>; timeout?: number }
  ): Promise<{ stdout: string; stderr: string }> {
    const gitBin = await gitResolver.resolveGit();
    try {
      const result = await execFileAsync(gitBin, args, {
        cwd: workdir,
        windowsHide: true,
        maxBuffer: 20 * 1024 * 1024,
        timeout: options?.timeout || 30000,
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: '0',
          LC_ALL: 'C',
          ...(options?.env || {}),
        },
      });
      return { stdout: result.stdout, stderr: result.stderr };
    } catch (err: any) {
      const stdout = err.stdout || '';
      const stderr = err.stderr || err.message || '';
      const message = stderr.trim() || stdout.trim() || err.message;
      const errorObj = new Error(message) as any;
      errorObj.stdout = stdout;
      errorObj.stderr = stderr;
      errorObj.code = err.code;
      throw errorObj;
    }
  }

  public async isGitRepo(workdir: string): Promise<boolean> {
    if (!workdir || !workdir.trim() || workdir === 'no_project') {
      return false;
    }
    try {
      if (!fs.existsSync(workdir)) {
        return false;
      }
      // Direct check: does workdir have a .git folder or file?
      const gitDir = path.join(workdir, '.git');
      if (fs.existsSync(gitDir)) {
        return true;
      }
      // Check if workdir is its own git repo root
      const { stdout } = await this.execGit(workdir, ['rev-parse', '--show-toplevel']);
      const topLevel = path.resolve(stdout.trim());
      return topLevel.toLowerCase() === path.resolve(workdir).toLowerCase();
    } catch {
      return false;
    }
  }

  public async initRepo(workdir: string): Promise<void> {
    if (!workdir || !workdir.trim() || workdir === 'no_project') {
      throw new Error('Project working directory is not valid for Git initialization.');
    }
    if (!fs.existsSync(workdir)) {
      fs.mkdirSync(workdir, { recursive: true });
    }

    try {
      await this.execGit(workdir, ['init', '-b', 'main']);
    } catch {
      await this.execGit(workdir, ['init']);
      try {
        await this.execGit(workdir, ['checkout', '-b', 'main']);
      } catch {}
    }

    // Auto-create standard .gitignore if not present
    const gitignorePath = path.join(workdir, '.gitignore');
    if (!fs.existsSync(gitignorePath)) {
      const defaultGitignore = [
        '# Dependencies',
        'node_modules/',
        '/.pnp',
        '.pnp.js',
        '',
        '# Production & Build outputs',
        '.next/',
        'dist/',
        'build/',
        'out/',
        '',
        '# Environment variables',
        '.env',
        '.env.local',
        '.env.development.local',
        '.env.test.local',
        '.env.production.local',
        '',
        '# Logs',
        'npm-debug.log*',
        'yarn-debug.log*',
        'yarn-error.log*',
        'pnpm-debug.log*',
        '*.log',
        '',
        '# OS metadata',
        '.DS_Store',
        'Thumbs.db',
        '',
      ].join('\n');
      try {
        fs.writeFileSync(gitignorePath, defaultGitignore, 'utf-8');
      } catch (err) {
        console.warn('[GitService] Failed to create default .gitignore:', err);
      }
    }
  }

  public async getStatus(workdir: string): Promise<GitRepoStatus> {
    if (!workdir || !workdir.trim() || workdir === 'no_project') {
      return {
        isRepo: false,
        branch: '',
        ahead: 0,
        behind: 0,
        staged: [],
        unstaged: [],
        untracked: [],
        clean: true,
        totalChanges: 0,
      };
    }
    const isRepo = await this.isGitRepo(workdir);
    if (!isRepo) {
      return {
        isRepo: false,
        branch: '',
        ahead: 0,
        behind: 0,
        staged: [],
        unstaged: [],
        untracked: [],
        clean: true,
        totalChanges: 0,
      };
    }

    const { stdout } = await this.execGit(workdir, ['status', '--porcelain=v1', '-b', '-uall']);
    const lines = stdout.split(/\r?\n/).filter(Boolean);

    let branch = 'HEAD';
    let upstream: string | undefined;
    let ahead = 0;
    let behind = 0;

    const staged: GitFileChange[] = [];
    const unstaged: GitFileChange[] = [];
    const untracked: GitFileChange[] = [];

    for (const line of lines) {
      if (line.startsWith('## ')) {
        // Parse header: ## main...origin/main [ahead 1, behind 2]
        const header = line.substring(3).trim();
        if (header.startsWith('No commits yet on ')) {
          branch = header.replace('No commits yet on ', '').trim();
        } else {
          const branchPart = header.split(' ')[0] || '';
          const dotsIdx = branchPart.indexOf('...');
          if (dotsIdx !== -1) {
            branch = branchPart.substring(0, dotsIdx);
            upstream = branchPart.substring(dotsIdx + 3);
          } else {
            branch = branchPart;
          }
        }

        const aheadMatch = header.match(/ahead (\d+)/);
        if (aheadMatch) ahead = parseInt(aheadMatch[1], 10);
        const behindMatch = header.match(/behind (\d+)/);
        if (behindMatch) behind = parseInt(behindMatch[1], 10);
        continue;
      }

      const indexStatus = line[0];
      const worktreeStatus = line[1];
      const rawPath = line.substring(3).trim();

      // Handle renames: "old -> new"
      let filePath = rawPath;
      let oldPath: string | undefined;
      if (rawPath.includes(' -> ')) {
        const parts = rawPath.split(' -> ');
        oldPath = parts[0].replace(/^["']|["']$/g, '');
        filePath = parts[1].replace(/^["']|["']$/g, '');
      } else {
        filePath = rawPath.replace(/^["']|["']$/g, '');
      }

      // Skip directory entries
      if (filePath.endsWith('/') || filePath.endsWith('\\')) {
        continue;
      }

      if (indexStatus === '?' && worktreeStatus === '?') {
        untracked.push({
          path: filePath,
          status: 'untracked',
          statusCode: '??',
          staged: false,
        });
        continue;
      }

      // Staged changes (Index status is not space and not ?)
      if (indexStatus && indexStatus !== ' ' && indexStatus !== '?') {
        let status: GitFileChange['status'] = 'modified';
        if (indexStatus === 'A') status = 'added';
        else if (indexStatus === 'D') status = 'deleted';
        else if (indexStatus === 'R') status = 'renamed';

        staged.push({
          path: filePath,
          oldPath,
          status,
          statusCode: indexStatus,
          staged: true,
        });
      }

      // Unstaged changes (Worktree status is not space and not ?)
      if (worktreeStatus && worktreeStatus !== ' ' && worktreeStatus !== '?') {
        let status: GitFileChange['status'] = 'modified';
        if (worktreeStatus === 'D') status = 'deleted';

        unstaged.push({
          path: filePath,
          status,
          statusCode: worktreeStatus,
          staged: false,
        });
      }
    }

    const totalChanges = staged.length + unstaged.length + untracked.length;

    return {
      isRepo: true,
      branch,
      upstream,
      ahead,
      behind,
      staged,
      unstaged,
      untracked,
      clean: totalChanges === 0,
      totalChanges,
    };
  }

  public async getFileDiff(
    workdir: string,
    filePath: string,
    staged: boolean
  ): Promise<GitFileDiffResult> {
    const cleanPath = filePath.replace(/\\/g, '/').replace(/^\/+/, '');
    const fullPath = path.join(workdir, cleanPath);

    let originalContent = '';
    let currentContent = '';
    let unifiedDiff = '';

    // If staged
    if (staged) {
      try {
        // Original: HEAD:<path>
        const { stdout: orig } = await this.execGit(workdir, ['show', `HEAD:${cleanPath}`]);
        originalContent = orig;
      } catch {
        originalContent = '';
      }

      try {
        // Current: Staged index :<path>
        const { stdout: curr } = await this.execGit(workdir, ['show', `:${cleanPath}`]);
        currentContent = curr;
      } catch {
        currentContent = '';
      }

      try {
        const { stdout: diff } = await this.execGit(workdir, ['diff', '--cached', '--', cleanPath]);
        unifiedDiff = diff;
      } catch {
        unifiedDiff = '';
      }
    } else {
      // Unstaged or untracked
      try {
        // Original: Staged :<path> or HEAD:<path>
        const { stdout: orig } = await this.execGit(workdir, ['show', `:${cleanPath}`]);
        originalContent = orig;
      } catch {
        try {
          const { stdout: origHead } = await this.execGit(workdir, ['show', `HEAD:${cleanPath}`]);
          originalContent = origHead;
        } catch {
          originalContent = '';
        }
      }

      if (fs.existsSync(fullPath)) {
        try {
          const stat = fs.statSync(fullPath);
          if (!stat.isDirectory()) {
            currentContent = fs.readFileSync(fullPath, 'utf-8');
          }
        } catch {
          currentContent = '';
        }
      }

      try {
        const { stdout: diff } = await this.execGit(workdir, ['diff', '--', cleanPath]);
        unifiedDiff = diff;
      } catch {
        unifiedDiff = '';
      }
    }

    // Normalize CRLF to LF for reliable diffing and no line ending mismatch
    originalContent = originalContent.replace(/\r\n/g, '\n');
    currentContent = currentContent.replace(/\r\n/g, '\n');

    if (!unifiedDiff && (originalContent || currentContent)) {
      unifiedDiff = createTwoFilesPatch(
        `a/${cleanPath}`,
        `b/${cleanPath}`,
        originalContent,
        currentContent
      );
    }

    if (unifiedDiff) {
      unifiedDiff = unifiedDiff.replace(/\r\n/g, '\n');
    }

    return {
      filePath: cleanPath,
      staged,
      originalContent,
      currentContent,
      unifiedDiff,
    };
  }

  public async stageFiles(workdir: string, filePaths: string[]): Promise<void> {
    if (filePaths.length === 0) return;
    await this.execGit(workdir, ['add', '--', ...filePaths]);
  }

  public async unstageFiles(workdir: string, filePaths: string[]): Promise<void> {
    if (filePaths.length === 0) return;
    await this.execGit(workdir, ['reset', 'HEAD', '--', ...filePaths]);
  }

  public async stageAll(workdir: string): Promise<void> {
    await this.execGit(workdir, ['add', '-A']);
  }

  public async unstageAll(workdir: string): Promise<void> {
    await this.execGit(workdir, ['reset', 'HEAD']);
  }

  public async ensureIdentity(workdir: string): Promise<void> {
    try {
      const { stdout: name } = await this.execGit(workdir, ['config', 'user.name']);
      if (!name.trim()) {
        await this.execGit(workdir, ['config', 'user.name', 'Aidev User']);
      }
    } catch {
      try {
        await this.execGit(workdir, ['config', 'user.name', 'Aidev User']);
      } catch {}
    }

    try {
      const { stdout: email } = await this.execGit(workdir, ['config', 'user.email']);
      if (!email.trim()) {
        await this.execGit(workdir, ['config', 'user.email', 'user@aidev.local']);
      }
    } catch {
      try {
        await this.execGit(workdir, ['config', 'user.email', 'user@aidev.local']);
      } catch {}
    }
  }

  public async commit(workdir: string, message: string): Promise<string> {
    const trimmed = message.trim();
    if (!trimmed) {
      throw new Error('Commit message cannot be empty.');
    }
    await this.ensureIdentity(workdir);
    const { stdout } = await this.execGit(workdir, ['commit', '-m', trimmed]);
    return stdout;
  }

  public async push(
    workdir: string,
    remote = 'origin',
    branch?: string
  ): Promise<{ success: boolean; output: string; requiresAuth?: boolean }> {
    let targetBranch = branch;
    if (!targetBranch) {
      const status = await this.getStatus(workdir);
      targetBranch = status.branch || 'main';
    }

    try {
      // First attempt standard push
      const { stdout, stderr } = await this.execGit(workdir, ['push', remote, targetBranch]);
      return { success: true, output: stdout || stderr };
    } catch (err: any) {
      const msg = err.message || '';

      // Check if branch has no upstream branch
      if (msg.includes('no upstream branch') || msg.includes('has no upstream') || msg.includes('--set-upstream')) {
        try {
          const { stdout, stderr } = await this.execGit(workdir, [
            'push',
            '--set-upstream',
            remote,
            targetBranch,
          ]);
          return { success: true, output: stdout || stderr };
        } catch (upstreamErr: any) {
          return this.handlePushError(upstreamErr);
        }
      }

      return this.handlePushError(err);
    }
  }

  private handlePushError(err: any): { success: false; output: string; requiresAuth: boolean } {
    const msg = err.message || err.stderr || err.stdout || '';
    const isAuth =
      msg.includes('Permission to') ||
      msg.includes('Authentication failed') ||
      msg.includes('could not read Username') ||
      msg.includes('terminal prompts disabled') ||
      msg.includes('fatal: could not read Password') ||
      msg.includes('Invalid username or password') ||
      msg.includes('denied');

    const cleanErr = new Error(msg) as any;
    cleanErr.requiresAuth = isAuth;
    throw cleanErr;
  }

  public async getFullDiffForAI(workdir: string): Promise<string> {
    // 1. Try staged diff first
    try {
      const { stdout: stagedDiff } = await this.execGit(workdir, ['diff', '--cached']);
      if (stagedDiff.trim()) {
        return stagedDiff.trim();
      }
    } catch {}

    // 2. Fallback to unstaged diff
    try {
      const { stdout: unstagedDiff } = await this.execGit(workdir, ['diff']);
      if (unstagedDiff.trim()) {
        return unstagedDiff.trim();
      }
    } catch {}

    // 3. Fallback: check status and list of changed files
    try {
      const status = await this.getStatus(workdir);
      if (status.totalChanges > 0) {
        const filesList = [
          ...status.staged.map((f) => `Staged: ${f.path} (${f.status})`),
          ...status.unstaged.map((f) => `Modified: ${f.path}`),
          ...status.untracked.map((f) => `Untracked: ${f.path}`),
        ].join('\n');
        return filesList;
      }
    } catch {}

    return '';
  }

  public async listBranches(workdir: string): Promise<GitBranchesResult> {
    const isRepo = await this.isGitRepo(workdir);
    if (!isRepo) {
      return { current: '', local: [], remote: [] };
    }

    // 1. Current branch
    let current = '';
    try {
      const status = await this.getStatus(workdir);
      current = status.branch;
    } catch {}

    if (!current) {
      try {
        const { stdout } = await this.execGit(workdir, ['symbolic-ref', '--short', 'HEAD']);
        current = stdout.trim();
      } catch {
        current = 'HEAD';
      }
    }

    // 2. Local branches
    const localSet = new Set<string>();
    if (current && current !== 'HEAD') {
      localSet.add(current);
    }

    try {
      const { stdout } = await this.execGit(workdir, ['branch', '--list', '--format=%(refname:short)']);
      const lines = stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      for (const b of lines) {
        localSet.add(b);
      }
    } catch {}

    // 3. Remote branches
    const remoteList: string[] = [];
    try {
      const { stdout } = await this.execGit(workdir, ['branch', '-r', '--format=%(refname:short)']);
      const lines = stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      for (const b of lines) {
        if (!b.includes('HEAD')) {
          remoteList.push(b);
        }
      }
    } catch {}

    return {
      current,
      local: Array.from(localSet),
      remote: remoteList,
    };
  }

  public async checkoutBranch(workdir: string, branchName: string): Promise<string> {
    const target = branchName.trim();
    if (!target) {
      throw new Error('Branch name cannot be empty.');
    }

    try {
      const { stdout, stderr } = await this.execGit(workdir, ['checkout', target]);
      return (stdout + '\n' + stderr).trim();
    } catch (err: any) {
      const msg = err.message || err.stderr || '';
      // If it's an unborn repository with no commits, git checkout can fail with pathspec
      if (msg.includes('did not match any file(s) known to git')) {
        try {
          const { stdout, stderr } = await this.execGit(workdir, ['checkout', '-b', target]);
          return (stdout + '\n' + stderr).trim();
        } catch (innerErr: any) {
          throw innerErr;
        }
      }
      throw err;
    }
  }

  public async createBranch(workdir: string, branchName: string, checkout = true): Promise<string> {
    const target = branchName.trim();
    if (!target) {
      throw new Error('Branch name cannot be empty.');
    }

    if (checkout) {
      const { stdout, stderr } = await this.execGit(workdir, ['checkout', '-b', target]);
      return (stdout + '\n' + stderr).trim();
    } else {
      const { stdout, stderr } = await this.execGit(workdir, ['branch', target]);
      return (stdout + '\n' + stderr).trim();
    }
  }

  public async deleteBranch(workdir: string, branchName: string, force = false): Promise<string> {
    const target = branchName.trim();
    if (!target) {
      throw new Error('Branch name cannot be empty.');
    }
    const currentStatus = await this.getStatus(workdir);
    if (target === currentStatus.branch) {
      throw new Error(`Cannot delete active branch '${target}'. Please switch to another branch first.`);
    }
    const { stdout, stderr } = await this.execGit(workdir, ['branch', force ? '-D' : '-d', target]);
    return (stdout + '\n' + stderr).trim();
  }

  public async discardFiles(workdir: string, filePaths: string[]): Promise<void> {
    if (filePaths.length === 0) return;

    for (const rawPath of filePaths) {
      const cleanPath = rawPath.replace(/\\/g, '/').replace(/^\/+/, '');
      const fullPath = path.join(workdir, cleanPath);

      try {
        await this.execGit(workdir, ['reset', 'HEAD', '--', cleanPath]);
      } catch {}

      let isTracked = false;
      try {
        await this.execGit(workdir, ['ls-files', '--error-unmatch', '--', cleanPath]);
        isTracked = true;
      } catch {
        isTracked = false;
      }

      if (isTracked) {
        try {
          await this.execGit(workdir, ['checkout', 'HEAD', '--', cleanPath]);
        } catch {
          await this.execGit(workdir, ['restore', '--staged', '--worktree', '--', cleanPath]);
        }
      } else {
        if (fs.existsSync(fullPath)) {
          try {
            const stat = fs.statSync(fullPath);
            if (stat.isDirectory()) {
              fs.rmSync(fullPath, { recursive: true, force: true });
            } else {
              fs.unlinkSync(fullPath);
            }
          } catch {
            await this.execGit(workdir, ['clean', '-f', '-d', '--', cleanPath]);
          }
        }
      }
    }
  }

  public async discardAll(workdir: string): Promise<void> {
    try {
      await this.execGit(workdir, ['reset', 'HEAD']);
    } catch {}

    try {
      await this.execGit(workdir, ['checkout', 'HEAD', '--', '.']);
    } catch {
      try {
        await this.execGit(workdir, ['restore', '.']);
      } catch {}
    }

    try {
      await this.execGit(workdir, ['clean', '-fd']);
    } catch {}
  }

  public async pull(
    workdir: string,
    remote = 'origin',
    branch?: string
  ): Promise<{ success: boolean; output: string; requiresAuth?: boolean }> {
    let targetBranch = branch;
    if (!targetBranch) {
      const status = await this.getStatus(workdir);
      targetBranch = status.branch || 'main';
    }

    try {
      const { stdout, stderr } = await this.execGit(workdir, ['pull', remote, targetBranch]);
      return { success: true, output: stdout || stderr };
    } catch (err: any) {
      return this.handlePushError(err);
    }
  }

  public async fetch(
    workdir: string,
    remote = 'origin'
  ): Promise<{ success: boolean; output: string }> {
    try {
      const { stdout, stderr } = await this.execGit(workdir, ['fetch', remote]);
      return { success: true, output: stdout || stderr };
    } catch (err: any) {
      const msg = err.message || err.stderr || '';
      throw new Error(msg.trim() || 'Failed to fetch from remote.');
    }
  }

  public async getLog(workdir: string, maxCount = 50): Promise<GitCommitLog[]> {
    const isRepo = await this.isGitRepo(workdir);
    if (!isRepo) return [];

    try {
      const { stdout } = await this.execGit(workdir, [
        'log',
        `-n${maxCount}`,
        '--pretty=format:%H\x1f%h\x1f%an\x1f%ae\x1f%aI\x1f%ar\x1f%s\x1f%D',
      ]);

      if (!stdout.trim()) return [];

      const lines = stdout.split(/\r?\n/).filter(Boolean);
      const logs: GitCommitLog[] = [];

      for (const line of lines) {
        const parts = line.split('\x1f');
        if (parts.length >= 7) {
          const rawRefs = parts[7] || '';
          const refs = rawRefs
            ? rawRefs.split(',').map((r) => r.trim()).filter(Boolean)
            : [];

          logs.push({
            hash: parts[0],
            shortHash: parts[1],
            authorName: parts[2],
            authorEmail: parts[3],
            date: parts[4],
            relativeDate: parts[5],
            message: parts[6],
            refs,
          });
        }
      }

      return logs;
    } catch {
      return [];
    }
  }

  public async getCommitDetail(workdir: string, hash: string): Promise<GitCommitDetail> {
    const cleanHash = hash.trim();
    if (!cleanHash) {
      throw new Error('Commit hash cannot be empty.');
    }

    const { stdout: headerOut } = await this.execGit(workdir, [
      'show',
      '-s',
      '--pretty=format:%H\x1f%h\x1f%an\x1f%ae\x1f%aI\x1f%ar\x1f%s\x1f%D\x1f%b',
      cleanHash,
    ]);

    const parts = headerOut.split('\x1f');
    const rawRefs = parts[7] || '';
    const refs = rawRefs
      ? rawRefs.split(',').map((r) => r.trim()).filter(Boolean)
      : [];

    const baseLog: GitCommitLog = {
      hash: parts[0] || cleanHash,
      shortHash: parts[1] || cleanHash.substring(0, 7),
      authorName: parts[2] || '',
      authorEmail: parts[3] || '',
      date: parts[4] || '',
      relativeDate: parts[5] || '',
      message: parts[6] || '',
      refs,
    };
    const body = (parts[8] || '').trim();

    const files: GitCommitFileChange[] = [];
    try {
      const { stdout: treeOut } = await this.execGit(workdir, [
        'diff-tree',
        '--root',
        '--no-commit-id',
        '--name-status',
        '-r',
        '-M',
        cleanHash,
      ]);

      const lines = treeOut.split(/\r?\n/).filter(Boolean);
      for (const line of lines) {
        const tokens = line.split('\t');
        if (tokens.length >= 2) {
          const code = tokens[0][0];
          let status: GitCommitFileChange['status'] = 'modified';
          if (code === 'A') status = 'added';
          else if (code === 'D') status = 'deleted';
          else if (code === 'R') status = 'renamed';

          if (code === 'R' && tokens.length >= 3) {
            files.push({
              path: tokens[2],
              oldPath: tokens[1],
              status: 'renamed',
            });
          } else {
            files.push({
              path: tokens[1],
              status,
            });
          }
        }
      }
    } catch {}

    return {
      ...baseLog,
      body,
      files,
    };
  }

  public async getCommitFileDiff(
    workdir: string,
    hash: string,
    filePath: string
  ): Promise<GitFileDiffResult> {
    const cleanPath = filePath.replace(/\\/g, '/').replace(/^\/+/, '');
    const cleanHash = hash.trim();

    let originalContent = '';
    let currentContent = '';
    let unifiedDiff = '';

    try {
      const { stdout: orig } = await this.execGit(workdir, ['show', `${cleanHash}^:${cleanPath}`]);
      originalContent = orig;
    } catch {
      originalContent = '';
    }

    try {
      const { stdout: curr } = await this.execGit(workdir, ['show', `${cleanHash}:${cleanPath}`]);
      currentContent = curr;
    } catch {
      currentContent = '';
    }

    try {
      const { stdout: diff } = await this.execGit(workdir, [
        'diff',
        `${cleanHash}^`,
        cleanHash,
        '--',
        cleanPath,
      ]);
      unifiedDiff = diff;
    } catch {
      try {
        const { stdout: diffFirst } = await this.execGit(workdir, [
          'show',
          cleanHash,
          '--',
          cleanPath,
        ]);
        unifiedDiff = diffFirst;
      } catch {
        unifiedDiff = '';
      }
    }

    originalContent = originalContent.replace(/\r\n/g, '\n');
    currentContent = currentContent.replace(/\r\n/g, '\n');

    if (!unifiedDiff && (originalContent || currentContent)) {
      unifiedDiff = createTwoFilesPatch(
        `a/${cleanPath}`,
        `b/${cleanPath}`,
        originalContent,
        currentContent
      );
    }

    if (unifiedDiff) {
      unifiedDiff = unifiedDiff.replace(/\r\n/g, '\n');
    }

    return {
      filePath: cleanPath,
      staged: false,
      originalContent,
      currentContent,
      unifiedDiff,
    };
  }

  public async stashList(workdir: string): Promise<GitStashItem[]> {
    const isRepo = await this.isGitRepo(workdir);
    if (!isRepo) return [];

    try {
      const { stdout } = await this.execGit(workdir, ['stash', 'list', '--pretty=format:%gd\x1f%s\x1f%ar']);
      if (!stdout.trim()) return [];

      const lines = stdout.split(/\r?\n/).filter(Boolean);
      const items: GitStashItem[] = [];

      lines.forEach((line, index) => {
        const parts = line.split('\x1f');
        if (parts.length >= 2) {
          items.push({
            index,
            name: parts[0] || `stash@{${index}}`,
            message: parts[1] || 'WIP on branch',
            date: parts[2] || '',
          });
        }
      });

      return items;
    } catch {
      return [];
    }
  }

  public async stashSave(workdir: string, message?: string): Promise<string> {
    const args = ['stash', 'push'];
    if (message && message.trim()) {
      args.push('-m', message.trim());
    }
    const { stdout, stderr } = await this.execGit(workdir, args);
    return (stdout + '\n' + stderr).trim();
  }

  public async stashPop(workdir: string, index = 0): Promise<string> {
    const { stdout, stderr } = await this.execGit(workdir, ['stash', 'pop', `stash@{${index}}`]);
    return (stdout + '\n' + stderr).trim();
  }

  public async stashDrop(workdir: string, index = 0): Promise<string> {
    const { stdout, stderr } = await this.execGit(workdir, ['stash', 'drop', `stash@{${index}}`]);
    return (stdout + '\n' + stderr).trim();
  }
}

export const gitService = GitService.getInstance();
