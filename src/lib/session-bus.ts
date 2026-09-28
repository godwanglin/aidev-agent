import { EventEmitter } from 'events';

export interface SessionBusEvent {
  type: string;
  data?: any;
  delta?: string;
  sessionId?: string;
  timestamp?: number;
}

class SessionEventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(200);
  }

  public broadcast(sessionId: string, event: SessionBusEvent): void {
    const payload: SessionBusEvent = {
      ...event,
      sessionId,
      timestamp: event.timestamp || Date.now(),
    };
    // Emit session-specific event
    this.emit(`session:${sessionId}`, payload);
    // Emit global event for session lists, project updates, or multi-session monitors
    this.emit('global', payload);
  }

  public onSession(sessionId: string, listener: (event: SessionBusEvent) => void): () => void {
    const channel = `session:${sessionId}`;
    this.on(channel, listener);
    return () => {
      this.off(channel, listener);
    };
  }

  public onGlobal(listener: (event: SessionBusEvent) => void): () => void {
    this.on('global', listener);
    return () => {
      this.off('global', listener);
    };
  }
}

// Global singleton to survive Next.js module hot reloading in development mode
const globalKey = Symbol.for('__aidev_session_event_bus__');
const globalObj = globalThis as unknown as { [globalKey]?: SessionEventBus };

if (!globalObj[globalKey]) {
  globalObj[globalKey] = new SessionEventBus();
}

export const sessionEventBus = globalObj[globalKey]!;
