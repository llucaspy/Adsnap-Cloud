import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 60 * 60 * 24 * 30,
    deviceSizes: [390, 640, 768, 1024, 1280, 1536],
    imageSizes: [96, 160, 240, 320, 384, 512, 640],
    remotePatterns: [
      { protocol: 'https', hostname: '**.supabase.co' },
      { protocol: 'https', hostname: '**.vercel.app' },
      { protocol: 'https', hostname: 'assets.metroimg.com' },
      { protocol: 'https', hostname: 'uploads.metroimg.com' },
      { protocol: 'https', hostname: 'www.metropoles.com' },
    ],
  },
  experimental: {
    staleTimes: {
      dynamic: 60,
      static: 300,
    },
  },
};

export default nextConfig;
