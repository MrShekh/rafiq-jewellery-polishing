import { app, type BrowserWindow, dialog, ipcMain } from "electron";
import { autoUpdater } from "electron-updater";

/**
 * electron-updater wiring (section 31: "Auto-update support via
 * electron-updater/electron-builder"). Requires a publish target
 * (electron-builder "build.publish" config - GitHub Releases, S3, or a
 * generic static file server) to actually have somewhere to check
 * against; see the project README for what to fill in there before
 * shipping. Without one configured, checkForUpdates/downloadAndInstallUpdate
 * both resolve with status "unsupported" rather than throwing at the user.
 */

type UpdateEventPayload = { type: string; payload?: unknown };

let getMainWindow: () => BrowserWindow | null = () => null;

function broadcast(event: UpdateEventPayload) {
  getMainWindow()?.webContents.send("update:event", event);
}

export function setupAutoUpdater(mainWindowGetter: () => BrowserWindow | null) {
  getMainWindow = mainWindowGetter;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("checking-for-update", () => broadcast({ type: "checking-for-update" }));
  autoUpdater.on("update-available", (info) =>
    broadcast({ type: "update-available", payload: { version: info.version } }),
  );
  autoUpdater.on("update-not-available", () => broadcast({ type: "update-not-available" }));
  autoUpdater.on("error", (err) => broadcast({ type: "error", payload: { message: err.message } }));
  autoUpdater.on("download-progress", (progress) =>
    broadcast({ type: "download-progress", payload: { percent: progress.percent } }),
  );
  autoUpdater.on("update-downloaded", async (info) => {
    broadcast({ type: "update-downloaded", payload: { version: info.version } });
    const win = getMainWindow();
    const messageOptions: Electron.MessageBoxOptions = {
      type: "info",
      buttons: ["Restart now", "Later"],
      defaultId: 0,
      cancelId: 1,
      title: "Update ready",
      message: `Version ${info.version} has been downloaded.`,
      detail:
        "Restart Jewellery Polishing Manager to apply the update. Your orders and customers are stored separately and will not be affected.",
    };
    const { response } = win
      ? await dialog.showMessageBox(win, messageOptions)
      : await dialog.showMessageBox(messageOptions);
    if (response === 0) {
      autoUpdater.quitAndInstall();
    }
  });

  ipcMain.handle("updates:check", async () => {
    if (!app.isPackaged) {
      return { status: "unsupported", message: "Automatic updates are only available in the installed application." };
    }
    return new Promise((resolve) => {
      const cleanup = () => {
        autoUpdater.removeListener("update-available", onAvailable);
        autoUpdater.removeListener("update-not-available", onNotAvailable);
        autoUpdater.removeListener("error", onError);
      };
      const onAvailable = (info: { version: string }) => {
        cleanup();
        resolve({ status: "available", version: info.version });
      };
      const onNotAvailable = () => {
        cleanup();
        resolve({ status: "not-available" });
      };
      const onError = (err: Error) => {
        cleanup();
        resolve({ status: "error", message: err.message });
      };
      autoUpdater.once("update-available", onAvailable);
      autoUpdater.once("update-not-available", onNotAvailable);
      autoUpdater.once("error", onError);
      autoUpdater.checkForUpdates().catch(onError);
    });
  });

  ipcMain.handle("updates:download-and-install", async () => {
    if (!app.isPackaged) {
      return { status: "unsupported", message: "Automatic updates are only available in the installed application." };
    }
    try {
      await autoUpdater.downloadUpdate();
      return { status: "downloading" };
    } catch (err) {
      return { status: "error", message: (err as Error).message };
    }
  });
}
