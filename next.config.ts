import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Turbopack is disabled by not including experimental.turbo
  // Enable SWC minifier for better compatibility
  swcMinify: true,
};

export default nextConfig;
