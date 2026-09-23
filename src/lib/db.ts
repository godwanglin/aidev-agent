import fs from 'fs';
import path from 'path';
import { DatabaseSync } from 'node:sqlite';
import { getStoragePaths, ensureStorageInitialized, getChatStorage } from './storage';

export interface ProjectRecord {
  id: string;
  name: string;
  workdir_path: string;
  created_at: number;
  last_opened_at: number;
}

export interface SessionRecord {
  id: string;
  project_id: string;
  title: string;
  model_id: string;
  permission_mode: 'ASK' | 'AUTO' | 'FULL_ACCESS';
  created_at: number;
  updated_at: number;
  is_unread?: number;
}

export interface MessageRecord {
  id: string;
  session_id: string;
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  reasoning_content?: string | null;
  tool_call_id?: string | null;
  tool_name?: string | null;
  tool_arguments?: string | null;
  tool_result?: string | null;
  status?: string;
  created_at: number;
}

export interface SnapshotRecord {
  id: string;
  session_id: string;
  message_id: string;
  file_path: string;
  diff_stat_additions: number;
  diff_stat_deletions: number;
  backup_file_path: string;
  status: 'ACTIVE' | 'REVERTED';
  created_at: number;
}

export interface SubagentRecord {
  id: string;
  parent_session_id: string;
  role_name: string;
  task_description: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  started_at: number;
  completed_at: number | null;
}

export interface PermissionAuditRecord {
  id: string;
  session_id: string;
  action_type: 'COMMAND' | 'FILE_WRITE' | 'WEB_ACCESS';
  target_resource: string;
  decision: 'APPROVED' | 'REJECTED' | 'AUTO_ALLOWED';
  created_at: number;
}

export interface BackgroundTaskRecord {
  id: string;
  session_id?: string | null;
  project_id?: string | null;
  command: string;
  workdir: string;
  status: 'RUNNING' | 'COMPLETED' | 'STOPPED' | 'FAILED';
  pid?: number | null;
  log_path: string;
  exit_code?: number | null;
  created_at: number;
  completed_at?: number | null;
}

export interface SessionCompactionRecord {
  id: string;
  session_id: string;
  summary: string;
  first_message_id?: string | null;
  last_compacted_message_id: string;
  tokens_before: number;
  tokens_after: number;
  tokens_saved: number;
  created_at: number;
}

export interface TodoItem {
  id: string;
  title: string;
  status: 'pending' | 'in_progress' | 'completed';
}

export interface SessionTodosRecord {
  session_id: string;
  todos_json: string;
  updated_at: number;
}

