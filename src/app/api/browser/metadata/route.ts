import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const targetUrl = searchParams.get('url');

  if (!targetUrl) {
    return NextResponse.json({ error: 'Missing url query parameter' }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(targetUrl.startsWith('http') ? targetUrl : `http://${targetUrl}`);
  } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
  }

  // Fallback defaults based on port or host
  let fallbackTitle = parsed.port ? `Preview :${parsed.port}` : parsed.hostname;
  if (parsed.pathname.includes('/api/embed')) {
    const srcParam = parsed.searchParams.get('src');
    if (srcParam) {
      const cleanName = decodeURIComponent(srcParam)
        .replace(/^file:\/\/\/?/i, '')
        .replace(/\\/g, '/')
        .split('/')
        .pop();
      if (cleanName) fallbackTitle = cleanName;
    }
  }
  let title = fallbackTitle;
  let favicon: string | null = null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);

    const res = await fetch(parsed.href, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });
    clearTimeout(timeout);

    if (res.ok) {
      const html = await res.text();

      // 1. Extract <title>
      const titleMatch = /<title[^>]*>([^<]+)<\/title>/i.exec(html);
      if (titleMatch && titleMatch[1]) {
        const cleanTitle = titleMatch[1].replace(/[\r\n\t]+/g, ' ').trim();
        if (cleanTitle) {
          title = cleanTitle;
        }
      }

      // 2. Extract <link rel="icon"...> or <link rel="shortcut icon"...>
      const iconMatches = [
        /<link[^>]+rel=["'](?:shortcut )?icon["'][^>]+href=["']([^"']+)["']/i.exec(html),
        /<link[^>]+href=["']([^"']+)["'][^>]+rel=["'](?:shortcut )?icon["']/i.exec(html),
        /<link[^>]+rel=["']apple-touch-icon(?:-precomposed)?["'][^>]+href=["']([^"']+)["']/i.exec(html),
      ];

      for (const m of iconMatches) {
        if (m && m[1]) {
          const rawHref = m[1].trim();
          if (rawHref.startsWith('data:')) {
            favicon = rawHref;
          } else {
            try {
              favicon = new URL(rawHref, parsed.href).href;
            } catch {}
          }
          break;
        }
      }

      // Default favicon.ico if no icon tag found
      if (!favicon) {
        favicon = new URL('/favicon.ico', parsed.href).href;
      }
    }
  } catch {
    // If localhost or domain fetch timed out or failed, fallback to domain favicon service if not localhost
    if (!['localhost', '127.0.0.1'].includes(parsed.hostname)) {
      favicon = `https://www.google.com/s2/favicons?domain=${parsed.hostname}&sz=32`;
    }
  }

  return NextResponse.json({
    url: parsed.href,
    title,
    favicon,
  });
}
