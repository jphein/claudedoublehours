# Claude 2x Hours Tracker

A GNOME Shell extension that tracks Anthropic's **Claude 2x off-peak hours promotion** (March 13-27, 2026).

During off-peak hours, Claude doubles your usage limits (tokens and messages) across Claude web, desktop, mobile, Claude Code, and integrations.

![GNOME Shell 45+](https://img.shields.io/badge/GNOME_Shell-45%2B-4a86cf)
![License: GPL-3.0](https://img.shields.io/badge/License-GPL--3.0-blue)

## Features

- **Panel badge** with live countdown timer
- **Golden pulse animation** when 2x hours are active
- **Popup menu** with progress bar, next transition time, and schedule reference
- **Automatic timezone conversion** from ET to your local time
- **Configurable panel position** (left, center, right)

## Schedule

The 2x promotion applies outside standard peak hours (ET):

| Period | Hours (ET) | Multiplier |
|--------|-----------|------------|
| Mon-Fri | 2:00 PM - 8:00 AM | **2x** |
| Mon-Fri | 8:00 AM - 2:00 PM | 1x (peak) |
| Weekends | All day | **2x** |

## Install

### From extensions.gnome.org

Search for "Claude 2x Hours Tracker" on [extensions.gnome.org](https://extensions.gnome.org/).

### Manual install

```bash
git clone https://github.com/jphein/claudedoublehours.git
cd claudedoublehours
./install.sh
```

Then restart GNOME Shell (Alt+F2, type `r`, press Enter) and enable:

```bash
gnome-extensions enable claude-2x-hours@claude
```

## Settings

Open preferences via GNOME Extensions app or:

```bash
gnome-extensions prefs claude-2x-hours@claude
```

- **Panel position** - Move the indicator to the left, center, or right side of the top bar

## Requirements

- GNOME Shell 45, 46, 47, or 48

## License

GPL-3.0
