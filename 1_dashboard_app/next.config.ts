import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* 
     🚀 SRE REQUIRED FIX: This overrides the default 'null' output.
     It forces Next.js to bundle only necessary files into a standalone folder,
     which is required for the Luminara ABRM02 cluster environment.
  */
  output: "standalone", 
  
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;