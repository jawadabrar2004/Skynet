# CT Food Access Finder

Plain HTML, CSS, and JavaScript. No build step.

## Run it
Open `index.html` in a browser, or run `python3 -m http.server 8000` in this folder and visit http://localhost:8000

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

## Demo OTP
No SMS is sent. The 6-digit code is displayed on screen. The browser only keeps first name, phone, age, and delivery eligibility (localStorage). EBT numbers and photos are never stored.
For a real launch: use an SMS provider (Twilio Verify or Firebase Auth), a secure backend for uploads, and real EBT/ID/disability verification.

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
