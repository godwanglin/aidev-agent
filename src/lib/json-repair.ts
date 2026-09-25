/**
 * Resilient JSON repair and Safe SSE stream pipeline for AI Gateway & Model Streaming.
 *
 * Prevents orchestrator crashes caused by:
 * 1. Missing commas between array items / object keys in streaming LLM tool arguments
 * 2. Unquoted keep-alives or heartbeat tokens (e.g. {"_reason": keep-alive})
 * 3. Truncated or split SSE lines from reverse proxies (Cloudflare, Nginx, Gateway)
 * 4. Unescaped control characters/newlines within string literals
 * 5. Trailing commas and unbalanced quotes/brackets
 */

export function repairJson(raw: string): string {
  if (typeof raw !== 'string') return '{}';
  let str = raw.trim();

  // Strip markdown code fences if wrapped
  if (str.startsWith('```')) {
    str = str.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '').trim();
  }

  // Fast path: try parsing directly
  try {
    JSON.parse(str);
    return str;
  } catch {}

  // 1. Replace unquoted keep-alive, keepalive, or undefined tokens
  str = str.replace(/:\s*keep-alive\b/gi, ': "keep-alive"');
  str = str.replace(/:\s*keepalive\b/gi, ': "keep-alive"');
  str = str.replace(/:\s*undefined\b/gi, ': null');

  // 2. Escape literal raw newlines, carriage returns, and tabs inside double-quoted string values
  let inString = false;
  let escapeNext = false;
  let result = '';
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (escapeNext) {
      result += char;
      escapeNext = false;
      continue;
    }
    if (char === '\\') {
      result += char;
      escapeNext = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      result += char;
      continue;
    }
    if (inString) {
      if (char === '\n') {
        result += '\\n';
      } else if (char === '\r') {
        result += '\\r';
      } else if (char === '\t') {
        result += '\\t';
      } else {
        result += char;
      }
    } else {
      result += char;
    }
  }
  str = result;

  // 3. Remove trailing commas before closing braces/brackets
  str = str.replace(/,\s*([\}\]])/g, '$1');

  // 4. Fix missing comma between array elements:
  // e.g. ["a" "b"], [1 2], [true false], [null null], [{...} {...}], [[...] [...]]
  str = str.replace(/(["\d]|true|false|null|\}|\])\s+("|\d|true|false|null|\{|\[)/g, '$1, $2');

  // 5. Fix missing comma between object properties:
  // e.g. "key": "value" "next": 123
  str = str.replace(/("(?:\\.|[^"\\])*"|\d+|true|false|null|\}|\])\s*("(?:\\.|[^"\\])*"\s*:)/g, '$1, $2');

  // 6. Fix unquoted keys in objects: e.g. { foo: "bar" } -> { "foo": "bar" }
  str = str.replace(/([{,]\s*)([a-zA-Z0-9_$-]+)\s*:/g, '$1"$2":');

  // Check if repaired at this step
  try {
    JSON.parse(str);
    return str;
  } catch {}

  // 7. Balance unclosed quotes, brackets, and braces (LIFO stack)
  const openStack: string[] = [];
  let inStr = false;
  let esc = false;
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (esc) {
      esc = false;
      continue;
    }
    if (c === '\\') {
      esc = true;
      continue;
    }
    if (c === '"') {
      inStr = !inStr;
      continue;
    }
    if (inStr) continue;

    if (c === '{' || c === '[') {
      openStack.push(c);
    } else if (c === '}') {
      if (openStack.length > 0 && openStack[openStack.length - 1] === '{') {
        openStack.pop();
      }
    } else if (c === ']') {
      if (openStack.length > 0 && openStack[openStack.length - 1] === '[') {
        openStack.pop();
      }
    }
  }

  // If string was left open, close it
  if (inStr) {
    str += '"';
  }

  // Close remaining open brackets/braces in reverse order
  while (openStack.length > 0) {
    const last = openStack.pop();
    if (last === '{') str += '}';
    else if (last === '[') str += ']';
  }

  // Remove any trailing commas exposed after bracket closing
  str = str.replace(/,\s*([\}\]])/g, '$1');

  return str;
}

/**
 * Safely parses JSON string with automated repair heuristics.
 * Returns fallback if completely unparseable instead of throwing.
 */
export function safeJsonParse<T = any>(raw: any, fallback: T = {} as T): T {
  if (raw === null || raw === undefined) return fallback;
  if (typeof raw !== 'string') return raw as T;

  const trimmed = raw.trim();
  if (!trimmed) return fallback;

  // Fast path: standard native parse
  try {
    return JSON.parse(trimmed);
  } catch {}

  // Slow path: try automated repair
  try {
    const repaired = repairJson(trimmed);
    return JSON.parse(repaired);
  } catch {
    return fallback;
  }
}

/**
 * Sanitizes an individual SSE line before passing to OpenAI SDK.
 * Converts unparseable corrupted chunks or keep-alive lines into harmless SSE comments (: comment)
 * so OpenAI SDK never throws SyntaxError during streaming.
 */
export function sanitizeSseLine(line: string): string {
  if (!line.startsWith('data: ') && !line.startsWith('data:')) {
    return line;
  }
  const raw = (line.startsWith('data: ') ? line.slice(6) : line.slice(5)).trim();
  if (!raw || raw === '[DONE]') {
    return line;
  }

  // Fast path: already valid JSON
  try {
    JSON.parse(raw);
    return line;
  } catch {}

  // Attempt auto-repair
  try {
    const repaired = repairJson(raw);
    JSON.parse(repaired);
    return `data: ${repaired}`;
  } catch {}

  // If completely unrepairable (e.g. broken keep-alive ping or raw noise),
  // convert it to a safe SSE comment line (: [comment]) which the SSE spec and
  // OpenAI SDK decoder safely ignore without throwing.
  return `: [aidev-sanitized-sse-chunk] ${raw.replace(/[\r\n]+/g, ' ')}`;
}

/**
 * Creates a TransformStream that decodes SSE chunks, buffers partial lines,
 * and repairs or filters broken JSON payloads on the fly.
 */
export function createSafeSseTransform(): TransformStream<Uint8Array, Uint8Array> {
  const decoder = new TextDecoder('utf-8');
  const encoder = new TextEncoder();
  let buffer = '';

  return new TransformStream({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep trailing incomplete line in buffer

      for (const line of lines) {
        const sanitized = sanitizeSseLine(line.trimEnd());
        controller.enqueue(encoder.encode(sanitized + '\n'));
      }
    },
    flush(controller) {
      if (buffer.length > 0) {
        const sanitized = sanitizeSseLine(buffer.trimEnd());
        controller.enqueue(encoder.encode(sanitized + '\n'));
      }
    },
  });
}

/**
 * Creates a safe fetch wrapper for OpenAI client that intercepts SSE streams
 * and pipes them through the Safe SSE Transformer.
 */
export function createSafeSseFetch(): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const res = await globalThis.fetch(input, init);

    // Only transform if response is successful and content type is text/event-stream
    const contentType = res.headers.get('content-type') || '';
    if (res.ok && res.body && contentType.includes('text/event-stream')) {
      const safeStream = res.body.pipeThrough(createSafeSseTransform());
      return new Response(safeStream, {
        status: res.status,
        statusText: res.statusText,
        headers: res.headers,
      });
    }

    return res;
  };
}
