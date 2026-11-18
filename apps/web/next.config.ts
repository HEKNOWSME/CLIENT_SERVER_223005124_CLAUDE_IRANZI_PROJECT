import type { NextConfig } from 'next';
import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(__dirname, '../../.env'), quiet: true });
const apiOrigin = new URL(process.env.API_ORIGIN ?? 'http://127.0.0.1:3001').origin;

const nextConfig: NextConfig = {
  transpilePackages: ['@pmrms/contracts'],
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiOrigin}/v1/:path*` }];
  },
};
export default nextConfig;
