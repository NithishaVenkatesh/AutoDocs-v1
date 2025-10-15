import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Disable Turbopack to use stable Webpack
  experimental: {
    turbo: {},
  },
  // Enable SWC minifier for better compatibility
  swcMinify: true,
};

export default nextConfig;
