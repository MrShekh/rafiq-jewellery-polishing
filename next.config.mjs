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
    // Keep native Node addons / driver packages with optional dynamic
    // requires out of the webpack bundle — they must be required at
    // runtime from node_modules, not compiled into the build worker.
    // - better-sqlite3: without this, the "Collecting page data" step
    //   crashes with exit code 3221225477 (Windows access violation)
    //   because its .node binary gets loaded inside the build sandbox
    //   where it has no valid DB path.
    // - mongodb: the driver conditionally `require()`s several optional
    //   peer packages (kerberos, @mongodb-js/zstd, snappy, socks, AWS/GCP
    //   credential providers, mongodb-client-encryption) that aren't
    //   installed. Webpack can't statically resolve those requires and,
    //   left bundled, produced a broken production chunk graph: the
    //   packaged app's pages-router error-rendering chunk (`_document`)
    //   ended up requiring a chunk file that was never emitted
    //   ("Cannot find module './chunks/<n>.js'"), which 500'd on every
    //   request. Reproduced, bisected (against the commit before this
    //   changed), and confirmed fixed by externalizing "mongodb" here -
    //   see DEVELOPER.md.
    serverComponentsExternalPackages: ["better-sqlite3", "mongodb"],
  },
  webpack: (config, { isServer }) => {
    // Work around a Next.js `output: "standalone"` bug where an
    // automatically-extracted shared server chunk (used by many API routes
    // plus the root page) is referenced in the build's file-trace manifests
    // but never actually written to `.next/server/chunks/` - every request
    // that needs it then 500s with "Cannot find module './chunks/<n>.js'"
    // (only reproduces in the packaged/standalone server, since `next dev`
    // and `next start` from the full project directory don't rely on the
    // trace-and-copy step). Disabling server-side chunk splitting means
    // each route.js bundles its own dependencies inline instead of pulling
    // from a shared chunk - slightly larger per-route files, which is
    // irrelevant for a locally-run desktop server, in exchange for
    // eliminating this whole class of missing-chunk bug. Reproduced,
    // bisected, and confirmed fixed - see DEVELOPER.md.
    if (isServer) {
      config.optimization.splitChunks = false;
    }
    return config;
  },
};

export default nextConfig;

