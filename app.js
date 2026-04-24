// app.js — Base estable + LIVE chart FIX + Trades no quedan colgados (timeouts + race) + ✅ Auto-abrir gráfico (configurable)
// ✅ Modo GIRO (ESTRICTO): señales en 35/40/45 (según config) — Práctica sigue en 40/45
// ✅ FIX UI: Botones COMPRAR / VENDER en el modal uno al lado del otro (grandes, sin encimarse)
// ✅ Disciplina por cuenta: DEMO mantiene bloqueo; REAL queda libre para pruebas
// ✅ FIX Disciplina: feedback visual (candado + contador visible) + auto-unlock con reset
// ✅ FIX INTERNET: contratos “pendientes” persistentes -> si se corta internet, al reconectar vuelve a suscribirse y cuenta ITM/OTM igual
// ✅ FIX NUEVO: si proposal_open_contract no manda is_sold, fallback poll y cuenta igual
// ✅ FIX CRÍTICO: al reconectar, autoriza antes de reenganchar pendientes
// ✅ NUEVO: cada señal muestra badge del trade: ⏳ TRADE / 🎯 ITM / 💥 OTM
// ✅ NUEVO: pestañas: Señales | Trades | Práctica (Configuración queda SOLO en el engranaje)
// ✅ NUEVO: separar historial:
//    - Señales: STORE_KEY
//    - Trades (journal estudio): TRADES_STORE_KEY
// ✅ NUEVO: Exportar Trades (journal) desde Configuración
// ✅ FIX IMPORTANTE (NEXT): la próxima vela (NEXT) se calcula por CIERRE de la vela siguiente vs CIERRE de la vela de señal
// ✅ FIX UI Trades: se ve igual que Señales y SIN voto/comentario en Trades
// ✅ NUEVO UX: botones de borrar por pestaña en la UI, no en el modal Config
// ✅ NUEVO: guardar señales manualmente al pool de práctica con botón 💾
// ✅ NUEVO: GIRO en práctica y señales solo permite operar contra el color actual de la vela
// ✅ NUEVO: Práctica y Señales con botón de confirmaciones 0/3 y COMPRA/VENTA bloqueadas hasta 3 confirmaciones

"use strict";

/*
  Mapa rápido de módulos:
  1) Config y estado global
  2) Persistencia y journal
  3) UI general / modales / tabs
  4) Práctica
  5) Trading demo + AUTO HL
  6) Deriv WS + ticks_history
  7) Evaluación NORMAL / GIRO
  8) Inicialización
*/

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
   Trade account config
========================= */
const ACCOUNT_MODE_KEY = "derivTradingAccountMode_v1";
const ACCOUNT_MODE_DEMO = "demo";
const ACCOUNT_MODE_REAL = "real";
const DERIV_TOKEN_DEMO_KEY = "derivDemoToken_v1";
const DERIV_TOKEN_REAL_KEY = "derivRealToken_v1";
const TRADE_STAKE_KEY = "tradeStake_v1";

const DEFAULT_STAKE = 1; // USD
const DEFAULT_DURATION = 1; // 1 minuto
const DEFAULT_DURATION_UNIT = "m";
const DEFAULT_CURRENCY = "USD";

const EXECUTION_MODE_KEY = "executionMode_v1";
const EXECUTION_MODE_RISE_FALL = "RISE_FALL";
const EXECUTION_MODE_HIGHLOW_AUTO = "HIGHLOW_AUTO_120";
const AUTO_TARGET_RETURN_PCT = 120;
const AUTO_PRECALC_REFRESH_MS = 900;
const AUTO_PRECALC_STALE_MS = 7000;
// Búsqueda por presets de "pips" relativos (no por rango reciente de la vela),
// porque en práctica los niveles útiles suelen estar mucho más lejos que el micro-rango del minuto.
const AUTO_PRECALC_COARSE_PIPS = [60, 80, 100, 120, 150, 180, 200, 220, 250, 285, 320, 350, 400, 450, 500, 650, 800, 1000, 1200];
const AUTO_PRECALC_FAST_PIPS = [120, 180, 220, 250, 285, 320, 350, 400, 500, 650, 800];
const AUTO_PRECALC_FINE_FACTORS = [0.85, 0.92, 1.0, 1.08, 1.15];
const AUTO_FAST_PROPOSAL_TIMEOUT_MS = 2600;
const AUTO_FULL_PROPOSAL_TIMEOUT_MS = 5200;

/* =========================
   Auto-open chart config
========================= */
const AUTOOPEN_CHART_KEY = "autoOpenChartOnSignal_v1";
let autoOpenChartOnSignal = false;
let activeTradingAccount = ACCOUNT_MODE_DEMO;

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

const MODE_NORMAL = "NORMAL";
const MODE_GIRO = "GIRO";
const MODE_GIRO_FLEX = "GIRO FLEX";
const ANALYSIS_MODE_KEY = "analysisMode_v1";

const GIRO_LOGIC_VERSION = "GIRO_RAMA_REEMPLAZO_20260421";
const GIRO_FLEX_LOGIC_VERSION = "GIRO_FLEX_RAMA_REEMPLAZO_20260421";

function normalizeSignalMode(mode) {
  const m = String(mode || "").toUpperCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  if (m === MODE_GIRO || m === "MODO GIRO") return MODE_GIRO;
  if (m === MODE_GIRO_FLEX || m === "GIRO FLEXIBLE" || m === "MODO GIRO FLEX" || m === "MODO GIRO FLEXIBLE") return MODE_GIRO_FLEX;
  return MODE_NORMAL;
}
function isGiroFamilyMode(mode) {
  const m = normalizeSignalMode(mode);
  return m === MODE_GIRO || m === MODE_GIRO_FLEX;
}
function getModeVersion(mode) {
  const m = normalizeSignalMode(mode);
  if (m === MODE_GIRO) return GIRO_LOGIC_VERSION;
  if (m === MODE_GIRO_FLEX) return GIRO_FLEX_LOGIC_VERSION;
  return "";
}
function loadAnalysisMode() {
  try {
    const saved = localStorage.getItem(ANALYSIS_MODE_KEY);
    if (saved != null) return normalizeSignalMode(saved);

    const legacyGiro = loadBool("giroMode", false) || loadBool("strongMode", false);
    return legacyGiro ? MODE_GIRO : MODE_NORMAL;
  } catch {
    return MODE_NORMAL;
  }
}
function saveAnalysisMode(mode) {
  const safe = normalizeSignalMode(mode);
  try {
    localStorage.setItem(ANALYSIS_MODE_KEY, safe);
    saveBool("giroMode", safe !== MODE_NORMAL);
    saveBool("strongMode", false);
  } catch {}
}
function getModeBtnLabel(mode) {
  const m = normalizeSignalMode(mode);
  if (m === MODE_GIRO) return "🟥 Modo GIRO";
  if (m === MODE_GIRO_FLEX) return "🟧 Modo GIRO FLEX";
  return "🟦 Modo NORMAL";
}
function nextSignalMode(mode) {
  const m = normalizeSignalMode(mode);
  if (m === MODE_NORMAL) return MODE_GIRO;
  if (m === MODE_GIRO) return MODE_GIRO_FLEX;
  return MODE_NORMAL;
}

