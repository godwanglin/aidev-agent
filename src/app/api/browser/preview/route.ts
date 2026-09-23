import { NextRequest, NextResponse } from 'next/server';
import { loadSettings } from '@/lib/storage';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const targetUrl = searchParams.get('url');

  if (!targetUrl) {
    return new NextResponse('Missing url query parameter', { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(targetUrl.startsWith('http') ? targetUrl : `http://${targetUrl}`);
  } catch {
    return new NextResponse('Invalid URL format', { status: 400 });
  }

  const aidevOrigin = request.nextUrl.origin;
  const targetOrigin = parsed.origin;
  const targetPort = parsed.port || (parsed.protocol === 'https:' ? '443' : '80');
  const aidevPort = request.nextUrl.port || '3001';

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(parsed.href, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });
    clearTimeout(timeout);

    let finalOrigin = targetOrigin;
    try {
      if (res.url) {
        finalOrigin = new URL(res.url).origin;
      }
    } catch {}

    let html = await res.text();

    // Rewrite dynamic imports & SvelteKit base paths to target origin
    html = html.replace(/import\((['"])\.\//g, `import($1${finalOrigin}/`);
    html = html.replace(/import\((['"])\/(?!\/)/g, `import($1${finalOrigin}/`);
    html = html.replace(/base:\s*new URL\([^)]+\)\.pathname[^,]*/gi, 'base: ""');

    // 1. Injected Bridge & Eruda Script
    const bridgeScript = `
<!-- AIDEV BROWSER PREVIEW BRIDGE & ERUDA INSPECTOR -->
<script src="${aidevOrigin}/vendor/eruda.js"></script>
<script>
(function() {
  // 0. Patch relative fetch and XMLHttpRequest to upstream origin
  try {
    var upstreamOrigin = '${finalOrigin}';
    var origFetch = window.fetch;
    window.fetch = function(input, init) {
      if (typeof input === 'string') {
        if (input.startsWith('/') && !input.startsWith('//')) {
          input = upstreamOrigin + input;
        } else if (input.startsWith('./')) {
          input = upstreamOrigin + '/' + input.slice(2);
        }
      } else if (input && typeof input.url === 'string') {
        if (input.url.startsWith('/') && !input.url.startsWith('//')) {
          input = new Request(upstreamOrigin + input.url, input);
        }
      }
      return origFetch.call(this, input, init);
    };

    var origOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url) {
      var rest = Array.prototype.slice.call(arguments, 2);
      if (typeof url === 'string') {
        if (url.startsWith('/') && !url.startsWith('//')) {
          url = upstreamOrigin + url;
        } else if (url.startsWith('./')) {
          url = upstreamOrigin + '/' + url.slice(2);
        }
      }
      return origOpen.apply(this, [method, url].concat(rest));
    };
  } catch(e) {}
  // 1. Prevent default context menu inside iframe & notify parent
  window.addEventListener('contextmenu', function(e) {
    e.preventDefault();
    e.stopPropagation();
    window.parent.postMessage({
      type: 'AIDEV_WEBVIEW_CONTEXT_MENU',
      clientX: e.clientX,
      clientY: e.clientY,
      screenX: e.screenX,
      screenY: e.screenY,
      url: window.location.href,
    }, '*');
  }, true);

  // 2. Patch WebSocket for dev server HMR (e.g. Vite)
  try {
    var OrigWebSocket = window.WebSocket;
    window.WebSocket = function(url, protocols) {
      if (typeof url === 'string') {
        var aPort = '${aidevPort}';
        var tPort = '${targetPort}';
        if (aPort && tPort && aPort !== tPort && url.indexOf(':' + aPort) !== -1) {
          url = url.replace(':' + aPort, ':' + tPort);
        }
      }
      return new OrigWebSocket(url, protocols);
    };
    window.WebSocket.prototype = OrigWebSocket.prototype;
  } catch(err) {}

  // 3. Initialize Eruda Inspector & Open DevTools Panel
  function initEruda() {
    if (window.eruda && !window.__erudaInitialized) {
      window.__erudaInitialized = true;
      try {
        eruda.init({
          defaults: {
            displaySize: 55,
            transparency: 95,
            theme: 'Dark'
          }
        });
      } catch(e) {}
    }
  }

  function openErudaInspector(tool) {
    initEruda();
    if (window.eruda) {
      try {
        eruda.show(); // 1. Opens the DevTools panel container window!
        eruda.show(tool || 'elements'); // 2. Selects Elements (or console) tab!
      } catch(e) {}
    }
  }

  function closeErudaInspector() {
    if (window.eruda) {
      try {
        eruda.hide();
      } catch(e) {}
    }
  }

  function toggleErudaInspector(tool) {
    initEruda();
    if (window.eruda) {
      try {
        var devTools = eruda._devTools;
        if (devTools && devTools._isShow) {
          closeErudaInspector();
        } else {
          openErudaInspector(tool);
        }
      } catch(e) {
        openErudaInspector(tool);
      }
    }
  }

  // Check URL parameter auto inspect
  var autoInspectParam = '${searchParams.get('inspect') || ''}';
  if (autoInspectParam === '1') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function() {
        setTimeout(function() { openErudaInspector('elements'); }, 150);
      });
    } else {
      setTimeout(function() { openErudaInspector('elements'); }, 150);
    }
  }

  // 4. Handle commands from parent window
  window.addEventListener('message', function(e) {
    if (!e.data || typeof e.data !== 'object') return;
    if (e.data.type === 'AIDEV_INSPECT_OPEN') {
      openErudaInspector(e.data.tool || 'elements');
    } else if (e.data.type === 'AIDEV_INSPECT_CLOSE') {
      closeErudaInspector();
    } else if (e.data.type === 'AIDEV_INSPECT_TOGGLE') {
      toggleErudaInspector(e.data.tool || 'elements');
    }
  });

  // 5. Notify parent on any click inside iframe to close parent menus
  window.addEventListener('click', function() {
    window.parent.postMessage({ type: 'AIDEV_WEBVIEW_CLICK' }, '*');
  });

  // 6. Dynamic URL & Title Navigation Tracker for SPAs (Next.js, React Router, Vue, etc.)
  window.__AIDEV_TARGET_ORIGIN__ = '${targetOrigin}';
  window.__AIDEV_INITIAL_URL__ = '${parsed.href}';

  function getRealTargetUrl() {
    try {
      var p = window.location.pathname;
      if (p.indexOf('/api/browser/preview') === 0) {
        return window.__AIDEV_INITIAL_URL__;
      }
      var targetOriginObj = new URL(window.__AIDEV_TARGET_ORIGIN__);
      var combined = new URL(p + window.location.search + window.location.hash, targetOriginObj.origin);
      return combined.href;
    } catch(e) {
      return window.__AIDEV_INITIAL_URL__;
    }
  }

  var lastSentUrl = '';
  var lastSentTitle = '';
  var lastCanGoBack = false;
  var lastCanGoForward = false;
  var historyStack = [getRealTargetUrl()];
  var historyIndex = 0;

  try {
    var s = history.state || {};
    if (typeof s.__aidevIdx === 'number') {
      historyIndex = s.__aidevIdx;
    } else {
      history.replaceState(Object.assign({}, s, { __aidevIdx: 0 }), '');
    }
  } catch(e) {}

  function notifyUrlChange() {
    try {
      var realUrl = getRealTargetUrl();
      var realTitle = document.title || '';
      var canGoBack = historyIndex > 0;
      var canGoForward = historyIndex < historyStack.length - 1;

      var favicon = null;
      var iconEl = document.querySelector('link[rel*="icon"]') || document.querySelector('link[rel="apple-touch-icon"]');
      if (iconEl && iconEl.href) {
        favicon = iconEl.href;
        var host = window.location.host;
        var targetHost = new URL(window.__AIDEV_TARGET_ORIGIN__).host;
        if (favicon.includes(host)) {
          favicon = favicon.replace(host, targetHost);
        }
      }

      if (
        realUrl !== lastSentUrl ||
        realTitle !== lastSentTitle ||
        canGoBack !== lastCanGoBack ||
        canGoForward !== lastCanGoForward
      ) {
        lastSentUrl = realUrl;
        lastSentTitle = realTitle;
        lastCanGoBack = canGoBack;
        lastCanGoForward = canGoForward;

        window.parent.postMessage({
          type: 'AIDEV_URL_CHANGED',
          url: realUrl,
          title: realTitle,
          favicon: favicon,
          canGoBack: canGoBack,
          canGoForward: canGoForward,
        }, '*');
      }
    } catch(err) {}
  }

  // Intercept history.pushState & replaceState (client-side routing)
  try {
    var origPushState = history.pushState;
    history.pushState = function(state, unused, url) {
      historyIndex++;
      historyStack = historyStack.slice(0, historyIndex);
      var nextState = Object.assign({}, state || {}, { __aidevIdx: historyIndex });
      var ret = origPushState.call(this, nextState, unused, url);
      var realUrl = getRealTargetUrl();
      historyStack.push(realUrl);
      notifyUrlChange();
      return ret;
    };
    var origReplaceState = history.replaceState;
    history.replaceState = function(state, unused, url) {
      var nextState = Object.assign({}, state || {}, { __aidevIdx: historyIndex });
      var ret = origReplaceState.call(this, nextState, unused, url);
      var realUrl = getRealTargetUrl();
      historyStack[historyIndex] = realUrl;
      notifyUrlChange();
      return ret;
    };
  } catch(e) {}

  window.addEventListener('popstate', function(e) {
    if (e.state && typeof e.state.__aidevIdx === 'number') {
      historyIndex = e.state.__aidevIdx;
    } else {
      if (historyIndex > 0) historyIndex--;
    }
    notifyUrlChange();
  });
  window.addEventListener('hashchange', notifyUrlChange);

  // Watch for dynamic title changes in SPAs
  try {
    var titleEl = document.querySelector('title');
    if (!titleEl) {
      titleEl = document.createElement('title');
      document.head.appendChild(titleEl);
    }
    var titleObserver = new MutationObserver(function() {
      notifyUrlChange();
    });
    titleObserver.observe(titleEl, { subtree: true, characterData: true, childList: true });
  } catch(e) {}

  // Watch link clicks
  document.addEventListener('click', function(e) {
    var a = e.target.closest('a');
    if (a && a.href && !a.href.startsWith('javascript:')) {
      setTimeout(notifyUrlChange, 60);
      setTimeout(notifyUrlChange, 300);
      setTimeout(notifyUrlChange, 800);
    }
  }, true);

  // Periodic heartbeat sync (every 350ms)
  setInterval(notifyUrlChange, 350);

  // Initial sync
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', notifyUrlChange);
  } else {
    notifyUrlChange();
  }
})();
</script>
`;

    // 2. Base tag to resolve relative paths (scripts, CSS, images) against final target origin
    const baseTag = `<base href="${finalOrigin}/">`;

    const settings = loadSettings();
    const jsPolicy = settings.browserJsPolicy || 'Request Review';

    if (jsPolicy === 'Disable') {
      // Strip all script tags and inline javascript
      html = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
      html = html.replace(/<script[^>]*>/gi, '');
      html = html.replace(/\son\w+\s*=\s*(["'][^"']*["']|[^\s>]+)/gi, '');

      const disableNotice = `
        <div style="position:fixed;bottom:10px;right:10px;z-index:2147483647;background:#201515;border:1px solid #732222;color:#ff9999;padding:5px 12px;border-radius:8px;font-size:11px;font-family:-apple-system,sans-serif;pointer-events:none;box-shadow:0 4px 12px rgba(0,0,0,0.5);">
          🛡️ JS Disabled by Aidev Browser Policy
        </div>
      `;
      if (/<body[^>]*>/i.test(html)) {
        html = html.replace(/<body[^>]*>/i, (m) => `${m}\n${disableNotice}`);
      } else {
        html += disableNotice;
      }

      if (/<head[^>]*>/i.test(html)) {
        html = html.replace(/<head[^>]*>/i, (match) => `${match}\n${baseTag}`);
      } else {
        html = `<head>${baseTag}</head>${html}`;
      }

      return new NextResponse(html, {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
          'Content-Security-Policy': "script-src 'none'",
          'X-Aidev-JS-Policy': 'Disable',
        },
      });
    }

    // Inject base tag & bridge script
    if (/<head[^>]*>/i.test(html)) {
      html = html.replace(/<head[^>]*>/i, (match) => `${match}\n${baseTag}\n${bridgeScript}`);
    } else {
      html = `<head>${baseTag}${bridgeScript}</head>${html}`;
    }

    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'X-Aidev-JS-Policy': jsPolicy,
      },
    });
  } catch {
    // If dev server is not running or unreachable
    const errorHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Cannot Connect to Dev Server</title>
  <style>
    body {
      background: #0d0d0d;
      color: #999;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100vh;
      margin: 0;
      padding: 24px;
      box-sizing: border-box;
      text-align: center;
      user-select: none;
    }
    .card {
      background: #141414;
      border: 1px solid #222;
      border-radius: 12px;
      padding: 24px 32px;
      max-width: 440px;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .icon {
      width: 42px;
      height: 42px;
      border-radius: 50%;
      background: #231515;
      border: 1px solid #4a2020;
      color: #f85149;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      margin-bottom: 14px;
    }
    h2 { color: #f0f6fc; margin: 0 0 8px 0; font-size: 15px; font-weight: 600; }
    p { font-size: 12px; line-height: 1.6; color: #8b949e; margin: 0 0 16px 0; }
    .url-badge {
      background: #0a0a0a;
      border: 1px solid #262626;
      padding: 6px 12px;
      border-radius: 6px;
      color: #58a6ff;
      font-size: 11.5px;
      font-family: ui-monospace, monospace;
      margin-bottom: 16px;
      word-break: break-all;
    }
    .retry-btn {
      background: #238636;
      color: #ffffff;
      border: 1px solid rgba(240,246,252,0.1);
      padding: 7px 18px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.15s;
    }
    .retry-btn:hover { background: #2ea043; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">⚠</div>
    <h2>Cannot Connect to Server</h2>
    <div class="url-badge">${parsed.href}</div>
    <p>Make sure your development server is active in the workspace (e.g. <code>npm run dev</code> or <code>vite</code>).</p>
    <button class="retry-btn" onclick="window.location.reload()">Retry Connection</button>
  </div>
  <script>
    window.addEventListener('contextmenu', function(e) {
      e.preventDefault();
      window.parent.postMessage({
        type: 'AIDEV_WEBVIEW_CONTEXT_MENU',
        clientX: e.clientX,
        clientY: e.clientY,
        url: '${parsed.href}',
      }, '*');
    });
    window.addEventListener('click', function() {
      window.parent.postMessage({ type: 'AIDEV_WEBVIEW_CLICK' }, '*');
    });
  </script>
</body>
</html>
    `;
    return new NextResponse(errorHtml, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }
}
