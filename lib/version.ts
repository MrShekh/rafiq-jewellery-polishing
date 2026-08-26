import pkg from "../package.json";

// Single source of truth for the app version shown in Settings (section
// 20/34). electron-builder reads the version from package.json directly for
// the installer; this constant is what the Next.js UI displays and what
// gets stamped into backup manifests.
export const APP_VERSION = pkg.version;