const PRACTICE_SAVED_STORE_KEY = "practiceSavedSignals_v1";
function loadPracticeSavedSignals() {
  try {
    const raw = localStorage.getItem(PRACTICE_SAVED_STORE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}
function savePracticeSavedSignals(arr) {
  try {
    localStorage.setItem(PRACTICE_SAVED_STORE_KEY, JSON.stringify(Array.isArray(arr) ? arr : []));
  } catch {}
}
let practiceSavedSignals = loadPracticeSavedSignals();

function normalizePracticeSavedSignal(item) {
  if (!item) return null;
  const signalId = String(item.source_signal_id || item.id || "");
  if (!signalId) return null;
  return {
    practice_id: String(item.practice_id || `SIG::${signalId}`),
    source_signal_id: signalId,
    saved_at: Number(item.saved_at || Date.now()),
    id: signalId,
    minute: Number(item.minute || 0),
    time: String(item.time || ""),
    symbol: String(item.symbol || ""),
    direction: String(item.direction || ""),
    mode: normalizeSignalMode(item.mode || MODE_NORMAL),
    mode_version: String(item.mode_version || item.giro_version || getModeVersion(item.mode || "NORMAL") || ""),
    nextOutcome: String(item.nextOutcome || ""),
    minuteComplete: !!item.minuteComplete,
    trade: item.trade && typeof item.trade === "object" ? { ...item.trade } : null,
    ticks: Array.isArray(item.ticks) ? item.ticks : [],
    source_type: "saved_signal",
  };
}
function getPracticeEntryKey(entry) {
  return String(entry?.practice_id || entry?.journal_id || entry?.id || "");
}
function findPracticeSavedSignalIndex(signalId) {
  const sid = String(signalId || "");
  return (practiceSavedSignals || []).findIndex((x) => String(x?.source_signal_id || x?.id || "") === sid);
}
function isSignalSavedForPractice(signalId) {
  return findPracticeSavedSignalIndex(signalId) >= 0;
}
function buildPracticeSavedSnapshotFromItem(item) {
  if (!item?.id) return null;
  return normalizePracticeSavedSignal({
    practice_id: `SIG::${String(item.id)}`,
    source_signal_id: String(item.id),
    saved_at: Date.now(),
    id: String(item.id),
    minute: item.minute,
    time: item.time,
    symbol: item.symbol,
    direction: item.direction,
    mode: item.mode || "NORMAL",
    mode_version: item.mode_version || getModeVersion(item.mode || "NORMAL") || "",
    nextOutcome: item.nextOutcome || "",
    minuteComplete: !!item.minuteComplete,
    trade: item.trade || null,
    ticks: Array.isArray(item.ticks) ? item.ticks : [],
    source_type: "saved_signal",
  });
}
function togglePracticeSavedSignal(item) {
  if (!item?.id) return false;
  const idx = findPracticeSavedSignalIndex(item.id);
  if (idx >= 0) {
    practiceSavedSignals.splice(idx, 1);
    savePracticeSavedSignals(practiceSavedSignals);
    return false;
  }
  const snap = buildPracticeSavedSnapshotFromItem(item);
  if (!snap) return false;
  practiceSavedSignals.unshift(snap);
  savePracticeSavedSignals(practiceSavedSignals);
  return true;
}
function getMergedPracticeEntries() {
  const out = [];
  const seenSignalIds = new Set();

  for (const entry of tradesJournal || []) {
    if (!entry) continue;
    const signalId = String(entry.id || "");
    out.push({
      ...entry,
      practice_id: String(entry.practice_id || entry.journal_id || `TR::${signalId || Date.now()}`),
      source_type: "trade_journal",
    });
    if (signalId) seenSignalIds.add(signalId);
  }

  for (const raw of practiceSavedSignals || []) {
    const saved = normalizePracticeSavedSignal(raw);
    if (!saved) continue;
    const signalId = String(saved.source_signal_id || saved.id || "");
    if (signalId && seenSignalIds.has(signalId)) continue;

    const live = signalId ? findHistoryItemById(signalId) : null;
    const merged = live
      ? normalizePracticeSavedSignal({
          ...saved,
          id: live.id,
          minute: live.minute,
          time: live.time,
          symbol: live.symbol,
          direction: live.direction,
          mode: live.mode,
          mode_version: live.mode_version || saved.mode_version || getModeVersion(live.mode || "NORMAL") || "",
          nextOutcome: live.nextOutcome || "",
          minuteComplete: !!live.minuteComplete,
          trade: live.trade || null,
          ticks: Array.isArray(live.ticks) ? live.ticks : saved.ticks,
        })
      : saved;

    if (merged) out.push(merged);
  }

  return out;
}

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
    mode_version: it.mode_version || getModeVersion(it.mode || "NORMAL") || "",

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
   UI base / DOM helpers
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
let signalConfirmPanelEl = null;
let signalConfirmCountEl = null;
let signalConfirmBtnEl = null;
let signalConfirmUndoBtnEl = null;
let signalConfirmHintEl = null;
const SIGNAL_CONFIRM_MIN = 3;

let executionMode = EXECUTION_MODE_RISE_FALL;
const executionPlanCache = new Map();

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
let PRACTICE_EVAL_SEC = 45;

// Estado principal: NORMAL vs GIRO vs GIRO FLEX
let signalMode = MODE_NORMAL;

let history = loadHistory();
migrateHistoryModesToGiro();

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

// Mantener separados los modos históricos.
// GIRO debe seguir siendo GIRO y los modos viejos no deben mezclarse con GIRO.
function migrateHistoryModesToGiro() {
  try {
    let changed = false;
    for (const it of history || []) {
      if (!it) continue;
      if (!it.mode) continue;
      // No convertir ESCALERA/FUERTE a GIRO.
      // Solo normalizamos mayúsculas básicas si hace falta.
      const raw = String(it.mode || "");
      const normalizedFamily = normalizeSignalMode(raw);
      const m = normalizedFamily !== MODE_NORMAL || /^normal$/i.test(raw) ? normalizedFamily : raw.toUpperCase();
      if (m !== it.mode) {
        it.mode = m;
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
  u.searchParams.set("account", getTradingAccountQueryValue());
  return u.toString();
}
const labelDir = (d) => (d === "CALL" ? "COMPRA" : "VENTA");

function getTokenInputEl() {
  return pickEl("tokenInput", "derivTokenInput", "demoTokenInput", "tokenDemoInput", "tradeTokenInput");
}
function getTokenLabelEl() {
  const input = getTokenInputEl();
  if (!input) return null;
  return document.querySelector(`label[for="${input.id}"]`);
}
function getStakeInputEl() {
  return pickEl("stakeInput", "tradeStakeInput", "stakeUsdInput");
}
function getStakeLabelEl() {
  const input = getStakeInputEl();
  if (!input) return null;
  return document.querySelector(`label[for="${input.id}"]`);
}
function syncTokenInputWithCurrentAccount() {
  const tokenInput = getTokenInputEl();
  const tokenLabel = getTokenLabelEl();
  if (tokenLabel) tokenLabel.textContent = `Token ${getTradingAccountLabel()} Deriv`;
  if (!tokenInput) return;
  tokenInput.value = getDerivToken() || "";
  tokenInput.placeholder = `Pegá tu token ${getTradingAccountLabel()} (Read + Trade)`;
  tokenInput.title = `Pegá el token de la cuenta ${getTradingAccountLabel()}`;
}
function syncStakeInputWithCurrentAccount() {
  const stakeInput = getStakeInputEl();
  const stakeLabel = getStakeLabelEl();
  if (stakeLabel) stakeLabel.textContent = `Stake (USD) ${getTradingAccountLabel()}`;
  if (!stakeInput) return;
  stakeInput.value = Number(getTradeStake()).toFixed(2);
  stakeInput.placeholder = Number(DEFAULT_STAKE).toFixed(2);
  stakeInput.title = `Stake en USD para la cuenta ${getTradingAccountLabel()}`;
}
function syncAccountScopedSettingsUI() {
  syncTokenInputWithCurrentAccount();
  syncStakeInputWithCurrentAccount();
}
function ensureTradingAccountButton() {
  let btn = pickEl("tradingAccountBtn");
  if (!btn) {
    const host =
      document.querySelector("#settingsModal .settingsBody .controls") ||
      document.querySelector(".settingsBody .controls") ||
      null;
    if (!host) return null;

    btn = document.createElement("button");
    btn.id = "tradingAccountBtn";
    btn.type = "button";
    btn.className = "btn btnGhost";
    btn.style.gridColumn = "1 / -1";
    host.prepend(btn);
  }

  btn.onclick = () => {
    activeTradingAccount = activeTradingAccount === ACCOUNT_MODE_REAL ? ACCOUNT_MODE_DEMO : ACCOUNT_MODE_REAL;
    saveTradingAccountMode();
    loadDiscipline();
    resetAuthState();
    syncAccountScopedSettingsUI();
    applyTradingAccountUI();
    applyTradingAccountBannerUI();
    updateDisciplineLockUI(false);
    if (chartModal && !chartModal.classList.contains("hidden")) {
      if (modalCurrentItem) {
        modalTitle.textContent = `${modalCurrentItem.symbol} – ${labelDir(modalCurrentItem.direction)} | [${modalCurrentItem.mode || "NORMAL"}] | ${getTradeScopeText()}`;
      }
      updateModalCandleStatusUI();
      requestModalDraw(true);
    }
    toast(`${getTradeScopeText()} activada`, 1800);
  };

  applyTradingAccountUI();
  return btn;
}
function applyTradingAccountUI() {
  const btn = pickEl("tradingAccountBtn");
  if (!btn) return;
  const isReal = activeTradingAccount === ACCOUNT_MODE_REAL;
  btn.textContent = isReal ? "🔴 Cuenta REAL" : "🟢 Cuenta DEMO";
  btn.classList.toggle("active", isReal);
  btn.title = isReal
    ? "Estás configurando y operando con la cuenta REAL"
    : "Estás configurando y operando con la cuenta DEMO";
}
function ensureTradingAccountBanner() {
  let el = document.getElementById("tradingAccountBanner");
  const host =
    (settingsModal && settingsModal.querySelector(".settingsBody")) ||
    document.body;
  if (el) {
    if (el.parentElement !== host) host.prepend(el);
    return el;
  }
  el = document.createElement("div");
  el.id = "tradingAccountBanner";
  el.style.position = "relative";
  el.style.zIndex = "1";
  el.style.margin = "0 0 12px 0";
  el.style.padding = "12px 14px";
  el.style.borderRadius = "14px";
  el.style.fontWeight = "900";
  el.style.fontSize = "14px";
  el.style.letterSpacing = "0.3px";
  el.style.textAlign = "center";
  el.style.border = "1px solid rgba(255,255,255,.14)";
  el.style.backdropFilter = "blur(6px)";
  host.prepend(el);
  return el;
}
function applyTradingAccountBannerUI() {
  const el = ensureTradingAccountBanner();
  if (!el) return;
  const isReal = activeTradingAccount === ACCOUNT_MODE_REAL;
  el.style.display = isReal ? "block" : "none";
  if (!isReal) return;
  el.textContent = "🔴 CUENTA REAL ACTIVA — revisá stake, token y modo antes de operar";
  el.style.color = "#fecaca";
  el.style.background = "rgba(127,29,29,.85)";
  el.style.borderColor = "rgba(248,113,113,.45)";
  el.style.boxShadow = "0 8px 24px rgba(127,29,29,.22)";
}

function loadExecutionMode() {
  try {
    const saved = localStorage.getItem(EXECUTION_MODE_KEY);
    executionMode = saved === EXECUTION_MODE_HIGHLOW_AUTO ? EXECUTION_MODE_HIGHLOW_AUTO : EXECUTION_MODE_RISE_FALL;
  } catch {
    executionMode = EXECUTION_MODE_RISE_FALL;
  }
}
function saveExecutionMode() {
  try {
    localStorage.setItem(EXECUTION_MODE_KEY, executionMode);
  } catch {}
}
function shouldUseAutoHighLowExecution() {
  return executionMode === EXECUTION_MODE_HIGHLOW_AUTO;
}
function getExecutionModeLabel() {
  return shouldUseAutoHighLowExecution() ? `🎯 High/Low auto ${AUTO_TARGET_RETURN_PCT}%` : "↕️ Rise/Fall 1m";
}
function applyExecutionModeUI() {
  const btn = pickEl("executionModeBtn");
  if (!btn) return;
  btn.textContent = getExecutionModeLabel();
  btn.classList.toggle("active", shouldUseAutoHighLowExecution());
  btn.title = shouldUseAutoHighLowExecution()
    ? `Busca automáticamente HIGHER/LOWER cerca de ${AUTO_TARGET_RETURN_PCT}% y deja la compra lista.`
    : "Usa Rise/Fall de 1 minuto como hasta ahora.";
}
function ensureExecutionModeButton() {
  let btn = pickEl("executionModeBtn");
  if (!btn) {
    const host =
      document.querySelector("#settingsModal .settingsBody .controls") ||
      document.querySelector(".settingsBody .controls") ||
      null;
    if (!host) return null;

    btn = document.createElement("button");
    btn.id = "executionModeBtn";
    btn.type = "button";
    btn.className = "btn btnGhost";
    btn.style.gridColumn = "1 / -1";
    host.appendChild(btn);
  }

  btn.onclick = () => {
    executionMode = shouldUseAutoHighLowExecution() ? EXECUTION_MODE_RISE_FALL : EXECUTION_MODE_HIGHLOW_AUTO;
    saveExecutionMode();
    applyExecutionModeUI();
    if (shouldUseAutoHighLowExecution()) {
      for (const it of history.slice(-12)) ensureSignalAutoPrecalc(it);
    } else {
      stopAllExecutionPlanLoops();
    }
    if (chartModal && !chartModal.classList.contains("hidden")) updateModalCandleStatusUI();
    toast(`Ejecución: ${getExecutionModeLabel()}`, 1800);
  };

  applyExecutionModeUI();
  return btn;
}

const AUTO_PRECALC_SCALE_FACTORS = [1, 0.1, 0.01, 0.001, 0.0001];

function makeBarrierCandidateFromAbsolute(side, absValue) {
  const sign = side === "CALL" ? 1 : -1;
  const raw = Math.abs(Number(absValue || 0));
  if (!Number.isFinite(raw) || raw <= 0) return null;

  let precision = 0;
  const rawStr = String(raw);
  if (rawStr.includes("e-")) {
    precision = Number(rawStr.split("e-")[1] || 0);
  } else if (rawStr.includes(".")) {
    precision = rawStr.split(".")[1].length;
  }
  precision = Math.max(0, Math.min(8, precision));

  const barrierNum = sign * raw;
  const barrier = `${sign > 0 ? "+" : "-"}${raw.toFixed(precision)}`;
  return { barrierNum, precision, barrier };
}
function dedupeBarrierCandidates(candidates) {
  const out = [];
  const seen = new Set();
  for (const candidate of candidates || []) {
    if (!candidate || !candidate.barrier) continue;
    const key = String(candidate.barrier);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(candidate);
  }
  return out;
}
function buildBarrierCandidates(item, side, mode = "full") {
  const sourcePips = mode === "fast" ? AUTO_PRECALC_FAST_PIPS : AUTO_PRECALC_COARSE_PIPS;
  const hint = getExecutionBarrierHint(item?.symbol, side);

  const hintedAbs = [];
  if (Number.isFinite(Number(hint?.barrierAbs)) && Number(hint.barrierAbs) > 0) {
    const base = Math.abs(Number(hint.barrierAbs));
    for (const factor of [0.82, 0.92, 1, 1.08, 1.18]) hintedAbs.push(base * factor);
  }

  const scaledPresets = [];
  for (const pips of sourcePips) {
    const absPips = Math.abs(Number(pips || 0));
    if (!Number.isFinite(absPips) || absPips <= 0) continue;
    for (const scale of AUTO_PRECALC_SCALE_FACTORS) scaledPresets.push(absPips * scale);
  }

  const candidates = dedupeBarrierCandidates(
    [...hintedAbs, ...scaledPresets]
      .filter((v) => Number.isFinite(v) && v > 0)
      .map((absValue) => makeBarrierCandidateFromAbsolute(side, absValue))
  );

  return { coarse: candidates };
}
function formatRelativeBarrier(value, precision = 3) {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n === 0) return "+0";
  const p = Math.max(0, Number(precision || 0));
  const abs = Math.abs(n).toFixed(p);
  return `${n >= 0 ? "+" : "-"}${abs}`;
}
function parseProposalToExecution(planRaw, side, precision) {
  const proposal = planRaw?.proposal;
  const askPrice = Number(proposal?.ask_price);
  const payout = Number(proposal?.payout);
  const id = proposal?.id ? String(proposal.id) : "";
  const barrierNum = Number(planRaw?.barrierNum);
  const barrierPrecision = Math.max(0, Number(planRaw?.precision ?? precision ?? 0));
  const barrier = planRaw?.barrier ? String(planRaw.barrier) : formatRelativeBarrier(barrierNum, barrierPrecision);
  if (!id || !Number.isFinite(askPrice) || askPrice <= 0 || !Number.isFinite(payout)) return null;
  const profitPct = ((payout - askPrice) / askPrice) * 100;
  return {
    proposalId: id,
    contractType: side === "CALL" ? "HIGHER" : "LOWER",
    askPrice,
    payout,
    profitPct,
    distance: Math.abs(profitPct - AUTO_TARGET_RETURN_PCT),
    barrierNum,
    precision: barrierPrecision,
    barrier,
    longcode: proposal?.longcode ? String(proposal.longcode) : "",
    updatedAt: Date.now(),
  };
}
async function getHighLowProposalQuote(symbol, side, barrierCandidate, precisionIgnored, stake, timeoutMs = AUTO_FULL_PROPOSAL_TIMEOUT_MS) {
  const candidate = typeof barrierCandidate === "object" && barrierCandidate
    ? barrierCandidate
    : makeBarrierCandidateFromAbsolute(side, Math.abs(Number(barrierCandidate || 0)));
  if (!candidate?.barrier) return null;

  const req = {
    proposal: 1,
    amount: stake,
    basis: "stake",
    contract_type: side === "CALL" ? "HIGHER" : "LOWER",
    currency: DEFAULT_CURRENCY,
    duration: Number(DEFAULT_DURATION) || 1,
    duration_unit: DEFAULT_DURATION_UNIT || "m",
    barrier: candidate.barrier,
    symbol,
  };
  const res = await wsRequest(req, timeoutMs);
  if (res?.error) throw new Error(res.error.message || "proposal error");
  return parseProposalToExecution({ proposal: res?.proposal, barrierNum: candidate.barrierNum, precision: candidate.precision, barrier: candidate.barrier }, side, candidate.precision);
}
async function findBestHighLowPlan(item, side, opts = {}) {
  const symbol = item?.symbol;
  if (!symbol) return null;
  const stake = getTradeStake();
  const fast = !!opts.fast;
  const { coarse } = buildBarrierCandidates(item, side, fast ? "fast" : "full");
  if (!coarse.length) return null;

  const timeoutMs = fast ? AUTO_FAST_PROPOSAL_TIMEOUT_MS : AUTO_FULL_PROPOSAL_TIMEOUT_MS;
  const firstPass = (await Promise.allSettled(
    coarse.map((candidate) => getHighLowProposalQuote(symbol, side, candidate, candidate?.precision || 0, stake, timeoutMs))
  ))
    .filter((r) => r.status === "fulfilled" && r.value)
    .map((r) => r.value);
  if (!firstPass.length) return null;

  let best = firstPass.sort((a, b) => a.distance - b.distance)[0];
  rememberExecutionBarrierHint(symbol, side, best, best.precision || 0);
  if (fast) return best;

  const fineCandidates = dedupeBarrierCandidates(
    AUTO_PRECALC_FINE_FACTORS.map((factor) => makeBarrierCandidateFromAbsolute(side, Math.max(Math.abs(best.barrierNum) * factor, 1e-8)))
  );

  if (fineCandidates.length) {
    const secondPass = (await Promise.allSettled(
      fineCandidates.map((candidate) => getHighLowProposalQuote(symbol, side, candidate, candidate?.precision || 0, stake, timeoutMs))
    ))
      .filter((r) => r.status === "fulfilled" && r.value)
      .map((r) => r.value);
    if (secondPass.length) best = secondPass.concat(firstPass).sort((a, b) => a.distance - b.distance)[0];
  }

  rememberExecutionBarrierHint(symbol, side, best, best.precision || 0);
  return best;
}
const executionBarrierHintCache = new Map();
function getExecutionHintKey(symbol, side) {
  return `${String(symbol || "")}|${String(side || "")}`;
}
function getExecutionBarrierHint(symbol, side) {
  return executionBarrierHintCache.get(getExecutionHintKey(symbol, side)) || null;
}
function rememberExecutionBarrierHint(symbol, side, plan, precision = 3) {
  if (!symbol || !side || !plan) return;
  executionBarrierHintCache.set(getExecutionHintKey(symbol, side), {
    barrierAbs: Math.abs(Number(plan.barrierNum || 0)),
    barrierNum: Number(plan.barrierNum || 0),
    barrier: String(plan.barrier || formatRelativeBarrier(plan.barrierNum, precision)),
    precision: Math.max(0, Number(plan.precision ?? precision ?? 0)),
    updatedAt: Date.now(),
  });
}

function getOrCreateExecutionPlan(item) {
  if (!item?.id) return null;
  let cache = executionPlanCache.get(item.id);
  if (!cache) {
    cache = { item, call: null, put: null, updatedAt: 0, error: "", timer: null, running: null, active: false };
    executionPlanCache.set(item.id, cache);
  }
  cache.item = item;
  return cache;
}
function stopExecutionPlanLoop(itemId) {
  const cache = executionPlanCache.get(String(itemId || ""));
  if (!cache) return;
  cache.active = false;
  if (cache.timer) clearTimeout(cache.timer);
  cache.timer = null;
  cache.running = null;
}
function stopAllExecutionPlanLoops() {
  for (const key of Array.from(executionPlanCache.keys())) stopExecutionPlanLoop(key);
}
function cleanupExecutionPlanCache() {
  const nowMin = currentServerMinute();
  for (const [key, cache] of executionPlanCache.entries()) {
    const item = cache?.item;
    const expired = !item || (typeof item.minute === "number" && item.minute < nowMin) || !!item?.trade?.badge;
    if (expired) {
      stopExecutionPlanLoop(key);
      executionPlanCache.delete(key);
    }
  }
}
async function refreshExecutionPlanForSignal(item, force = false) {
  if (!shouldUseAutoHighLowExecution() || !item?.id) return null;
  const cache = getOrCreateExecutionPlan(item);
  if (!cache) return null;
  if (cache.running && !force) return cache.running;

  cache.running = (async () => {
    if (!getDerivToken()) {
      cache.error = `Sin token ${getTradingAccountLabel()}`;
      return cache;
    }
    if (!ws || ws.readyState !== 1) {
      cache.error = "WS desconectado";
      return cache;
    }
    try {
      await ensureAuthorized();
      const [callPlan, putPlan] = await Promise.all([findBestHighLowPlan(item, "CALL", { fast: true }), findBestHighLowPlan(item, "PUT", { fast: true })]);
      cache.call = callPlan;
      cache.put = putPlan;
      cache.updatedAt = Date.now();
      cache.error = callPlan || putPlan ? "" : "Sin proposal válida";
      item.autoHighLow = {
        call: callPlan ? { ...callPlan } : null,
        put: putPlan ? { ...putPlan } : null,
        updatedAt: cache.updatedAt,
      };
      return cache;
    } catch (e) {
      cache.error = e?.message || String(e);
      return cache;
    } finally {
      cache.running = null;
      if (modalCurrentItem && item.id === modalCurrentItem.id) updateModalCandleStatusUI();
    }
  })();

  return cache.running;
}
function ensureSignalAutoPrecalc(item) {
  if (!shouldUseAutoHighLowExecution() || !item?.id) return;
  if (!getDerivToken()) return;
  const cache = getOrCreateExecutionPlan(item);
  if (!cache || cache.active) return;
  cache.active = true;

  const loop = async () => {
    if (!cache.active) return;
    cleanupExecutionPlanCache();
    const currentItem = findHistoryItemById(item.id) || item;
    if (!currentItem || !isTradeEntryOpen(currentItem) || currentItem?.trade?.badge) {
      stopExecutionPlanLoop(item.id);
      return;
    }
    await refreshExecutionPlanForSignal(currentItem);
    if (!cache.active) return;
    cache.timer = setTimeout(loop, AUTO_PRECALC_REFRESH_MS);
  };

  void loop();
}
function getCachedExecutionPlan(item, side, maxAgeMs = AUTO_PRECALC_STALE_MS) {
  if (!item?.id) return null;
  const cache = executionPlanCache.get(item.id);
  if (!cache) return null;
  const plan = side === "CALL" ? cache.call : cache.put;
  if (!plan) return null;
  if (Date.now() - Number(plan.updatedAt || cache.updatedAt || 0) > maxAgeMs) return null;
  return plan;
}
async function ensureExecutionPlanForTrade(item, side) {
  if (!item?.id) return null;
  const cache = getOrCreateExecutionPlan(item);
  let plan = getCachedExecutionPlan(item, side, AUTO_PRECALC_STALE_MS * 2);
  if (plan) return plan;

  if (!getDerivToken()) throw new Error(`Sin token ${getTradingAccountLabel()}`);
  if (!ws || ws.readyState !== 1) throw new Error("WS desconectado");
  await ensureAuthorized();

  const quick = await findBestHighLowPlan(item, side, { fast: true });
  if (quick) {
    if (side === "CALL") cache.call = quick;
    else cache.put = quick;
    cache.updatedAt = Date.now();
    cache.error = "";
    item.autoHighLow ||= {};
    item.autoHighLow[side === "CALL" ? "call" : "put"] = { ...quick };
    item.autoHighLow.updatedAt = cache.updatedAt;
    return quick;
  }

  cache.error = `Sin proposal rápida para ${side === "CALL" ? "HIGHER" : "LOWER"}`;
  return null;
}
function formatExecutionPlanMini(plan) {
  if (!plan) return "…";
  return `${plan.barrier} · ${Math.round(plan.profitPct)}%`;
}
function buildTradeButtonLabel(side, plan = null) {
  const base = side === "CALL" ? "🟢 COMPRA" : "🔴 VENTA";
  if (!shouldUseAutoHighLowExecution()) return base;
  return `${base} · ${formatExecutionPlanMini(plan)}`;
}
function applyModalExecutionButtonUI(locked = false, candleClosed = false) {
  const callPlan = modalCurrentItem ? getCachedExecutionPlan(modalCurrentItem, "CALL") : null;
  const putPlan = modalCurrentItem ? getCachedExecutionPlan(modalCurrentItem, "PUT") : null;
  setTradeButtonBaseLabel(modalBuyCallBtn, buildTradeButtonLabel("CALL", callPlan));
  setTradeButtonBaseLabel(modalBuyPutBtn, buildTradeButtonLabel("PUT", putPlan));

  if (locked || candleClosed) return;
  if (!shouldUseAutoHighLowExecution()) return;

  const hasToken = !!getDerivToken();
  const wsReady = !!ws && ws.readyState === 1;

  const applyState = (btn, plan, sideLabel) => {
    if (!btn) return;
    btn.style.filter = "";
    btn.style.opacity = "";

    // En AUTO HL los botones no deben quedar muertos solo porque el plan aún no terminó.
    // Se permite tocar y el click handler hace búsqueda rápida/fallback si todavía no hay proposal lista.
    btn.disabled = false;

    if (plan) {
      btn.title = `${sideLabel} listo | barrier ${plan.barrier} | retorno ${Math.round(plan.profitPct)}%`;
      return;
    }

    if (!hasToken) {
      btn.title = `No hay token ${getTradingAccountLabel()} guardado. Si tocás, te avisaré para guardarlo.`;
      return;
    }

    if (!wsReady) {
      btn.title = "Conexión no lista todavía. Si tocás, intento refrescar apenas conecte.";
      return;
    }

    btn.title = `${sideLabel} no está listo todavía. Si tocás, hago una búsqueda rápida y compro.`;
  };
  applyState(modalBuyCallBtn, callPlan, "HIGHER");
  applyState(modalBuyPutBtn, putPlan, "LOWER");
}
function setTradeButtonBaseLabel(btn, label) {
  if (!btn) return;
  btn.dataset.baseLabel = label;
  btn.textContent = label;
}

function getItemMinuteOpenPrice(item) {
  if (!item) return null;

  const liveTicks = minuteData?.[item.minute]?.[item.symbol];
  if (Array.isArray(liveTicks) && liveTicks.length) {
    const q = Number(liveTicks[0]?.quote);
    if (Number.isFinite(q)) return q;
  }

  const ocOpen = Number(candleOC?.[item.minute]?.[item.symbol]?.open);
  if (Number.isFinite(ocOpen)) return ocOpen;

  const pts = (Array.isArray(item.ticks) ? item.ticks : []).slice().sort((a, b) => a.ms - b.ms);
  if (pts.length) {
    const q = Number(pts[0]?.quote);
    if (Number.isFinite(q)) return q;
  }

  return null;
}
function getItemCurrentBodyPrice(item) {
  if (!item) return null;

  const liveTicks = minuteData?.[item.minute]?.[item.symbol];
  if (Array.isArray(liveTicks) && liveTicks.length) {
    const q = Number(liveTicks[liveTicks.length - 1]?.quote);
    if (Number.isFinite(q)) return q;
  }

  const ocClose = Number(candleOC?.[item.minute]?.[item.symbol]?.close);
  if (Number.isFinite(ocClose)) return ocClose;

  const pts = (Array.isArray(item.ticks) ? item.ticks : []).slice().sort((a, b) => a.ms - b.ms);
  if (pts.length) {
    const q = Number(pts[pts.length - 1]?.quote);
    if (Number.isFinite(q)) return q;
  }

  return null;
}
function getGiroAllowedTradeSide(item) {
  const mode = normalizeSignalMode(item?.mode);
  if (!isGiroFamilyMode(mode)) return { active: false, allowedSide: null, bodyDir: 0, open: null, current: null, mode };

  const open = getItemMinuteOpenPrice(item);
  const current = getItemCurrentBodyPrice(item);
  if (!Number.isFinite(open) || !Number.isFinite(current)) {
    return { active: true, allowedSide: null, bodyDir: 0, open, current, mode };
  }

  const bodyDir = current > open ? 1 : current < open ? -1 : 0;
  const allowedSide = bodyDir > 0 ? 'PUT' : bodyDir < 0 ? 'CALL' : null;
  return { active: true, allowedSide, bodyDir, open, current, mode };
}
function paintGiroOnlyButtonState(btn, enabled, reason) {
  if (!btn) return;

  btn.style.transform = 'none';
  if (enabled) {
    btn.disabled = false;
    btn.style.filter = '';
    btn.style.opacity = '';
    if (reason) btn.title = reason;
    return;
  }

  btn.disabled = true;
  btn.style.filter = 'grayscale(1) saturate(0.65)';
  btn.style.opacity = '0.38';
  if (reason) btn.title = reason;
}
function applyGiroOnlyTradeButtons(item, locked = false, candleClosed = false) {
  const giroState = getGiroAllowedTradeSide(item);
  if (!giroState.active) return;
  if (locked || candleClosed) return;

  const { allowedSide, bodyDir } = giroState;

  if (!allowedSide || bodyDir === 0) {
    paintGiroOnlyButtonState(modalBuyCallBtn, false, 'Modo GIRO: esperá definición del cuerpo para operar solo el giro.');
    paintGiroOnlyButtonState(modalBuyPutBtn, false, 'Modo GIRO: esperá definición del cuerpo para operar solo el giro.');
    return;
  }

  const bullish = bodyDir > 0;
  const giroMsg = bullish
    ? 'Modo GIRO: vela alcista ahora mismo. Solo habilitada VENTA para buscar el giro.'
    : 'Modo GIRO: vela bajista ahora mismo. Solo habilitada COMPRA para buscar el giro.';

  paintGiroOnlyButtonState(modalBuyCallBtn, allowedSide === 'CALL', giroMsg);
  paintGiroOnlyButtonState(modalBuyPutBtn, allowedSide === 'PUT', giroMsg);
}

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
   Persistencia: señales
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

function getTradingAccountLabel() {
  return activeTradingAccount === ACCOUNT_MODE_REAL ? "REAL" : "DEMO";
}
function getTradingAccountIcon() {
  return activeTradingAccount === ACCOUNT_MODE_REAL ? "🔴" : "🟢";
}
function getTradingAccountTokenKey() {
  return activeTradingAccount === ACCOUNT_MODE_REAL ? DERIV_TOKEN_REAL_KEY : DERIV_TOKEN_DEMO_KEY;
}
function loadTradingAccountMode() {
  try {
    const saved = String(localStorage.getItem(ACCOUNT_MODE_KEY) || "").toLowerCase();
    activeTradingAccount = saved === ACCOUNT_MODE_REAL ? ACCOUNT_MODE_REAL : ACCOUNT_MODE_DEMO;
  } catch {
    activeTradingAccount = ACCOUNT_MODE_DEMO;
  }
}
function saveTradingAccountMode() {
  try {
    localStorage.setItem(ACCOUNT_MODE_KEY, activeTradingAccount === ACCOUNT_MODE_REAL ? ACCOUNT_MODE_REAL : ACCOUNT_MODE_DEMO);
  } catch {}
}
function getTradingAccountQueryValue() {
  return activeTradingAccount === ACCOUNT_MODE_REAL ? "real" : "demo";
}
function getTradeScopeText() {
  return `${getTradingAccountIcon()} ${getTradingAccountLabel()}`;
}
function getTradeExecutionTitle() {
  return `Operar ${getTradingAccountLabel()} 1m`;
}

function getSignalEvalButtons() {
  return qsAll(".evalBtn");
}
function ensureSignal35EvalButton() {
  const existing = document.querySelector('.evalBtn[data-sec="35"]');
  if (existing) return existing;

  const btn40 = document.querySelector('.evalBtn[data-sec="40"]');
  const btn45 = document.querySelector('.evalBtn[data-sec="45"]');
  const host = (btn40 && btn40.parentElement) || (btn45 && btn45.parentElement) || null;
  if (!host) return null;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "evalBtn";
  btn.dataset.sec = "35";
  btn.textContent = "35s";

  if (btn40) host.insertBefore(btn, btn40);
  else host.appendChild(btn);

  return btn;
}

/* =========================
   NEXT helpers
========================= */
function compareConsecutiveCloses(signalClose, nextClose) {
  const a = Number(signalClose);
  const b = Number(nextClose);

  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  if (b > a) return "up";
  if (b < a) return "down";
  return "flat";
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
        mode_version: entry.mode_version || getModeVersion(entry.mode || "NORMAL") || "",
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
const PRACTICE_FILTER_KEY = "practiceFilterMode_v1";
const PRACTICE_FILTER_ALL = "ALL";
const PRACTICE_FILTER_GIRO = "GIRO";
const PRACTICE_FILTER_NORMAL = "NORMAL";
let practiceSessionStats = freshPracticeStats();
let practiceAllStats = loadPracticeAllStats();
let practiceFilterMode = loadPracticeFilterMode();
let practiceQueue = [];
let practiceRound = null;
let practiceRaf = null;
let practiceChoiceHitZones = [];
let practiceSimilarResults = [];
let practiceConfirmPanelEl = null;
let practiceConfirmCountEl = null;
let practiceConfirmBtnEl = null;
let practiceConfirmUndoBtnEl = null;
let practiceConfirmHintEl = null;
const PRACTICE_CONFIRM_MIN = 3;
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
function normalizePracticeEntryMode(mode) {
  const m = String(mode || "").toUpperCase();
  return m || "NORMAL";
}
function isStrictGiroPracticeEntry(entry) {
  if (!entry) return false;
  const mode = normalizePracticeEntryMode(entry.mode);
  const version = String(entry.mode_version || entry.giro_version || "");

  if (mode === MODE_GIRO) return version === GIRO_LOGIC_VERSION;
  if (mode === MODE_GIRO_FLEX) return version === GIRO_FLEX_LOGIC_VERSION;
  return false;
}

function loadPracticeFilterMode() {
  try {
    const saved = String(localStorage.getItem(PRACTICE_FILTER_KEY) || "").toUpperCase();
    if (saved === PRACTICE_FILTER_GIRO) return PRACTICE_FILTER_GIRO;
    if (saved === PRACTICE_FILTER_NORMAL) return PRACTICE_FILTER_NORMAL;
    return PRACTICE_FILTER_ALL;
  } catch {
    return PRACTICE_FILTER_ALL;
  }
}
function savePracticeFilterMode() {
  try {
    const safe =
      practiceFilterMode === PRACTICE_FILTER_GIRO
        ? PRACTICE_FILTER_GIRO
        : practiceFilterMode === PRACTICE_FILTER_NORMAL
          ? PRACTICE_FILTER_NORMAL
          : PRACTICE_FILTER_ALL;
    localStorage.setItem(PRACTICE_FILTER_KEY, safe);
  } catch {}
}
function shouldPracticeOnlyGiro() {
  return practiceFilterMode === PRACTICE_FILTER_GIRO;
}
function shouldPracticeOnlyNormal() {
  return practiceFilterMode === PRACTICE_FILTER_NORMAL;
}
function normalizePracticeFilterMode(mode) {
  const m = String(mode || "").toUpperCase();
  if (m === PRACTICE_FILTER_GIRO) return PRACTICE_FILTER_GIRO;
  if (m === PRACTICE_FILTER_NORMAL) return PRACTICE_FILTER_NORMAL;
  return PRACTICE_FILTER_ALL;
}
function getPracticeFilterTag() {
  if (shouldPracticeOnlyGiro()) return "GIRO";
  if (shouldPracticeOnlyNormal()) return "NORMAL";
  return "TODOS";
}
function isStrictNormalPracticeEntry(entry) {
  if (!entry) return false;
  const mode = normalizePracticeEntryMode(entry.mode);
  const idText = `${String(entry.id || "")} ${String(entry.journal_id || "")} ${String(entry.practice_id || "")}`.toUpperCase();
  if (idText.includes("GIRO") || idText.includes("ESCALERA") || idText.includes("FUERTE")) return false;
  return mode === "NORMAL";
}
function applyPracticeFilterButtonUI() {
  const btn = pickEl("practiceFilterBtn");
  if (!btn) return;
  const mode = normalizePracticeFilterMode(practiceFilterMode);
  btn.classList.toggle("active", mode !== PRACTICE_FILTER_ALL);
  if (mode === PRACTICE_FILTER_GIRO) {
    btn.textContent = "🟥 Práctica GIRO";
    btn.title = "Práctica filtrada solo a velas guardadas/operadas en modo GIRO.";
    return;
  }
  if (mode === PRACTICE_FILTER_NORMAL) {
    btn.textContent = "🟦 Práctica NORMAL";
    btn.title = "Práctica filtrada solo a velas guardadas/operadas en modo NORMAL.";
    return;
  }
  btn.textContent = "⚪ Práctica TODOS";
  btn.title = "Práctica usando velas de todos los modos.";
}
function ensurePracticeFilterButton() {
  let btn = pickEl("practiceFilterBtn");
  if (!btn) {
    btn = document.createElement("button");
    btn.id = "practiceFilterBtn";
    btn.type = "button";
    btn.className = "btn btnGhost";
    btn.style.marginLeft = "8px";
    btn.style.minHeight = "36px";
    btn.style.padding = "8px 12px";

    const anchor = practice45Btn || practice40Btn || practiceRoundLabelEl || practiceView || null;
    if (anchor && anchor.parentElement) anchor.insertAdjacentElement("afterend", btn);
    else if (practiceView) practiceView.prepend(btn);
  }

  btn.onclick = () => {
    practiceFilterMode =
      practiceFilterMode === PRACTICE_FILTER_ALL
        ? PRACTICE_FILTER_GIRO
        : practiceFilterMode === PRACTICE_FILTER_GIRO
          ? PRACTICE_FILTER_NORMAL
          : PRACTICE_FILTER_ALL;
    savePracticeFilterMode();

    cancelPracticeAnim();
    practiceQueue = [];
    practiceRound = null;
    practiceChoiceHitZones = [];
    resetPracticeSimilarState();

    applyPracticeFilterButtonUI();
    ensurePracticeQueue();
    updatePracticePoolLabel();

    if ((localStorage.getItem("activeView") || "signals") === "practice") ensurePracticeReady();

    const tag =
      practiceFilterMode === PRACTICE_FILTER_GIRO
        ? "🟥 Práctica filtrada a GIRO"
        : practiceFilterMode === PRACTICE_FILTER_NORMAL
          ? "🟦 Práctica filtrada a NORMAL"
          : "⚪ Práctica con todos los modos";
    toast(tag, 1800);
  };

  applyPracticeFilterButtonUI();
  return btn;
}
function getPracticeConfirmationCount() {
  return Array.isArray(practiceRound?.confirmations) ? practiceRound.confirmations.length : 0;
}
function hasPracticeMinimumConfirmations() {
  return getPracticeConfirmationCount() >= PRACTICE_CONFIRM_MIN;
}
function ensurePracticeConfirmationControls() {
  if (practiceConfirmPanelEl && practiceConfirmPanelEl.isConnected) return practiceConfirmPanelEl;
  if (!practiceView) return null;

  const panel = document.createElement("div");
  panel.id = "practiceConfirmPanel";
  panel.style.width = "100%";
  panel.style.boxSizing = "border-box";
  panel.style.margin = "12px 0 10px 0";
  panel.style.padding = "12px";
  panel.style.borderRadius = "18px";
  panel.style.border = "1px solid rgba(255,255,255,.14)";
  panel.style.background = "linear-gradient(180deg, rgba(255,255,255,.075), rgba(255,255,255,.035))";
  panel.style.boxShadow = "0 12px 28px rgba(0,0,0,.20), inset 0 0 0 1px rgba(255,255,255,.045)";

  const top = document.createElement("div");
  top.style.display = "flex";
  top.style.alignItems = "center";
  top.style.justifyContent = "space-between";
  top.style.gap = "10px";
  top.style.marginBottom = "10px";

  const count = document.createElement("div");
  count.id = "practiceConfirmCount";
  count.style.fontWeight = "950";
  count.style.letterSpacing = ".25px";
  count.style.fontSize = "15px";
  count.style.padding = "8px 10px";
  count.style.borderRadius = "999px";
  count.style.border = "1px solid rgba(255,255,255,.14)";
  count.style.background = "rgba(0,0,0,.16)";

  const hint = document.createElement("div");
  hint.id = "practiceConfirmHint";
  hint.style.flex = "1";
  hint.style.textAlign = "right";
  hint.style.fontSize = "12px";
  hint.style.fontWeight = "800";
  hint.style.opacity = ".86";

  top.appendChild(count);
  top.appendChild(hint);

  const row = document.createElement("div");
  row.style.display = "grid";
  row.style.gridTemplateColumns = "minmax(0, 1fr) auto";
  row.style.gap = "10px";
  row.style.alignItems = "stretch";

  const confirmBtn = document.createElement("button");
  confirmBtn.id = "practiceConfirmBtn";
  confirmBtn.type = "button";
  confirmBtn.className = "btn";
  confirmBtn.textContent = "➕ CONFIRMACIÓN";
  confirmBtn.style.minHeight = "52px";
  confirmBtn.style.borderRadius = "16px";
  confirmBtn.style.fontWeight = "950";
  confirmBtn.style.fontSize = "15px";
  confirmBtn.style.letterSpacing = ".35px";
  confirmBtn.style.border = "1px solid rgba(251,191,36,.55)";
  confirmBtn.style.background = "linear-gradient(180deg, rgba(251,191,36,.26), rgba(251,191,36,.10))";
  confirmBtn.style.boxShadow = "0 0 20px rgba(251,191,36,.16), inset 0 0 16px rgba(251,191,36,.08)";
  confirmBtn.style.touchAction = "manipulation";

  const undoBtn = document.createElement("button");
  undoBtn.id = "practiceConfirmUndoBtn";
  undoBtn.type = "button";
  undoBtn.className = "btn btnGhost";
  undoBtn.textContent = "↩️";
  undoBtn.title = "Quitar última confirmación";
  undoBtn.style.minHeight = "52px";
  undoBtn.style.minWidth = "58px";
  undoBtn.style.borderRadius = "16px";
  undoBtn.style.fontWeight = "950";
  undoBtn.style.fontSize = "18px";
  undoBtn.style.touchAction = "manipulation";

  row.appendChild(confirmBtn);
  row.appendChild(undoBtn);
  panel.appendChild(top);
  panel.appendChild(row);

  const anchor = practiceCanvas || practiceRoundLabelEl || practiceView.firstElementChild;
  if (anchor && anchor.parentElement) anchor.insertAdjacentElement("afterend", panel);
  else practiceView.prepend(panel);

  practiceConfirmPanelEl = panel;
  practiceConfirmCountEl = count;
  practiceConfirmBtnEl = confirmBtn;
  practiceConfirmUndoBtnEl = undoBtn;
  practiceConfirmHintEl = hint;

  confirmBtn.onclick = () => addPracticeConfirmation();
  undoBtn.onclick = () => removePracticeConfirmation();

  updatePracticeConfirmationUI();
  return panel;
}
function getPracticeConfirmationMs() {
  if (!practiceRound) return 0;
  const ms = Number(practiceRound.replayMs ?? practiceRound.cutoffMs ?? 0);
  return Math.max(0, Math.min(60000, ms));
}
function addPracticeConfirmation() {
  if (!practiceRound || practiceRound.finished) return;
  practiceRound.confirmations ||= [];
  practiceRound.confirmations.push({ ms: getPracticeConfirmationMs(), at: Date.now() });
  updatePracticeConfirmationUI();
  redrawPracticeRoundChart();
  if (hasPracticeMinimumConfirmations()) {
    updatePracticeResult("✅ 3 confirmaciones marcadas. Operación habilitada si tu lectura lo justifica.", "is-itm");
  } else {
    const faltan = PRACTICE_CONFIRM_MIN - getPracticeConfirmationCount();
    updatePracticeResult(`🧠 Faltan ${faltan} confirmación${faltan === 1 ? "" : "es"}. Si no hay 3 claras, PASAR.`, "is-pass");
  }
}
function removePracticeConfirmation() {
  if (!practiceRound || practiceRound.finished) return;
  practiceRound.confirmations ||= [];
  practiceRound.confirmations.pop();
  updatePracticeConfirmationUI();
  redrawPracticeRoundChart();
}
function updatePracticeConfirmationUI() {
  ensurePracticeConfirmationControls();
  const n = getPracticeConfirmationCount();
  const ok = n >= PRACTICE_CONFIRM_MIN;

  if (practiceConfirmCountEl) {
    practiceConfirmCountEl.textContent = `Confirmaciones: ${Math.min(n, PRACTICE_CONFIRM_MIN)}/${PRACTICE_CONFIRM_MIN}${n > PRACTICE_CONFIRM_MIN ? ` +${n - PRACTICE_CONFIRM_MIN}` : ""}`;
    practiceConfirmCountEl.style.color = ok ? "#dcfce7" : "rgba(255,255,255,.92)";
    practiceConfirmCountEl.style.borderColor = ok ? "rgba(34,197,94,.48)" : "rgba(255,255,255,.14)";
    practiceConfirmCountEl.style.background = ok ? "rgba(22,163,74,.18)" : "rgba(0,0,0,.16)";
    practiceConfirmCountEl.style.boxShadow = ok ? "0 0 18px rgba(34,197,94,.16)" : "none";
  }
  if (practiceConfirmHintEl) {
    practiceConfirmHintEl.textContent = ok ? "Operación válida por disciplina" : "Mínimo 3 para operar";
    practiceConfirmHintEl.style.color = ok ? "#bbf7d0" : "rgba(255,255,255,.70)";
  }
  if (practiceConfirmBtnEl) {
    practiceConfirmBtnEl.disabled = !practiceRound || !!practiceRound.finished;
    practiceConfirmBtnEl.style.opacity = practiceConfirmBtnEl.disabled ? ".45" : "1";
  }
  if (practiceConfirmUndoBtnEl) {
    practiceConfirmUndoBtnEl.disabled = !practiceRound || !!practiceRound.finished || n <= 0;
    practiceConfirmUndoBtnEl.style.opacity = practiceConfirmUndoBtnEl.disabled ? ".42" : "1";
  }

  if (practiceRound && !practiceRound.finished && !practiceRound.answer) {
    setPracticeDecisionState(false);
  }
}
function setPracticeConfirmationControlsVisible(show) {
  ensurePracticeConfirmationControls();
  if (practiceConfirmPanelEl) practiceConfirmPanelEl.style.display = show ? "block" : "none";
}
function redrawPracticeRoundChart() {
  if (!practiceRound || !practiceCanvas) return;
  const ms = practiceRound.finished ? 60000 : (practiceRound.replayMs || practiceRound.cutoffMs || 0);
  const visibleTicks = buildPracticeVisibleTicks(practiceRound.ticks, ms);
  drawPracticeChart(practiceCanvas, visibleTicks, ms, practiceRound.segmentMarks);
}
function renderPracticeStats() {
  if (practiceSessionStatsEl) practiceSessionStatsEl.textContent = formatPracticeStats(practiceSessionStats);
  if (practiceAllStatsEl) practiceAllStatsEl.textContent = formatPracticeStats(practiceAllStats);
  updateCounter("practice");
}
function getEligiblePracticeEntries() {
  return getMergedPracticeEntries().filter((entry) => {
    if (!entry) return false;
    if (!Array.isArray(entry.ticks) || entry.ticks.length < 6) return false;
    if (!(entry.nextOutcome === "up" || entry.nextOutcome === "down")) return false;
    if (shouldPracticeOnlyGiro() && !isStrictGiroPracticeEntry(entry)) return false;
    if (shouldPracticeOnlyNormal() && !isStrictNormalPracticeEntry(entry)) return false;
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
  const eligibleIds = new Set(getEligiblePracticeEntries().map((x) => getPracticeEntryKey(x)));
  practiceQueue = practiceQueue.filter((id) => eligibleIds.has(String(id)));
  if (practiceQueue.length) return;
  practiceQueue = shuffleArray(Array.from(eligibleIds));
}
function updatePracticePoolLabel() {
  const eligible = getEligiblePracticeEntries().length;
  if (practicePoolLabelEl) {
    practicePoolLabelEl.textContent = `Pool ${getPracticeFilterTag()}: ${practiceQueue.length}/${eligible}`;
  }
}
function paintPracticeSecButtons() {
  const active = PRACTICE_EVAL_SEC;
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

    // Confirmaciones manuales reemplazan las flechas por tramo.
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

  const lx = xOf(pts[pts.length - 1].ms);
  const ly = yOf(pts[pts.length - 1].quote);
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.beginPath();
  ctx.arc(lx, ly, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  // Confirmaciones: se mantienen en el panel 0/3, pero ya no se dibujan sobre el gráfico.

}
function setPracticePassButtonMode(mode = "PASS") {
  if (!practicePassBtn) return;
  const isNext = mode === "NEXT";
  practicePassBtn.dataset.mode = isNext ? "NEXT" : "PASS";
  practicePassBtn.textContent = isNext ? "🎲 SIGUIENTE" : "⏭️ PASAR";
  practicePassBtn.classList.toggle("is-next", isNext);
}
function setPracticeDecisionState(disabled, selected = "") {
  const confirmationLocked =
    !disabled &&
    !!practiceRound &&
    !practiceRound.finished &&
    !practiceRound.answer &&
    !hasPracticeMinimumConfirmations();

  const map = [
    [practiceCallBtn, "CALL"],
    [practicePutBtn, "PUT"],
    [practicePassBtn, "PASS"],
  ];
  map.forEach(([btn, key]) => {
    if (!btn) return;
    const isNextBtn = btn === practicePassBtn && btn.dataset.mode === "NEXT";
    const isTradeBtn = key === "CALL" || key === "PUT";
    btn.disabled = isNextBtn ? false : !!disabled || (isTradeBtn && confirmationLocked);
    btn.classList.toggle("selected", !isNextBtn && selected === key);

    if (isTradeBtn && confirmationLocked) {
      btn.style.filter = "grayscale(1) saturate(.65)";
      btn.style.opacity = ".44";
      btn.title = `Necesitas ${PRACTICE_CONFIRM_MIN} confirmaciones para operar. PASAR siempre está permitido.`;
    } else if (isTradeBtn && !disabled) {
      btn.style.filter = "";
      btn.style.opacity = "";
      btn.title = "Práctica: operar con disciplina";
    }
  });
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
function ensurePracticeSimilarBelowPut() {
  if (!practiceSimilarBtn || !practicePutBtn) return;

  let wrap = document.getElementById("practicePutSimilarWrap");
  if (!wrap) {
    const parent = practicePutBtn.parentElement;
    if (!parent) return;

    wrap = document.createElement("div");
    wrap.id = "practicePutSimilarWrap";
    wrap.style.display = "flex";
    wrap.style.flexDirection = "column";
    wrap.style.gap = "8px";
    wrap.style.width = "100%";
    wrap.style.minWidth = "0";
    wrap.style.alignItems = "stretch";

    parent.insertBefore(wrap, practicePutBtn);
    wrap.appendChild(practicePutBtn);
  }

  if (practiceSimilarBtn.parentElement !== wrap) wrap.appendChild(practiceSimilarBtn);

  practicePutBtn.style.width = "100%";

  practiceSimilarBtn.style.width = "100%";
  practiceSimilarBtn.style.minHeight = "42px";
  practiceSimilarBtn.style.borderRadius = "14px";
  practiceSimilarBtn.style.fontWeight = "900";
  practiceSimilarBtn.style.fontSize = "13px";
  practiceSimilarBtn.style.letterSpacing = ".15px";
  practiceSimilarBtn.style.border = "1px solid rgba(255,255,255,.16)";
  practiceSimilarBtn.style.background = "linear-gradient(180deg, rgba(255,255,255,.08), rgba(255,255,255,.035))";
  practiceSimilarBtn.style.boxShadow = "inset 0 0 0 1px rgba(255,255,255,.035)";
}

function setPracticeSimilarButtonVisible(show) {
  if (!practiceSimilarBtn) return;
  ensurePracticeSimilarBelowPut();
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
  return getEligiblePracticeEntries().find((x) => getPracticeEntryKey(x) === nextId) || null;
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
  updatePracticeConfirmationUI();
  setPracticeDecisionState(true, round.answer);

  const confirmText = ` | Confirmaciones: ${getPracticeConfirmationCount()}/${PRACTICE_CONFIRM_MIN}`;
  const outcomeText = getOutcomeLabel(round.entry.nextOutcome);
  if (resultType === "ITM") {
    updatePracticeResult(`✅ ITM | Tu decisión: ${round.answer === "CALL" ? "COMPRA" : "VENTA"}${confirmText} | Próxima vela: ${outcomeText}`, "is-itm");
  } else if (resultType === "OTM") {
    updatePracticeResult(`❌ OTM | Tu decisión: ${round.answer === "CALL" ? "COMPRA" : "VENTA"}${confirmText} | Próxima vela: ${outcomeText}`, "is-otm");
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
  updatePracticeStatusText(`Tiempo para decidir: ${remainingSec}s | tramo: ${tramo} | confirmaciones: ${getPracticeConfirmationCount()}/${PRACTICE_CONFIRM_MIN} | decisión: ${picked}`);

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
    setPracticeConfirmationControlsVisible(false);
    setPracticePassButtonMode("NEXT");
    setPracticeDecisionState(true);
    return;
  }

  cancelPracticeAnim();
  practiceRound = {
    entry: chosen,
    ticks: normalizePracticeTicks(chosen.ticks),
    cutoffMs: PRACTICE_EVAL_SEC * 1000,
    startTs: 0,
    replayMs: PRACTICE_EVAL_SEC * 1000,
    answer: null,
    finished: false,
    confirmations: [],
    segmentMarks: freshPracticeSegmentMarks(),
  };

  if (practiceRoundLabelEl) {
    practiceRoundLabelEl.textContent = `${chosen.symbol} | ${chosen.mode || "NORMAL"} | ${chosen.time}`;
  }
  updatePracticePoolLabel();
  setPracticeConfirmationControlsVisible(true);
  updatePracticeConfirmationUI();
  updatePracticeResult(`Marca ${PRACTICE_CONFIRM_MIN} confirmaciones claras para habilitar COMPRA / VENTA. PASAR siempre vale.`, "is-pass");
  setPracticePassButtonMode("PASS");
  setPracticeDecisionState(false);

  const initialTicks = buildPracticeVisibleTicks(practiceRound.ticks, practiceRound.cutoffMs);
  drawPracticeChart(practiceCanvas, initialTicks, practiceRound.cutoffMs, practiceRound.segmentMarks);
  practiceRaf = requestAnimationFrame(practiceLoop);
}
function ensurePracticeReady() {
  ensurePracticeFilterButton();
  applyPracticeFilterButtonUI();
  ensurePracticeSimilarBelowPut();
  renderPracticeStats();
  paintPracticeSecButtons();
  ensurePracticeQueue();
  updatePracticePoolLabel();
  if (shouldPracticeOnlyGiro() && practiceRound?.entry && !isStrictGiroPracticeEntry(practiceRound.entry)) {
    cancelPracticeAnim();
    practiceRound = null;
    practiceChoiceHitZones = [];
    resetPracticeSimilarState();
  }
  if (!practiceRound) {
    resetPracticeSimilarState();
    const msgFiltro = shouldPracticeOnlyGiro()
      ? "Filtro activo: solo GIRO."
      : shouldPracticeOnlyNormal()
        ? "Filtro activo: solo NORMAL."
        : "Filtro activo: todos los modos.";
    updatePracticeStatusText(`Toca PASAR para empezar una ronda con trades aleatorios sin repetir. ${msgFiltro} En Práctica, las señales quedan pausadas.`);
    setPracticeConfirmationControlsVisible(false);
    updatePracticeResult("Se usa tu journal de trades. PASAR no entra en el porcentaje.", "is-pass");
    setPracticePassButtonMode("NEXT");
    setPracticeDecisionState(true);
  } else if (practiceRound.finished) {
    if (getEligiblePracticeEntries().length > 1) setPracticeSimilarButtonVisible(true);
    setPracticeConfirmationControlsVisible(true);
    updatePracticeConfirmationUI();
    setPracticePassButtonMode("NEXT");
    setPracticeDecisionState(true, practiceRound.answer || "");
    drawPracticeChart(practiceCanvas, buildPracticeVisibleTicks(practiceRound.ticks, 60000), 60000, practiceRound.segmentMarks);
    redrawPracticeSimilarCanvases();
  } else {
    resetPracticeSimilarState();
    setPracticeConfirmationControlsVisible(true);
    updatePracticeConfirmationUI();
    setPracticePassButtonMode("PASS");
    setPracticeDecisionState(false);
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
      mode_version: it.mode_version || getModeVersion(it.mode || "NORMAL") || "",
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
      mode_version: t.mode_version || getModeVersion(t.mode || "NORMAL") || "",
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
   Eval sec + Modo GIRO
========================= */
(function initEvalMode() {
  ensureSignal35EvalButton();

  const savedSec = parseInt(localStorage.getItem("evalSec") || "45", 10);
  EVAL_SEC = [35, 40, 45].includes(savedSec) ? savedSec : 45;

  const savedPracticeSec = parseInt(localStorage.getItem("practiceEvalSec") || "45", 10);
  PRACTICE_EVAL_SEC = [40, 45].includes(savedPracticeSec) ? savedPracticeSec : 45;

  const paintEval = () =>
    getSignalEvalButtons().forEach((b) => {
      const sec = parseInt(b.dataset.sec || "0", 10);
      b.classList.toggle("active", sec === EVAL_SEC);
    });
  paintEval();
  try { paintPracticeSecButtons(); } catch {}

  getSignalEvalButtons().forEach(
    (b) =>
      (b.onclick = () => {
        const v = parseInt(b.dataset.sec || "45", 10);
        EVAL_SEC = [35, 40, 45].includes(v) ? v : 45;
        localStorage.setItem("evalSec", String(EVAL_SEC));
        paintEval();
      })
  );

  signalMode = loadAnalysisMode();
  saveAnalysisMode(signalMode);

  const paintMode = () => {
    if (!modeBtn) return;
    const isSpecial = signalMode !== MODE_NORMAL;
    modeBtn.textContent = getModeBtnLabel(signalMode);
    modeBtn.classList.toggle("active-strong", isSpecial);
    modeBtn.classList.toggle("active", isSpecial);
    modeBtn.title = "Tocá para alternar entre NORMAL, GIRO y GIRO FLEX.";
  };
  paintMode();

  if (modeBtn)
    modeBtn.onclick = () => {
      signalMode = nextSignalMode(signalMode);
      saveAnalysisMode(signalMode);
      paintMode();
      toast(getModeBtnLabel(signalMode), 1600);
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
   Notification deep link helpers
========================= */
function makePwaSignalUrl(item = null) {
  try {
    const url = new URL(window.location.href);
    url.hash = "";
    url.searchParams.set("view", "signals");
    if (item?.id) url.searchParams.set("openSignal", String(item.id));
    url.searchParams.set("openChart", "1");
    return url.toString();
  } catch {
    return "./";
  }
}

function openSignalFromNotification(signalId = "") {
  const targetId = String(signalId || "");

  const tryOpen = () => {
    let item = targetId ? findHistoryItemById(targetId) : null;
    if (!item && history && history.length) item = history[history.length - 1];
    if (!item) return false;

    try {
      setActiveView("signals");
    } catch {}

    try {
      const row = document.querySelector(`.row[data-id="${cssEscape(item.id)}"]`);
      if (row) row.scrollIntoView({ behavior: "smooth", block: "center" });
    } catch {}

    try {
      openChartModal(item);
      if (isItemLiveMinute(item)) {
        modalLive = true;
        updateModalLiveUI();
        requestModalDraw(true);
      }
    } catch {}

    return true;
  };

  if (tryOpen()) return;

  let attempts = 0;
  const timer = setInterval(() => {
    attempts += 1;
    if (tryOpen() || attempts >= 12) clearInterval(timer);
  }, 250);
}

function initNotificationOpenRouting() {
  try {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("message", (event) => {
        const data = event?.data || {};
        if (data.type !== "OPEN_SIGNAL_FROM_NOTIFICATION") return;
        openSignalFromNotification(data.signalId || "");
      });
    }

    const params = new URLSearchParams(window.location.search || "");
    const shouldOpen = params.get("openChart") === "1";
    const signalId = params.get("openSignal") || "";
    if (shouldOpen) {
      setTimeout(() => openSignalFromNotification(signalId), 350);

      try {
        params.delete("openChart");
        params.delete("openSignal");
        params.delete("view");
        const clean = `${location.pathname}${params.toString() ? "?" + params.toString() : ""}${location.hash || ""}`;
        history.replaceState(null, "", clean);
      } catch {}
    }
  } catch {}
}


/* =========================
   Notifications
========================= */
if ("Notification" in window && Notification.permission === "default") {
  Notification.requestPermission().catch(() => {});
}
function showNotification(symbol, direction, modeLabel, item = null) {
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  const signalId = item?.id ? String(item.id) : "";
  const pwaUrl = makePwaSignalUrl(item);

  navigator.serviceWorker.getRegistration().then((reg) => {
    if (!reg) return;
    reg.showNotification("📈 Deriv Signal", {
      body: `${symbol} – ${labelDir(direction)} – [${modeLabel || "NORMAL"}]`,
      icon: "icon-192.png",
      badge: "icon-192.png",
      tag: signalId ? `deriv-signal-${signalId}` : "deriv-signal",
      renotify: true,
      requireInteraction: true,
      silent: false,
      vibrate: vibrateEnabled ? [200, 100, 200] : undefined,
      data: {
        type: "OPEN_SIGNAL_FROM_NOTIFICATION",
        url: pwaUrl,
        signalId,
        symbol,
        direction,
        mode: modeLabel || "NORMAL",
      },
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
function getSignalConfirmationCount(item = modalCurrentItem) {
  return Array.isArray(item?.signalConfirmations) ? item.signalConfirmations.length : 0;
}
function hasSignalMinimumConfirmations(item = modalCurrentItem) {
  return getSignalConfirmationCount(item) >= SIGNAL_CONFIRM_MIN;
}
function ensureSignalConfirmationControls() {
  if (signalConfirmPanelEl && signalConfirmPanelEl.isConnected) return signalConfirmPanelEl;

  const footer =
    document.querySelector("#chartModal .modalFooter") ||
    (chartModal ? chartModal.querySelector(".modalFooter") : null);

  if (!footer) return null;

  const panel = document.createElement("div");
  panel.id = "signalConfirmPanel";
  panel.style.width = "100%";
  panel.style.boxSizing = "border-box";
  panel.style.margin = "0 0 10px 0";
  panel.style.padding = "12px";
  panel.style.borderRadius = "18px";
  panel.style.border = "1px solid rgba(255,255,255,.14)";
  panel.style.background = "linear-gradient(180deg, rgba(251,191,36,.105), rgba(255,255,255,.035))";
  panel.style.boxShadow = "0 12px 26px rgba(0,0,0,.18), inset 0 0 0 1px rgba(251,191,36,.045)";

  const top = document.createElement("div");
  top.style.display = "flex";
  top.style.alignItems = "center";
  top.style.justifyContent = "space-between";
  top.style.gap = "10px";
  top.style.marginBottom = "10px";

  const count = document.createElement("div");
  count.id = "signalConfirmCount";
  count.style.fontWeight = "950";
  count.style.letterSpacing = ".25px";
  count.style.fontSize = "15px";
  count.style.padding = "8px 10px";
  count.style.borderRadius = "999px";
  count.style.border = "1px solid rgba(255,255,255,.14)";
  count.style.background = "rgba(0,0,0,.16)";
  count.style.whiteSpace = "nowrap";

  const hint = document.createElement("div");
  hint.id = "signalConfirmHint";
  hint.style.flex = "1";
  hint.style.textAlign = "right";
  hint.style.fontSize = "12px";
  hint.style.fontWeight = "850";
  hint.style.opacity = ".90";
  hint.style.lineHeight = "1.25";

  top.appendChild(count);
  top.appendChild(hint);

  const row = document.createElement("div");
  row.style.display = "grid";
  row.style.gridTemplateColumns = "minmax(0, 1fr) auto";
  row.style.gap = "10px";
  row.style.alignItems = "stretch";

  const confirmBtn = document.createElement("button");
  confirmBtn.id = "signalConfirmBtn";
  confirmBtn.type = "button";
  confirmBtn.className = "btn";
  confirmBtn.textContent = "➕ CONFIRMACIÓN";
  confirmBtn.style.minHeight = "52px";
  confirmBtn.style.borderRadius = "16px";
  confirmBtn.style.fontWeight = "950";
  confirmBtn.style.fontSize = "15px";
  confirmBtn.style.letterSpacing = ".35px";
  confirmBtn.style.border = "1px solid rgba(251,191,36,.58)";
  confirmBtn.style.background = "linear-gradient(180deg, rgba(251,191,36,.28), rgba(251,191,36,.10))";
  confirmBtn.style.boxShadow = "0 0 20px rgba(251,191,36,.16), inset 0 0 16px rgba(251,191,36,.08)";
  confirmBtn.style.touchAction = "manipulation";

  const undoBtn = document.createElement("button");
  undoBtn.id = "signalConfirmUndoBtn";
  undoBtn.type = "button";
  undoBtn.className = "btn btnGhost";
  undoBtn.textContent = "↩️";
  undoBtn.title = "Quitar última confirmación";
  undoBtn.style.minHeight = "52px";
  undoBtn.style.minWidth = "58px";
  undoBtn.style.borderRadius = "16px";
  undoBtn.style.fontWeight = "950";
  undoBtn.style.fontSize = "18px";
  undoBtn.style.touchAction = "manipulation";

  row.appendChild(confirmBtn);
  row.appendChild(undoBtn);
  panel.appendChild(top);
  panel.appendChild(row);

  const statusBar = ensureModalCandleStatusBar();
  const tradeRow = footer.querySelector(".tradeRow");
  if (statusBar && statusBar.parentElement === footer) {
    statusBar.insertAdjacentElement("afterend", panel);
  } else if (tradeRow) {
    footer.insertBefore(panel, tradeRow);
  } else {
    footer.prepend(panel);
  }

  signalConfirmPanelEl = panel;
  signalConfirmCountEl = count;
  signalConfirmBtnEl = confirmBtn;
  signalConfirmUndoBtnEl = undoBtn;
  signalConfirmHintEl = hint;

  confirmBtn.onclick = () => addSignalConfirmation();
  undoBtn.onclick = () => removeSignalConfirmation();

  updateSignalConfirmationUI();
  return panel;
}
function getSignalConfirmationMs() {
  if (!modalCurrentItem) return 0;
  const now = serverNowMs();
  const minuteStart = Number.isFinite(currentMinuteStartMs) && currentMinuteStartMs
    ? currentMinuteStartMs
    : Math.floor(now / 60000) * 60000;
  return Math.max(0, Math.min(60000, now - minuteStart));
}
function addSignalConfirmation() {
  if (!modalCurrentItem || !isTradeEntryOpen(modalCurrentItem)) return;
  modalCurrentItem.signalConfirmations ||= [];
  modalCurrentItem.signalConfirmations.push({ ms: getSignalConfirmationMs(), at: Date.now() });
  saveHistory(history);
  updateSignalConfirmationUI();
  updateModalCandleStatusUI();

  if (hasSignalMinimumConfirmations()) {
    toast("✅ 3 confirmaciones: operación habilitada", 1400);
  } else {
    const faltan = SIGNAL_CONFIRM_MIN - getSignalConfirmationCount();
    toast(`🧠 Faltan ${faltan} confirmación${faltan === 1 ? "" : "es"}`, 1200);
  }
}
function removeSignalConfirmation() {
  if (!modalCurrentItem || !isTradeEntryOpen(modalCurrentItem)) return;
  modalCurrentItem.signalConfirmations ||= [];
  modalCurrentItem.signalConfirmations.pop();
  saveHistory(history);
  updateSignalConfirmationUI();
  updateModalCandleStatusUI();
}
function updateSignalConfirmationUI() {
  ensureSignalConfirmationControls();

  const hasItem = !!modalCurrentItem;
  const isOpen = hasItem && isTradeEntryOpen(modalCurrentItem);
  const n = getSignalConfirmationCount();
  const ok = n >= SIGNAL_CONFIRM_MIN;

  if (signalConfirmCountEl) {
    signalConfirmCountEl.textContent = `Confirmaciones: ${Math.min(n, SIGNAL_CONFIRM_MIN)}/${SIGNAL_CONFIRM_MIN}${n > SIGNAL_CONFIRM_MIN ? ` +${n - SIGNAL_CONFIRM_MIN}` : ""}`;
    signalConfirmCountEl.style.color = ok ? "#dcfce7" : "rgba(255,255,255,.92)";
    signalConfirmCountEl.style.borderColor = ok ? "rgba(34,197,94,.48)" : "rgba(251,191,36,.28)";
    signalConfirmCountEl.style.background = ok ? "rgba(22,163,74,.18)" : "rgba(0,0,0,.16)";
    signalConfirmCountEl.style.boxShadow = ok ? "0 0 18px rgba(34,197,94,.16)" : "none";
  }
  if (signalConfirmHintEl) {
    const scope = getTradeScopeText ? getTradeScopeText() : "";
    signalConfirmHintEl.textContent = ok
      ? `Operación válida por disciplina${scope ? " · " + scope : ""}`
      : `Mínimo 3 para operar${scope ? " · " + scope : ""}`;
    signalConfirmHintEl.style.color = ok ? "#bbf7d0" : "rgba(255,255,255,.72)";
  }
  if (signalConfirmBtnEl) {
    signalConfirmBtnEl.disabled = !hasItem || !isOpen;
    signalConfirmBtnEl.style.opacity = signalConfirmBtnEl.disabled ? ".45" : "1";
  }
  if (signalConfirmUndoBtnEl) {
    signalConfirmUndoBtnEl.disabled = !hasItem || !isOpen || n <= 0;
    signalConfirmUndoBtnEl.style.opacity = signalConfirmUndoBtnEl.disabled ? ".42" : "1";
  }
}
function setSignalConfirmationControlsVisible(show) {
  ensureSignalConfirmationControls();
  if (signalConfirmPanelEl) signalConfirmPanelEl.style.display = show ? "block" : "none";
}
function applySignalConfirmationTradeGate(locked = false, candleClosed = false) {
  if (!modalCurrentItem) return;
  updateSignalConfirmationUI();

  if (locked || candleClosed) return;
  if (hasSignalMinimumConfirmations()) return;

  const faltan = Math.max(0, SIGNAL_CONFIRM_MIN - getSignalConfirmationCount());
  const msg = `Necesitas ${SIGNAL_CONFIRM_MIN} confirmaciones para operar. Faltan ${faltan}.`;

  paintGiroOnlyButtonState(modalBuyCallBtn, false, msg);
  paintGiroOnlyButtonState(modalBuyPutBtn, false, msg);
}
function assertSignalMinimumConfirmations() {
  if (!modalCurrentItem) return;
  if (!hasSignalMinimumConfirmations(modalCurrentItem)) {
    const faltan = Math.max(0, SIGNAL_CONFIRM_MIN - getSignalConfirmationCount(modalCurrentItem));
    throw new Error(`Faltan ${faltan} confirmación${faltan === 1 ? "" : "es"} para operar`);
  }
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
  btn.title = getTradeExecutionTitle();
}
function updateModalCandleStatusUI() {
  const bar = ensureModalCandleStatusBar();
  if (!bar) return;

  if (!chartModal || chartModal.classList.contains("hidden") || !modalCurrentItem) {
    bar.style.display = "none";
    setSignalConfirmationControlsVisible(false);
    return;
  }

  bar.style.display = "block";

  const callPlan = modalCurrentItem ? getCachedExecutionPlan(modalCurrentItem, "CALL") : null;
  const putPlan = modalCurrentItem ? getCachedExecutionPlan(modalCurrentItem, "PUT") : null;
  setTradeButtonBaseLabel(modalBuyCallBtn, buildTradeButtonLabel("CALL", callPlan));
  setTradeButtonBaseLabel(modalBuyPutBtn, buildTradeButtonLabel("PUT", putPlan));

  const isOpen = isTradeEntryOpen(modalCurrentItem);
  if (isOpen) {
    const sec = String(getCurrentMinuteRemainingSec()).padStart(2, "0");
    const autoTxt = shouldUseAutoHighLowExecution()
      ? ` | AUTO HL C:${formatExecutionPlanMini(callPlan)} V:${formatExecutionPlanMini(putPlan)}`
      : "";
    const giroState = getGiroAllowedTradeSide(modalCurrentItem);
    let giroTxt = "";
    if (giroState.active) {
      if (giroState.bodyDir > 0) giroTxt = " | SOLO GIRO: habilitada VENTA";
      else if (giroState.bodyDir < 0) giroTxt = " | SOLO GIRO: habilitada COMPRA";
      else giroTxt = " | SOLO GIRO: esperando definición";
    }
    bar.textContent = `🟢 VELA ABIERTA | faltan ${sec}s${autoTxt}${giroTxt}`;
    bar.style.color = "#dcfce7";
    bar.style.background = "rgba(22,163,74,.18)";
    bar.style.borderColor = "rgba(34,197,94,.34)";
    bar.style.boxShadow = "0 0 0 1px rgba(34,197,94,.06) inset";
  } else {
    bar.textContent = `${getTradeScopeText()} | VELA CERRADA`;
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
  setSignalConfirmationControlsVisible(true);
  updateSignalConfirmationUI();

  applyModalExecutionButtonUI(locked, candleClosed);
  applyGiroOnlyTradeButtons(modalCurrentItem, locked, candleClosed);
  applySignalConfirmationTradeGate(locked, candleClosed);
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
      const autoExec = shouldUseAutoHighLowExecution() && it ? (it.autoHighLow || null) : null;
      const autoTag = autoExec ? ` | HL C:${formatExecutionPlanMini(autoExec.call)} V:${formatExecutionPlanMini(autoExec.put)}` : "";
      const confTag = ` | CONF:${getSignalConfirmationCount(it)}/${SIGNAL_CONFIRM_MIN}`;
      modalSub.textContent = `${it.time} | ${getTradeScopeText()} | ticks: ${n}${confTag}${tagLive}${dTag ? " | " + dTag : ""}${tBadge}${autoTag}`;
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
  ensureSignalConfirmationControls();

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
function getScopedDisciplineStorageKey(baseKey) {
  const scope = activeTradingAccount === ACCOUNT_MODE_REAL ? ACCOUNT_MODE_REAL : ACCOUNT_MODE_DEMO;
  return `${baseKey}_${scope}`;
}
function resetDisciplineStateInMemory() {
  disciplineWindowStartMs = 0;
  disciplineWins = 0;
  disciplineLosses = 0;
  disciplineLockUntilMs = 0;
  disciplinePendingContracts = [];
}
function readScopedDisciplineValue(baseKey, fallback = "0") {
  try {
    const scopedKey = getScopedDisciplineStorageKey(baseKey);
    let raw = localStorage.getItem(scopedKey);
    if (raw === null && activeTradingAccount === ACCOUNT_MODE_DEMO) raw = localStorage.getItem(baseKey);
    return raw === null ? fallback : raw;
  } catch {
    return fallback;
  }
}
function loadDiscipline() {
  try {
    disciplineWindowStartMs = Number(readScopedDisciplineValue(DISCIPLINE_WINDOW_START_KEY, "0")) || 0;
    disciplineWins = Number(readScopedDisciplineValue(DISCIPLINE_WINS_KEY, "0")) || 0;
    disciplineLosses = Number(readScopedDisciplineValue(DISCIPLINE_LOSSES_KEY, "0")) || 0;
    disciplineLockUntilMs = Number(readScopedDisciplineValue(DISCIPLINE_LOCK_UNTIL_KEY, "0")) || 0;

    const raw = readScopedDisciplineValue(DISCIPLINE_PENDING_CONTRACTS_KEY, "[]");
    const arr = JSON.parse(raw);
    disciplinePendingContracts = Array.isArray(arr) ? arr.map(String) : [];
  } catch {
    resetDisciplineStateInMemory();
  }
}
function saveDiscipline() {
  try {
    localStorage.setItem(getScopedDisciplineStorageKey(DISCIPLINE_WINDOW_START_KEY), String(disciplineWindowStartMs || 0));
    localStorage.setItem(getScopedDisciplineStorageKey(DISCIPLINE_WINS_KEY), String(disciplineWins || 0));
    localStorage.setItem(getScopedDisciplineStorageKey(DISCIPLINE_LOSSES_KEY), String(disciplineLosses || 0));
    localStorage.setItem(getScopedDisciplineStorageKey(DISCIPLINE_LOCK_UNTIL_KEY), String(disciplineLockUntilMs || 0));
    localStorage.setItem(getScopedDisciplineStorageKey(DISCIPLINE_PENDING_CONTRACTS_KEY), JSON.stringify(disciplinePendingContracts || []));
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
function isDisciplineBypassedForCurrentAccount() {
  return activeTradingAccount === ACCOUNT_MODE_REAL;
}
function isTradeLockedNow() {
  if (isDisciplineBypassedForCurrentAccount()) return false;
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
  if (isDisciplineBypassedForCurrentAccount()) {
    const pend = (disciplinePendingContracts || []).length;
    const pTxt = pend ? ` • Pendientes:${pend}` : "";
    return `Disciplina REAL: libre para pruebas${pTxt}`;
  }

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
  if (!isDisciplineBypassedForCurrentAccount() && disciplineLockUntilMs && Date.now() >= disciplineLockUntilMs) {
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
  if (isDisciplineBypassedForCurrentAccount()) return;

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
  if (isDisciplineBypassedForCurrentAccount()) return;
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

  modalTitle.textContent = `${item.symbol} – ${labelDir(item.direction)} | [${item.mode || "NORMAL"}] | ${getTradeScopeText()}`;

  modalLive = isItemLiveMinute(item);
  updateModalLiveUI();

  chartModal.classList.remove("hidden");
  chartModal.setAttribute("aria-hidden", "false");

  item.signalConfirmations ||= [];
  applyModalTradeButtonsLayout();
  setSignalConfirmationControlsVisible(true);
  updateSignalConfirmationUI();
  if (shouldUseAutoHighLowExecution()) ensureSignalAutoPrecalc(item);
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
  setSignalConfirmationControlsVisible(false);
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
  updateCounter();

  try {
    upsertTradeJournalFromSignal(item);
  } catch {}

  if (prevOutcome !== outcome) animateFailShake(item);
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

  const savedForPractice = isSignalSavedForPractice(item.id);
  const actionsHtml = opts.hideActions
    ? ""
    : `
    <div class="row-actions">
      <button class="voteBtn" data-v="like" type="button" ${item.vote ? "disabled" : ""}>👍</button>
      <button class="voteBtn" data-v="dislike" type="button" ${item.vote ? "disabled" : ""}>👎</button>
      <button class="savePracticeBtn ${savedForPractice ? "selected" : ""}" type="button" title="${savedForPractice ? "Quitar del pool de práctica" : "Guardar en el pool de práctica del modo correspondiente"}">💾</button>
      <input class="row-comment" style="max-width:118px; min-width:90px;" placeholder="comentario" value="${escapeHtml(item.comment || "")}">
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

    const savePracticeBtn = row.querySelector(".savePracticeBtn");
    if (savePracticeBtn) {
      const refreshSaveBtn = (saved) => {
        savePracticeBtn.classList.toggle("selected", !!saved);
        savePracticeBtn.title = saved
          ? `Ya guardada en práctica (${normalizePracticeEntryMode(item.mode)})`
          : `Guardar en el pool de práctica ${normalizePracticeEntryMode(item.mode)}`;

        savePracticeBtn.style.transition = "box-shadow .18s ease, border-color .18s ease, background .18s ease, transform .18s ease, opacity .18s ease";
        savePracticeBtn.style.borderRadius = "12px";
        savePracticeBtn.style.minWidth = "40px";
        savePracticeBtn.style.fontWeight = "900";

        if (saved) {
          savePracticeBtn.style.opacity = "1";
          savePracticeBtn.style.color = "#ecfeff";
          savePracticeBtn.style.borderColor = "rgba(34,211,238,.92)";
          savePracticeBtn.style.background = "linear-gradient(180deg, rgba(20,184,166,.28), rgba(34,197,94,.18))";
          savePracticeBtn.style.boxShadow = "0 0 0 1px rgba(34,211,238,.22) inset, 0 0 14px rgba(34,211,238,.50), 0 0 24px rgba(34,197,94,.26)";
          savePracticeBtn.style.transform = "translateY(-1px)";
          savePracticeBtn.setAttribute("aria-pressed", "true");
        } else {
          savePracticeBtn.style.opacity = "0.92";
          savePracticeBtn.style.color = "";
          savePracticeBtn.style.borderColor = "";
          savePracticeBtn.style.background = "";
          savePracticeBtn.style.boxShadow = "";
          savePracticeBtn.style.transform = "";
          savePracticeBtn.setAttribute("aria-pressed", "false");
        }
      };
      refreshSaveBtn(savedForPractice);

      savePracticeBtn.onclick = (e) => {
        e.stopPropagation();
        const saved = togglePracticeSavedSignal(item);
        refreshSaveBtn(saved);
        ensurePracticeQueue();
        updatePracticePoolLabel();
        if ((localStorage.getItem("activeView") || "signals") === "practice") ensurePracticeReady();
        toast(
          saved
            ? `💾 Guardada para práctica ${normalizePracticeEntryMode(item.mode)}`
            : "🗑️ Quitada del pool de práctica",
          1700
        );
      };
    }

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
    else {
      const rawMode = String(it.mode || "");
      const normalizedFamily = normalizeSignalMode(rawMode);
      it.mode = normalizedFamily !== MODE_NORMAL || /^normal$/i.test(rawMode) ? normalizedFamily : rawMode.toUpperCase();
    }
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
   Trading account + tracking de outcome
========================= */
function getDerivToken() {
  try {
    return localStorage.getItem(getTradingAccountTokenKey()) || "";
  } catch {
    return "";
  }
}
function setDerivToken(t) {
  try {
    localStorage.setItem(getTradingAccountTokenKey(), t || "");
  } catch {}
}
function clearDerivToken() {
  try {
    localStorage.removeItem(getTradingAccountTokenKey());
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
  if (!token) throw new Error(`Sin token ${getTradingAccountLabel()} (cargalo en Configuración)`);

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
  assertSignalMinimumConfirmations();

  if (tradeInFlight) throw new Error("Operación en curso");
  tradeInFlight = true;

  try {
    await ensureAuthorized();
    startNewDisciplineWindowIfNeeded();

    const symbol =
      symbolOverride || (modalCurrentItem && modalCurrentItem.symbol) || (history.at(-1)?.symbol || "R_25");
    const stake = getTradeStake();
    let res = null;
    let contractLabel = side;
    let tradeExtra = { side, symbol };

    if (shouldUseAutoHighLowExecution() && modalCurrentItem?.id) {
      ensureSignalAutoPrecalc(modalCurrentItem);
      let plan = getCachedExecutionPlan(modalCurrentItem, side, AUTO_PRECALC_STALE_MS * 2);
      if (!plan) {
        toast(`⏳ Buscando ${side === "CALL" ? "HIGHER" : "LOWER"} rápido…`, 1200);
        plan = await ensureExecutionPlanForTrade(modalCurrentItem, side);
      }
      if (!plan?.proposalId || !Number.isFinite(plan.askPrice)) {
        throw new Error(`No encontré barrier válido para ${side === "CALL" ? "HIGHER" : "LOWER"}`);
      }

      res = await wsRequest({ buy: plan.proposalId, price: plan.askPrice }, 20000);
      contractLabel = plan.contractType || contractLabel;
      tradeExtra = {
        ...tradeExtra,
        exec_mode: executionMode,
        contract_type: contractLabel,
        barrier: plan.barrier,
        target_return_pct: Math.round(plan.profitPct),
        proposal_id: plan.proposalId,
      };
    } else {
      res = await wsRequest(
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
    }

    if (res?.error) throw new Error(res.error.message || "buy error");
    if (!res?.buy) throw new Error("buy: respuesta inválida (sin buy)");

    const cid = res?.buy?.contract_id;
    if (!cid) throw new Error("buy ok pero sin contract_id (no puedo trackear ITM/OTM)");

    if (modalCurrentItem && modalCurrentItem.id) {
      setTradeBadge(modalCurrentItem, "PENDING", { contract_id: String(cid), ...tradeExtra });
      linkContractToSignal(cid, modalCurrentItem.id);
    }

    subscribeContractOutcome(cid, true);
    scheduleOutcomeFallbackPoll(cid, 85000);

    toast(`📌 ${getTradingAccountLabel()} trade registrado (${contractLabel}). Esperando resultado… (${disciplineWins}W/${disciplineLosses}L)`, 1800);

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
      toast(shouldUseAutoHighLowExecution() ? "🟢 Enviando HIGHER…" : "🟢 Enviando COMPRA…", 1200);

      const r = await Promise.race([
        buyOneClick("CALL"),
        new Promise((_, rej) => setTimeout(() => rej(new Error("timeout trade")), 22000)),
      ]);

      const cid = r?.buy?.contract_id || "";
      toast(`🟢 ${getTradingAccountLabel()} COMPRADO ✓ ${cid ? "ID: " + cid : ""}`, 1800);
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
      toast(shouldUseAutoHighLowExecution() ? "🔴 Enviando LOWER…" : "🔴 Enviando VENTA…", 1200);

      const r = await Promise.race([
        buyOneClick("PUT"),
        new Promise((_, rej) => setTimeout(() => rej(new Error("timeout trade")), 22000)),
      ]);

      const cid = r?.buy?.contract_id || "";
      toast(`🔴 ${getTradingAccountLabel()} VENDIDO ✓ ${cid ? "ID: " + cid : ""}`, 1800);
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
  ensureTradingAccountButton();
  applyTradingAccountUI();
  applyTradingAccountBannerUI();
  const tokenInput = pickEl("tokenInput", "derivTokenInput", "demoTokenInput", "tokenDemoInput", "tradeTokenInput");
  const tokenSaveBtn = pickEl("tokenSaveBtn", "saveTokenBtn", "btnSaveToken");
  const tokenClearBtn = pickEl("tokenClearBtn", "deleteTokenBtn", "btnClearToken", "btnDeleteToken");

  syncAccountScopedSettingsUI();

  if (tokenSaveBtn && tokenInput) {
    tokenSaveBtn.onclick = () => {
      const v = String(tokenInput.value || "").trim();
      if (!v) return alert(`Pegá un token ${getTradingAccountLabel()} primero.`);
      setDerivToken(v);
      resetAuthState();
      syncAccountScopedSettingsUI();
      toast(`💾 Token ${getTradingAccountLabel()} guardado ✓`, 1600);
      alert(`✅ Token ${getTradingAccountLabel()} guardado.`);
    };
  }

  if (tokenClearBtn) {
    tokenClearBtn.onclick = () => {
      clearDerivToken();
      resetAuthState();
      syncAccountScopedSettingsUI();
      toast(`🗑️ Token ${getTradingAccountLabel()} borrado ✓`, 1600);
      alert(`🗑️ Token ${getTradingAccountLabel()} borrado.`);
    };
  }

  const stakeInput = pickEl("stakeInput", "tradeStakeInput", "stakeUsdInput");
  const stakeSaveBtn = pickEl("stakeSaveBtn", "saveStakeBtn", "btnSaveStake");
  const stakeDefaultBtn = pickEl("stakeDefaultBtn", "defaultStakeBtn", "btnDefaultStake");

  if (stakeInput) syncStakeInputWithCurrentAccount();

  if (stakeSaveBtn && stakeInput) {
    stakeSaveBtn.onclick = () => {
      const n = Number(stakeInput.value);
      if (!Number.isFinite(n) || n <= 0) return alert("Stake inválido.");
      const ok = setTradeStake(n);
      if (!ok) return alert("No se pudo guardar el stake.");
      syncStakeInputWithCurrentAccount();
      toast(`💾 Stake ${getTradingAccountLabel()} guardado ✓`, 1600);
      alert(`✅ Stake ${getTradingAccountLabel()} guardado: ${Number(getTradeStake()).toFixed(2)} USD`);
    };
  }

  if (stakeDefaultBtn && stakeInput) {
    stakeDefaultBtn.onclick = () => {
      clearTradeStake();
      setTradeStake(DEFAULT_STAKE);
      syncStakeInputWithCurrentAccount();
      toast(`↩️ Stake default ${getTradingAccountLabel()} ✓`, 1600);
      alert(`↩️ Stake default ${getTradingAccountLabel()}: ${Number(DEFAULT_STAKE).toFixed(2)} USD`);
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

  // Aplica a TODAS las señales de prevMinute (NORMAL + GIRO) si todavía no tienen nextOutcome
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
    cleanupExecutionPlanCache();
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

    // En GIRO / GIRO FLEX no hay retry: evalúan solo en el segundo elegido
    if (!ok && signalMode === MODE_NORMAL) scheduleRetry(minute);
  }
}
function scheduleRetry(minute) {
  if (evalRetryTimer) clearTimeout(evalRetryTimer);
  evalRetryTimer = setTimeout(() => {
    if (Math.floor(Date.now() / 60000) === minute) evaluateMinute(minute);
  }, RETRY_DELAY_MS);
}

/* =========================
   Technical rules + Evaluation (NORMAL + GIRO v2)
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
   GIRO
   - PUT  = vela sigue verde, pero el vendedor ya gana mando interno
   - CALL = vela sigue roja, pero el comprador ya gana mando interno
========================= */
const RULES_GIRO = {
  baseScoreMin: 0.0105,
  bodyVsRangeMin: 0.08,
  wholeDirRatioMin: 0.38,
  wholeDirRatioMax: 0.82,

  leadMoveMinFracRange: 0.30,
  earlyDriveMinFracTotal: 0.16,

  lateOppRatioMin: 0.42,
  lateAgainstMinFracTotal: 0.04,
  last8AgainstMinFracTotal: 0.02,

  counterAttackMinFracTotal: 0.05,
  counterAttackMaxFracTotal: 0.98,

  responseVsAttackMax: 1.18,
  reclaimFromExtremeMinFracRange: 0.05,

  irregularityMin: 0.09,
  oppositeLateControlMin: 0.52,
  dominantReduceMax: 1.12,
  minOppStepsSecondHalf: 2,
  qualityBias: 1.0,
};

const RULES_GIRO_FLEX = {
  baseScoreMin: 0.0088,
  bodyVsRangeMin: 0.06,
  wholeDirRatioMin: 0.34,
  wholeDirRatioMax: 0.86,

  leadMoveMinFracRange: 0.24,
  earlyDriveMinFracTotal: 0.12,

  lateOppRatioMin: 0.38,
  lateAgainstMinFracTotal: 0.03,
  last8AgainstMinFracTotal: 0.012,

  counterAttackMinFracTotal: 0.035,
  counterAttackMaxFracTotal: 1.08,

  responseVsAttackMax: 1.32,
  reclaimFromExtremeMinFracRange: 0.035,

  irregularityMin: 0.055,
  oppositeLateControlMin: 0.42,
  dominantReduceMax: 1.26,
  minOppStepsSecondHalf: 1,
  qualityBias: 0.92,
};

function segmentMoveSigned(ticks, aMs, bMs, dirSign) {
  const a = getPriceAtMs(ticks, aMs);
  const b = getPriceAtMs(ticks, bMs);
  if (a == null || b == null) return 0;
  return (b - a) * dirSign;
}

function coeffVar(arr) {
  const vals = (arr || []).filter((x) => Number.isFinite(x) && x > 0);
  if (vals.length < 2) return 0;
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  if (!mean) return 0;
  const variance = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length;
  return Math.sqrt(variance) / mean;
}

function buildGiroCheckpoints(evalMs) {
  return [...new Set([0, 7000, 14000, 21000, 28000, 35000, 40000, evalMs].filter((ms) => ms <= evalMs))].sort((a, b) => a - b);
}

function computeWeakResponseAfterCounter(ticks, dirSign, fromMs, toMs) {
  const pts = sliceTicks(ticks, fromMs, toMs);
  if (!pts.length) return { attack: 0, response: 0, ratio: 999 };

  const pStart = getPriceAtMs(ticks, fromMs);
  const pEnd = getPriceAtMs(ticks, toMs);
  if (pStart == null || pEnd == null) return { attack: 0, response: 0, ratio: 999 };

  let attack = 0;
  let response = 0;

  if (dirSign > 0) {
    let minLate = pStart;
    for (const t of pts) minLate = Math.min(minLate, t.quote);
    attack = Math.max(0, pStart - minLate);
    response = Math.max(0, pEnd - minLate);
  } else {
    let maxLate = pStart;
    for (const t of pts) maxLate = Math.max(maxLate, t.quote);
    attack = Math.max(0, maxLate - pStart);
    response = Math.max(0, maxLate - pEnd);
  }

  return {
    attack,
    response,
    ratio: attack > 1e-12 ? response / attack : 999,
  };
}

function average(nums) {
  const vals = (nums || []).filter((x) => Number.isFinite(x));
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
}

function getDirectionalLeadFromStart(p0, minP, maxP, dirSign) {
  return dirSign > 0 ? Math.max(0, maxP - p0) : Math.max(0, p0 - minP);
}

function getReclaimFromExtremeToClose(pClose, minP, maxP, dirSign) {
  return dirSign > 0 ? Math.max(0, maxP - pClose) : Math.max(0, pClose - minP);
}

function buildStepStrengthSummary(stepMoves, dirSign, splitIndex) {
  const dominantSteps = [];
  const dominantStepsLate = [];
  const dominantStepsEarly = [];
  const oppositeStepsLate = [];
  let oppositeLateSum = 0;
  let dominantLateSum = 0;

  for (let i = 0; i < stepMoves.length; i++) {
    const raw = Number(stepMoves[i] || 0);
    if (!Number.isFinite(raw) || Math.abs(raw) < 1e-12) continue;
    const abs = Math.abs(raw);
    const isDominant = Math.sign(raw) === dirSign;
    const isLate = i >= splitIndex;

    if (isDominant) {
      dominantSteps.push(abs);
      if (isLate) {
        dominantStepsLate.push(abs);
        dominantLateSum += abs;
      } else {
        dominantStepsEarly.push(abs);
      }
    } else if (isLate) {
      oppositeStepsLate.push(abs);
      oppositeLateSum += abs;
    }
  }

  const firstDomAvg = average(dominantStepsEarly.slice(0, 2).length ? dominantStepsEarly.slice(0, 2) : dominantSteps.slice(0, 2));
  const lastDomAvg = average(dominantStepsLate.slice(-2).length ? dominantStepsLate.slice(-2) : dominantSteps.slice(-2));
  const oppositeLateControl = oppositeLateSum / (dominantLateSum + 1e-12);

  return {
    dominantSteps,
    dominantStepsEarly,
    dominantStepsLate,
    oppositeStepsLate,
    firstDomAvg,
    lastDomAvg,
    oppositeLateControl,
  };
}

function detectGiroPatternWithRules(candidate, rules) {
  const ticks = candidate?.ticks || [];
  const evalMs = EVAL_SEC * 1000;
  if (ticks.length < 6) return null;
  if (candidate.score < rules.baseScoreMin) return null;

  const p0 = getPriceAtMs(ticks, 0);
  const p15 = getPriceAtMs(ticks, 15000);
  const p30 = getPriceAtMs(ticks, 30000);
  const pE = getPriceAtMs(ticks, evalMs);
  if (p0 == null || p15 == null || p30 == null || pE == null) return null;

  const totalMove = pE - p0;
  const dirSign = Math.sign(totalMove);
  if (!dirSign) return null;

  const fullTicks = sliceTicks(ticks, 0, evalMs);
  if (fullTicks.length < 4) return null;

  const qs = fullTicks.map((t) => t.quote);
  const minP = Math.min(...qs);
  const maxP = Math.max(...qs);
  const range = Math.max(1e-12, maxP - minP);
  const absTotal = Math.abs(totalMove);

  const bodyVsRange = absTotal / range;
  if (bodyVsRange < rules.bodyVsRangeMin) return null;

  const wholeDirRatio = directionalRatio(fullTicks, dirSign);
  if (wholeDirRatio < rules.wholeDirRatioMin) return null;
  if (wholeDirRatio > rules.wholeDirRatioMax) return null;

  const leadMove = getDirectionalLeadFromStart(p0, minP, maxP, dirSign);
  if (leadMove < range * rules.leadMoveMinFracRange) return null;

  const earlyDrive = Math.max(
    segmentMoveSigned(ticks, 0, 15000, dirSign),
    segmentMoveSigned(ticks, 0, 30000, dirSign)
  );
  if (earlyDrive < absTotal * rules.earlyDriveMinFracTotal) return null;

  const lateStartMs = Math.max(0, evalMs - 14000);
  const last8StartMs = Math.max(0, evalMs - 8000);
  const lateTicks = sliceTicks(ticks, lateStartMs, evalMs);
  const lateOppRatio = directionalRatio(lateTicks, -dirSign);
  const lateAgainstMove = segmentMoveSigned(ticks, lateStartMs, evalMs, -dirSign);
  const last8AgainstMove = segmentMoveSigned(ticks, last8StartMs, evalMs, -dirSign);

  if (lateOppRatio < rules.lateOppRatioMin) return null;
  if (lateAgainstMove < absTotal * rules.lateAgainstMinFracTotal) return null;
  if (last8AgainstMove < absTotal * rules.last8AgainstMinFracTotal) return null;

  const counterAnchorMs = Math.max(12000, Math.min(30000, evalMs - 12000));
  const counterAnchorPrice = getPriceAtMs(ticks, counterAnchorMs);
  if (counterAnchorPrice == null) return null;
  const attackFromAnchor = oppositeAttackDepth(sliceTicks(ticks, counterAnchorMs, evalMs), dirSign, counterAnchorPrice);
  if (attackFromAnchor < absTotal * rules.counterAttackMinFracTotal) return null;
  if (attackFromAnchor > absTotal * rules.counterAttackMaxFracTotal) return null;

  const weakResp = computeWeakResponseAfterCounter(ticks, dirSign, counterAnchorMs, evalMs);
  if (weakResp.ratio > rules.responseVsAttackMax) return null;

  const reclaimFromExtreme = getReclaimFromExtremeToClose(pE, minP, maxP, dirSign);
  if (reclaimFromExtreme < range * rules.reclaimFromExtremeMinFracRange) return null;

  const cps = buildGiroCheckpoints(evalMs);
  const stepMoves = [];
  for (let i = 1; i < cps.length; i++) {
    const a = getPriceAtMs(ticks, cps[i - 1]);
    const b = getPriceAtMs(ticks, cps[i]);
    if (a == null || b == null) return null;
    stepMoves.push(b - a);
  }

  const splitIndex = Math.max(1, Math.floor(stepMoves.length / 2));
  const summary = buildStepStrengthSummary(stepMoves, dirSign, splitIndex);
  const irregularity = coeffVar(summary.dominantSteps);
  const dominantReduce = summary.firstDomAvg > 1e-12 ? summary.lastDomAvg / summary.firstDomAvg : 999;

  if (irregularity < rules.irregularityMin) return null;
  if (summary.oppositeLateControl < rules.oppositeLateControlMin) return null;
  if (dominantReduce > rules.dominantReduceMax) return null;
  if (summary.oppositeStepsLate.length < rules.minOppStepsSecondHalf) return null;

  const quality =
    lateOppRatio * 100 +
    (attackFromAnchor / (absTotal || 1e-9)) * 24 +
    (1 - Math.min(1.35, weakResp.ratio)) * 22 +
    Math.min(1.4, summary.oppositeLateControl) * 18 +
    irregularity * 16 +
    (reclaimFromExtreme / range) * 12 -
    Math.max(0, dominantReduce - 1) * 10;

  return {
    direction: dirSign > 0 ? "PUT" : "CALL",
    quality: quality * Number(rules.qualityBias || 1),
    giroScore: quality,
  };
}

function detectGiroPattern(candidate) {
  return detectGiroPatternWithRules(candidate, RULES_GIRO);
}

function detectGiroFlexiblePattern(candidate) {
  return detectGiroPatternWithRules(candidate, RULES_GIRO_FLEX);
}

function evaluateMinute(minute) {
  const strictLikeMode = signalMode !== MODE_NORMAL;
  const data = minuteData[minute];
  if (!data) return strictLikeMode ? true : false;

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

    candidates.push({
      symbol: sym,
      move,
      score,
      ticks,
      vol,
    });
  }

  if (readySymbols < MIN_SYMBOLS_READY || candidates.length === 0) return strictLikeMode ? true : false;

  if (signalMode === MODE_GIRO || signalMode === MODE_GIRO_FLEX) {
    const matches = [];

    for (const c of candidates) {
      const match = signalMode === MODE_GIRO_FLEX ? detectGiroFlexiblePattern(c) : detectGiroPattern(c);
      if (!match) continue;

      matches.push({
        ...c,
        direction: match.direction,
        quality: match.quality,
        giroScore: match.giroScore,
      });
    }

    if (!matches.length) return true;

    matches.sort((a, b) => b.quality - a.quality || b.giroScore - a.giroScore);
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
  const modeLabel = normalizeSignalMode(signalMode);
  const modeId = modeLabel.replace(/\s+/g, "_");
  const item = {
    id: `${minute}-${symbol}-${direction}-${modeId}`,
    minute,
    time: fmtTimeUTC(minute),
    symbol,
    direction,
    mode: modeLabel,
    mode_version: getModeVersion(modeLabel),
    vote: "",
    comment: "",
    ticks: Array.isArray(ticks) ? ticks.slice() : [],
    nextOutcome: "",
    minuteComplete: false,
    trade: null,
    signalConfirmations: [],
  };

  if (history.some((x) => x.id === item.id)) return;

  history.push(item);
  if (history.length > MAX_HISTORY) history = history.slice(-MAX_HISTORY);
  saveHistory(history);

  updateCounter();

  if (signalsEl) signalsEl.prepend(buildRow(item));
  updateRowChartBtn(item);
  if (shouldUseAutoHighLowExecution()) ensureSignalAutoPrecalc(item);

  if (soundEnabled && sound) {
    sound.currentTime = 0;
    sound.play().catch(() => {});
  }
  if (vibrateEnabled && "vibrate" in navigator) navigator.vibrate([120]);

  showNotification(symbol, direction, modeLabel, item);

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
   WebSocket Deriv
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
    PRACTICE_EVAL_SEC = 40;
    localStorage.setItem("practiceEvalSec", "40");
    paintPracticeSecButtons();
    if (practiceRound && !practiceRound.finished) startPracticeRound(practiceRound.entry);
    else ensurePracticeReady();
  };
}
if (practice45Btn) {
  practice45Btn.onclick = () => {
    PRACTICE_EVAL_SEC = 45;
    localStorage.setItem("practiceEvalSec", "45");
    paintPracticeSecButtons();
    if (practiceRound && !practiceRound.finished) startPracticeRound(practiceRound.entry);
    else ensurePracticeReady();
  };
}
if (practiceCallBtn) {
  practiceCallBtn.onclick = () => {
    if (!practiceRound || practiceRound.finished || practiceRound.answer) return;
    if (!hasPracticeMinimumConfirmations()) {
      const faltan = PRACTICE_CONFIRM_MIN - getPracticeConfirmationCount();
      updatePracticeResult(`🧠 Faltan ${faltan} confirmación${faltan === 1 ? "" : "es"}. Si no hay 3 claras, PASAR.`, "is-pass");
      toast("Primero marcá 3 confirmaciones", 1400);
      return;
    }
    practiceRound.answer = "CALL";
    setPracticeDecisionState(true, "CALL");
    updatePracticeResult("🟢 COMPRA elegida. Esperando cierre de la vela…", "is-pass");
  };
}
if (practicePutBtn) {
  practicePutBtn.onclick = () => {
    if (!practiceRound || practiceRound.finished || practiceRound.answer) return;
    if (!hasPracticeMinimumConfirmations()) {
      const faltan = PRACTICE_CONFIRM_MIN - getPracticeConfirmationCount();
      updatePracticeResult(`🧠 Faltan ${faltan} confirmación${faltan === 1 ? "" : "es"}. Si no hay 3 claras, PASAR.`, "is-pass");
      toast("Primero marcá 3 confirmaciones", 1400);
      return;
    }
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
   Inicialización
========================= */
loadLowPowerMode();
loadAutoOpenChartSetting();
loadTradingAccountMode();
loadDiscipline();
loadTradeLinks();
loadExecutionMode();

renderHistory();
initNotificationOpenRouting();
updateTickHealthUI();
updateCountdownUI();

ensureLowPowerButton();
applyLowPowerModeUI();

ensureAutoOpenChartButton();
applyAutoOpenChartUI();
ensureExecutionModeButton();
applyExecutionModeUI();

ensureTradingAccountButton();
applyTradingAccountUI();
applyTradingAccountBannerUI();
initWakeButton();
initTokenAndStakeUI();

ensureResetCacheButton();
ensureSplitClearButtons();

applyModalTradeButtonsLayout();
updateModalCandleStatusUI();
updateDisciplineLockUI(false);

seedTradesJournalFromHistory();

ensureInlineClearButtons();
ensurePracticeFilterButton();
applyPracticeFilterButtonUI();

connect();