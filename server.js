// Doorstep - local server (website, sign-in, and the SNAP assistant)
// Serves the website and safely talks to the Claude API.
// Needs Node.js 18 or newer. No npm install required.

const http = require("http");
const fs = require("fs");
const path = require("path");

// ---- Load settings from config.txt ----
function loadEnv() {
  // Reads settings from config.txt (easy to find) or .env (hidden on most computers)
  for (const name of ["config.txt", ".env"]) {
    const file = path.join(__dirname, name);
    if (fs.existsSync(file)) loadFile(file);
  }
}
function loadFile(file) {
  for (const line of fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/i);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (v && !process.env[m[1]]) process.env[m[1]] = v;
  }
}
loadEnv();

const { handleAuth, currentUser, SMS_ON } = require("./server-auth");

const API_KEY = (process.env.ANTHROPIC_API_KEY || "").trim();
const MAPS_KEY = (process.env.GOOGLE_MAPS_API_KEY || "").trim();
const MODEL = process.env.MODEL || "claude-haiku-4-5-20251001";
const PORT = parseInt(process.env.PORT || "3000", 10);
const MAX_PER_MINUTE = parseInt(process.env.MAX_CHECKS_PER_MINUTE || "20", 10);

const [major] = process.versions.node.split(".").map(Number);
if (major < 18) {
  console.error("\nThis app needs Node.js 18 or newer. You have " + process.version + ".");
  console.error("Download the LTS version from https://nodejs.org and try again.\n");
  process.exit(1);
}

// ---- SNAP rules the AI follows (edit here when rules change) ----
const RULES = "You are a SNAP (food stamps / EBT) eligibility checker for Connecticut, USA, as of September 2026.\nConnecticut follows federal USDA SNAP rules and has NO state food-restriction waiver, so soda, candy, chips, and energy drinks with a Nutrition Facts label ARE eligible.\n\nNOT eligible with SNAP:\n- Alcoholic beverages (beer, wine, liquor, hard seltzer)\n- Tobacco, cigarettes, vapes, nicotine products\n- Vitamins, medicines, supplements, anything with a \"Supplement Facts\" label (including supplement-labeled energy drinks)\n- Live animals (EXCEPT shellfish, fish removed from water, animals slaughtered before pickup)\n- Foods that are hot at the point of sale (hot deli food, rotisserie chicken kept warm, hot pizza)\n- Food made to be eaten in the store\n- Pet food\n- Non-food items: cleaning supplies, paper products (paper plates, napkins, toilet paper), household supplies, hygiene items (soap, toothpaste, diapers, feminine products), cosmetics, decorations, balloons, candles, gift cards\n\nELIGIBLE: fruits, vegetables, meat, poultry, fish, dairy, bread, cereals, snacks, non-alcoholic drinks, cold prepared foods (cold sandwiches, salads), baby formula and baby food, seeds and plants that grow food, birthday cakes (if non-edible decorations are under 50% of the price), ice, bottled water.\n\nUse \"depends\" only when the answer truly depends on something the shopper must check (e.g. energy drinks: Nutrition Facts vs Supplement Facts label; rotisserie chicken: hot vs cold; protein powder).\n\nDISHES AND MEALS: If the shopper names a dish or meal they want (e.g. \"I want to make a burger\", \"tacos tonight\", \"burger\", \"spaghetti dinner\"), do NOT put the dish itself in eligible. Put it in \"dishes\" instead. A ready-made hot dish can't be bought with SNAP, but its raw ingredients can. For each dish give:\n- \"dish\": the dish name.\n- \"why\": one short sentence, e.g. \"A hot, ready-made burger isn't covered by SNAP, but you can make one with these groceries.\"\n- \"ingredients\": ONLY the core ingredients truly needed to make the classic version. Keep it tight and compact: no optional extras, no side dishes, no cooking equipment, no water, no oil unless essential to the dish. Usually 5 to 10 items. Combine interchangeable choices into ONE item with \"options\" (e.g. {\"item\":\"Cheese\",\"options\":[\"American\",\"Cheddar\",\"Swiss\"]}, {\"item\":\"Condiment\",\"options\":[\"Ketchup\",\"Mustard\",\"Mayonnaise\"]}). Each ingredient has \"item\", \"options\" (array, may be empty), \"option\" (the most common choice, or \"\"), \"qty\", \"sizes\", \"size\", and \"eligible\" (true/false) with a \"reason\" if false.\nExample burger ingredients: Burger buns, Ground beef, Cheese (American/Cheddar/Swiss), Lettuce, Tomato, Onion, Pickles, Condiment (Ketchup/Mustard/Mayonnaise), Salt, Black pepper.\nA message can mix dishes and regular items; handle both.\n\nTask: Read the shopper's message. Split it into individual items (fix spelling, drop quantities into the name, ignore filler words). If the message has no shopping items or dishes, return empty arrays and a short \"note\" asking what they want to buy.\nFor every eligible and depends item, also give:\n- \"qty\": how many the shopper asked for (a whole number, default 1; \"2 bags of chips\" -> 2, item \"Chips\").\n- \"sizes\": 2 to 6 common sizes or package options this product is really sold in at US grocery stores, smallest to largest, using the units shoppers see on shelves (milk: \"1 pint\",\"1 quart\",\"Half gallon\",\"1 gallon\"; ground beef: \"0.5 lb\",\"1 lb\",\"2 lb\",\"3 lb\",\"5 lb\"; eggs: \"6 count\",\"12 count\",\"18 count\",\"24 count\"; bread: \"1 loaf\"; bananas: \"1 lb\",\"2 lb\",\"Bunch (about 3 lb)\"). Use an empty array only if a size makes no sense.\n- \"size\": the size the shopper mentioned, or the most common size. It must be one of \"sizes\".\nReply with ONLY this JSON:\n{\"dishes\":[{\"dish\":\"Burger\",\"why\":\"A hot, ready-made burger isn't covered by SNAP, but you can make one with these groceries.\",\"ingredients\":[{\"item\":\"Burger buns\",\"options\":[],\"option\":\"\",\"qty\":1,\"sizes\":[\"4-pack\",\"8-pack\"],\"size\":\"8-pack\",\"eligible\":true},{\"item\":\"Cheese\",\"options\":[\"American\",\"Cheddar\",\"Swiss\"],\"option\":\"American\",\"qty\":1,\"sizes\":[\"8 oz\",\"16 oz\"],\"size\":\"8 oz\",\"eligible\":true}]}],\"eligible\":[{\"item\":\"Milk\",\"qty\":1,\"sizes\":[\"1 pint\",\"1 quart\",\"Half gallon\",\"1 gallon\"],\"size\":\"1 gallon\"}],\"not_eligible\":[{\"item\":\"Diapers\",\"reason\":\"Hygiene item, not food\"}],\"depends\":[{\"item\":\"Energy drink\",\"reason\":\"Allowed only if it has a Nutrition Facts label\",\"qty\":1,\"sizes\":[\"8.4 oz can\",\"12 oz can\",\"16 oz can\",\"4-pack\"],\"size\":\"16 oz can\"}],\"note\":\"\"}\nKeep reasons under 12 words.";

