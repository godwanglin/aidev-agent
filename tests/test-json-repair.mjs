import assert from 'node:assert';
import {
  repairJson,
  safeJsonParse,
  sanitizeSseLine,
  createSafeSseTransform
} from '../src/lib/json-repair.ts';

console.log('🧪 Starting JSON Repair & Safe SSE Test Suite...\n');

// 1. Array missing comma (The exact issue user hit: Expected ',' or ']' after array element)
{
  const input = '{"parts": [1, 2 3, 4]}';
  const parsed = safeJsonParse(input);
  assert.deepStrictEqual(parsed, { parts: [1, 2, 3, 4] });
  console.log('✅ PASS: Array missing comma recovered correctly');
}

// 2. Array strings missing comma
{
  const input = '{"names": ["HumanoidRootPart" "Head" "LeftArm"]}';
  const parsed = safeJsonParse(input);
  assert.deepStrictEqual(parsed, { names: ['HumanoidRootPart', 'Head', 'LeftArm'] });
  console.log('✅ PASS: Array string items missing comma recovered');
}

// 3. Object missing comma between properties
{
  const input = '{"status": "ok" "count": 42 "visible": true}';
  const parsed = safeJsonParse(input);
  assert.deepStrictEqual(parsed, { status: 'ok', count: 42, visible: true });
  console.log('✅ PASS: Object missing comma between properties recovered');
}

// 4. Gateway unquoted keep-alive
{
  const input = '{"status": "running", "_reason": keep-alive}';
  const parsed = safeJsonParse(input);
  assert.deepStrictEqual(parsed, { status: 'running', _reason: 'keep-alive' });
  console.log('✅ PASS: Unquoted keep-alive token recovered');
}

// 5. Unterminated string and unclosed JSON (truncated stream)
{
  const input = '{"hair": true, "name": "GeneratedHair';
  const parsed = safeJsonParse(input);
  assert.strictEqual(parsed.hair, true);
  assert.strictEqual(parsed.name, 'GeneratedHair');
  console.log('✅ PASS: Truncated unterminated string & unclosed object recovered');
}

// 6. Deeply nested unclosed arrays and objects
{
  const input = '{"hair": true, "parts": [{"name": "part1"}, {"name": "part2"';
  const parsed = safeJsonParse(input);
  assert.strictEqual(parsed.hair, true);
  assert.strictEqual(parsed.parts.length, 2);
  assert.strictEqual(parsed.parts[1].name, 'part2');
  console.log('✅ PASS: Deeply nested unclosed arrays/objects recovered');
}

// 7. Trailing commas
{
  const input = '{"a": 1, "b": [1, 2, ], }';
  const parsed = safeJsonParse(input);
  assert.deepStrictEqual(parsed, { a: 1, b: [1, 2] });
  console.log('✅ PASS: Trailing commas stripped safely');
}

// 8. Markdown code fence JSON
{
  const input = '```json\n{"code": "print(1)"}\n```';
  const parsed = safeJsonParse(input);
  assert.deepStrictEqual(parsed, { code: 'print(1)' });
  console.log('✅ PASS: Markdown code fences stripped safely');
}

// 9. Raw newlines inside string literals
{
  const input = '{"code": "local x = 1\nlocal y = 2"}';
  const parsed = safeJsonParse(input);
  assert.strictEqual(parsed.code, 'local x = 1\nlocal y = 2');
  console.log('✅ PASS: Raw unescaped newlines inside strings sanitized');
}

// 10. SSE line sanitizer
{
  // Valid line unchanged
  const valid = 'data: {"id":"1","choices":[{"delta":{"content":"hi"}}]}';
  assert.strictEqual(sanitizeSseLine(valid), valid);

  // [DONE] unchanged
  assert.strictEqual(sanitizeSseLine('data: [DONE]'), 'data: [DONE]');

  // Unquoted keep-alive repaired to valid JSON
  const keepAlive = 'data: {"_reason": keep-alive}';
  assert.strictEqual(sanitizeSseLine(keepAlive), 'data: {"_reason": "keep-alive"}');

  // data: without space
  const noSpace = 'data:{"choices":[{"text":"hello"}]}';
  assert.strictEqual(sanitizeSseLine(noSpace), noSpace);

  // Completely broken junk becomes a harmless SSE comment
  const junk = 'data: {broken: completely non-json string';
  const sanitizedJunk = sanitizeSseLine(junk);
  assert(sanitizedJunk.startsWith(': [aidev-sanitized-sse-chunk]'));
  console.log('✅ PASS: SSE line sanitizer protects streaming decoder (with & without space)');
}

// 11. Full Safe SSE Transform Stream
{
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const transform = createSafeSseTransform();
  const writer = transform.writable.getWriter();
  const reader = transform.readable.getReader();

  const chunks = [
    'data: {"id":"1","choices":[{"delta":{"content":"A"}}]}\n\n',
    'data: {"_reason": keep-alive}\n\n',
    'data: {"id":"2","choices":[{"delta":{"content":"B"}}]}\n\n',
    'data: [DONE]\n\n'
  ];

  const readPromise = (async () => {
    let received = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += decoder.decode(value);
    }
    return received;
  })();

  for (const c of chunks) {
    await writer.write(encoder.encode(c));
  }
  await writer.close();

  const received = await readPromise;

  assert(received.includes('"content":"A"'));
  assert(received.includes('"content":"B"'));
  assert(received.includes('"_reason": "keep-alive"'));
  assert(received.includes('data: [DONE]'));
  console.log('✅ PASS: Full Safe SSE TransformStream handles streams flawlessly');
}

console.log('\n🎉 ALL JSON REPAIR & SAFE SSE TESTS PASSED!');
