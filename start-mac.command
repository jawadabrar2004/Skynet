#!/bin/bash
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Download the LTS version from https://nodejs.org then run this again."
  read -p "Press Enter to close."
  exit 1
fi
[ -f config.txt ] || cp config.example.txt config.txt
if ! grep -q "^ANTHROPIC_API_KEY=sk-" config.txt 2>/dev/null; then
  echo "Note: no Claude API key in config.txt, so the SNAP assistant uses a basic keyword check."
  echo "The rest of the site works. To turn the AI on, add your key to config.txt and run this again."
  echo
fi
(sleep 1 && open "http://localhost:3000") &
node server.js

