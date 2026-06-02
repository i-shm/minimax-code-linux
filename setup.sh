#!/bin/bash
# Setup script to download and prepare the binary files
# This script downloads the required Electron runtime for the Linux port

set -e

VERSION="3.0.35"
ELECTRON_VERSION="v33.2.0"
ELECTRON_URL="https://github.com/electron/electron/releases/download/${ELECTRON_VERSION}/electron-${ELECTRON_VERSION}-linux-x64.zip"

echo "=========================================="
echo "  MiniMax Agent Setup Script"
echo "=========================================="
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "Error: This script must be run as root"
    echo "Please run: sudo $0"
    exit 1
fi

# Create app directory structure
echo "[1/7] Creating application directory..."
mkdir -p /opt/minimax-agent/resources/resources/daemon/agents
mkdir -p /opt/minimax-agent/resources/resources/daemon/internal-skills
mkdir -p /opt/minimax-agent/resources/resources/daemon/prompts
mkdir -p /opt/minimax-agent/resources/resources/daemon/skills
mkdir -p /opt/minimax-agent/resources/resources/matrix-mcp-cli
mkdir -p /opt/minimax-agent/resources/resources/opencode
mkdir -p /opt/minimax-agent/locales
mkdir -p /opt/minimax-agent/swiftshader
mkdir -p /var/cache/minimax-agent
echo "  Directory created."

# Download Electron if not present
echo ""
echo "[2/7] Downloading Electron runtime..."
if [ ! -f /var/cache/minimax-agent/electron.zip ]; then
    curl -L -o /var/cache/minimax-agent/electron.zip "$ELECTRON_URL"
fi
echo "  Download complete."

# Extract Electron
echo ""
echo "[3/7] Extracting Electron..."
cd /opt/minimax-agent
unzip -o /var/cache/minimax-agent/electron.zip
echo "  Extraction complete."

# Install daemon npm dependencies
echo ""
echo "[4/7] Installing daemon dependencies..."
if command -v npm >/dev/null 2>&1; then
    cd /opt/minimax-agent/resources/resources/daemon
    npm install --omit=dev 2>/dev/null && echo "  Daemon dependencies installed." || echo "  Warning: npm install failed. Run 'cd /opt/minimax-agent/resources/resources/daemon && npm install' manually."
    cd /opt/minimax-agent
else
    echo "  Warning: npm not found. Install Node.js then run:"
    echo "    cd /opt/minimax-agent/resources/resources/daemon && npm install"
fi

# Set permissions
echo ""
echo "[5/7] Setting permissions..."
chmod 755 /opt/minimax-agent/electron
chmod 4755 /opt/minimax-agent/chrome-sandbox 2>/dev/null || true
chmod 755 /opt/minimax-agent/resources/resources/opencode 2>/dev/null || true
echo "  Permissions set."

# Register protocol handlers
echo ""
echo "[6/7] Registering protocol handlers..."
if command -v xdg-mime >/dev/null 2>&1; then
    xdg-mime default minimax-agent.desktop x-scheme-handler/minimax 2>/dev/null || true
    xdg-mime default minimax-agent.desktop x-scheme-handler/minimax-agent 2>/dev/null || true
fi

# Update desktop database
if [ -x /usr/bin/update-desktop-database ]; then
    update-desktop-database /usr/share/applications/ 2>/dev/null || true
fi

# Update icon cache
if [ -x /usr/bin/gtk-update-icon-cache ]; then
    gtk-update-icon-cache /usr/share/icons/hicolor 2>/dev/null || true
fi

echo "  Protocol handlers registered."

# Build native modules if possible
echo ""
echo "[7/7] Building native modules..."
if command -v npm >/dev/null 2>&1 && command -v node >/dev/null 2>&1; then
    if [ -d /opt/minimax-agent/resources/app.asar.unpacked/node_modules/better-sqlite3 ]; then
        cd /opt/minimax-agent/resources/app.asar.unpacked/node_modules/better-sqlite3
        npm rebuild 2>/dev/null && echo "  better-sqlite3 rebuilt for Linux." || echo "  Warning: better-sqlite3 rebuild failed."
    fi
fi

echo ""
echo "=========================================="
echo "  Setup Complete!"
echo ""
echo "  Note: You still need the opencode Linux binary:"
echo "  Place it at /opt/minimax-agent/resources/resources/opencode/opencode"
echo ""
echo "  If you have the .deb package installed, app.asar,"
echo "  daemon, and matrix-mcp-cli are already in place."
echo "=========================================="
