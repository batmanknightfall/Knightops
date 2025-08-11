/* NightOps – main controller with strong logging and guardrails. */
const Log = (() => {
  let level = "info"; // "debug" | "info" | "warn" | "error"
  const sink = [];
  function write(l, ...args) {
    const row = `[${new Date().toISOString()}][${l}] ${args.map(a => typeof a === "string" ? a : JSON.stringify(a)).join(" ")}`;
    sink.push(row); if (sink.length > 400) sink.shift();
    if (["debug","info"].includes(level) || l !== "debug") console[l === "warn" ? "warn" : (l === "error" ? "error" : "log")](row);
    renderConsole();
  }
  function setLevel(l){ level = l; write("info",`log level -> ${l}`); }
  function dump(){ return sink.slice(); }
  return { debug:(...a)=>write("debug",...a), info:(...a)=>write("info",...a), warn:(...a)=>write("warn",...a), error:(...a)=>write("error",...a), setLevel, dump };
})();

const State = {
  key: null, decoy: false, currentTab: "notes",
  feature: { haptics: true, webpush: false }
};

const els = {};
document.addEventListener("DOMContentLoaded", init);

async function init() {
  [
    "clock","battery","btnInstall","btnConsole","passphrase","btnUnlock",
    "quickNote","quickTask","panicWipe","decoyMode","search",
    "list-notes","list-tasks","editor","editorTitle","editorBody","saveItem","keyState"
  ].forEach(id => els[id.replace("-","")] = document.getElementById(id));

  wireUI();
  tickClock();
  try { await DB.open(); Log.info("DB opened"); } catch (e) { Log.error("DB open failed", e); }
  registerSW();
  setupBattery();
}

function wireUI(){
  els.btnConsole.addEventListener("click", ()=> document.getElementById("console").classList.toggle("hidden"));
  els.btnUnlock.addEventListener("click", derive);
  els.quickNote.addEventListener("click", ()=> openEditor("note"));
  els.quickTask.addEventListener("click", ()=> openEditor("task"));
  els.panicWipe.addEventListener("click", panicWipe);
  els.decoyMode.addEventListener("click", ()=> { State.decoy = !State.decoy; toast(`Decoy mode ${State.decoy?"ON":"OFF"}`); render(); });
  document.querySelectorAll(".tab").forEach(b => b.addEventListener("click", () => switchTab(b.dataset.tab)));
  els.search.addEventListener("input", render);
  els.saveItem.addEventListener("click", saveEditor);
  window.addEventListener("beforeunload", () => Log.info("leaving app"));
}

async function derive() {
  const p = els.passphrase.value.trim();
  if (!p) { toast("Enter a passphrase"); return; }
  try {
    State.key = await Crypto.getKey((State.decoy?"decoy:":"") + p);
    els.keyState.textContent = "Key: ready";
    toast("Vault unlocked");
    await render();
  } catch (e) {
    Log.error("Key derivation failed", e); toast("Unlock failed");
  }
}

async function openEditor(kind){
  if (!State.key) { toast("Unlock first"); return; }
  els.editorTitle.textContent = kind === "note" ? "New Note" : "New Task";
  els.editor.dataset.kind = kind;
  els.editorBody.value = "";
  els.editor.showModal();
}

async function saveEditor(ev){
  ev.preventDefault();
  if (!State.key) return;
  const kind = els.editor.dataset.kind;
  const body = els.editorBody.value.trim();
  if (!body) { els.editor.close(); return; }
  const now = Date.now();
  const { iv, ct } = await Crypto.encrypt(State.key, body);
  const record = { id: crypto.randomUUID(), iv, ct, updated: now };
  await DB.put(kind === "note" ? "notes" : "tasks", record);
  Log.info(`Saved ${kind}`, { id: record.id, size: body.length });
  els.editor.close(); render();
}

async function render(){
  await renderList("notes", document.getElementById("list-notes"));
  await renderList("tasks", document.getElementById("list-tasks"));
  switchTab(State.currentTab, true);
}

async function renderList(store, container){
  const q = els.search.value?.toLowerCase() || "";
  container.innerHTML = "";
  const rows = await DB.getAll(store);
  for (const r of rows) {
    let text = "(locked)";
    try { if (State.key) text = await Crypto.decrypt(State.key, r.iv, r.ct); } catch { text = "🔒 (wrong passphrase?)"; }
    if (q && !text.toLowerCase().includes(q)) continue;
    const el = document.createElement("div"); el.className = "item";
    el.innerHTML = `<div class="body">${escapeHTML(text)}</div>
                    <div class="meta">${new Date(r.updated).toLocaleString()}</div>`;
    container.appendChild(el);
  }
}

function switchTab(tab, silent=false){
  State.currentTab = tab;
  document.querySelectorAll(".tab").forEach(t=>t.classList.toggle("active", t.dataset.tab===tab));
  document.getElementById("list-notes").classList.toggle("hidden", tab!=="notes");
  document.getElementById("list-tasks").classList.toggle("hidden", tab!=="tasks");
  if (!silent) Log.debug("tab ->", tab);
}

function tickClock(){
  const t = new Date(); els.clock.textContent = t.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
  setTimeout(tickClock, 20_000);
}

function setupBattery(){
  if (!navigator.getBattery) return;
  navigator.getBattery().then(b => {
    const upd = () => els.battery.textContent = Math.round(b.level*100) + "%";
    ["levelchange","chargingchange"].forEach(ev => b.addEventListener(ev, upd)); upd();
  });
}

function toast(msg){ Log.info(msg); const c = document.getElementById("console"); c.classList.remove("hidden"); const div = document.createElement("div"); div.textContent = msg; c.appendChild(div); c.scrollTop = c.scrollHeight; }
function renderConsole(){ const c = document.getElementById("console"); if (c.classList.contains("hidden")) return; c.innerHTML = Log.dump().slice(-50).map(r=>`<div>${escapeHTML(r)}</div>`).join(""); }

function escapeHTML(s){ return s.replace(/[&<>"']/g, m=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m])); }

async function panicWipe(){
  if (!confirm("Permanently wipe all data?")) return;
  await DB.clearAll(); localStorage.clear();
  caches && (await caches.keys()).forEach(k => caches.delete(k));
  State.key = null; els.keyState.textContent = "Key: not initialized"; render();
  toast("Wiped.");
}

function registerSW(){
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", async () => {
    try { await navigator.serviceWorker.register("./sw.js"); Log.info("SW registered"); }
    catch (e) { Log.warn("SW registration failed", e); }
  });
}
