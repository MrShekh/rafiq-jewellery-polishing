# resources/

Drop a Windows app icon here as `icon.ico` (256x256 recommended, multi-size
.ico) and add this to `package.json`'s `"build"` section to use it:

```json
"win": {
  "target": ["nsis"],
  "icon": "resources/icon.ico"
}
```

Without it, electron-builder falls back to a generic default icon - the app
builds and runs fine either way, this is purely cosmetic branding.
