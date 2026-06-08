import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Ensure the iOS WebView (and browsers) always load the latest app code after
  // a deploy without requiring a delete-and-reinstall. We mark HTML documents
  // as no-store so each launch fetches fresh HTML, which in turn references the
  // latest content-hashed JS/CSS. The immutable hashed assets under
  // /_next/static keep their long-lived caching for performance. The matcher
  // excludes _next internals and any path containing a file extension.
  async headers() {
    return [
      {
        source: "/((?!_next/static|_next/image|.*\\.[\\w]+$).*)",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, max-age=0, must-revalidate",
          },
        ],
      },
    ];
  },
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
        hostname: "source.unsplash.com", // Unsplash Source API
      },
      {
        protocol: "https",
        hostname: "placehold.co", // For your fallback placeholders
      },
      {
        protocol: "https",
        hostname: "foodish-api.herokuapp.com", // Foodish API for food images
      },
    ],
  },
};

export default nextConfig;