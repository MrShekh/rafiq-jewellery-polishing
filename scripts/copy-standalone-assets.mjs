// Runs after `next build` (see package.json "postbuild"). Next's
// "standalone" output traces in only the node_modules the server needs,
// but deliberately does NOT copy the `public/` folder or the client-side
// `.next/static` assets into it - the docs ask you to do that yourself:
// https://nextjs.org/docs/app/api-reference/config/next-config-js/output
//
// electron/main.ts spawns `.next/standalone/server.js` directly in dev/
// unpackaged runs, so those two folders need to sit next to it there or
// every page loads with no CSS/JS and no logo/icons.
//
// For packaged (electron-builder) runs there's a second step: we stage a
// COPY of the now-complete .next/standalone tree one level deeper, at
// build-stage/pkg/. This is not just tidiness - electron-builder's file
// copier hard-excludes any folder literally named "node_modules" sitting
// at the root of whatever `extraResources[].from` points at (see
// app-builder-lib/out/util/filter.js: "filter the root node_modules, but
// not a sub node_modules"). Pointing `from` at build-stage (whose only
// direct child is "pkg") instead of straight at .next/standalone (whose
// direct child IS "node_modules") sidesteps that rule, since it only
// checks the immediate child name, not how deep node_modules ends up
// living overall. See electron/main.ts findServerEntry() for the matching
// packaged path (resources/app-server/pkg/server.js).
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const standaloneDir = path.join(root, ".next", "standalone");

if (!existsSync(standaloneDir)) {
  console.warn("[copy-standalone-assets] .next/standalone not found - skipping (did next.config.mjs set output: 'standalone'?)");
  process.exit(0);
}

const copies = [
  { from: path.join(root, "public"), to: path.join(standaloneDir, "public") },
  { from: path.join(root, ".next", "static"), to: path.join(standaloneDir, ".next", "static") },
];

for (const { from, to } of copies) {
  if (!existsSync(from)) {
    console.warn(`[copy-standalone-assets] skipping missing source: ${from}`);
    continue;
  }
  mkdirSync(path.dirname(to), { recursive: true });
  cpSync(from, to, { recursive: true });
  console.log(`[copy-standalone-assets] copied ${path.relative(root, from)} -> ${path.relative(root, to)}`);
}

// Same story as public/ and .next/static above: Next's standalone output
// does NOT copy .env files into itself. server.js sets NODE_ENV=production
// and does `process.chdir(__dirname)` before starting, and Next's own
// startup loads .env/.env.local/.env.production/.env.production.local from
// that directory (see loadEnvConfig, called deep inside
// next/dist/server/lib/start-server) - so whatever env file(s) exist next
// to server.js when it actually runs is what wins, not what existed on the
// machine that ran `npm run build`. Copy them here so MONGODB_URI (etc.)
// in your .env actually reaches the packaged app, exactly the way it
// already reaches plain `next dev`/`next start` for free.
for (const envFile of [".env", ".env.local", ".env.production", ".env.production.local"]) {
  const from = path.join(root, envFile);
  if (!existsSync(from)) continue;
  cpSync(from, path.join(standaloneDir, envFile));
  console.log(`[copy-standalone-assets] copied ${envFile} -> .next/standalone/${envFile}`);
}

// `next build`'s page-data-collection pass imports the API route modules
// for static analysis, which touches lib/db/client.ts at module load time.
// Since USER_DATA_PATH isn't set during the build, lib/paths.ts falls back
// to a `.data` folder under cwd - and because the standalone server's cwd
// during that trace happens to land inside .next/standalone, a throwaway
// SQLite file (with whatever data was in the dev DB at build time) can end
// up copied in here. This must never ship - wipe it before staging.
const staleDataDir = path.join(standaloneDir, ".data");
if (existsSync(staleDataDir)) {
  rmSync(staleDataDir, { recursive: true, force: true });
  console.log("[copy-standalone-assets] removed stray .data left over from the build's static analysis pass");
}

const stageDir = path.join(root, "build-stage");
const stagedPkgDir = path.join(stageDir, "pkg");
rmSync(stageDir, { recursive: true, force: true });
mkdirSync(stagedPkgDir, { recursive: true });
cpSync(standaloneDir, stagedPkgDir, { recursive: true });
console.log(`[copy-standalone-assets] staged packaging copy at ${path.relative(root, stagedPkgDir)}`);
