// app.js — Base estable + LIVE chart FIX + Trades no quedan colgados (timeouts + race) + ✅ Auto-abrir gráfico (configurable)
// ✅ Modo PATRÓN ESCALERA (ESTRICTO): evalúa SOLO en 40/45 (según config) — NORMAL queda igual
// ✅ FIX UI: Botones COMPRAR / VENDER en el modal uno al lado del otro (grandes, sin encimarse)
// ✅ Disciplina (DEMO): 3 ITM (ganadas) o 2 OTM (perdidas) -> bloquea operar 1h
// ✅ FIX Disciplina: feedback visual (candado + “polarizado”) + contador visible + auto-unlock con reset
// ✅ FIX INTERNET: contratos “pendientes” persistentes -> si se corta internet, al reconectar vuelve a suscribirse y cuenta ITM/OTM igual
// ✅ FIX NUEVO: si proposal_open_contract no manda is_sold, fallback poll y cuenta igual
// ✅ FIX CRÍTICO: al reconectar, autoriza antes de reenganchar pendientes
// ✅ NUEVO: cada señal muestra badge del trade: ⏳ TRADE / 🎯 ITM / 💥 OTM
// ✅ NUEVO: pestañas: Señales | Trades | Feedback (sin pestaña Configuración; queda SOLO el engranaje)
// ✅ NUEVO: separar historial:
//    - Señales: STORE_KEY (borrado independiente)
//    - Trades (journal estudio): TRADES_STORE_KEY (borrado independiente)
// ✅ NUEVO: Exportar Trades (journal) desde Configuración
// ✅ FIX IMPORTANTE (NEXT): la próxima vela (NEXT) se calcula por CIERRE de la vela siguiente vs CIERRE de la vela de señal
// ✅ FIX UI Trades: se ve igual que Señales y SIN voto/comentario en Trades
// ✅ NUEVO UX: botones de borrar por pestaña (Señales/Trades) en la UI, NO en el modal Config
// ✅ FIX (este update): el botón 🗑️ Borrar Trades ya NO desaparece (tradesActions fijo + render limpia solo tradesList)
// ✅ FIX (este update): ESCALERA/NORMAL ya no calculan NEXT por color; confirman con close(signal) vs close(next) vía ticks_history
// ✅ FIX (este update): evita crash "Cannot read properties of null (reading 'ticks')" en requestModalDraw (race al cerrar modal)
// ✅ NUEVO: modal muestra "VELA ABIERTA | faltan XXs" y bloquea COMPRAR / VENDER cuando la vela ya cerró

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
   Trades Journal (estudio)
========================= */
const TRADES_STORE_KEY = "derivTradesJournal_v1";
const TRADES_JOURNAL_MAX = 500;

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
   Disciplina
========================= */
const DISCIPLINE_WINDOW_START_KEY = "discipline_windowStartMs_v1";
const DISCIPLINE_WINS_KEY = "discipline_wins_v1";
const DISCIPLINE_LOSSES_KEY = "discipline_losses_v1";
const DISCIPLINE_LOCK_UNTIL_KEY = "discipline_lockUntilMs_v1";
const DISCIPLINE_PENDING_CONTRACTS_KEY = "discipline_pendingContracts_v1";

const DISCIPLINE_MAX_WINS = 3;
const DISCIPLINE_MAX_LOSSES = 2;
const DISCIPLINE_LOCK_MS = 60 * 60 * 1000;

let disciplineWindowStartMs = 0;
let disciplineWins = 0;
let disciplineLosses = 0;
let disciplineLockUntilMs = 0;
let disciplinePendingContracts = []; // array de string contract_id

/* =========================
   Link contract_id -> signalId
========================= */
const TRADE_LINKS_KEY = "trade_links_v1"; // contract_id -> signalId
let tradeLinks = new Map(); // in-memory

function loadTradeLinks() {
  try {
    const raw = localStorage.getItem(TRADE_LINKS_KEY) || "{}";
    const obj = JSON.parse(raw);
    tradeLinks = new Map(Object.entries(obj || {}).map(([k, v]) => [String(k), String(v)]));
  } catch {
    tradeLinks = new Map();
  }
}
function saveTradeLinks() {
  try {
    const obj = Object.fromEntries(tradeLinks.entries());
    localStorage.setItem(TRADE_LINKS_KEY, JSON.stringify(obj));
  } catch {}
}
function linkContractToSignal(contractId, signalId) {
  if (!contractId || !signalId) return;
  tradeLinks.set(String(contractId), String(signalId));
  saveTradeLinks();
}

