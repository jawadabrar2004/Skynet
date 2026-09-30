// Doorstep - sign up and sign in with a phone number and a password.
// Accounts are saved in data/users.json, sessions in data/sessions.json (both kept out of git).
// Passwords are never stored: only a salted scrypt hash is saved.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DATA_DIR = path.join(__dirname, "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const SESSIONS_FILE = path.join(DATA_DIR, "sessions.json");

const COOKIE = "ctfa_session";
const SESSION_DAYS = 30;
const MIN_PASSWORD = 6;
const MAX_FAILS = 10;           // wrong passwords per phone number...
const FAIL_MINUTES = 15;        // ...within this many minutes, then that number is paused

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

// ---- Passwords ----
function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString("hex");
  return "scrypt$" + salt + "$" + crypto.scryptSync(String(pw), salt, 64).toString("hex");
}
function checkPassword(pw, stored) {
  const [kind, salt, hash] = String(stored || "").split("$");
  if (kind !== "scrypt" || !salt || !hash) return false;
  return sameHash(crypto.scryptSync(String(pw), salt, 64).toString("hex"), hash);
}
const fails = new Map(); // phone -> [times of wrong passwords]
function recentFails(phone) {
  const list = (fails.get(phone) || []).filter(t => Date.now() - t < FAIL_MINUTES * 60000);
  fails.set(phone, list);
  return list;
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
  else if (users[p.phone] && users[p.phone].password) errors.phone = "An account already exists for this number. Sign in instead.";
  if (p.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(p.email)) errors.email = "Enter a valid email, or leave it blank.";
  if (!(p.age >= 18 && p.age <= 120)) errors.age = "Enter your age (18 or older).";
  if (!["car", "bus", "walk"].includes(p.transport)) errors.transport = "Choose how you usually get around.";
  if (typeof b.disabled !== "boolean") errors.disabled = "Choose Yes or No.";
  const pw = typeof b.password === "string" ? b.password : "";
  if (pw.length < MIN_PASSWORD) errors.password = "Use at least " + MIN_PASSWORD + " characters.";
  else if (pw.length > 128) errors.password = "Use 128 characters or fewer.";
  p.deliveryEligible = p.disabled || p.age >= 60;
  return { profile: p, password: pw, errors };
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

  if (route === "POST /api/auth/signup") {
    const { profile, password, errors } = checkSignup(b);
    if (Object.keys(errors).length) { send(res, 400, { error: "invalid", errors }); return true; }
    users[profile.phone] = { ...profile, password: hashPassword(password), createdAt: new Date().toISOString() };
    save(USERS_FILE, users);
    startSession(req, res, profile.phone);
    send(res, 200, { user: publicUser(users[profile.phone]) });
    return true;
  }

  if (route === "POST /api/auth/login") {
    const phone = normPhone(b.phone);
    const password = typeof b.password === "string" ? b.password : "";
    if (!phone) { send(res, 400, { error: "invalid", errors: { phone: "Enter your 10-digit phone number." } }); return true; }
    const u = users[phone];
    if (!u || !u.password) { send(res, 404, { error: "no_account" }); return true; }
    if (!password) { send(res, 400, { error: "invalid", errors: { password: "Enter your password." } }); return true; }
    if (recentFails(phone).length >= MAX_FAILS) { send(res, 429, { error: "too_many_tries" }); return true; }
    if (!checkPassword(password, u.password)) {
      recentFails(phone).push(Date.now());
      send(res, 401, { error: "invalid", errors: { password: "That password is not right. Try again." } });
      return true;
    }
    fails.delete(phone);
    startSession(req, res, phone);
    send(res, 200, { user: publicUser(u) });
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

module.exports = { handleAuth, currentUser };
