import type { NextConfig } from "next";

/**
 * Security headers for a WebRTC app.
 *
 * - `frame-ancestors 'none'` + `X-Frame-Options: DENY`: nobody can put your
 *   camera prompt inside an iframe.
 * - `Permissions-Policy`: camera/microphone/display-capture are limited to this
 *   origin and explicitly refused to any embedded frame.
 * - CSP keeps scripts, styles, objects and forms local. `connect-src` still
 *   allows the PeerJS signalling socket and media blobs; if you run your own
 *   PeerServer, narrow the `wss:`/`https:` entries down to that host.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "media-src 'self' blob: data:",
  "worker-src 'self' blob:",
  "connect-src 'self' https: wss: ws: blob: data:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  partialPrefetching: true,
  reactCompiler: true,
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          {
            key: "Permissions-Policy",
            value:
              "camera=(self), microphone=(self), display-capture=(self), autoplay=(self), geolocation=(), clipboard-read=(), clipboard-write=(self), usb=(), payment=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