// ---- Price estimates for a confirmed cart ----
const PRICE_RULES = "You estimate grocery prices for shoppers in Connecticut, USA, as of September 2026.\nFor each item in the list, give the typical regular shelf price in US dollars for ONE unit of that item at the given size and type, at a typical mid-priced Connecticut supermarket, for a store brand or common brand. Use regular prices, not sale prices. If no size is given, assume the most common package.\nReply with ONLY this JSON, one number per item in the same order as the list, rounded to cents: {\"prices\":[3.49,2.99]}\nUse null only if the item is not something a grocery store sells.";

// ---- Simple rate limit per visitor, to protect your API bill ----
function limiter(maxPerMinute) {
  const hits = new Map();
  return function allowed(ip) {
    const now = Date.now();
    const list = (hits.get(ip) || []).filter(t => now - t < 60000);
    if (list.length >= maxPerMinute) { hits.set(ip, list); return false; }
    list.push(now); hits.set(ip, list);
    return true;
  };
}
const allowed = limiter(MAX_PER_MINUTE);

// The visitor's address, for the limits above. Through a tunnel (cloudflared) every visitor
// arrives from this laptop itself, so use the address the tunnel passes along instead.
function clientIp(req) {
  const direct = req.socket.remoteAddress || "unknown";
  if (!/^(::1|127\.|::ffff:127\.)/.test(direct)) return direct;
  const fwd = req.headers["cf-connecting-ip"] || String(req.headers["x-forwarded-for"] || "").split(",")[0];
  return String(fwd || direct).trim().slice(0, 64);
}
const authAllowed = limiter(15);

