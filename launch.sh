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
