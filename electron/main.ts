import { app, BrowserWindow, dialog, session, shell } from "electron";
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

import { registerIpcHandlers } from "./ipc/handlers";
import { setupAutoUpdater } from "./updater";

/**
 * Electron main process (section 30/31 of the brief): contextIsolation on,
 * nodeIntegration off, no secrets in the renderer, and this file is the
 * only place that touches the filesystem/native dialogs/updater directly.
 * The renderer (the Next.js app) only ever reaches these through
 * electron/preload.ts's `contextBridge.exposeInMainWorld`.
 *
 * Architecture: Electron does not re-implement the backend. It spawns the
 * already-built Next.js "standalone" server as a child process on
 * 127.0.0.1, points a BrowserWindow at it, and forwards a few
 * privileged operations (native Save/Open dialogs, the updater, app
 * relaunch) over IPC. This keeps exactly one implementation of the
 * business logic (the Next.js API routes + Drizzle/SQLite layer already
 * built and tested) instead of duplicating it for "desktop mode".
 */

const APP_NAME = "Jewellery Polishing Manager";
app.setName(APP_NAME);

const DEFAULT_PORT = 47821;

let mainWindow: BrowserWindow | null = null;
let serverProcess: ChildProcess | null = null;
let baseUrl: string | null = null;

// --- Single instance lock: two copies of a desktop DB app fighting over
// the same SQLite file is exactly the kind of data-safety bug the brief
// says to avoid at all costs. ---
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

function getUserDataDir(): string {
  return app.getPath("userData");
}

/**
 * If Settings > Data > Restore Backup staged a restore on a previous run
 * (see lib/backup/restore.ts `stageRestore`), swap it into place now -
 * before the Next.js server (and its long-lived WAL-mode SQLite handle)
 * starts. A safety backup of the database being replaced was already
 * taken at staging time, so this is always reversible.
 */
function applyPendingRestoreIfAny(userDataDir: string) {
  const markerPath = path.join(userDataDir, "restore-marker.json");
  const pendingDbPath = path.join(userDataDir, "pending-restore.sqlite3");
  const liveDbPath = path.join(userDataDir, "db", "jewellery-polishing.sqlite3");

  if (!fs.existsSync(markerPath) || !fs.existsSync(pendingDbPath)) return;

  try {
    fs.mkdirSync(path.dirname(liveDbPath), { recursive: true });
    // Drop stale WAL/SHM sidecars from the database being replaced so they
    // can't get combined with frames belonging to the restored file.
    for (const suffix of ["-wal", "-shm"]) {
      const sidecar = liveDbPath + suffix;
      if (fs.existsSync(sidecar)) fs.rmSync(sidecar);
    }
    fs.copyFileSync(pendingDbPath, liveDbPath);
    fs.rmSync(pendingDbPath);
    fs.rmSync(markerPath);
    console.log("[main] Applied pending restore before startup.");
  } catch (err) {
    console.error("[main] Failed to apply pending restore:", err);
    dialog.showErrorBox(
      "Restore failed",
      `A staged backup restore could not be applied: ${(err as Error).message}\n\nThe application will start with your previous data.`,
    );
  }
}

function findServerEntry(): string {
  // Packaged app: electron-builder copies the staged standalone Next.js
  // server build into resources/app-server/pkg (see the "extraResources"
  // entry in package.json's "build" config, and the comment in
  // scripts/copy-standalone-assets.mjs explaining the extra "pkg" nesting
  // level - it exists purely to dodge electron-builder's hardcoded
  // root-level node_modules exclusion).
  const packagedEntry = path.join(process.resourcesPath, "app-server", "pkg", "server.js");
  if (app.isPackaged) return packagedEntry;

  // Dev / unpackaged run (e.g. `npm run electron:pack` testing straight out
  // of the repo): use the standalone build produced by `npm run build`.
  return path.join(__dirname, "..", ".next", "standalone", "server.js");
}

