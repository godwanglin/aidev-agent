export interface ReadUrlParams {
  url: string;
  maxChars?: number;
}

export interface ReadUrlResult {
  url: string;
  title: string;
  content: string;
  contentLength: number;
  isTruncated: boolean;
}

function htmlToMarkdown(html: string): { title: string; markdown: string } {
  // Extract Title
  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  let title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : '';
  title = decodeHtmlEntities(title);

  // Clean out non-content tags: script, style, nav, footer, header, aside, svg, iframe, form
  let clean = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, '')
    .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, '')
    .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, '')
    .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, '')
    .replace(/<aside\b[^<]*(?:(?!<\/aside>)<[^<]*)*<\/aside>/gi, '')
    .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '');

  // Convert Headings
  clean = clean.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n\n# $1\n\n');
  clean = clean.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n\n## $1\n\n');
  clean = clean.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '\n\n### $1\n\n');
  clean = clean.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, '\n\n#### $1\n\n');
  clean = clean.replace(/<h5[^>]*>([\s\S]*?)<\/h5>/gi, '\n\n##### $1\n\n');
  clean = clean.replace(/<h6[^>]*>([\s\S]*?)<\/h6>/gi, '\n\n###### $1\n\n');

  // Convert Preformatted Code blocks
  clean = clean.replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, '\n\n```\n$1\n```\n\n');
  clean = clean.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, '\n\n```\n$1\n```\n\n');
  clean = clean.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, '`$1`');

  // Convert Links
  clean = clean.replace(/<a\s+[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (match, href, text) => {
    const cleanText = text.replace(/<[^>]+>/g, '').trim();
    if (!cleanText || href.startsWith('javascript:') || href === '#') return cleanText;
    return `[${cleanText}](${href})`;
  });

  // Convert Lists
  clean = clean.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '\n- $1');
  clean = clean.replace(/<\/ul>|<\/ol>/gi, '\n\n');

  // Convert Paragraphs and line breaks
  clean = clean.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '\n\n$1\n\n');
  clean = clean.replace(/<br\s*[\/]?>/gi, '\n');
  clean = clean.replace(/<hr\s*[\/]?>/gi, '\n---\n');

  // Strip any remaining HTML tags
  clean = clean.replace(/<[^>]+>/g, ' ');

  // Decode Entities
  clean = decodeHtmlEntities(clean);

  // Normalize spacing and whitespace
  clean = clean
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { title, markdown: clean };
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#8217;/g, "'")
    .replace(/&#8216;/g, "'")
    .replace(/&#8220;/g, '"')
    .replace(/&#8221;/g, '"')
    .replace(/&#8211;/g, '–')
    .replace(/&#8212;/g, '—')
    .replace(/&hellip;/g, '…');
}

export async function executeReadUrl(params: ReadUrlParams): Promise<ReadUrlResult> {
  const rawUrl = (params?.url || '').trim();
  if (!rawUrl) {
    throw new Error('URL parameter is required for read_url.');
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`);
  } catch {
    throw new Error(`Invalid URL format: "${rawUrl}"`);
  }

  const maxChars = Math.min(Math.max(params.maxChars || 20000, 1000), 50000);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch(parsedUrl.toString(), {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.5',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      throw new Error(`Failed to fetch URL (${res.status} ${res.statusText})`);
    }

    const contentType = res.headers.get('content-type') || '';
    const rawText = await res.text();

    let title = parsedUrl.hostname;
    let content = '';

    if (contentType.includes('text/html') || rawText.includes('<html')) {
      const parsed = htmlToMarkdown(rawText);
      title = parsed.title || parsedUrl.hostname;
      content = parsed.markdown;
    } else {
      // Plain text, markdown, or json
      title = parsedUrl.pathname.split('/').pop() || parsedUrl.hostname;
      content = rawText.trim();
    }

    const isTruncated = content.length > maxChars;
    const finalContent = isTruncated
      ? content.slice(0, maxChars) + `\n\n... [Content truncated at ${maxChars} characters]`
      : content;

    return {
      url: parsedUrl.toString(),
      title,
      content: finalContent,
      contentLength: finalContent.length,
      isTruncated,
    };
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error(`Request to ${rawUrl} timed out after 10000ms`);
    }
    throw new Error(`Failed to read URL ${rawUrl}: ${err.message}`);
  }
}
