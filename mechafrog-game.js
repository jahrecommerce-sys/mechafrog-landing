// MechaFrog Play-to-Mine — Lite Demo
// Passive + click mining, upgrades, localStorage, anti-spam.
// Neu: Achievements, Avatar-Pulse, "+X"-Bubble, tuned balancing, click sound.

(() => {
  const $ = (s) => document.querySelector(s);
  const fmtInt = (n) => new Intl.NumberFormat().format(Math.floor(n));
  const fmtDec = (n, d=5) => Number(n).toFixed(d);

  // ---- Config (tuned) ----
  const SAVE_KEY = "mf_ptm_v3";          // bump key after feature changes
  const TICK_MS = 1000;
  const BASE_PASSIVE = 50;
  const BASE_PER_CLICK = 6;              // snappier click value
  const MAX_CPS = 12;
  const MECHA_PER_HASH_PER_SEC = 0.00018;

  // Shop (cost in MECHA, boost in H/s)
  const SHOP = [
    { id:"rig0",  name:"Micro Rig",          cost:120,     boost:40,     desc:"+40 H/s" },
    { id:"core2", name:"Dual Neon Core",     cost:600,     boost:320,    desc:"+320 H/s" },
    { id:"gpu2",  name:"Quantum GPU Mk.II",  cost:2500,    boost:1600,   desc:"+1,600 H/s" },
    { id:"node2", name:"Overdrive Cluster",  cost:8000,    boost:6000,   desc:"+6,000 H/s" },
    { id:"rx2",   name:"Cyber Reactor Pro",  cost:25000,   boost:22000,  desc:"+22,000 H/s" },
    { id:"god1",  name:"Frog God Protocol",  cost:100000,  boost:90000,  desc:"+90,000 H/s" },
  ];

  // Achievements (purely cosmetic/demo)
  const ACHIEVEMENTS = [
    { id: "first_click", name: "Warm-Up Ribbit",  hint: "Click Mine once.",             cond: (s) => s.stats.clicks >= 1 },
    { id: "first_upg",   name: "Hardware Online", hint: "Buy your first upgrade.",      cond: (s) => s.stats.upgradesBought >= 1 },
    { id: "mecha_1k",    name: "Pond of Plenty",  hint: "Reach 1,000 MECHA.",           cond: (s) => s.mecha >= 1000 },
    { id: "hash_10k",    name: "Turbo Hash",      hint: "Reach 10,000 H/s total.",      cond: (s) => totalHashrate(s) >= 10000 },
    { id: "shop_10",     name: "Rig Hoarder",     hint: "Own 10 upgrades (total).",     cond: (s) => totalUpgrades(s) >= 10 },
  ];

  // ---- State ----
  let state = {
    mecha: 0,
    passive: BASE_PASSIVE,
    perClick: BASE_PER_CLICK,
    upgrades: {},          // id -> quantity
    lastTick: Date.now(),
    stats: { clicks: 0, upgradesBought: 0 },
    achv: {}               // id -> true if unlocked
  };

  // ---- Elements ----
  const elMecha   = $("#ptm-mecha");
  const elHash    = $("#ptm-hashrate");
  const elPass    = $("#ptm-passive");
  const elClick   = $("#ptm-perclick");
  const elShop    = $("#ptm-shop");
  const elBtn     = $("#ptm-mine-btn");
  const elReset   = $("#ptm-reset");
  const elRatePS  = $("#ptm-rate-ps");
  const elAchv    = $("#achvList");
  const frogImg   = $("#frogImg");
  const pcScene   = $("#pcScene");

  // ---- Audio (click) ----
  let audioCtx = null;
  function clickSound() {
    try {
      if (!audioCtx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AC();
      }
      const ctx = audioCtx;
      const now = ctx.currentTime;

      const osc1 = ctx.createOscillator();
      const g1 = ctx.createGain();
      osc1.type = "triangle";
      osc1.frequency.setValueAtTime(880, now);
      osc1.frequency.exponentialRampToValueAtTime(660, now + 0.07);
      g1.gain.setValueAtTime(0.0001, now);
      g1.gain.exponentialRampToValueAtTime(0.08, now + 0.01);
      g1.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
      osc1.connect(g1).connect(ctx.destination);
      osc1.start(now); osc1.stop(now + 0.1);

      const osc2 = ctx.createOscillator();
      const g2 = ctx.createGain();
      osc2.type = "square";
      osc2.frequency.setValueAtTime(1200, now + 0.04);
      osc2.frequency.exponentialRampToValueAtTime(900, now + 0.11);
      g2.gain.setValueAtTime(0.0001, now + 0.04);
      g2.gain.exponentialRampToValueAtTime(0.05, now + 0.05);
      g2.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
      osc2.connect(g2).connect(ctx.destination);
      osc2.start(now + 0.04); osc2.stop(now + 0.13);
    } catch {}
  }

  // ---- Helpers ----
  function totalHashrate(s = state) {
    let boost = 0;
    for (const u of SHOP) boost += (s.upgrades[u.id] || 0) * u.boost;
    return s.passive + boost;
  }
  function ratePerSec(s = state) {
    return totalHashrate(s) * MECHA_PER_HASH_PER_SEC;
  }
  function totalUpgrades(s = state) {
    return Object.values(s.upgrades).reduce((a, b) => a + (b || 0), 0);
  }

  // ---- Save/Load ----
  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      if (typeof s.mecha === "number") state.mecha = s.mecha;
      if (typeof s.passive === "number") state.passive = s.passive;
      if (typeof s.perClick === "number") state.perClick = s.perClick;
      if (s.upgrades && typeof s.upgrades === "object") state.upgrades = s.upgrades;
      if (s.stats) state.stats = Object.assign({clicks:0,upgradesBought:0}, s.stats);
      if (s.achv) state.achv = s.achv;
      if (typeof s.lastTick === "number") state.lastTick = s.lastTick;
    } catch {}
  }
  function save() {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  }

  // ---- UI: Shop + Progress ----
  function renderShop() {
    if (!elShop) return;
    elShop.innerHTML = "";
    for (const u of SHOP) {
      const qty = state.upgrades[u.id] || 0;
      const affordablePct = Math.min(state.mecha / u.cost, 1);
      const pctText = Math.floor(affordablePct * 100);

      const wrap = document.createElement("div");
      wrap.className = "ptm-item";
      wrap.innerHTML = `
        <div class="info">
          <h5>${u.name} <span class="qty">x${qty}</span></h5>
          <div class="meta">${u.desc} · Cost: ${new Intl.NumberFormat().format(u.cost)} MECHA</div>
          <div class="prog"><span style="width:${pctText}%"></span></div>
          <div class="prog-label">
            <span>${Math.floor(state.mecha)} / ${new Intl.NumberFormat().format(u.cost)} MECHA</span>
            <span>${pctText}%</span>
          </div>
        </div>
        <div>
          <button class="ptm-buy" data-id="${u.id}" ${state.mecha < u.cost ? "disabled" : ""}>Buy</button>
        </div>
      `;
      elShop.appendChild(wrap);
    }
  }

  // ---- UI: Achievements ----
  function renderAchievements() {
    if (!elAchv) return;
    elAchv.innerHTML = "";
    for (const a of ACHIEVEMENTS) {
      const done = !!state.achv[a.id];
      const row = document.createElement("div");
      row.className = "achv" + (done ? " done" : "");
      row.innerHTML = `
        <div>
          <div class="name">${a.name}</div>
          <div class="hint">${a.hint}</div>
        </div>
        <div>${done ? '<span class="badge">Unlocked</span>' : '<span class="badge" style="opacity:.7">Locked</span>'}</div>
      `;
      elAchv.appendChild(row);
    }
  }

  function checkAchievements() {
    let changed = false;
    for (const a of ACHIEVEMENTS) {
      if (state.achv[a.id]) continue;
      if (a.cond(state)) {
        state.achv[a.id] = true;
        changed = true;
        // small visual toast
        toast(`🏆 Achievement unlocked: ${a.name}`);
      }
    }
    if (changed) { save(); renderAchievements(); }
  }

  // ---- Tiny toast
  function toast(text) {
    const t = document.createElement("div");
    t.textContent = text;
    t.style.position = "fixed";
    t.style.left = "50%";
    t.style.top = "16px";
    t.style.transform = "translateX(-50%)";
    t.style.background = "#0f1d16";
    t.style.border = "1px solid #24523d";
    t.style.color = "#b9f7cf";
    t.style.padding = "8px 12px";
    t.style.borderRadius = "10px";
    t.style.zIndex = "9999";
    t.style.boxShadow = "0 10px 30px rgba(0,0,0,.35)";
    document.body.appendChild(t);
    setTimeout(()=>{ t.style.transition="opacity .3s"; t.style.opacity="0"; }, 1200);
    setTimeout(()=> t.remove(), 1600);
  }

  // ---- UI Sync ----
  function syncUI() {
    if (elMecha) elMecha.textContent = fmtInt(state.mecha);
    if (elHash)  elHash.textContent  = fmtInt(totalHashrate());
    if (elPass)  elPass.textContent  = fmtInt(state.passive);
    if (elClick) elClick.textContent = `+${fmtInt(state.perClick)}`;
    if (elRatePS) elRatePS.textContent = fmtDec(ratePerSec(), 5);

    renderShop();
    renderAchievements();
  }

  // ---- Game Loop ----
  function tick() {
    const now = Date.now();
    const dtSec = Math.max(0, (now - state.lastTick) / 1000);
    state.mecha += ratePerSec() * dtSec;   // passive
    state.lastTick = now;
    save();
    syncUI();
    checkAchievements();
  }

  // ---- Click FX ("+X" bubble) ----
  function spawnBubble(text) {
    if (!pcScene) return;
    const b = document.createElement("div");
    b.className = "fx-bubble";
    b.textContent = `+${text}`;
    // slight horizontal jitter
    const dx = (Math.random() * 40 - 20) + "px";
    b.style.left = "50%";
    b.style.transform = `translate(calc(-50% + ${dx}), -40%)`;
    pcScene.appendChild(b);
    setTimeout(()=> b.remove(), 750);
  }

  // ---- Events ----
  // Buy
  if (elShop) {
    elShop.addEventListener("click", (e) => {
      const btn = e.target.closest(".ptm-buy");
      if (!btn) return;
      const id = btn.getAttribute("data-id");
      const item = SHOP.find(x => x.id === id);
      if (!item) return;
      if (state.mecha < item.cost) return;
      state.mecha -= item.cost;
      state.upgrades[id] = (state.upgrades[id] || 0) + 1;
      state.stats.upgradesBought++;
      save();
      syncUI();
      checkAchievements();
      toast(`⚙️ Bought: ${item.name}`);
    });
  }

  // Click mine (+sound, anti-spam, avatar pulse, bubble)
  let clicksThisSecond = 0;
  let lastSecond = Math.floor(Date.now() / 1000);
  if (elBtn) {
    elBtn.addEventListener("click", () => {
      const sec = Math.floor(Date.now() / 1000);
      if (sec !== lastSecond) { lastSecond = sec; clicksThisSecond = 0; }
      clicksThisSecond++;
      if (clicksThisSecond > MAX_CPS) return;

      state.mecha += state.perClick;
      state.stats.clicks++;
      save();
      syncUI();
      checkAchievements();

      // Click FX
      spawnBubble(state.perClick);
      frogImg && (frogImg.classList.add("pulse"), setTimeout(()=>frogImg.classList.remove("pulse"), 300));
      clickSound();
    });
  }

  // Reset
  if (elReset) {
    elReset.addEventListener("click", () => {
      if (!confirm("Reset progress?")) return;
      localStorage.removeItem(SAVE_KEY);
      state = {
        mecha: 0,
        passive: BASE_PASSIVE,
        perClick: BASE_PER_CLICK,
        upgrades: {},
        lastTick: Date.now(),
        stats: { clicks: 0, upgradesBought: 0 },
        achv: {}
      };
      save();
      syncUI();
      renderAchievements();
    });
  }

  // ---- Boot ----
  load();
  syncUI();
  tick();
  setInterval(tick, TICK_MS);
})();
