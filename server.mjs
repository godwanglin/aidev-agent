import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import net from 'net';
import fs from 'fs';
import { WebSocketServer, WebSocket } from 'ws';
import { spawn, execSync, spawnSync } from 'child_process';
import url, { fileURLToPath } from 'url';
import path, { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Safely load node-pty if available with fallback to child_process.spawn
let nodePty = null;
try {
  const ptyModule = await import('node-pty');
  nodePty = ptyModule.default || ptyModule;
  console.log('[Terminal] Native node-pty backend loaded successfully.');
} catch {
  console.log('[Terminal] node-pty not available, falling back to standard child_process.spawn');
}

const rawEnv = (process.env.NODE_ENV || '').trim().toLowerCase();
const hasBuildId = fs.existsSync(path.join(__dirname, '.next', 'BUILD_ID'));
// Run production mode only if BUILD_ID exists and user didn't request development
const dev = rawEnv === 'development' || !hasBuildId;
if (!dev) {
  process.env.NODE_ENV = 'production';
} else {
  process.env.NODE_ENV = 'development';
  if (!hasBuildId && rawEnv !== 'development') {
    console.log('[Aidev] No production build (.next/BUILD_ID) found. Starting in on-demand development mode...');
  }
}
const hostname = '0.0.0.0';
const START_PORT = 3001;
const MAX_PORT = 3010;

// Kill child processes of a parent process on Windows / POSIX
function killChildProcessTree(parentPid) {
  if (!parentPid) return;
  if (process.platform === 'win32') {
    try {
      const script = `Get-CimInstance Win32_Process -Filter "ParentProcessId=${parentPid}" | Select-Object -ExpandProperty ProcessId`;
      const out = execSync(`powershell -NoProfile -NonInteractive -Command "${script}"`, {
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
      if (out) {
        const pids = out.split(/\r?\n/).map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n));
        for (const pid of pids) {
          try {
            execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'ignore' });
          } catch {}
        }
      }
    } catch {}
  } else {
    try {
      process.kill(-parentPid, 'SIGINT');
    } catch {}
  }
}

// Interactive terminal sessions store (shared via globalThis)
const activeTerminals =
  globalThis.__aidev_activeTerminals || (globalThis.__aidev_activeTerminals = new Map());

