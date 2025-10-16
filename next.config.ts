import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Use standalone output for Vercel or Docker deployments
  output: "standalone",

  // Explicitly force Webpack (Turbopack is still experimental)
  experimental: {},

  // Disable ESLint errors during production builds
  eslint: {
    ignoreDuringBuilds: true,
  },

  // Customize Webpack if needed
  webpack: (config, { isServer }) => {
    // Disable Node 'fs' module on the client side
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
