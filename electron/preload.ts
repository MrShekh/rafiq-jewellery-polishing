import { contextBridge, ipcRenderer } from "electron";

/**
 * The only bridge between the renderer (the Next.js app, running with
 * contextIsolation on and nodeIntegration off) and privileged main-process
 * operations. This must stay in lockstep with the `ElectronAPI` interface
 * declared in lib/electron-bridge.ts - that file is what the renderer
 * actually imports against, this file is what makes `window.electronAPI`
 * real.
 */
contextBridge.exposeInMainWorld("electronAPI", {
  getAppInfo: () => ipcRenderer.invoke("app:get-info"),

  saveFileAs: (sourcePath: string, suggestedName: string) =>
    ipcRenderer.invoke("dialog:save-file-as", sourcePath, suggestedName),

  openFileDialog: (options: { filters?: { name: string; extensions: string[] }[] }) =>
    ipcRenderer.invoke("dialog:open-file", options),

  checkForUpdates: () => ipcRenderer.invoke("updates:check"),

  downloadAndInstallUpdate: () => ipcRenderer.invoke("updates:download-and-install"),

  relaunchApp: () => ipcRenderer.invoke("app:relaunch"),

  onUpdateEvent: (callback: (event: { type: string; payload?: unknown }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: { type: string; payload?: unknown }) =>
      callback(payload);
    ipcRenderer.on("update:event", listener);
    return () => ipcRenderer.removeListener("update:event", listener);
  },
});
