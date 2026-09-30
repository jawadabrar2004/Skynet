// CT Food Access Finder - sign up / sign in with a phone number and a one-time code.
// Accounts are saved in data/users.json, sessions in data/sessions.json (both kept out of git).
// Codes are sent by text with Twilio when TWILIO_* settings are in config.txt.
// Without them the app runs in demo mode: the code is shown on screen and printed in this window.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DATA_DIR = path.join(__dirname, "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const SESSIONS_FILE = path.join(DATA_DIR, "sessions.json");

const COOKIE = "ctfa_session";
const SESSION_DAYS = 30;
const CODE_MINUTES = 10;
const MAX_CODE_TRIES = 5;
const RESEND_SECONDS = 30;

const TWILIO_SID = (process.env.TWILIO_ACCOUNT_SID || "").trim();
const TWILIO_TOKEN = (process.env.TWILIO_AUTH_TOKEN || "").trim();
const TWILIO_FROM = (process.env.TWILIO_FROM || "").trim();
const SMS_ON = !!(TWILIO_SID && TWILIO_TOKEN && TWILIO_FROM);

// ---- Small JSON file store ----
function load(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")) || {}; } catch { return {}; }
}
function save(file, obj) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, file);
}
const users = load(USERS_FILE);       // phone -> profile
const sessions = load(SESSIONS_FILE); // sha256(token) -> { phone, expires }

