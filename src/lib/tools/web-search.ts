import https from 'https';

export interface WebSearchParams {
  query: string;
  maxResults?: number;
}

export interface WebSearchResultItem {
  title: string;
  url: string;
  snippet: string;
}

export interface WebSearchResult {
  query: string;
  count: number;
  results: WebSearchResultItem[];
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#0183;/g, '·')
    .replace(/&#8230;/g, '…')
    .replace(/&#8211;/g, '–')
    .replace(/&#8212;/g, '—')
    .replace(/&hellip;/g, '…')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeBingUrl(rawUrl: string): string {
  try {
    // If it's a Bing tracking redirect, extract and decode the 'u' query param (starts with 'a1' + base64)
    const urlObj = new URL(rawUrl.replace(/&amp;/g, '&'));
    const uParam = urlObj.searchParams.get('u');
    if (uParam && uParam.startsWith('a1')) {
      const b64 = uParam.slice(2);
      const decoded = Buffer.from(b64, 'base64').toString('utf8');
      if (decoded.startsWith('http://') || decoded.startsWith('https://')) {
        return decoded;
      }
    }
  } catch {
    // fallback to original url
  }
  return rawUrl;
}

export async function executeWebSearch(params: WebSearchParams): Promise<WebSearchResult> {
  const query = (params?.query || '').trim();
  if (!query) {
    throw new Error('Query parameter is required for web_search.');
  }

  const maxResults = Math.min(Math.max(params.maxResults || 5, 1), 10);
  const searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=${maxResults + 4}`;

  const agent = new https.Agent({
    rejectUnauthorized: false,
    timeout: 8000,
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(searchUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      // @ts-ignore - undici dispatcher / https agent
      dispatcher: undefined,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      throw new Error(`Search request failed with status: ${res.status} ${res.statusText}`);
    }

    const html = await res.text();
    const results: WebSearchResultItem[] = [];

    // Parse Bing search blocks <li class="b_algo">
    const algoRegex = /<li\s+class="b_algo"[\s\S]*?<\/li>/gi;
    let match: RegExpExecArray | null;

    while ((match = algoRegex.exec(html)) !== null && results.length < maxResults) {
      const block = match[0];

      // Extract Title & Link: <h2><a href="...">Title</a></h2>
      const linkMatch = /<h2[^>]*>\s*<a\s+[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(block);
      if (!linkMatch) continue;

      const rawHref = linkMatch[1];
      const rawTitle = linkMatch[2].replace(/<[^>]+>/g, '');
      const cleanTitle = decodeHtmlEntities(rawTitle);
      const cleanUrl = decodeBingUrl(rawHref);

      // Extract Snippet
      const snippetMatch = /<p[^>]*>([\s\S]*?)<\/p>/i.exec(block);
      const rawSnippet = snippetMatch ? snippetMatch[1].replace(/<[^>]+>/g, '') : '';
      const cleanSnippet = decodeHtmlEntities(rawSnippet);

      if (cleanTitle && cleanUrl) {
        results.push({
          title: cleanTitle,
          url: cleanUrl,
          snippet: cleanSnippet,
        });
      }
    }

    // Fallback: If no results found from primary selector, try Wikipedia OpenSearch as backup
    if (results.length === 0) {
      try {
        const wikiRes = await fetch(
          `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=${maxResults}&format=json`,
          {
            signal: AbortSignal.timeout(5000),
          }
        );
        if (wikiRes.ok) {
          const wikiData = (await wikiRes.json()) as [string, string[], string[], string[]];
          if (Array.isArray(wikiData) && wikiData.length >= 4) {
            const titles = wikiData[1] || [];
            const snippets = wikiData[2] || [];
            const urls = wikiData[3] || [];
            for (let i = 0; i < titles.length && results.length < maxResults; i++) {
              results.push({
                title: titles[i],
                snippet: snippets[i] || 'Wikipedia article overview.',
                url: urls[i],
              });
            }
          }
        }
      } catch {
        // ignore secondary fallback error
      }
    }

    return {
      query,
      count: results.length,
      results,
    };
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error(`Search request timed out after 8000ms for query: "${query}"`);
    }
    throw new Error(`Web search failed: ${err.message}`);
  }
}
