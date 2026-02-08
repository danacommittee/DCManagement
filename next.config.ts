import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [{ source: "/favicon.ico", destination: "/logo.png", permanent: true }];
  },
};

export default nextConfig;
