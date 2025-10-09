import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Proxy backend API requests, but let NextAuth handle /api/auth/* routes
  async rewrites() {
    return {
      // afterFiles runs AFTER checking API routes
      // This ensures NextAuth routes (/api/auth/*) are handled by Next.js first
      // Only non-existent routes get proxied to backend
      afterFiles: [
        {
          source: '/api/:path*',
          destination: 'http://184.72.102.221/api/:path*',
        },
      ],
    };
  },
};

export default nextConfig;
