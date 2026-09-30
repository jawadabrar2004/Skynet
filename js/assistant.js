/* CT Food Access Finder - SNAP assistant: "Can I buy it with SNAP?"
   Sends the shopper's message to server.js (/api/check), which asks Claude.
   Falls back to a simple keyword check when the server or AI is unavailable. */
(() => {
  const thread = document.getElementById("thread");
  const form = document.getElementById("form");
  const box = document.getElementById("box");
  const send = document.getElementById("send");

  // The shopper's list so far: live item objects from the receipts, so quantity and size changes count.
  // It keeps growing until the shopper confirms it; then it becomes the cart and a new list starts.
  let list = [];
  const CONFIRM = /^(confirm|confirmed|confirm (it|this|list|my list|the list)|yes,? confirm|done|i'?m done|that'?s (all|it)|checkout|check out|no more|nothing else)[.!]*$/i;
  const ADD_MORE = /^(add|add more|add more items|more|more items|yes,? add more|i want to add more)[.!]*$/i;


  // Offline fallback: simple keyword classifier
  const NO = [
    [/\b(beer|wine|liquor|vodka|whiskey|whisky|rum|tequila|gin|seltzer.*hard|hard seltzer|alcohol|champagne|cider.*hard)\b/i, "Alcohol"],
    [/\b(cigarette|cigar|tobacco|vape|e-?cig|nicotine|juul|chew)\w*/i, "Tobacco or nicotine"],
    [/\b(vitamin|supplement|medicine|tylenol|advil|ibuprofen|aspirin|cough|cold medicine|allergy)\w*/i, "Vitamins, medicine or supplements"],
    [/\b(dog food|cat food|pet food|kibble|dog treat|cat treat|bird seed|fish food|cat litter|litter)\b/i, "Pet food and supplies"],
    [/\b(diaper|wipes|soap|shampoo|conditioner|toothpaste|toothbrush|deodorant|razor|tampon|pad|lotion|makeup|cosmetic|lipstick)\w*/i, "Hygiene or personal care item"],
    [/\b(paper towel|toilet paper|napkin|paper plate|plates|cups|foil|plastic wrap|trash bag|garbage bag|ziploc)\w*/i, "Paper or household product"],
    [/\b(detergent|bleach|dish soap|cleaner|sponge|lysol|windex)\w*/i, "Cleaning supply"],
    [/\b(balloon|candle|decoration|card|gift card|lottery|battery|batteries|light bulb)\w*/i, "Not a food item"],
    [/\bhot\b/i, "Hot food at checkout"],
  ];
  const MAYBE = [
    [/\b(energy drink|red bull|monster|bang)\b/i, "OK only with a Nutrition Facts label"],
    [/\b(rotisserie|deli chicken)\b/i, "OK only if bought cold"],
    [/\b(protein powder|protein shake)\b/i, "OK only with a Nutrition Facts label"],
    [/\blive lobster|\blive crab|\bshellfish\b/i, "Live shellfish is allowed"],
  ];
  const SIZES = [
    [/milk/i, ["1 pint","1 quart","Half gallon","1 gallon"], "1 gallon"],
    [/ground (beef|turkey|pork)|beef|steak|pork|chicken breast|chicken thigh|turkey/i, ["0.5 lb","1 lb","2 lb","3 lb","5 lb"], "1 lb"],
    [/egg/i, ["6 count","12 count","18 count","24 count"], "12 count"],
    [/juice/i, ["Juice boxes (8-pack)","32 oz","52 oz","64 oz","1 gallon"], "64 oz"],
    [/soda|cola|pepsi|sprite/i, ["12 oz can","20 oz bottle","2 liter","6-pack","12-pack"], "2 liter"],
    [/water/i, ["16.9 oz bottle","1 gallon","24-pack","2.5 gallon"], "24-pack"],
    [/chip/i, ["1 oz bag","8 oz bag","Family size (13 oz)"], "8 oz bag"],
    [/cheese/i, ["8 oz","16 oz","2 lb"], "8 oz"],
    [/yogurt/i, ["Single cup","4-pack","32 oz tub"], "32 oz tub"],
    [/butter/i, ["1 stick","1 lb (4 sticks)","2 lb"], "1 lb (4 sticks)"],
    [/rice/i, ["1 lb","2 lb","5 lb","10 lb","20 lb"], "2 lb"],
    [/flour|sugar/i, ["2 lb","4 lb","5 lb","10 lb"], "5 lb"],
    [/banana|apple|orange|potato|onion|grape|tomato/i, ["1 lb","2 lb","3 lb bag","5 lb bag"], "2 lb"],
    [/bread|loaf/i, ["1 loaf","2 loaves"], "1 loaf"],
    [/cereal/i, ["Regular box","Family size box"], "Regular box"],
    [/ice cream/i, ["1 pint","1.5 quart","1 gallon"], "1.5 quart"],
    [/formula/i, ["12.4 oz","20 oz","32 oz ready-to-feed"], "12.4 oz"],
    [/coffee/i, ["12 oz bag","24 oz","30 oz can"], "12 oz bag"],
  ];
  function withSize(obj, raw) {
    let qty = 1;
    const m = raw.match(/^\s*(\d+)\s*(x\s*)?/i);
    if (m) { qty = Math.max(1, parseInt(m[1], 10)); obj.item = raw.replace(m[0], "").trim() || obj.item; obj.item = obj.item.charAt(0).toUpperCase() + obj.item.slice(1); }
    const f = SIZES.find(([re]) => re.test(raw));
    obj.qty = qty;
    obj.sizes = f ? f[1] : [];
    obj.size = f ? f[2] : "";
    return obj;
  }
  const I = (item, qty, sizes, size, options, option) => ({ item, qty, sizes, size, options: options || [], option: option || "", eligible: true });
  const DISHES = [
    [/\b(ham|cheese)?burgers?\b(?!\s*(bun|patt))/i, "Burger", [
      I("Burger buns", 1, ["4-pack","8-pack"], "8-pack"),
      I("Ground beef", 1, ["1 lb","2 lb","3 lb","5 lb"], "2 lb"),
      I("Cheese", 1, ["8 oz","12 oz","16 oz"], "8 oz", ["American","Cheddar","Swiss"], "American"),
      I("Lettuce", 1, ["1 head","Bagged (9 oz)"], "1 head"),
      I("Tomato", 1, ["1 lb","2 lb"], "1 lb"),
      I("Onion", 1, ["1 onion","3 lb bag"], "1 onion"),
      I("Pickles", 1, ["16 oz jar","24 oz jar"], "16 oz jar"),
      I("Condiment", 1, ["Regular bottle","Large bottle"], "Regular bottle", ["Ketchup","Mustard","Mayonnaise"], "Ketchup"),
      I("Salt", 1, ["26 oz"], "26 oz"),
      I("Black pepper", 1, ["3 oz","6 oz"], "3 oz"),
    ]],
    [/\btacos?\b/i, "Tacos", [
      I("Taco shells or tortillas", 1, ["10-count","12-count","18-count"], "12-count", ["Hard shells","Flour tortillas","Corn tortillas"], "Hard shells"),
      I("Ground beef", 1, ["1 lb","2 lb","3 lb"], "1 lb"),
      I("Taco seasoning", 1, ["1 oz packet","Large jar"], "1 oz packet"),
      I("Shredded cheese", 1, ["8 oz","16 oz"], "8 oz", ["Mexican blend","Cheddar"], "Mexican blend"),
      I("Lettuce", 1, ["1 head","Bagged (9 oz)"], "1 head"),
      I("Tomato", 1, ["1 lb","2 lb"], "1 lb"),
      I("Salsa", 1, ["16 oz jar","24 oz jar"], "16 oz jar"),
    ]],
    [/\b(spaghetti|pasta)\b(?!\s*sauce)/i, "Spaghetti", [
      I("Spaghetti", 1, ["1 lb box","2 lb box"], "1 lb box"),
      I("Pasta sauce", 1, ["24 oz jar","45 oz jar"], "24 oz jar"),
      I("Ground beef", 1, ["1 lb","2 lb"], "1 lb"),
      I("Parmesan cheese", 1, ["8 oz","16 oz"], "8 oz"),
    ]],
    [/\bgrilled cheese\b/i, "Grilled cheese", [
      I("Bread", 1, ["1 loaf"], "1 loaf"),
      I("Cheese slices", 1, ["12 slices","24 slices"], "12 slices", ["American","Cheddar"], "American"),
      I("Butter", 1, ["1 stick","1 lb (4 sticks)"], "1 lb (4 sticks)"),
    ]],
    [/\bpancakes?\b/i, "Pancakes", [
      I("Pancake mix", 1, ["32 oz box","5 lb box"], "32 oz box"),
      I("Milk", 1, ["1 quart","Half gallon","1 gallon"], "Half gallon"),
      I("Eggs", 1, ["6 count","12 count"], "12 count"),
      I("Syrup", 1, ["12 oz","24 oz"], "24 oz"),
      I("Butter", 1, ["1 stick","1 lb (4 sticks)"], "1 lb (4 sticks)"),
    ]],
  ];
  function dishWhy(name) { return "A hot, ready-made " + name.toLowerCase() + " isn’t covered by SNAP, but you can make it with these groceries."; }

  function localClassify(text) {
    const items = text.split(/,|\n|;|\band\b/i).map(s => s.trim()).filter(Boolean);
    const out = { dishes: [], eligible: [], not_eligible: [], depends: [], note: "" };
    for (const raw of items) {
      const dm = DISHES.find(([re]) => re.test(raw));
      if (dm) { out.dishes.push({ dish: dm[1], why: dishWhy(dm[1]), ingredients: dm[2].map(x => Object.assign({}, x)) }); continue; }
      const item = raw.charAt(0).toUpperCase() + raw.slice(1);
      const m = MAYBE.find(([re]) => re.test(raw));
      if (m) { (m[1].startsWith("Live") ? out.eligible : out.depends).push(withSize({ item, reason: m[1] }, raw)); continue; }
      const n = NO.find(([re]) => re.test(raw));
      if (n) { out.not_eligible.push({ item, reason: n[1] }); continue; }
      out.eligible.push(withSize({ item }, raw));
    }
    if (!items.length) out.note = "Tell me what you want to buy.";
    return out;
  }

  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  function clampQty(v) { v = parseInt(v, 10); return isFinite(v) ? Math.min(99, Math.max(1, v)) : 1; }

  function controls(it, onChange) {
    const wrap = el("div", "ctrls");
    const step = el("div", "stepper");
    const minus = el("button", null, "−"); minus.type = "button";
    const out = el("output"); out.textContent = it.qty;
    const plus = el("button", null, "+"); plus.type = "button";
    const name = String(it.item || "item");
    minus.setAttribute("aria-label", "One less " + name);
    plus.setAttribute("aria-label", "One more " + name);
    out.setAttribute("aria-label", "Quantity of " + name);
    const sync = () => { out.textContent = it.qty; minus.disabled = it.qty <= 1; plus.disabled = it.qty >= 99; onChange(); };
    minus.onclick = () => { it.qty = clampQty(it.qty - 1); sync(); };
    plus.onclick = () => { it.qty = clampQty(it.qty + 1); sync(); };
    minus.disabled = it.qty <= 1;
    step.append(minus, out, plus);
    wrap.append(step);

    if (Array.isArray(it.options) && it.options.length) {
      const osel = el("select", "size");
      osel.setAttribute("aria-label", "Type of " + name);
      for (const op of it.options) { const o = el("option", null, String(op)); o.value = String(op); osel.append(o); }
      if (!it.options.includes(it.option)) it.option = it.options[0];
      osel.value = it.option;
      osel.onchange = () => { it.option = osel.value; onChange(); };
      wrap.append(osel);
    }
    if (Array.isArray(it.sizes) && it.sizes.length) {
      const sel = el("select", "size");
      sel.setAttribute("aria-label", "Size of " + name);
      for (const sz of it.sizes) { const o = el("option", null, String(sz)); o.value = String(sz); sel.append(o); }
      if (!it.sizes.includes(it.size)) it.size = it.sizes[0];
      sel.value = it.size;
      sel.onchange = () => { it.size = sel.value; onChange(); };
      wrap.append(sel);
    }
    return wrap;
  }

  function section(kind, title, mark, list, withControls, onChange) {
    if (!list || !list.length) return null;
    const s = el("div", "sec " + kind);
    const h = el("h2"); h.append(el("span", null, title), el("span", null, String(list.length)));
    s.append(h);
    const ul = el("ul");
    for (const it of list) {
      const li = el("li");
      const row = el("div", "row");
      row.append(el("span", "mark", mark));
      const nm = el("div", "name");
      nm.append(el("b", null, String(it.item || "").trim()));
      if (it.reason) nm.append(el("small", null, it.reason));
      if (withControls) nm.append(controls(it, onChange));
      row.append(nm);
      li.append(row);
      ul.append(li);
    }
    s.append(ul);
    return s;
  }

  function normalize(list) {
    return (Array.isArray(list) ? list : []).map(x => {
      const it = Object.assign({}, x);
      it.qty = clampQty(it.qty == null ? 1 : it.qty);
      it.sizes = Array.isArray(it.sizes) ? it.sizes.map(String).filter(Boolean).slice(0, 8) : [];
      it.size = it.size ? String(it.size) : (it.sizes[0] || "");
      it.options = Array.isArray(it.options) ? it.options.map(String).filter(Boolean).slice(0, 8) : [];
      it.option = it.option ? String(it.option) : (it.options[0] || "");
      return it;
    });
  }

  function renderDish(dish, usedAI) {
    const ings = normalize(dish.ingredients).filter(x => x.item);
    if (!ings.length) return;
    const dishName = String(dish.dish || "This dish");
    const c = el("div", "receipt dish");
    const head = el("div", "head");
    head.append(el("strong", null, "Make it at home: " + dishName));
    head.append(el("span", null, "Core ingredients"));
    c.append(head);
    c.append(el("p", "why", dish.why ? String(dish.why) : dishWhy(dishName)));

    const ul = el("ul");
    const boxes = [];
    ings.forEach((it, i) => {
      const li = el("li");
      const lab = el("label");
      const cb = el("input"); cb.type = "checkbox"; cb.checked = true;
      boxes.push(cb);
      const txt = el("span");
      const b = el("b", null, it.item);
      txt.append(b);
      if (it.options.length) txt.append(el("span", "opt", " (" + it.options.join(", ") + ")"));
      if (it.eligible === false) txt.append(el("small", null, "Not covered by SNAP" + (it.reason ? ": " + it.reason : "")));
      lab.append(cb, txt);
      li.append(lab);
      ul.append(li);
    });
    c.append(ul);
    c.append(el("p", "ask", "Would you like to add these to your list? Uncheck anything you already have."));
    const actions = el("div", "actions");
    const yes = el("button", "primary", "Yes, add these"); yes.type = "button";
    const no = el("button", "secondary", "No thanks"); no.type = "button";
    actions.append(yes, no);
    c.append(actions);
    const finish = (msg) => { yes.disabled = true; no.disabled = true; boxes.forEach(b => b.disabled = true); c.append(el("p", "done", msg)); };
    yes.onclick = () => {
      const picked = ings.filter((_, i) => boxes[i].checked);
      if (!picked.length) { c.querySelector(".ask").textContent = "Check at least one ingredient, or choose No thanks."; return; }
      finish("Added " + picked.length + (picked.length === 1 ? " item" : " items") + " below.");
      const eligible = picked.filter(x => x.eligible !== false);
      const not_eligible = picked.filter(x => x.eligible === false).map(x => ({ item: x.item, reason: x.reason || "Not covered by SNAP" }));
      renderReceipt({ eligible, not_eligible, depends: [] }, usedAI, dishName + " groceries");
      const added = thread.lastElementChild;
      askNext();
      added.scrollIntoView({ block: "start", behavior: "smooth" });
    };
    no.onclick = () => { finish("No problem."); askNext(); };
    thread.append(c);
  }

  function renderReceipt(data, usedAI, title) {
    const dishes = Array.isArray(data.dishes) ? data.dishes : [];
    const hasItems = ["eligible","not_eligible","depends"].some(k => Array.isArray(data[k]) && data[k].length);
    if (dishes.length && !hasItems) { dishes.forEach(d => renderDish(d, usedAI)); return; }
    const r = el("div", "receipt");
    const head = el("div", "head");
    head.append(el("strong", null, title || "SNAP check · Connecticut"));
    const now = new Date();
    head.append(el("span", null, now.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })));
    r.append(head);

    const e = normalize(data.eligible);
    const n = Array.isArray(data.not_eligible) ? data.not_eligible : [];
    const d = normalize(data.depends);
    const total = el("p", "total");
    const updateTotal = () => {
      const c = e.reduce((a, x) => a + x.qty, 0);
      total.textContent = c + (c === 1 ? " SNAP item" : " SNAP items") + " in your list";
    };

    if (!e.length && !n.length && !d.length) {
      r.append(el("p", null, data.note || "I didn’t find any items. List what you want to buy, separated by commas."));
      thread.append(r); return;
    }
    list.push(...e.map(it => ({ it, check: false })), ...d.map(it => ({ it, check: true })));
    [section("yes", "SNAP covers these", "✓", e, true, updateTotal),
     section("maybe", "Check before you buy", "?", d, true, updateTotal),
     section("no", "SNAP won’t cover these", "✕", n, false)].forEach(x => x && r.append(x));
    if (e.length) { updateTotal(); r.append(total); }

    if (data.note) r.append(el("p", "src", data.note));

    if (!usedAI) r.append(el("p", "src", "Quick check by keyword matching. Double-check anything unusual."));
    thread.append(r);
    dishes.forEach(d => renderDish(d, usedAI));
  }

  async function check(text) {
    thread.append(el("div", "you", text));
    const status = el("div", "status", "Checking your list…");
    thread.append(status);
    status.scrollIntoView({ block: "end", behavior: "smooth" });
    send.disabled = true;

    let data = null, usedAI = false;
    try {
      const res = await fetch("/api/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.slice(0, 4000) })
      });
      const body = await res.json().catch(() => null);
      if (res.ok && body && typeof body === "object" && !body.error) {
        data = body; usedAI = true;
      } else {
        const msgs = {
          no_key: "The AI isn’t set up yet: add your API key to config.txt and restart the server. Using a quick keyword check for now.",
          bad_key: "The API key was rejected. Check the key in config.txt. Using a quick keyword check for now.",
          rate_limited: "Too many checks right now. Using a quick keyword check instead.",
          no_credit: "Your API account is out of credit. Add credit at console.anthropic.com. Using a quick keyword check for now."
        };
        const code = body && body.error;
        thread.insertBefore(el("div", "error", msgs[code] || "The AI couldn’t answer this time. Using a quick keyword check instead."), status);
      }
    } catch (e) {
      thread.insertBefore(el("div", "error", "Can’t reach the server. Make sure it’s running (see README). Using a quick keyword check for now."), status);
    }
    if (!data || typeof data !== "object") data = localClassify(text);
    status.remove();
    const before = thread.children.length + 1;
    renderReceipt(data, usedAI);
    askNext();
    send.disabled = false;
    const first = thread.children[before - 1] || thread.lastElementChild;
    if (first) first.scrollIntoView({ block: "start", behavior: "smooth" });
  }

  function handle(text) {
    if (CONFIRM.test(text)) return confirmList(text);
    if (ADD_MORE.test(text)) return addMore(text);
    check(text);
  }

  function itemCount() { return list.reduce((a, x) => a + x.it.qty, 0); }

  // "Do you want to add more items, or confirm this list?" — shown after every answer until the list is confirmed.
  function askNext() {
    thread.querySelectorAll(".next").forEach(x => x.remove());
    if (!list.length) return;
    const c = el("div", "next");
    c.append(el("p", "ask", "Do you want to add more items, or confirm this list?"));
    const n = itemCount();
    c.append(el("p", "hint", "Your list has " + n + (n === 1 ? " SNAP item" : " SNAP items") +
      " so far. You can still change amounts and sizes above. Type more items, or type “confirm”."));
    const actions = el("div", "actions");
    const ok = el("button", "primary", "Confirm list"); ok.type = "button";
    const more = el("button", "secondary", "Add more items"); more.type = "button";
    ok.onclick = () => confirmList("Confirm list");
    more.onclick = () => addMore("Add more items");
    actions.append(ok, more);
    c.append(actions);
    thread.append(c);
  }

  function addMore(text) {
    thread.querySelectorAll(".next").forEach(x => x.remove());
    thread.append(el("div", "you", text));
    thread.append(el("p", "bot", list.length ? "Sure. What else do you want to add?" : "Sure. What do you want to eat or buy?"));
    box.placeholder = "Type more items…";
    box.focus();
    thread.lastElementChild.scrollIntoView({ block: "end", behavior: "smooth" });
  }

  // Same item, type and size from different messages become one cart line.
  function cartLines() {
    const lines = [], byKey = new Map();
    for (const { it, check } of list) {
      const key = [it.item, it.option, it.size].map(v => String(v || "").toLowerCase().trim()).join("|");
      const had = byKey.get(key);
      if (had) { had.qty = Math.min(99, had.qty + it.qty); had.check = had.check || check; continue; }
      const line = { item: String(it.item), option: it.option || "", size: it.size || "", qty: it.qty, check, price: null };
      byKey.set(key, line); lines.push(line);
    }
    return lines;
  }

  const money = v => "$" + v.toFixed(2);

  async function confirmList(text) {
    thread.querySelectorAll(".next").forEach(x => x.remove());
    thread.append(el("div", "you", text));
    if (!list.length) {
      thread.append(el("p", "bot", "Your list is empty. Tell me what you want to eat or buy first."));
      return;
    }
    const lines = cartLines();
    list = [];
    box.placeholder = "Type what you want…";
    // The confirmed list is final: lock the earlier receipts so they can't drift from the cart.
    thread.querySelectorAll(".receipt:not(.cart) button, .receipt:not(.cart) select, .receipt:not(.cart) input")
      .forEach(x => { x.disabled = true; });

    const c = el("div", "receipt cart");
    const head = el("div", "head");
    head.append(el("strong", null, "Your cart"));
    head.append(el("span", null, new Date().toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })));
    c.append(head);
    const ul = el("ul", "cart-lines");
    const cells = lines.map(x => {
      const li = el("li");
      const name = el("div", "name");
      name.append(el("b", null, x.qty + " × " + x.item));
      const detail = el("small", null, [x.option, x.size].filter(Boolean).join(", "));
      const each = el("small", "each", "Estimating price…");
      name.append(detail, each);
      if (x.check) name.append(el("small", "flag", "Check the label before you buy"));
      const price = el("span", "price", "…");
      li.append(name, price);
      ul.append(li);
      return { each, price };
    });
    c.append(ul);
    const total = el("p", "cart-total", "Estimated total: working it out…");
    c.append(total);
    const note = el("p", "src", "Price estimates are typical Connecticut grocery prices, not quotes. Actual prices vary by store, brand and sales.");
    c.append(note);
    thread.append(c);
    c.scrollIntoView({ block: "start", behavior: "smooth" });

    send.disabled = true;
    let prices = null, problem = "";
    try {
      const res = await fetch("/api/prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: lines.map(x => ({ item: x.item, option: x.option, size: x.size })) })
      });
      const body = await res.json().catch(() => null);
      if (res.ok && body && Array.isArray(body.prices)) prices = body.prices;
      else {
        const msgs = {
          no_key: "Price estimates need the AI: add your API key to config.txt and restart the server.",
          bad_key: "Price estimates need the AI, but the API key was rejected. Check the key in config.txt.",
          rate_limited: "Too many requests right now. Try again in a minute for price estimates.",
          no_credit: "Price estimates need the AI, but your API account is out of credit."
        };
        problem = msgs[body && body.error] || "The AI couldn’t estimate prices this time.";
      }
    } catch { problem = "Can’t reach the server for price estimates. Make sure it’s running (see README)."; }
    send.disabled = false;

    let sum = 0, priced = 0;
    lines.forEach((x, i) => {
      const v = prices ? Number(prices[i]) : NaN;
      if (prices && prices[i] != null && isFinite(v) && v > 0) {
        x.price = v; sum += v * x.qty; priced++;
        cells[i].each.textContent = money(v) + " each";
        cells[i].price.textContent = money(v * x.qty);
      } else {
        cells[i].each.textContent = "No price estimate";
        cells[i].price.textContent = "—";
      }
    });
    if (priced) {
      total.textContent = "Estimated total: " + money(sum) +
        (priced < lines.length ? " (" + (lines.length - priced) + " without an estimate)" : "");
    } else {
      total.textContent = "No price estimates.";
      c.insertBefore(el("p", "error", problem || "No price estimates were available for these items."), total);
    }

    // Keep the cart in this browser so the order page can pick it up later.
    try { localStorage.setItem("ctfa_cart", JSON.stringify({ at: Date.now(), items: lines, total: priced ? Math.round(sum * 100) / 100 : null })); } catch {}
    // Cart confirmed: ask the shopper to sign in, then take them to the sign-in page.
    const next = el("div", "next");
    next.append(el("p", "ask", "Your cart is saved. Please sign in to continue."));
    const wait = el("p", "hint", "Taking you to sign in…");
    next.append(wait);
    const go = el("a", "btn btn-navy", "Sign in now"); go.href = "login.html";
    next.append(go);
    thread.append(next);
    box.disabled = true; send.disabled = true;
    form.closest(".composer").hidden = true; // nothing more to type: we're heading to sign in
    let left = 5;
    const tick = () => {
      if (left <= 0) { location.href = "login.html"; return; }
      wait.textContent = "Taking you to sign in in " + left + (left === 1 ? " second…" : " seconds…");
      left--; setTimeout(tick, 1000);
    };
    tick();
  }

  form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const t = box.value.trim();
    if (!t || send.disabled) return;
    box.value = ""; box.style.height = "";
    handle(t);
  });
  box.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" && !ev.shiftKey) { ev.preventDefault(); form.requestSubmit(); }
  });
  box.addEventListener("input", () => { box.style.height = "auto"; box.style.height = Math.min(box.scrollHeight, 144) + "px"; });
  document.querySelectorAll(".examples button").forEach(b => b.addEventListener("click", () => {
    if (send.disabled) return;
    check(b.dataset.ex);
  }));

  // An answer typed on the landing page arrives as ?q=...
  const q = new URLSearchParams(location.search).get("q");
  if (q && q.trim()) {
    history.replaceState(null, "", location.pathname);
    handle(q.trim().slice(0, 4000));
  } else if (!matchMedia("(max-width: 820px)").matches) {
    box.focus({ preventScroll: true });
  }
})();