function waitForServer(port: number, timeoutMs = 30000): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get({ host: "127.0.0.1", port, path: "/", timeout: 2000 }, (res) => {
        res.resume();
        resolve();
      });
      req.on("error", () => {
        if (Date.now() - start > timeoutMs) {
          reject(new Error("Timed out waiting for the local application server to start."));
        } else {
          setTimeout(attempt, 300);
        }
      });
      req.on("timeout", () => req.destroy());
    };
    attempt();
  });
}

async function startServer(userDataDir: string): Promise<string> {
  const entry = findServerEntry();
  if (!fs.existsSync(entry)) {
    throw new Error(
      `Could not find the application server at:\n${entry}\n\nRun "npm run build" (which produces the standalone server) before launching Electron.`,
    );
  }

  const port = DEFAULT_PORT;
  serverProcess = spawn(process.execPath, [entry], {
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(port),
      HOSTNAME: "127.0.0.1",
      USER_DATA_PATH: userDataDir,
      // Runs Electron's bundled binary as plain Node so end users don't
      // need Node.js installed separately to run the packaged app.
      ELECTRON_RUN_AS_NODE: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  serverProcess.stdout?.on("data", (chunk) => console.log(`[server] ${String(chunk).trim()}`));
  serverProcess.stderr?.on("data", (chunk) => console.error(`[server] ${String(chunk).trim()}`));
  serverProcess.on("exit", (code) => {
    console.log(`[main] Server process exited with code ${code}`);
    serverProcess = null;
  });

  await waitForServer(port);
  return `http://127.0.0.1:${port}`;
}

/**
 * In `npm run electron:dev`, ELECTRON_DEV_SERVER_URL points at an
 * already-running `next dev` server instead of spawning the standalone
 * build - faster iteration, same renderer code path.
 */
async function resolveBaseUrl(userDataDir: string): Promise<string> {
  const devServerUrl = process.env.ELECTRON_DEV_SERVER_URL;
  if (devServerUrl) {
    const url = new URL(devServerUrl);
    await waitForServer(Number(url.port || 80));
    return devServerUrl;
  }
  return startServer(userDataDir);
}

/** CSP restricted to the local server this app talks to - section 30:
 * "CSP where practical". The app never loads remote content, so this can
 * be tight without breaking anything. */
function applyContentSecurityPolicy() {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [
          "default-src 'self' http://127.0.0.1:* http://localhost:*; " +
            "script-src 'self' 'unsafe-inline' http://127.0.0.1:* http://localhost:*; " +
            "style-src 'self' 'unsafe-inline' http://127.0.0.1:* http://localhost:*; " +
            "img-src 'self' data: http://127.0.0.1:* http://localhost:*; " +
            "font-src 'self' data: http://127.0.0.1:* http://localhost:*; " +
            "connect-src 'self' http://127.0.0.1:* http://localhost:*; " +
            "object-src 'none'; base-uri 'self'; frame-ancestors 'none';",
        ],
      },
    });
  });
}

function createWindow(url: string) {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: "#f8f9fb",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  mainWindow.once("ready-to-show", () => mainWindow?.show());

  // The app never intentionally navigates away from its own local server;
  // if anything ever tries to (a stray target=_blank link, etc.) send it
  // to the OS browser instead of letting the app window navigate off.
  mainWindow.webContents.setWindowOpenHandler(({ url: targetUrl }) => {
    shell.openExternal(targetUrl);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, targetUrl) => {
    if (!targetUrl.startsWith(url)) {
      event.preventDefault();
      shell.openExternal(targetUrl);
    }
  });

  mainWindow.loadURL(url);
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  if (!gotLock) return;

  const userDataDir = getUserDataDir();
  fs.mkdirSync(userDataDir, { recursive: true });

  applyPendingRestoreIfAny(userDataDir);
  applyContentSecurityPolicy();
  registerIpcHandlers();
  setupAutoUpdater(() => mainWindow);

  try {
    baseUrl = await resolveBaseUrl(userDataDir);
    createWindow(baseUrl);
  } catch (err) {
    console.error("[main] Fatal startup error:", err);
    dialog.showErrorBox(
      "Failed to start Jewellery Polishing Manager",
      `The application's local server could not be started.\n\n${(err as Error).message}`,
    );
    app.quit();
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0 && baseUrl) createWindow(baseUrl);
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
});
