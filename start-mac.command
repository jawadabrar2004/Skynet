#!/bin/bash
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Download the LTS version from https://nodejs.org then run this again."
  read -p "Press Enter to close."
  exit 1
fi
[ -f config.txt ] || cp config.example.txt config.txt
if ! grep -q "^ANTHROPIC_API_KEY=sk-" config.txt 2>/dev/null; then
  echo "Your API key is not in config.txt yet."
  echo "TextEdit will open. Paste your key after ANTHROPIC_API_KEY= , save, then run this again."
  open -e config.txt
  read -p "Press Enter to close."
  exit 0
fi
(sleep 1 && open "http://localhost:3000") &
node server.js

