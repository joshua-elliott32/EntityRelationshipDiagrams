import type { NextConfig } from "next";

// The app is a fully client-side single-page tool: every diagram is edited,
// analysed and exported in the browser. A static export keeps it that way —
// there is no server code to deploy, and it runs on Vercel or any static host.
const nextConfig: NextConfig = {
  output: "export",
  reactStrictMode: true,
  poweredByHeader: false,
  images: { unoptimized: true },
};

export default nextConfig;
