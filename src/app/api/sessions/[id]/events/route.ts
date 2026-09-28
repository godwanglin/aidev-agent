export const dynamic = 'force-dynamic';
import { NextRequest } from 'next/server';
import { sessionEventBus, SessionBusEvent } from '@/lib/session-bus';
import { sessionRepo } from '@/lib/db';
import { isSessionOrchestratorRunning } from '@/lib/orchestrator';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: sessionId } = await params;
  const session = sessionRepo.getById(sessionId);
  if (!session) {
    return new Response(JSON.stringify({ error: 'Session not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      let isClosed = false;

      const send = (data: SessionBusEvent) => {
        if (isClosed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          isClosed = true;
        }
      };

      // 1. Initial connection status handshake
      send({
        type: 'connected',
        data: {
          sessionId,
          isRunning: isSessionOrchestratorRunning(sessionId),
          timestamp: Date.now(),
        },
      });

      // 2. Keepalive ping every 15s to keep SSE pipe active through proxies & firewalls
      const pingInterval = setInterval(() => {
        if (isClosed) {
          clearInterval(pingInterval);
          return;
        }
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          isClosed = true;
          clearInterval(pingInterval);
        }
      }, 15000);

      // 3. Listen to session-specific events (deltas, tools, status)
      const unsubSession = sessionEventBus.onSession(sessionId, (event) => {
        send(event);
      });

      // 4. Listen to global events relevant to this session or project (e.g. sessions_updated)
      const unsubGlobal = sessionEventBus.onGlobal((event) => {
        if (event.type === 'sessions_updated') {
          send(event);
        }
      });

      const cleanup = () => {
        if (isClosed) return;
        isClosed = true;
        clearInterval(pingInterval);
        unsubSession();
        unsubGlobal();
        try {
          controller.close();
        } catch {}
      };

      // Handle client disconnect or abort
      req.signal.addEventListener('abort', cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
