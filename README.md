# CT SNAP Checker (standalone version)

A website where you type what you want to buy, or a meal like "I want to make a burger,"
and AI tells you what Connecticut SNAP covers, with quantity and size controls.

## What you need (one time)

1. **Node.js 18 or newer.** Download the "LTS" version from https://nodejs.org and install it.
2. **A Claude API key.**
   - Go to https://console.anthropic.com and create an account.
   - Add a payment method and some credit under **Billing** (a few dollars lasts a long time for this app).
   - Go to **API Keys**, click **Create Key**, and copy it. It starts with `sk-ant-`.

## Setup

1. Unzip this folder anywhere on your computer.
2. Open **config.txt** (Notepad on Windows, TextEdit on Mac).
3. Paste your key after `ANTHROPIC_API_KEY=`, like this:

   ```
   ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxxxxx
   ```

4. Save the file.

## Run it

- **Windows:** double-click `start-windows.bat`
- **Mac:** double-click `start-mac.command`
  (the first time, you may need to right-click it and choose **Open**)
- **Any computer, from a terminal:** open a terminal in this folder and run `node server.js`

Then open **http://localhost:3000** in your browser. Keep the black window open while you use the site.

You'll know the AI is working when the receipts **don't** show the line
"Quick check by keyword matching." If something is wrong, the page shows a red message saying what to fix.

## Keep your key safe

- Never put your key inside `index.html`, and don't share your `config.txt` once your key is in it.
- The key stays on the server (`server.js`); the website never sees it.
- `MAX_CHECKS_PER_MINUTE` in `config.txt` limits how many checks each visitor can run, to protect your bill.

## Putting it online later

This runs on your own computer. To make it a public website, upload the whole folder to a host that runs
Node.js (for example Render, Railway, or a small VPS), and set `ANTHROPIC_API_KEY` in the host's
environment settings instead of putting it in `config.txt`.

## Updating the SNAP rules

The rules the AI follows are in `server.js`, in the `RULES` text near the top.
If Connecticut changes its SNAP rules (for example, bans soda or candy), edit that text and restart.

## Files

- `server.js` – the small server that talks to Claude (no installs needed)
- `public/index.html` – the website
- `config.txt` – your settings (API key goes here)
- `start-windows.bat`, `start-mac.command` – double-click launchers
