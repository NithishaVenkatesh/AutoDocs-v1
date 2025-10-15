import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Explicitly disable Turbopack for Vercel compatibility
  output: 'standalone',
  experimental: {
    // Remove turbo option entirely to force Webpack usage
  },
  // Enable SWC minifier for better compatibility
  swcMinify: true,
  // Ensure we're using Webpack
  webpack: (config, { isServer }) => {
    // Disable any Turbopack-specific optimizations
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
      };
    }
    return config;
  },
};

export default nextConfig;
