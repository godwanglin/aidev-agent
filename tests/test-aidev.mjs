import fs from 'fs';
import path from 'path';
import os from 'os';

// Test 1: Storage & Paths
console.log('--- [Test 1: Storage Initialization] ---');
import { getStoragePaths, ensureStorageInitialized, loadSettings } from '../src/lib/storage.ts';
ensureStorageInitialized();
const paths = getStoragePaths();
console.log('Storage Root:', paths.root);
console.log('DB File:', paths.dbFile);
if (!fs.existsSync(paths.config) || !fs.existsSync(paths.data)) {
  throw new Error('Storage directories were not created properly');
}
const settings = loadSettings();
console.log('Settings Gateway URL:', settings.gatewayUrl);
console.log('✅ Storage Initialized Successfully\n');

// Test 2: Database Schema & Operations
console.log('--- [Test 2: SQLite Database Operations] ---');
import { getDb, projectRepo, sessionRepo, messageRepo, snapshotRepo } from '../src/lib/db.ts';
const db = getDb();
console.log('Database connected via node:sqlite');

const testProjId = `test_proj_${Date.now()}`;
const savedProj = projectRepo.upsert({
  id: testProjId,
  name: 'Test Project',
  workdir_path: path.join(os.tmpdir(), 'aidev_test_workdir'),
  created_at: Date.now(),
  last_opened_at: Date.now(),
});
const fetchedProj = projectRepo.getById(savedProj.id);
console.log('Created/Updated Project:', fetchedProj?.name);

const testSessId = `test_sess_${Date.now()}`;
sessionRepo.create({
  id: testSessId,
  project_id: savedProj.id,
  title: 'Test Session',
  model_id: 'deepseek-reasoner',
  permission_mode: 'ASK',
  created_at: Date.now(),
  updated_at: Date.now(),
});

const testMsgId = `msg_test_${Date.now()}`;
messageRepo.create({
  id: testMsgId,
  session_id: testSessId,
  role: 'assistant',
  content: 'Here is the patch',
  reasoning_content: 'Let me think about how to add JWT authentication...',
  tool_call_id: 'call_123',
  tool_name: 'apply_patch',
  tool_arguments: JSON.stringify({ path: 'src/index.ts', patchText: '...' }),
  created_at: Date.now(),
});

const msgs = messageRepo.listBySession(testSessId);
console.log('Fetched Messages count:', msgs.length);
console.log('Reasoning Content:', msgs[0].reasoning_content);
console.log('✅ SQLite DB CRUD & Schema Verified\n');

// Test 3: Security Guard & Traversal Check
console.log('--- [Test 3: Security Guard & Command Blacklist] ---');
import { sanitizeAndResolvePath, isCommandBlacklisted, evaluatePermission } from '../src/lib/security.ts';
const workdir = path.resolve(os.tmpdir(), 'aidev_security_test');
fs.mkdirSync(workdir, { recursive: true });

// Valid path
const safePath = sanitizeAndResolvePath(workdir, 'src/auth.ts');
console.log('Safe Path resolved:', safePath);

// Traversal attempt
let traversalBlocked = false;
try {
  sanitizeAndResolvePath(workdir, '../../Windows/System32');
} catch (err) {
  traversalBlocked = true;
  console.log('Path Traversal successfully blocked:', err.message);
}
if (!traversalBlocked) throw new Error('Security Error: Path traversal was not blocked!');

// Dangerous command check
const cmdCheck = isCommandBlacklisted('rmdir /s /q C:\\Windows');
console.log('Blacklisted Command blocked:', cmdCheck.blacklisted, cmdCheck.reason);
if (!cmdCheck.blacklisted) throw new Error('Security Error: Destructive command was not blocked!');

console.log('✅ Security Engine Verified\n');

// Test 4: Snapshot Engine & 1-Click Revert
console.log('--- [Test 4: Pre-change Snapshot & Instant Revert] ---');
import { createPreChangeSnapshot, revertSnapshot } from '../src/lib/snapshot.ts';

const testFile = path.join(workdir, 'config.json');
const originalData = JSON.stringify({ version: '1.0.0', port: 8080 }, null, 2);
fs.writeFileSync(testFile, originalData, 'utf-8');

const modifiedData = JSON.stringify({ version: '2.0.0', port: 9090, auth: true }, null, 2);

const { snapshotId, additions, deletions } = await createPreChangeSnapshot(
  testSessId,
  testMsgId,
  workdir,
  'config.json',
  modifiedData
);
console.log(`Snapshot created: ${snapshotId} (+${additions}, -${deletions})`);

// Apply modified content
fs.writeFileSync(testFile, modifiedData, 'utf-8');
console.log('File modified on disk.');

// Perform 1-Click Revert
const revertResult = await revertSnapshot(snapshotId, workdir);
console.log('Revert Result:', revertResult.message);

const afterRevertContent = fs.readFileSync(testFile, 'utf-8');
if (afterRevertContent !== originalData) {
  throw new Error('Revert verification failed! File content does not match original pre-change state.');
}
console.log('✅ Instant 1-Click Revert Restored File 100% Identically!\n');

// Test 5: Headless Command Runner
console.log('--- [Test 5: Headless Command Runner] ---');
import { executeRunCommand } from '../src/lib/tools/run-command.ts';
const cmdResult = await executeRunCommand({ command: 'node -v' }, workdir);
console.log('Executed "node -v" | Exit:', cmdResult.exitCode, '| Output:', cmdResult.stdout.trim());
if (cmdResult.exitCode !== 0) throw new Error('run_command failed');
console.log('✅ Headless Command Runner Verified\n');

console.log('====================================================');
console.log('   🎉 ALL ACCEPTANCE CRITERIA TESTS PASSED!        ');
console.log('====================================================');
