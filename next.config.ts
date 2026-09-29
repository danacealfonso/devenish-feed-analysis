import type { NextConfig } from "next";

// Static export for Firebase Hosting; all data access happens client-side against Supabase.
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: false,
  images: { unoptimized: true },
};

export default nextConfig;
