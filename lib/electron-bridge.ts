"use client";

/**
 * Typed wrapper over `window.electronAPI`, the surface exposed by
 * electron/preload/index.ts through `contextBridge.exposeInMainWorld`
 * (contextIsolation is on, nodeIntegration is off - section 30 - so this
 * is the *only* way the renderer reaches privileged main-process
 * operations: native dialogs, the updater, and relaunching the app).
 *
 * Every function here degrades gracefully when `window.electronAPI` is
 * absent (i.e. the app is running as a plain browser tab during `next dev`
 * without Electron) so the UI stays testable outside the packaged app.
 */

export interface ElectronAPI {
  getAppInfo: () => Promise<{ version: string; platform: string }>;
  saveFileAs: (sourcePath: string, suggestedName: string) => Promise<{ canceled: boolean; savedPath?: string }>;
  openFileDialog: (options: { filters?: { name: string; extensions: string[] }[] }) => Promise<{ canceled: boolean; filePath?: string }>;
  checkForUpdates: () => Promise<{ status: "checking" | "available" | "not-available" | "error" | "unsupported"; message?: string; version?: string }>;
  downloadAndInstallUpdate: () => Promise<{ status: "downloading" | "error" | "unsupported"; message?: string }>;
  relaunchApp: () => Promise<void>;
  onUpdateEvent: (callback: (event: { type: string; payload?: unknown }) => void) => () => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export function isElectron(): boolean {
  return typeof window !== "undefined" && !!window.electronAPI;
}

export function getElectronAPI(): ElectronAPI | null {
  if (typeof window === "undefined") return null;
  return window.electronAPI ?? null;
}
