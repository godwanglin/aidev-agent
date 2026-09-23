import fs from 'fs';
import path from 'path';

function copyRecursiveSync(src, dest) {
  const exists = fs.existsSync(src);
  const stats = exists && fs.statSync(src);
  const isDirectory = exists && stats.isDirectory();
  if (isDirectory) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    fs.readdirSync(src).forEach((childItemName) => {
      copyRecursiveSync(path.join(src, childItemName), path.join(dest, childItemName));
    });
  } else {
    fs.copyFileSync(src, dest);
  }
}

async function main() {
  console.log('--- Packing Super-Slim NPM/NPX Runtime for Electron ---');
  const projectRoot = process.cwd();
  const targetDir = path.join(projectRoot, 'build', 'resources', 'npm');

  // Candidate locations for official npm package
  const candidateNpmPaths = [
    path.join(projectRoot, 'node_modules', 'npm'),
    path.join(path.dirname(process.execPath), 'node_modules', 'npm'),
    'C:\\Program Files\\nodejs\\node_modules\\npm',
  ];

  let sourceNpmPath = candidateNpmPaths.find((p) => fs.existsSync(p));

  if (!sourceNpmPath) {
    console.error('Could not find system npm source directory.');
    process.exit(1);
  }

  console.log(`Source npm directory found at: ${sourceNpmPath}`);
  console.log(`Target destination: ${targetDir}`);

  if (fs.existsSync(targetDir)) {
    fs.rmSync(targetDir, { recursive: true, force: true });
  }
  fs.mkdirSync(targetDir, { recursive: true });

  console.log('Copying npm files...');
  copyRecursiveSync(sourceNpmPath, targetDir);

  // Copy custom Electron shims
  const shimSrcDir = path.join(projectRoot, 'electron', 'shims');
  const binDestDir = path.join(targetDir, 'bin');

  // Copy node_modules to vendor directory so electron-builder will not strip it
  const sourceNodeModules = path.join(targetDir, 'node_modules');
  const vendorDestDir = path.join(targetDir, 'vendor');
  if (fs.existsSync(sourceNodeModules)) {
    console.log('Duplicating node_modules to vendor directory to bypass electron-builder exclusion...');
    copyRecursiveSync(sourceNodeModules, vendorDestDir);
  }

  if (fs.existsSync(path.join(shimSrcDir, 'npm.cmd'))) {
    fs.copyFileSync(path.join(shimSrcDir, 'npm.cmd'), path.join(binDestDir, 'npm.cmd'));
    console.log('Installed custom electron npm.cmd shim.');
  }

  if (fs.existsSync(path.join(shimSrcDir, 'npx.cmd'))) {
    fs.copyFileSync(path.join(shimSrcDir, 'npx.cmd'), path.join(binDestDir, 'npx.cmd'));
    console.log('Installed custom electron npx.cmd shim.');
  }

  // Copy aidev.cmd to build/resources/aidev.cmd
  const cliDest = path.join(projectRoot, 'build', 'resources', 'aidev.cmd');
  if (fs.existsSync(path.join(shimSrcDir, 'aidev.cmd'))) {
    fs.copyFileSync(path.join(shimSrcDir, 'aidev.cmd'), cliDest);
    console.log('Installed aidev.cmd CLI wrapper.');
  }

  console.log('✅ Super-Slim NPM/NPX Runtime successfully packed!');
}

main().catch((err) => {
  console.error('Failed packing npm:', err);
  process.exit(1);
});