function setupTerminalWebSocket(wss) {
  wss.on('connection', (ws, req) => {
    const parsedUrl = url.parse(req.url || '', true);
    if (!parsedUrl.pathname?.startsWith('/api/terminal/ws')) {
      return;
    }

    const sessionId = parsedUrl.query.sessionId || `term_${Date.now()}`;
    const workdir = parsedUrl.query.workdir || process.cwd();

    const existing = activeTerminals.get(sessionId);

    // If session already exists and process is alive, RE-ATTACH (Persisted Terminal Session)
    if (existing && existing.isAlive()) {
      if (existing.disconnectTimer) {
        clearTimeout(existing.disconnectTimer);
        existing.disconnectTimer = null;
      }
      existing.ws = ws;

      // Replay entire scrollback history buffer to xterm
      if (existing.buffer) {
        ws.send(JSON.stringify({ type: 'output', data: existing.buffer }));
      }

      ws.on('message', (message) => {
        try {
          const payload = JSON.parse(message.toString());
          if (payload.type === 'input' && typeof payload.data === 'string') {
            existing.write(payload.data);
          } else if (payload.type === 'resize' && payload.cols && payload.rows) {
            existing.resize(payload.cols, payload.rows);
          } else if (payload.type === 'interrupt') {
            existing.interrupt();
          }
        } catch {
          existing.write(message.toString());
        }
      });

      ws.on('close', () => {
        existing.ws = null;
        // Keep process alive for 30 minutes
        if (existing.disconnectTimer) clearTimeout(existing.disconnectTimer);
        existing.disconnectTimer = setTimeout(() => {
          try {
            existing.kill();
          } catch {}
          activeTerminals.delete(sessionId);
        }, 30 * 60 * 1000);
      });

      return;
    }

    const isWindows = process.platform === 'win32';
    const shell = isWindows
      ? process.env.SHELL || 'powershell.exe'
      : process.env.SHELL || '/bin/bash';
    const shellArgs = shell.toLowerCase().includes('powershell')
      ? ['-NoLogo']
      : isWindows && shell.toLowerCase().includes('cmd')
      ? ['/Q']
      : ['-i'];

    let termSession;

    if (nodePty) {
      let ptyProc;
      try {
        ptyProc = nodePty.spawn(shell, shellArgs, {
          name: 'xterm-256color',
          cols: 80,
          rows: 24,
          cwd: workdir,
          env: {
            ...process.env,
            TERM: 'xterm-256color',
            COLORTERM: 'truecolor',
          },
        });
      } catch (err) {
        if (isWindows && shell !== 'cmd.exe') {
          try {
            ptyProc = nodePty.spawn('cmd.exe', ['/Q'], {
              name: 'xterm-256color',
              cols: 80,
              rows: 24,
              cwd: workdir,
              env: {
                ...process.env,
                TERM: 'xterm-256color',
                COLORTERM: 'truecolor',
              },
            });
          } catch (err2) {
            ws.send(JSON.stringify({ type: 'output', data: `\r\nFailed to spawn terminal: ${err2.message}\r\n` }));
            ws.close();
            return;
          }
        } else {
          ws.send(JSON.stringify({ type: 'output', data: `\r\nFailed to spawn terminal: ${err.message}\r\n` }));
          ws.close();
          return;
        }
      }

      let isExited = false;

      termSession = {
        id: sessionId,
        process: ptyProc,
        ws,
        workdir,
        buffer: '',
        disconnectTimer: null,
        isAlive: () => !isExited,
        write: (data) => {
          if (!isExited) {
            try {
              ptyProc.write(data);
            } catch {}
          }
        },
        resize: (cols, rows) => {
          if (!isExited && cols > 0 && rows > 0) {
            try {
              ptyProc.resize(cols, rows);
            } catch {}
          }
        },
        interrupt: () => {
          if (!isExited) {
            try {
              ptyProc.write('\x03');
            } catch {}
          }
        },
        kill: () => {
          isExited = true;
          try {
            ptyProc.kill();
          } catch {}
        },
      };

      const sendOutput = (data) => {
        termSession.buffer += data;
        if (termSession.buffer.length > 60000) {
          termSession.buffer = termSession.buffer.slice(-50000);
        }
        if (termSession.ws && termSession.ws.readyState === WebSocket.OPEN) {
          termSession.ws.send(JSON.stringify({ type: 'output', data }));
        }
      };

      ptyProc.onData((data) => {
        sendOutput(data);
      });

      ptyProc.onExit((exitEvent) => {
        isExited = true;
        const code = exitEvent ? exitEvent.exitCode : 0;
        if (termSession.ws && termSession.ws.readyState === WebSocket.OPEN) {
          termSession.ws.send(JSON.stringify({ type: 'exit', code }));
        }
        activeTerminals.delete(sessionId);
      });
    } else {
      // Fallback: child_process.spawn with process-tree SIGINT / taskkill
      const fallbackShell = isWindows ? process.env.COMSPEC || 'cmd.exe' : process.env.SHELL || '/bin/bash';
      const fallbackArgs = isWindows ? ['/Q'] : ['--noediting', '-i'];

      let child;
      try {
        child = spawn(fallbackShell, fallbackArgs, {
          cwd: workdir,
          env: {
            ...process.env,
            TERM: 'xterm-256color',
            COLORTERM: 'truecolor',
            PS1: isWindows ? '' : '\\u@\\h:\\w\\$ ',
          },
        });
      } catch (err) {
        ws.send(JSON.stringify({ type: 'output', data: `\r\nFailed to spawn terminal: ${err.message}\r\n` }));
        ws.close();
        return;
      }

      let isExited = false;

      // Nudge Linux shell to output initial prompt in pipe mode only if buffer empty
      if (!isWindows) {
        setTimeout(() => {
          if (!isExited && (!termSession.buffer || termSession.buffer.length === 0) && child.stdin && !child.stdin.destroyed) {
            child.stdin.write('\n');
          }
        }, 300);
      }

      termSession = {
        id: sessionId,
        process: child,
        ws,
        workdir,
        buffer: '',
        lineBuffer: '',
        history: [],
        historyIdx: -1,
        disconnectTimer: null,
        isAlive: () => !isExited && !child.killed,
        write: (inputData) => {
          if (isExited) return;
          for (let i = 0; i < inputData.length; i++) {
            const ch = inputData[i];
            if (ch === '\r' || ch === '\n') {
              sendOutput('\r\n');
              const newline = isWindows ? '\r\n' : '\n';
              child.stdin.write(termSession.lineBuffer + newline);
              if (termSession.lineBuffer.trim()) {
                termSession.history.push(termSession.lineBuffer);
              }
              termSession.lineBuffer = '';
              termSession.historyIdx = -1;
            } else if (ch === '\x7f' || ch === '\x08') {
              if (termSession.lineBuffer.length > 0) {
                termSession.lineBuffer = termSession.lineBuffer.slice(0, -1);
                sendOutput('\b \b');
              }
            } else if (ch === '\x03') {
              sendOutput('^C\r\n');
              termSession.lineBuffer = '';
              termSession.historyIdx = -1;
              try {
                child.stdin.write('\x03');
              } catch {}
              killChildProcessTree(child.pid);
            } else if (ch >= ' ') {
              termSession.lineBuffer += ch;
              sendOutput(ch);
            }
          }
        },
        resize: () => {},
        interrupt: () => {
          sendOutput('^C\r\n');
          termSession.lineBuffer = '';
          try {
            child.stdin.write('\x03');
          } catch {}
          killChildProcessTree(child.pid);
        },
        kill: () => {
          isExited = true;
          killChildProcessTree(child.pid);
          try {
            child.kill();
          } catch {}
        },
      };

      const sendOutput = (data) => {
        const cleanData = data.replace(/\r?\n/g, '\r\n');
        termSession.buffer += cleanData;
        if (termSession.buffer.length > 60000) {
          termSession.buffer = termSession.buffer.slice(-50000);
        }
        if (termSession.ws && termSession.ws.readyState === WebSocket.OPEN) {
          termSession.ws.send(JSON.stringify({ type: 'output', data: cleanData }));
        }
      };

      child.stdout.on('data', (data) => {
        sendOutput(data.toString('utf-8'));
      });

      child.stderr.on('data', (data) => {
        sendOutput(data.toString('utf-8'));
      });

      child.on('close', (code) => {
        isExited = true;
        if (termSession.ws && termSession.ws.readyState === WebSocket.OPEN) {
          termSession.ws.send(JSON.stringify({ type: 'exit', code: code ?? 0 }));
        }
        activeTerminals.delete(sessionId);
      });
    }

    activeTerminals.set(sessionId, termSession);

    ws.on('message', (message) => {
      try {
        const payload = JSON.parse(message.toString());
        if (payload.type === 'input' && typeof payload.data === 'string') {
          termSession.write(payload.data);
        } else if (payload.type === 'resize' && payload.cols && payload.rows) {
          termSession.resize(payload.cols, payload.rows);
        } else if (payload.type === 'interrupt') {
          termSession.interrupt();
        }
      } catch {
        termSession.write(message.toString());
      }
    });

    ws.on('close', () => {
      termSession.ws = null;
      if (termSession.disconnectTimer) clearTimeout(termSession.disconnectTimer);
      termSession.disconnectTimer = setTimeout(() => {
        try {
          termSession.kill();
        } catch {}
        activeTerminals.delete(sessionId);
      }, 30 * 60 * 1000);
    });
  });
}

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const tester = net.createServer()
      .once('error', () => resolve(false))
      .once('listening', () => {
        tester.once('close', () => resolve(true)).close();
      })
      .listen(port, hostname);
  });
}

