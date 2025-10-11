import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Proxy specific backend API routes, excluding /api/auth/* for NextAuth
  async rewrites() {
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';
    return [
      // Backend routes - explicitly list to avoid conflicting with NextAuth /api/auth/*
      {
        source: '/api/user/:path*',
        destination: `${backendUrl}/api/user/:path*`,
      },
      {
        source: '/api/bot/:path*',
        destination: `${backendUrl}/api/bot/:path*`,
      },
      {
        source: '/api/broker/:path*',
        destination: `${backendUrl}/api/broker/:path*`,
      },
      {
        source: '/api/positions/:path*',
        destination: `${backendUrl}/api/positions/:path*`,
      },
      {
        source: '/api/strategies/:path*',
        destination: `${backendUrl}/api/strategies/:path*`,
      },
      {
        source: '/api/strategy-execution/:path*',
        destination: `${backendUrl}/api/strategy-execution/:path*`,
      },
      {
        source: '/api/backtest/:path*',
        destination: `${backendUrl}/api/backtest/:path*`,
      },
      {
        source: '/api/webhooks/:path*',
        destination: `${backendUrl}/api/webhooks/:path*`,
      },
      {
        source: '/api/marketplace/:path*',
        destination: `${backendUrl}/api/marketplace/:path*`,
      },
      {
        source: '/api/strategy-upload/:path*',
        destination: `${backendUrl}/api/strategy-upload/:path*`,
      },
      {
        source: '/api/settings/:path*',
        destination: `${backendUrl}/api/settings/:path*`,
      },
    ];
  },
};

export default nextConfig;
