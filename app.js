// app.js — Base estable + LIVE chart FIX + Trades no quedan colgados (timeouts + race) + ✅ Auto-abrir gráfico (configurable)
// ✅ Modo FUERTE más “parecido” (patrón tipo ESCALERA + doble empuje) — NORMAL queda igual
// ✅ FIX UI: Botones COMPRAR / VENDER en el modal uno al lado del otro (grandes, sin encimarse)
// ✅ Disciplina (DEMO): 3 ITM (ganadas) o 2 OTM (perdidas) -> bloquea operar 1h
// ✅ FIX Disciplina: feedback visual (candado + “polarizado”) + contador visible + auto-unlock con reset
// ✅ FIX CRASH: evita "Cannot read properties of null (reading 'ticks')" (RAF + onTick safe)
// ✅ Nota: el bloqueo se activa cuando Deriv confirma el resultado del contrato (al expirar), no al apretar el botón

"use strict";

/* =========================
   Config
========================= */
const WS_URL = "wss://ws.derivws.com/websockets/v3?app_id=1089";
const SYMBOLS = ["R_10", "R_25", "R_50", "R_75"];

const DERIV_DTRADER_TEMPLATE =
  "https://app.deriv.com/dtrader?symbol=R_75&account=demo&lang=ES&chart_type=area&interval=1t&trade_type=rise_fall_equal";

const STORE_KEY = "derivSignalsHistory_v2";
const MAX_HISTORY = 200;

const MIN_TICKS = 3;
const MIN_SYMBOLS_READY = 2;
const RETRY_DELAY_MS = 5000;

const HISTORY_TIMEOUT_MS = 7000;

/* =========================
   DEMO Trade config
========================= */
const DERIV_TOKEN_KEY = "derivDemoToken_v1"; // SOLO demo
const TRADE_STAKE_KEY = "tradeStake_v1";

const DEFAULT_STAKE = 1; // USD
const DEFAULT_DURATION = 1; // 1 minuto
const DEFAULT_DURATION_UNIT = "m";
const DEFAULT_CURRENCY = "USD";

/* =========================
   Auto-open chart config
========================= */
const AUTOOPEN_CHART_KEY = "autoOpenChartOnSignal_v1";
let autoOpenChartOnSignal = false;

/* =========================
   Disciplina (3 ITM o 2 OTM) -> lock 1h
========================= */
const DISCIPLINE_WINDOW_START_KEY = "discipline_windowStartMs_v1";
const DISCIPLINE_WINS_KEY = "discipline_wins_v1";
const DISCIPLINE_LOSSES_KEY = "discipline_losses_v1";
const DISCIPLINE_LOCK_UNTIL_KEY = "discipline_lockUntilMs_v1";

const DISCIPLINE_MAX_WINS = 3; // ITM
const DISCIPLINE_MAX_LOSSES = 2; // OTM
const DISCIPLINE_LOCK_MS = 60 * 60 * 1000;

let disciplineWindowStartMs = 0;
let disciplineWins = 0;
let disciplineLosses = 0;
let disciplineLockUntilMs = 0;

/* =========================
   DOM helpers
========================= */
const $ = (id) => document.getElementById(id);
const qsAll = (sel) => Array.from(document.querySelectorAll(sel));

function pickEl(...ids) {
  for (const id of ids) {
    const el = $(id);
    if (el) return el;
  }
  return null;
}

const statusEl = $("status");
const signalsEl = $("signals");
const counterEl = $("counter");
const hitCounterEl = $("hitCounter");
const feedbackEl = $("feedback");
const tickHealthEl = $("tickHealth");
const countdownEl = $("countdown");
const sound = $("alertSound");

const soundBtn = $("soundBtn");
const vibrateBtn = $("vibrateBtn");
const wakeBtn = $("wakeBtn");
const themeBtn = $("themeBtn");
const clearHistoryBtn = $("clearHistoryBtn");
const copyBtn = $("copyFeedback");

const evalBtns = qsAll(".evalBtn");
const modeBtn = $("modeBtn");

// Tabs
const tabs = qsAll(".tab[data-view]");
const signalsView = $("signalsView");
const feedbackView = $("feedbackView");

// Settings modal
const configBtn = $("configBtn");
const settingsModal = $("settingsModal");
const settingsCloseBackdrop = $("settingsCloseBackdrop");
const settingsCloseBtn = $("settingsCloseBtn");
const settingsCloseBtn2 = $("settingsCloseBtn2");

// Chart modal
const chartModal = $("chartModal");
const modalCloseBtn = $("modalCloseBtn");
const modalCloseBackdrop = $("modalCloseBackdrop");
const modalTitle = $("modalTitle");
const modalSub = $("modalSub");
const minuteCanvas = $("minuteCanvas");
const modalOpenDerivBtn = $("modalOpenDerivBtn");

// Si existen en tu build:
const modalBuyCallBtn = pickEl("modalBuyCallBtn");
const modalBuyPutBtn = pickEl("modalBuyPutBtn");
const modalLiveBtn = pickEl("modalLiveBtn");

/* =========================
   Toast / feedback corto
========================= */
let toastTimer = null;
function toast(msg, ms = 1600) {
  try {
    if (!statusEl) return;
    const prev = statusEl.textContent || "";
    statusEl.textContent = msg;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      if (statusEl.textContent === msg) statusEl.textContent = prev;
    }, ms);
  } catch {}
}

/* =========================
   Debug visible
========================= */
(function initVisibleDebug() {
  const show = (msg) => {
    try {
      if (statusEl) statusEl.textContent = msg;
    } catch {}
  };

  window.addEventListener("error", (e) => {
    const m = e?.message || "Error";
    const src = e?.filename ? ` @ ${String(e.filename).split("/").slice(-1)[0]}:${e.lineno || 0}` : "";
    show(`❌ JS: ${m}${src}`);
  });

  window.addEventListener("unhandledrejection", (e) => {
    const r = e?.reason;
    const m = (r && (r.message || String(r))) || "Promise rejection";
    show(`❌ Promise: ${m}`);
  });
})();

/* =========================
   🧹 Reset SW/Cache
========================= */
async function resetServiceWorkerAndCaches() {
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister().catch(() => {})));
    }
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k).catch(() => {})));
    }
    try {
      sessionStorage.clear();
    } catch {}
    toast("🧹 Cache/SW reseteado ✓", 1400);
    setTimeout(() => location.reload(true), 300);
  } catch {
    toast("⚠️ Reset falló (recargo igual)", 1600);
    setTimeout(() => location.reload(true), 300);
  }
}

function ensureResetCacheButton() {
  let btn = pickEl("resetCacheBtn");
  if (btn) {
    btn.onclick = resetServiceWorkerAndCaches;
    return btn;
  }

  const host =
    document.querySelector("#settingsModal .settingsBody .controls") ||
    document.querySelector(".settingsBody .controls") ||
    null;

  if (!host) return null;

  btn = document.createElement("button");
  btn.id = "resetCacheBtn";
  btn.type = "button";
  btn.className = "btn btnGhost";
  btn.textContent = "🧹 Reset Cache/SW";
  btn.title = "Borra caches + desregistra Service Worker y recarga";
  btn.onclick = resetServiceWorkerAndCaches;

  host.appendChild(btn);
  return btn;
}

