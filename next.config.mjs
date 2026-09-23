import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  serverExternalPackages: ['node:sqlite', 'ws', 'diff', 'fast-glob'],
  outputFileTracingExcludes: {
    '*': [
      './release/**',
      './dist/**',
      './dist-electron/**',
      './build/**',
    ],
  },
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
