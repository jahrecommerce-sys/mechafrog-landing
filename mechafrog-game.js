// MechaFrog Play-to-Mine — Lite Demo
// Passive mining + clicks + upgrades, localStorage persistence, simple anti-spam.
(() => {
  const $ = (s) => document.querySelector(s);
  const fmtInt = (n) => new Intl.NumberFormat().format(Math.floor(n));
  const fmtDec = (n, d=5) => Number(n).toFixed(d);

  // ---- Config ----
  const SAVE_KEY = "mf_ptm_v1";
  const TICK_MS = 1000;                  // passive tick
  const BASE_PASSIVE = 50;               // base passive H/s
  const BASE_PER_CLICK = 3;              // MECHA per click (flat)
  const MAX_CPS = 12;                    // ignore > 12 clicks/s
  const MECHA_PER_HASH_PER_SEC = 0.00018;// H/s -> MECHA/s (demo scale)

  // Shop catalogue (cost in MECHA, boost in H/s)
  const SHOP = [
    { id:"rig1",  name:"Basic Rig",      cost:100,    boost:25,    desc:"+25 H/s" },
    { id:"core1", name:"Neon Core",      cost:500,    boost:200,   desc:"+200 H/s" },
    { id:"gpu1",  name:"Quantum GPU",    cost:2000,   boost:1000,  desc:"+1000 H/s" },
    { id:"node1", name:"Overdrive Node", cost:5000,   boost:3000,  desc:"+3000 H/s" },
    { id:"rx1",   name:"Cyber Reactor",  cost:20000,  boost:12000, desc:"+12000 H/s" },
  ];

  // ---- State ----
  let state = {
    mecha: 0,
    passive: BASE_PASSIVE,
    perClick: BASE_PER_CLICK,
    upgrades: {},   // id -> quantity
    lastTick: Date.now()
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
  const elRatePM  = $("#ptm-rate-pm");

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

  // ---- UI Render ----
  function renderShop() {
    // Build fresh each time so quantities update immediately
    elShop.innerHTML = "";
    for (const u of SHOP) {
      const qty = state.upgrades[u.id] || 0;
      const row = document.createElement("div");
      row.className = "ptm-item";
      row.innerHTML = `
        <div>
          <h5>${u.name} <span class="qty" style="opacity:.6">x${qty}</span></h5>
          <div class="meta">${u.desc} · Cost: ${new Intl.NumberFormat().format(u.cost)} MECHA</div>
        </div>
        <div>
          <button class="ptm-buy" data-id="${u.id}" ${state.mecha < u.cost ? "disabled" : ""}>Buy</button>
        </div>
      `;
      elShop.appendChild(row);
    }
  }

  function syncUI() {
    elMecha && (elMecha.textContent = fmtInt(state.mecha));
    elHash  && (elHash.textContent  = fmtInt(totalHashrate()));
    elPass  && (elPass.textContent  = fmtInt(state.passive));
    elClick && (elClick.textContent = `+${fmtInt(state.perClick)}`);

    // Live rate labels
    if (elRatePS) elRatePS.textContent = fmtDec(ratePerSec(), 5);
    if (elRatePM) elRatePM.textContent = fmtDec(ratePerSec() * 60, 5);

    // Re-render shop to update xN and disabled buttons
    renderShop();
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
  elShop && elShop.addEventListener("click", (e) => {
    const btn = e.target.closest(".ptm-buy");
    if (!btn) return;
    const id = btn.getAttribute("data-id");
    const item = SHOP.find(x => x.id === id);
    if (!item) return;
    if (state.mecha < item.cost) return;
    state.mecha -= item.cost;
    state.upgrades[id] = (state.upgrades[id] || 0) + 1;   // <-- quantity increases here
    save();
    syncUI();                                             // <-- re-render shows xN immediately
  });

  // Click mine with basic spam guard
  let clicksThisSecond = 0;
  let lastSecond = Math.floor(Date.now() / 1000);
  elBtn && elBtn.addEventListener("click", () => {
    const sec = Math.floor(Date.now() / 1000);
    if (sec !== lastSecond) { lastSecond = sec; clicksThisSecond = 0; }
    clicksThisSecond++;
    if (clicksThisSecond > MAX_CPS) return;
    state.mecha += state.perClick;
    save();
    syncUI();
  });

  // Reset
  elReset && elReset.addEventListener("click", () => {
    if (!confirm("Reset progress?")) return;
    localStorage.removeItem(SAVE_KEY);
    state = { mecha:0, passive:BASE_PASSIVE, perClick:BASE_PER_CLICK, upgrades:{}, lastTick:Date.now() };
    save();
    syncUI();
  });

  // ---- Boot ----
  load();
  renderShop();
  syncUI();
  tick();
  setInterval(tick, TICK_MS);
})();
