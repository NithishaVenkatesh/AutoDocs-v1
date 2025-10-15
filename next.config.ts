import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Force webpack usage for better stability
  experimental: {
    turbo: undefined,
  },
  // Enable SWC minifier for better compatibility
  swcMinify: true,
  // Keep it simple for now
};

export default nextConfig;
