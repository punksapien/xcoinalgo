import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Proxy specific backend API routes, excluding /api/auth/* for NextAuth
  async rewrites() {
    return [
      // Backend routes - explicitly list to avoid conflicting with NextAuth /api/auth/*
      {
        source: '/api/user/:path*',
        destination: 'http://184.72.102.221/api/user/:path*',
      },
      {
        source: '/api/bot/:path*',
        destination: 'http://184.72.102.221/api/bot/:path*',
      },
      {
        source: '/api/broker/:path*',
        destination: 'http://184.72.102.221/api/broker/:path*',
      },
      {
        source: '/api/positions/:path*',
        destination: 'http://184.72.102.221/api/positions/:path*',
      },
      {
        source: '/api/strategies/:path*',
        destination: 'http://184.72.102.221/api/strategies/:path*',
      },
      {
        source: '/api/strategy-execution/:path*',
        destination: 'http://184.72.102.221/api/strategy-execution/:path*',
      },
      {
        source: '/api/backtest/:path*',
        destination: 'http://184.72.102.221/api/backtest/:path*',
      },
      {
        source: '/api/webhooks/:path*',
        destination: 'http://184.72.102.221/api/webhooks/:path*',
      },
    ];
  },
};

export default nextConfig;
