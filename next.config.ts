import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "plus.unsplash.com", // Unsplash often uses this subdomain too
      },
      {
        protocol: "https",
        hostname: "placehold.co", // For your fallback placeholders
      },
    ],
  },
};

export default nextConfig;