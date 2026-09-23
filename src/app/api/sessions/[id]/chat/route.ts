export const dynamic = 'force-dynamic';
import { NextRequest } from 'next/server';
import { AgentOrchestrator, AgentEvent, abortSessionOrchestrator, isSessionOrchestratorRunning } from '@/lib/orchestrator';
import { sessionRepo, projectRepo, messageRepo } from '@/lib/db';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = sessionRepo.getById(id);
  if (!session) {
    return new Response(JSON.stringify({ error: 'Session not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let workdir: string;
  if (!session.project_id || session.project_id === 'no_project') {
    const { getAidevHome, ensureChatStorageInitialized } = await import('@/lib/storage');
    const path = await import('path');
    const fs = await import('fs');
    const root = getAidevHome();
    workdir = path.join(root, 'sandbox', 'generated', id);
    fs.mkdirSync(workdir, { recursive: true });
    ensureChatStorageInitialized('no_project', id);
  } else {
    const project = projectRepo.getById(session.project_id);
    if (!project) {
      return new Response(JSON.stringify({ error: 'Project not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    workdir = project.workdir_path;
  }

  const body = await req.json();
  const prompt = typeof body.prompt === 'string' ? body.prompt : '';
  const images = Array.isArray(body.images) ? body.images : undefined;
  const clientMessageId = typeof body.clientMessageId === 'string' ? body.clientMessageId : undefined;
  if (!prompt.trim() && (!images || images.length === 0)) {
    return new Response(JSON.stringify({ error: 'Prompt or image is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Update session model or permission mode if passed in request
  if (body.model || body.permissionMode) {
    sessionRepo.update(id, {
      ...(body.model ? { model_id: body.model } : {}),
      ...(body.permissionMode ? { permission_mode: body.permissionMode } : {}),
    });
  }

  if (isSessionOrchestratorRunning(id)) {
    abortSessionOrchestrator(id);
    for (let i = 0; i < 10; i++) {
      if (!isSessionOrchestratorRunning(id)) break;
      await new Promise((r) => setTimeout(r, 40));
    }
    await new Promise((r) => setTimeout(r, 80));
  }

  // Create ReadableStream for SSE
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let isStreamClosed = false;
      const sendEvent = (event: AgentEvent) => {
        if (isStreamClosed) return;
        try {
          const payload = `data: ${JSON.stringify(event)}\n\n`;
          controller.enqueue(encoder.encode(payload));
        } catch {
          // Stream might be closed by client refresh or network drop
          isStreamClosed = true;
        }
      };

      const orchestrator = new AgentOrchestrator(id, workdir, sendEvent);

      try {
        await orchestrator.runTurn(prompt, images, clientMessageId);
      } catch (err: any) {
        if (!orchestrator.isAborted && !isStreamClosed) {
          const errMsg = err.message || 'Chat turn execution failed';
          try {
            messageRepo.create({
              id: `msg_${Date.now()}_error`,
              session_id: id,
              role: 'assistant',
              content: errMsg,
              status: 'ERROR',
              created_at: Date.now(),
            });
          } catch {}
          sendEvent({
            type: 'error',
            data: { message: errMsg },
          });
          sendEvent({
            type: 'done',
            data: { status: 'ERROR' },
          });
        }
      } finally {
        isStreamClosed = true;
        try {
          controller.close();
        } catch {}
      }
    },
    cancel() {
      // DO NOT abort orchestrator on client disconnect or page reload!
      // Background execution must persist professionally until finished or explicitly stopped.
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
}
