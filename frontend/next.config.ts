import type { NextConfig } from "next";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:4000";

const nextConfig: NextConfig = {
  agentRules: false,
  // The dev server only serves its assets to localhost unless told otherwise. Slack OAuth needs an https
  // tunnel to the dashboard, so allow the usual tunnel domains.
  allowedDevOrigins: [
    "*.ngrok-free.app",
    "*.ngrok-free.dev",
    "*.ngrok.app",
    "*.ngrok.io",
    "*.trycloudflare.com",
    "*.loca.lt",
  ],
  // The browser only talks to this origin. /api/* and the Bull Board UI are proxied to the
  // Express backend, so session cookies and OAuth redirects stay first-party.
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${BACKEND_URL}/api/:path*` },
      { source: "/admin/queues", destination: `${BACKEND_URL}/admin/queues` },
      { source: "/admin/queues/:path*", destination: `${BACKEND_URL}/admin/queues/:path*` },
    ];
  },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "lh3.googleusercontent.com" }],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
