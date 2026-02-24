import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // postgres.js uses native modules that Next.js should not bundle
  serverExternalPackages: ['postgres'],
};

export default nextConfig;
