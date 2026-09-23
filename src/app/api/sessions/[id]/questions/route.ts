import { NextRequest } from 'next/server';
import { AgentOrchestrator, AgentEvent, abortSessionOrchestrator } from '@/lib/orchestrator';
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

  const project = projectRepo.getById(session.project_id);
  if (!project) {
    return new Response(JSON.stringify({ error: 'Project not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const body = await req.json();
  const { toolCallId, answer, action } = body;
  if (!toolCallId) {
    return new Response(JSON.stringify({ error: 'toolCallId is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (action !== 'CANCEL' && typeof answer !== 'string') {
    return new Response(JSON.stringify({ error: 'answer is required when action is not CANCEL' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (event: AgentEvent) => {
        try {
          const payload = `data: ${JSON.stringify(event)}\n\n`;
          controller.enqueue(encoder.encode(payload));
        } catch {
          // stream closed
        }
      };

      const orchestrator = new AgentOrchestrator(id, project.workdir_path, sendEvent);
      const onAbort = () => {
        orchestrator.abort();
      };
      req.signal.addEventListener('abort', onAbort);

      try {
        if (action === 'CANCEL') {
          await orchestrator.cancelQuestion(toolCallId);
        } else {
          await orchestrator.resumeWithAnswer(toolCallId, answer);
        }
      } catch (err: any) {
        if (!orchestrator.isAborted) {
          const errMsg = err.message || 'Failed to process question action';
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
        req.signal.removeEventListener('abort', onAbort);
        controller.close();
      }
    },
    cancel() {
      abortSessionOrchestrator(id);
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