async function findAvailablePort(start, max) {
  for (let p = start; p <= max; p++) {
    if (await isPortAvailable(p)) {
      return p;
    }
  }
  return start;
}

function launchDesktopApp(url) {
  const isWindows = process.platform === 'win32';
  const isMac = process.platform === 'darwin';

  if (isWindows) {
    spawn('cmd.exe', ['/c', 'start', 'chrome', `--app=${url}`], { detached: true, stdio: 'ignore' });
  } else if (isMac) {
    spawn('open', ['-na', 'Google Chrome', '--args', `--app=${url}`], { detached: true, stdio: 'ignore' });
  } else {
    // Linux: try launching standalone window via Chromium/Chrome/Brave/Edge or fallback to default browser
    const candidates = [
      'google-chrome',
      'google-chrome-stable',
      'chromium',
      'chromium-browser',
      'brave-browser',
      'microsoft-edge',
    ];
    let launched = false;
    for (const browserCmd of candidates) {
      try {
        const check = spawnSync('which', [browserCmd], { stdio: 'ignore' });
        if (check.status === 0) {
          spawn(browserCmd, [`--app=${url}`], { detached: true, stdio: 'ignore' });
          launched = true;
          break;
        }
      } catch {}
    }
    if (!launched) {
      try {
        spawn('xdg-open', [url], { detached: true, stdio: 'ignore' });
      } catch {}
    }
  }
}

