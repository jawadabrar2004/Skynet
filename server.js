// CT SNAP Checker - local server
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

const API_KEY = (process.env.ANTHROPIC_API_KEY || "").trim();
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

// ---- Simple rate limit per visitor, to protect your API bill ----
const hits = new Map();
function allowed(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter(t => now - t < 60000);
  if (list.length >= MAX_PER_MINUTE) { hits.set(ip, list); return false; }
  list.push(now); hits.set(ip, list);
  return true;
}

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

async function askClaude(userText) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": API_KEY,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 3000,
      temperature: 0,
      system: RULES,
      messages: [
        { role: "user", content: "Shopper's message:\n" + userText + "\n\nReply with only the JSON object." }
      ]
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
  for (const k of ["dishes", "eligible", "not_eligible", "depends"]) if (!Array.isArray(data[k])) data[k] = [];
  if (typeof data.note !== "string") data.note = "";
  return data;
}

const INDEX = path.join(__dirname, "public", "index.html");

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");

  if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
    fs.readFile(INDEX, (err, buf) => {
      if (err) { res.writeHead(500); return res.end("index.html not found"); }
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(buf);
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/health") {
    return send(res, 200, { ok: true, ai_ready: !!API_KEY, model: MODEL });
  }

  if (req.method === "POST" && url.pathname === "/api/check") {
    if (!API_KEY) return send(res, 503, { error: "no_key" });
    const ip = req.socket.remoteAddress || "unknown";
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

  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not found");
});

server.listen(PORT, () => {
  console.log("\n  CT SNAP Checker is running.");
  console.log("  Open this in your browser:  http://localhost:" + PORT + "\n");
  if (!API_KEY) {
    console.log("  WARNING: No API key found. The AI is OFF and the page will use the basic keyword check.");
    console.log("  Open config.txt, paste your key after ANTHROPIC_API_KEY=, save, then restart.\n");
  } else {
    console.log("  AI is ON (model: " + MODEL + ").");
    console.log("  Keep this window open while you use the site. Press Ctrl+C to stop.\n");
  }
});
// End of server.js
