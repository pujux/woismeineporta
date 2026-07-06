import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  output: "standalone",
  serverExternalPackages: ["better-sqlite3", "typeorm", "impit"],
  async headers() {
    return [
      {
        // Icons never change (content-stable) — cache for 30 days.
        source: "/:icon(icon-192.png|icon-512.png)",
        headers: [{ key: "Cache-Control", value: "public, max-age=2592000" }],
      },
      {
        source: "/manifest.webmanifest",
        headers: [{ key: "Cache-Control", value: "public, max-age=86400" }],
      },
      {
        // Service worker must revalidate so client code updates propagate.
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "public, max-age=0, must-revalidate" }],
      },
    ];
  },
};

export default nextConfig;
