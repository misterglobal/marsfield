import type { NextConfig } from "next";

const apiInternalUrl =
  process.env.API_INTERNAL_URL ||
  (process.env.NODE_ENV === "production" ? "http://backend:3001" : "http://localhost:3001");

const nextConfig: NextConfig = {
  output: "standalone",
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${apiInternalUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
