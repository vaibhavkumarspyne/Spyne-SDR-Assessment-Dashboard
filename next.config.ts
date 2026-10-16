import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingRoot: __dirname,
  serverExternalPackages: ["postgres", "bcryptjs"],
  // Written answers and past-results CSV imports are larger than the 1 MB default.
  experimental: { serverActions: { bodySizeLimit: "8mb" } },
};

export default nextConfig;
