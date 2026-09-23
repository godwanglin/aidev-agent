import fs from 'fs';
import path from 'path';

const ROOT = path.resolve('node_modules');

if (!fs.existsSync(ROOT)) {
  console.log('[Prune] node_modules not found, skipping.');
  process.exit(0);
}

let deletedFiles = 0;
let deletedDirs = 0;

const IGNORE_DIR_NAMES = new Set([
  'test',
  'tests',
  '__tests__',
  'docs',
  'documentation',
  'example',
  'examples',
  '.github',
  '.circleci',
]);

const DELETE_EXTENSIONS = [
  '.d.ts',
  '.d.mts',
  '.d.cts',
  '.map',
  '.md',
  '.markdown',
  '.tsbuildinfo',
];

function pruneDir(dirPath) {
  let entries;
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      if (IGNORE_DIR_NAMES.has(entry.name.toLowerCase())) {
        try {
          fs.rmSync(fullPath, { recursive: true, force: true });
          deletedDirs++;
        } catch {}
      } else {
        pruneDir(fullPath);
      }
    } else {
      const lowerName = entry.name.toLowerCase();
      let shouldDelete = false;

      for (const ext of DELETE_EXTENSIONS) {
        if (lowerName.endsWith(ext)) {
          shouldDelete = true;
          break;
        }
      }

      if (
        lowerName.startsWith('readme') ||
        lowerName.startsWith('changelog') ||
        lowerName.startsWith('changes') ||
        lowerName.startsWith('history') ||
        lowerName === '.npmignore' ||
        lowerName === '.eslintrc' ||
        lowerName === '.prettierrc' ||
        lowerName === '.editorconfig'
      ) {
        shouldDelete = true;
      }

      if (lowerName.endsWith('.ts') && !lowerName.endsWith('.d.ts')) {
        const jsSibling = fullPath.replace(/\.ts$/, '.js');
        if (fs.existsSync(jsSibling)) {
          shouldDelete = true;
        }
      }

      if (shouldDelete) {
        try {
          fs.unlinkSync(fullPath);
          deletedFiles++;
        } catch {}
      }
    }
  }
}

console.log('[Prune] Pruning non-runtime files from node_modules...');
pruneDir(ROOT);
console.log(`[Prune] Done! Removed ${deletedFiles} files and ${deletedDirs} directories from node_modules.`);