function send(res, status, obj) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(obj));
}

function readBody(req, limit = 16000) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", c => { data += c; if (data.length > limit) { reject(new Error("too_big")); req.destroy(); } });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function parseJSON(text) {
  const clean = String(text || "").replace(/```json|```/g, "").trim();
  try { return JSON.parse(clean); } catch {}
  const a = clean.indexOf("{"), b = clean.lastIndexOf("}");
  if (a >= 0 && b > a) { try { return JSON.parse(clean.slice(a, b + 1)); } catch {} }
  return null;
}

async function callClaude(system, userContent, maxTokens) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": API_KEY,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      temperature: 0,
      system,
      messages: [{ role: "user", content: userContent }]
    })
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = (body && body.error && body.error.message) || "";
    console.error("Claude API error " + r.status + ": " + msg);
    if (r.status === 401 || r.status === 403) throw Object.assign(new Error(msg), { code: "bad_key" });
    if (r.status === 429) throw Object.assign(new Error(msg), { code: "rate_limited" });
    if (/credit|billing|balance/i.test(msg)) throw Object.assign(new Error(msg), { code: "no_credit" });
    throw Object.assign(new Error(msg), { code: "ai_error" });
  }
  const text = (body.content || []).filter(b => b.type === "text").map(b => b.text).join("");
  const data = parseJSON(text);
  if (!data) throw Object.assign(new Error("Bad JSON from model"), { code: "ai_error" });
  return data;
}

async function askClaude(userText) {
  const data = await callClaude(RULES, "Shopper's message:\n" + userText + "\n\nReply with only the JSON object.", 3000);
  for (const k of ["dishes", "eligible", "not_eligible", "depends"]) if (!Array.isArray(data[k])) data[k] = [];
  if (typeof data.note !== "string") data.note = "";
  return data;
}

async function askPrices(items) {
  const list = items.map((x, i) => (i + 1) + ". " + [x.item, x.option, x.size].filter(Boolean).join(", ")).join("\n");
  const data = await callClaude(PRICE_RULES, "Items:\n" + list + "\n\nReply with only the JSON object.", 1500);
  const raw = Array.isArray(data.prices) ? data.prices : [];
  // One price per item; anything that isn't a sensible number becomes null
  const prices = items.map((_, i) => {
    const v = Number(raw[i]);
    return raw[i] != null && isFinite(v) && v > 0 && v < 500 ? Math.round(v * 100) / 100 : null;
  });
  return { prices };
}

// ---- The website ----
// Only the site's own files are served: index.html plus the css, js, pages and assets folders.
// Everything else (config.txt with your key, server.js, .env, data/ with accounts) is never sent to the browser.
const SITE_DIRS = ["css", "js", "pages", "assets"];
// Pages that need an account. Signed-out visitors are sent to the sign-in page.
const SIGNED_IN_PAGES = ["/pages/order.html"];
const TYPES = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".webp": "image/webp", ".gif": "image/gif", ".ico": "image/x-icon"
};