async function startServer() {
  const envPort = process.env.PORT ? parseInt(process.env.PORT, 10) : null;
  const port = envPort || (await findAvailablePort(START_PORT, MAX_PORT));
  const app = next({ dev, dir: __dirname, hostname, port });
  const handle = app.getRequestHandler();

  await app.prepare();

  const server = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error occurred handling request:', req.url, err);
      res.statusCode = 500;
      res.end('Internal Server Error');
    }
  });

  const wss = new WebSocketServer({ noServer: true });
  setupTerminalWebSocket(wss);

  server.on('upgrade', (req, socket, head) => {
    try {
      const parsedUrl = parse(req.url || '', true);
      if (parsedUrl.pathname?.startsWith('/api/terminal/ws')) {
        wss.handleUpgrade(req, socket, head, (ws) => {
          wss.emit('connection', ws, req);
        });
      } else if (dev) {
        const upgradeHandler = app.getUpgradeHandler();
        if (upgradeHandler) {
          upgradeHandler(req, socket, head);
        } else {
          socket.destroy();
        }
      } else {
        socket.destroy();
      }
    } catch (err) {
      console.error('Error during WebSocket upgrade:', err);
      socket.destroy();
    }
  });

  server.listen(port, hostname, () => {
    const localUrl = `http://localhost:${port}`;
    console.log('\n======================================================');
    console.log(`   🚀 Aidev Desktop Coding Agent (v1.0.0) [${dev ? 'DEV' : 'PRODUCTION'}]`);
    console.log(`   🌐 Local URL:         ${localUrl}`);
    console.log(`   🌐 Bound Address:     ${hostname}:${port}`);
    console.log('   🔒 Environment:       Localhost Sandbox');
    console.log('   📂 Storage Root:      $USERPROFILE/.aidev/');
    console.log('   ⚡ Terminal Gateway:  Active (xterm.js PTY ready)');
    console.log('======================================================\n');

    if (process.env.APP_MODE === 'true') {
      console.log('Launching Standalone Desktop Window...');
      launchDesktopApp(localUrl);
    }
  });
}

startServer().catch((err) => {
  console.error('Failed to start Aidev Agent server:', err);
  process.exit(1);
});
