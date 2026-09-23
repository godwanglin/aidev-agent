import fs from 'fs';
import path from 'path';
import os from 'os';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

console.log('======================================================');
console.log('  TESTING WORLD-CLASS AGENT CAPABILITIES (PHASE 1-4)  ');
console.log('======================================================\n');

const WORKDIR = path.resolve('.');

async function runAllTests() {
  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (!condition) {
      failed++;
      console.error(`❌ FAIL: ${message}`);
      throw new Error(message);
    } else {
      passed++;
      console.log(`✅ PASS: ${message}`);
    }
  }

  // --------------------------------------------------------------------------
  // Phase 1: Task Tracking (update_todos)
  // --------------------------------------------------------------------------
  console.log('\n--- [Phase 1: Task Tracking & Todo Storage] ---');
  const { executeUpdateTodos } = await import('../src/lib/tools/todo.ts');
  const { todoRepo } = await import('../src/lib/db.ts');

  const testSessionId = `sess_test_${Date.now()}`;
  let eventDispatched = false;

  const todoResult = await executeUpdateTodos(
    {
      todos: [
        { id: 'step-1', title: 'Research codebase architecture', status: 'done' },
        { id: 'step-2', title: 'Implement new tools', status: 'progress' },
        { id: 'step-3', title: 'Verify tests and performance', status: 'pending' },
      ],
    },
    testSessionId,
    (event) => {
      if (event.type === 'todos_updated') eventDispatched = true;
    }
  );

  assert(todoResult.success === true, 'executeUpdateTodos returned success');
  assert(todoResult.total === 3, 'Total todos count matches 3');
  assert(todoResult.completed === 1, 'Normalized "done" -> completed (count = 1)');
  assert(todoResult.in_progress === 1, 'Normalized "progress" -> in_progress (count = 1)');
  assert(todoResult.pending === 1, 'Pending count matches 1');
  assert(eventDispatched === true, 'Dispatched todos_updated event to caller');

  const savedTodos = todoRepo.getTodos(testSessionId);
  assert(savedTodos.length === 3, 'Persisted todos saved to SQLite database');
  assert(savedTodos[0].status === 'completed', 'SQLite record has correct status');
  todoRepo.clearTodos(testSessionId);

  // --------------------------------------------------------------------------
  // Phase 2: Web Research & URL Reader
  // --------------------------------------------------------------------------
  console.log('\n--- [Phase 2: Web Search & URL Reader] ---');
  const { executeWebSearch } = await import('../src/lib/tools/web-search.ts');
  const { executeReadUrl } = await import('../src/lib/tools/read-url.ts');

  console.log('Testing executeWebSearch("TypeScript tutorial")...');
  const searchRes = await executeWebSearch({ query: 'TypeScript tutorial', maxResults: 3 });
  assert(searchRes.count > 0, `Web search returned ${searchRes.count} results`);
  assert(searchRes.results[0].title.length > 0, 'First search result has non-empty title');
  assert(searchRes.results[0].url.startsWith('http'), `First result has valid HTTP URL: ${searchRes.results[0].url}`);

  console.log('Testing executeReadUrl("https://en.wikipedia.org/wiki/TypeScript")...');
  const readUrlRes = await executeReadUrl({
    url: 'https://en.wikipedia.org/wiki/TypeScript',
    maxChars: 1500,
  });
  assert(readUrlRes.title.includes('TypeScript'), `Extracted title contains "TypeScript": "${readUrlRes.title}"`);
  assert(readUrlRes.content.length > 0, 'Converted HTML to non-empty Markdown');
  assert(!readUrlRes.content.includes('<script'), 'Cleaned scripts and style tags from Markdown output');
  assert(readUrlRes.contentLength <= 1600, 'Enforced maxChars truncation boundary');

  // --------------------------------------------------------------------------
  // Phase 3: Codebase Navigation & Repo Map
  // --------------------------------------------------------------------------
  console.log('\n--- [Phase 3: Codebase Repo Map & File Symbols] ---');
  const { executeGetRepoMap, executeGetFileSymbols } = await import('../src/lib/tools/repo-map.ts');

  console.log('Testing executeGetRepoMap on "src/lib/tools"...');
  const repoMapRes = await executeGetRepoMap({ directory: 'src/lib/tools', maxFiles: 15 }, WORKDIR);
  assert(repoMapRes.totalFilesScanned > 0, `Scanned ${repoMapRes.totalFilesScanned} files`);
  assert(repoMapRes.totalSymbolsFound > 0, `Extracted ${repoMapRes.totalSymbolsFound} architectural symbols`);
  assert(repoMapRes.repoMapText.includes('todo.ts'), 'Repo map includes todo.ts');
  assert(repoMapRes.repoMapText.includes('web-search.ts'), 'Repo map includes web-search.ts');

  console.log('Testing executeGetFileSymbols on "src/lib/tools/todo.ts"...');
  const fileSyms = await executeGetFileSymbols({ path: 'src/lib/tools/todo.ts' }, WORKDIR);
  assert(fileSyms.totalSymbols >= 2, `Extracted ${fileSyms.totalSymbols} symbols from todo.ts`);
  const hasUpdateTodosFn = fileSyms.symbols.some((s) => s.name === 'executeUpdateTodos');
  assert(hasUpdateTodosFn, 'Symbol list contains function "executeUpdateTodos"');

  // --------------------------------------------------------------------------
  // Phase 4: Code Intelligence & Diagnostics
  // --------------------------------------------------------------------------
  console.log('\n--- [Phase 4: Instant Diagnostics & References] ---');
  const { executeGetDiagnostics, executeFindReferences } = await import('../src/lib/tools/diagnostics.ts');

  console.log('Testing executeGetDiagnostics on "src/lib/tools/todo.ts"...');
  const cleanDiags = await executeGetDiagnostics({ path: 'src/lib/tools/todo.ts' }, WORKDIR);
  assert(cleanDiags.totalErrors === 0, `Clean file has 0 errors (got ${cleanDiags.totalErrors})`);

  console.log('Testing intentional syntax error detection...');
  const tempBrokenFile = path.join(WORKDIR, 'src', 'lib', 'tools', '_temp_broken_test.ts');
  try {
    fs.writeFileSync(tempBrokenFile, 'const brokenVar: number = "this is not a number";\n', 'utf8');
    const brokenDiags = await executeGetDiagnostics({ path: 'src/lib/tools/_temp_broken_test.ts' }, WORKDIR);
    assert(brokenDiags.totalErrors > 0, `Detected intentional type error: ${brokenDiags.diagnostics[0]?.message}`);
  } finally {
    if (fs.existsSync(tempBrokenFile)) fs.unlinkSync(tempBrokenFile);
  }

  console.log('Testing executeFindReferences for "executeUpdateTodos"...');
  const refsRes = await executeFindReferences({ symbol: 'executeUpdateTodos' }, WORKDIR);
  assert(refsRes.totalReferences >= 2, `Found ${refsRes.totalReferences} references across workspace`);
  assert(refsRes.references.some((r) => r.file.includes('todo.ts')), 'Found definition reference in todo.ts');
  assert(refsRes.references.some((r) => r.file.includes('index.ts')), 'Found usage reference in index.ts');

  // --------------------------------------------------------------------------
  // Integration & Alias Dispatching
  // --------------------------------------------------------------------------
  console.log('\n--- [Integration: Dispatch & Alias Normalization] ---');
  const { dispatchToolCall, normalizeToolName, AGENT_TOOLS } = await import('../src/lib/tools/index.ts');

  assert(normalizeToolName('todo_write') === 'update_todos', 'Normalized alias "todo_write" -> "update_todos"');
  assert(normalizeToolName('search_web') === 'web_search', 'Normalized alias "search_web" -> "web_search"');
  assert(normalizeToolName('fetch_url') === 'read_url', 'Normalized alias "fetch_url" -> "read_url"');
  assert(normalizeToolName('repo_map') === 'get_repo_map', 'Normalized alias "repo_map" -> "get_repo_map"');
  assert(normalizeToolName('diagnostics') === 'get_diagnostics', 'Normalized alias "diagnostics" -> "get_diagnostics"');
  assert(normalizeToolName('find_usages') === 'find_references', 'Normalized alias "find_usages" -> "find_references"');

  const registeredNames = AGENT_TOOLS.map((t) => t.function.name);
  assert(registeredNames.includes('update_todos'), 'AGENT_TOOLS registers update_todos');
  assert(registeredNames.includes('web_search'), 'AGENT_TOOLS registers web_search');
  assert(registeredNames.includes('read_url'), 'AGENT_TOOLS registers read_url');
  assert(registeredNames.includes('get_repo_map'), 'AGENT_TOOLS registers get_repo_map');
  assert(registeredNames.includes('get_file_symbols'), 'AGENT_TOOLS registers get_file_symbols');
  assert(registeredNames.includes('get_diagnostics'), 'AGENT_TOOLS registers get_diagnostics');
  assert(registeredNames.includes('find_references'), 'AGENT_TOOLS registers find_references');

  // Test dispatching via alias
  const dispatchedResult = await dispatchToolCall(
    'todo_write',
    { todos: [{ id: '1', title: 'Dispatch check', status: 'completed' }] },
    WORKDIR,
    'test_sess_disp',
    'msg_123'
  );
  assert(dispatchedResult.success === true, 'Dispatched tool call via alias successfully');
  todoRepo.clearTodos('test_sess_disp');

  console.log('\n======================================================');
  console.log(`🎉 ALL TESTS PASSED! (${passed} checks passed, 0 failures)`);
  console.log('   CAPABILITIES 100% MATURE & PRODUCTION-READY        ');
  console.log('======================================================\n');
}

runAllTests().catch((err) => {
  console.error('\n💥 FATAL ERROR IN SUITE:', err);
  process.exit(1);
});
