import type { NextConfig } from 'next';
const config: NextConfig = {
  devIndicators: false,
  transpilePackages: ['@splitt/core'],
  async rewrites() {
    const apiOrigin = process.env.SPLITT_API_URL ?? 'http://127.0.0.1:4000';
    return [{ source: '/api/:path*', destination: `${apiOrigin}/:path*` }];
  },
};
export default config;
