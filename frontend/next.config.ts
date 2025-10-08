import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Proxy all /api/* requests to backend server
  // This allows Google OAuth to work without needing separate DNS for api.xcoinalgo.com
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://184.72.102.221/api/:path*',
      },
    ];
  },
};

export default nextConfig;
