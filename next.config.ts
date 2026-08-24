import type { NextConfig } from "next";

const isStaticAppBuild = process.env.NEXT_OUTPUT === "export";

const nextConfig: NextConfig = {
  agentRules: false,
  output: isStaticAppBuild ? "export" : "standalone",
  trailingSlash: isStaticAppBuild,
  images: {
    unoptimized: true
  }
};

export default nextConfig;
