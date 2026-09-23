'use client';

import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import '@xterm/xterm/css/xterm.css';

const DARK_TERMINAL_THEME = {
  background: '#121315',
  foreground: '#eceff4',
  cursor: '#00d2ff',
  selectionBackground: '#264f78',
  black: '#1c1f24',
  red: '#f92672',
  green: '#a6e22e',
  yellow: '#ffd166',
  blue: '#00d2ff',
  magenta: '#c084fc',
  cyan: '#00d2ff',
  white: '#eceff4',
};

const LIGHT_TERMINAL_THEME = {
  background: '#f8fafc',
  foreground: '#1e293b',
  cursor: '#007acc',
  selectionBackground: '#b4d5fe',
  black: '#0f172a',
  red: '#e11d48',
  green: '#16a34a',
  yellow: '#d97706',
  blue: '#2563eb',
  magenta: '#9333ea',
  cyan: '#0891b2',
  white: '#f8fafc',
};

interface TerminalTabProps {
  terminalId: string;
  workdir: string;
}

export const TerminalTab: React.FC<TerminalTabProps> = ({ terminalId, workdir }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<any>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const fitAddonRef = useRef<any>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const themeObserverRef = useRef<MutationObserver | null>(null);
  const hasReceivedDataRef = useRef(false);
  const [isConnected, setIsConnected] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const connectTerminal = async () => {
    if (!containerRef.current || typeof window === 'undefined') return;

    // Clean up previous terminal if any
    if (themeObserverRef.current) {
      themeObserverRef.current.disconnect();
      themeObserverRef.current = null;
    }
    if (resizeObserverRef.current) {
      resizeObserverRef.current.disconnect();
      resizeObserverRef.current = null;
    }
    if (xtermRef.current) {
      xtermRef.current.dispose();
      xtermRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    try {
      const [{ Terminal: XTerm }, { FitAddon }, { WebLinksAddon }] = await Promise.all([
        import('@xterm/xterm'),
        import('@xterm/addon-fit'),
        import('@xterm/addon-web-links'),
      ]);

      const isLight = document.documentElement.classList.contains('light');
      const term = new XTerm({
        cursorBlink: true,
        convertEol: true,
        fontFamily: '"Fira Code", monospace',
        fontSize: 12.5,
        lineHeight: 1.25,
        theme: isLight ? LIGHT_TERMINAL_THEME : DARK_TERMINAL_THEME,
      });

      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      term.loadAddon(new WebLinksAddon());

      if (containerRef.current) {
        containerRef.current.innerHTML = '';
        term.open(containerRef.current);
        term.focus();
        setTimeout(() => {
          try {
            fitAddon.fit();
            term.focus();
          } catch {}
        }, 50);
      }

      xtermRef.current = term;
      fitAddonRef.current = fitAddon;

      // Observe size changes to keep xterm fitted
      const ro = new ResizeObserver(() => {
        try {
          if (containerRef.current && containerRef.current.clientWidth > 0) {
            fitAddon.fit();
          }
        } catch {}
      });
      if (containerRef.current) {
        ro.observe(containerRef.current);
      }
      resizeObserverRef.current = ro;

      // Build WebSocket URL
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      const wsUrl = `${protocol}//${host}/api/terminal/ws?sessionId=${encodeURIComponent(
        terminalId
      )}&workdir=${encodeURIComponent(workdir)}`;

      hasReceivedDataRef.current = false;
      const socket = new WebSocket(wsUrl);
      wsRef.current = socket;

      socket.onopen = () => {
        setIsConnected(true);
        setErrorMsg(null);
        setTimeout(() => {
          try {
            fitAddon.fit();
            term.focus();
            if (socket.readyState === WebSocket.OPEN && term.cols && term.rows) {
              socket.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
            }
          } catch {}
        }, 50);

        // If shell prompt is quiet or not yet displayed after 700ms, nudge shell with a newline
        setTimeout(() => {
          if (socket.readyState === WebSocket.OPEN && !hasReceivedDataRef.current) {
            socket.send(JSON.stringify({ type: 'input', data: '\r\n' }));
          }
        }, 700);
      };

      socket.onmessage = (event) => {
        hasReceivedDataRef.current = true;
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'output' && msg.data) {
            term.write(msg.data);
          } else if (msg.type === 'exit') {
            term.write(`\r\n[Process exited with code ${msg.code}]\r\n`);
            setIsConnected(false);
          }
        } catch {
          term.write(event.data);
        }
      };

      socket.onerror = () => {
        setErrorMsg('Failed to connect to Terminal WebSocket server.');
        setIsConnected(false);
      };

      socket.onclose = () => {
        setIsConnected(false);
      };

      // Custom key event handler: ensure Ctrl+C sends \x03 (SIGINT) directly to backend
      term.attachCustomKeyEventHandler((event: KeyboardEvent) => {
        if ((event.ctrlKey || event.metaKey) && (event.key === 'c' || event.key === 'C')) {
          // If text is selected in xterm, allow standard copy
          if (term.hasSelection()) {
            return false;
          }
          // If no text selected, send Ctrl+C (\x03) immediately on keydown
          if (event.type === 'keydown') {
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
              wsRef.current.send(JSON.stringify({ type: 'input', data: '\x03' }));
            }
          }
          return false;
        }
        return true;
      });

      // User input forwarded to child process, or auto-reconnect if dropped
      term.onData((data: string) => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: 'input', data }));
        } else {
          connectTerminal();
        }
      });

      // Resize event forwarding
      term.onResize(({ cols, rows }: { cols: number; rows: number }) => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: 'resize', cols, rows }));
        }
      });

      // Resize handling
      const handleResize = () => {
        if (fitAddonRef.current) {
          fitAddonRef.current.fit();
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && term.cols && term.rows) {
            wsRef.current.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
          }
        }
      };
      window.addEventListener('resize', handleResize);
      // Observe theme changes on <html> element
      const to = new MutationObserver(() => {
        try {
          if (xtermRef.current) {
            const lightNow = document.documentElement.classList.contains('light');
            xtermRef.current.options.theme = lightNow ? LIGHT_TERMINAL_THEME : DARK_TERMINAL_THEME;
          }
        } catch {}
      });
      to.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class'],
      });
      themeObserverRef.current = to;
    } catch (err: any) {
      setErrorMsg(`Terminal initialization error: ${err.message}`);
    }
  };

  useEffect(() => {
    connectTerminal();
    return () => {
      if (themeObserverRef.current) themeObserverRef.current.disconnect();
      if (resizeObserverRef.current) resizeObserverRef.current.disconnect();
      if (wsRef.current) wsRef.current.close();
      if (xtermRef.current) xtermRef.current.dispose();
    };
  }, [terminalId, workdir]);

  return (
    <div className="flex-1 flex flex-col h-full bg-[#f8fafc] dark:bg-[#121315] overflow-hidden relative">
      {errorMsg && (
        <div className="p-2 bg-red-500/10 border-b border-red-500/20 text-red-300 text-xs flex items-center gap-2 font-sans">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 text-red-400" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Disconnected recovery overlay badge */}
      {!isConnected && (
        <div className="absolute top-2 right-4 z-20 flex items-center gap-2 bg-[#18191e]/90 backdrop-blur-xs border border-[#2d2e38] px-2.5 py-1 rounded-md text-[11px] text-[#9da3ae] shadow-lg select-none">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
          <span>Terputus</span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              connectTerminal();
            }}
            className="px-2 py-0.5 bg-[#00d2ff]/20 text-[#00d2ff] hover:bg-[#00d2ff]/30 rounded text-[11px] font-medium transition cursor-pointer"
          >
            Hubungkan Ulang
          </button>
        </div>
      )}

      {/* xterm DOM Container */}
      <div
        ref={containerRef}
        onClick={() => {
          xtermRef.current?.focus();
          if (!isConnected) {
            connectTerminal();
          }
        }}
        className="flex-1 w-full h-full p-2 overflow-hidden bg-transparent cursor-text"
      />
    </div>
  );
};
