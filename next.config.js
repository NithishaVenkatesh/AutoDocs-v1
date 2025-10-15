/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    turbo: false, // disables Turbopack; use Webpack instead
  },
};

module.exports = nextConfig;
