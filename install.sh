#!/bin/bash
# Install / update the Claude 2x Hours Tracker GNOME Shell extension

set -euo pipefail

UUID="claude-2x-hours@claude"
EXT_DIR="$HOME/.local/share/gnome-shell/extensions/$UUID"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Compile schemas
echo "Compiling schemas..."
glib-compile-schemas "$SCRIPT_DIR/schemas/"

# Remove old install if present
if [ -L "$EXT_DIR" ]; then
    rm "$EXT_DIR"
elif [ -d "$EXT_DIR" ]; then
    rm -rf "$EXT_DIR"
fi

# Copy extension files
mkdir -p "$EXT_DIR/schemas"
cp "$SCRIPT_DIR"/metadata.json "$EXT_DIR"/
cp "$SCRIPT_DIR"/extension.js "$EXT_DIR"/
cp "$SCRIPT_DIR"/prefs.js "$EXT_DIR"/
cp "$SCRIPT_DIR"/stylesheet.css "$EXT_DIR"/
cp "$SCRIPT_DIR"/schemas/*.xml "$EXT_DIR/schemas/"
cp "$SCRIPT_DIR"/schemas/gschemas.compiled "$EXT_DIR/schemas/"

echo "Installed to: $EXT_DIR"
echo ""
echo "To activate:"
echo "  1. Restart GNOME Shell: press Alt+F2, type 'r', press Enter"
echo "     (on Wayland: log out and log back in)"
echo "  2. Enable the extension:"
echo "     gnome-extensions enable $UUID"
echo ""
echo "To update after edits, re-run: ./install.sh"
echo ""
echo "To uninstall:"
echo "  gnome-extensions disable $UUID"
echo "  rm -rf $EXT_DIR"
