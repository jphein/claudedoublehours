<!-- claude-md-version: b82789e | updated: 2026-03-22 -->
# CLAUDE.md — Claude 2x Hours Tracker

GNOME Shell extension that tracks Anthropic's Claude 2x off-peak hours promotion (March 13-27, 2026). Shows a live countdown, progress bar, and schedule in the GNOME top panel with a golden glow during active 2x hours.

## Quick Reference

- **UUID**: `claude-2x-hours@claude`
- **GNOME Shell**: 45-48
- **License**: GPL-3.0
- **Repo**: https://github.com/jphein/claudedoublehours

## Files

| File | Role |
|------|------|
| `extension.js` | Core: panel indicator, popup menu, time logic, pulse animation |
| `stylesheet.css` | St CSS theming (golden active, blue-gray inactive) |
| `prefs.js` | Preferences UI (Adw) — panel position setting |
| `metadata.json` | Extension metadata |
| `schemas/*.gschema.xml` | GSettings schema (panel-position) |
| `install.sh` | Compile schemas + install to GNOME extensions dir |

## Development

### Install after edits
```bash
./install.sh
# Then restart GNOME Shell: Alt+F2 → r → Enter (X11) or re-login (Wayland)
gnome-extensions enable claude-2x-hours@claude
```

### Check logs
```bash
journalctl /usr/bin/gnome-shell --since '5 min ago'
```

### Build distribution zip
```bash
gnome-extensions pack --extra-source=schemas/ --force
```

## Architecture

- **No build step** — plain GJS ES modules, no bundler
- **Single source file** (`extension.js`) — time logic, UI, and animation all in one
- **Promo dates hardcoded** — `PROMO_START` Mar 13, `PROMO_END` Mar 28 (midnight), peak = weekdays 8 AM-2 PM ET
- **1s timer** with auto-shutdown after promo ends
- **GLib.TimeZone** for ET→local conversion
- **Clutter.ease()** + **GLib.timeout_add()** for GC-safe golden pulse animation during 2x hours

## Conventions

- GJS ES module imports (`gi://`, `resource:///`)
- GNOME Shell extension API (PanelMenu.Button, PopupMenu, St widgets)
- St CSS (not web CSS — uses `background-gradient-*`, `box-shadow` syntax specific to St)
- Conventional commits (`feat:`, `fix:`, etc.)

## Gotchas

- GNOME Shell extensions cannot be hot-reloaded on Wayland — must log out/in
- St CSS is NOT web CSS: no flexbox, no `var()`, limited selectors
- **NEVER use `ease()` + `onComplete`** — if GC sweeps the actor mid-transition, GJS tries to invoke the JS callback during the sweep phase, causing compositor deadlock (black screen). Use `ease()` (no callback) + `GLib.timeout_add()` for follow-up actions instead
- The compiled `gschemas.compiled` binary is committed for easy manual install; regenerate with `glib-compile-schemas schemas/`
