// MechaFrog Play-to-Mine — Lite Demo
// Passive mining + clicks + upgrades, localStorage, anti-spam.
// Updates: tuned upgrade costs/boosts, higher MECHA per click, click sound, progress-bars supported.

(() => {
  const $ = (s) => document.querySelector(s);
  const fmtInt = (n) => new Intl.NumberFormat().format(Math.floor(n));
  const fmtDec = (n, d=5) => Number(n).toFixed(d);

  // ---- Config (tuned) ----
  const SAVE_KEY = "mf_ptm_v2";          // bump key to avoid old saves clashing
  const TICK_MS = 1000;                  // passive tick
  const BASE_PASSIVE = 50;               // base passive H/s
  const BASE_PER_CLICK = 6;              // ↑ was 3 → feels snappier
  const MAX_CPS = 12;                    // ignore > 12 clicks/s
  const MECHA_PER_HASH_PER_SEC = 0.00018;// H/s -> MECHA/s (demo scale)

  // Tuned shop: smoother early curve, stronger late-game, similar ROI feel
  // cost in MECHA, boost in H/s
  const SHOP = [
    { id:"rig0",  name:"Micro Rig",          cost:120,     boost:40,     desc:"+40 H/s" },
    { id:"core2", name:"Dual Neon Core",     cost:600,     boost:320,    desc:"+320 H/s" },
    { id:"gpu2",  name:"Quantum GPU Mk.II",  cost:2_500,   boost:1_600,  desc:"+1,600 H/s" },
    { id:"node2", name:"Overdrive Cluster",  cost:8_000,   boost:6_000,  desc:"+6,000 H/s" },
    { id:"rx2",   name:"Cyber Reactor Pro",  cost:25_000,  boost:22_000, desc:"+22,000 H/s" },
    { id:"god1",  name:"Frog God Protocol",  cost:100_000, boost:90_000, desc:"+90,000 H/s" },
  ];

  // ---- State ----
  let state = {
    mecha: 0,
    passive: BASE_PASSIVE,
    perClick: BASE_PER_CLICK,
    upgrades: {},   // id -> quantity
    lastTick: Date.now()
  };

  // ---- Elements (both index or game page) ----
  const elMecha   = $("#ptm-mecha");
  const elHash    = $("#ptm-hashrate");
  const elPass    = $("#ptm-passive");
  const elClick   = $("#ptm-perclick");
  const elShop    = $("#ptm-shop");
  const elBtn     = $("#ptm-mine-btn");
  const elReset   = $("#ptm-reset");
  const elRatePS  = $("#ptm-rate-ps"); // Live MECHA/s (only on game.html)

  // ---- WebAudio click-sound (tiny, no extra files) ----
  let audioCtx = null;
  function clickSound() {
    try {
      if (!audioCtx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AC();
      }
      const ctx = audioCtx;
      const now = ctx.currentTime;

      // Two short blips for a "techy ribbit click"
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = "triangle";
      osc1.frequency.setValueAtTime(880, now);
      osc1.frequency.exponentialRampToValueAtTime(660, now + 0.07);
      gain1.gain.setValueAtTime(0.0001, now);
      gain1.gain.exponentialRampToValueAtTime(0.08, now + 0.01);
      gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
      osc1.connect(gain1).connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.1);

      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = "square";
      osc2.frequency.setValueAtTime(1200, now + 0.04);
      osc2.frequency.exponentialRampToValueAtTime(900, now + 0.11);
      gain2.gain.setValueAtTime(0.0001, now + 0.04);
      gain2.gain.exponentialRampToValueAtTime(0.05, now + 0.05);
      gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
      osc2.connect(gain2).connect(ctx.destination);
      osc2.start(now + 0.04);
      osc2.stop(now + 0.13);
    } catch {
      // ignore audio errors (e.g., autoplay policies)
    }
  }

  // ---- Load/Save ----
  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      if (typeof s.mecha === "number") state.mecha = s.mecha;
      if (typeof s.passive === "number") state.passive = s.passive;
      if (typeof s.perClick === "number") state.perClick = s.perClick;
      if (s.upgrades && typeof s.upgrades === "object") state.upgrades = s.upgrades;
      if (typeof s.lastTick === "number") state.lastTick = s.lastTick;
    } catch {/* ignore */}
  }
  function save() {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  }

  // ---- Derived ----
  function totalHashrate() {
    let boost = 0;
    for (const u of SHOP) {
      boost += (state.upgrades[u.id] || 0) * u.boost;
    }
    return state.passive + boost;
  }
  function ratePerSec() {
    return totalHashrate() * MECHA_PER_HASH_PER_SEC;
  }

  // ---- UI Render (supports progress bars under each upgrade) ----
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

  function syncUI() {
    if (elMecha) elMecha.textContent = fmtInt(state.mecha);
    if (elHash)  elHash.textContent  = fmtInt(totalHashrate());
    if (elPass)  elPass.textContent  = fmtInt(state.passive);
    if (elClick) elClick.textContent = `+${fmtInt(state.perClick)}`;

    // Live rate MECHA/s (game.html)
    if (elRatePS) elRatePS.textContent = fmtDec(ratePerSec(), 5);

    renderShop(); // updates xN, disabled & progress bars
  }

  // ---- Game Loop ----
  function tick() {
    const now = Date.now();
    const dtSec = Math.max(0, (now - state.lastTick) / 1000);
    state.mecha += ratePerSec() * dtSec;           // passive earn
    state.lastTick = now;
    save();
    syncUI();
  }

  // ---- Events ----
  // Buy (event delegation)
  if (elShop) {
    elShop.addEventListener("click", (e) => {
      const btn = e.target.closest(".ptm-buy");
      if (!btn) return;
      const id = btn.getAttribute("data-id");
      const item = SHOP.find(x => x.id === id);
      if (!item) return;
      if (state.mecha < item.cost) return;
      state.mecha -= item.cost;
      state.upgrades[id] = (state.upgrades[id] || 0) + 1;   // quantity increments
      save();
      syncUI();                                             // re-render shows xN & progress immediately
    });
  }

  // Click mine with basic spam guard + sound
  let clicksThisSecond = 0;
  let lastSecond = Math.floor(Date.now() / 1000);
  if (elBtn) {
    elBtn.addEventListener("click", () => {
      const sec = Math.floor(Date.now() / 1000);
      if (sec !== lastSecond) { lastSecond = sec; clicksThisSecond = 0; }
      clicksThisSecond++;
      if (clicksThisSecond > MAX_CPS) return;

      state.mecha += state.perClick;
      save();
      syncUI();

      // play soft click sound
      clickSound();
    });
  }

  // Reset
  if (elReset) {
    elReset.addEventListener("click", () => {
      if (!confirm("Reset progress?")) return;
      localStorage.removeItem(SAVE_KEY);
      state = { mecha:0, passive:BASE_PASSIVE, perClick:BASE_PER_CLICK, upgrades:{}, lastTick:Date.now() };
      save();
      syncUI();
    });
  }

  // ---- Boot ----
  load();
  renderShop();
  syncUI();
  tick();
  setInterval(tick, TICK_MS);
})();

