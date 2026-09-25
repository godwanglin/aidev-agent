import path from 'path';

/**
 * Common file extensions for binary executables, archives, media, and bytecode.
 */
export const BINARY_EXTENSIONS = new Set([
  // Executables & Native binaries
  'exe', 'dll', 'so', 'dylib', 'bin', 'node', 'wasm', 'msi', 'sys', 'drv', 'ocx',
  // Archives & Packages
  'zip', 'tar', 'gz', 'tgz', 'bz2', 'xz', '7z', 'rar', 'iso', 'dmg', 'pkg', 'deb', 'rpm', 'apk',
  // Compiled Bytecode & Object files
  'pyc', 'pyo', 'class', 'o', 'obj', 'lib', 'a', 'pdb', 'dex',
  // Database files
  'db', 'sqlite', 'sqlite3', 'mdb',
  // Documents & Office files
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
  // Audio & Video
  'mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'wma',
  'mp4', 'mkv', 'avi', 'mov', 'webm', 'wmv', 'flv',
  // Fonts
  'woff', 'woff2', 'ttf', 'otf', 'eot',
  // Graphics & Design binaries
  'psd', 'ai', 'eps',
]);

/**
 * Checks if a filename or path ends with a known binary extension.
 */
export function isBinaryExtension(filePath: string): boolean {
  if (!filePath) return false;
  const clean = filePath.split('?')[0].toLowerCase();
  const ext = path.extname(clean).replace(/^\./, '');
  return BINARY_EXTENSIONS.has(ext);
}

/**
 * Checks if a buffer contains null bytes (\0) in the first 1024 bytes, indicating binary data.
 */
export function isBinaryBuffer(buffer: Buffer): boolean {
  if (!buffer || buffer.length === 0) return false;
  const len = Math.min(buffer.length, 1024);
  for (let i = 0; i < len; i++) {
    if (buffer[i] === 0) return true;
  }
  return false;
}
