# Lite Zen — Focus on Code, Hide Everything Else

**One hotkey to hide all UI panels. One more to bring them back.**

No fullscreen. No zen mode quirks. Just your editor — instantly.

![Before and After](media/before-after.png)

## Why Lite Zen?

VS Code's built-in Zen Mode does too much: it goes fullscreen, centers your layout, hides line numbers, and mutes notifications. Sometimes you just want to **maximize your editor space** without losing your window position or workflow context.

**Lite Zen** gives you a single toggle that hides all surrounding UI — sidebar, bottom panel, activity bar, status bar, and secondary sidebar — and restores them exactly as they were.

## Features

- **Single hotkey toggle** — `Cmd+K Cmd+\` (Mac) / `Ctrl+K Ctrl+\` (Win/Linux)
- **Hides all 5 UI components**: primary sidebar, bottom panel, activity bar, status bar, auxiliary sidebar
- **Remembers previous state** — restores activity bar position and status bar visibility to their original values
- **Per-component control** — choose exactly which panels to hide/restore via settings
- **No fullscreen** — stays in your current window, keeps your window arrangement intact
- **No side effects** — no centered layout, no hidden line numbers, no muted notifications
- **Workspace-scoped state** — toggle state persists across VS Code restarts

## Installation

### From VS Code

1. Open Extensions (`Cmd+Shift+X`)
2. Search for `Lite Zen`
3. Click **Install**

### From VSIX

```sh
git clone https://github.com/setood/lite-zen.git
cd lite-zen
npm install
npm run package
# This produces a `lite-zen-<version>.vsix` file. Install it with:
code --install-extension lite-zen-*.vsix
```

## Usage

| Action            | Mac           | Windows / Linux |
| ----------------- | ------------- | --------------- |
| Toggle all panels | `Cmd+K Cmd+\` | `Ctrl+K Ctrl+\` |

Or open Command Palette (`Cmd+Shift+P`) and run **Lite Zen: Toggle All Panels**.

The hotkey is fully customizable — rebind them in **Keyboard Shortcuts** (`Cmd+K Cmd+S`).

## Settings

All settings are under `liteZen.*` and can be changed in Settings UI or `settings.json`:

| Setting                        | Default  | Description                                                                                                                           |
| ------------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `liteZen.hideSidebar`          | `true`   | Hide the primary sidebar                                                                                                              |
| `liteZen.hidePanel`            | `true`   | Hide the bottom panel (terminal, output, etc.)                                                                                        |
| `liteZen.hideActivityBar`      | `false`  | Hide the activity bar                                                                                                                 |
| `liteZen.hideStatusBar`        | `false`  | Hide the status bar                                                                                                                   |
| `liteZen.hideAuxiliaryBar`     | `true`   | Hide the secondary sidebar                                                                                                            |
| `liteZen.restoreSidebar`       | `true`   | Restore sidebar on toggle back                                                                                                        |
| `liteZen.restorePanel`         | `true`   | Restore bottom panel on toggle back                                                                                                   |
| `liteZen.restoreAuxiliaryBar`  | `true`   | Restore secondary sidebar on toggle back                                                                                              |
| `liteZen.panelDetectionMethod` | `"auto"` | Panel detection: `"auto"` (heuristic, safe default on short files) or `"tempDocument"` (fallback via temp doc for reliable detection) |
| `liteZen.enableLogging`        | `false`  | Write diagnostic logs to `log.txt` in workspace root                                                                                  |

## Lite Zen vs. Alternatives

Compared as of April 2026.

| Feature                  | **Lite Zen**     | Zen Mode (built-in) | Hide All v0.1.0 | Auto Hide v1.0.7 |
| ------------------------ | ---------------- | ------------------- | --------------- | ---------------- |
| Toggle sidebar           | ✅               | ✅                  | ✅              | ✅               |
| Toggle bottom panel      | ✅               | ✅                  | ✅              | ✅               |
| Toggle activity bar      | ✅               | ✅                  | ❌              | ❌               |
| Toggle status bar        | ✅               | ✅                  | ❌              | ❌               |
| Toggle auxiliary sidebar | ✅               | ❌                  | ✅              | ❌               |
| Escape to restore        | ❌               | ❌                  | ❌              | N/A              |
| Restore on re-toggle     | ✅               | ✅                  | ❌ (hide only)  | N/A              |
| Remembers previous state | ✅               | Partial             | ❌              | ❌               |
| Per-component settings   | ✅               | Limited             | ✅              | ❌               |
| No fullscreen            | ✅               | ❌ (default)        | ✅              | ✅               |
| No centered layout       | ✅               | ❌ (optional)       | ✅              | ✅               |
| No hidden line numbers   | ✅               | ❌ (optional)       | ✅              | ✅               |
| Trigger                  | Hotkey / Command | Hotkey              | Command only    | Automatic        |
| Last updated             | 2026             | VS Code built-in    | Jan 2023        | Sep 2021         |

## Support

If you find Lite Zen useful, consider supporting its development:

[![Ko-fi](https://img.shields.io/badge/Ko--fi-Support-ff5e5b?logo=ko-fi&logoColor=white)](https://ko-fi.com/setood)
[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-tip-ffdd00?logo=buy-me-a-coffee&logoColor=black)](https://buymeacoffee.com/setood)
[![GitHub Sponsors](https://img.shields.io/badge/GitHub%20Sponsors-sponsor-ea4aaa?logo=github-sponsors&logoColor=white)](https://github.com/sponsors/setood)

## How It Works

### Toggle Algorithm

**Hide** (`liteZen.toggle` when panels are visible):

1. Save the current state of the activity bar location and status bar visibility to `workspaceState`.
2. Detect whether the bottom panel is currently open (see heuristic below).
3. Close configured UI components (sidebar, panel, auxiliary bar) in parallel.
4. Set `activityBar.location` to `"hidden"` and `statusBar.visible` to `false` if configured.
5. Persist `liteZen.isHidden = true` in workspace state and update the `when`-clause context.

**Show** (`liteZen.toggle` again, or `Escape`):

1. Restore activity bar and status bar to their previously saved values.
2. Re-open sidebar, bottom panel, and auxiliary bar — but only the ones that were actually visible before hiding. The bottom panel is skipped if the detection determined it was closed.
3. Persist `liteZen.isHidden = false`.

A `isToggling` guard prevents race conditions from rapid double-presses of the hotkey.

### Bottom Panel Detection Trick

VS Code has no API to query "is the bottom panel open?". Lite Zen uses a **visible-lines heuristic**:

1. Record the number of visible editor lines (`editor.visibleRanges`).
2. Execute `workbench.action.closePanel`.
3. Wait `PANEL_DETECT_DELAY_MS` (100 ms) for VS Code to re-layout.
4. Measure visible lines again.
5. If the difference exceeds `PANEL_DIFF_THRESHOLD` (2 lines), the panel was open.

The heuristic is **unreliable** when:
- There is no active editor or visible ranges.
- The file has fewer than `MIN_VISIBLE_LINES` (3) visible lines.
- The end of the file is already on screen (VS Code won't add lines by scrolling up).

**Fallback — `tempDocument` mode**: When the heuristic is unreliable and `panelDetectionMethod` is set to `"tempDocument"`, the extension opens a scratch document with `TEMP_DOC_LINE_COUNT` (100) lines, measures before/after closing the panel, then closes the temp document and restores the original editor. In `"auto"` mode (default), it simply closes the panel and assumes it should be restored on show.

### Constants

| Constant                | Value  | Purpose                                                         |
| ----------------------- | ------ | --------------------------------------------------------------- |
| `PANEL_DETECT_DELAY_MS` | 100 ms | Delay after closing/opening panels to let VS Code re-layout     |
| `TEMP_DOC_LINE_COUNT`   | 100    | Number of lines in the temporary document for panel detection   |
| `MIN_VISIBLE_LINES`     | 3      | Minimum visible lines required for the heuristic to work        |
| `PANEL_DIFF_THRESHOLD`  | 2      | Minimum line-count difference that indicates the panel was open |

## License

MIT
