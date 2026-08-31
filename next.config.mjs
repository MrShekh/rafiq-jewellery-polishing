/** @type {import('next').NextConfig} */
const isElectronBuild = process.env.BUILD_TARGET === "electron";

const nextConfig = {
  reactStrictMode: true,
  // standalone output is only needed for the Electron desktop build where
  // Next.js is bundled inside the installer. For Vercel deployments the
  // platform manages the server itself so standalone must be OFF.
  output: isElectronBuild ? "standalone" : undefined,
  images: {
    unoptimized: true,
  },
  eslint: {
    ignoreDuringBuilds: false,
  },
  experimental: {
    serverComponentsExternalPackages: ["better-sqlite3", "mongodb"],
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.optimization.splitChunks = false;
    }
    return config;
  },
};

export default nextConfig;
