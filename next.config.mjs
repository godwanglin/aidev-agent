import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['node:sqlite'],
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
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