function siteFile(pathname) {
  let p;
  try { p = decodeURIComponent(pathname); } catch { return null; }
  if (/[\\\0]/.test(p)) return null; // no backslashes (Windows paths) or null bytes
  if (p.endsWith("/")) p += "index.html";
  const rel = path.posix.normalize(p).replace(/^\/+/, "");
  if (rel.split("/").some(part => part === ".." || part.startsWith("."))) return null;
  const inSite = rel === "index.html" || (rel.includes("/") && SITE_DIRS.includes(rel.split("/")[0]));
  if (!inSite || !TYPES[path.extname(rel).toLowerCase()]) return null;
  return path.join(__dirname, rel);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");

  if (req.method === "GET" || req.method === "HEAD") {
    // Pages that need an account send signed-out visitors to the sign-in page.
    if (SIGNED_IN_PAGES.includes(url.pathname) && !currentUser(req)) {
      res.writeHead(302, { Location: "/pages/login.html", "Cache-Control": "no-store" });
      return res.end();
    }
    // The Google Maps key lives in config.txt (kept out of git) and is added to js/config.js when it is sent.
    if (url.pathname === "/js/config.js" && MAPS_KEY) {
      return fs.readFile(path.join(__dirname, "js", "config.js"), "utf8", (err, text) => {
        if (err) { res.writeHead(404, { "Content-Type": "text/plain" }); return res.end("Not found"); }
        res.writeHead(200, { "Content-Type": TYPES[".js"], "Cache-Control": "no-store" });
        res.end(req.method === "HEAD" ? undefined : text.replace(/GOOGLE_MAPS_API_KEY:\s*""/, "GOOGLE_MAPS_API_KEY: " + JSON.stringify(MAPS_KEY)));
      });
    }
    const file = siteFile(url.pathname);
    if (file) {
      return fs.readFile(file, (err, buf) => {
        if (err) { res.writeHead(404, { "Content-Type": "text/plain" }); return res.end("Not found"); }
        res.writeHead(200, { "Content-Type": TYPES[path.extname(file).toLowerCase()], "Cache-Control": "no-cache", "X-Content-Type-Options": "nosniff" });
        res.end(req.method === "HEAD" ? undefined : buf);
      });
    }
  }

  try {
    if (await handleAuth(req, res, url, { send, readBody, allowed: () => authAllowed(clientIp(req)) })) return;
  } catch (e) {
    console.error("Sign-in error:", e.message);
    return send(res, 500, { error: "server_error" });
  }

  if (req.method === "GET" && url.pathname === "/api/health") {
    return send(res, 200, { ok: true, ai_ready: !!API_KEY, model: MODEL });
  }

  if (req.method === "POST" && url.pathname === "/api/check") {
    if (!API_KEY) return send(res, 503, { error: "no_key" });
    const ip = clientIp(req);
    if (!allowed(ip)) return send(res, 429, { error: "rate_limited" });
    let text = "";
    try {
      const raw = await readBody(req);
      text = String((JSON.parse(raw) || {}).text || "").trim().slice(0, 4000);
    } catch { return send(res, 400, { error: "bad_request" }); }
    if (!text) return send(res, 400, { error: "empty" });
    try {
      return send(res, 200, await askClaude(text));
    } catch (e) {
      const status = e.code === "rate_limited" ? 429 : 502;
      return send(res, status, { error: e.code || "ai_error" });
    }
  }

  if (req.method === "POST" && url.pathname === "/api/prices") {
    if (!API_KEY) return send(res, 503, { error: "no_key" });
    const ip = clientIp(req);
    if (!allowed(ip)) return send(res, 429, { error: "rate_limited" });
    let items = [];
    try {
      const raw = JSON.parse(await readBody(req)) || {};
      items = (Array.isArray(raw.items) ? raw.items : []).slice(0, 60).map(x => ({
        item: String((x && x.item) || "").trim().slice(0, 100),
        option: String((x && x.option) || "").trim().slice(0, 60),
        size: String((x && x.size) || "").trim().slice(0, 60)
      })).filter(x => x.item);
    } catch { return send(res, 400, { error: "bad_request" }); }
    if (!items.length) return send(res, 400, { error: "empty" });
    try {
      return send(res, 200, await askPrices(items));
    } catch (e) {
      const status = e.code === "rate_limited" ? 429 : 502;
      return send(res, status, { error: e.code || "ai_error" });
    }
  }

  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not found");
});

server.listen(PORT, () => {
  console.log("\n  Doorstep is running.");
  console.log("  Open this in your browser:  http://localhost:" + PORT);
  // Addresses other people on the same Wi-Fi can open (phones, other laptops).
  const lan = Object.values(require("os").networkInterfaces()).flat()
    .filter(a => a && a.family === "IPv4" && !a.internal).map(a => "http://" + a.address + ":" + PORT);
  if (lan.length) console.log("  On the same Wi-Fi, others can open:  " + lan.join("  or  "));
  console.log("");
  if (!API_KEY) {
    console.log("  WARNING: No API key found. The AI is OFF and the page will use the basic keyword check.");
    console.log("  Open config.txt, paste your key after ANTHROPIC_API_KEY=, save, then restart.\n");
  } else {
    console.log("  AI is ON (model: " + MODEL + ").");
    console.log("  Keep this window open while you use the site. Press Ctrl+C to stop.\n");
  }
  console.log(MAPS_KEY ? "  Google Maps is ON.\n" : "  Google Maps is OFF. Add GOOGLE_MAPS_API_KEY to config.txt for the live map.\n");
  console.log(SMS_ON ? "  Sign-in codes are sent by text message (Twilio).\n"
                     : "  Sign-in codes are in DEMO mode: shown on screen and printed here. Add TWILIO_* to config.txt to send real texts.\n");
});
// End of server.js