const sha256 = s => crypto.createHash("sha256").update(String(s)).digest("hex");
function sameHash(a, b) {
  const x = Buffer.from(a, "hex"), y = Buffer.from(b, "hex");
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// ---- One-time codes (kept in memory; they only live for 10 minutes) ----
const codes = new Map(); // "signup:8605550123" -> { hash, expires, tries, sentAt, data }

async function sendCode(purpose, phone, data) {
  const key = purpose + ":" + phone;
  const old = codes.get(key);
  const wait = old ? Math.ceil((old.sentAt + RESEND_SECONDS * 1000 - Date.now()) / 1000) : 0;
  if (wait > 0) return { error: "too_soon", wait };

  const code = String(crypto.randomInt(100000, 1000000));
  codes.set(key, { hash: sha256(code), expires: Date.now() + CODE_MINUTES * 60000, tries: 0, sentAt: Date.now(), data });

  if (SMS_ON) {
    const r = await fetch("https://api.twilio.com/2010-04-01/Accounts/" + TWILIO_SID + "/Messages.json", {
      method: "POST",
      headers: {
        "Authorization": "Basic " + Buffer.from(TWILIO_SID + ":" + TWILIO_TOKEN).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({ To: "+1" + phone, From: TWILIO_FROM, Body: "Your Food Access Finder code is " + code + ". It expires in " + CODE_MINUTES + " minutes." })
    }).catch(() => null);
    if (!r || !r.ok) {
      codes.delete(key);
      console.error("Twilio could not send a text" + (r ? " (status " + r.status + ")" : ""));
      return { error: "sms_failed" };
    }
    return { ok: true };
  }
  console.log("  [demo] " + purpose + " code for (***) ***-" + phone.slice(6) + ": " + code);
  return { ok: true, demoCode: code };
}

function checkCode(purpose, phone, code) {
  const key = purpose + ":" + phone;
  const entry = codes.get(key);
  if (!entry || entry.expires < Date.now()) { codes.delete(key); return { error: "code_expired" }; }
  if (entry.tries >= MAX_CODE_TRIES) { codes.delete(key); return { error: "too_many_tries" }; }
  entry.tries++;
  if (!/^\d{6}$/.test(code) || !sameHash(sha256(code), entry.hash)) {
    return { error: "wrong_code", left: MAX_CODE_TRIES - entry.tries };
  }
  codes.delete(key);
  return { ok: true, data: entry.data };
}

// ---- Sessions ----
function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
function isHttps(req) {
  return !!req.socket.encrypted || String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim() === "https";
}
function setCookie(req, res, value, maxAge) {
  res.setHeader("Set-Cookie", COOKIE + "=" + value + "; Path=/; HttpOnly; SameSite=Lax; Max-Age=" + maxAge + (isHttps(req) ? "; Secure" : ""));
}
function startSession(req, res, phone) {
  const token = crypto.randomBytes(32).toString("base64url");
  sessions[sha256(token)] = { phone, expires: Date.now() + SESSION_DAYS * 86400000 };
  for (const [k, s] of Object.entries(sessions)) if (s.expires < Date.now()) delete sessions[k];
  save(SESSIONS_FILE, sessions);
  setCookie(req, res, token, SESSION_DAYS * 86400);
}
function currentUser(req) {
  const token = parseCookies(req)[COOKIE];
  if (!token) return null;
  const s = sessions[sha256(token)];
  if (!s || s.expires < Date.now() || !users[s.phone]) return null;
  return users[s.phone];
}
function endSession(req, res) {
  const token = parseCookies(req)[COOKIE];
  if (token && sessions[sha256(token)]) { delete sessions[sha256(token)]; save(SESSIONS_FILE, sessions); }
  setCookie(req, res, "", 0);
}

// ---- Input checks (the browser checks too, but the server must not trust it) ----
function normPhone(s) {
  let d = String(s || "").replace(/\D/g, "");
  if (d.length === 11 && d[0] === "1") d = d.slice(1);
  return /^[2-9]\d{9}$/.test(d) ? d : "";
}
const clean = (s, max) => String(s || "").trim().slice(0, max);

function checkSignup(b) {
  const errors = {};
  const p = {
    first: clean(b.first, 60), last: clean(b.last, 60), phone: normPhone(b.phone),
    email: clean(b.email, 120).toLowerCase(), age: parseInt(b.age, 10),
    transport: String(b.transport || ""), disabled: b.disabled === true
  };
  if (!p.first) errors.firstName = "Enter your first name.";
  if (!p.last) errors.lastName = "Enter your last name.";
  if (!p.phone) errors.phone = "Enter a 10-digit phone number.";
  else if (users[p.phone]) errors.phone = "An account already exists for this number. Sign in instead.";
  if (p.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(p.email)) errors.email = "Enter a valid email, or leave it blank.";
  if (!(p.age >= 18 && p.age <= 120)) errors.age = "Enter your age (18 or older).";
  if (!["car", "bus", "walk"].includes(p.transport)) errors.transport = "Choose how you usually get around.";
  if (typeof b.disabled !== "boolean") errors.disabled = "Choose Yes or No.";
  p.deliveryEligible = p.disabled || p.age >= 60;
  return { profile: p, errors };
}

function publicUser(u) {
  return { first: u.first, last: u.last, phoneLast4: u.phone.slice(6), email: u.email, age: u.age,
           transport: u.transport, disabled: u.disabled, deliveryEligible: u.deliveryEligible };
}

// ---- Routes. Returns true if the request was an auth request. ----
async function handleAuth(req, res, url, { send, readBody, allowed }) {
  if (!url.pathname.startsWith("/api/auth/")) return false;
  const route = req.method + " " + url.pathname;

  if (route === "GET /api/auth/me") {
    const u = currentUser(req);
    send(res, u ? 200 : 401, u ? { user: publicUser(u) } : { error: "signed_out" });
    return true;
  }

  if (req.method !== "POST") { send(res, 404, { error: "not_found" }); return true; }
  // Only accept JSON, so other websites can't post plain forms here with the visitor's cookie.
  if (!/^application\/json\b/i.test(req.headers["content-type"] || "")) { send(res, 415, { error: "bad_request" }); return true; }
  if (!allowed(req.socket.remoteAddress || "unknown")) { send(res, 429, { error: "rate_limited" }); return true; }

  let b;
  try { b = JSON.parse(await readBody(req, 4000) || "{}") || {}; } catch { send(res, 400, { error: "bad_request" }); return true; }

  if (route === "POST /api/auth/signup/start") {
    const { profile, errors } = checkSignup(b);
    if (Object.keys(errors).length) { send(res, 400, { error: "invalid", errors }); return true; }
    const r = await sendCode("signup", profile.phone, profile);
    send(res, r.ok ? 200 : r.error === "too_soon" ? 429 : 502, { ...r, sms: SMS_ON });
    return true;
  }

  if (route === "POST /api/auth/signup/verify") {
    const phone = normPhone(b.phone);
    const r = checkCode("signup", phone, String(b.code || ""));
    if (!r.ok) { send(res, 400, r); return true; }
    if (users[phone]) { send(res, 409, { error: "exists" }); return true; }
    users[phone] = { ...r.data, createdAt: new Date().toISOString() };
    save(USERS_FILE, users);
    startSession(req, res, phone);
    send(res, 200, { user: publicUser(users[phone]) });
    return true;
  }

  if (route === "POST /api/auth/login/start") {
    const phone = normPhone(b.phone);
    if (!phone) { send(res, 400, { error: "invalid", errors: { phone: "Enter your 10-digit phone number." } }); return true; }
    if (!users[phone]) { send(res, 404, { error: "invalid", errors: { phone: "We could not find an account for this number. Sign up first." } }); return true; }
    const r = await sendCode("login", phone);
    send(res, r.ok ? 200 : r.error === "too_soon" ? 429 : 502, { ...r, sms: SMS_ON });
    return true;
  }

  if (route === "POST /api/auth/login/verify") {
    const phone = normPhone(b.phone);
    const r = checkCode("login", phone, String(b.code || ""));
    if (!r.ok) { send(res, 400, r); return true; }
    if (!users[phone]) { send(res, 404, { error: "no_account" }); return true; }
    startSession(req, res, phone);
    send(res, 200, { user: publicUser(users[phone]) });
    return true;
  }

  if (route === "POST /api/auth/logout") {
    endSession(req, res);
    send(res, 200, { ok: true });
    return true;
  }

  send(res, 404, { error: "not_found" });
  return true;
}

module.exports = { handleAuth, currentUser, SMS_ON };