let dbInstance: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (dbInstance) return dbInstance;

  ensureStorageInitialized();
  const { dbFile } = getStoragePaths();

  dbInstance = new DatabaseSync(dbFile);

  // Enable WAL and Foreign Keys
  dbInstance.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      workdir_path TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL,
      last_opened_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      title TEXT NOT NULL,
      model_id TEXT NOT NULL,
      permission_mode TEXT NOT NULL DEFAULT 'AUTO',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      is_unread INTEGER DEFAULT 0,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT,
      reasoning_content TEXT,
      tool_call_id TEXT,
      tool_name TEXT,
      tool_arguments TEXT,
      tool_result TEXT,
      status TEXT DEFAULT 'COMPLETED',
      created_at INTEGER NOT NULL,
      FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS snapshots (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      file_path TEXT NOT NULL,
      diff_stat_additions INTEGER NOT NULL DEFAULT 0,
      diff_stat_deletions INTEGER NOT NULL DEFAULT 0,
      backup_file_path TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      created_at INTEGER NOT NULL,
      FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS subagents (
      id TEXT PRIMARY KEY,
      parent_session_id TEXT NOT NULL,
      role_name TEXT NOT NULL,
      task_description TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'RUNNING',
      started_at INTEGER NOT NULL,
      completed_at INTEGER,
      FOREIGN KEY(parent_session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS permission_audit (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      action_type TEXT NOT NULL,
      target_resource TEXT NOT NULL,
      decision TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS background_tasks (
      id TEXT PRIMARY KEY,
      session_id TEXT,
      project_id TEXT,
      command TEXT NOT NULL,
      workdir TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'RUNNING',
      pid INTEGER,
      log_path TEXT NOT NULL,
      exit_code INTEGER,
      created_at INTEGER NOT NULL,
      completed_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS session_compactions (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      summary TEXT NOT NULL,
      first_message_id TEXT,
      last_compacted_message_id TEXT NOT NULL,
      tokens_before INTEGER NOT NULL DEFAULT 0,
      tokens_after INTEGER NOT NULL DEFAULT 0,
      tokens_saved INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS session_todos (
      session_id TEXT PRIMARY KEY,
      todos_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  try {
    const tableInfo = dbInstance.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='session_todos'").get() as { sql?: string } | undefined;
    if (tableInfo?.sql && tableInfo.sql.includes('FOREIGN KEY')) {
      dbInstance.exec('DROP TABLE session_todos;');
      dbInstance.exec(`
        CREATE TABLE IF NOT EXISTS session_todos (
          session_id TEXT PRIMARY KEY,
          todos_json TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        );
      `);
    }
  } catch {}

  try {
    dbInstance.exec('ALTER TABLE sessions ADD COLUMN is_unread INTEGER DEFAULT 0;');
  } catch {
    // Column already exists
  }

  return dbInstance;
}

// Helper methods for Projects
export const projectRepo = {
  list(): ProjectRecord[] {
    const db = getDb();
    const stmt = db.prepare('SELECT * FROM projects ORDER BY last_opened_at DESC');
    return stmt.all() as unknown as ProjectRecord[];
  },
  getById(id: string): ProjectRecord | undefined {
    const db = getDb();
    const stmt = db.prepare('SELECT * FROM projects WHERE id = ?');
    return stmt.get(id) as unknown as ProjectRecord | undefined;
  },
  getByPath(workdir: string): ProjectRecord | undefined {
    const db = getDb();
    const stmt = db.prepare('SELECT * FROM projects WHERE workdir_path = ?');
    return stmt.get(workdir) as unknown as ProjectRecord | undefined;
  },
  upsert(project: ProjectRecord): ProjectRecord {
    const db = getDb();
    const existing = this.getByPath(project.workdir_path);
    if (existing) {
      const stmt = db.prepare(`
        UPDATE projects SET name = ?, last_opened_at = ? WHERE id = ?
      `);
      stmt.run(project.name, project.last_opened_at, existing.id);
      return { ...existing, name: project.name, last_opened_at: project.last_opened_at };
    } else {
      const stmt = db.prepare(`
        INSERT INTO projects (id, name, workdir_path, created_at, last_opened_at)
        VALUES (?, ?, ?, ?, ?)
      `);
      stmt.run(project.id, project.name, project.workdir_path, project.created_at, project.last_opened_at);
      return project;
    }
  },
  update(id: string, updates: Partial<Pick<ProjectRecord, 'name' | 'workdir_path'>>): ProjectRecord | undefined {
    const db = getDb();
    const existing = this.getById(id);
    if (!existing) return undefined;
    const name = updates.name !== undefined ? updates.name : existing.name;
    const workdir_path = updates.workdir_path !== undefined ? updates.workdir_path : existing.workdir_path;
    const stmt = db.prepare(`
      UPDATE projects SET name = ?, workdir_path = ? WHERE id = ?
    `);
    stmt.run(name, workdir_path, id);
    return { ...existing, name, workdir_path };
  },
  delete(id: string): boolean {
    const db = getDb();
    const existing = this.getById(id);
    if (!existing) return false;

    // 1. Clean up session runtime files & audits
    const sessions = sessionRepo.list(id);
    const { snapshots: snapshotsRootDir, projects: projectsRootDir } = getStoragePaths();

    for (const s of sessions) {
      try {
        const chatStorage = getChatStorage(id, s.id);
        if (fs.existsSync(chatStorage.base)) {
          fs.rmSync(chatStorage.base, { recursive: true, force: true });
        }
      } catch (err) {
        console.warn(`[projectRepo.delete] Failed to remove chat storage for session ${s.id}:`, err);
      }

      try {
        const sessionSnapDir = path.join(snapshotsRootDir, s.id);
        if (fs.existsSync(sessionSnapDir)) {
          fs.rmSync(sessionSnapDir, { recursive: true, force: true });
        }
      } catch (err) {
        console.warn(`[projectRepo.delete] Failed to remove snapshots for session ${s.id}:`, err);
      }

      try {
        db.prepare('DELETE FROM permission_audit WHERE session_id = ?').run(s.id);
      } catch {}
    }

    // 2. Clean up project runtime folder in .aidev/projects/<id>
    try {
      const projectRuntimeDir = path.join(projectsRootDir, id);
      if (fs.existsSync(projectRuntimeDir)) {
        fs.rmSync(projectRuntimeDir, { recursive: true, force: true });
      }
    } catch (err) {
      console.warn(`[projectRepo.delete] Failed to remove project runtime dir ${id}:`, err);
    }

    // 3. Clean up background tasks
    try {
      db.prepare('DELETE FROM background_tasks WHERE project_id = ?').run(id);
    } catch {}

    // 4. Delete sessions explicitly
    try {
      db.prepare('DELETE FROM sessions WHERE project_id = ?').run(id);
    } catch {}

    // 5. Delete project from DB
    const stmt = db.prepare('DELETE FROM projects WHERE id = ?');
    stmt.run(id);

    // 6. Clean up projects/index.json if present
    try {
      const { projectsIndex } = getStoragePaths();
      if (fs.existsSync(projectsIndex)) {
        const raw = fs.readFileSync(projectsIndex, 'utf-8');
        const list = JSON.parse(raw);
        if (Array.isArray(list)) {
          const updated = list.filter((p: any) => p.id !== id);
          fs.writeFileSync(projectsIndex, JSON.stringify(updated, null, 2), 'utf-8');
        }
      }
    } catch {}

    return true;
  },
};

// Helper methods for Sessions
export const sessionRepo = {
  list(projectId?: string): SessionRecord[] {
    const db = getDb();
    if (projectId) {
      const stmt = db.prepare('SELECT * FROM sessions WHERE project_id = ? ORDER BY updated_at DESC');
      return stmt.all(projectId) as unknown as SessionRecord[];
    }
    const stmt = db.prepare('SELECT * FROM sessions ORDER BY updated_at DESC');
    return stmt.all() as unknown as SessionRecord[];
  },
  getById(id: string): SessionRecord | undefined {
    const db = getDb();
    const stmt = db.prepare('SELECT * FROM sessions WHERE id = ?');
    return stmt.get(id) as unknown as SessionRecord | undefined;
  },
  create(session: SessionRecord): void {
    const db = getDb();
    const stmt = db.prepare(`
      INSERT INTO sessions (id, project_id, title, model_id, permission_mode, created_at, updated_at, is_unread)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      session.id,
      session.project_id,
      session.title,
      session.model_id,
      session.permission_mode,
      session.created_at,
      session.updated_at,
      session.is_unread ?? 0
    );
  },
  update(id: string, updates: Partial<SessionRecord>): void {
    const db = getDb();
    const fields: string[] = [];
    const values: any[] = [];
    for (const [key, value] of Object.entries(updates)) {
      if (key !== 'id') {
        fields.push(`${key} = ?`);
        values.push(value);
      }
    }
    if (fields.length === 0) return;
    fields.push('updated_at = ?');
    values.push(Date.now());
    values.push(id);
    const stmt = db.prepare(`UPDATE sessions SET ${fields.join(', ')} WHERE id = ?`);
    stmt.run(...values);
  },
  delete(id: string): void {
    const db = getDb();
    const session = sessionRepo.getById(id);
    const stmt = db.prepare('DELETE FROM sessions WHERE id = ?');
    stmt.run(id);
    try {
      db.prepare('DELETE FROM permission_audit WHERE session_id = ?').run(id);
    } catch {}
    try {
      if (session) {
        const chatStorage = getChatStorage(session.project_id, id);
        if (fs.existsSync(chatStorage.base)) {
          fs.rmSync(chatStorage.base, { recursive: true, force: true });
        }
      }
      const { snapshots: snapshotsRootDir } = getStoragePaths();
      const sessionSnapDir = path.join(snapshotsRootDir, id);
      if (fs.existsSync(sessionSnapDir)) {
        fs.rmSync(sessionSnapDir, { recursive: true, force: true });
      }
    } catch {}
  },
};

// Helper methods for Messages
export const messageRepo = {
  listBySession(sessionId: string): MessageRecord[] {
    const db = getDb();
    const stmt = db.prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC');
    return stmt.all(sessionId) as unknown as MessageRecord[];
  },
  listPaginatedBySession(
    sessionId: string,
    beforeCreatedAt?: number,
    limitTurns: number = 5
  ): { messages: MessageRecord[]; hasMore: boolean; totalTurns: number } {
    const db = getDb();
    const totalTurnsRow = db.prepare('SELECT count(*) as count FROM messages WHERE session_id = ? AND role = ?').get(sessionId, 'user') as { count: number } | undefined;
    const totalTurns = totalTurnsRow ? totalTurnsRow.count : 0;

    // If total turns is 0 or less than limit and no before cursor, return all
    if (totalTurns <= limitTurns && !beforeCreatedAt) {
      const allMsgs = db.prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC').all(sessionId) as unknown as MessageRecord[];
      return { messages: allMsgs, hasMore: false, totalTurns };
    }

    let userMsgs: Array<{ id: string; created_at: number }>;
    if (beforeCreatedAt) {
      const stmt = db.prepare('SELECT id, created_at FROM messages WHERE session_id = ? AND role = ? AND created_at < ? ORDER BY created_at DESC LIMIT ?');
      userMsgs = stmt.all(sessionId, 'user', beforeCreatedAt, limitTurns) as unknown as Array<{ id: string; created_at: number }>;
    } else {
      const stmt = db.prepare('SELECT id, created_at FROM messages WHERE session_id = ? AND role = ? ORDER BY created_at DESC LIMIT ?');
      userMsgs = stmt.all(sessionId, 'user', limitTurns) as unknown as Array<{ id: string; created_at: number }>;
    }

    if (userMsgs.length === 0) {
      if (beforeCreatedAt) {
        const remaining = db.prepare('SELECT * FROM messages WHERE session_id = ? AND created_at < ? ORDER BY created_at ASC').all(sessionId, beforeCreatedAt) as unknown as MessageRecord[];
        return { messages: remaining, hasMore: false, totalTurns };
      }
      const allMsgs = db.prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC').all(sessionId) as unknown as MessageRecord[];
      return { messages: allMsgs, hasMore: false, totalTurns };
    }

    const oldestTurnInBatch = userMsgs[userMsgs.length - 1];
    const remainingCheck = db.prepare('SELECT count(*) as count FROM messages WHERE session_id = ? AND role = ? AND created_at < ?').get(sessionId, 'user', oldestTurnInBatch.created_at) as { count: number } | undefined;
    const hasMore = (remainingCheck?.count || 0) > 0;

    let msgs: MessageRecord[];
    if (beforeCreatedAt) {
      if (!hasMore) {
        msgs = db.prepare('SELECT * FROM messages WHERE session_id = ? AND created_at < ? ORDER BY created_at ASC').all(sessionId, beforeCreatedAt) as unknown as MessageRecord[];
      } else {
        msgs = db.prepare('SELECT * FROM messages WHERE session_id = ? AND created_at >= ? AND created_at < ? ORDER BY created_at ASC').all(sessionId, oldestTurnInBatch.created_at, beforeCreatedAt) as unknown as MessageRecord[];
      }
    } else {
      msgs = db.prepare('SELECT * FROM messages WHERE session_id = ? AND created_at >= ? ORDER BY created_at ASC').all(sessionId, oldestTurnInBatch.created_at) as unknown as MessageRecord[];
    }

    return { messages: msgs, hasMore, totalTurns };
  },
  create(msg: MessageRecord): void {
    const db = getDb();
    const stmt = db.prepare(`
      INSERT INTO messages (id, session_id, role, content, reasoning_content, tool_call_id, tool_name, tool_arguments, tool_result, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      msg.id,
      msg.session_id,
      msg.role,
      msg.content ?? null,
      msg.reasoning_content ?? null,
      msg.tool_call_id ?? null,
      msg.tool_name ?? null,
      msg.tool_arguments ?? null,
      msg.tool_result ?? null,
      msg.status ?? 'COMPLETED',
      msg.created_at
    );
  },
  update(id: string, updates: Partial<MessageRecord>): void {
    const db = getDb();
    const fields: string[] = [];
    const values: any[] = [];
    for (const [key, value] of Object.entries(updates)) {
      if (key !== 'id') {
        fields.push(`${key} = ?`);
        values.push(value);
      }
    }
    if (fields.length === 0) return;
    values.push(id);
    const stmt = db.prepare(`UPDATE messages SET ${fields.join(', ')} WHERE id = ?`);
    stmt.run(...values);
  },
};

// Helper methods for Snapshots
export const snapshotRepo = {
  create(snap: SnapshotRecord): void {
    const db = getDb();
    const stmt = db.prepare(`
      INSERT INTO snapshots (id, session_id, message_id, file_path, diff_stat_additions, diff_stat_deletions, backup_file_path, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      snap.id,
      snap.session_id,
      snap.message_id,
      snap.file_path,
      snap.diff_stat_additions,
      snap.diff_stat_deletions,
      snap.backup_file_path,
      snap.status,
      snap.created_at
    );
  },
  listBySession(sessionId: string): SnapshotRecord[] {
    const db = getDb();
    const stmt = db.prepare('SELECT * FROM snapshots WHERE session_id = ? ORDER BY created_at DESC');
    return stmt.all(sessionId) as unknown as SnapshotRecord[];
  },
  getById(id: string): SnapshotRecord | undefined {
    const db = getDb();
    const stmt = db.prepare('SELECT * FROM snapshots WHERE id = ? LIMIT 1');
    return stmt.get(id) as unknown as SnapshotRecord | undefined;
  },
  getLatestForFile(sessionId: string, filePath: string): SnapshotRecord | undefined {
    const db = getDb();
    const stmt = db.prepare('SELECT * FROM snapshots WHERE session_id = ? AND file_path = ? AND status = "ACTIVE" ORDER BY created_at DESC LIMIT 1');
    return stmt.get(sessionId, filePath) as unknown as SnapshotRecord | undefined;
  },
  updateStatus(id: string, status: 'ACTIVE' | 'REVERTED'): void {
    const db = getDb();
    const stmt = db.prepare('UPDATE snapshots SET status = ? WHERE id = ?');
    stmt.run(status, id);
  }
};

// Helper methods for Subagents
export const subagentRepo = {
  create(sub: SubagentRecord): void {
    const db = getDb();
    const stmt = db.prepare(`
      INSERT INTO subagents (id, parent_session_id, role_name, task_description, status, started_at, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(sub.id, sub.parent_session_id, sub.role_name, sub.task_description, sub.status, sub.started_at, sub.completed_at);
  },
  listBySession(sessionId: string): SubagentRecord[] {
    const db = getDb();
    const stmt = db.prepare('SELECT * FROM subagents WHERE parent_session_id = ? ORDER BY started_at ASC');
    return stmt.all(sessionId) as unknown as SubagentRecord[];
  },
  updateStatus(id: string, status: SubagentRecord['status']): void {
    const db = getDb();
    const stmt = db.prepare('UPDATE subagents SET status = ?, completed_at = ? WHERE id = ?');
    stmt.run(status, Date.now(), id);
  },
};

// Helper methods for Audit
export const auditRepo = {
  record(audit: PermissionAuditRecord): void {
    const db = getDb();
    const stmt = db.prepare(`
      INSERT INTO permission_audit (id, session_id, action_type, target_resource, decision, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(audit.id, audit.session_id, audit.action_type, audit.target_resource, audit.decision, audit.created_at);
  },
  listBySession(sessionId: string): PermissionAuditRecord[] {
    const db = getDb();
    const stmt = db.prepare('SELECT * FROM permission_audit WHERE session_id = ? ORDER BY created_at DESC');
    return stmt.all(sessionId) as unknown as PermissionAuditRecord[];
  },
};

// Helper methods for Background Tasks
export const taskRepo = {
  create(task: BackgroundTaskRecord): void {
    const db = getDb();
    const stmt = db.prepare(`
      INSERT INTO background_tasks (id, session_id, project_id, command, workdir, status, pid, log_path, exit_code, created_at, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      task.id,
      task.session_id || null,
      task.project_id || null,
      task.command,
      task.workdir,
      task.status,
      task.pid || null,
      task.log_path,
      task.exit_code ?? null,
      task.created_at,
      task.completed_at || null
    );
  },
  update(id: string, updates: Partial<BackgroundTaskRecord>): void {
    const db = getDb();
    const keys = Object.keys(updates);
    if (keys.length === 0) return;
    const setClause = keys.map((k) => `${k} = ?`).join(', ');
    const values = keys.map((k) => (updates as any)[k]);
    values.push(id);
    const stmt = db.prepare(`UPDATE background_tasks SET ${setClause} WHERE id = ?`);
    stmt.run(...values);
  },
  getById(id: string): BackgroundTaskRecord | undefined {
    const db = getDb();
    const stmt = db.prepare('SELECT * FROM background_tasks WHERE id = ?');
    return stmt.get(id) as unknown as BackgroundTaskRecord | undefined;
  },
  list(filter?: { sessionId?: string; projectId?: string }): BackgroundTaskRecord[] {
    const db = getDb();
    if (filter?.sessionId) {
      const stmt = db.prepare('SELECT * FROM background_tasks WHERE session_id = ? ORDER BY created_at DESC');
      return stmt.all(filter.sessionId) as unknown as BackgroundTaskRecord[];
    }
    if (filter?.projectId) {
      const stmt = db.prepare('SELECT * FROM background_tasks WHERE project_id = ? ORDER BY created_at DESC');
      return stmt.all(filter.projectId) as unknown as BackgroundTaskRecord[];
    }
    const stmt = db.prepare('SELECT * FROM background_tasks ORDER BY created_at DESC LIMIT 50');
    return stmt.all() as unknown as BackgroundTaskRecord[];
  },
  delete(id: string): void {
    const db = getDb();
    const stmt = db.prepare('DELETE FROM background_tasks WHERE id = ?');
    stmt.run(id);
  },
  clearStopped(sessionId?: string): void {
    const db = getDb();
    if (sessionId) {
      const stmt = db.prepare("DELETE FROM background_tasks WHERE session_id = ? AND status != 'RUNNING'");
      stmt.run(sessionId);
    } else {
      const stmt = db.prepare("DELETE FROM background_tasks WHERE status != 'RUNNING'");
      stmt.run();
    }
  },
};

// Helper methods for Session Compactions
export const compactionRepo = {
  create(record: SessionCompactionRecord): void {
    const db = getDb();
    const stmt = db.prepare(`
      INSERT INTO session_compactions (
        id, session_id, summary, first_message_id, last_compacted_message_id,
        tokens_before, tokens_after, tokens_saved, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      record.id,
      record.session_id,
      record.summary,
      record.first_message_id || null,
      record.last_compacted_message_id,
      record.tokens_before,
      record.tokens_after,
      record.tokens_saved,
      record.created_at
    );
  },
  getLatestBySession(sessionId: string): SessionCompactionRecord | undefined {
    const db = getDb();
    const stmt = db.prepare('SELECT * FROM session_compactions WHERE session_id = ? ORDER BY created_at DESC LIMIT 1');
    return stmt.get(sessionId) as unknown as SessionCompactionRecord | undefined;
  },
  listBySession(sessionId: string): SessionCompactionRecord[] {
    const db = getDb();
    const stmt = db.prepare('SELECT * FROM session_compactions WHERE session_id = ? ORDER BY created_at ASC');
    return stmt.all(sessionId) as unknown as SessionCompactionRecord[];
  },
  deleteBySession(sessionId: string): void {
    const db = getDb();
    const stmt = db.prepare('DELETE FROM session_compactions WHERE session_id = ?');
    stmt.run(sessionId);
  },
};

// Helper methods for Session Todos (Task Tracking)
export const todoRepo = {
  getTodos(sessionId: string): TodoItem[] {
    const db = getDb();
    const stmt = db.prepare('SELECT todos_json FROM session_todos WHERE session_id = ?');
    const row = stmt.get(sessionId) as { todos_json: string } | undefined;
    if (!row || !row.todos_json) return [];
    try {
      return JSON.parse(row.todos_json);
    } catch {
      return [];
    }
  },
  saveTodos(sessionId: string, todos: TodoItem[]): void {
    const db = getDb();
    const stmt = db.prepare(`
      INSERT INTO session_todos (session_id, todos_json, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(session_id) DO UPDATE SET
        todos_json = excluded.todos_json,
        updated_at = excluded.updated_at
    `);
    stmt.run(sessionId, JSON.stringify(todos), Date.now());
  },
  clearTodos(sessionId: string): void {
    const db = getDb();
    const stmt = db.prepare('DELETE FROM session_todos WHERE session_id = ?');
    stmt.run(sessionId);
  },
};


