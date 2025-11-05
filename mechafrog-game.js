// MechaFrog Play-to-Mine — Lite Demo
(() => {
  const $ = (sel) => document.querySelector(sel);
  const fmt = (n) => new Intl.NumberFormat().format(Math.floor(n));
  const SAVE_KEY = "mf_ptm_v1";
  const TICK_MS = 1000;
  const BASE_PASSIVE = 50;
  const BASE_PER_CLICK = 3;
  const MAX_CPS = 12;
  const MECHA_PER_HASH_PER_SEC = 0.00018;
  const SHOP = [
    { id: "rig1",  name: "Basic Rig",      cost: 100,    boost: 25,    desc: "+25 H/s" },
    { id: "core1", name: "Neon Core",      cost: 500,    boost: 200,   desc: "+200 H/s" },
    { id: "gpu1",  name: "Quantum GPU",    cost: 2000,   boost: 1000,  desc: "+1000 H/s" },
    { id: "node1", name: "Overdrive Node", cost: 5000,   boost: 3000,  desc: "+3000 H/s" },
    { id: "rx1",   name: "Cyber Reactor",  cost: 20000,  boost: 12000, desc: "+12000 H/s" },
  ];
  let state = { mecha: 0, passive: BASE_PASSIVE, perClick: BASE_PER_CLICK, upgrades: {}, lastTick: Date.now() };
  function load() {
    try { const raw = localStorage.getItem(SAVE_KEY); if (!raw) return;
      const s = JSON.parse(raw);
      if (typeof s.mecha === "number") state.mecha = s.mecha;
      if (typeof s.passive === "number") state.passive = s.passive;
      if (typeof s.perClick === "number") state.perClick = s.perClick;
      if (s.upgrades && typeof s.upgrades === "object") state.upgrades = s.upgrades;
      if (typeof s.lastTick === "number") state.lastTick = s.lastTick;
    } catch {}
  }
  function save(){ localStorage.setItem(SAVE_KEY, JSON.stringify(state)); }
  function totalHashrate(){ let boost=0; for (const u of SHOP){ const qty=state.upgrades[u.id]||0; boost+=qty*u.boost;} return state.passive+boost; }
  const elMecha=$("#ptm-mecha"), elHash=$("#ptm-hashrate"), elPass=$("#ptm-passive"), elClick=$("#ptm-perclick"), elBtn=$("#ptm-mine-btn"), elShop=$("#ptm-shop"), elReset=$("#ptm-reset");
  function renderShop(){
    elShop.innerHTML="";
    SHOP.forEach(u=>{
      const qty=state.upgrades[u.id]||0;
      const row=document.createElement("div");
      row.className="ptm-item";
      row.innerHTML=`
        <div>
          <h5>${u.name} <span style="opacity:.6">x${qty}</span></h5>
          <div class="meta">${u.desc} · Cost: ${new Intl.NumberFormat().format(u.cost)} MECHA</div>
        </div>
        <div><button class="ptm-buy" data-id="${u.id}" ${state.mecha < u.cost ? "disabled" : ""}>Buy</button></div>`;
      elShop.appendChild(row);
    });
  }
  function buy(id){
    const item=SHOP.find(x=>x.id===id); if(!item) return;
    if(state.mecha < item.cost) return;
    state.mecha -= item.cost;
    state.upgrades[id]=(state.upgrades[id]||0)+1;
    save(); syncUI();
  }
  function syncUI(){
    elMecha.textContent=fmt(state.mecha);
    elHash.textContent=fmt(totalHashrate());
    elPass.textContent=fmt(state.passive);
    elClick.textContent=`+${fmt(state.perClick)}`;
    elShop.querySelectorAll("button.ptm-buy").forEach(btn=>{
      const id=btn.getAttribute("data-id");
      const item=SHOP.find(x=>x.id===id);
      btn.disabled=!item || state.mecha<item.cost;
    });
  }
  function tick(){
    const now=Date.now();
    const dtSec=Math.max(0,(now-state.lastTick)/1000);
    const h=totalHashrate();
    const earned=h*MECHA_PER_HASH_PER_SEC*dtSec;
    state.mecha += earned;
    state.lastTick=now;
    save(); syncUI();
  }
  let clicksThisSecond=0, lastSecond=Math.floor(Date.now()/1000);
  function handleClick(){
    const sec=Math.floor(Date.now()/1000);
    if(sec!==lastSecond){ lastSecond=sec; clicksThisSecond=0; }
    clicksThisSecond++; if(clicksThisSecond>MAX_CPS) return;
    const h=totalHashrate();
    const bonus=state.perClick*(1+Math.log10(Math.max(10,h))/2);
    state.mecha+=bonus; save(); syncUI();
  }
  elShop.addEventListener("click",(e)=>{ const btn=e.target.closest(".ptm-buy"); if(!btn) return; buy(btn.getAttribute("data-id")); });
  elBtn.addEventListener("click", handleClick);
  elReset.addEventListener("click", ()=>{
    if(!confirm("Reset progress?")) return;
    localStorage.removeItem(SAVE_KEY);
    state={ mecha:0, passive:BASE_PASSIVE, perClick:BASE_PER_CLICK, upgrades:{}, lastTick:Date.now() };
    save(); renderShop(); syncUI();
  });
  load(); renderShop(); syncUI(); tick(); setInterval(tick, TICK_MS);
})();
