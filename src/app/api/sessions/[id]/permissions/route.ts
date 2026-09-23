export const dynamic = 'force-dynamic';
import { NextRequest } from 'next/server';
import { AgentOrchestrator, AgentEvent } from '@/lib/orchestrator';
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
  const { toolCallId, decision, alwaysAllow } = body;
  if (!toolCallId || !decision) {
    return new Response(JSON.stringify({ error: 'toolCallId and decision are required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // If user clicked "Always Allow for this Session", upgrade session permission mode to AUTO
  if (alwaysAllow) {
    sessionRepo.update(id, { permission_mode: 'AUTO' });
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

      try {
        const orchestrator = new AgentOrchestrator(id, project.workdir_path, sendEvent);
        await orchestrator.resumeWithPermission(toolCallId, decision, alwaysAllow);
      } catch (err: any) {
        const errMsg = err.message || 'Failed to resume with permission';
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
      } finally {
        controller.close();
      }
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