/* =========================
   Trades Journal persistence
========================= */
function loadTradesJournal() {
  try {
    const raw = localStorage.getItem(TRADES_STORE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}
function saveTradesJournal(arr) {
  try {
    localStorage.setItem(TRADES_STORE_KEY, JSON.stringify(arr));
  } catch {}
}
let tradesJournal = loadTradesJournal();

function makeJournalIdFromSignal(it) {
  const cid = it?.trade?.contract_id ? String(it.trade.contract_id) : "";
  return `${String(it.id || "")}::${cid}`.slice(0, 220);
}

// guarda/actualiza snapshot (solo ITM/OTM)
function upsertTradeJournalFromSignal(it) {
  if (!it?.trade?.badge) return;
  const b = String(it.trade.badge || "");
  if (b !== "ITM" && b !== "OTM") return;

  const entry = {
    journal_id: makeJournalIdFromSignal(it),
    saved_at: Date.now(),

    // snapshot señal
    id: it.id,
    minute: it.minute,
    time: it.time,
    symbol: it.symbol,
    direction: it.direction,
    mode: it.mode,

    nextOutcome: it.nextOutcome || "",
    minuteComplete: !!it.minuteComplete,

    // snapshot trade
    trade: { ...(it.trade || {}) },

    // para estudio
    ticks: Array.isArray(it.ticks) ? it.ticks : [],
  };

  const idx = tradesJournal.findIndex((x) => x && x.journal_id === entry.journal_id);
  if (idx >= 0) tradesJournal[idx] = entry;
  else tradesJournal.unshift(entry);

  if (tradesJournal.length > TRADES_JOURNAL_MAX) tradesJournal = tradesJournal.slice(0, TRADES_JOURNAL_MAX);

  saveTradesJournal(tradesJournal);
}

// siembra (una vez) desde history por si existían ITM/OTM ya guardados
function seedTradesJournalFromHistory() {
  try {
    let changed = false;
    for (const it of history || []) {
      const b = it?.trade?.badge || "";
      if (b === "ITM" || b === "OTM") {
        const id = makeJournalIdFromSignal(it);
        if (!tradesJournal.some((x) => x && x.journal_id === id)) {
          upsertTradeJournalFromSignal(it);
          changed = true;
        }
      }
    }
    if (changed) saveTradesJournal(tradesJournal);
  } catch {}
}

function findHistoryItemById(id) {
  return (history || []).find((x) => x && x.id === id) || null;
}
function setTradeBadge(item, badge /* 'PENDING'|'ITM'|'OTM'|'' */, extra = {}) {
  if (!item) return;
  item.trade ||= {};
  item.trade.badge = badge || "";
  if (extra && typeof extra === "object") Object.assign(item.trade, extra);
  saveHistory(history);
  updateRowTradeBadge(item);

  // si cerró ITM/OTM, guardar en journal
  try {
    upsertTradeJournalFromSignal(item);
  } catch {}

  // si estás mirando Trades, refrescar
  try {
    const av = localStorage.getItem("activeView") || "signals";
    if (av === "trades") renderTradesView();
  } catch {}
}

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
const feedbackEl = $("feedback"); // compat (ya no se usa en V9.4 práctica)
const tickHealthEl = $("tickHealth");
const countdownEl = $("countdown");
const sound = $("alertSound");

const soundBtn = $("soundBtn");
const vibrateBtn = $("vibrateBtn");
const wakeBtn = $("wakeBtn");
const themeBtn = $("themeBtn");
const clearHistoryBtn = $("clearHistoryBtn"); // si existe, lo ocultamos
const copyBtn = $("copyFeedback");

const practiceView = $("practiceView");
const practiceCanvas = $("practiceCanvas");
const practiceStatusEl = $("practiceStatus");
const practiceResultEl = $("practiceResult");
const practiceSimilarBtn = $("practiceSimilarBtn");
const practiceSimilarPanel = $("practiceSimilarPanel");
const practiceSimilarMetaEl = $("practiceSimilarMeta");
const practiceSimilarListEl = $("practiceSimilarList");
const practiceRoundLabelEl = $("practiceRoundLabel");
const practicePoolLabelEl = $("practicePoolLabel");
const practiceSessionStatsEl = $("practiceSessionStats");
const practiceAllStatsEl = $("practiceAllStats");
const practiceResetSessionBtn = $("practiceResetSessionBtn");
const practiceResetAllBtn = $("practiceResetAllBtn");
const practice40Btn = $("practice40Btn");
const practice45Btn = $("practice45Btn");
const practiceCallBtn = $("practiceCallBtn");
const practicePutBtn = $("practicePutBtn");
const practicePassBtn = $("practicePassBtn");

const evalBtns = qsAll(".evalBtn");
const modeBtn = $("modeBtn");

// Tabs existentes (del HTML)
const tabs = qsAll(".tab[data-view]");
const signalsView = $("signalsView");
const feedbackView = $("feedbackView"); // compat

// Config modal existente (engrane y modal)
const configBtn = $("configBtn");
const settingsModal = $("settingsModal");
const settingsCloseBackdrop = $("settingsCloseBackdrop");
const settingsCloseBtn = $("settingsCloseBtn");
const settingsCloseBtn2 = $("settingsCloseBtn2");

const chartModal = $("chartModal");
const modalCloseBtn = $("modalCloseBtn");
const modalCloseBackdrop = $("modalCloseBackdrop");
const modalTitle = $("modalTitle");
const modalSub = $("modalSub");
const minuteCanvas = $("minuteCanvas");
const modalOpenDerivBtn = $("modalOpenDerivBtn");

const modalBuyCallBtn = pickEl("modalBuyCallBtn");
const modalBuyPutBtn = pickEl("modalBuyPutBtn");
const modalLiveBtn = pickEl("modalLiveBtn");
let modalCandleStatusEl = null;

/* =========================
   Toast
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

// ✅ NORMAL vs PATRÓN ESCALERA
let stairMode = false;

let history = loadHistory();
migrateHistoryModesToStair();

let minuteData = {};
let lastEvaluatedMinute = null;
let evalRetryTimer = null;

let lastTickEpochMs = null;
let lastTickLocalNowMs = null;
let serverOffsetMs = 0;
let currentMinuteStartMs = null;

let lastSeenMinute = null;
let candleOC = {}; // candleOC[minute][symbol] = { open, close }

let lastQuoteBySymbol = {};
let lastMinuteSeenBySymbol = {};

let modalCurrentItem = null;

let modalLive = false;
let modalDrawRaf = null;
let modalLastDrawAt = 0;
const MODAL_DRAW_MIN_INTERVAL_MS = 120;

// Migración: FUERTE / GIRO -> ESCALERA en history viejo
function migrateHistoryModesToStair() {
  try {
    let changed = false;
    for (const it of history || []) {
      if (it && (it.mode === "FUERTE" || it.mode === "GIRO")) {
        it.mode = "ESCALERA";
        changed = true;
      }
    }
    if (changed) saveHistory(history);
  } catch {}
}

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
   Auto-open chart
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
  if (activeView === "practice") return false;
  if (activeView === "trades") return false;

  return true;
}

/* =========================
   🪫 Low power mode
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
  } catch {
    lowPowerMode = false;
  }
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
   Wake Lock
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
   Persistencia (history señales)
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
function areSignalsPaused(viewName = null) {
  const activeView = viewName || (localStorage.getItem("activeView") || "signals");
  return activeView === "practice";
}
function updateCounter(viewName = null) {
  const activeView = viewName || (localStorage.getItem("activeView") || "signals");
  if (!counterEl) return;
  if (activeView === "trades") {
    counterEl.textContent = `Trades: ${tradesJournal.length}`;
    return;
  }
  if (activeView === "practice") {
    counterEl.textContent = `Práctica: ${practiceSessionStats.total}`;
    return;
  }
  counterEl.textContent = `Señales: ${history.length}`;
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
  if (outcome === "flat") return "NEUTRA";
  return "PENDIENTE";
}
function compareConsecutiveCloses(signalClose, nextClose) {
  const a = Number(signalClose);
  const b = Number(nextClose);

  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  if (b > a) return "up";
  if (b < a) return "down";
  return "flat";
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

    const tradeBadge = it?.trade?.badge ? ` | TRADE: ${it.trade.badge}` : "";
    text += `${it.time} | ${it.symbol} | ${labelDir(it.direction)} | [${modeLabel}] | ${vote} | NEXT: ${outArrow} ${outText}${tradeBadge} | ${comment}\n`;
  }
  feedbackEl.value = text;
}

/* =========================
   Trades view (journal) — ✅ FIX: actions + list
========================= */
function ensureTradesView() {
  let el = $("tradesView");
  if (!el) {
    const host =
      (signalsView && signalsView.parentElement) ||
      (feedbackView && feedbackView.parentElement) ||
      document.body;

    el = document.createElement("div");
    el.id = "tradesView";

    if (signalsView && signalsView.className) el.className = signalsView.className;
    el.classList.add("hidden");

    host.appendChild(el);
  }

  // ✅ Barra fija (NO se borra al renderizar trades)
  let actions = $("tradesActions");
  if (!actions) {
    actions = document.createElement("div");
    actions.id = "tradesActions";
    actions.style.display = "flex";
    actions.style.justifyContent = "flex-end";
    actions.style.alignItems = "center";
    actions.style.gap = "10px";
    actions.style.margin = "10px 0 0 0";
    actions.style.width = "100%";
    el.appendChild(actions);
  }

  // ✅ Lista (esta SÍ se limpia)
  let list = $("tradesList");
  if (!list) {
    list = document.createElement("div");
    list.id = "tradesList";
    el.appendChild(list);
  }

  return el;
}

function renderTradesView() {
  ensureTradesView();
  const list = $("tradesList");
  if (!list) return;

  updateCounter("trades");
  list.innerHTML = "";

  if (!tradesJournal.length) {
    list.innerHTML = `<div style="padding:12px; opacity:.9;">Todavía no hay trades guardados para estudio.</div>`;
  } else {
    for (const entry of tradesJournal) {
      const item = {
        id: entry.id,
        minute: entry.minute,
        time: entry.time,
        symbol: entry.symbol,
        direction: entry.direction,
        mode: entry.mode || "NORMAL",
        vote: "",
        comment: "",
        ticks: Array.isArray(entry.ticks) ? entry.ticks : [],
        nextOutcome: entry.nextOutcome || "",
        minuteComplete: true,
        trade: entry.trade || null,
      };

      // ✅ SIN voto/comentario en Trades
      list.appendChild(buildRow(item, { hideActions: true, source: "trades", signalId: entry.id }));
    }
  }

  // ✅ extra robusto: re-asegura el botón al final del render
  try {
    ensureInlineClearButtons();
    updatePerViewClearButtonsVisibility("trades");
    ensurePracticeQueue();
    updatePracticePoolLabel();
  } catch {}
}

/* =========================
   Tabs: Señales | Trades | Feedback
========================= */
function removeSettingsTabIfExists() {
  try {
    const host = (configBtn && configBtn.parentElement) || document.body;
    const sTab = host.querySelector('.tab[data-view="settings"]');
    if (sTab) sTab.remove();
  } catch {}
}
function ensureTradesTab() {
  const host = (configBtn && configBtn.parentElement) || null;
  if (!host) return;

  const hasTrades = host.querySelector('.tab[data-view="trades"]');
  if (hasTrades) return;

  const beforeNode = configBtn || null;
  const t = document.createElement("button");
  t.type = "button";
  t.className = "tab";
  t.dataset.view = "trades";
  t.textContent = "Trades";
  host.insertBefore(t, beforeNode);
}

/* =========================
   ✅ Clear por pestaña (inline)
========================= */
function clearSignalsOnly() {
  history = [];
  saveHistory(history);
  updateCounter(localStorage.getItem("activeView") || "signals");
  if (signalsEl) signalsEl.innerHTML = "";
  if (feedbackEl) feedbackEl.value = "";
  toast("🧹 Señales borradas", 1600);
}
function clearTradesOnly() {
  tradesJournal = [];
  saveTradesJournal(tradesJournal);
  practiceQueue = [];
  practiceRound = null;
  resetPracticeSimilarState();
  try {
    const av = localStorage.getItem("activeView") || "signals";
    updateCounter(av);
    if (av === "trades") renderTradesView();
    if (av === "practice") ensurePracticeReady();
  } catch {}
  toast("🗑️ Trades borrados", 1600);
}

function ensureViewActionButton(viewName, opts) {
  const { id, text, title, onClick } = opts;

  let host = null;
  if (viewName === "signals") {
    host = (counterEl && counterEl.parentElement) || signalsView || document.body;
  } else if (viewName === "trades") {
    ensureTradesView();
    host = $("tradesActions") || document.body;
  } else {
    host = document.body;
  }

  let wrap = document.getElementById(`${id}Wrap`);
  if (!wrap) {
    wrap = document.createElement("div");
    wrap.id = `${id}Wrap`;
    wrap.style.display = "flex";
    wrap.style.justifyContent = "flex-end";
    wrap.style.alignItems = "center";
    wrap.style.gap = "10px";
    wrap.style.margin = "10px 0 0 0";
    wrap.style.width = "100%";
  }

  let btn = document.getElementById(id);
  if (!btn) {
    btn = document.createElement("button");
    btn.id = id;
    btn.type = "button";
    btn.className = "btn btnGhost";
    btn.textContent = text;
    btn.title = title || "";

    btn.style.padding = "8px 10px";
    btn.style.borderRadius = "12px";
    btn.style.fontWeight = "900";
    btn.style.minHeight = "36px";
    btn.style.lineHeight = "1";
    btn.style.display = "inline-flex";
    btn.style.alignItems = "center";
    btn.style.justifyContent = "center";
    btn.style.gap = "8px";
    btn.style.opacity = "0.95";

    wrap.appendChild(btn);

    if (viewName === "signals" && signalsEl && signalsEl.parentElement) {
      signalsEl.parentElement.insertBefore(wrap, signalsEl);
    } else if (viewName === "trades") {
      host.appendChild(wrap);
    } else {
      host.appendChild(wrap);
    }
  }

  btn.onclick = onClick;
  return btn;
}

function updatePerViewClearButtonsVisibility(activeView) {
  const wSignals = document.getElementById("clearSignalsInlineBtnWrap");
  const wTrades = document.getElementById("clearTradesInlineBtnWrap");

  if (wSignals) wSignals.style.display = activeView === "signals" ? "flex" : "none";
  if (wTrades) wTrades.style.display = "none";
}

function ensureInlineClearButtons() {
  ensureViewActionButton("signals", {
    id: "clearSignalsInlineBtn",
    text: "🧹 Borrar Señales",
    title: "Borra solo el historial de señales",
    onClick: () => {
      if (!confirm("¿Borrar SOLO el historial de señales? (Trades se conserva)")) return;
      clearSignalsOnly();
    },
  });

  const oldTradesWrap = document.getElementById("clearTradesInlineBtnWrap");
  if (oldTradesWrap) oldTradesWrap.remove();

  const av = localStorage.getItem("activeView") || "signals";
  updatePerViewClearButtonsVisibility(av);
}

function setActiveView(name) {
  const isSignals = name === "signals";
  const isTrades = name === "trades";
  const isPractice = name === "practice";

  const tv = ensureTradesView();

  if (signalsView) signalsView.classList.toggle("hidden", !isSignals);
  if (tv) tv.classList.toggle("hidden", !isTrades);
  if (practiceView) practiceView.classList.toggle("hidden", !isPractice);

  qsAll(".tab[data-view]").forEach((t) => {
    const active = t.dataset.view === name;
    t.classList.toggle("active", active);
    t.setAttribute("aria-selected", active ? "true" : "false");
  });

  localStorage.setItem("activeView", name);

  if (isTrades) renderTradesView();
  if (isPractice) ensurePracticeReady();
  updateCounter(name);
  updatePerViewClearButtonsVisibility(name);
}

(function initTabs() {
  removeSettingsTabIfExists();
  ensureTradesTab();
  ensureTradesView();

  qsAll(".tab[data-view]").forEach((t) => (t.onclick = () => setActiveView(t.dataset.view)));

  const saved = localStorage.getItem("activeView") || "signals";
  const initial = ["signals", "trades", "practice"].includes(saved) ? saved : "signals";
  setActiveView(initial);
})();

/* =========================
   Práctica
========================= */
const PRACTICE_STATS_KEY = "practiceStats_v1";
let practiceSessionStats = freshPracticeStats();
let practiceAllStats = loadPracticeAllStats();
let practiceQueue = [];
let practiceRound = null;
let practiceRaf = null;
let practiceChoiceHitZones = [];
let practiceSimilarResults = [];
const PRACTICE_SEGMENTS = [
  { start: 0, end: 15000, label: "0s" },
  { start: 15000, end: 30000, label: "15s" },
  { start: 30000, end: 45000, label: "30s" },
  { start: 45000, end: 60000, label: "45s" },
];

function freshPracticeStats() {
  return { itm: 0, otm: 0, pass: 0, total: 0 };
}
function freshPracticeSegmentMarks() {
  return PRACTICE_SEGMENTS.map(() => "");
}
function loadPracticeAllStats() {
  try {
    const raw = localStorage.getItem(PRACTICE_STATS_KEY);
    if (!raw) return freshPracticeStats();
    const obj = JSON.parse(raw);
    return {
      itm: Number(obj?.itm || 0),
      otm: Number(obj?.otm || 0),
      pass: Number(obj?.pass || 0),
      total: Number(obj?.total || 0),
    };
  } catch {
    return freshPracticeStats();
  }
}
function savePracticeAllStats() {
  try {
    localStorage.setItem(PRACTICE_STATS_KEY, JSON.stringify(practiceAllStats));
  } catch {}
}
function resetPracticeSessionStats() {
  practiceSessionStats = freshPracticeStats();
  renderPracticeStats();
  toast("↺ Sesión de práctica reseteada", 1400);
}
function resetPracticeAllStats() {
  practiceAllStats = freshPracticeStats();
  savePracticeAllStats();
  renderPracticeStats();
  toast("↺ Histórico de práctica reseteado", 1600);
}
function formatPracticeStats(stats) {
  const decided = Number(stats.itm || 0) + Number(stats.otm || 0);
  const pct = decided ? Math.round((Number(stats.itm || 0) / decided) * 100) : 0;
  return `ITM ${stats.itm} · OTM ${stats.otm} · PASAR ${stats.pass} · % ${pct} · TOTAL ${stats.total}`;
}
function renderPracticeStats() {
  if (practiceSessionStatsEl) practiceSessionStatsEl.textContent = formatPracticeStats(practiceSessionStats);
  if (practiceAllStatsEl) practiceAllStatsEl.textContent = formatPracticeStats(practiceAllStats);
  updateCounter("practice");
}
function getEligiblePracticeEntries() {
  return (tradesJournal || []).filter((entry) => {
    if (!entry) return false;
    if (!Array.isArray(entry.ticks) || entry.ticks.length < 6) return false;
    if (!(entry.nextOutcome === "up" || entry.nextOutcome === "down")) return false;
    return true;
  });
}
function shuffleArray(arr) {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
function ensurePracticeQueue() {
  const eligibleIds = new Set(getEligiblePracticeEntries().map((x) => String(x.journal_id || x.id || "")));
  practiceQueue = practiceQueue.filter((id) => eligibleIds.has(String(id)));
  if (practiceQueue.length) return;
  practiceQueue = shuffleArray(Array.from(eligibleIds));
}
function updatePracticePoolLabel() {
  const eligible = getEligiblePracticeEntries().length;
  if (practicePoolLabelEl) practicePoolLabelEl.textContent = `Pool: ${practiceQueue.length}/${eligible}`;
}
function paintPracticeSecButtons() {
  const active = EVAL_SEC;
  [practice40Btn, practice45Btn].forEach((btn) => {
    if (!btn) return;
    const sec = Number(btn.dataset.sec || 0);
    btn.classList.toggle("active", sec === active);
  });
}
function normalizePracticeTicks(ticks) {
  return (Array.isArray(ticks) ? ticks : []).slice().sort((a, b) => a.ms - b.ms);
}
function buildPracticeVisibleTicks(ticks, uptoMs) {
  const pts = normalizePracticeTicks(ticks).filter((t) => t.ms <= uptoMs);
  if (!pts.length) return [];
  const last = pts[pts.length - 1];
  if (last.ms < uptoMs) pts.push({ ms: uptoMs, quote: last.quote });
  return pts;
}
function drawPracticeChart(canvas, ticks, replayMs, segmentMarks = null) {
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
  practiceChoiceHitZones = [];

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
  const marks = Array.isArray(segmentMarks) ? segmentMarks : [];
  const arrowZones = [];

  for (let idx = 0; idx < PRACTICE_SEGMENTS.length; idx++) {
    const seg = PRACTICE_SEGMENTS[idx];
    const x1 = xOf(seg.start);
    const visibleEnd = replayMs == null ? seg.end : Math.min(seg.end, replayMs);
    const visibleWidth = Math.max(0, xOf(visibleEnd) - x1);
    const isVisible = replayMs == null ? true : replayMs > seg.start;

    let fill = "rgba(255,255,255,0.025)";
    if (replayMs != null) {
      if (replayMs >= seg.end) fill = "rgba(34,211,238,0.10)";
      else if (replayMs >= seg.start && replayMs < seg.end) fill = "rgba(251,191,36,0.10)";
    }

    const mark = marks[idx] || "";
    if (mark === "up") fill = "rgba(34,197,94,0.18)";
    if (mark === "down") fill = "rgba(239,68,68,0.18)";

    if (isVisible) {
      ctx.fillStyle = fill;
      ctx.fillRect(x1, 8, visibleWidth, h - 32);
    }

    if (!isVisible || visibleWidth < 34) continue;

    const centerX = x1 + visibleWidth / 2;
    const upY = Math.max(40, (h - 28) * 0.33);
    const downY = Math.max(upY + 40, (h - 28) * 0.60);
    const hitW = Math.min(50, Math.max(38, visibleWidth - 6));

    arrowZones.push({
      segIndex: idx,
      centerX,
      upY,
      downY,
      upSelected: mark === "up",
      downSelected: mark === "down",
    });

    practiceChoiceHitZones.push(
      { segIndex: idx, choice: "up", x: centerX - hitW / 2, y: upY - 22, w: hitW, h: 34 },
      { segIndex: idx, choice: "down", x: centerX - hitW / 2, y: downY - 22, w: hitW, h: 34 }
    );
  }

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

  const guideMarks = [0, 15000, 30000, 45000];
  for (const ms of guideMarks) {
    const x = xOf(ms);
    ctx.save();
    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = ms === 30000 ? "rgba(255,255,255,0.42)" : "rgba(255,255,255,0.26)";
    ctx.lineWidth = ms === 30000 ? 1.8 : 1.2;
    ctx.beginPath();
    ctx.moveTo(x, 10);
    ctx.lineTo(x, h - 22);
    ctx.stroke();
    ctx.restore();

    const label = ms === 0 ? "0s" : ms === 15000 ? "15s" : ms === 30000 ? "30s" : "45s";
    ctx.fillStyle = "rgba(255,255,255,0.78)";
    ctx.font = "12px system-ui, sans-serif";
    ctx.fillText(label, Math.min(w - 26, x + 4), h - 6);
  }

  if (replayMs != null) {
    const xNow = xOf(replayMs);
    ctx.save();
    ctx.setLineDash([2, 4]);
    ctx.strokeStyle = "rgba(251,191,36,0.95)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(xNow, 8);
    ctx.lineTo(xNow, h - 22);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = "rgba(251,191,36,0.96)";
    ctx.font = "12px system-ui, sans-serif";
    ctx.fillText("ahora", Math.min(w - 34, xNow + 4), 20);
  }

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

  for (const zone of arrowZones) {
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "900 30px system-ui, sans-serif";

    ctx.save();
    ctx.translate(zone.centerX, zone.upY);
    ctx.scale(1.18, 1);
    ctx.globalAlpha = zone.upSelected ? 0.88 : 0.34;
    ctx.fillStyle = zone.upSelected ? "rgba(34,197,94,0.96)" : "rgba(34,197,94,0.82)";
    ctx.fillText("⬆", 0, 0);
    ctx.restore();

    ctx.save();
    ctx.translate(zone.centerX, zone.downY);
    ctx.scale(1.18, 1);
    ctx.globalAlpha = zone.downSelected ? 0.88 : 0.34;
    ctx.fillStyle = zone.downSelected ? "rgba(239,68,68,0.96)" : "rgba(239,68,68,0.82)";
    ctx.fillText("⬇", 0, 0);
    ctx.restore();

    ctx.restore();
  }

  const lx = xOf(pts[pts.length - 1].ms);
  const ly = yOf(pts[pts.length - 1].quote);
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.beginPath();
  ctx.arc(lx, ly, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}
function setPracticePassButtonMode(mode = "PASS") {
  if (!practicePassBtn) return;
  const isNext = mode === "NEXT";
  practicePassBtn.dataset.mode = isNext ? "NEXT" : "PASS";
  practicePassBtn.textContent = isNext ? "🎲 SIGUIENTE" : "⏭️ PASAR";
  practicePassBtn.classList.toggle("is-next", isNext);
}
function setPracticeDecisionState(disabled, selected = "") {
  const map = [
    [practiceCallBtn, "CALL"],
    [practicePutBtn, "PUT"],
    [practicePassBtn, "PASS"],
  ];
  map.forEach(([btn, key]) => {
    if (!btn) return;
    const isNextBtn = btn === practicePassBtn && btn.dataset.mode === "NEXT";
    btn.disabled = isNextBtn ? false : !!disabled;
    btn.classList.toggle("selected", !isNextBtn && selected === key);
  });
}
function getPracticeActiveMarks() {
  return practiceRound?.segmentMarks || freshPracticeSegmentMarks();
}
function togglePracticeSegmentMark(segIndex, choice) {
  if (!practiceRound || !Array.isArray(practiceRound.segmentMarks)) return;
  if (practiceRound.finished) return;
  const current = practiceRound.segmentMarks[segIndex] || "";
  practiceRound.segmentMarks[segIndex] = current === choice ? "" : choice;
  const visibleTicks = buildPracticeVisibleTicks(practiceRound.ticks, practiceRound.replayMs || practiceRound.cutoffMs);
  drawPracticeChart(practiceCanvas, visibleTicks, practiceRound.replayMs || practiceRound.cutoffMs, practiceRound.segmentMarks);
}
function handlePracticeCanvasPick(ev) {
  if (!practiceRound || !practiceCanvas || !practiceChoiceHitZones.length) return;
  const rect = practiceCanvas.getBoundingClientRect();
  const x = ev.clientX - rect.left;
  const y = ev.clientY - rect.top;
  const hit = practiceChoiceHitZones.find((z) => x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h);
  if (!hit) return;
  togglePracticeSegmentMark(hit.segIndex, hit.choice);
}
function updatePracticeStatusText(text) {
  if (practiceStatusEl) practiceStatusEl.textContent = text;
}
function updatePracticeResult(text, cls = "") {
  if (!practiceResultEl) return;
  practiceResultEl.textContent = text;
  practiceResultEl.classList.remove("is-itm", "is-otm", "is-pass");
  if (cls) practiceResultEl.classList.add(cls);
}
function setPracticeSimilarButtonVisible(show) {
  if (!practiceSimilarBtn) return;
  practiceSimilarBtn.classList.toggle("hidden", !show);
}
function hidePracticeSimilarPanel() {
  if (!practiceSimilarPanel) return;
  practiceSimilarPanel.classList.add("hidden");
}
function resetPracticeSimilarState() {
  practiceSimilarResults = [];
  if (practiceSimilarBtn) {
    practiceSimilarBtn.textContent = "🔎 Ver similares";
    practiceSimilarBtn.disabled = false;
  }
  if (practiceSimilarMetaEl) practiceSimilarMetaEl.textContent = "Comparación por similitud";
  if (practiceSimilarListEl) practiceSimilarListEl.innerHTML = "";
  hidePracticeSimilarPanel();
  setPracticeSimilarButtonVisible(false);
}
function clipPracticeTicksToMs(ticks, cutoffMs) {
  const pts = normalizePracticeTicks(ticks).filter((t) => Number.isFinite(t?.ms) && Number.isFinite(t?.quote) && t.ms <= cutoffMs);
  if (!pts.length) return [];
  if (pts[0].ms > 0) pts.unshift({ ms: 0, quote: pts[0].quote });
  const last = pts[pts.length - 1];
  if (last.ms < cutoffMs) pts.push({ ms: cutoffMs, quote: last.quote });
  return pts;
}
function avgAbsDiff(a, b) {
  const n = Math.min(a.length, b.length);
  if (!n) return 0;
  let acc = 0;
  for (let i = 0; i < n; i++) acc += Math.abs(Number(a[i] || 0) - Number(b[i] || 0));
  return acc / n;
}
function rmsDiff(a, b) {
  const n = Math.min(a.length, b.length);
  if (!n) return 0;
  let acc = 0;
  for (let i = 0; i < n; i++) {
    const d = Number(a[i] || 0) - Number(b[i] || 0);
    acc += d * d;
  }
  return Math.sqrt(acc / n);
}
function buildPracticeSignature(ticks, cutoffMs, sampleCount = 28) {
  const pts = clipPracticeTicksToMs(ticks, cutoffMs);
  if (pts.length < 2) return null;

  const base = Number(getPriceAtMs(pts, 0));
  const end = Number(getPriceAtMs(pts, cutoffMs));
  if (!Number.isFinite(base) || !Number.isFinite(end)) return null;

  const qs = pts.map((p) => Number(p.quote));
  let minQ = Math.min(...qs);
  let maxQ = Math.max(...qs);
  let range = maxQ - minQ;
  if (!Number.isFinite(range) || range < 1e-9) range = 1;

  const values = [];
  for (let i = 0; i < sampleCount; i++) {
    const ms = (cutoffMs * i) / Math.max(1, sampleCount - 1);
    const q = Number(getPriceAtMs(pts, ms));
    values.push((q - base) / range);
  }

  const slopes = [];
  for (let i = 1; i < values.length; i++) slopes.push(values[i] - values[i - 1]);

  const cp = [0, cutoffMs * 0.25, cutoffMs * 0.5, cutoffMs * 0.75, cutoffMs];
  const segMoves = [];
  for (let i = 1; i < cp.length; i++) {
    const a = Number(getPriceAtMs(pts, cp[i - 1]));
    const b = Number(getPriceAtMs(pts, cp[i]));
    segMoves.push((b - a) / range);
  }

  const dirSign = Math.sign(end - base) || 1;
  const dirWhole = directionalRatio(pts, dirSign);
  const retrace = maxRetraceAgainst(pts, dirSign) / range;
  const finalStartMs = Math.max(0, cutoffMs - Math.min(10000, cutoffMs));
  const finalStartQ = Number(getPriceAtMs(pts, finalStartMs));
  const finalStretch = Number.isFinite(finalStartQ) ? (end - finalStartQ) / range : 0;

  return {
    values,
    slopes,
    segMoves,
    net: (end - base) / range,
    retrace,
    dirWhole,
    finalStretch,
  };
}
function computePracticeSimilarityScore(baseSig, candidateSig) {
  if (!baseSig || !candidateSig) return 0;

  const pathDiff = rmsDiff(baseSig.values, candidateSig.values);
  const slopeDiff = avgAbsDiff(baseSig.slopes, candidateSig.slopes);
  const segDiff = avgAbsDiff(baseSig.segMoves, candidateSig.segMoves);
  const netDiff = Math.abs(baseSig.net - candidateSig.net);
  const retraceDiff = Math.abs(baseSig.retrace - candidateSig.retrace);
  const dirDiff = Math.abs(baseSig.dirWhole - candidateSig.dirWhole);
  const finalDiff = Math.abs(baseSig.finalStretch - candidateSig.finalStretch);

  const distance =
    pathDiff * 1.65 +
    slopeDiff * 1.10 +
    segDiff * 1.20 +
    netDiff * 0.70 +
    retraceDiff * 0.55 +
    dirDiff * 0.40 +
    finalDiff * 0.55;

  return Math.max(0, Math.min(100, Math.round(100 * Math.exp(-distance * 0.75))));
}
function findPracticeSimilarEntries(entry, cutoffMs, limit = 6) {
  const entryKey = String(entry?.journal_id || entry?.id || "");
  const baseSig = buildPracticeSignature(entry?.ticks || [], cutoffMs);
  if (!entryKey || !baseSig) return [];

  return getEligiblePracticeEntries()
    .filter((candidate) => String(candidate?.journal_id || candidate?.id || "") !== entryKey)
    .map((candidate) => {
      const sig = buildPracticeSignature(candidate?.ticks || [], cutoffMs);
      const similarity = computePracticeSimilarityScore(baseSig, sig);
      return { ...candidate, similarity };
    })
    .filter((candidate) => candidate.similarity > 0)
    .sort((a, b) => b.similarity - a.similarity || Number(b.saved_at || 0) - Number(a.saved_at || 0))
    .slice(0, limit);
}
function practiceSimilarOutcomeText(outcome) {
  if (outcome === "up") return "NEXT alcista";
  if (outcome === "down") return "NEXT bajista";
  if (outcome === "flat") return "NEXT neutra";
  return "NEXT pendiente";
}
function practiceSimilarTradeText(entry) {
  const badge = String(entry?.trade?.badge || "");
  if (badge === "ITM") return "🎯 ITM";
  if (badge === "OTM") return "💥 OTM";
  return "⏳ TRADE";
}
function practiceSimilarToneClass(entry) {
  const badge = String(entry?.trade?.badge || "");
  if (badge === "ITM") return "is-itm";
  if (badge === "OTM") return "is-otm";
  return "is-pass";
}
function drawPracticeSimilarMiniChart(canvas, ticks, cutoffMs) {
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

  const pts = clipPracticeTicksToMs(ticks, cutoffMs);
  if (pts.length < 2) return;

  const qs = pts.map((p) => Number(p.quote));
  let min = Math.min(...qs);
  let max = Math.max(...qs);
  let range = max - min;
  if (!Number.isFinite(range) || range < 1e-9) range = 1;
  const pad = range * 0.08;
  min -= pad;
  max += pad;

  const xOf = (ms) => (ms / cutoffMs) * (w - 16) + 8;
  const yOf = (q) => (1 - (q - min) / (max - min)) * (h - 18) + 9;

  ctx.fillStyle = "rgba(255,255,255,0.03)";
  ctx.fillRect(0, 0, w, h);

  for (let i = 1; i <= 3; i++) {
    const x = (w / 4) * i;
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, 8);
    ctx.lineTo(x, h - 8);
    ctx.stroke();
    ctx.restore();
  }

  ctx.beginPath();
  ctx.moveTo(xOf(pts[0].ms), h - 8);
  for (const p of pts) ctx.lineTo(xOf(p.ms), yOf(p.quote));
  ctx.lineTo(xOf(pts[pts.length - 1].ms), h - 8);
  ctx.closePath();
  ctx.globalAlpha = 0.16;
  ctx.fillStyle = "rgba(255,255,255,0.82)";
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.strokeStyle = "rgba(255,255,255,0.96)";
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  pts.forEach((p, idx) => {
    const x = xOf(p.ms);
    const y = yOf(p.quote);
    if (!idx) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  const last = pts[pts.length - 1];
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.beginPath();
  ctx.arc(xOf(last.ms), yOf(last.quote), 3, 0, Math.PI * 2);
  ctx.fill();
}
function renderPracticeSimilarResults(results, cutoffMs) {
  if (!practiceSimilarPanel || !practiceSimilarListEl) return;

  practiceSimilarPanel.classList.remove("hidden");
  if (practiceSimilarMetaEl) {
    const secLabel = Math.round(cutoffMs / 1000);
    practiceSimilarMetaEl.textContent = `Comparando solo la forma vista hasta ${secLabel}s · ${results.length} hallazgo${results.length === 1 ? "" : "s"} · sin filtrar por modo`;
  }

  if (!results.length) {
    practiceSimilarListEl.innerHTML = `<div class="practiceSimilarEmpty">No encontré suficientes formaciones parecidas con el historial actual.</div>`;
    return;
  }

  practiceSimilarListEl.innerHTML = results
    .map(
      (entry, idx) => `
        <div class="practiceSimilarCard ${practiceSimilarToneClass(entry)}" data-similar-idx="${idx}">
          <div class="practiceSimilarCardHead">
            <div class="practiceSimilarPct">${entry.similarity}%</div>
            <div class="practiceSimilarMain">
              <div class="practiceSimilarTop">${escapeHtml(entry.symbol || "—")} · ${escapeHtml(labelDir(entry.direction || "PUT"))}</div>
              <div class="practiceSimilarSub">${escapeHtml(entry.time || "—")} · modo ${escapeHtml(entry.mode || "—")}</div>
              <div class="practiceSimilarTags">
                <span class="practiceSimilarTag">${escapeHtml(practiceSimilarOutcomeText(entry.nextOutcome))}</span>
                <span class="practiceSimilarTag">${escapeHtml(practiceSimilarTradeText(entry))}</span>
              </div>
            </div>
          </div>
          <canvas class="practiceSimilarCanvas"></canvas>
        </div>
      `
    )
    .join("");

  practiceSimilarListEl.querySelectorAll(".practiceSimilarCard").forEach((card, idx) => {
    const canvas = card.querySelector(".practiceSimilarCanvas");
    const entry = results[idx];
    drawPracticeSimilarMiniChart(canvas, entry?.ticks || [], cutoffMs);
  });
}
function togglePracticeSimilarResults() {
  if (!practiceRound || !practiceRound.finished || !practiceRound.entry) return;
  if (!practiceSimilarBtn) return;

  const isOpen = practiceSimilarPanel && !practiceSimilarPanel.classList.contains("hidden");
  if (isOpen) {
    hidePracticeSimilarPanel();
    practiceSimilarBtn.textContent = "🔎 Ver similares";
    return;
  }

  if (!practiceSimilarResults.length) {
    practiceSimilarBtn.disabled = true;
    practiceSimilarBtn.textContent = "⏳ Buscando similares…";
    practiceSimilarResults = findPracticeSimilarEntries(practiceRound.entry, practiceRound.cutoffMs, 6);
    practiceSimilarBtn.disabled = false;
  }

  renderPracticeSimilarResults(practiceSimilarResults, practiceRound.cutoffMs);
  practiceSimilarBtn.textContent = "🙈 Ocultar similares";
}
function redrawPracticeSimilarCanvases() {
  if (!practiceSimilarPanel || practiceSimilarPanel.classList.contains("hidden")) return;
  if (!practiceSimilarListEl || !practiceSimilarResults.length || !practiceRound) return;

  practiceSimilarListEl.querySelectorAll(".practiceSimilarCard").forEach((card, idx) => {
    const canvas = card.querySelector(".practiceSimilarCanvas");
    const entry = practiceSimilarResults[idx];
    drawPracticeSimilarMiniChart(canvas, entry?.ticks || [], practiceRound.cutoffMs);
  });
}
function pullNextPracticeEntry() {
  ensurePracticeQueue();
  updatePracticePoolLabel();
  if (!practiceQueue.length) return null;
  const nextId = String(practiceQueue.shift());
  updatePracticePoolLabel();
  return getEligiblePracticeEntries().find((x) => String(x.journal_id || x.id || "") === nextId) || null;
}
function getOutcomeLabel(outcome) {
  return outcome === "up" ? "ALCISTA" : outcome === "down" ? "BAJISTA" : "NEUTRA";
}
function cancelPracticeAnim() {
  if (practiceRaf) cancelAnimationFrame(practiceRaf);
  practiceRaf = null;
}
function finalizePracticeRound(answer = null) {
  if (!practiceRound || practiceRound.finished) return;
  cancelPracticeAnim();

  const round = practiceRound;
  round.finished = true;
  round.answer = answer || round.answer || "PASS";
  round.replayMs = 60000;

  let resultType = "PASS";
  if (round.answer === "CALL" || round.answer === "PUT") {
    const ok = (round.answer === "CALL" && round.entry.nextOutcome === "up") ||
      (round.answer === "PUT" && round.entry.nextOutcome === "down");
    resultType = ok ? "ITM" : "OTM";
  }
  round.resultType = resultType;

  practiceSessionStats.total += 1;
  practiceAllStats.total += 1;
  if (resultType === "ITM") {
    practiceSessionStats.itm += 1;
    practiceAllStats.itm += 1;
  } else if (resultType === "OTM") {
    practiceSessionStats.otm += 1;
    practiceAllStats.otm += 1;
  } else {
    practiceSessionStats.pass += 1;
    practiceAllStats.pass += 1;
  }
  savePracticeAllStats();
  renderPracticeStats();

  const fullTicks = buildPracticeVisibleTicks(round.ticks, 60000);
  drawPracticeChart(practiceCanvas, fullTicks, 60000, round.segmentMarks);
  setPracticeDecisionState(true, round.answer);

  const outcomeText = getOutcomeLabel(round.entry.nextOutcome);
  if (resultType === "ITM") {
    updatePracticeResult(`✅ ITM | Tu decisión: ${round.answer === "CALL" ? "COMPRA" : "VENTA"} | Próxima vela: ${outcomeText}`, "is-itm");
  } else if (resultType === "OTM") {
    updatePracticeResult(`❌ OTM | Tu decisión: ${round.answer === "CALL" ? "COMPRA" : "VENTA"} | Próxima vela: ${outcomeText}`, "is-otm");
  } else {
    updatePracticeResult(`⏭️ PASAR | Próxima vela: ${outcomeText}`, "is-pass");
  }

  setPracticePassButtonMode("NEXT");
  setPracticeDecisionState(true, round.answer);
  practiceSimilarResults = [];
  if (getEligiblePracticeEntries().length > 1) setPracticeSimilarButtonVisible(true);
  if (practiceSimilarBtn) practiceSimilarBtn.textContent = "🔎 Ver similares";
  updatePracticeStatusText(`Ronda terminada. Toca VER SIMILARES o SIGUIENTE para continuar sin repetir hasta agotar el pool.`);
}
function practiceLoop(ts) {
  if (!practiceRound || practiceRound.finished) return;
  if (!practiceRound.startTs) practiceRound.startTs = ts;
  const elapsed = Math.max(0, ts - practiceRound.startTs);
  const replayMs = Math.min(60000, practiceRound.cutoffMs + elapsed);
  practiceRound.replayMs = replayMs;

  const visibleTicks = buildPracticeVisibleTicks(practiceRound.ticks, replayMs);
  drawPracticeChart(practiceCanvas, visibleTicks, replayMs, practiceRound.segmentMarks);

  const remainingSec = Math.max(0, Math.ceil((60000 - replayMs) / 1000));
  const tramo = replayMs < 15000 ? "0-15s" : replayMs < 30000 ? "15-30s" : replayMs < 45000 ? "30-45s" : "45-60s";
  const picked = practiceRound.answer === "CALL" ? "COMPRA" : practiceRound.answer === "PUT" ? "VENTA" : practiceRound.answer === "PASS" ? "PASAR" : "—";
  updatePracticeStatusText(`Tiempo para decidir: ${remainingSec}s | tramo: ${tramo} | decisión: ${picked}`);

  if (replayMs >= 60000) {
    finalizePracticeRound(practiceRound.answer || "PASS");
    return;
  }
  practiceRaf = requestAnimationFrame(practiceLoop);
}
function startPracticeRound(entry = null) {
  resetPracticeSimilarState();
  const chosen = entry || pullNextPracticeEntry();
  if (!chosen) {
    updatePracticeStatusText("No hay trades suficientes en el journal para practicar todavía.");
    updatePracticeResult("Necesitas trades con ticks completos y nextOutcome resuelto.", "is-pass");
    if (practiceRoundLabelEl) practiceRoundLabelEl.textContent = "Sin ronda";
    if (practiceCanvas) {
      const ctx = practiceCanvas.getContext("2d");
      ctx.clearRect(0, 0, practiceCanvas.width, practiceCanvas.height);
      practiceChoiceHitZones = [];
    }
    setPracticePassButtonMode("NEXT");
    setPracticeDecisionState(true);
    return;
  }

  cancelPracticeAnim();
  practiceRound = {
    entry: chosen,
    ticks: normalizePracticeTicks(chosen.ticks),
    cutoffMs: EVAL_SEC * 1000,
    startTs: 0,
    replayMs: EVAL_SEC * 1000,
    answer: null,
    finished: false,
    segmentMarks: freshPracticeSegmentMarks(),
  };

  if (practiceRoundLabelEl) {
    practiceRoundLabelEl.textContent = `${chosen.symbol} | ${chosen.mode || "NORMAL"} | ${chosen.time}`;
  }
  updatePracticePoolLabel();
  updatePracticeResult("Elige COMPRA, VENTA o PASAR antes de que termine la vela.");
  setPracticePassButtonMode("PASS");
  setPracticeDecisionState(false);

  const initialTicks = buildPracticeVisibleTicks(practiceRound.ticks, practiceRound.cutoffMs);
  drawPracticeChart(practiceCanvas, initialTicks, practiceRound.cutoffMs, practiceRound.segmentMarks);
  practiceRaf = requestAnimationFrame(practiceLoop);
}
function ensurePracticeReady() {
  renderPracticeStats();
  paintPracticeSecButtons();
  ensurePracticeQueue();
  updatePracticePoolLabel();
  if (!practiceRound) {
    resetPracticeSimilarState();
    updatePracticeStatusText("Toca PASAR para empezar una ronda con trades aleatorios sin repetir. En Práctica, las señales quedan pausadas.");
    updatePracticeResult("Se usa tu journal de trades. PASAR no entra en el porcentaje.", "is-pass");
    setPracticePassButtonMode("NEXT");
    setPracticeDecisionState(true);
  } else if (practiceRound.finished) {
    if (getEligiblePracticeEntries().length > 1) setPracticeSimilarButtonVisible(true);
    setPracticePassButtonMode("NEXT");
    setPracticeDecisionState(true, practiceRound.answer || "");
    drawPracticeChart(practiceCanvas, buildPracticeVisibleTicks(practiceRound.ticks, 60000), 60000, practiceRound.segmentMarks);
    redrawPracticeSimilarCanvases();
  } else {
    resetPracticeSimilarState();
    setPracticePassButtonMode("PASS");
  }
}


/* =========================
   Settings modal (solo engranaje)
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
   Export helpers
========================= */
function downloadTextFile(filename, text, mime = "application/json") {
  try {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  } catch {
    alert("No se pudo descargar el archivo. Probá copiar desde el portapapeles.");
  }
}

/* =========================
   Export (solo señales con voto)
========================= */
function buildExportPayloadVoted() {
  const voted = (history || []).filter((it) => it && it.vote);
  return {
    exported_at: new Date().toISOString(),
    count_total_history: (history || []).length,
    count_voted: voted.length,
    signals: voted.map((it) => ({
      id: it.id,
      minute: it.minute,
      time: it.time,
      symbol: it.symbol,
      direction: it.direction,
      mode: it.mode,
      vote: it.vote,
      comment: it.comment || "",
      nextOutcome: it.nextOutcome || "",
      trade: it.trade || null,
      minuteComplete: !!it.minuteComplete,
      ticks: Array.isArray(it.ticks) ? it.ticks : [],
    })),
  };
}
async function exportVotedSignals() {
  const payload = buildExportPayloadVoted();
  const json = JSON.stringify(payload, null, 2);

  if (!payload.count_voted) {
    alert("No hay señales con voto (like/dislike) para exportar todavía.");
    return;
  }

  try {
    await navigator.clipboard.writeText(json);
    alert(`✅ Exportado al portapapeles (${payload.count_voted}). Pegalo acá en el chat.`);
    return;
  } catch {
    const ts = new Date().toISOString().replaceAll(":", "-");
    downloadTextFile(`deriv-signals-voted-${ts}.json`, json);
    alert(`📥 Descargado JSON (${payload.count_voted}).`);
  }
}
function ensureExportButton() {
  let btn = document.getElementById("exportVotedBtn");
  if (btn) return btn;

  const host =
    document.querySelector("#settingsModal .settingsBody .controls") ||
    document.querySelector(".settingsBody .controls") ||
    null;

  if (!host) return null;

  btn = document.createElement("button");
  btn.id = "exportVotedBtn";
  btn.type = "button";
  btn.className = "btn btnGhost";
  btn.textContent = "📤 Exportar (solo con voto)";
  btn.title = "Copia al portapapeles / descarga JSON con señales like/dislike";
  host.appendChild(btn);

  return btn;
}
(function initExportVoted() {
  const btn = ensureExportButton();
  if (!btn) return;
  btn.onclick = exportVotedSignals;
})();

/* =========================
   Export Trades (journal)
========================= */
function buildExportPayloadTrades() {
  return {
    exported_at: new Date().toISOString(),
    count_trades: (tradesJournal || []).length,
    trades: (tradesJournal || []).map((t) => ({
      journal_id: t.journal_id,
      saved_at: t.saved_at,
      id: t.id,
      minute: t.minute,
      time: t.time,
      symbol: t.symbol,
      direction: t.direction,
      mode: t.mode,
      nextOutcome: t.nextOutcome || "",
      trade: t.trade || null,
      ticks: Array.isArray(t.ticks) ? t.ticks : [],
    })),
  };
}
async function exportTradesJournal() {
  const payload = buildExportPayloadTrades();
  const json = JSON.stringify(payload, null, 2);

  if (!payload.count_trades) {
    alert("No hay trades guardados todavía.");
    return;
  }

  try {
    await navigator.clipboard.writeText(json);
    alert(`✅ Trades exportados al portapapeles (${payload.count_trades}). Pegalo acá en el chat.`);
    return;
  } catch {
    const ts = new Date().toISOString().replaceAll(":", "-");
    downloadTextFile(`deriv-trades-journal-${ts}.json`, json);
    alert(`📥 Descargado JSON (${payload.count_trades}).`);
  }
}
function ensureExportTradesButton() {
  const host =
    document.querySelector("#settingsModal .settingsBody .controls") ||
    document.querySelector(".settingsBody .controls") ||
    null;
  if (!host) return null;

  let btn = document.getElementById("exportTradesBtn");
  if (btn) return btn;

  btn = document.createElement("button");
  btn.id = "exportTradesBtn";
  btn.type = "button";
  btn.className = "btn btnGhost";
  btn.textContent = "📤 Exportar Trades (estudio)";
  btn.title = "Copia al portapapeles / descarga JSON del journal de trades";
  host.appendChild(btn);
  return btn;
}

/* =========================
   ✅ Modal Config: sacar botones borrar y dejar solo export/reset/etc
========================= */
function ensureSplitClearButtons() {
  const host =
    document.querySelector("#settingsModal .settingsBody .controls") ||
    document.querySelector(".settingsBody .controls") ||
    null;
  if (!host) return;

  // ocultar el botón viejo si existe
  if (clearHistoryBtn) clearHistoryBtn.style.display = "none";

  const expT = ensureExportTradesButton();
  if (expT) expT.onclick = exportTradesJournal;

  let btn = document.getElementById("clearTradesConfigBtn");
  if (!btn) {
    btn = document.createElement("button");
    btn.id = "clearTradesConfigBtn";
    btn.type = "button";
    btn.className = "btn btnGhost";
    btn.textContent = "🗑️ Borrar Trades";
    btn.title = "Borra solo el historial de trades guardados para estudio";
    host.appendChild(btn);
  }

  btn.onclick = () => {
    if (!confirm("¿Borrar SOLO el historial de trades guardados para estudio?")) return;
    clearTradesOnly();
  };
}

/* =========================
   Theme
========================= */
function applyTheme(theme) {
  const isLight = theme === "light";
  document.body.classList.toggle("light", isLight);
  if (themeBtn) themeBtn.textContent = isLight ? "☀️ Claro" : "🌙 Oscuro";
  localStorage.setItem("theme", theme);
}
(function initTheme() {
  applyTheme(localStorage.getItem("theme") || "dark");
  if (themeBtn)
    themeBtn.onclick = () => {
      const current = document.body.classList.contains("light") ? "light" : "dark";
      applyTheme(current === "light" ? "dark" : "light");
    };
})();

/* =========================
   Eval sec + ESCALERA mode
========================= */
(function initEvalMode() {
  const savedSec = parseInt(localStorage.getItem("evalSec") || "45", 10);
  EVAL_SEC = [40, 45].includes(savedSec) ? savedSec : 45;

  const paintEval = () =>
    evalBtns.forEach((b) => {
      const sec = parseInt(b.dataset.sec || "0", 10);
      b.classList.toggle("active", sec === EVAL_SEC);
    });
  paintEval();
  try { paintPracticeSecButtons(); } catch {}

  evalBtns.forEach(
    (b) =>
      (b.onclick = () => {
        const v = parseInt(b.dataset.sec || "45", 10);
        EVAL_SEC = [40, 45].includes(v) ? v : 45;
        localStorage.setItem("evalSec", String(EVAL_SEC));
        paintEval();
        try { paintPracticeSecButtons(); } catch {}
      })
  );

  // ✅ PATRÓN ESCALERA (compat: si venías usando GIRO, hereda ese estado una sola vez)
  const hasStairKey = localStorage.getItem("stairMode") !== null;
  stairMode = loadBool("stairMode", false);

  if (!hasStairKey) {
    stairMode = loadBool("giroMode", false) || loadBool("strongMode", false);
    saveBool("stairMode", stairMode);
  }

  const paintMode = () => {
    if (!modeBtn) return;
    modeBtn.textContent = stairMode ? "🟪 Patrón ESCALERA" : "🟦 Modo NORMAL";
    modeBtn.classList.toggle("active-strong", stairMode);
  };
  paintMode();

  if (modeBtn)
    modeBtn.onclick = () => {
      stairMode = !stairMode;
      saveBool("stairMode", stairMode);

      // compat vieja: apagamos GIRO / STRONG
      saveBool("giroMode", false);
      saveBool("strongMode", false);

      paintMode();
    };
})();

/* =========================
   Sonido
========================= */
(function initSoundToggle() {
  soundEnabled = loadBool("soundEnabled", false);
  setBtnActive(soundBtn, soundEnabled);
  if (soundBtn) soundBtn.textContent = soundEnabled ? "🔊 Sonido ON" : "🔇 Sonido OFF";
  if (!soundBtn || !sound) return;

  soundBtn.onclick = async () => {
    if (!soundEnabled) {
      try {
        sound.muted = false;
        sound.volume = 1;
        sound.currentTime = 0;
        await sound.play();
        sound.pause();
        soundEnabled = true;
        saveBool("soundEnabled", true);
        setBtnActive(soundBtn, true);
        soundBtn.textContent = "🔊 Sonido ON";
      } catch {
        alert("⚠️ El navegador bloqueó el audio. Tocá nuevamente.");
      }
      return;
    }
    soundEnabled = false;
    saveBool("soundEnabled", false);
    setBtnActive(soundBtn, false);
    soundBtn.textContent = "🔇 Sonido OFF";
  };
})();

/* =========================
   Vibración
========================= */
(function initVibrationToggle() {
  vibrateEnabled = loadBool("vibrateEnabled", true);
  if (!vibrateBtn) return;
  setBtnActive(vibrateBtn, vibrateEnabled);
  vibrateBtn.textContent = vibrateEnabled ? "📳 Vibración ON" : "📳 Vibración OFF";

  vibrateBtn.onclick = () => {
    vibrateEnabled = !vibrateEnabled;
    saveBool("vibrateEnabled", vibrateEnabled);
    setBtnActive(vibrateBtn, vibrateEnabled);
    vibrateBtn.textContent = vibrateEnabled ? "📳 Vibración ON" : "📳 Vibración OFF";
    if (vibrateEnabled && "vibrate" in navigator) navigator.vibrate([80]);
  };
})();

/* =========================
   Copy feedback
========================= */

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

  const msNow = modalCurrentItem && modalLive && isItemLiveMinute(modalCurrentItem)
    ? Math.max(0, Math.min(60000, serverNowMs() - currentMinuteStartMs))
    : null;

  const segments = [
    { start: 0, end: 15000, label: "0s" },
    { start: 15000, end: 30000, label: "15s" },
    { start: 30000, end: 45000, label: "30s" },
    { start: 45000, end: 60000, label: "45s" },
  ];

  // sombreado por tramo
  for (const seg of segments) {
    const x1 = xOf(seg.start);
    const x2 = xOf(seg.end);

    let fill = "rgba(255,255,255,0.03)";
    if (msNow != null) {
      if (msNow >= seg.end) fill = "rgba(34,211,238,0.10)";
      else if (msNow >= seg.start && msNow < seg.end) fill = "rgba(251,191,36,0.10)";
      else fill = "rgba(255,255,255,0.025)";
    }

    ctx.fillStyle = fill;
    ctx.fillRect(x1, 8, Math.max(0, x2 - x1), h - 32);
  }

  // grilla horizontal
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

  // líneas verticales punteadas 0/15/30/45
  const guideMarks = [0, 15000, 30000, 45000];
  for (const ms of guideMarks) {
    const x = xOf(ms);

    ctx.save();
    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = ms === 30000 ? "rgba(255,255,255,0.42)" : "rgba(255,255,255,0.26)";
    ctx.lineWidth = ms === 30000 ? 1.8 : 1.2;
    ctx.beginPath();
    ctx.moveTo(x, 10);
    ctx.lineTo(x, h - 22);
    ctx.stroke();
    ctx.restore();

    const label = ms === 0 ? "0s" : ms === 15000 ? "15s" : ms === 30000 ? "30s" : "45s";
    ctx.fillStyle = "rgba(255,255,255,0.78)";
    ctx.font = "12px system-ui, sans-serif";
    ctx.fillText(label, Math.min(w - 26, x + 4), h - 6);
  }

  // línea de “ahora” en live
  if (msNow != null) {
    const xNow = xOf(msNow);
    ctx.save();
    ctx.setLineDash([2, 4]);
    ctx.strokeStyle = "rgba(251,191,36,0.95)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(xNow, 8);
    ctx.lineTo(xNow, h - 22);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = "rgba(251,191,36,0.96)";
    ctx.font = "12px system-ui, sans-serif";
    ctx.fillText("ahora", Math.min(w - 34, xNow + 4), 20);
  }

  // área
  ctx.beginPath();
  ctx.moveTo(xOf(pts[0].ms), h - 20);
  for (const p of pts) ctx.lineTo(xOf(p.ms), yOf(p.quote));
  ctx.lineTo(xOf(pts[pts.length - 1].ms), h - 20);
  ctx.closePath();
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.fill();
  ctx.globalAlpha = 1;

  // línea principal
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

  // último punto
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

function getCurrentMinuteRemainingSec() {
  const now = serverNowMs();
  const minuteStart = Number.isFinite(currentMinuteStartMs) && currentMinuteStartMs
    ? currentMinuteStartMs
    : Math.floor(now / 60000) * 60000;

  const msInMinute = ((now - minuteStart) % 60000 + 60000) % 60000;
  return 60 - Math.max(0, Math.min(59, Math.floor(msInMinute / 1000)));
}
function getCurrent15sRangeLabel() {
  const now = serverNowMs();
  const minuteStart = Number.isFinite(currentMinuteStartMs) && currentMinuteStartMs
    ? currentMinuteStartMs
    : Math.floor(now / 60000) * 60000;

  const msInMinute = ((now - minuteStart) % 60000 + 60000) % 60000;
  const sec = Math.floor(msInMinute / 1000);

  if (sec < 15) return "0-15s";
  if (sec < 30) return "15-30s";
  if (sec < 45) return "30-45s";
  return "45-60s";
}
function isTradeEntryOpen(item) {
  if (!item) return false;
  return isItemLiveMinute(item);
}
function ensureModalCandleStatusBar() {
  if (modalCandleStatusEl) return modalCandleStatusEl;

  const footer =
    document.querySelector("#chartModal .modalFooter") ||
    (chartModal ? chartModal.querySelector(".modalFooter") : null);

  if (!footer) return null;

  let el = footer.querySelector(".candleStatusBar");
  if (!el) {
    el = document.createElement("div");
    el.className = "candleStatusBar";
    el.setAttribute("role", "status");
    el.style.width = "100%";
    el.style.boxSizing = "border-box";
    el.style.margin = "0 0 10px 0";
    el.style.padding = "12px 14px";
    el.style.borderRadius = "14px";
    el.style.border = "1px solid rgba(255,255,255,.14)";
    el.style.fontWeight = "900";
    el.style.fontSize = "14px";
    el.style.letterSpacing = "0.3px";
    el.style.textAlign = "center";
    el.style.transition = "opacity .12s ease, transform .12s ease";
    footer.prepend(el);
  }

  modalCandleStatusEl = el;
  return modalCandleStatusEl;
}
function paintTradeButtonLocked(btn, locked, remainMs = 0, candleClosed = false) {
  if (!btn) return;

  if (!btn.dataset.baseLabel) btn.dataset.baseLabel = btn.textContent || "";

  if (locked) {
    btn.disabled = true;
    btn.textContent = `🔒 ${btn.dataset.baseLabel.replace(/^🔒\s*/g, "")}`;
    btn.style.filter = "grayscale(1) saturate(0.7)";
    btn.style.opacity = "0.48";
    btn.style.transform = "none";
    btn.title = `Bloqueado por disciplina. Falta ${fmtRemaining(remainMs)}`;
    return;
  }

  if (candleClosed) {
    btn.disabled = true;
    btn.textContent = btn.dataset.baseLabel.replace(/^🔒\s*/g, "");
    btn.style.filter = "grayscale(1) saturate(0.72)";
    btn.style.opacity = "0.42";
    btn.style.transform = "none";
    btn.title = "La vela ya cerró";
    return;
  }

  btn.disabled = false;
  btn.textContent = btn.dataset.baseLabel.replace(/^🔒\s*/g, "");
  btn.style.filter = "";
  btn.style.opacity = "";
  btn.title = "Operar DEMO 1m";
}
function updateModalCandleStatusUI() {
  const bar = ensureModalCandleStatusBar();
  if (!bar) return;

  if (!chartModal || chartModal.classList.contains("hidden") || !modalCurrentItem) {
    bar.style.display = "none";
    return;
  }

  bar.style.display = "block";

  const isOpen = isTradeEntryOpen(modalCurrentItem);
  if (isOpen) {
    const sec = String(getCurrentMinuteRemainingSec()).padStart(2, "0");
    bar.textContent = `🟢 VELA ABIERTA | faltan ${sec}s`;
    bar.style.color = "#dcfce7";
    bar.style.background = "rgba(22,163,74,.18)";
    bar.style.borderColor = "rgba(34,197,94,.34)";
    bar.style.boxShadow = "0 0 0 1px rgba(34,197,94,.06) inset";
  } else {
    bar.textContent = "⚪ VELA CERRADA";
    bar.style.color = "rgba(229,231,235,.95)";
    bar.style.background = "rgba(107,114,128,.20)";
    bar.style.borderColor = "rgba(156,163,175,.28)";
    bar.style.boxShadow = "none";
  }

  const locked = isTradeLockedNow();
  const remain = locked ? Math.max(0, disciplineLockUntilMs - Date.now()) : 0;
  const candleClosed = !isOpen;

  paintTradeButtonLocked(modalBuyCallBtn, locked, remain, candleClosed);
  paintTradeButtonLocked(modalBuyPutBtn, locked, remain, candleClosed);
}

/* =========================
   LIVE modal draw
========================= */
function updateModalLiveUI() {
  if (!modalLiveBtn) return;
  modalLiveBtn.setAttribute("aria-pressed", modalLive ? "true" : "false");
  modalLiveBtn.textContent = modalLive ? "📡 LIVE ON" : "📡 LIVE OFF";
}
function requestModalDraw(force = false) {
  if (!chartModal || chartModal.classList.contains("hidden")) return;
  if (!modalCurrentItem) return;

  const now = Date.now();
  if (!force && now - modalLastDrawAt < MODAL_DRAW_MIN_INTERVAL_MS) return;
  modalLastDrawAt = now;

  if (modalDrawRaf) cancelAnimationFrame(modalDrawRaf);
  modalDrawRaf = requestAnimationFrame(() => {
    const it = modalCurrentItem;
    if (!it) return; // ✅ FIX: si se cerró el modal entre frames, evita leer it.ticks

    let ticks = it.ticks || [];
    if (modalLive && isItemLiveMinute(it)) {
      const liveTicks = minuteData?.[it.minute]?.[it.symbol];
      if (Array.isArray(liveTicks) && liveTicks.length) ticks = liveTicks;
    }

    drawDerivLikeChart(minuteCanvas, ticks);

    if (modalSub) {
      const n = Array.isArray(ticks) ? ticks.length : 0;
      const tagLive = modalLive && isItemLiveMinute(it) ? " | LIVE" : "";
      const dTag = disciplineTagText();
      const tBadge = it?.trade?.badge ? ` | TRADE:${it.trade.badge}` : "";
      modalSub.textContent = `${it.time} | ticks: ${n}${tagLive}${dTag ? " | " + dTag : ""}${tBadge}`;
    }

    updateModalCandleStatusUI();
  });
}

/* =========================
   Layout botones modal
========================= */
function applyModalTradeButtonsLayout() {
  const bCall = modalBuyCallBtn;
  const bPut = modalBuyPutBtn;
  if (!bCall || !bPut) return;

  const footer =
    document.querySelector("#chartModal .modalFooter") ||
    (chartModal ? chartModal.querySelector(".modalFooter") : null);

  if (!footer) return;

  const statusBar = ensureModalCandleStatusBar();

  let row = footer.querySelector(".tradeRow");
  if (!row) {
    row = document.createElement("div");
    row.className = "tradeRow";
    footer.appendChild(row);
  }

  if (statusBar && statusBar.parentElement !== footer) footer.prepend(statusBar);

  row.style.display = "grid";
  row.style.gridTemplateColumns = "minmax(0,1fr)";
  row.style.gap = "10px";
  row.style.alignItems = "stretch";
  row.style.justifyContent = "stretch";
  row.style.width = "100%";

  if (bCall.parentElement !== row) row.appendChild(bCall);
  if (bPut.parentElement !== row) row.appendChild(bPut);

  const baseBtn = (b) => {
    b.style.width = "100%";
    b.style.flex = "0 0 auto";
    b.style.minWidth = "0";
    b.style.minHeight = "58px";
    b.style.padding = "13px 14px";
    b.style.fontWeight = "900";
    b.style.letterSpacing = "0.25px";
    b.style.borderRadius = "16px";
    b.style.display = "flex";
    b.style.alignItems = "center";
    b.style.justifyContent = "center";
    b.style.gap = "10px";
    b.style.userSelect = "none";
    b.style.touchAction = "manipulation";
  };
  baseBtn(bCall);
  baseBtn(bPut);

  bCall.style.borderColor = "rgba(34,197,94,.85)";
  bCall.style.boxShadow = "0 0 18px rgba(34,197,94,.20), inset 0 0 14px rgba(34,197,94,.08)";
  bCall.style.background = "linear-gradient(180deg, rgba(34,197,94,.24), rgba(34,197,94,.14))";
  bCall.style.color = "var(--text, #e5e7eb)";

  bPut.style.borderColor = "rgba(239,68,68,.85)";
  bPut.style.boxShadow = "0 0 18px rgba(239,68,68,.18), inset 0 0 14px rgba(239,68,68,.07)";
  bPut.style.background = "linear-gradient(180deg, rgba(239,68,68,.22), rgba(239,68,68,.14))";
  bPut.style.color = "var(--text, #e5e7eb)";

  const w = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
  if (w < 480) {
    bCall.style.minHeight = "56px";
    bPut.style.minHeight = "56px";
    bCall.style.padding = "12px 10px";
    bPut.style.padding = "12px 10px";
  }

  if (modalLiveBtn) {
    modalLiveBtn.style.minHeight = "52px";
    modalLiveBtn.style.width = "100%";
    modalLiveBtn.style.marginTop = "10px";
  }
}

/* =========================
   Disciplina (persistencia + UI)
========================= */
function loadDiscipline() {
  try {
    disciplineWindowStartMs = Number(localStorage.getItem(DISCIPLINE_WINDOW_START_KEY) || "0") || 0;
    disciplineWins = Number(localStorage.getItem(DISCIPLINE_WINS_KEY) || "0") || 0;
    disciplineLosses = Number(localStorage.getItem(DISCIPLINE_LOSSES_KEY) || "0") || 0;
    disciplineLockUntilMs = Number(localStorage.getItem(DISCIPLINE_LOCK_UNTIL_KEY) || "0") || 0;

    const raw = localStorage.getItem(DISCIPLINE_PENDING_CONTRACTS_KEY) || "[]";
    const arr = JSON.parse(raw);
    disciplinePendingContracts = Array.isArray(arr) ? arr.map(String) : [];
  } catch {
    disciplineWindowStartMs = 0;
    disciplineWins = 0;
    disciplineLosses = 0;
    disciplineLockUntilMs = 0;
    disciplinePendingContracts = [];
  }
}
function saveDiscipline() {
  try {
    localStorage.setItem(DISCIPLINE_WINDOW_START_KEY, String(disciplineWindowStartMs || 0));
    localStorage.setItem(DISCIPLINE_WINS_KEY, String(disciplineWins || 0));
    localStorage.setItem(DISCIPLINE_LOSSES_KEY, String(disciplineLosses || 0));
    localStorage.setItem(DISCIPLINE_LOCK_UNTIL_KEY, String(disciplineLockUntilMs || 0));
    localStorage.setItem(DISCIPLINE_PENDING_CONTRACTS_KEY, JSON.stringify(disciplinePendingContracts || []));
  } catch {}
}
function addPendingContract(cid) {
  if (!cid) return;
  const s = String(cid);
  if (!disciplinePendingContracts.includes(s)) {
    disciplinePendingContracts.push(s);
    saveDiscipline();
  }
}
function removePendingContract(cid) {
  if (!cid) return;
  const s = String(cid);
  const next = (disciplinePendingContracts || []).filter((x) => String(x) !== s);
  disciplinePendingContracts = next;
  saveDiscipline();
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

  const pend = (disciplinePendingContracts || []).length;
  const pTxt = pend ? ` • Pendientes:${pend}` : "";
  return `Disciplina: ${disciplineWins}/${DISCIPLINE_MAX_WINS}W • ${disciplineLosses}/${DISCIPLINE_MAX_LOSSES}L${pTxt}`;
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
  const candleClosed = !!modalCurrentItem && !isTradeEntryOpen(modalCurrentItem);

  paintTradeButtonLocked(modalBuyCallBtn, locked, remain, candleClosed);
  paintTradeButtonLocked(modalBuyPutBtn, locked, remain, candleClosed);

  if (chartModal && !chartModal.classList.contains("hidden")) {
    updateModalCandleStatusUI();
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

  toast(`✅ Disciplina: ${disciplineWins}/${DISCIPLINE_MAX_WINS} ITM • ${disciplineLosses}/${DISCIPLINE_MAX_LOSSES} OTM`, 1700);
  updateDisciplineLockUI(false);
}

/* =========================
   Rescate pendientes
========================= */
async function resubscribePendingContracts() {
  try {
    if (!ws || ws.readyState !== 1) return;
    const list = (disciplinePendingContracts || []).slice();
    if (!list.length) return;

    try {
      await ensureAuthorized();
    } catch {
      toast("⚠️ No autorizado (token/login). No puedo rescatar pendientes.", 2200);
      return;
    }

    for (const cid of list) {
      subscribeContractOutcome(cid, true);
      scheduleOutcomeFallbackPoll(cid, 20000);
    }

    toast(`🔁 Reenganche pendientes: ${list.length}`, 1400);
  } catch {}
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
  updateModalCandleStatusUI();

  requestModalDraw(true);
}
function closeChartModal() {
  if (!chartModal) return;
  chartModal.classList.add("hidden");
  chartModal.setAttribute("aria-hidden", "true");
  modalCurrentItem = null;
  modalLive = false;
  updateModalLiveUI();
  if (modalCandleStatusEl) modalCandleStatusEl.style.display = "none";
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
  redrawPracticeSimilarCanvases();
  if (!chartModal || chartModal.classList.contains("hidden")) return;
  applyModalTradeButtonsLayout();
  updateModalCandleStatusUI();
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
   Row helpers (global, para Señales)
========================= */
function updateRowChartBtn(item) {
  const row = document.querySelector(`.row[data-id="${cssEscape(item.id)}"]`);
  if (!row) return;
  updateRowChartBtnOnRow(row, item);
}
function updateRowTradeBadge(item) {
  const row = document.querySelector(`.row[data-id="${cssEscape(item.id)}"]`);
  if (!row) return;
  updateRowTradeBadgeOnRow(row, item);
}
function updateRowHitIcon(item) {
  return false;
}
function updateRowNextArrow(item) {
  const row = document.querySelector(`.row[data-id="${cssEscape(item.id)}"]`);
  if (!row) return;
  updateRowNextArrowOnRow(row, item);
}

/* =========================
   Row helpers (LOCAL onRow)
========================= */
function updateRowChartBtnOnRow(row, item) {
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
function updateRowTradeBadgeOnRow(row, item) {
  if (!row) return;
  const el = row.querySelector(".tradeBadge");
  if (!el) return;

  const badge = item?.trade?.badge || "";
  if (!badge) {
    el.classList.add("hidden");
    el.textContent = "";
    el.title = "";
    return;
  }

  el.classList.remove("hidden");
  if (badge === "ITM") {
    el.textContent = "🎯 ITM";
    el.title = "Trade ganada (ITM)";
    el.style.opacity = "1";
  } else if (badge === "OTM") {
    el.textContent = "💥 OTM";
    el.title = "Trade perdida (OTM)";
    el.style.opacity = "1";
  } else {
    el.textContent = "⏳ TRADE";
    el.title = "Trade pendiente";
    el.style.opacity = "0.85";
  }

  el.style.marginLeft = "8px";
  el.style.fontWeight = "900";
  el.style.fontSize = "12px";
  el.style.padding = "6px 10px";
  el.style.borderRadius = "999px";
  el.style.border = "1px solid rgba(255,255,255,.18)";
  el.style.background = "rgba(255,255,255,.06)";
}
function updateRowNextArrowOnRow(row, item) {
  if (!row) return;
  const el = row.querySelector(".nextArrow");
  if (!el) return;

  if (item.nextOutcome === "up") {
    el.textContent = "⬆️";
    el.className = "nextArrow up";
    el.title = "Próxima vela: cerró arriba del cierre de la vela de señal";
  } else if (item.nextOutcome === "down") {
    el.textContent = "⬇️";
    el.className = "nextArrow down";
    el.title = "Próxima vela: cerró abajo del cierre de la vela de señal";
  } else if (item.nextOutcome === "flat") {
    el.textContent = "➖";
    el.className = "nextArrow flat";
    el.title = "Próxima vela: cerró igual que la vela de señal";
  } else {
    el.textContent = "⏳";
    el.className = "nextArrow pending";
    el.title = "Próxima vela: esperando…";
  }
}
function updateRowHitIconOnRow(row, item) {
  return;
}

function animateHitPop(item) {
  return;
}
function animateFailShake(item) {
  const row = document.querySelector(`.row[data-id="${cssEscape(item.id)}"]`);
  if (!row) return;
  const arrow = row.querySelector(".nextArrow");
  if (!arrow) return;
  arrow.classList.remove("failShake");
  void arrow.offsetWidth;
  arrow.classList.add("failShake");
  setTimeout(() => arrow.classList.remove("failShake"), 260);
}
function setNextOutcome(item, outcome) {
  const prevOutcome = item.nextOutcome || "";
  item.nextOutcome = outcome;
  saveHistory(history);

  updateRowNextArrow(item);
  const ok = updateRowHitIcon(item);
  updateCounter();

  try {
    upsertTradeJournalFromSignal(item);
  } catch {}

  if (prevOutcome !== outcome) {
    if (ok) animateHitPop(item);
    else animateFailShake(item);
  }
}

/* =========================
   Build row
========================= */
function buildRow(item, opts = {}) {
  const row = document.createElement("div");
  row.className = "row " + (item.direction === "CALL" ? "dir-call" : "dir-put");
  if (item.vote) row.classList.add("voted");
  row.dataset.id = item.id;

  const derivUrl = makeDerivTraderUrl(item.symbol);
  const modeLabel = item.mode || "NORMAL";

  const actionsHtml = opts.hideActions
    ? ""
    : `
    <div class="row-actions">
      <button class="voteBtn" data-v="like" type="button" ${item.vote ? "disabled" : ""}>👍</button>
      <button class="voteBtn" data-v="dislike" type="button" ${item.vote ? "disabled" : ""}>👎</button>
      <input class="row-comment" placeholder="comentario" value="${escapeHtml(item.comment || "")}">
    </div>
  `;

  row.innerHTML = `
    <div class="row-main">
      <span class="row-text">${item.time} | ${item.symbol} | ${labelDir(item.direction)} | [${modeLabel}]</span>
      <button class="chartBtn" type="button"></button>
      <span class="tradeBadge hidden" title=""></span>
      <span class="nextArrow pending" title="Próxima vela: esperando…">⏳</span>
    </div>
    ${actionsHtml}
  `;

  row.querySelector(".row-text").onclick = () => {
    window.location.href = derivUrl;
  };

  const chartBtn = row.querySelector(".chartBtn");
  chartBtn.onclick = (e) => {
    e.stopPropagation();

    let target = item;
    if (opts.source === "trades" && opts.signalId) {
      const real = findHistoryItemById(String(opts.signalId));
      if (real) target = real;
    }

    const canOpen = target.minuteComplete || isItemLiveMinute(target);
    if (canOpen) openChartModal(target);
  };

  updateRowChartBtnOnRow(row, item);
  updateRowTradeBadgeOnRow(row, item);
  updateRowNextArrowOnRow(row, item);

  // acciones (solo señales)
  if (!opts.hideActions) {
    if (item.vote) {
      const likeBtn = row.querySelector('button[data-v="like"]');
      const disBtn = row.querySelector('button[data-v="dislike"]');
      if (item.vote === "like" && likeBtn) likeBtn.classList.add("selected");
      if (item.vote === "dislike" && disBtn) disBtn.classList.add("selected");
    }

    row.querySelectorAll("button[data-v]").forEach((btn) => {
      btn.onclick = (e) => {
        e.stopPropagation();
        if (item.vote) return;

        item.vote = btn.dataset.v;
        item.comment = row.querySelector(".row-comment").value || "";

        row.classList.add("voted");
        btn.classList.add("selected");

        saveHistory(history);
      
        row.querySelectorAll("button[data-v]").forEach((b) => (b.disabled = true));
      };
    });

    const input = row.querySelector(".row-comment");
    input.addEventListener("blur", () => {
      item.comment = input.value || "";
      saveHistory(history);
        });
  }

  return row;
}

/* =========================
   Render señales
========================= */
function renderHistory() {
  if (!signalsEl) return;
  signalsEl.innerHTML = "";

  for (const it of history || []) {
    if (!it.mode) it.mode = "NORMAL";
    if (it.mode === "GIRO" || it.mode === "FUERTE") it.mode = "ESCALERA";
  }
  saveHistory(history);

  updateCounter();

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
   WS requests (req_id)
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

const contractSubs = new Map(); // contract_id -> subscription_id

function subscribeContractOutcome(contractId, silent = false) {
  try {
    if (!ws || ws.readyState !== 1) return;
    if (!contractId) return;
    const cid = String(contractId);

    addPendingContract(cid);
    if (contractSubs.has(cid)) return;

    ws.send(JSON.stringify({ proposal_open_contract: 1, contract_id: cid, subscribe: 1 }));
    contractSubs.set(cid, "__pending__");
    if (!silent) toast(`📡 Subscript contrato ${cid}`, 900);
  } catch {}
}
function forgetSubscription(subId) {
  try {
    if (!ws || ws.readyState !== 1) return;
    if (!subId || subId === "__pending__") return;
    ws.send(JSON.stringify({ forget: subId }));
  } catch {}
}

/* =========================
   Fallback poll (requiere authorize)
========================= */
function scheduleOutcomeFallbackPoll(contractId, delayMs = 85000) {
  try {
    if (!contractId) return;
    const cid = String(contractId);

    setTimeout(async () => {
      try {
        if (!(disciplinePendingContracts || []).includes(cid)) return;
        if (!ws || ws.readyState !== 1) return;

        try {
          await ensureAuthorized();
        } catch {
          return;
        }

        const r = await wsRequest({ proposal_open_contract: 1, contract_id: cid }, 12000);
        const poc = r?.proposal_open_contract;
        if (!poc) return;

        if (poc.is_sold) {
          const status = String(poc.status || "").toLowerCase();
          const profit = Number(poc.profit);

          let isWin = false;
          if (status === "won") isWin = true;
          else if (status === "lost") isWin = false;
          else if (Number.isFinite(profit)) isWin = profit > 0;

          toast(isWin ? "✅ ITM (fallback) registrada" : "❌ OTM (fallback) registrada", 1600);

          // pintar badge + journal
          try {
            const signalId = tradeLinks.get(String(cid)) || "";
            const it = signalId ? findHistoryItemById(signalId) : null;
            if (it) {
              setTradeBadge(it, isWin ? "ITM" : "OTM", {
                profit: Number(poc.profit),
                status: String(poc.status || ""),
                sold_time: Number(poc.sell_time || 0),
                contract_id: String(cid),
              });
            }
          } catch {}

          applyDisciplineOutcome(isWin);
          removePendingContract(cid);

          const sid = contractSubs.get(cid);
          forgetSubscription(sid);
          contractSubs.delete(cid);

          updateDisciplineLockUI(false);
        }
      } catch {}
    }, delayMs);
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
function assertEntryWindowOpen() {
  if (modalCurrentItem && !isTradeEntryOpen(modalCurrentItem)) {
    throw new Error("La vela ya cerró");
  }
}

async function buyOneClick(side /* "CALL" | "PUT" */, symbolOverride = null) {
  assertCanTrade();
  assertEntryWindowOpen();

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

    const cid = res?.buy?.contract_id;
    if (!cid) throw new Error("buy ok pero sin contract_id (no puedo trackear ITM/OTM)");

    if (modalCurrentItem && modalCurrentItem.id) {
      setTradeBadge(modalCurrentItem, "PENDING", { contract_id: String(cid), side, symbol });
      linkContractToSignal(cid, modalCurrentItem.id);
    }

    subscribeContractOutcome(cid, true);
    scheduleOutcomeFallbackPoll(cid, 85000);

    toast(`📌 Trade registrado. Esperando resultado… (${disciplineWins}W/${disciplineLosses}L)`, 1600);

    updateDisciplineLockUI(false);
    return res;
  } finally {
    tradeInFlight = false;
  }
}

/* conectar botones modal */
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

      const cid = r?.buy?.contract_id || "";
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

      const cid = r?.buy?.contract_id || "";
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
   ticks_history helpers
========================= */
function minuteToEpochSec(minute) {
  return minute * 60;
}
function normalizeTicksForMinute(minute, times, prices) {
  const startMs = minute * 60000;
  const out = [];
  for (let i = 0; i < Math.min(times.length, prices.length); i++) {
    const ms = Number(times[i]) * 1000 - startMs;
    if (ms < 0 || ms > 60000) continue;
    out.push({ ms, quote: Number(prices[i]) });
  }
  out.sort((a, b) => a.ms - b.ms);

  if (out.length) {
    if (out[0].ms > 0) out.unshift({ ms: 0, quote: out[0].quote });
    const last = out[out.length - 1];
    if (last.ms < 60000) out.push({ ms: 60000, quote: last.quote });
  }
  return out;
}
async function fetchFullMinuteTicks(symbol, minute) {
  const start = minuteToEpochSec(minute);
  const end = minuteToEpochSec(minute + 1);

  const res = await wsRequest({
    ticks_history: symbol,
    start,
    end,
    style: "ticks",
    count: getHistoryCountMax(),
    adjust_start_time: 1,
  });

  const h = res?.history;
  if (!h || !Array.isArray(h.times) || !Array.isArray(h.prices)) return null;
  return normalizeTicksForMinute(minute, h.times, h.prices);
}
async function hydrateSignalsFromDerivHistory(minute) {
  const items = history.filter((it) => it.minute === minute);
  if (!items.length) return false;

  let any = false;
  const bySym = new Map();
  for (const it of items) {
    if (!bySym.has(it.symbol)) bySym.set(it.symbol, []);
    bySym.get(it.symbol).push(it);
  }

  for (const [symbol, its] of bySym.entries()) {
    try {
      const full = await fetchFullMinuteTicks(symbol, minute);
      if (!full || full.length < 2) continue;

      minuteData[minute] ||= {};
      minuteData[minute][symbol] = full.slice();

      for (const it of its) {
        it.ticks = full.slice();
        any = true;
      }
    } catch {}
  }

  return any;
}

/* =========================
   FIX NEXT (rehidratación): cierre de vela siguiente vs cierre de vela señal
========================= */
async function fetchMinuteClose(symbol, minute) {
  try {
    const start = minuteToEpochSec(minute);
    const end = minuteToEpochSec(minute + 1);

    const res = await wsRequest({
      ticks_history: symbol,
      start,
      end,
      style: "ticks",
      count: getHistoryCountMax(),
      adjust_start_time: 1,
    });

    const prices = res?.history?.prices;
    if (!Array.isArray(prices) || prices.length < 2) return null;

    const close = Number(prices[prices.length - 1]);
    if (!Number.isFinite(close)) return null;

    return close;
  } catch {}
  return null;
}

async function computeNextOutcomeByConsecutiveCloses(symbol, minuteCur) {
  const signalClose = await fetchMinuteClose(symbol, minuteCur);
  if (!Number.isFinite(signalClose)) return null;

  const nextClose = await fetchMinuteClose(symbol, minuteCur + 1);
  if (!Number.isFinite(nextClose)) return null;

  return compareConsecutiveCloses(signalClose, nextClose);
}

/* =========================
   Loader rehidratación
========================= */
let rehydrateRunning = false;
let lastStatusBeforeRehydrate = "";

function setRehydrateStatus(text) {
  if (!statusEl) return;
  if (!rehydrateRunning) {
    lastStatusBeforeRehydrate = statusEl.textContent || "";
    rehydrateRunning = true;
  }
  statusEl.textContent = text;
}
function clearRehydrateStatus() {
  if (!statusEl) return;
  if (!rehydrateRunning) return;
  rehydrateRunning = false;
  statusEl.textContent = lastStatusBeforeRehydrate || "Conectado – Analizando";
}

/* =========================
   Rehidratar historial al abrir
========================= */
const REHYDRATE_MAX_ITEMS = 60;
const REHYDRATE_SLEEP_MS = 180;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function rehydrateHistoryOnBoot() {
  if (!ws || ws.readyState !== 1) return;

  const slice = history.slice(-REHYDRATE_MAX_ITEMS);
  const nowMin = Math.floor(Date.now() / 60000);

  const minutes = [...new Set(slice.map((it) => it.minute))]
    .filter((m) => m < nowMin)
    .sort((a, b) => a - b);

  const totalA = minutes.length || 1;
  let doneA = 0;

  for (const m of minutes) {
    doneA++;
    setRehydrateStatus(`♻️ Rehidratando gráficos… ${doneA}/${totalA}`);

    try {
      const changed = await hydrateSignalsFromDerivHistory(m);

      let anyMark = false;
      for (const it of history) {
        if (it.minute === m) {
          if (!it.minuteComplete) {
            it.minuteComplete = true;
            anyMark = true;
          }
          updateRowChartBtn(it);
          updateRowTradeBadge(it);
        }
      }
      if (changed || anyMark) saveHistory(history);
    } catch {}

    await sleep(REHYDRATE_SLEEP_MS);
  }

  // ✅ Recalcula NEXT aunque ya exista, así corrige históricos guardados con la lógica vieja
  const settledOutcomes = slice.filter((it) => it.minute + 1 < nowMin);
  const totalB = settledOutcomes.length || 1;
  let doneB = 0;

  for (const it of settledOutcomes) {
    doneB++;
    setRehydrateStatus(`♻️ Rehidratando NEXT… ${doneB}/${totalB}`);

    try {
      const outcome = await computeNextOutcomeByConsecutiveCloses(it.symbol, it.minute);
      if (outcome && outcome !== it.nextOutcome) setNextOutcome(it, outcome);
    } catch {}

    await sleep(REHYDRATE_SLEEP_MS);
  }

  try {
    for (const it of history) {
      updateRowNextArrow(it);
      updateRowChartBtn(it);
      updateRowTradeBadge(it);
    }
  } catch {}

  saveHistory(history);
  updateCounter();

  seedTradesJournalFromHistory();

  try {
    if ((localStorage.getItem("activeView") || "signals") === "trades") renderTradesView();
  } catch {}

  clearRehydrateStatus();
}

/* =========================
   FIX NEXT (en vivo): cierre de vela siguiente vs cierre de vela señal
========================= */
function getCachedMinuteClose(symbol, minute) {
  const close = Number(candleOC?.[minute]?.[symbol]?.close);
  return Number.isFinite(close) ? close : null;
}

function finalizeMinute(minute) {
  const oc = candleOC[minute];
  if (!oc) return;

  const prevMinute = minute - 1;

  // 1) Resultado rápido (live) usando close(prevMinute) vs close(minute)
  //    Ese minuto "minute" es la vela NEXT para las señales en prevMinute.
  const liveOutcomeBySymbol = Object.create(null);

  for (const symbol of Object.keys(oc)) {
    const signalClose = getCachedMinuteClose(symbol, prevMinute);
    const nextClose = getCachedMinuteClose(symbol, minute);
    const out = compareConsecutiveCloses(signalClose, nextClose);
    if (out) liveOutcomeBySymbol[symbol] = out;
  }

  // Aplica a TODAS las señales de prevMinute (NORMAL + ESCALERA) si todavía no tienen nextOutcome
  for (const it of history) {
    if (!it || it.nextOutcome) continue;
    if (it.minute !== prevMinute) continue;

    const sym = it.symbol;
    if (!sym) continue;

    if (liveOutcomeBySymbol[sym]) {
      setNextOutcome(it, liveOutcomeBySymbol[sym]);
    }
  }

  // 2) Confirmación canónica (ticks_history) para cualquier caso no resuelto
  (async () => {
    try {
      const cache = new Map(); // key: `${sym}:${prevMinute}` -> outcome|null

      for (const it of history) {
        if (!it || it.nextOutcome) continue;
        if (it.minute !== prevMinute) continue;

        const sym = it.symbol;
        if (!sym) continue;

        const key = `${sym}:${prevMinute}`;
        let out = cache.get(key);

        if (out === undefined) {
          out = (await computeNextOutcomeByConsecutiveCloses(sym, prevMinute)) || null;
          cache.set(key, out);
        }

        if (out) setNextOutcome(it, out);
      }
    } catch {}
  })();

  // --- resto: igual que antes ---
  (async () => {
    const ticksChanged = await hydrateSignalsFromDerivHistory(minute);

    let changed = ticksChanged;
    for (const it of history) {
      if (it.minute === minute && !it.minuteComplete) {
        it.minuteComplete = true;
        changed = true;
        updateRowChartBtn(it);
      }
    }
    if (changed) saveHistory(history);

    if (modalCurrentItem && modalCurrentItem.minute === minute) {
      modalLive = false;
      updateModalLiveUI();
      requestModalDraw(true);
    }
  })();

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
  if (!candleOC[minute][symbol]) {
    // ✅ Open más consistente: usa el primer punto que ya tenemos (idealmente el ms=0 con prevLast)
    const firstQ = minuteData?.[minute]?.[symbol]?.[0]?.quote;
    const openQ = Number.isFinite(firstQ) ? firstQ : tick.quote;
    candleOC[minute][symbol] = { open: openQ, close: tick.quote };
  } else {
    candleOC[minute][symbol].close = tick.quote;
  }

  if (
    modalCurrentItem &&
    modalLive &&
    chartModal &&
    !chartModal.classList.contains("hidden") &&
    modalCurrentItem.minute === minute &&
    modalCurrentItem.symbol === symbol
  ) {
    modalCurrentItem.ticks = minuteData[minute][symbol].slice();
    requestModalDraw(false);
  }

  if (history && history.length) {
    const tail = history.slice(-12);
    for (const it of tail) updateRowChartBtn(it);
  }

  if (!areSignalsPaused() && sec >= EVAL_SEC && lastEvaluatedMinute !== minute) {
    lastEvaluatedMinute = minute;
    const ok = evaluateMinute(minute);

    // ✅ ESTRICTO: en ESCALERA NO hay retry (solo eval en el segundo elegido)
    if (!ok && !stairMode) scheduleRetry(minute);
  }
}
function scheduleRetry(minute) {
  if (evalRetryTimer) clearTimeout(evalRetryTimer);
  evalRetryTimer = setTimeout(() => {
    if (Math.floor(Date.now() / 60000) === minute) evaluateMinute(minute);
  }, RETRY_DELAY_MS);
}

/* =========================
   Technical rules + Evaluation (NORMAL + ESCALERA)
========================= */
function getPriceAtMs(ticks, ms) {
  if (!ticks || !ticks.length) return null;
  const pts = ticks.slice().sort((a, b) => a.ms - b.ms);
  if (ms <= pts[0].ms) return pts[0].quote;
  const last = pts[pts.length - 1];
  if (ms >= last.ms) return last.quote;
  for (let i = pts.length - 1; i >= 0; i--) if (pts[i].ms <= ms) return pts[i].quote;
  return pts[0].quote;
}

function sliceTicks(ticks, aMs, bMs) {
  if (!ticks || ticks.length === 0) return [];
  return ticks.filter((t) => t.ms >= aMs && t.ms <= bMs).sort((x, y) => x.ms - y.ms);
}

function directionalRatio(ticks, dirSign) {
  if (!ticks || ticks.length < 2) return 0;
  let ok = 0,
    total = 0;
  for (let i = 1; i < ticks.length; i++) {
    const d = ticks[i].quote - ticks[i - 1].quote;
    if (Math.abs(d) < 1e-12) continue;
    total++;
    if (Math.sign(d) === Math.sign(dirSign)) ok++;
  }
  return total ? ok / total : 0;
}

function maxRetraceAgainst(ticks, dirSign) {
  if (!ticks || ticks.length < 2) return 0;

  if (dirSign > 0) {
    let runMax = ticks[0].quote,
      maxRet = 0;
    for (const t of ticks) {
      runMax = Math.max(runMax, t.quote);
      maxRet = Math.max(maxRet, runMax - t.quote);
    }
    return maxRet;
  } else {
    let runMin = ticks[0].quote,
      maxRet = 0;
    for (const t of ticks) {
      runMin = Math.min(runMin, t.quote);
      maxRet = Math.max(maxRet, t.quote - runMin);
    }
    return maxRet;
  }
}

function oppositeAttackDepth(ticks30_45, dirSign, p30) {
  if (!ticks30_45 || ticks30_45.length === 0 || p30 == null) return 0;
  if (dirSign > 0) {
    let minP = p30;
    for (const t of ticks30_45) minP = Math.min(minP, t.quote);
    return Math.max(0, p30 - minP);
  } else {
    let maxP = p30;
    for (const t of ticks30_45) maxP = Math.max(maxP, t.quote);
    return Math.max(0, maxP - p30);
  }
}

const RULES_NORMAL = {
  scoreMin: 0.015,
  dirRatioMin_0_30: 0.52,
  dirRatioMin_30_45: 0.5,
  move30_fracOfTotal: 0.3,
  move45_fracOfTotal: 0.12,
  oppAttack_maxFracMove30: 0.62,
  rest_minFracTotal: 0.06,
  rest_maxFracTotal: 0.68,
};

function passesTechnicalFilters(best, vol, rules) {
  const ticks = best.ticks || [];
  if (ticks.length < 3) return false;

  const p0 = getPriceAtMs(ticks, 0);
  const p30 = getPriceAtMs(ticks, 30000);
  const p45 = getPriceAtMs(ticks, EVAL_SEC * 1000);
  if (p0 == null || p30 == null || p45 == null) return false;

  const dirSign = best.move > 0 ? 1 : -1;
  const move0_30 = (p30 - p0) * dirSign;
  const move30_45 = (p45 - p30) * dirSign;

  const absTotal = Math.abs(p45 - p0) + 1e-12;

  if (move0_30 <= absTotal * rules.move30_fracOfTotal) return false;
  if (move30_45 <= absTotal * rules.move45_fracOfTotal) return false;

  const t0_30 = sliceTicks(ticks, 0, 30000);
  const t30_45 = sliceTicks(ticks, 30000, EVAL_SEC * 1000);

  const r0_30 = directionalRatio(t0_30, dirSign);
  const r30_45 = directionalRatio(t30_45, dirSign);

  if (r0_30 < rules.dirRatioMin_0_30) return false;
  if (r30_45 < rules.dirRatioMin_30_45) return false;

  const oppAttack = oppositeAttackDepth(t30_45, dirSign, p30);
  const move30Abs = Math.abs(p30 - p0) + 1e-12;
  if (oppAttack > move30Abs * rules.oppAttack_maxFracMove30) return false;

  const t0_45 = sliceTicks(ticks, 0, EVAL_SEC * 1000);
  const maxRet = maxRetraceAgainst(t0_45, dirSign);

  const minRest = absTotal * rules.rest_minFracTotal;
  const maxRest = absTotal * rules.rest_maxFracTotal;
  if (maxRet < minRest) return false;
  if (maxRet > maxRest) return false;

  const totalScore = Math.abs(best.move) / (vol || 1e-9);
  if (totalScore < rules.scoreMin) return false;

  return true;
}

/* =========================
   Patrón ESCALERA
   - CALL = escalera alcista
   - PUT  = escalera bajista
========================= */
const RULES_STAIR = {
  scoreMin: 0.016,
  rangeScoreMin: 0.03,

  dirRatioMinWhole: 0.56,

  // avance sostenido
  firstLegMinFracTotal: 0.34,
  lateLegMinFracTotal: 0.18,

  // cierre cerca del extremo
  closeNearExtremeMaxFracRange: 0.20,

  // pocas contras
  maxRetraceFracTotal: 0.45,

  // estructura “escalonada”
  stepMinFracTotal: 0.06,
  flatBandFracTotal: 0.02,
  maxWeakAgainstFracTotal: 0.18,
  maxWeakAgainstSteps: 1,
  forwardCoverageMinFracTotal: 0.82,

  // evita spike único dominante
  maxSingleStepFracTotal: 0.72,
};

function rangeScoreCalc(ticks, vol) {
  if (!ticks || ticks.length < 3) return 0;
  const qs = ticks.map((t) => t.quote);
  const r = Math.max(...qs) - Math.min(...qs) || 0;
  return r / (vol || 1e-9);
}

function buildStairCheckpoints(evalMs) {
  return [...new Set([0, 10000, 20000, 30000, 40000, 50000, evalMs].filter((ms) => ms <= evalMs))].sort(
    (a, b) => a - b
  );
}

function detectStairPattern(candidate) {
  const ticks = candidate?.ticks || [];
  const evalMs = EVAL_SEC * 1000;
  if (ticks.length < 6) return null;

  const p0 = getPriceAtMs(ticks, 0);
  const p30 = getPriceAtMs(ticks, 30000);
  const pE = getPriceAtMs(ticks, evalMs);
  if (p0 == null || p30 == null || pE == null) return null;

  const totalMove = pE - p0;
  const dirSign = Math.sign(totalMove);
  if (!dirSign) return null;

  const absTotal = Math.abs(totalMove);
  const fullTicks = sliceTicks(ticks, 0, evalMs);
  if (fullTicks.length < 4) return null;

  const qs = fullTicks.map((t) => t.quote);
  const minP = Math.min(...qs);
  const maxP = Math.max(...qs);
  const range = maxP - minP;
  if (!(range > 1e-12)) return null;

  // 1) Direccionalidad general
  const wholeDirRatio = directionalRatio(fullTicks, dirSign);
  if (wholeDirRatio < RULES_STAIR.dirRatioMinWhole) return null;

  // 2) Tiene que avanzar tanto antes como después de los 30s
  const firstLeg = (p30 - p0) * dirSign;
  const lateLeg = (pE - p30) * dirSign;
  if (firstLeg < absTotal * RULES_STAIR.firstLegMinFracTotal) return null;
  if (lateLeg < absTotal * RULES_STAIR.lateLegMinFracTotal) return null;

  // 3) Cierra cerca del extremo
  const closeToExtreme = dirSign > 0 ? maxP - pE : pE - minP;
  if (closeToExtreme > range * RULES_STAIR.closeNearExtremeMaxFracRange) return null;

  // 4) Retroceso total controlado
  const retrace = maxRetraceAgainst(fullTicks, dirSign);
  if (retrace > absTotal * RULES_STAIR.maxRetraceFracTotal) return null;

  // 5) Movimiento con suficiente entidad
  const score = absTotal / (candidate.vol || 1e-9);
  if (score < RULES_STAIR.scoreMin) return null;

  const rangeScore = rangeScoreCalc(fullTicks, candidate.vol);
  if (rangeScore < RULES_STAIR.rangeScoreMin) return null;

  // 6) Comportamiento escalonado por checkpoints
  const checkpoints = buildStairCheckpoints(evalMs);
  if (checkpoints.length < 4) return null;

  const stepMoves = [];
  for (let i = 1; i < checkpoints.length; i++) {
    const a = getPriceAtMs(ticks, checkpoints[i - 1]);
    const b = getPriceAtMs(ticks, checkpoints[i]);
    if (a == null || b == null) return null;
    stepMoves.push((b - a) * dirSign);
  }

  let strongForwardSteps = 0;
  let weakAgainstSteps = 0;
  let strongAgainstSteps = 0;
  let positiveCoverage = 0;
  let maxSingleStepAbs = 0;

  for (const d of stepMoves) {
    maxSingleStepAbs = Math.max(maxSingleStepAbs, Math.abs(d));

    if (d >= absTotal * RULES_STAIR.stepMinFracTotal) {
      strongForwardSteps++;
      positiveCoverage += d;
      continue;
    }

    if (d >= 0) {
      positiveCoverage += d;
      continue;
    }

    if (Math.abs(d) <= absTotal * RULES_STAIR.flatBandFracTotal) continue;

    if (Math.abs(d) <= absTotal * RULES_STAIR.maxWeakAgainstFracTotal) {
      weakAgainstSteps++;
      continue;
    }

    strongAgainstSteps++;
  }

  if (strongAgainstSteps > 0) return null;
  if (weakAgainstSteps > RULES_STAIR.maxWeakAgainstSteps) return null;
  if (strongForwardSteps < Math.max(3, stepMoves.length - 1)) return null;
  if (positiveCoverage < absTotal * RULES_STAIR.forwardCoverageMinFracTotal) return null;
  if (maxSingleStepAbs > absTotal * RULES_STAIR.maxSingleStepFracTotal) return null;

  const quality =
    wholeDirRatio * 100 +
    (positiveCoverage / (absTotal || 1e-9)) * 30 +
    (1 - closeToExtreme / range) * 18 -
    weakAgainstSteps * 8 -
    (maxSingleStepAbs / (absTotal || 1e-9)) * 12;

  return {
    direction: dirSign > 0 ? "CALL" : "PUT",
    quality,
  };
}

function evaluateMinute(minute) {
  const data = minuteData[minute];
  if (!data) return stairMode ? true : false;

  const candidates = [];
  let readySymbols = 0;

  for (const sym of SYMBOLS) {
    const ticks = data[sym] || [];
    if (ticks.length >= MIN_TICKS) readySymbols++;
    if (ticks.length < MIN_TICKS) continue;

    const prices = ticks.map((t) => t.quote);
    const move = prices[prices.length - 1] - prices[0];
    const rawMove = Math.abs(move);

    let vol = 0;
    for (let i = 1; i < prices.length; i++) vol += Math.abs(prices[i] - prices[i - 1]);
    vol = vol / Math.max(1, prices.length - 1);

    const score = rawMove / (vol || 1e-9);
    const rScore = rangeScoreCalc(ticks, vol);

    candidates.push({
      symbol: sym,
      move,
      score,
      rangeScore: rScore,
      ticks,
      vol,
    });
  }

  if (readySymbols < MIN_SYMBOLS_READY || candidates.length === 0) return stairMode ? true : false;

  // ✅ MODO PATRÓN ESCALERA: solo señales si la forma coincide con escalera alcista/bajista
  if (stairMode) {
    const matches = [];

    for (const c of candidates) {
      const match = detectStairPattern(c);
      if (!match) continue;

      matches.push({
        ...c,
        direction: match.direction,
        quality: match.quality,
      });
    }

    if (!matches.length) return true;

    matches.sort((a, b) => b.quality - a.quality);
    const bestMatch = matches[0];

    addSignal(minute, bestMatch.symbol, bestMatch.direction, bestMatch.ticks);
    return true;
  }

  // ---- NORMAL (igual que antes) ----
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  if (!best) return true;

  const rules = RULES_NORMAL;
  if (best.score < rules.scoreMin) return true;

  const ok = passesTechnicalFilters(best, best.vol, rules);
  if (!ok) return true;

  addSignal(minute, best.symbol, best.move > 0 ? "CALL" : "PUT", best.ticks);
  return true;
}

/* =========================
   Add signal
========================= */
function fmtTimeUTC(minute) {
  return new Date(minute * 60000).toISOString().substr(11, 8) + " UTC";
}
function addSignal(minute, symbol, direction, ticks) {
  if (areSignalsPaused()) return;
  const modeLabel = stairMode ? "ESCALERA" : "NORMAL";
  const item = {
    id: `${minute}-${symbol}-${direction}-${modeLabel}`,
    minute,
    time: fmtTimeUTC(minute),
    symbol,
    direction,
    mode: modeLabel,
    vote: "",
    comment: "",
    ticks: Array.isArray(ticks) ? ticks.slice() : [],
    nextOutcome: "",
    minuteComplete: false,
    trade: null,
  };

  if (history.some((x) => x.id === item.id)) return;

  history.push(item);
  if (history.length > MAX_HISTORY) history = history.slice(-MAX_HISTORY);
  saveHistory(history);

  updateCounter();

  if (signalsEl) signalsEl.prepend(buildRow(item));
  updateRowChartBtn(item);

  if (soundEnabled && sound) {
    sound.currentTime = 0;
    sound.play().catch(() => {});
  }
  if (vibrateEnabled && "vibrate" in navigator) navigator.vibrate([120]);

  showNotification(symbol, direction, modeLabel);

  if (shouldAutoOpenChartNow()) {
    requestAnimationFrame(() => {
      try {
        setActiveView("signals");
        openChartModal(item);

        if (isItemLiveMinute(item)) {
          modalLive = true;
          updateModalLiveUI();
          requestModalDraw(true);
        }
      } catch {}
    });
  }
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

  ws.onopen = async () => {
    try {
      resetAuthState();
    } catch {}

    if (statusEl) statusEl.textContent = "Conectado – Suscribiendo…";
    SYMBOLS.forEach((sym) => ws.send(JSON.stringify({ ticks: sym, subscribe: 1 })));

    setTimeout(() => {
      try {
        rehydrateHistoryOnBoot();
      } catch {}
    }, 350);

    updateDisciplineLockUI(false);
    await resubscribePendingContracts();
  };

  ws.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);

      if (data && data.req_id && pending.has(data.req_id)) {
        const p = pending.get(data.req_id);
        clearTimeout(p.t);
        pending.delete(data.req_id);
        p.resolve(data);
        return;
      }

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

            // pintar badge + journal
            try {
              const signalId = tradeLinks.get(String(cid)) || "";
              const it = signalId ? findHistoryItemById(signalId) : null;
              if (it) {
                setTradeBadge(it, isWin ? "ITM" : "OTM", {
                  profit: Number(poc.profit),
                  status: String(poc.status || ""),
                  sold_time: Number(poc.sell_time || 0),
                  contract_id: String(cid),
                });
              }
            } catch {}

            applyDisciplineOutcome(isWin);
            removePendingContract(cid);

            const sid = contractSubs.get(cid);
            forgetSubscription(sid);
            contractSubs.delete(cid);

            updateDisciplineLockUI(false);
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


if (practice40Btn) {
  practice40Btn.onclick = () => {
    EVAL_SEC = 40;
    localStorage.setItem("evalSec", "40");
    qsAll(".evalBtn").forEach((b) => b.classList.toggle("active", Number(b.dataset.sec || 0) === 40));
    paintPracticeSecButtons();
    if (practiceRound && !practiceRound.finished) startPracticeRound(practiceRound.entry);
    else ensurePracticeReady();
  };
}
if (practice45Btn) {
  practice45Btn.onclick = () => {
    EVAL_SEC = 45;
    localStorage.setItem("evalSec", "45");
    qsAll(".evalBtn").forEach((b) => b.classList.toggle("active", Number(b.dataset.sec || 0) === 45));
    paintPracticeSecButtons();
    if (practiceRound && !practiceRound.finished) startPracticeRound(practiceRound.entry);
    else ensurePracticeReady();
  };
}
if (practiceCallBtn) {
  practiceCallBtn.onclick = () => {
    if (!practiceRound || practiceRound.finished || practiceRound.answer) return;
    practiceRound.answer = "CALL";
    setPracticeDecisionState(true, "CALL");
    updatePracticeResult("🟢 COMPRA elegida. Esperando cierre de la vela…", "is-pass");
  };
}
if (practicePutBtn) {
  practicePutBtn.onclick = () => {
    if (!practiceRound || practiceRound.finished || practiceRound.answer) return;
    practiceRound.answer = "PUT";
    setPracticeDecisionState(true, "PUT");
    updatePracticeResult("🔴 VENTA elegida. Esperando cierre de la vela…", "is-pass");
  };
}
if (practicePassBtn) {
  practicePassBtn.onclick = () => {
    const mode = practicePassBtn.dataset.mode || "PASS";
    if (mode === "NEXT") {
      if (practiceRound && !practiceRound.finished) return;
      startPracticeRound();
      return;
    }
    if (!practiceRound || practiceRound.finished) return;
    practiceRound.answer = "PASS";
    finalizePracticeRound("PASS");
  };
}
if (practiceSimilarBtn) {
  practiceSimilarBtn.onclick = () => {
    togglePracticeSimilarResults();
  };
}
if (practiceResetSessionBtn) {
  practiceResetSessionBtn.onclick = () => {
    resetPracticeSessionStats();
  };
}
if (practiceResetAllBtn) {
  practiceResetAllBtn.onclick = () => {
    if (!confirm("¿Resetear el histórico de práctica?")) return;
    resetPracticeAllStats();
  };
}
if (practiceCanvas) {
  practiceCanvas.addEventListener("click", handlePracticeCanvasPick);
}

/* =========================
   Start
========================= */
loadLowPowerMode();
loadAutoOpenChartSetting();
loadDiscipline();
loadTradeLinks();

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
ensureSplitClearButtons();

applyModalTradeButtonsLayout();
updateModalCandleStatusUI();
updateDisciplineLockUI(false);

seedTradesJournalFromHistory();

ensureInlineClearButtons();

connect();
