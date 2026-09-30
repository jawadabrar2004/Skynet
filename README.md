# Doorstep

Plain HTML, CSS, and JavaScript. No build step.

## Run it
Double-click `start-mac.command` (Mac) or `start-windows.bat` (Windows), or run `node server.js`, then open http://localhost:3000.
Sign up and sign in need this server; opening `index.html` directly as a file will not work for accounts.

## Sign up and sign in
- Phone number + 6-digit one-time code. No passwords.
- The server (`server-auth.js`) creates and checks codes: 10-minute expiry, 5 tries, 30 seconds between resends.
- Accounts go in `data/users.json`; sessions are a secure HttpOnly cookie that lasts 30 days. `data/` is never committed.
- The map and order pages need a signed-in account.
- EBT numbers and ID / disability photos are only checked in the browser. They are never sent to the server or saved.
- **Demo mode** (default): no text is sent; the code is shown on screen and printed in the server window.
- **Real texts**: add `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and `TWILIO_FROM` to `config.txt`, then restart.
- The SNAP checker is at http://localhost:3000/snap

## Structure
    ct-food-access/
    ├── index.html            Landing page (hero banner, options, how it works)
    ├── css/styles.css        Design tokens, layout, forms, responsive rules
    ├── js/
    │   ├── main.js           Mobile menu, toast, signed-in header
    │   └── auth.js           Sign up + sign in with phone OTP (DEMO)
    ├── assets/
    │   ├── hero.jpg          ADD THIS: a real photo of people (landscape, ~1200x900)
    │   ├── logo.svg
    │   └── favicon.svg
    └── pages/
        ├── signup.html       Details, uploads, OTP verification
        ├── login.html        Phone + OTP
        ├── assistant.html    (placeholder) chatbot
        ├── map.html          Live SNAP/EBT retailer finder + Google map
        └── order.html        (placeholder) pickup/delivery, bill, checkout

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
