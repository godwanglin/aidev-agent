import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

async function main() {
  console.log('--- Packing Super-Slim NPM/NPX Runtime for Electron ---');
  const projectRoot = process.cwd();
  const targetDir = path.join(projectRoot, 'build', 'resources', 'npm');
  const resDir = path.join(projectRoot, 'build', 'resources');
  fs.mkdirSync(resDir, { recursive: true });

  const shimSrcDir = path.join(projectRoot, 'electron', 'shims');
  const cliDest = path.join(resDir, 'aidev.cmd');
  if (fs.existsSync(path.join(shimSrcDir, 'aidev.cmd'))) {
    fs.copyFileSync(path.join(shimSrcDir, 'aidev.cmd'), cliDest);
    console.log('Installed aidev.cmd CLI wrapper.');
  }

  // Non-Windows platforms (e.g. Linux) use the system npm/node environment
  if (process.platform !== 'win32') {
    console.log('Non-Windows platform detected. Skipping bundled npm runtime.');
    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(path.join(targetDir, '.keep'), '');
    return;
  }

  // Candidate locations for official npm package on Windows
  const candidateNpmPaths = [
    path.join(path.dirname(process.execPath), 'node_modules', 'npm'),
    path.join(path.dirname(process.execPath), '..', 'lib', 'node_modules', 'npm'),
    'C:\\Program Files\\nodejs\\node_modules\\npm',
    path.join(projectRoot, 'node_modules', 'npm'),
  ];

  try {
    const globalRoot = execSync('npm root -g', { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (globalRoot) {
      candidateNpmPaths.unshift(path.join(globalRoot, 'npm'));
    }
  } catch {}

  let sourceNpmPath = candidateNpmPaths.find((p) => fs.existsSync(p));

  if (!sourceNpmPath) {
    console.warn('[Warning] System npm directory not found. Creating placeholder so build continues.');
    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(path.join(targetDir, '.keep'), '');
    return;
  }

  console.log(`Source npm directory found at: ${sourceNpmPath}`);
  console.log(`Target destination: ${targetDir}`);

  if (fs.existsSync(targetDir)) {
    fs.rmSync(targetDir, { recursive: true, force: true });
  }
  fs.mkdirSync(targetDir, { recursive: true });

  console.log('Copying npm files...');
  fs.cpSync(sourceNpmPath, targetDir, { recursive: true, dereference: true, force: true });

  // Copy custom Electron shims
  const binDestDir = path.join(targetDir, 'bin');
  fs.mkdirSync(binDestDir, { recursive: true });

  const sourceNodeModules = path.join(targetDir, 'node_modules');
  const vendorDestDir = path.join(targetDir, 'vendor');
  if (fs.existsSync(sourceNodeModules)) {
    console.log('Duplicating node_modules to vendor directory to bypass electron-builder exclusion...');
    fs.cpSync(sourceNodeModules, vendorDestDir, { recursive: true, dereference: true, force: true });
  }

  if (fs.existsSync(path.join(shimSrcDir, 'npm.cmd'))) {
    fs.copyFileSync(path.join(shimSrcDir, 'npm.cmd'), path.join(binDestDir, 'npm.cmd'));
    console.log('Installed custom electron npm.cmd shim.');
  }

  if (fs.existsSync(path.join(shimSrcDir, 'npx.cmd'))) {
    fs.copyFileSync(path.join(shimSrcDir, 'npx.cmd'), path.join(binDestDir, 'npx.cmd'));
    console.log('Installed custom electron npx.cmd shim.');
  }

  console.log('✅ Super-Slim NPM/NPX Runtime successfully packed!');
}

main().catch((err) => {
  console.error('Failed packing npm:', err);
  // Ensure target directory exists with placeholder so build doesn't fail
  const fallbackDir = path.join(process.cwd(), 'build', 'resources', 'npm');
  try {
    fs.mkdirSync(fallbackDir, { recursive: true });
    fs.writeFileSync(path.join(fallbackDir, '.keep'), '');
  } catch {}
});
