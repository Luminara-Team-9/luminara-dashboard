import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone", // 🚀 SRE FIX: Required for read-only Singularity containers
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  webpack: (config, { dev }) => {
    if (dev) {
      config.watchOptions = {
        poll: 1000,
        aggregateTimeout: 300,
      };
    }
    return config;
  },
};

export default nextConfig;