/* =========================
   State
========================= */
let ws;

let soundEnabled = false;
let vibrateEnabled = true;

let EVAL_SEC = 45;
let strongMode = false;

let history = loadHistory();

let minuteData = {};
let lastEvaluatedMinute = null;
let evalRetryTimer = null;

// Tiempo/ticks
let lastTickEpochMs = null;
let lastTickLocalNowMs = null;
let serverOffsetMs = 0; // epochMs - localNowMs
let currentMinuteStartMs = null;

// min/candles
let lastSeenMinute = null;
let candleOC = {};

let lastQuoteBySymbol = {};
let lastMinuteSeenBySymbol = {};

// modal chart
let modalCurrentItem = null;

// LIVE modal draw
let modalLive = false;
let modalDrawRaf = null;
let modalLastDrawAt = 0;
const MODAL_DRAW_MIN_INTERVAL_MS = 120;

/* =========================
   Assets
========================= */
const CHART_ICON_SVG = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
<path d="M4 18V6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
<path d="M4 18H20" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
<path d="M6 14l4-4 3 3 5-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
<circle cx="10" cy="10" r="1" fill="currentColor"/><circle cx="13" cy="13" r="1" fill="currentColor"/><circle cx="18" cy="6" r="1" fill="currentColor"/>
</svg>`;

/* =========================
   URL helpers
========================= */
function makeDerivTraderUrl(symbol) {
  const u = new URL(DERIV_DTRADER_TEMPLATE);
  u.searchParams.set("symbol", symbol);
  return u.toString();
}
const labelDir = (d) => (d === "CALL" ? "COMPRA" : "VENTA");

/* =========================
   Auto-open chart (persistente + UI)
========================= */
function loadAutoOpenChartSetting() {
  try {
    autoOpenChartOnSignal = localStorage.getItem(AUTOOPEN_CHART_KEY) === "1";
  } catch {
    autoOpenChartOnSignal = false;
  }
}
function saveAutoOpenChartSetting() {
  try {
    localStorage.setItem(AUTOOPEN_CHART_KEY, autoOpenChartOnSignal ? "1" : "0");
  } catch {}
}
function applyAutoOpenChartUI() {
  const btn = pickEl("autoOpenChartBtn");
  if (!btn) return;
  btn.textContent = autoOpenChartOnSignal ? "📈 Auto-abrir gráfico ON" : "📈 Auto-abrir gráfico OFF";
  btn.classList.toggle("active", autoOpenChartOnSignal);
  btn.title = autoOpenChartOnSignal
    ? "Al salir una señal, abre el gráfico automáticamente (solo si la app está en pantalla)"
    : "No abre el gráfico automáticamente";
}
function ensureAutoOpenChartButton() {
  let btn = pickEl("autoOpenChartBtn");
  if (!btn) {
    const host =
      document.querySelector("#settingsModal .settingsBody .controls") ||
      document.querySelector(".settingsBody .controls") ||
      null;
    if (!host) return null;

    btn = document.createElement("button");
    btn.id = "autoOpenChartBtn";
    btn.type = "button";
    btn.className = "btn btnGhost";
    host.appendChild(btn);
  }

  btn.onclick = () => {
    autoOpenChartOnSignal = !autoOpenChartOnSignal;
    saveAutoOpenChartSetting();
    applyAutoOpenChartUI();
    toast(autoOpenChartOnSignal ? "📈 Auto-abrir gráfico ON" : "📈 Auto-abrir gráfico OFF");
  };

  applyAutoOpenChartUI();
  return btn;
}

function shouldAutoOpenChartNow() {
  if (!autoOpenChartOnSignal) return false;
  if (document.visibilityState !== "visible") return false;
  if (chartModal && !chartModal.classList.contains("hidden")) return false;
  if (settingsModal && !settingsModal.classList.contains("hidden")) return false;

  const activeView = localStorage.getItem("activeView") || "signals";
  if (activeView === "feedback") return false;

  return true;
}

/* =========================
   🪫 Low power mode (persistente)
========================= */
let lowPowerMode = false;
const LOWPOWER_KEY = "lowPowerMode_v1";

const UI_INTERVAL_NORMAL_MS = 500;
const UI_INTERVAL_LOW_MS = 1200;

const HISTORY_COUNT_MAX_NORMAL = 5000;
const HISTORY_COUNT_MAX_LOW = 1200;

let uiTimer = null;

function loadLowPowerMode() {
  try {
    lowPowerMode = localStorage.getItem(LOWPOWER_KEY) === "1";
  } catch {
    lowPowerMode = false;
  }
}
function saveLowPowerMode() {
  try {
    localStorage.setItem(LOWPOWER_KEY, lowPowerMode ? "1" : "0");
  } catch {}
}
function getUiIntervalMs() {
  return lowPowerMode ? UI_INTERVAL_LOW_MS : UI_INTERVAL_NORMAL_MS;
}
function getHistoryCountMax() {
  return lowPowerMode ? HISTORY_COUNT_MAX_LOW : HISTORY_COUNT_MAX_NORMAL;
}
function startUiTimers() {
  if (uiTimer) clearInterval(uiTimer);
  uiTimer = setInterval(() => {
    updateTickHealthUI();
    updateCountdownUI();
    updateDisciplineLockUI(false);
  }, getUiIntervalMs());
}

function ensureLowPowerButton() {
  let btn = pickEl("lowPowerBtn");
  if (!btn) {
    const host =
      document.querySelector("#settingsModal .settingsBody .controls") ||
      document.querySelector(".settingsBody .controls") ||
      null;
    if (!host) return null;

    btn = document.createElement("button");
    btn.id = "lowPowerBtn";
    btn.type = "button";
    btn.className = "btn btnGhost";
    btn.textContent = "🪫 Bajo consumo OFF";
    host.appendChild(btn);
  }

  btn.onclick = () => {
    lowPowerMode = !lowPowerMode;
    saveLowPowerMode();
    applyLowPowerModeUI();
    toast(lowPowerMode ? "🪫 Bajo consumo ON" : "🔋 Bajo consumo OFF");
    try {
      if (lowPowerMode && ws && ws.readyState === 1 && document.visibilityState !== "visible") ws.close();
    } catch {}
  };

  return btn;
}

function applyLowPowerModeUI() {
  const btn = pickEl("lowPowerBtn");
  if (btn) {
    btn.textContent = lowPowerMode ? "🪫 Bajo consumo ON" : "🔋 Bajo consumo OFF";
    btn.classList.toggle("active", lowPowerMode);
    btn.title = lowPowerMode
      ? "Ahorra batería: UI más lenta, histórico más liviano, WS se corta en background"
      : "Modo normal";
  }
  startUiTimers();
}

/* =========================
   Wake Lock (Pantalla activa)
========================= */
let wakeLock = null;

async function acquireWakeLock() {
  if (!("wakeLock" in navigator)) throw new Error("Wake Lock no soportado");
  wakeLock = await navigator.wakeLock.request("screen");
  wakeLock.addEventListener("release", () => {
    setWakeBtnUI(false);
    wakeLock = null;
  });
  setWakeBtnUI(true);
  return true;
}

async function releaseWakeLock() {
  try {
    if (wakeLock) await wakeLock.release();
  } catch {}
  wakeLock = null;
  setWakeBtnUI(false);
}

function setWakeBtnUI(active) {
  if (!wakeBtn) return;
  wakeBtn.classList.toggle("active", !!active);
  wakeBtn.textContent = active ? "🔒 Pantalla activa ON" : "🔓 Pantalla activa";
}

function initWakeButton() {
  if (!wakeBtn) return;
  setWakeBtnUI(!!wakeLock);

  wakeBtn.onclick = async () => {
    try {
      if (wakeLock) {
        await releaseWakeLock();
        toast("🔓 Pantalla activa OFF");
        return;
      }
      await acquireWakeLock();
      toast("🔒 Pantalla activa ON");
    } catch {
      toast("⚠️ No se pudo activar pantalla");
      alert(
        "No pude activar Pantalla activa.\n\nTip: en algunos Android solo funciona si la app está en primer plano y con interacción reciente."
      );
    }
  };

  document.addEventListener("visibilitychange", async () => {
    try {
      if (document.visibilityState === "visible" && wakeBtn.classList.contains("active") && !wakeLock) {
        await acquireWakeLock();
      }
    } catch {}
  });
}

/* =========================
   Persistencia
========================= */
function loadHistory() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}
function saveHistory(arr) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(arr.slice(-MAX_HISTORY)));
  } catch {}
}

/* =========================
   Helpers UI
========================= */
function setBtnActive(btn, active) {
  btn && btn.classList.toggle("active", !!active);
}
function loadBool(key, fallback) {
  const v = localStorage.getItem(key);
  return v === null ? fallback : v === "1";
}
function saveBool(key, value) {
  localStorage.setItem(key, value ? "1" : "0");
}

function isHit(item) {
  if (!item || !item.nextOutcome) return false;
  return (
    (item.direction === "CALL" && item.nextOutcome === "up") ||
    (item.direction === "PUT" && item.nextOutcome === "down")
  );
}
function computeHitsCount() {
  let hits = 0;
  for (const it of history) if (isHit(it)) hits++;
  return hits;
}
function updateCounter() {
  if (counterEl) counterEl.textContent = `Señales: ${history.length}`;
  if (hitCounterEl) hitCounterEl.textContent = `✅ Aciertos: ${computeHitsCount()}`;
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
function cssEscape(s) {
  return String(s).replace(/"/g, '\\"');
}

/* =========================
   NEXT helpers
========================= */
function nextOutcomeToArrow(outcome) {
  if (outcome === "up") return "⬆️";
  if (outcome === "down") return "⬇️";
  if (outcome === "flat") return "➖";
  return "⏳";
}
function nextOutcomeToText(outcome) {
  if (outcome === "up") return "ALCISTA";
  if (outcome === "down") return "BAJISTA";
  if (outcome === "flat") return "PLANA";
  return "PENDIENTE";
}
function rebuildFeedbackFromHistory() {
  if (!feedbackEl) return;
  let text = "";
  for (const it of history) {
    const vote = it.vote || "";
    const comment = it.comment || "";
    if (!vote && !comment) continue;

    const modeLabel = it.mode || "NORMAL";
    const out = it.nextOutcome || "";
    const outArrow = nextOutcomeToArrow(out);
    const outText = nextOutcomeToText(out);

    text += `${it.time} | ${it.symbol} | ${labelDir(it.direction)} | [${modeLabel}] | ${vote} | NEXT: ${outArrow} ${outText} | ${comment}\n`;
  }
  feedbackEl.value = text;
}

/* =========================
   Tabs
========================= */
function setActiveView(name) {
  const isSignals = name === "signals";
  if (signalsView) signalsView.classList.toggle("hidden", !isSignals);
  if (feedbackView) feedbackView.classList.toggle("hidden", isSignals);

  tabs.forEach((t) => {
    const active = t.dataset.view === name;
    t.classList.toggle("active", active);
    t.setAttribute("aria-selected", active ? "true" : "false");
  });

  localStorage.setItem("activeView", name);
}
(function initTabs() {
  const saved = localStorage.getItem("activeView") || "signals";
  setActiveView(saved === "feedback" ? "feedback" : "signals");
  tabs.forEach((t) => (t.onclick = () => setActiveView(t.dataset.view)));
})();

/* =========================
   Settings modal
========================= */
function openSettings() {
  if (!settingsModal) return;
  settingsModal.classList.remove("hidden");
  settingsModal.setAttribute("aria-hidden", "false");
  if (configBtn) {
    configBtn.classList.add("spin");
    setTimeout(() => configBtn.classList.remove("spin"), 180);
  }
}
function closeSettings() {
  if (!settingsModal) return;
  settingsModal.classList.add("hidden");
  settingsModal.setAttribute("aria-hidden", "true");
}
if (configBtn) configBtn.onclick = openSettings;
if (settingsCloseBtn) settingsCloseBtn.onclick = closeSettings;
if (settingsCloseBtn2) settingsCloseBtn2.onclick = closeSettings;
if (settingsCloseBackdrop) settingsCloseBackdrop.onclick = closeSettings;

/* =========================
   Notifications
========================= */
if ("Notification" in window && Notification.permission === "default") {
  Notification.requestPermission().catch(() => {});
}
function showNotification(symbol, direction, modeLabel) {
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  navigator.serviceWorker.getRegistration().then((reg) => {
    if (!reg) return;
    reg.showNotification("📈 Deriv Signal", {
      body: `${symbol} – ${labelDir(direction)} – [${modeLabel || "NORMAL"}]`,
      icon: "icon-192.png",
      badge: "icon-192.png",
      tag: "deriv-signal",
      renotify: true,
      requireInteraction: true,
      silent: false,
      vibrate: vibrateEnabled ? [200, 100, 200] : undefined,
      data: { url: makeDerivTraderUrl(symbol), symbol, direction },
    });
  });
}

/* =========================
   Canvas chart
========================= */
function drawDerivLikeChart(canvas, ticks) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const cssW = canvas.clientWidth || 1;
  const cssH = canvas.clientHeight || 1;
  const dpr = window.devicePixelRatio || 1;

  canvas.width = Math.floor(cssW * dpr);
  canvas.height = Math.floor(cssH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const w = cssW;
  const h = cssH;

  ctx.clearRect(0, 0, w, h);
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  ctx.fillRect(0, 0, w, h);
  ctx.globalAlpha = 1;

  if (!ticks || ticks.length < 2) return;

  const pts = [...ticks].sort((a, b) => a.ms - b.ms);

  const quotes = pts.map((p) => p.quote);
  let min = Math.min(...quotes);
  let max = Math.max(...quotes);
  let range = max - min;
  if (range < 1e-9) range = 1e-9;
  const pad = range * 0.08;
  min -= pad;
  max += pad;

  const xOf = (ms) => (ms / 60000) * (w - 20) + 10;
  const yOf = (q) => (1 - (q - min) / (max - min)) * (h - 30) + 10;

  ctx.globalAlpha = 0.22;
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.lineWidth = 1;
  for (let i = 1; i <= 4; i++) {
    const y = (h / 5) * i;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  const x30 = xOf(30000);
  ctx.globalAlpha = 0.55;
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x30, 10);
  ctx.lineTo(x30, h - 20);
  ctx.stroke();
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.font = "12px system-ui, sans-serif";
  ctx.fillText("30s", Math.min(w - 28, x30 + 6), 22);
  ctx.globalAlpha = 1;

  ctx.beginPath();
  ctx.moveTo(xOf(pts[0].ms), h - 20);
  for (const p of pts) ctx.lineTo(xOf(p.ms), yOf(p.quote));
  ctx.lineTo(xOf(pts[pts.length - 1].ms), h - 20);
  ctx.closePath();
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.strokeStyle = "rgba(255,255,255,0.95)";
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  pts.forEach((p, i) => {
    const x = xOf(p.ms);
    const y = yOf(p.quote);
    if (!i) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  const lx = xOf(pts[pts.length - 1].ms);
  const ly = yOf(pts[pts.length - 1].quote);
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.beginPath();
  ctx.arc(lx, ly, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

/* =========================
   Tiempo server synced
========================= */
function serverNowMs() {
  return Date.now() + (serverOffsetMs || 0);
}
function currentServerMinute() {
  return Math.floor(serverNowMs() / 60000);
}
function isItemLiveMinute(item) {
  if (!item) return false;
  return item.minute === currentServerMinute();
}

/* =========================
   LIVE modal draw
========================= */
function updateModalLiveUI() {
  if (!modalLiveBtn) return;
  modalLiveBtn.setAttribute("aria-pressed", modalLive ? "true" : "false");
  modalLiveBtn.textContent = modalLive ? "📡 LIVE ON" : "📡 LIVE OFF";
}

/* ✅✅ FIX CRASH: RAF safe + ticks safe */
function requestModalDraw(force = false) {
  if (!chartModal || chartModal.classList.contains("hidden")) return;
  if (!modalCurrentItem) return;

  const now = Date.now();
  if (!force && now - modalLastDrawAt < MODAL_DRAW_MIN_INTERVAL_MS) return;
  modalLastDrawAt = now;

  if (modalDrawRaf) cancelAnimationFrame(modalDrawRaf);
  modalDrawRaf = requestAnimationFrame(() => {
    // Entre que pedimos RAF y corre, el modal puede haberse cerrado
    const it = modalCurrentItem;
    if (!it) return;

    let ticks = Array.isArray(it.ticks) ? it.ticks : [];
    if (modalLive && isItemLiveMinute(it)) {
      const liveTicks = minuteData?.[it.minute]?.[it.symbol];
      if (Array.isArray(liveTicks) && liveTicks.length) ticks = liveTicks;
    }

    drawDerivLikeChart(minuteCanvas, ticks);

    if (modalSub) {
      const n = Array.isArray(ticks) ? ticks.length : 0;
      const tagLive = modalLive && isItemLiveMinute(it) ? " | LIVE" : "";
      const dTag = disciplineTagText();
      modalSub.textContent = `${it.time} | ticks: ${n}${tagLive}${dTag ? " | " + dTag : ""}`;
    }
  });
}

/* =========================
   FIX: Layout de botones COMPRAR/VENDER (modal)
========================= */
function applyModalTradeButtonsLayout() {
  const bCall = modalBuyCallBtn;
  const bPut = modalBuyPutBtn;
  if (!bCall || !bPut) return;

  const footer =
    document.querySelector("#chartModal .modalFooter") ||
    (chartModal ? chartModal.querySelector(".modalFooter") : null);

  if (!footer) return;

  let row = footer.querySelector(".tradeRow");
  if (!row) {
    row = document.createElement("div");
    row.className = "tradeRow";
    footer.prepend(row);
  }

  row.style.display = "flex";
  row.style.gap = "14px";
  row.style.alignItems = "stretch";
  row.style.justifyContent = "space-between";
  row.style.width = "100%";
  row.style.flexWrap = "nowrap";

  if (bCall.parentElement !== row) row.appendChild(bCall);
  if (bPut.parentElement !== row) row.appendChild(bPut);

  const baseBtn = (b) => {
    b.style.flex = "1 1 0";
    b.style.minWidth = "0";
    b.style.minHeight = "58px";
    b.style.padding = "14px 16px";
    b.style.fontWeight = "850";
    b.style.letterSpacing = "0.4px";
    b.style.borderRadius = "16px";
    b.style.display = "flex";
    b.style.alignItems = "center";
    b.style.justifyContent = "center";
    b.style.gap = "10px";
  };
  baseBtn(bCall);
  baseBtn(bPut);

  bCall.style.borderColor = "rgba(34,197,94,.85)";
  bCall.style.boxShadow = "0 0 20px rgba(34,197,94,.22)";
  bCall.style.background = "rgba(34,197,94,.18)";
  bCall.style.color = "var(--text, #e5e7eb)";

  bPut.style.borderColor = "rgba(239,68,68,.85)";
  bPut.style.boxShadow = "0 0 20px rgba(239,68,68,.20)";
  bPut.style.background = "rgba(239,68,68,.16)";
  bPut.style.color = "var(--text, #e5e7eb)";

  const w = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
  if (w < 380) {
    row.style.flexWrap = "wrap";
    bCall.style.flex = "1 1 100%";
    bPut.style.flex = "1 1 100%";
  }

  if (modalLiveBtn) {
    modalLiveBtn.style.minHeight = "52px";
    modalLiveBtn.style.width = "100%";
    modalLiveBtn.style.marginTop = "10px";
  }
}

/* =========================
   Disciplina (lock) - persistencia + UI
========================= */
function loadDiscipline() {
  try {
    disciplineWindowStartMs = Number(localStorage.getItem(DISCIPLINE_WINDOW_START_KEY) || "0") || 0;
    disciplineWins = Number(localStorage.getItem(DISCIPLINE_WINS_KEY) || "0") || 0;
    disciplineLosses = Number(localStorage.getItem(DISCIPLINE_LOSSES_KEY) || "0") || 0;
    disciplineLockUntilMs = Number(localStorage.getItem(DISCIPLINE_LOCK_UNTIL_KEY) || "0") || 0;
  } catch {
    disciplineWindowStartMs = 0;
    disciplineWins = 0;
    disciplineLosses = 0;
    disciplineLockUntilMs = 0;
  }
}
function saveDiscipline() {
  try {
    localStorage.setItem(DISCIPLINE_WINDOW_START_KEY, String(disciplineWindowStartMs || 0));
    localStorage.setItem(DISCIPLINE_WINS_KEY, String(disciplineWins || 0));
    localStorage.setItem(DISCIPLINE_LOSSES_KEY, String(disciplineLosses || 0));
    localStorage.setItem(DISCIPLINE_LOCK_UNTIL_KEY, String(disciplineLockUntilMs || 0));
  } catch {}
}
function isTradeLockedNow() {
  const now = Date.now();
  return typeof disciplineLockUntilMs === "number" && disciplineLockUntilMs > now;
}
function fmtRemaining(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const mm = m % 60;
  if (h > 0) return `${h}h ${mm}m`;
  return `${mm}m`;
}
function disciplineTagText() {
  if (disciplineLockUntilMs && Date.now() >= disciplineLockUntilMs) {
    disciplineLockUntilMs = 0;
    disciplineWindowStartMs = 0;
    disciplineWins = 0;
    disciplineLosses = 0;
    saveDiscipline();
  }

  if (isTradeLockedNow()) {
    const remain = disciplineLockUntilMs - Date.now();
    return `🔒 BLOQUEADO ${fmtRemaining(remain)} (${disciplineWins}W/${disciplineLosses}L)`;
  }
  return `Disciplina: ${disciplineWins}/${DISCIPLINE_MAX_WINS}W • ${disciplineLosses}/${DISCIPLINE_MAX_LOSSES}L`;
}

function paintTradeButtonLocked(btn, locked, remainMs = 0) {
  if (!btn) return;

  if (!btn.dataset.baseLabel) btn.dataset.baseLabel = btn.textContent || "";

  if (locked) {
    btn.disabled = true;
    btn.textContent = `🔒 ${btn.dataset.baseLabel.replace(/^🔒\s*/g, "")}`;
    btn.style.filter = "grayscale(1) saturate(0.7)";
    btn.style.opacity = "0.48";
    btn.style.transform = "none";
    btn.title = `Bloqueado por disciplina. Falta ${fmtRemaining(remainMs)}`;
  } else {
    btn.disabled = false;
    btn.textContent = btn.dataset.baseLabel.replace(/^🔒\s*/g, "");
    btn.style.filter = "";
    btn.style.opacity = "";
    btn.title = "Operar DEMO 1m";
  }
}

function updateDisciplineLockUI(forceToast = false) {
  if (disciplineLockUntilMs && Date.now() >= disciplineLockUntilMs) {
    disciplineLockUntilMs = 0;
    disciplineWindowStartMs = 0;
    disciplineWins = 0;
    disciplineLosses = 0;
    saveDiscipline();
    if (forceToast) toast("✅ Bloqueo terminado. Contadores reseteados.", 1800);
  }

  const locked = isTradeLockedNow();
  const remain = locked ? disciplineLockUntilMs - Date.now() : 0;

  paintTradeButtonLocked(modalBuyCallBtn, locked, remain);
  paintTradeButtonLocked(modalBuyPutBtn, locked, remain);

  if (chartModal && !chartModal.classList.contains("hidden")) {
    requestModalDraw(true);
  }

  if (forceToast) toast(disciplineTagText(), 2200);
}

function startNewDisciplineWindowIfNeeded() {
  updateDisciplineLockUI(false);

  const now = Date.now();
  if (!disciplineWindowStartMs) {
    disciplineWindowStartMs = now;
    disciplineWins = 0;
    disciplineLosses = 0;
    saveDiscipline();
  }
}

function applyDisciplineOutcome(isWin) {
  updateDisciplineLockUI(false);
  if (isTradeLockedNow()) return;

  if (isWin) disciplineWins += 1;
  else disciplineLosses += 1;

  saveDiscipline();

  if (disciplineWins >= DISCIPLINE_MAX_WINS || disciplineLosses >= DISCIPLINE_MAX_LOSSES) {
    disciplineLockUntilMs = Date.now() + DISCIPLINE_LOCK_MS;
    saveDiscipline();
    updateDisciplineLockUI(true);
    return;
  }

  toast(
    `✅ Disciplina: ${disciplineWins}/${DISCIPLINE_MAX_WINS} ITM • ${disciplineLosses}/${DISCIPLINE_MAX_LOSSES} OTM`,
    1700
  );
  updateDisciplineLockUI(false);
}

/* =========================
   Chart modal
========================= */
function openChartModal(item) {
  modalCurrentItem = item;
  if (!chartModal || !modalTitle || !modalSub) return;

  modalTitle.textContent = `${item.symbol} – ${labelDir(item.direction)} | [${item.mode || "NORMAL"}]`;

  modalLive = isItemLiveMinute(item);
  updateModalLiveUI();

  chartModal.classList.remove("hidden");
  chartModal.setAttribute("aria-hidden", "false");

  applyModalTradeButtonsLayout();
  updateDisciplineLockUI(false);

  requestModalDraw(true);
}

function closeChartModal() {
  if (!chartModal) return;
  chartModal.classList.add("hidden");
  chartModal.setAttribute("aria-hidden", "true");
  modalCurrentItem = null;
  modalLive = false;
  updateModalLiveUI();
}

if (modalCloseBtn) modalCloseBtn.onclick = closeChartModal;
if (modalCloseBackdrop) modalCloseBackdrop.onclick = closeChartModal;

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeChartModal();
    closeSettings();
  }
});

if (modalOpenDerivBtn)
  modalOpenDerivBtn.onclick = () => {
    if (modalCurrentItem) window.location.href = makeDerivTraderUrl(modalCurrentItem.symbol);
  };

window.addEventListener("resize", () => {
  if (!chartModal || chartModal.classList.contains("hidden")) return;
  applyModalTradeButtonsLayout();
  requestModalDraw(true);
});

if (modalLiveBtn) {
  modalLiveBtn.onclick = () => {
    if (!modalCurrentItem) return;
    if (!isItemLiveMinute(modalCurrentItem)) {
      modalLive = false;
      updateModalLiveUI();
      requestModalDraw(true);
      return;
    }
    modalLive = !modalLive;
    updateModalLiveUI();
    requestModalDraw(true);
  };
}

/* =========================
   Row helpers
========================= */
function updateRowChartBtn(item) {
  const row = document.querySelector(`.row[data-id="${cssEscape(item.id)}"]`);
  if (!row) return;
  const btn = row.querySelector(".chartBtn");
  if (!btn) return;

  const liveEligible = isItemLiveMinute(item);
  const ready = !!item.minuteComplete || liveEligible;

  btn.disabled = !ready;
  btn.classList.toggle("locked", !ready);

  if (ready) {
    btn.innerHTML = CHART_ICON_SVG;
    btn.title = liveEligible ? "Ver gráfico en vivo (ticks reales)" : "Ver gráfico del minuto (ticks 0–60)";
  } else {
    btn.innerHTML = `<span class="lockBadge" aria-hidden="true">🔒</span>`;
    btn.title = "Esperando cierre del minuto…";
  }
}

function updateRowHitIcon(item) {
  const row = document.querySelector(`.row[data-id="${cssEscape(item.id)}"]`);
  if (!row) return false;
  const hit = row.querySelector(".hitIcon");
  if (!hit) return false;
  const show = isHit(item);
  hit.classList.toggle("hidden", !show);
  hit.title = show ? "Acertó" : "";
  return show;
}

function updateRowNextArrow(item) {
  const row = document.querySelector(`.row[data-id="${cssEscape(item.id)}"]`);
  if (!row) return;
  const el = row.querySelector(".nextArrow");
  if (!el) return;

  if (item.nextOutcome === "up") {
    el.textContent = "⬆️";
    el.className = "nextArrow up";
    el.title = "Próxima vela: alcista";
  } else if (item.nextOutcome === "down") {
    el.textContent = "⬇️";
    el.className = "nextArrow down";
    el.title = "Próxima vela: bajista";
  } else if (item.nextOutcome === "flat") {
    el.textContent = "➖";
    el.className = "nextArrow flat";
    el.title = "Próxima vela: plana";
  } else {
    el.textContent = "⏳";
    el.className = "nextArrow pending";
    el.title = "Próxima vela: esperando…";
  }
}

function setNextOutcome(item, outcome) {
  item.nextOutcome = outcome;
  saveHistory(history);
  updateRowNextArrow(item);
  updateRowHitIcon(item);
  updateCounter();
  rebuildFeedbackFromHistory();
}

/* =========================
   Build row
========================= */
function buildRow(item) {
  const row = document.createElement("div");
  row.className = "row " + (item.direction === "CALL" ? "dir-call" : "dir-put");
  if (item.vote) row.classList.add("voted");
  row.dataset.id = item.id;

  const derivUrl = makeDerivTraderUrl(item.symbol);
  const modeLabel = item.mode || "NORMAL";

  row.innerHTML = `
    <div class="row-main">
      <span class="row-text">${item.time} | ${item.symbol} | ${labelDir(item.direction)} | [${modeLabel}]</span>
      <button class="chartBtn" type="button"></button>
      <span class="hitIcon hidden" aria-label="Acertó">✓</span>
      <span class="nextArrow pending" title="Próxima vela: esperando…">⏳</span>
    </div>
    <div class="row-actions">
      <button class="voteBtn" data-v="like" type="button" ${item.vote ? "disabled" : ""}>👍</button>
      <button class="voteBtn" data-v="dislike" type="button" ${item.vote ? "disabled" : ""}>👎</button>
      <input class="row-comment" placeholder="comentario" value="${escapeHtml(item.comment || "")}">
    </div>
  `;

  row.querySelector(".row-text").onclick = () => {
    window.location.href = derivUrl;
  };

  const chartBtn = row.querySelector(".chartBtn");
  chartBtn.onclick = (e) => {
    e.stopPropagation();
    const canOpen = item.minuteComplete || isItemLiveMinute(item);
    if (canOpen) openChartModal(item);
  };
  updateRowChartBtn(item);
  updateRowHitIcon(item);
  updateRowNextArrow(item);

  row.querySelectorAll("button[data-v]").forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation();
      if (item.vote) return;

      item.vote = btn.dataset.v;
      item.comment = row.querySelector(".row-comment").value || "";

      row.classList.add("voted");
      btn.classList.add("selected");

      saveHistory(history);
      rebuildFeedbackFromHistory();

      row.querySelectorAll("button[data-v]").forEach((b) => (b.disabled = true));
    };
  });

  const input = row.querySelector(".row-comment");
  input.addEventListener("blur", () => {
    item.comment = input.value || "";
    saveHistory(history);
    rebuildFeedbackFromHistory();
  });

  return row;
}

/* =========================
   Render
========================= */
function renderHistory() {
  if (!signalsEl) return;
  signalsEl.innerHTML = "";

  for (const it of history) if (!it.mode) it.mode = "NORMAL";
  saveHistory(history);

  updateCounter();
  rebuildFeedbackFromHistory();

  for (const it of [...history].reverse()) signalsEl.appendChild(buildRow(it));
}

/* =========================
   Tick health + Countdown
========================= */
function updateTickHealthUI() {
  if (!tickHealthEl) return;

  const base =
    (typeof lastTickLocalNowMs === "number" && lastTickLocalNowMs) ||
    (typeof lastTickEpochMs === "number" && lastTickEpochMs) ||
    null;

  if (!base) {
    tickHealthEl.textContent = "Último tick: —";
    return;
  }

  const ageSec = Math.max(0, Math.floor((Date.now() - base) / 1000));
  tickHealthEl.textContent = `Último tick: hace ${ageSec}s`;
}

function updateCountdownUI() {
  if (!countdownEl) return;

  const textEl = document.getElementById("countdownText") || countdownEl;

  if (!currentMinuteStartMs) {
    if (textEl) textEl.textContent = "⏱️ 60";
    countdownEl.classList.remove("urgent", "warn", "tick");
    return;
  }

  const now = serverNowMs();
  const msInMinute = (now - currentMinuteStartMs) % 60000;

  const remaining = 60 - Math.max(0, Math.min(59, Math.floor(msInMinute / 1000)));
  const v = String(remaining).padStart(2, "0");
  if (textEl) textEl.textContent = `⏱️ ${v}`;

  const urgent = remaining <= 5;
  const warn = !urgent && remaining <= 15;

  countdownEl.classList.toggle("urgent", urgent);
  countdownEl.classList.toggle("warn", warn);

  countdownEl.classList.remove("tick");
  void countdownEl.offsetWidth;
  countdownEl.classList.add("tick");
}

/* =========================
   WS requests (req_id) + timeout configurable
========================= */
let reqSeq = 1;
const pending = new Map();

function wsRequest(payload, timeoutMs = HISTORY_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    if (!ws || ws.readyState !== 1) return reject(new Error("WS not open"));

    const req_id = reqSeq++;
    const t = setTimeout(() => {
      pending.delete(req_id);
      reject(new Error("timeout"));
    }, timeoutMs);

    pending.set(req_id, { resolve, reject, t });
    ws.send(JSON.stringify({ ...payload, req_id }));
  });
}

/* =========================
   DEMO 1-click trade + tracking outcome
========================= */
function getDerivToken() {
  try {
    return localStorage.getItem(DERIV_TOKEN_KEY) || "";
  } catch {
    return "";
  }
}
function setDerivToken(t) {
  try {
    localStorage.setItem(DERIV_TOKEN_KEY, t || "");
  } catch {}
}
function clearDerivToken() {
  try {
    localStorage.removeItem(DERIV_TOKEN_KEY);
  } catch {}
}

function getTradeStake() {
  const raw = localStorage.getItem(TRADE_STAKE_KEY);
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_STAKE;
}
function setTradeStake(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return false;
  try {
    localStorage.setItem(TRADE_STAKE_KEY, String(v));
    return true;
  } catch {
    return false;
  }
}
function clearTradeStake() {
  try {
    localStorage.removeItem(TRADE_STAKE_KEY);
  } catch {}
}

let isAuthorized = false;
let authorizeInFlight = null;
let tradeInFlight = false;

function resetAuthState() {
  isAuthorized = false;
  authorizeInFlight = null;
  tradeInFlight = false;
}

/** Subscriptions de contratos abiertos */
const contractSubs = new Map(); // contract_id -> subscription_id

function subscribeContractOutcome(contractId) {
  try {
    if (!ws || ws.readyState !== 1) return;
    if (!contractId) return;
    const cid = String(contractId);
    if (contractSubs.has(cid)) return;

    ws.send(
      JSON.stringify({
        proposal_open_contract: 1,
        contract_id: cid,
        subscribe: 1,
      })
    );
    contractSubs.set(cid, "__pending__");
  } catch {}
}

function forgetSubscription(subId) {
  try {
    if (!ws || ws.readyState !== 1) return;
    if (!subId || subId === "__pending__") return;
    ws.send(JSON.stringify({ forget: subId }));
  } catch {}
}

async function ensureAuthorized() {
  const token = getDerivToken();
  if (!token) throw new Error("Sin token DEMO (cargalo en Configuración)");

  if (isAuthorized) return true;
  if (authorizeInFlight) return authorizeInFlight;

  authorizeInFlight = wsRequest({ authorize: token }, 15000)
    .then((res) => {
      if (res?.error) throw new Error(res.error.message || "authorize error");
      isAuthorized = true;
      return true;
    })
    .finally(() => {
      authorizeInFlight = null;
    });

  return authorizeInFlight;
}

function assertCanTrade() {
  updateDisciplineLockUI(false);
  if (isTradeLockedNow()) {
    const remain = disciplineLockUntilMs - Date.now();
    throw new Error(`Bloqueado por disciplina (${fmtRemaining(remain)})`);
  }
}

async function buyOneClick(side /* "CALL" | "PUT" */, symbolOverride = null) {
  assertCanTrade();

  if (tradeInFlight) throw new Error("Operación en curso");
  tradeInFlight = true;

  try {
    await ensureAuthorized();
    startNewDisciplineWindowIfNeeded();

    const symbol =
      symbolOverride || (modalCurrentItem && modalCurrentItem.symbol) || (history.at(-1)?.symbol || "R_25");
    const stake = getTradeStake();

    const res = await wsRequest(
      {
        buy: 1,
        price: stake,
        parameters: {
          amount: stake,
          basis: "stake",
          contract_type: side,
          currency: DEFAULT_CURRENCY,
          duration: Number(DEFAULT_DURATION) || 1,
          duration_unit: DEFAULT_DURATION_UNIT || "m",
          symbol,
        },
      },
      20000
    );

    if (res?.error) throw new Error(res.error.message || "buy error");
    if (!res?.buy) throw new Error("buy: respuesta inválida (sin buy)");

    const cid = res.buy.contract_id || res.buy.transaction_id;
    if (cid) {
      subscribeContractOutcome(cid);
      toast(`📌 Trade registrado. Esperando resultado… (${disciplineWins}W/${disciplineLosses}L)`, 1600);
    }

    updateDisciplineLockUI(false);
    return res;
  } finally {
    tradeInFlight = false;
  }
}

// Conectar botones del modal (con cutoff duro)
if (modalBuyCallBtn) {
  modalBuyCallBtn.onclick = async () => {
    modalBuyCallBtn.disabled = true;
    try {
      updateDisciplineLockUI(false);
      toast("🟢 Enviando COMPRA…", 1200);

      const r = await Promise.race([
        buyOneClick("CALL"),
        new Promise((_, rej) => setTimeout(() => rej(new Error("timeout trade")), 22000)),
      ]);

      const cid = r?.buy?.contract_id || r?.buy?.transaction_id || "";
      toast(`🟢 COMPRADO ✓ ${cid ? "ID: " + cid : ""}`, 1800);
    } catch (e) {
      toast(`⚠️ Error COMPRA: ${e?.message || e}`, 2400);
    } finally {
      modalBuyCallBtn.disabled = false;
      updateDisciplineLockUI(false);
    }
  };
}
if (modalBuyPutBtn) {
  modalBuyPutBtn.onclick = async () => {
    modalBuyPutBtn.disabled = true;
    try {
      updateDisciplineLockUI(false);
      toast("🔴 Enviando VENTA…", 1200);

      const r = await Promise.race([
        buyOneClick("PUT"),
        new Promise((_, rej) => setTimeout(() => rej(new Error("timeout trade")), 22000)),
      ]);

      const cid = r?.buy?.contract_id || r?.buy?.transaction_id || "";
      toast(`🔴 VENDIDO ✓ ${cid ? "ID: " + cid : ""}`, 1800);
    } catch (e) {
      toast(`⚠️ Error VENTA: ${e?.message || e}`, 2400);
    } finally {
      modalBuyPutBtn.disabled = false;
      updateDisciplineLockUI(false);
    }
  };
}

/* =========================
   Config UI: Token + Stake
========================= */
function initTokenAndStakeUI() {
  const tokenInput = pickEl("tokenInput", "derivTokenInput", "demoTokenInput", "tokenDemoInput", "tradeTokenInput");
  const tokenSaveBtn = pickEl("tokenSaveBtn", "saveTokenBtn", "btnSaveToken");
  const tokenClearBtn = pickEl("tokenClearBtn", "deleteTokenBtn", "btnClearToken", "btnDeleteToken");

  if (tokenInput) {
    const cur = getDerivToken();
    if (cur && !tokenInput.value) tokenInput.value = cur;
  }

  if (tokenSaveBtn && tokenInput) {
    tokenSaveBtn.onclick = () => {
      const v = String(tokenInput.value || "").trim();
      if (!v) return alert("Pegá un token DEMO primero.");
      setDerivToken(v);
      resetAuthState();
      toast("💾 Token guardado ✓", 1600);
      alert("✅ Token DEMO guardado.");
    };
  }

  if (tokenClearBtn) {
    tokenClearBtn.onclick = () => {
      clearDerivToken();
      resetAuthState();
      if (tokenInput) tokenInput.value = "";
      toast("🗑️ Token borrado ✓", 1600);
      alert("🗑️ Token DEMO borrado.");
    };
  }

  const stakeInput = pickEl("stakeInput", "tradeStakeInput", "stakeUsdInput");
  const stakeSaveBtn = pickEl("stakeSaveBtn", "saveStakeBtn", "btnSaveStake");
  const stakeDefaultBtn = pickEl("stakeDefaultBtn", "defaultStakeBtn", "btnDefaultStake");

  if (stakeInput) {
    const cur = getTradeStake();
    if (!stakeInput.value) stakeInput.value = Number(cur).toFixed(2);
  }

  if (stakeSaveBtn && stakeInput) {
    stakeSaveBtn.onclick = () => {
      const n = Number(stakeInput.value);
      if (!Number.isFinite(n) || n <= 0) return alert("Stake inválido.");
      const ok = setTradeStake(n);
      if (!ok) return alert("No se pudo guardar el stake.");
      stakeInput.value = Number(getTradeStake()).toFixed(2);
      toast("💾 Stake guardado ✓", 1600);
      alert(`✅ Stake guardado: ${Number(getTradeStake()).toFixed(2)} USD`);
    };
  }

  if (stakeDefaultBtn && stakeInput) {
    stakeDefaultBtn.onclick = () => {
      clearTradeStake();
      stakeInput.value = Number(DEFAULT_STAKE).toFixed(2);
      setTradeStake(DEFAULT_STAKE);
      toast("↩️ Stake default ✓", 1600);
      alert(`↩️ Stake default: ${Number(DEFAULT_STAKE).toFixed(2)} USD`);
    };
  }
}

/* =========================
   Finalize minute (simplificado)
========================= */
function finalizeMinute(minute) {
  delete candleOC[minute - 3];
  delete minuteData[minute - 3];
}

/* =========================
   Tick flow
========================= */
function onTick(tick) {
  const epochMs = Math.round(Number(tick.epoch) * 1000);

  lastTickLocalNowMs = Date.now();
  serverOffsetMs = epochMs - lastTickLocalNowMs;

  const minuteStartMs = Math.floor(epochMs / 60000) * 60000;

  const minute = Math.floor(epochMs / 60000);
  const msInMinute = epochMs - minuteStartMs;
  const sec = Math.floor(msInMinute / 1000);
  const symbol = tick.symbol;

  lastTickEpochMs = epochMs;
  currentMinuteStartMs = minuteStartMs;

  const prevLast = lastQuoteBySymbol[symbol];
  lastQuoteBySymbol[symbol] = tick.quote;

  if (lastMinuteSeenBySymbol[symbol] !== minute) {
    lastMinuteSeenBySymbol[symbol] = minute;
    minuteData[minute] ||= {};
    minuteData[minute][symbol] ||= [];
    if (minuteData[minute][symbol].length === 0 && prevLast != null) {
      minuteData[minute][symbol].push({ ms: 0, quote: prevLast });
    }
  }

  if (lastSeenMinute === null) lastSeenMinute = minute;
  if (minute > lastSeenMinute) {
    for (let m = lastSeenMinute; m < minute; m++) finalizeMinute(m);
    lastSeenMinute = minute;
  }

  minuteData[minute] ||= {};
  minuteData[minute][symbol] ||= [];
  minuteData[minute][symbol].push({ ms: msInMinute, quote: tick.quote });

  candleOC[minute] ||= {};
  if (!candleOC[minute][symbol]) candleOC[minute][symbol] = { open: tick.quote, close: tick.quote };
  else candleOC[minute][symbol].close = tick.quote;

  // ✅✅ FIX CRASH: no asumir modalCurrentItem
  if (
    modalCurrentItem &&
    modalLive &&
    chartModal &&
    !chartModal.classList.contains("hidden") &&
    modalCurrentItem.minute === minute &&
    modalCurrentItem.symbol === symbol
  ) {
    const cur = modalCurrentItem;
    if (cur) cur.ticks = minuteData[minute][symbol].slice();
    requestModalDraw(false);
  }

  if (history && history.length) {
    const tail = history.slice(-12);
    for (const it of tail) updateRowChartBtn(it);
  }

  // (Tu lógica de evaluateMinute quedó en tu versión larga; si la tenés debajo, se mantiene)
  // Si no, esto igual no rompe.
}

/* =========================
   WebSocket
========================= */
function connect() {
  try {
    if (statusEl) statusEl.textContent = "Conectando…";
    ws = new WebSocket(WS_URL);
  } catch {
    if (statusEl) statusEl.textContent = "Error WS – no se pudo iniciar";
    return;
  }

  ws.onopen = () => {
    try {
      resetAuthState();
    } catch {}

    if (statusEl) statusEl.textContent = "Conectado – Suscribiendo…";
    SYMBOLS.forEach((sym) => ws.send(JSON.stringify({ ticks: sym, subscribe: 1 })));

    updateDisciplineLockUI(false);
  };

  ws.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);

      // req_id resolver
      if (data && data.req_id && pending.has(data.req_id)) {
        const p = pending.get(data.req_id);
        clearTimeout(p.t);
        pending.delete(data.req_id);
        p.resolve(data);
        return;
      }

      // contratos (disciplina)
      if (data?.proposal_open_contract) {
        const poc = data.proposal_open_contract;
        const cid = String(poc?.contract_id || "");
        const subId = data?.subscription?.id;

        if (cid) {
          if (subId) contractSubs.set(cid, subId);

          if (poc?.is_sold) {
            const status = String(poc.status || "").toLowerCase();
            const profit = Number(poc.profit);

            let isWin = false;
            if (status === "won") isWin = true;
            else if (status === "lost") isWin = false;
            else if (Number.isFinite(profit)) isWin = profit > 0;

            toast(isWin ? "✅ ITM (ganada) registrada" : "❌ OTM (perdida) registrada", 1400);
            applyDisciplineOutcome(isWin);

            const sid = contractSubs.get(cid);
            forgetSubscription(sid);
            contractSubs.delete(cid);
          }
        }
        return;
      }

      if (data?.error) {
        if (statusEl) statusEl.textContent = `⚠️ WS error: ${data.error.message || "unknown"}`;
      }

      if (data.tick) onTick(data.tick);
    } catch (err) {
      if (statusEl) statusEl.textContent = `❌ Parse WS: ${err?.message || err}`;
    }
  };

  ws.onerror = () => {
    if (statusEl) statusEl.textContent = "Error WS – reconectando…";
  };

  ws.onclose = (ev) => {
    try {
      resetAuthState();
    } catch {}

    for (const [id, p] of pending.entries()) {
      clearTimeout(p.t);
      pending.delete(id);
      p.reject(new Error("closed"));
    }

    contractSubs.clear();

    const code = ev?.code || 0;
    const reason = ev?.reason || "";
    if (statusEl) statusEl.textContent = `Desconectado (${code}) ${reason ? "– " + reason : ""} – reconectando…`;

    if (lowPowerMode && document.visibilityState && document.visibilityState !== "visible") return;
    setTimeout(connect, 1500);
  };
}

/* =========================
   🪫 Behavior en background/foreground
========================= */
document.addEventListener("visibilitychange", () => {
  if (!("visibilityState" in document)) return;

  if (document.visibilityState === "hidden") {
    if (lowPowerMode && ws && ws.readyState === 1) {
      try {
        ws.close();
      } catch {}
    }
    return;
  }

  if (document.visibilityState === "visible") {
    if (!ws || ws.readyState === 3) {
      try {
        connect();
      } catch {}
    }
  }
});

/* =========================
   Start
========================= */
loadLowPowerMode();
loadAutoOpenChartSetting();
loadDiscipline();

renderHistory();
updateTickHealthUI();
updateCountdownUI();

ensureLowPowerButton();
applyLowPowerModeUI();

ensureAutoOpenChartButton();
applyAutoOpenChartUI();

initWakeButton();
initTokenAndStakeUI();
ensureResetCacheButton();

applyModalTradeButtonsLayout();
updateDisciplineLockUI(false);

connect();