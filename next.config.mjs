/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  images: {
    unoptimized: true,
  },
  eslint: {
    ignoreDuringBuilds: false,
  },
  experimental: {
    // Keep native Node addons out of the webpack bundle — they must be
    // required at runtime, not compiled into the build worker. Without this,
    // the "Collecting page data" step crashes with exit code 3221225477
    // (Windows access violation) because better-sqlite3's .node binary gets
    // loaded inside the build sandbox where it has no valid DB path.
    serverComponentsExternalPackages: ["better-sqlite3"],
  },
};

export default nextConfig;

