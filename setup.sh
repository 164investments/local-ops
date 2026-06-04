#!/bin/bash
set -euo pipefail

INSTALL_DIR="$HOME/local-ops"
LOCAL_OPS_REPO="https://github.com/164investments/local-ops.git"
TSHEETS_REPO="https://github.com/164investments/tsheets-clockout-checker.git"
APP_ROOT="$HOME/Applications"
APP_DIR="$APP_ROOT/Local Ops.app/Contents/MacOS"
RESOURCES_DIR="$APP_ROOT/Local Ops.app/Contents/Resources"
UPDATE_COMMAND="$APP_ROOT/Update Local Ops.command"

load_brew_shellenv() {
  if command -v brew &>/dev/null; then
    return
  fi

  for brew_bin in /opt/homebrew/bin/brew /usr/local/bin/brew; do
    if [ -x "$brew_bin" ]; then
      eval "$("$brew_bin" shellenv)"
      return
    fi
  done
}

ensure_homebrew() {
  load_brew_shellenv
  if command -v brew &>/dev/null; then
    return
  fi

  echo "Homebrew is required. Installing Homebrew..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  load_brew_shellenv

  if ! command -v brew &>/dev/null; then
    echo "Homebrew installed, but it is not available in this shell yet."
    echo "Open a new Terminal window and run this installer again."
    exit 1
  fi
}

ensure_command() {
  local command_name="$1"
  local formula="$2"

  if command -v "$command_name" &>/dev/null; then
    return
  fi

  ensure_homebrew
  echo "$formula is required. Installing via Homebrew..."
  brew install "$formula"
}

install_node_modules() {
  if [ -f package-lock.json ]; then
    npm ci --silent
  else
    npm install --silent
  fi
}

echo ""
echo "  ╔═══════════════════════════════════════╗"
echo "  ║     164 Investments — Local Ops       ║"
echo "  ╚═══════════════════════════════════════╝"
echo ""

# ─── Check prerequisites ────────────────────────────────────────

if [ "$(uname -s)" != "Darwin" ]; then
  echo "This installer currently supports macOS only."
  exit 1
fi

ensure_command git git
ensure_command node node

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "${NODE_VERSION:-0}" -lt 18 ]; then
  echo "Node.js 18+ required (you have $(node -v)). Updating..."
  ensure_homebrew
  brew upgrade node
fi

# ─── Clone / update repo ────────────────────────────────────────

if [ -d "$INSTALL_DIR/.git" ]; then
  echo "Updating existing installation..."
  git -C "$INSTALL_DIR" pull --ff-only
elif [ -d "$INSTALL_DIR" ]; then
  echo "Install directory exists but is not a git repo: $INSTALL_DIR"
  echo "Move it aside and rerun this installer."
  exit 1
else
  echo "Installing Local Ops..."
  git clone "$LOCAL_OPS_REPO" "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"

# ─── Install dependencies ───────────────────────────────────────

echo "Installing dependencies..."
install_node_modules

# ─── Install companion scripts ──────────────────────────────────

SCRIPTS_DIR="$HOME/scripts"
mkdir -p "$SCRIPTS_DIR"

# TSheets Clock-Out Checker
if [ ! -d "$SCRIPTS_DIR/tsheets-check" ]; then
  echo "Installing TSheets Clock-Out Checker..."
  git clone "$TSHEETS_REPO" "$SCRIPTS_DIR/tsheets-check"
  cd "$SCRIPTS_DIR/tsheets-check"
  install_node_modules
  npx playwright install chromium

  # Create default .env if it doesn't exist
  if [ ! -f .env ]; then
    cat > .env << 'ENVEOF'
GMAIL_USER=
GMAIL_APP_PASSWORD=
NOTIFY_EMAIL=trevor@stayportland.com
WAREHOUSE_LAT=45.5205172
WAREHOUSE_LNG=-122.6552987
MAX_DISTANCE_FT=500
ENVEOF
    echo ""
    echo "  ⚠  TSheets .env created at $SCRIPTS_DIR/tsheets-check/.env"
    echo "     Edit it to add your Gmail credentials for email reports."
    echo "     Get an App Password at: https://myaccount.google.com/apppasswords"
    echo ""
  fi

  cd "$INSTALL_DIR"
