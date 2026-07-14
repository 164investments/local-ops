#!/bin/bash
set -euo pipefail

INSTALL_DIR="$HOME/local-ops"
LOCAL_OPS_REPO="https://github.com/164investments/local-ops.git"
TSHEETS_REPO="https://github.com/164investments/tsheets-clockout-checker.git"
APP_ROOT="$HOME/Applications"
APP_DIR="$APP_ROOT/Local Ops.app/Contents/MacOS"
RESOURCES_DIR="$APP_ROOT/Local Ops.app/Contents/Resources"
INFO_PLIST_SOURCE="$INSTALL_DIR/assets/LocalOps-Info.plist"
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

env_value() {
  local key="$1"
  local file="$2"

  if [ ! -f "$file" ]; then
    return
  fi

  awk -F= -v key="$key" '$1 == key { print substr($0, length(key) + 2); exit }' "$file"
}

write_tsheets_env() {
  local env_file="$1"
  local resend_api_key="$2"
  local resend_from_email="$3"
  local notify_email="$4"

  umask 077
  cat > "$env_file" << EOF
RESEND_API_KEY=$resend_api_key
RESEND_FROM_EMAIL=$resend_from_email
NOTIFY_EMAIL=$notify_email
WAREHOUSE_LAT=45.5205172
WAREHOUSE_LNG=-122.6552987
MAX_DISTANCE_FT=500
EOF
  chmod 600 "$env_file"
}

configure_tsheets_env() {
  local env_file="$SCRIPTS_DIR/tsheets-check/.env"
  local current_api_key current_from_email current_notify

  current_api_key="$(env_value RESEND_API_KEY "$env_file" || true)"
  current_from_email="$(env_value RESEND_FROM_EMAIL "$env_file" || true)"
  current_notify="$(env_value NOTIFY_EMAIL "$env_file" || true)"

  if [ -n "$current_api_key" ] && [ -n "$current_from_email" ] && [ -n "$current_notify" ]; then
    chmod 600 "$env_file"
    echo "TSheets Resend email credentials are configured."
    return
  fi

  if [ ! -t 0 ]; then
    if [ ! -f "$env_file" ]; then
      write_tsheets_env "$env_file" "" "" "trevor@stayportland.com"
    fi
    echo ""
    echo "  ⚠  TSheets Resend email credentials are not configured."
    echo "     Edit $env_file to add RESEND_API_KEY and RESEND_FROM_EMAIL."
    echo ""
    return
  fi

  echo ""
  echo "  Configure TSheets email reports."
  echo "  Use a Resend API key and a verified Resend sender address."
  echo ""

  local resend_api_key resend_from_email notify_email default_notify default_from
  default_notify="${current_notify:-trevor@stayportland.com}"
  default_from="${current_from_email:-Local Ops <reports@stayportland.com>}"

  if [ -n "$current_api_key" ]; then
    read -r -s -p "  Resend API key [keep existing if blank]: " resend_api_key
    echo ""
    resend_api_key="${resend_api_key:-$current_api_key}"
  else
    read -r -s -p "  Resend API key: " resend_api_key
    echo ""
  fi

  read -r -p "  Resend from address [$default_from]: " resend_from_email
  resend_from_email="${resend_from_email:-$default_from}"

  read -r -p "  Notification email(s) [$default_notify]: " notify_email
  notify_email="${notify_email:-$default_notify}"

  write_tsheets_env "$env_file" "$resend_api_key" "$resend_from_email" "$notify_email"

  if [ -n "$resend_api_key" ] && [ -n "$resend_from_email" ] && [ -n "$notify_email" ]; then
    echo "  TSheets Resend email credentials saved to $env_file"
  else
    echo ""
    echo "  ⚠  TSheets Resend email credentials are still incomplete."
    echo "     Email reports will be skipped until $env_file is filled in."
  fi
  echo ""
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
  configure_tsheets_env

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
  configure_tsheets_env
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

# Copy the plist that declares native architecture priority for this script-only app.
cp "$INFO_PLIST_SOURCE" "$HOME/Applications/Local Ops.app/Contents/Info.plist"
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
