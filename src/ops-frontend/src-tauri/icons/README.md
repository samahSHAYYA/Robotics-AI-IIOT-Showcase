# Tauri Application Icons

This directory should contain application icons for Tauri:

- `32x32.png` — Small icon for Windows taskbar / Linux panel
- `128x128.png` — Default icon for app lists and about dialogs
- `128x128@2x.png` — HiDPI (Retina) icon for macOS
- `icon.icns` — macOS icon bundle
- `icon.ico` — Windows icon (multiple resolutions)

## Generation

Generate these from your source icon (e.g. `app-icon.png` 1024×1024) using:

```bash
npx @tauri-apps/cli icon app-icon.png
```

This will produce all required formats automatically and place them in this
directory. The source icon should be a square PNG with at least 1024×1024
resolution for best results.