else
  echo "TSheets checker already installed, updating..."
  if [ ! -d "$SCRIPTS_DIR/tsheets-check/.git" ]; then
    echo "TSheets checker directory exists but is not a git repo: $SCRIPTS_DIR/tsheets-check"
    echo "Move it aside and rerun this installer."
    exit 1
  fi
  git -C "$SCRIPTS_DIR/tsheets-check" pull --ff-only
  cd "$SCRIPTS_DIR/tsheets-check"
  install_node_modules
  npx playwright install chromium
  cd "$INSTALL_DIR"
fi

# ─── Create .env if needed ──────────────────────────────────────

if [ ! -f "$INSTALL_DIR/.env" ]; then
  echo ""
  echo "  ⚠  Supabase is not configured on this computer."
  echo "     QuickBooks Time can still run without it."
  echo "     Tax/property admin screens need $INSTALL_DIR/.env with:"
  echo "     SUPABASE_URL=..."
  echo "     SUPABASE_ANON_KEY=..."
  echo ""
fi

# ─── Create launch script ──────────────────────────────────────

LAUNCH_SCRIPT="$INSTALL_DIR/launch.sh"
cat > "$LAUNCH_SCRIPT" << 'EOF'
#!/bin/bash
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
cd "$(dirname "$0")"
PORT="${PORT:-3099}"
export PORT
node server.mjs &
SERVER_PID=$!
sleep 1
open "http://localhost:$PORT"
echo "Local Ops running at http://localhost:$PORT (PID: $SERVER_PID)"
echo "Press Ctrl+C to stop."
wait $SERVER_PID
EOF
chmod +x "$LAUNCH_SCRIPT"

# ─── Create macOS app shortcut ──────────────────────────────────

mkdir -p "$APP_DIR" "$RESOURCES_DIR"
if [ -f "$INSTALL_DIR/assets/LocalOps.icns" ]; then
  cp "$INSTALL_DIR/assets/LocalOps.icns" "$RESOURCES_DIR/LocalOps.icns"
fi

cat > "$APP_DIR/Local Ops" << EOF
#!/bin/bash
export PATH="/opt/homebrew/bin:/usr/local/bin:\$PATH"
cd "$INSTALL_DIR"
PORT="\${PORT:-3099}"
export PORT
node server.mjs &
SERVER_PID=\$!
sleep 1
open "http://localhost:\$PORT"
wait "\$SERVER_PID"
EOF
chmod +x "$APP_DIR/Local Ops"

# Create Info.plist for the app
cat > "$HOME/Applications/Local Ops.app/Contents/Info.plist" << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key>
  <string>Local Ops</string>
  <key>CFBundleExecutable</key>
  <string>Local Ops</string>
  <key>CFBundleIdentifier</key>
  <string>com.164investments.local-ops</string>
  <key>CFBundleIconFile</key>
  <string>LocalOps</string>
  <key>CFBundleIconName</key>
  <string>LocalOps</string>
  <key>CFBundleVersion</key>
  <string>1.0</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
</dict>
</plist>
EOF
touch "$HOME/Applications/Local Ops.app"

# ─── Create updater shortcut ────────────────────────────────────

cat > "$UPDATE_COMMAND" << EOF
#!/bin/bash
export PATH="/opt/homebrew/bin:/usr/local/bin:\$PATH"
bash "$INSTALL_DIR/setup.sh"
echo ""
echo "Local Ops is up to date. You can close this window."
read -n 1 -s -r -p "Press any key to close..."
echo ""
EOF
chmod +x "$UPDATE_COMMAND"

echo ""
echo "  ✅ Local Ops installed successfully!"
echo ""
echo "  To run:"
echo "    Option 1: Double-click 'Local Ops' in ~/Applications"
echo "    Option 2: Run: cd $INSTALL_DIR && npm start"
echo "    Option 3: Run: $LAUNCH_SCRIPT"
echo ""
echo "  To update later:"
echo "    Option 1: Double-click 'Update Local Ops.command' in ~/Applications"
echo "    Option 2: Run this installer command again"
echo ""
echo "  The app opens at http://localhost:3099"
echo "  Drag 'Local Ops' from ~/Applications to your Dock for quick access."
echo ""
