#!/bin/bash
set -e

echo ""
echo "  ╔═══════════════════════════════════════╗"
echo "  ║     164 Investments — Local Ops       ║"
echo "  ╚═══════════════════════════════════════╝"
echo ""

# ─── Check prerequisites ────────────────────────────────────────

if ! command -v node &>/dev/null; then
  echo "Node.js is required. Installing via Homebrew..."
  if ! command -v brew &>/dev/null; then
    echo "Installing Homebrew first..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  fi
  brew install node
fi

if ! command -v git &>/dev/null; then
  echo "Git is required. Installing via Homebrew..."
  brew install git
fi

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
  echo "Node.js 18+ required (you have $(node -v)). Updating..."
  brew upgrade node
fi

# ─── Clone / update repo ────────────────────────────────────────

INSTALL_DIR="$HOME/local-ops"

if [ -d "$INSTALL_DIR/.git" ]; then
  echo "Updating existing installation..."
  cd "$INSTALL_DIR"
  git pull --ff-only
else
  echo "Installing Local Ops..."
  # Use gh CLI if available (handles private repo auth), fallback to git
  if command -v gh &>/dev/null; then
    gh repo clone 164investments/local-ops "$INSTALL_DIR"
  else
    git clone https://github.com/164investments/local-ops.git "$INSTALL_DIR"
  fi
  cd "$INSTALL_DIR"
fi

# ─── Install dependencies ───────────────────────────────────────

echo "Installing dependencies..."
npm install --silent

# ─── Install companion scripts ──────────────────────────────────

SCRIPTS_DIR="$HOME/scripts"
mkdir -p "$SCRIPTS_DIR"

# TSheets Clock-Out Checker
if [ ! -d "$SCRIPTS_DIR/tsheets-check" ]; then
  echo "Installing TSheets Clock-Out Checker..."
  git clone https://github.com/164investments/tsheets-clockout-checker.git "$SCRIPTS_DIR/tsheets-check"
  cd "$SCRIPTS_DIR/tsheets-check"
  npm install --silent

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
  cd "$SCRIPTS_DIR/tsheets-check"
  git pull --ff-only 2>/dev/null || true
  npm install --silent
  cd "$INSTALL_DIR"
fi

# ─── Create .env if needed ──────────────────────────────────────

if [ ! -f "$INSTALL_DIR/.env" ]; then
  echo ""
  echo "  ⚠  You need a .env file. Ask Trevor for the Supabase credentials."
  echo "     Create $INSTALL_DIR/.env with:"
  echo "     SUPABASE_URL=..."
  echo "     SUPABASE_ANON_KEY=..."
  echo ""
fi

# ─── Create launch script ──────────────────────────────────────

LAUNCH_SCRIPT="$INSTALL_DIR/launch.sh"
cat > "$LAUNCH_SCRIPT" << 'EOF'
#!/bin/bash
cd "$(dirname "$0")"
node server.mjs &
SERVER_PID=$!
sleep 1
open "http://localhost:3099"
echo "Local Ops running at http://localhost:3099 (PID: $SERVER_PID)"
echo "Press Ctrl+C to stop."
wait $SERVER_PID
EOF
chmod +x "$LAUNCH_SCRIPT"

# ─── Create macOS app shortcut ──────────────────────────────────

APP_DIR="$HOME/Applications/Local Ops.app/Contents/MacOS"
mkdir -p "$APP_DIR"
cat > "$APP_DIR/Local Ops" << EOF
#!/bin/bash
cd "$INSTALL_DIR"
node server.mjs &
sleep 1
open "http://localhost:3099"
wait
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
  <key>CFBundleVersion</key>
  <string>1.0</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
</dict>
</plist>
EOF

echo ""
echo "  ✅ Local Ops installed successfully!"
echo ""
echo "  To run:"
echo "    Option 1: Double-click 'Local Ops' in ~/Applications"
echo "    Option 2: Run: cd $INSTALL_DIR && npm start"
echo "    Option 3: Run: $LAUNCH_SCRIPT"
echo ""
echo "  The app opens at http://localhost:3099"
echo "  Drag 'Local Ops' from ~/Applications to your Dock for quick access."
echo ""
