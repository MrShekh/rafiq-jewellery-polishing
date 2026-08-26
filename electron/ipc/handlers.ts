import { app, BrowserWindow, dialog, ipcMain } from "electron";
import fs from "node:fs";

/**
 * IPC handlers for everything the renderer needs that touches the OS
 * directly: native Save/Open dialogs and basic app info/relaunch. Update
 * checking lives in electron/updater/index.ts since it needs its own
 * event wiring, but is registered the same way (ipcMain.handle).
 *
 * Every channel here is invoked only through the typed wrapper in
 * lib/electron-bridge.ts + electron/preload.ts - the renderer never talks
 * to ipcRenderer directly, so there's a single, reviewable list of what
 * the desktop app is allowed to ask the main process to do.
 */
export function registerIpcHandlers() {
  ipcMain.handle("app:get-info", async () => {
    return { version: app.getVersion(), platform: process.platform };
  });

  // Used by Settings > Data > Create Backup: the backend has already
  // written a zip into the app's own data directory (app/api/backup/create),
  // this just lets the user pick where on disk to keep a copy.
  ipcMain.handle(
    "dialog:save-file-as",
    async (event, sourcePath: string, suggestedName: string) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      const saveOptions = {
        defaultPath: suggestedName,
        filters: [{ name: "Zip archives", extensions: ["zip"] }],
      };
      const { canceled, filePath } = win
        ? await dialog.showSaveDialog(win, saveOptions)
        : await dialog.showSaveDialog(saveOptions);
      if (canceled || !filePath) {
        return { canceled: true as const };
      }
      try {
        fs.copyFileSync(sourcePath, filePath);
        return { canceled: false as const, savedPath: filePath };
      } catch (err) {
        throw new Error(`Could not save the file: ${(err as Error).message}`);
      }
    },
  );

  // Used by Settings > Data > Restore Backup to let the user pick a .zip
  // backup file from disk; the chosen path is then POSTed to
  // /api/backup/restore.
  ipcMain.handle(
    "dialog:open-file",
    async (event, options: { filters?: { name: string; extensions: string[] }[] }) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      const openOptions: Electron.OpenDialogOptions = {
        properties: ["openFile"],
        filters: options?.filters,
      };
      const { canceled, filePaths } = win
        ? await dialog.showOpenDialog(win, openOptions)
        : await dialog.showOpenDialog(openOptions);
      if (canceled || filePaths.length === 0) {
        return { canceled: true as const };
      }
      return { canceled: false as const, filePath: filePaths[0] };
    },
  );

  // Used after a restore has been staged (requiresRestart: true) so the
  // restored database gets picked up on the next startup.
  ipcMain.handle("app:relaunch", async () => {
    app.relaunch();
    app.exit(0);
  });
}
