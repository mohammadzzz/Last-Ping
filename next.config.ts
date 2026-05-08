import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    serverActions: {
      bodySizeLimit: "5gb",
    },
  },
  serverExternalPackages: ["argon2", "archiver"],
};

export default nextConfig;
