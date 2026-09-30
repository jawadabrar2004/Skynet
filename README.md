# Doorstep

One website that helps people in Connecticut get food:

- **Landing page** asks "Hungry? What do you want to eat or buy today?" and sends the answer to the SNAP assistant.
- **SNAP assistant** (`pages/assistant.html`) uses Claude to say what Connecticut SNAP covers, with quantity and size controls. Name a meal, like "I want to make a burger," and it lists the groceries.
  After each answer it asks "Do you want to add more items, or confirm this list?" and keeps asking until the shopper confirms
  (with the button, or by typing "confirm"). The confirmed list becomes a **cart** with a price estimate for each item and an estimated total.
- **Nearby stores** (`pages/map.html`) finds SNAP/EBT stores near you by car, bus, or on foot.
- **Sign up / Sign in** (top right) with a phone number and a one-time code (demo).

Plain HTML, CSS, and JavaScript, plus a small Node.js server (`server.js`) that talks to Claude. No build step, no npm install.

## What you need (one time)

1. **Node.js 18 or newer.** Download the "LTS" version from https://nodejs.org and install it.
2. **A Claude API key.** At https://console.anthropic.com add some credit under **Billing**, then go to **API Keys**, click **Create Key**, and copy it. It starts with `sk-ant-`.

## Run it

- **Windows:** double-click `start-windows.bat`
- **Mac:** double-click `start-mac.command` (the first time, right-click it and choose **Open**)
- **Any computer, from a terminal:** run `node server.js` in this folder

The first time, the launcher creates **config.txt** from `config.example.txt` and opens it (from a terminal, copy `config.example.txt` to `config.txt` yourself). Paste your key after `ANTHROPIC_API_KEY=` (no spaces, no quotes), save, and run it again.
Then open **http://localhost:3000**. Keep the Terminal window open while you use the site, and press **Ctrl+C** in it to stop the server.

If the page says a port is already in use (`EADDRINUSE`), an older copy is still running. Close its window, or on a Mac run `lsof -ti :3000 | xargs kill`.

You'll know the AI is working when the assistant's receipts **don't** show "Quick check by keyword matching."
Opening `index.html` directly (without the server) still works for browsing, but the assistant falls back to that keyword check and sign up / sign in will not work.

## Keep your Claude key safe (and working)

If your key ever appears in a public GitHub repo, GitHub's secret scanning finds it and Anthropic disables it automatically, usually within minutes.

- Your key goes **only** in `config.txt`. The repo has `config.example.txt` instead, a blank template.
- `config.txt` is listed in `.gitignore`, so `git push` and GitHub Desktop skip it.
- **GitHub's "Add files via upload" page ignores `.gitignore`.** Never drag `config.txt` (or the whole folder) onto it.
- The key stays on the server. The server only sends the site's own files (`index.html`, `css/`, `js/`, `pages/`, `assets/`) to browsers, never `config.txt` or the saved accounts in `data/`.
- `MAX_CHECKS_PER_MINUTE` in `config.txt` limits how many checks each visitor can run, to protect your bill.

## Sign up and sign in
- Phone number + 6-digit one-time code. No passwords.
- The server (`server-auth.js`) creates and checks codes: 10-minute expiry, 5 tries, 30 seconds between resends.
- Accounts go in `data/users.json`; sessions are a secure HttpOnly cookie that lasts 30 days. `data/` is never committed.
- The order page needs a signed-in account. The map is open to everyone.
- EBT numbers and ID / disability photos are only checked in the browser. They are never sent to the server or saved.
- **Demo mode** (default): no text is sent; the code is shown on screen and printed in the server window.
- **Real texts**: add `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and `TWILIO_FROM` to `config.txt`, then restart.

## Structure
    index.html            Landing page: the "Hungry?" question, options, how it works
    server.js             Serves the site and talks to Claude (/api/check)
    config.example.txt    Blank settings template (safe to share); your real one is config.txt
    css/styles.css        Design tokens, layout, forms, responsive rules
    css/assistant.css     SNAP assistant chat and receipts
    css/map.css           Map page
    js/main.js            Mobile menu, toast, signed-in header
    js/auth.js            Sign up + sign in with phone OTP (DEMO)
    js/assistant.js       SNAP assistant (with offline keyword fallback)
    js/map.js, config.js  Nearby stores map and its settings
    assets/               logo.svg, favicon.svg, hero.jpg (ADD THESE)
    pages/
      assistant.html      SNAP assistant
      map.html            Live SNAP/EBT retailer finder + Google map
      signup.html         Details, uploads, OTP verification
      login.html          Phone + OTP
      order.html          (placeholder) pickup/delivery, bill, checkout

## Updating the SNAP rules
The rules the AI follows are in `server.js`, in the `RULES` text near the top. Price estimates follow `PRICE_RULES` just below it.
If Connecticut changes its SNAP rules (for example, bans soda or candy), edit that text and restart.

## Putting it online later
Upload the folder to a host that runs Node.js (for example Render, Railway, or a small VPS) and set
`ANTHROPIC_API_KEY` in the host's environment settings instead of using `config.txt`.

## Banner photo
Save a real photo of people (landscape, about 1200x900, under 400 KB) as `assets/hero.jpg`. It is used on the landing page and the sign up / sign in pages. It fills the hero panel behind the sample results card. Until it exists, the panel shows a soft blue, green and gold background, so the page still looks finished. Use photos you have the right to use: your own, ones with permission, or free-license sites such as unsplash.com and pexels.com (search: "community food market", "senior grocery shopping", "food pantry volunteers").


## Breakpoints
1000px (auth pages stack), 820px (mobile menu, one column), 560px (small phones)


## Nearby SNAP/EBT map
The map page is now integrated at `pages/map.html`. It:
- requests browser geolocation (with Hartford as the demo fallback),
- queries the USDA SNAP retailer ArcGIS layer for nearby authorized retailers,
- ranks stores by distance,
- supports Driving / Bus / Walking modes,
- supports Now or a chosen shopping time, and
- enriches nearby results with Google Maps Platform when configured.

### Google Maps API setup
Open `js/config.js` and set `GOOGLE_MAPS_API_KEY`. Use a browser-restricted Google Maps Platform key and enable the Maps JavaScript API, Places API, and Routes API. The page uses the current Maps JavaScript Routes Library (`Route` and `RouteMatrix`) for in-page route drawing and route-aware ranking. If route data is unavailable, the interface falls back to straight-line distance while the map and SNAP retailer results continue working.

Do not commit a production API key to a public repository. Restrict the key to the hackathon site origin in Google Cloud Console.


## In-page directions
The map page renders routes directly inside the existing Google map. Clicking **Directions** no longer opens Google Maps in a new tab. Enable the Google **Routes API** for the same API key in addition to Maps JavaScript API and Places API. The project no longer depends on the legacy Directions API or Distance Matrix API.
