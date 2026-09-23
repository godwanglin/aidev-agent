import { todoRepo, TodoItem } from '../db';

export interface UpdateTodosParams {
  todos: Array<{
    id?: string;
    title?: string;
    task?: string;
    status: 'pending' | 'in_progress' | 'completed' | string;
  }>;
}

export interface UpdateTodosResult {
  success: boolean;
  total: number;
  completed: number;
  in_progress: number;
  pending: number;
  todos: TodoItem[];
  message: string;
}

export async function executeUpdateTodos(
  params: UpdateTodosParams,
  sessionId?: string,
  onEvent?: (event: any) => void
): Promise<UpdateTodosResult> {
  if (!params || !Array.isArray(params.todos)) {
    throw new Error('Invalid parameter: "todos" must be an array of task items.');
  }

  const cleanTodos: TodoItem[] = params.todos.map((item, idx) => {
    const rawStatus = (item.status || 'pending').toLowerCase().trim();
    let normalizedStatus: 'pending' | 'in_progress' | 'completed' = 'pending';

    if (rawStatus === 'completed' || rawStatus === 'done' || rawStatus === 'complete' || rawStatus === 'finished') {
      normalizedStatus = 'completed';
    } else if (
      rawStatus === 'in_progress' ||
      rawStatus === 'in-progress' ||
      rawStatus === 'progress' ||
      rawStatus === 'running' ||
      rawStatus === 'doing'
    ) {
      normalizedStatus = 'in_progress';
    }

    const title = (item.title || item.task || `Task #${idx + 1}`).trim();
    const id = (item.id || `todo_${idx + 1}`).trim();

    return {
      id,
      title,
      status: normalizedStatus,
    };
  });

  if (sessionId) {
    try {
      todoRepo.saveTodos(sessionId, cleanTodos);
    } catch (err: any) {
      console.error('[Todo Tool] Failed to persist todos to SQLite:', err.message);
    }
  }

  const completed = cleanTodos.filter((t) => t.status === 'completed').length;
  const in_progress = cleanTodos.filter((t) => t.status === 'in_progress').length;
  const pending = cleanTodos.filter((t) => t.status === 'pending').length;

  const result: UpdateTodosResult = {
    success: true,
    total: cleanTodos.length,
    completed,
    in_progress,
    pending,
    todos: cleanTodos,
    message: `Tasks updated: ${completed}/${cleanTodos.length} completed, ${in_progress} in progress, ${pending} pending.`,
  };

  if (onEvent) {
    onEvent({
      type: 'todos_updated',
      data: {
        sessionId,
        ...result,
      },
    });
  }

  return result;
}
