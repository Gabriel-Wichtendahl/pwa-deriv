// app.js — Base estable + LIVE chart FIX + NORMAL+DEBILIDAD FLEX + ✅ Práctica pool sin duplicados/repetición + Trades no quedan colgados (timeouts + race) + ✅ Auto-abrir gráfico (configurable) + ✅ señales activas en Trades/Práctica + ✅ Modo LIKE MANTENIDO
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
// ✅ NUEVO: Práctica y Señales con confirmaciones direccionales COMPRA/VENTA, 4 puntos netos y bloqueo del lado contrario
// ✅ NUEVO: Práctica permite guardar formaciones claras para exportar junto al journal
// ✅ FIX PRÁCTICA: pool deduplicada por vela/ticks, orden persistente y sin repetir la última vela al remezclar
// ✅ NUEVO PRÁCTICA: auto-entrada al segundo 57 si ya hay 4 confirmaciones netas para COMPRA/VENTA
// ✅ NUEVO REAL: señales reales funcionan como práctica: 4 puntos netos por dirección + auto-entrada al segundo 57
// ✅ NUEVO: Modo GIRO + APRENDIZAJE con botones para enseñar “es mi formación / no es / dudosa / muy clara”

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

/* =========================
   Gestión C100 REAL
========================= */
const C100_STATE_KEY = "gestionC100Real_state_v1";
const C100_PAYOUT_REQUIRED = 95; // cálculo de tabla C100
const C100_MIN_PAYOUT = 92; // mínimo permitido para comprar
const C100_CAPITAL_BASE = 100;
const C100_MAX_LEVEL = 5;
const C100_MODE_LABEL = "SEMI_REAL";
const C100_LEVELS = [
  { level: 1, base: 1.18, compound: 2.30 },
  { level: 2, base: 1.61, compound: 3.13 },
  { level: 3, base: 2.19, compound: 4.27 },
  { level: 4, base: 2.97, compound: 5.79 },
  { level: 5, base: 4.03, compound: 7.85 },
];

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
let c100State = null;
let c100PanelEl = null;

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
const MODE_NORMAL_DEBILIDAD = "NORMAL + DEBILIDAD";
const MODE_FUERZA_DEBILIDAD_CLARA = "FUERZA/DEBILIDAD CLARA";
const MODE_LIKE_MANTENIDO = "LIKE MANTENIDO";
const MODE_GIRO_APRENDIZAJE = "GIRO + APRENDIZAJE";
const ANALYSIS_MODE_KEY = "analysisMode_v1";

const GIRO_LOGIC_VERSION = "GIRO_RAMA_REEMPLAZO_20260421";
const GIRO_FLEX_LOGIC_VERSION = "GIRO_FLEX_RAMA_REEMPLAZO_20260421";
const NORMAL_DEBILIDAD_LOGIC_VERSION = "NORMAL_DEBILIDAD_FUERZA_CLARA_20260427";
const FUERZA_DEBILIDAD_CLARA_LOGIC_VERSION = "FUERZA_DEBILIDAD_CLARA_IMPULSOS_RETROCESOS_20260501";
const LIKE_MANTENIDO_LOGIC_VERSION = "LIKE_MANTENIDO_17_TRADES_DIRECCION_ESTANCADA_20260501";
const GIRO_APRENDIZAJE_LOGIC_VERSION = "GIRO_APRENDIZAJE_42_LIKES_ESENCIA_20260501";
const GIRO_APRENDIZAJE_STORE_KEY = "giroAprendizajeExamples_v1";
const GIRO_APRENDIZAJE_MAX_EXAMPLES = 600;


function normalizeSignalMode(mode) {
  const m = String(mode || "").toUpperCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  if (m === MODE_GIRO || m === "MODO GIRO") return MODE_GIRO;
  if (m === MODE_GIRO_FLEX || m === "GIRO FLEXIBLE" || m === "MODO GIRO FLEX" || m === "MODO GIRO FLEXIBLE") return MODE_GIRO_FLEX;
  if (m === MODE_GIRO_APRENDIZAJE || m === "GIRO APRENDIZAJE" || m === "GIRO MAS APRENDIZAJE" || m === "GIRO MÁS APRENDIZAJE" || m === "MODO GIRO APRENDIZAJE" || m === "MODO GIRO + APRENDIZAJE" || m === "GIRO + LEARNING" || m === "GIRO LEARNING") return MODE_GIRO_APRENDIZAJE;
  if (m === MODE_LIKE_MANTENIDO || m === "LIKE" || m === "LIKES" || m === "MODO LIKE" || m === "MODO LIKES" || m === "SIMILARES LIKE" || m === "SIMILARES LIKES" || m === "TRADES LIKE" || m === "TRADES LIKES" || m === "GIRO LIKE" || m === "GIRO MANTENIDO" || m === "DIRECCION MANTENIDA" || m === "DIRECCIÓN MANTENIDA" || m === "MANTENIDO") return MODE_LIKE_MANTENIDO;
  if (m === MODE_FUERZA_DEBILIDAD_CLARA || m === "FUERZA DEBILIDAD CLARA" || m === "FUERZA Y DEBILIDAD CLARA" || m === "MODO FUERZA DEBILIDAD" || m === "MODO FUERZA/DEBILIDAD" || m === "IMPULSOS Y RETROCESOS" || m === "IMPULSOS RETROCESOS" || m === "FD CLARA" || m === "FDC") return MODE_FUERZA_DEBILIDAD_CLARA;
  if (m === MODE_NORMAL_DEBILIDAD || m === "NORMAL DEBILIDAD" || m === "NORMAL MAS DEBILIDAD" || m === "NORMAL MÁS DEBILIDAD" || m === "NORMAL + DFC" || m === "NORMAL DFC" || m === "MODO NORMAL DEBILIDAD" || m === "MODO NORMAL + DEBILIDAD" || m === "DEBILIDAD" || m === "MODO DEBILIDAD" || m === "DEBILIDAD PRO" || m === "FUERZA DEBILIDAD" || m === "FUERZA/DEBILIDAD" || m === "DFC") return MODE_NORMAL_DEBILIDAD;
  return MODE_NORMAL;
}
function isGiroFamilyMode(mode) {
  const m = normalizeSignalMode(mode);
  return m === MODE_GIRO || m === MODE_GIRO_FLEX || m === MODE_GIRO_APRENDIZAJE;
}
function getModeVersion(mode) {
  const m = normalizeSignalMode(mode);
  if (m === MODE_GIRO) return GIRO_LOGIC_VERSION;
  if (m === MODE_GIRO_FLEX) return GIRO_FLEX_LOGIC_VERSION;
  if (m === MODE_NORMAL_DEBILIDAD) return NORMAL_DEBILIDAD_LOGIC_VERSION;
  if (m === MODE_FUERZA_DEBILIDAD_CLARA) return FUERZA_DEBILIDAD_CLARA_LOGIC_VERSION;
  if (m === MODE_LIKE_MANTENIDO) return LIKE_MANTENIDO_LOGIC_VERSION;
  if (m === MODE_GIRO_APRENDIZAJE) return GIRO_APRENDIZAJE_LOGIC_VERSION;
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
  if (m === MODE_NORMAL_DEBILIDAD) return "🟦🟣 NORMAL + DEBILIDAD";
  if (m === MODE_FUERZA_DEBILIDAD_CLARA) return "⚡ FUERZA/DEBILIDAD";
  if (m === MODE_LIKE_MANTENIDO) return "🎯 LIKE MANTENIDO";
  if (m === MODE_GIRO_APRENDIZAJE) return "🧠 GIRO + APRENDIZAJE";
  return "🟦 Modo NORMAL";
}
function nextSignalMode(mode) {
  const m = normalizeSignalMode(mode);
  if (m === MODE_NORMAL) return MODE_NORMAL_DEBILIDAD;
  if (m === MODE_NORMAL_DEBILIDAD) return MODE_FUERZA_DEBILIDAD_CLARA;
  if (m === MODE_FUERZA_DEBILIDAD_CLARA) return MODE_LIKE_MANTENIDO;
  if (m === MODE_LIKE_MANTENIDO) return MODE_GIRO_APRENDIZAJE;
  if (m === MODE_GIRO_APRENDIZAJE) return MODE_GIRO;
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

/* =========================
   Giro + Aprendizaje — ejemplos enseñados por el usuario
========================= */
function loadGiroAprendizajeExamples() {
  try {
    const raw = localStorage.getItem(GIRO_APRENDIZAJE_STORE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter(Boolean).slice(0, GIRO_APRENDIZAJE_MAX_EXAMPLES) : [];
  } catch {
    return [];
  }
}
function saveGiroAprendizajeExamples(arr = giroAprendizajeExamples) {
  try {
    giroAprendizajeExamples = (Array.isArray(arr) ? arr : []).filter(Boolean).slice(0, GIRO_APRENDIZAJE_MAX_EXAMPLES);
    localStorage.setItem(GIRO_APRENDIZAJE_STORE_KEY, JSON.stringify(giroAprendizajeExamples));
  } catch {}
}
let giroAprendizajeExamples = loadGiroAprendizajeExamples();

function normalizeGiroAprendizajeLabel(label) {
  const l = String(label || "").toUpperCase().trim();
  if (["YES", "SI", "SÍ", "BUSCO", "TARGET", "LIKE", "FORMACION", "FORMACIÓN"].includes(l)) return "target";
  if (["CLEAR", "CLARA", "MUY_CLARA", "MUY CLARA", "STAR", "ESTRELLA"].includes(l)) return "clear";
  if (["NO", "AVOID", "DISLIKE", "NO_BUSCO", "NO BUSCO", "EVITAR"].includes(l)) return "avoid";
  if (["DUDOSA", "DUDA", "SIMILAR", "PARECIDA"].includes(l)) return "doubt";
  if (["REMOVE", "QUITAR", "BORRAR"].includes(l)) return "remove";
  return "doubt";
}
function getGiroAprendizajeLabelText(label) {
  const l = normalizeGiroAprendizajeLabel(label);
  if (l === "clear") return "⭐ Muy clara";
  if (l === "target") return "✅ Es mi formación";
  if (l === "avoid") return "❌ No es";
  if (l === "doubt") return "⚠️ Dudosa";
  return "—";
}
function getGiroAprendizajeKey(item) {
  if (!item) return "";
  const id = String(item.practice_id || item.journal_id || item.id || "");
  if (id) return id;
  return getPracticeCandleKey(item);
}
function findGiroAprendizajeExampleIndex(itemOrKey) {
  const key = typeof itemOrKey === "string" ? itemOrKey : getGiroAprendizajeKey(itemOrKey);
  if (!key) return -1;
  return (giroAprendizajeExamples || []).findIndex((x) => String(x?.source_key || x?.id || "") === key);
}
function getGiroAprendizajeExampleForItem(item) {
  const idx = findGiroAprendizajeExampleIndex(item);
  return idx >= 0 ? giroAprendizajeExamples[idx] : null;
}
function inferLearningDirectionFromOutcome(item) {
  const out = String(item?.nextOutcome || "").toLowerCase();
  if (out === "up") return "CALL";
  if (out === "down") return "PUT";

  const tradeSide = normalizeTradeDirection(item?.trade?.side || item?.trade?.contract_type);
  if (tradeSide) return tradeSide;

  return normalizeTradeDirection(item?.direction);
}
function buildGiroAprendizajeSnapshot(item, label, source = "modal") {
  if (!item) return null;
  const safeLabel = normalizeGiroAprendizajeLabel(label);
  if (safeLabel === "remove") return null;
  const key = getGiroAprendizajeKey(item);
  if (!key) return null;

  const learnedDirection = inferLearningDirectionFromOutcome(item);
  return {
    source_key: key,
    source,
    label: safeLabel,
    labelText: getGiroAprendizajeLabelText(safeLabel),
    saved_at: Date.now(),
    id: String(item.id || ""),
    journal_id: String(item.journal_id || ""),
    practice_id: String(item.practice_id || ""),
    minute: Number(item.minute || 0),
    time: String(item.time || ""),
    symbol: String(item.symbol || ""),
    direction: String(item.direction || ""),
    learnedDirection: learnedDirection || "",
    mode: normalizeSignalMode(item.mode || "NORMAL"),
    mode_version: String(item.mode_version || getModeVersion(item.mode || "NORMAL") || ""),
    nextOutcome: String(item.nextOutcome || ""),
    minuteComplete: !!item.minuteComplete,
    trade: item.trade && typeof item.trade === "object" ? { ...item.trade } : null,
    ticks: Array.isArray(item.ticks) ? item.ticks : [],
  };
}
function upsertGiroAprendizajeExample(item, label, source = "modal") {
  const safeLabel = normalizeGiroAprendizajeLabel(label);
  const key = getGiroAprendizajeKey(item);
  if (!key) return false;

  if (safeLabel === "remove") {
    const idx = findGiroAprendizajeExampleIndex(key);
    if (idx >= 0) giroAprendizajeExamples.splice(idx, 1);
    saveGiroAprendizajeExamples(giroAprendizajeExamples);
    updateGiroAprendizajeControlsUI();
    updateExportTradesButtonUI();
    toast("🗑️ Marca de aprendizaje quitada", 1200);
    return true;
  }

  const snap = buildGiroAprendizajeSnapshot(item, safeLabel, source);
  if (!snap) return false;
  const idx = findGiroAprendizajeExampleIndex(key);
  if (idx >= 0) giroAprendizajeExamples[idx] = { ...giroAprendizajeExamples[idx], ...snap, updated_at: Date.now() };
  else giroAprendizajeExamples.unshift(snap);
  saveGiroAprendizajeExamples(giroAprendizajeExamples);
  updateGiroAprendizajeControlsUI();
  updateExportTradesButtonUI();
  toast(`${getGiroAprendizajeLabelText(safeLabel)} guardada para Giro + Aprendizaje`, 1450);
  return true;
}
function getGiroAprendizajeStats() {
  const ex = Array.isArray(giroAprendizajeExamples) ? giroAprendizajeExamples : [];
  return {
    total: ex.length,
    clear: ex.filter((x) => normalizeGiroAprendizajeLabel(x?.label) === "clear").length,
    target: ex.filter((x) => normalizeGiroAprendizajeLabel(x?.label) === "target").length,
    avoid: ex.filter((x) => normalizeGiroAprendizajeLabel(x?.label) === "avoid").length,
    doubt: ex.filter((x) => normalizeGiroAprendizajeLabel(x?.label) === "doubt").length,
  };
}
function clearGiroAprendizajeExamples() {
  giroAprendizajeExamples = [];
  saveGiroAprendizajeExamples(giroAprendizajeExamples);
  updateGiroAprendizajeControlsUI();
  updateExportTradesButtonUI();
  toast("🧹 Aprendizaje Giro borrado", 1600);
}

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
function hashPracticeString(str) {
  let h = 2166136261;
  const s = String(str || "");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}
function getPracticeTicksFingerprint(ticks) {
  const pts = (Array.isArray(ticks) ? ticks : [])
    .filter((t) => Number.isFinite(Number(t?.ms)) && Number.isFinite(Number(t?.quote)))
    .slice()
    .sort((a, b) => Number(a.ms) - Number(b.ms));
  if (!pts.length) return "";

  const compact = pts
    .map((t) => `${Math.round(Number(t.ms))}:${Number(t.quote).toFixed(8)}`)
    .join("|");
  return `${pts.length}:${hashPracticeString(compact)}`;
}
function getPracticeCandleKey(entry) {
  if (!entry) return "";
  const symbol = String(entry.symbol || "").trim();
  const minute = Number.isFinite(Number(entry.minute)) ? String(Number(entry.minute)) : String(entry.minute || "");
  const ticksHash = getPracticeTicksFingerprint(entry.ticks);

  if (ticksHash) return `VELA::${symbol}::${minute}::${ticksHash}`;

  const fallbackId = String(entry.practice_id || entry.journal_id || entry.id || "");
  return fallbackId ? `ID::${fallbackId}` : "";
}
function getPracticeEntryKey(entry) {
  const identity = String(entry?.practice_id || entry?.journal_id || entry?.id || "");
  if (identity) return identity;
  const candleKey = getPracticeCandleKey(entry);
  return candleKey ? `CANDLE::${candleKey}` : "";
}
function dedupePracticeEntriesByCandle(entries) {
  const out = [];
  const seenCandles = new Set();
  const seenIds = new Set();

  for (const entry of Array.isArray(entries) ? entries : []) {
    const candleKey = getPracticeCandleKey(entry);
    const entryKey = getPracticeEntryKey(entry);
    const key = candleKey || entryKey;
    if (!key) continue;
    if (seenCandles.has(key) || (entryKey && seenIds.has(entryKey))) continue;
    seenCandles.add(key);
    if (entryKey) seenIds.add(entryKey);
    out.push(entry);
  }

  return out;
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
  if (idx >= 0) {
    const prev = tradesJournal[idx] || {};
    tradesJournal[idx] = {
      ...entry,
      // ✅ Mantener feedback de estudio escrito desde la pestaña Trades.
      vote: prev.vote || "",
      comment: prev.comment || "",
      feedback_at: prev.feedback_at || 0,
      feedback_source: prev.feedback_source || "",
    };
  } else {
    tradesJournal.unshift({
      ...entry,
      vote: "",
      comment: "",
      feedback_at: 0,
      feedback_source: "",
    });
  }

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
let signalConfirmBtnEl = null; // compat: apunta al botón de confirmación COMPRA
let signalConfirmBuyBtnEl = null;
let signalConfirmSellBtnEl = null;
let signalConfirmUndoBtnEl = null;
let signalConfirmHintEl = null;
let giroAprendizajePanelEl = null;
let giroAprendizajeCountEl = null;
let giroAprendizajeHintEl = null;
let giroAprendizajeButtonsEl = null;
const SIGNAL_CONFIRM_MIN = 4;
const SIGNAL_AUTO_ENTRY_MS = 57000;
const SIGNAL_AUTO_ENTRY_SEC = Math.round(SIGNAL_AUTO_ENTRY_MS / 1000);

let executionMode = EXECUTION_MODE_RISE_FALL;
const executionPlanCache = new Map();

/* =========================
   Status + Toast
   - setStatus() = estado permanente de la app
   - toast() = aviso corto que vuelve SIEMPRE al último estado real
========================= */
let toastTimer = null;
let appStatusText = statusEl?.textContent || "Conectando…";

function setStatus(msg) {
  try {
    appStatusText = String(msg || "");
    if (!toastTimer && statusEl) statusEl.textContent = appStatusText;
  } catch {}
}

function restoreStatusAfterToast(expectedText) {
  try {
    if (!statusEl) return;
    if (!expectedText || statusEl.textContent === expectedText) {
      statusEl.textContent = appStatusText || "Conectado – Analizando";
    }
  } catch {}
}

function toast(msg, ms = 1600) {
  try {
    if (!statusEl) return;

    const text = String(msg || "");
    statusEl.textContent = text;

    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastTimer = null;
      restoreStatusAfterToast(text);
    }, ms);
  } catch {}
}

/* =========================
   Debug visible
========================= */
(function initVisibleDebug() {
  const show = (msg) => {
    try {
      setStatus(msg);
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
    if (c100State) {
      c100State.accountMode = ACCOUNT_MODE_REAL;
      saveC100State();
    }
    updateC100PanelUI();
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

/* =========================
   Gestión C100 REAL
========================= */
function getC100Level(level = 1) {
  const n = Math.max(1, Math.min(C100_MAX_LEVEL, Number(level || 1)));
  return C100_LEVELS.find((x) => x.level === n) || C100_LEVELS[0];
}
function makeFreshC100State({ keepDay = false } = {}) {
  const prev = c100State || {};
  const lvl = getC100Level(1);
  return {
    enabled: !!prev.enabled,
    accountMode: ACCOUNT_MODE_REAL,
    level: 1,
    compoundStep: 0,
    currentStake: lvl.base,
    cycleLoss: 0,
    dayProfit: keepDay ? Number(prev.dayProfit || 0) : 0,
    dayLoss: keepDay ? Number(prev.dayLoss || 0) : 0,
    locked: false,
    pendingContractId: "",
    lastResult: "",
    updatedAt: Date.now(),
  };
}
function normalizeC100State(raw) {
  const base = makeFreshC100State();
  const obj = raw && typeof raw === "object" ? raw : {};
  const level = Math.max(1, Math.min(C100_MAX_LEVEL, Number(obj.level || 1)));
  const compoundStep = Number(obj.compoundStep || 0) === 1 ? 1 : 0;
  const lvl = getC100Level(level);
  const currentStake = Number(obj.currentStake);
  return {
    ...base,
    ...obj,
    enabled: !!obj.enabled,
    accountMode: ACCOUNT_MODE_REAL,
    level,
    compoundStep,
    currentStake: Number.isFinite(currentStake) && currentStake > 0 ? currentStake : (compoundStep ? lvl.compound : lvl.base),
    cycleLoss: Number(obj.cycleLoss || 0),
    dayProfit: Number(obj.dayProfit || 0),
    dayLoss: Number(obj.dayLoss || 0),
    locked: !!obj.locked,
    pendingContractId: obj.pendingContractId ? String(obj.pendingContractId) : "",
    lastResult: obj.lastResult ? String(obj.lastResult) : "",
    updatedAt: Number(obj.updatedAt || Date.now()),
  };
}
function loadC100State() {
  try {
    const raw = localStorage.getItem(C100_STATE_KEY);
    c100State = normalizeC100State(raw ? JSON.parse(raw) : null);
  } catch {
    c100State = makeFreshC100State();
  }
  saveC100State();
  return c100State;
}
function saveC100State() {
  try {
    if (!c100State) c100State = makeFreshC100State();
    c100State.updatedAt = Date.now();
    localStorage.setItem(C100_STATE_KEY, JSON.stringify(c100State));
  } catch {}
}
function resetC100Gestion({ keepDay = true, keepEnabled = true } = {}) {
  const enabled = keepEnabled ? !!c100State?.enabled : false;
  c100State = makeFreshC100State({ keepDay });
  c100State.enabled = enabled;
  saveC100State();
  stopAllExecutionPlanLoops();
  executionPlanCache.clear();
  updateC100PanelUI();
  updateModalCandleStatusUI();
}
function isC100RealModeAvailable() {
  return activeTradingAccount === ACCOUNT_MODE_REAL;
}
function isC100Active() {
  return !!c100State?.enabled && isC100RealModeAvailable();
}
function getC100Stake() {
  if (!c100State) loadC100State();
  const lvl = getC100Level(c100State.level);
  const stake = c100State.compoundStep === 1 ? lvl.compound : lvl.base;
  c100State.currentStake = stake;
  return Number(stake.toFixed(2));
}
function getEffectiveTradeStake() {
  return isC100Active() ? getC100Stake() : getTradeStake();
}
function getC100StatusText() {
  if (!c100State) loadC100State();
  if (!isC100RealModeAvailable()) return "Disponible solo en REAL";
  if (!c100State.enabled) return "Desactivada";
  if (c100State.locked) return "Bloqueada";
  if (c100State.pendingContractId) return "Contrato pendiente";
  if (c100State.compoundStep === 1) return "Buscando segundo ITM";
  if (Number(c100State.level || 1) > 1 || Number(c100State.cycleLoss || 0) > 0) return "Recuperando";
  return "Esperando señal";
}
function getC100DayNet() {
  return Number(c100State?.dayProfit || 0) - Number(c100State?.dayLoss || 0);
}
function ensureC100Panel() {
  if (c100PanelEl && c100PanelEl.isConnected) return c100PanelEl;
  const host =
    document.querySelector("#settingsModal .settingsBody .controls") ||
    document.querySelector(".settingsBody .controls") ||
    null;
  if (!host) return null;

  const panel = document.createElement("div");
  panel.id = "c100Panel";
  panel.style.gridColumn = "1 / -1";
  panel.style.padding = "12px";
  panel.style.borderRadius = "18px";
  panel.style.border = "1px solid rgba(251,191,36,.32)";
  panel.style.background = "linear-gradient(180deg, rgba(251,191,36,.10), rgba(255,255,255,.025))";
  panel.style.boxShadow = "0 0 22px rgba(251,191,36,.10), inset 0 0 0 1px rgba(255,255,255,.04)";
  panel.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px;">
      <div style="font-weight:950;font-size:15px;letter-spacing:.2px;">Gestión C100 REAL</div>
      <div id="c100StateBadge" style="font-weight:950;font-size:12px;padding:6px 10px;border-radius:999px;border:1px solid rgba(255,255,255,.14);background:rgba(0,0,0,.16);">OFF</div>
    </div>
    <div id="c100Info" style="display:grid;grid-template-columns:1fr;gap:6px;font-size:13px;line-height:1.35;color:var(--text,#e5e7eb);"></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px;">
      <button id="c100ToggleBtn" class="btn btnGhost" type="button">Activar C100</button>
      <button id="c100ResetBtn" class="btn btnGhost" type="button">Reset C100</button>
    </div>
  `;

  const lowPowerBtn = pickEl("lowPowerBtn");
  if (lowPowerBtn && lowPowerBtn.parentElement === host) {
    lowPowerBtn.insertAdjacentElement("afterend", panel);
  } else {
    host.appendChild(panel);
  }

  c100PanelEl = panel;
  const toggleBtn = panel.querySelector("#c100ToggleBtn");
  const resetBtn = panel.querySelector("#c100ResetBtn");
  if (toggleBtn) {
    toggleBtn.onclick = () => {
      if (!c100State) loadC100State();
      c100State.enabled = !c100State.enabled;
      c100State.accountMode = ACCOUNT_MODE_REAL;
      saveC100State();
      stopAllExecutionPlanLoops();
      executionPlanCache.clear();
      updateC100PanelUI();
      updateModalCandleStatusUI();
      toast(c100State.enabled ? "🟡 Gestión C100 REAL ON" : "⚪ Gestión C100 REAL OFF", 1600);
    };
  }
  if (resetBtn) {
    resetBtn.onclick = () => {
      const ok = confirm("¿Resetear la Gestión C100? Se reinicia nivel/ciclo/bloqueo y se conserva Ganancia/Pérdida del día.");
      if (!ok) return;
      resetC100Gestion({ keepDay: true, keepEnabled: true });
      toast("↺ Gestión C100 reseteada", 1600);
    };
  }
  updateC100PanelUI();
  return panel;
}
function updateC100PanelUI() {
  if (!c100State) loadC100State();
  const panel = ensureC100Panel();
  if (!panel) return;

  const badge = panel.querySelector("#c100StateBadge");
  const info = panel.querySelector("#c100Info");
  const toggleBtn = panel.querySelector("#c100ToggleBtn");
  const resetBtn = panel.querySelector("#c100ResetBtn");
  const active = isC100Active();
  const stake = getC100Stake();
  const net = getC100DayNet();
  const status = getC100StatusText();

  if (badge) {
    badge.textContent = c100State.enabled ? (active ? "ON" : "ON · SOLO REAL") : "OFF";
    badge.style.color = active ? "#fef3c7" : "rgba(229,231,235,.82)";
    badge.style.borderColor = active ? "rgba(251,191,36,.48)" : "rgba(255,255,255,.14)";
    badge.style.boxShadow = active ? "0 0 14px rgba(251,191,36,.18)" : "none";
  }
  if (toggleBtn) {
    toggleBtn.textContent = c100State.enabled ? "Desactivar C100" : "Activar C100";
    toggleBtn.classList.toggle("active", active);
    toggleBtn.title = "Modo SEMI_REAL: calcula stake y valida payout; compra solo cuando tocás el botón.";
  }
  if (resetBtn) {
    resetBtn.disabled = false;
    resetBtn.title = "Reinicia nivel/ciclo/bloqueo. Mantiene Ganancia/Pérdida del día.";
  }
  if (info) {
    info.innerHTML = `
      <div>Modo: <b>${C100_MODE_LABEL}</b> · Capital base: <b>$${C100_CAPITAL_BASE.toFixed(2)}</b></div>
      <div>Payout requerido: <b>${C100_PAYOUT_REQUIRED}%</b> · Payout mínimo: <b>${C100_MIN_PAYOUT}%</b></div>
      <div>Nivel actual: <b>${c100State.level} / ${C100_MAX_LEVEL}</b> · Paso compuesto: <b>${c100State.compoundStep} / 2</b></div>
      <div>Próximo stake: <b>$${stake.toFixed(2)}</b></div>
      <div>Estado: <b>${escapeHtml(status)}</b></div>
      <div>Pérdida del ciclo: <b>$${Math.max(0, Number(c100State.cycleLoss || 0)).toFixed(2)}</b></div>
      <div>Ganancia/Pérdida del día: <b>${net >= 0 ? "+" : "-"}$${Math.abs(net).toFixed(2)}</b></div>
      ${c100State.pendingContractId ? `<div>Contrato pendiente: <b>${escapeHtml(c100State.pendingContractId)}</b></div>` : ""}
      ${c100State.locked ? `<div style="color:#fecaca;font-weight:950;">Gestión C100 agotada. Reinicio manual requerido.</div>` : ""}
    `;
  }
}
function assertC100CanTrade() {
  if (!isC100Active()) return;
  if (c100State.locked) throw new Error("Gestión C100 agotada. Reinicio manual requerido.");
  if (c100State.pendingContractId) throw new Error(`Gestión C100: contrato pendiente ${c100State.pendingContractId}`);
  if ((disciplinePendingContracts || []).length > 0) throw new Error("Hay contrato pendiente. Esperá el cierre antes de operar C100.");
  if (!ws || ws.readyState !== 1) throw new Error("Conexión inestable: WebSocket no está listo.");
  if (!lastTickLocalNowMs) throw new Error("Conexión inestable: todavía no hay ticks confirmados.");
  const age = Date.now() - lastTickLocalNowMs;
  if (age > 8000) throw new Error(`Conexión inestable: último tick hace ${Math.round(age / 1000)}s.`);
}
function assertC100PayoutOK(profitPct) {
  if (!isC100Active()) return;
  const pct = Number(profitPct);
  if (!Number.isFinite(pct)) throw new Error("Gestión C100: Deriv no informó payout válido.");
  if (pct + 1e-9 < C100_MIN_PAYOUT) {
    throw new Error(`Payout ${pct.toFixed(1)}% menor al mínimo C100 (${C100_MIN_PAYOUT}%).`);
  }
}
function markC100PendingContract(contractId) {
  if (!isC100Active() || !contractId) return;
  c100State.pendingContractId = String(contractId);
  c100State.accountMode = ACCOUNT_MODE_REAL;
  c100State.currentStake = getC100Stake();
  c100State.lastResult = "PENDING";
  saveC100State();
  updateC100PanelUI();
}
function updateC100AfterResult(result, profit = null) {
  if (!c100State) loadC100State();
  const wasPending = c100State.pendingContractId;
  const normalized = String(result || "").toUpperCase() === "ITM" ? "ITM" : "OTM";
  const stakeUsed = Number(c100State.currentStake || getC100Stake());
  const profitNum = Number(profit);

  c100State.pendingContractId = "";
  c100State.lastResult = normalized;

  if (normalized === "ITM") {
    const gain = Number.isFinite(profitNum) && profitNum > 0 ? profitNum : stakeUsed * (C100_PAYOUT_REQUIRED / 100);
    c100State.dayProfit = Number(c100State.dayProfit || 0) + gain;

    if (Number(c100State.compoundStep || 0) === 0) {
      // Ganancia del primer ITM queda acumulada dentro del ciclo para compensar si falla el compuesto.
      c100State.cycleLoss = Number(c100State.cycleLoss || 0) - gain;
      c100State.compoundStep = 1;
      c100State.currentStake = getC100Level(c100State.level).compound;
    } else {
      const enabled = !!c100State.enabled;
      const dayProfit = Number(c100State.dayProfit || 0);
      const dayLoss = Number(c100State.dayLoss || 0);
      c100State = makeFreshC100State({ keepDay: true });
      c100State.enabled = enabled;
      c100State.dayProfit = dayProfit;
      c100State.dayLoss = dayLoss;
      c100State.lastResult = "CICLO_COMPLETO_2_ITM";
    }
  } else {
    const loss = Number.isFinite(profitNum) && profitNum < 0 ? Math.abs(profitNum) : stakeUsed;
    c100State.dayLoss = Number(c100State.dayLoss || 0) + loss;
    c100State.cycleLoss = Number(c100State.cycleLoss || 0) + loss;
    c100State.compoundStep = 0;

    if (Number(c100State.level || 1) >= C100_MAX_LEVEL) {
      c100State.locked = true;
      c100State.currentStake = 0;
      c100State.lastResult = "AGOTADA_NIVEL_5";
    } else {
      c100State.level = Number(c100State.level || 1) + 1;
      c100State.currentStake = getC100Level(c100State.level).base;
    }
  }

  saveC100State();
  updateC100PanelUI();
  updateModalCandleStatusUI();

  if (c100State.locked) {
    toast("🚫 Gestión C100 agotada. Reinicio manual requerido.", 3200);
  } else if (normalized === "ITM" && c100State.lastResult === "CICLO_COMPLETO_2_ITM") {
    toast("✅ C100: ciclo completo con 2 ITM. Reset automático.", 2600);
  } else {
    toast(`C100: ${normalized} registrado · próximo stake $${getC100Stake().toFixed(2)}`, 2200);
  }
}
function handleC100ContractClosed(contractId, isWin, profit = null) {
  if (!c100State) loadC100State();
  if (!contractId) return;
  const cid = String(contractId);
  if (String(c100State.pendingContractId || "") !== cid) return;
  updateC100AfterResult(isWin ? "ITM" : "OTM", profit);
}
function applyC100TradeGate(locked = false, candleClosed = false) {
  if (!isC100Active()) return;
  updateC100PanelUI();
  if (locked || candleClosed) return;

  if (c100State.locked) {
    paintGiroOnlyButtonState(modalBuyCallBtn, false, "Gestión C100 agotada. Reinicio manual requerido.");
    paintGiroOnlyButtonState(modalBuyPutBtn, false, "Gestión C100 agotada. Reinicio manual requerido.");
    return;
  }
  if (c100State.pendingContractId || (disciplinePendingContracts || []).length > 0) {
    paintGiroOnlyButtonState(modalBuyCallBtn, false, "Gestión C100: hay contrato pendiente.");
    paintGiroOnlyButtonState(modalBuyPutBtn, false, "Gestión C100: hay contrato pendiente.");
    return;
  }
  if (!ws || ws.readyState !== 1 || !lastTickLocalNowMs || Date.now() - lastTickLocalNowMs > 8000) {
    paintGiroOnlyButtonState(modalBuyCallBtn, false, "Gestión C100: conexión inestable.");
    paintGiroOnlyButtonState(modalBuyPutBtn, false, "Gestión C100: conexión inestable.");
  }
}
function getC100ModalTag() {
  if (!isC100Active()) return "";
  return ` | C100 L${c100State.level}/${C100_MAX_LEVEL} S$${getC100Stake().toFixed(2)} ${getC100StatusText()}`;
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
  const stake = getEffectiveTradeStake();
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
  if (isC100Active()) {
    const expectedStake = getC100Stake();
    if (Math.abs(Number(plan.askPrice || 0) - expectedStake) > 0.02) return null;
  }
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
  const c100 = isC100Active() ? ` · C100 $${getC100Stake().toFixed(2)}` : "";
  if (!shouldUseAutoHighLowExecution()) return `${base}${c100}`;
  return `${base}${c100} · ${formatExecutionPlanMini(plan)}`;
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
function shouldBypassGiroOnlyTradeGate() {
  // En REAL mantenemos el modo GIRO como análisis/señal,
  // pero NO bloqueamos COMPRA/VENTA según el color actual de la vela.
  // El bloqueo por confirmaciones direccionales queda intacto y se aplica después.
  return activeTradingAccount === ACCOUNT_MODE_REAL;
}
function applyGiroOnlyTradeButtons(item, locked = false, candleClosed = false) {
  if (shouldBypassGiroOnlyTradeGate()) return;

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
    ? "Al salir una señal, abre el gráfico automáticamente. Si ya había un gráfico abierto, lo reemplaza por la señal nueva."
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

  // ✅ NUEVO:
  // Antes se bloqueaba el auto-open si ya había un gráfico abierto.
  // Eso hacía que, si quedaba abierta una señal vieja, una señal nueva NO se mostrara.
  // ✅ FIX: ahora también puede auto-abrir aunque estés en Trades o Práctica.
  // Si sale una señal nueva, la app cambia a Señales y abre/reemplaza el gráfico.
  // Solo se bloquea en Configuración para no tocar ajustes mientras los estás editando.
  if (settingsModal && !settingsModal.classList.contains("hidden")) return false;

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
    updateC100PanelUI();
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
  // ✅ FIX: el motor de señales NO se pausa por pestaña.
  // Antes Práctica frenaba evaluateMinute/addSignal(), entonces podían perderse señales.
  // Ahora Trades y Práctica son solo vistas: el análisis sigue corriendo igual.
  return false;
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
        // ✅ Feedback propio de Trades para estudiar qué operaciones buscar.
        vote: entry.vote || "",
        comment: entry.comment || "",
        journal_id: entry.journal_id || "",
        feedback_at: entry.feedback_at || 0,
        feedback_source: entry.feedback_source || "",
        ticks: Array.isArray(entry.ticks) ? entry.ticks : [],
        nextOutcome: entry.nextOutcome || "",
        minuteComplete: true,
        trade: entry.trade || null,
      };

      // ✅ En Trades ahora también se puede marcar 👍/👎 y escribir el motivo.
      list.appendChild(buildRow(item, { source: "trades", signalId: entry.id, journalId: entry.journal_id, allowVoteChange: true }));
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
  clearPracticeQueueState();
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

function initTabs() {
  removeSettingsTabIfExists();
  ensureTradesTab();
  ensureTradesView();

  qsAll(".tab[data-view]").forEach((t) => (t.onclick = () => setActiveView(t.dataset.view)));

  const saved = localStorage.getItem("activeView") || "signals";
  const initial = ["signals", "trades", "practice"].includes(saved) ? saved : "signals";
  setActiveView(initial);
}

/* =========================
   Práctica
========================= */
const PRACTICE_STATS_KEY = "practiceStats_v1";
const PRACTICE_FILTER_KEY = "practiceFilterMode_v1";
const PRACTICE_POOL_STATE_KEY = "practicePoolState_v2";
const PRACTICE_EXPORT_SAVED_KEY = "practiceExportSelected_v1";
const PRACTICE_EXPORT_MAX = 150;
const PRACTICE_FILTER_ALL = "ALL";
const PRACTICE_FILTER_GIRO = "GIRO";
const PRACTICE_FILTER_NORMAL = "NORMAL";
let practiceSessionStats = freshPracticeStats();
let practiceAllStats = loadPracticeAllStats();
let practiceFilterMode = loadPracticeFilterMode();
let practiceQueue = [];
let practiceLastEntryKey = "";
let practiceLastCandleKey = "";
let practiceRound = null;
let practiceRaf = null;
let practiceChoiceHitZones = [];
let practiceSimilarResults = [];
let practiceExportSaved = loadPracticeExportSaved();
let practiceExportSaveBtnEl = null;
let practiceConfirmPanelEl = null;
let practiceConfirmCountEl = null;
let practiceConfirmBtnEl = null; // compat: apunta al botón de confirmación COMPRA
let practiceConfirmBuyBtnEl = null;
let practiceConfirmSellBtnEl = null;
let practiceConfirmUndoBtnEl = null;
let practiceConfirmHintEl = null;
const PRACTICE_CONFIRM_MIN = 4;
const PRACTICE_AUTO_ENTRY_MS = 57000;
const PRACTICE_AUTO_ENTRY_SEC = Math.round(PRACTICE_AUTO_ENTRY_MS / 1000);
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
function loadPracticeExportSaved() {
  try {
    const raw = localStorage.getItem(PRACTICE_EXPORT_SAVED_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter(Boolean).slice(0, PRACTICE_EXPORT_MAX) : [];
  } catch {
    return [];
  }
}
function savePracticeExportSaved() {
  try {
    const safe = Array.isArray(practiceExportSaved) ? practiceExportSaved.filter(Boolean).slice(0, PRACTICE_EXPORT_MAX) : [];
    practiceExportSaved = safe;
    localStorage.setItem(PRACTICE_EXPORT_SAVED_KEY, JSON.stringify(safe));
  } catch {}
}
function getPracticeExportSavedList() {
  if (!Array.isArray(practiceExportSaved)) practiceExportSaved = loadPracticeExportSaved();
  return practiceExportSaved;
}
function getPracticeExportKey(entry, cutoffMs = PRACTICE_EVAL_SEC * 1000) {
  const entryKey = getPracticeEntryKey(entry) || String(entry?.id || entry?.journal_id || entry?.practice_id || "");
  if (!entryKey) return "";
  return `CLEAR::${entryKey}::${Number(cutoffMs || 0)}`;
}
function getPracticeExportConfirmationScore(confirmations) {
  return (Array.isArray(confirmations) ? confirmations : []).reduce((acc, ev) => {
    const side = normalizePracticeConfirmationSide(ev?.side);
    if (side === "CALL") return acc + 1;
    if (side === "PUT") return acc - 1;
    return acc;
  }, 0);
}
function getPracticeExportEnabledSide(confirmations) {
  const score = getPracticeExportConfirmationScore(confirmations);
  if (score >= PRACTICE_CONFIRM_MIN) return "CALL";
  if (score <= -PRACTICE_CONFIRM_MIN) return "PUT";
  return "";
}
function getPracticeExportConfirmationStatus(confirmations) {
  const score = getPracticeExportConfirmationScore(confirmations);
  return `COMPRA ${Math.max(0, score)}/${PRACTICE_CONFIRM_MIN} · VENTA ${Math.max(0, -score)}/${PRACTICE_CONFIRM_MIN}`;
}
function findPracticeExportSavedIndex(exportId) {
  const id = String(exportId || "");
  if (!id) return -1;
  return getPracticeExportSavedList().findIndex((x) => String(x?.export_id || "") === id);
}
function isPracticeExportSaved(exportId) {
  return findPracticeExportSavedIndex(exportId) >= 0;
}
function isCurrentPracticeRoundSavedForExport() {
  if (!practiceRound?.entry) return false;
  return isPracticeExportSaved(getPracticeExportKey(practiceRound.entry, practiceRound.cutoffMs));
}
function buildPracticeExportSnapshotFromRound(round = practiceRound) {
  if (!round?.entry) return null;
  const entry = round.entry;
  const cutoffMs = Number(round.cutoffMs || PRACTICE_EVAL_SEC * 1000 || 0);
  const confirmations = Array.isArray(round.confirmations) ? round.confirmations.map((ev) => ({ ...ev })) : [];
  const score = getPracticeExportConfirmationScore(confirmations);
  const enabledSide = getPracticeExportEnabledSide(confirmations);
  const exportId = getPracticeExportKey(entry, cutoffMs);
  if (!exportId) return null;

  return {
    export_id: exportId,
    export_type: "practice_clear_formation",
    saved_from: "practice",
    saved_at: Date.now(),
    source_key: getPracticeEntryKey(entry),
    source_type: entry.source_type || "practice_entry",
    journal_id: entry.journal_id || "",
    practice_id: entry.practice_id || "",
    id: entry.id || "",
    minute: Number(entry.minute || 0),
    time: String(entry.time || ""),
    symbol: String(entry.symbol || ""),
    direction: String(entry.direction || ""),
    mode: entry.mode || "NORMAL",
    mode_version: entry.mode_version || getModeVersion(entry.mode || "NORMAL") || "",
    nextOutcome: entry.nextOutcome || "",
    minuteComplete: !!entry.minuteComplete,
    trade: entry.trade && typeof entry.trade === "object" ? { ...entry.trade } : null,
    cutoffMs,
    cutoffSec: Math.round(cutoffMs / 1000),
    practice_eval_sec: PRACTICE_EVAL_SEC,
    practice_filter: normalizePracticeFilterMode(practiceFilterMode),
    answer: round.answer || "",
    resultType: round.resultType || "",
    autoEntry: round.autoEntry && typeof round.autoEntry === "object" ? { ...round.autoEntry } : null,
    auto_entry_sec: PRACTICE_AUTO_ENTRY_SEC,
    auto_entry_ms: PRACTICE_AUTO_ENTRY_MS,
    confirmations,
    confirmation_score: score,
    confirmation_status: getPracticeExportConfirmationStatus(confirmations),
    enabled_side: enabledSide,
    clear_side: enabledSide || round.answer || "",
    note: "Formación marcada manualmente como clara en Modo Práctica para estudiar/configurar señales.",
    ticks: Array.isArray(entry.ticks) ? entry.ticks : Array.isArray(round.ticks) ? round.ticks : [],
  };
}
function upsertPracticeExportSavedSnapshot(snapshot, { silent = false } = {}) {
  if (!snapshot?.export_id) return false;
  const idx = findPracticeExportSavedIndex(snapshot.export_id);
  if (idx >= 0) {
    practiceExportSaved[idx] = { ...practiceExportSaved[idx], ...snapshot, updated_at: Date.now() };
  } else {
    practiceExportSaved.unshift(snapshot);
    if (practiceExportSaved.length > PRACTICE_EXPORT_MAX) practiceExportSaved = practiceExportSaved.slice(0, PRACTICE_EXPORT_MAX);
  }
  savePracticeExportSaved();
  updatePracticeExportSaveButtonUI();
  updateExportTradesButtonUI();
  if (!silent) toast(`💾 Formación clara guardada (${practiceExportSaved.length})`, 1500);
  return true;
}
function refreshCurrentPracticeExportSavedSnapshot() {
  if (!practiceRound?.entry) return;
  const exportId = getPracticeExportKey(practiceRound.entry, practiceRound.cutoffMs);
  if (!isPracticeExportSaved(exportId)) return;
  const snapshot = buildPracticeExportSnapshotFromRound(practiceRound);
  if (snapshot) upsertPracticeExportSavedSnapshot(snapshot, { silent: true });
}
function removePracticeExportSaved(exportId, { silent = false } = {}) {
  const idx = findPracticeExportSavedIndex(exportId);
  if (idx < 0) return false;
  practiceExportSaved.splice(idx, 1);
  savePracticeExportSaved();
  updatePracticeExportSaveButtonUI();
  updateExportTradesButtonUI();
  if (!silent) toast(`🗑️ Formación quitada del export (${practiceExportSaved.length})`, 1500);
  return true;
}
function toggleCurrentPracticeExportSaved() {
  if (!practiceRound?.entry) {
    toast("No hay formación activa para guardar", 1300);
    return;
  }
  const exportId = getPracticeExportKey(practiceRound.entry, practiceRound.cutoffMs);
  if (isPracticeExportSaved(exportId)) {
    removePracticeExportSaved(exportId);
    return;
  }
  const snapshot = buildPracticeExportSnapshotFromRound(practiceRound);
  if (snapshot) upsertPracticeExportSavedSnapshot(snapshot);
}
function ensurePracticeExportSaveButton() {
  if (practiceExportSaveBtnEl && practiceExportSaveBtnEl.isConnected) return practiceExportSaveBtnEl;
  if (!practiceView) return null;

  let btn = pickEl("practiceExportSaveBtn");
  if (!btn) {
    btn = document.createElement("button");
    btn.id = "practiceExportSaveBtn";
    btn.type = "button";
    btn.className = "btn btnGhost";
    btn.textContent = "💾 Guardar formación clara";
    btn.style.width = "100%";
    btn.style.minHeight = "42px";
    btn.style.borderRadius = "14px";
    btn.style.fontWeight = "950";
    btn.style.fontSize = "13px";
    btn.style.letterSpacing = ".15px";
    btn.style.border = "1px solid rgba(34,211,238,.34)";
    btn.style.background = "linear-gradient(180deg, rgba(34,211,238,.12), rgba(255,255,255,.035))";
    btn.style.boxShadow = "inset 0 0 0 1px rgba(255,255,255,.035)";
    btn.style.touchAction = "manipulation";
  }

  const wrap = document.getElementById("practicePutSimilarWrap");
  if (wrap) {
    if (btn.parentElement !== wrap) wrap.appendChild(btn);
  } else if (practiceSimilarBtn && practiceSimilarBtn.parentElement) {
    practiceSimilarBtn.insertAdjacentElement("afterend", btn);
  } else if (practicePassBtn && practicePassBtn.parentElement) {
    practicePassBtn.insertAdjacentElement("afterend", btn);
  } else {
    practiceView.appendChild(btn);
  }

  btn.onclick = (e) => {
    e.stopPropagation();
    toggleCurrentPracticeExportSaved();
  };

  practiceExportSaveBtnEl = btn;
  updatePracticeExportSaveButtonUI();
  return btn;
}
function updatePracticeExportSaveButtonUI() {
  const btn = practiceExportSaveBtnEl || pickEl("practiceExportSaveBtn");
  if (!btn) return;

  const hasRound = !!practiceRound?.entry;
  btn.disabled = !hasRound;
  btn.style.display = hasRound ? "flex" : "none";
  btn.style.alignItems = "center";
  btn.style.justifyContent = "center";
  btn.style.gap = "8px";
  btn.style.opacity = hasRound ? "1" : ".45";

  if (!hasRound) {
    btn.textContent = "💾 Guardar formación clara";
    btn.title = "Aparece cuando hay una formación activa en práctica.";
    return;
  }

  const saved = isCurrentPracticeRoundSavedForExport();
  btn.textContent = saved ? `✅ Guardada para exportar (${practiceExportSaved.length})` : "💾 Guardar formación clara";
  btn.title = saved
    ? "Tocar para quitar esta formación clara del export."
    : "Guardar esta formación de práctica para exportarla y estudiarla en PDF.";
  btn.classList.toggle("active", saved);
  btn.style.color = saved ? "#ecfeff" : "";
  btn.style.borderColor = saved ? "rgba(34,211,238,.92)" : "rgba(34,211,238,.34)";
  btn.style.background = saved
    ? "linear-gradient(180deg, rgba(20,184,166,.30), rgba(34,197,94,.16))"
    : "linear-gradient(180deg, rgba(34,211,238,.12), rgba(255,255,255,.035))";
  btn.style.boxShadow = saved
    ? "0 0 0 1px rgba(34,211,238,.22) inset, 0 0 14px rgba(34,211,238,.42)"
    : "inset 0 0 0 1px rgba(255,255,255,.035)";
}
function clearPracticeExportSaved() {
  practiceExportSaved = [];
  savePracticeExportSaved();
  updatePracticeExportSaveButtonUI();
  updateExportTradesButtonUI();
  toast("🧹 Formaciones claras borradas", 1600);
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
    clearPracticeQueueState(practiceFilterMode);
    practiceRound = null;
    practiceChoiceHitZones = [];
    resetPracticeSimilarState();

    applyPracticeFilterButtonUI();
    ensurePracticeQueue({ forceNew: true });
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
function normalizePracticeConfirmationSide(side) {
  const s = String(side || "").toUpperCase();
  if (s === "CALL" || s === "BUY" || s === "COMPRA") return "CALL";
  if (s === "PUT" || s === "SELL" || s === "VENTA") return "PUT";
  return "";
}
function getPracticeConfirmationEvents() {
  return Array.isArray(practiceRound?.confirmations) ? practiceRound.confirmations : [];
}
function getPracticeConfirmationScore() {
  return getPracticeConfirmationEvents().reduce((acc, ev) => {
    const side = normalizePracticeConfirmationSide(ev?.side);
    if (side === "CALL") return acc + 1;
    if (side === "PUT") return acc - 1;
    return acc;
  }, 0);
}
function getPracticeConfirmationCount(side = null) {
  const wanted = normalizePracticeConfirmationSide(side);
  if (wanted) return getPracticeConfirmationEvents().filter((ev) => normalizePracticeConfirmationSide(ev?.side) === wanted).length;
  return Math.abs(getPracticeConfirmationScore());
}
function getPracticeNetBuyPoints() {
  return Math.max(0, getPracticeConfirmationScore());
}
function getPracticeNetSellPoints() {
  return Math.max(0, -getPracticeConfirmationScore());
}
function getPracticeEnabledTradeSide() {
  const score = getPracticeConfirmationScore();
  if (score >= PRACTICE_CONFIRM_MIN) return "CALL";
  if (score <= -PRACTICE_CONFIRM_MIN) return "PUT";
  return "";
}
function hasPracticeMinimumConfirmations(side = null) {
  const wanted = normalizePracticeConfirmationSide(side);
  const enabled = getPracticeEnabledTradeSide();
  return wanted ? enabled === wanted : !!enabled;
}
function getPracticeConfirmationStatusText() {
  return `COMPRA ${getPracticeNetBuyPoints()}/${PRACTICE_CONFIRM_MIN} · VENTA ${getPracticeNetSellPoints()}/${PRACTICE_CONFIRM_MIN}`;
}
function isPracticePastAutoEntryTime(round = practiceRound) {
  if (!round || round.finished || round.answer) return false;
  const ms = Number(round.replayMs ?? round.cutoffMs ?? 0);
  return Number.isFinite(ms) && ms >= PRACTICE_AUTO_ENTRY_MS;
}
function tryPracticeAutoEntryAt57(reason = "AUTO_57") {
  if (!practiceRound || practiceRound.finished || practiceRound.answer) return false;
  if (!isPracticePastAutoEntryTime(practiceRound)) return false;

  const side = getPracticeEnabledTradeSide();
  if (side !== "CALL" && side !== "PUT") return false;

  practiceRound.answer = side;
  practiceRound.autoEntry = {
    type: "AUTO_57",
    side,
    ms: Math.round(Number(practiceRound.replayMs || PRACTICE_AUTO_ENTRY_MS)),
    sec: PRACTICE_AUTO_ENTRY_SEC,
    reason: String(reason || "AUTO_57"),
    confirmationStatus: getPracticeConfirmationStatusText(),
    at: Date.now(),
  };

  setPracticeDecisionState(true, side);
  updatePracticeConfirmationUI();
  refreshCurrentPracticeExportSavedSnapshot();

  const label = side === "CALL" ? "COMPRA" : "VENTA";
  updatePracticeResult(`🤖 AUTO ${PRACTICE_AUTO_ENTRY_SEC}s: ${label} ejecutada por confirmaciones (${getPracticeConfirmationStatusText()}). Esperando cierre…`, side === "CALL" ? "is-itm" : "is-otm");
  toast(`🤖 AUTO ${PRACTICE_AUTO_ENTRY_SEC}s: ${label}`, 1500);
  return true;
}
function getPracticeMissingConfirmations(side) {
  const wanted = normalizePracticeConfirmationSide(side);
  if (wanted === "CALL") return Math.max(0, PRACTICE_CONFIRM_MIN - getPracticeNetBuyPoints());
  if (wanted === "PUT") return Math.max(0, PRACTICE_CONFIRM_MIN - getPracticeNetSellPoints());
  return Math.max(0, PRACTICE_CONFIRM_MIN - Math.max(getPracticeNetBuyPoints(), getPracticeNetSellPoints()));
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
  count.style.whiteSpace = "nowrap";

  const hint = document.createElement("div");
  hint.id = "practiceConfirmHint";
  hint.style.flex = "1";
  hint.style.textAlign = "right";
  hint.style.fontSize = "12px";
  hint.style.fontWeight = "800";
  hint.style.opacity = ".86";
  hint.style.lineHeight = "1.25";

  top.appendChild(count);
  top.appendChild(hint);

  const row = document.createElement("div");
  row.style.display = "grid";
  row.style.gridTemplateColumns = "minmax(0, 1fr) minmax(0, 1fr) auto";
  row.style.gap = "10px";
  row.style.alignItems = "stretch";

  const buyBtn = document.createElement("button");
  buyBtn.id = "practiceConfirmBuyBtn";
  buyBtn.type = "button";
  buyBtn.className = "btn";
  buyBtn.textContent = "🟢 + COMPRA";
  buyBtn.title = "Sumar una confirmación a favor de COMPRA. Si había puntos de VENTA, primero los resta.";
  buyBtn.style.minHeight = "52px";
  buyBtn.style.borderRadius = "16px";
  buyBtn.style.fontWeight = "950";
  buyBtn.style.fontSize = "14px";
  buyBtn.style.letterSpacing = ".25px";
  buyBtn.style.border = "1px solid rgba(34,197,94,.62)";
  buyBtn.style.background = "linear-gradient(180deg, rgba(34,197,94,.26), rgba(34,197,94,.10))";
  buyBtn.style.boxShadow = "0 0 18px rgba(34,197,94,.14), inset 0 0 14px rgba(34,197,94,.07)";
  buyBtn.style.touchAction = "manipulation";

  const sellBtn = document.createElement("button");
  sellBtn.id = "practiceConfirmSellBtn";
  sellBtn.type = "button";
  sellBtn.className = "btn";
  sellBtn.textContent = "🔴 + VENTA";
  sellBtn.title = "Sumar una confirmación a favor de VENTA. Si había puntos de COMPRA, primero los resta.";
  sellBtn.style.minHeight = "52px";
  sellBtn.style.borderRadius = "16px";
  sellBtn.style.fontWeight = "950";
  sellBtn.style.fontSize = "14px";
  sellBtn.style.letterSpacing = ".25px";
  sellBtn.style.border = "1px solid rgba(239,68,68,.62)";
  sellBtn.style.background = "linear-gradient(180deg, rgba(239,68,68,.24), rgba(239,68,68,.10))";
  sellBtn.style.boxShadow = "0 0 18px rgba(239,68,68,.13), inset 0 0 14px rgba(239,68,68,.07)";
  sellBtn.style.touchAction = "manipulation";

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

  row.appendChild(buyBtn);
  row.appendChild(sellBtn);
  row.appendChild(undoBtn);
  panel.appendChild(top);
  panel.appendChild(row);

  const anchor = practiceCanvas || practiceRoundLabelEl || practiceView.firstElementChild;
  if (anchor && anchor.parentElement) anchor.insertAdjacentElement("afterend", panel);
  else practiceView.prepend(panel);

  practiceConfirmPanelEl = panel;
  practiceConfirmCountEl = count;
  practiceConfirmBtnEl = buyBtn;
  practiceConfirmBuyBtnEl = buyBtn;
  practiceConfirmSellBtnEl = sellBtn;
  practiceConfirmUndoBtnEl = undoBtn;
  practiceConfirmHintEl = hint;

  buyBtn.onclick = () => addPracticeConfirmation("CALL");
  sellBtn.onclick = () => addPracticeConfirmation("PUT");
  undoBtn.onclick = () => removePracticeConfirmation();

  updatePracticeConfirmationUI();
  return panel;
}
function getPracticeConfirmationMs() {
  if (!practiceRound) return 0;
  const ms = Number(practiceRound.replayMs ?? practiceRound.cutoffMs ?? 0);
  return Math.max(0, Math.min(60000, ms));
}
function addPracticeConfirmation(side = "CALL") {
  if (!practiceRound || practiceRound.finished || practiceRound.answer) return;
  const safeSide = normalizePracticeConfirmationSide(side);
  if (!safeSide) return;
  practiceRound.confirmations ||= [];
  practiceRound.confirmations.push({ side: safeSide, ms: getPracticeConfirmationMs(), at: Date.now() });
  updatePracticeConfirmationUI();
  redrawPracticeRoundChart();
  refreshCurrentPracticeExportSavedSnapshot();

  const enabled = getPracticeEnabledTradeSide();
  if (enabled === "CALL") {
    updatePracticeResult(`✅ COMPRA habilitada por confirmaciones: ${getPracticeConfirmationStatusText()}`, "is-itm");
  } else if (enabled === "PUT") {
    updatePracticeResult(`✅ VENTA habilitada por confirmaciones: ${getPracticeConfirmationStatusText()}`, "is-otm");
  } else {
    updatePracticeResult(`🧠 ${getPracticeConfirmationStatusText()}. Si no llega a ${PRACTICE_CONFIRM_MIN} para un lado, PASAR.`, "is-pass");
  }

  // Si el usuario supera las 4 confirmaciones netas cuando la ronda ya pasó 57s,
  // también entra automáticamente sin esperar otro frame.
  tryPracticeAutoEntryAt57("CONFIRMACION_DESPUES_DE_57");
}
function removePracticeConfirmation() {
  if (!practiceRound || practiceRound.finished || practiceRound.answer) return;
  practiceRound.confirmations ||= [];
  practiceRound.confirmations.pop();
  updatePracticeConfirmationUI();
  redrawPracticeRoundChart();
  refreshCurrentPracticeExportSavedSnapshot();
}
function updatePracticeConfirmationUI() {
  ensurePracticeConfirmationControls();
  const totalEvents = getPracticeConfirmationEvents().length;
  const score = getPracticeConfirmationScore();
  const enabled = getPracticeEnabledTradeSide();
  const ok = !!enabled;
  const buyPts = getPracticeNetBuyPoints();
  const sellPts = getPracticeNetSellPoints();

  if (practiceConfirmCountEl) {
    practiceConfirmCountEl.textContent = getPracticeConfirmationStatusText();
    practiceConfirmCountEl.style.color = enabled === "CALL" ? "#dcfce7" : enabled === "PUT" ? "#fecaca" : "rgba(255,255,255,.92)";
    practiceConfirmCountEl.style.borderColor = enabled === "CALL" ? "rgba(34,197,94,.52)" : enabled === "PUT" ? "rgba(239,68,68,.52)" : "rgba(255,255,255,.14)";
    practiceConfirmCountEl.style.background = enabled === "CALL" ? "rgba(22,163,74,.18)" : enabled === "PUT" ? "rgba(127,29,29,.22)" : "rgba(0,0,0,.16)";
    practiceConfirmCountEl.style.boxShadow = ok ? "0 0 18px rgba(255,255,255,.10)" : "none";
  }
  if (practiceConfirmHintEl) {
    if (enabled === "CALL") {
      practiceConfirmHintEl.textContent = "Solo COMPRA habilitada";
      practiceConfirmHintEl.style.color = "#bbf7d0";
    } else if (enabled === "PUT") {
      practiceConfirmHintEl.textContent = "Solo VENTA habilitada";
      practiceConfirmHintEl.style.color = "#fecaca";
    } else {
      practiceConfirmHintEl.textContent = score === 0 ? "Mínimo 4 netas para un lado" : `Neto ${score > 0 ? "+" : ""}${score}`;
      practiceConfirmHintEl.style.color = "rgba(255,255,255,.70)";
    }
  }

  const controlsDisabled = !practiceRound || !!practiceRound.finished || !!practiceRound.answer;
  [practiceConfirmBuyBtnEl, practiceConfirmSellBtnEl].forEach((btn) => {
    if (!btn) return;
    btn.disabled = controlsDisabled;
    btn.style.opacity = btn.disabled ? ".45" : "1";
  });
  if (practiceConfirmBuyBtnEl) {
    practiceConfirmBuyBtnEl.textContent = `🟢 + COMPRA ${buyPts}/${PRACTICE_CONFIRM_MIN}`;
    practiceConfirmBuyBtnEl.style.transform = enabled === "CALL" ? "translateY(-1px)" : "none";
  }
  if (practiceConfirmSellBtnEl) {
    practiceConfirmSellBtnEl.textContent = `🔴 + VENTA ${sellPts}/${PRACTICE_CONFIRM_MIN}`;
    practiceConfirmSellBtnEl.style.transform = enabled === "PUT" ? "translateY(-1px)" : "none";
  }
  if (practiceConfirmUndoBtnEl) {
    practiceConfirmUndoBtnEl.disabled = controlsDisabled || totalEvents <= 0;
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
  const eligible = getMergedPracticeEntries().filter((entry) => {
    if (!entry) return false;
    if (!Array.isArray(entry.ticks) || entry.ticks.length < 6) return false;
    if (!(entry.nextOutcome === "up" || entry.nextOutcome === "down")) return false;
    if (shouldPracticeOnlyGiro() && !isStrictGiroPracticeEntry(entry)) return false;
    if (shouldPracticeOnlyNormal() && !isStrictNormalPracticeEntry(entry)) return false;
    return true;
  });

  return dedupePracticeEntriesByCandle(eligible);
}
function shuffleArray(arr) {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
function getPracticePoolStorageKey(mode = practiceFilterMode) {
  return `${PRACTICE_POOL_STATE_KEY}_${normalizePracticeFilterMode(mode)}`;
}
function getLegacyPracticePoolStorageKeys(mode = practiceFilterMode) {
  const suffix = normalizePracticeFilterMode(mode);
  return [`practicePoolState_v1_${suffix}`, `practicePoolState_v2_${suffix}`];
}
function getPracticeEntryByIdMap(entries) {
  const map = new Map();
  for (const entry of Array.isArray(entries) ? entries : []) {
    const key = getPracticeEntryKey(entry);
    if (key && !map.has(key)) map.set(key, entry);
  }
  return map;
}
function dedupePracticeQueueIds(queue, eligibleIds) {
  const out = [];
  const seen = new Set();
  for (const rawId of Array.isArray(queue) ? queue : []) {
    const id = String(rawId || "");
    if (!id || !eligibleIds.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}
function avoidImmediatePracticeRepeat(queue, entryById) {
  const ids = Array.isArray(queue) ? queue.slice() : [];
  if (ids.length <= 1 || !practiceLastCandleKey) return ids;

  const first = entryById.get(String(ids[0]));
  if (getPracticeCandleKey(first) !== practiceLastCandleKey) return ids;

  const swapIdx = ids.findIndex((id, idx) => idx > 0 && getPracticeCandleKey(entryById.get(String(id))) !== practiceLastCandleKey);
  if (swapIdx > 0) [ids[0], ids[swapIdx]] = [ids[swapIdx], ids[0]];
  return ids;
}
function buildNewPracticeQueue(entries) {
  const validIds = (Array.isArray(entries) ? entries : []).map((entry) => getPracticeEntryKey(entry)).filter(Boolean).map(String);
  const uniqueIds = dedupePracticeQueueIds(validIds, new Set(validIds));
  const entryById = getPracticeEntryByIdMap(entries);
  return avoidImmediatePracticeRepeat(shuffleArray(uniqueIds), entryById);
}
function readPracticeQueueStateForKey(storageKey, eligibleIds) {
  const raw = localStorage.getItem(storageKey);
  if (!raw) return null;

  const state = JSON.parse(raw);
  const savedMode = normalizePracticeFilterMode(state?.filterMode || PRACTICE_FILTER_ALL);
  if (savedMode !== normalizePracticeFilterMode(practiceFilterMode)) return null;

  const savedQueue = Array.isArray(state?.queue) ? state.queue.map(String) : [];
  const queue = dedupePracticeQueueIds(savedQueue, eligibleIds);

  practiceLastEntryKey = String(state?.lastEntryKey || practiceLastEntryKey || "");
  practiceLastCandleKey = String(state?.lastCandleKey || practiceLastCandleKey || "");

  return queue;
}
function loadPracticeQueueState(eligibleIds) {
  try {
    const keys = [getPracticePoolStorageKey(), ...getLegacyPracticePoolStorageKeys()];
    for (const key of keys) {
      const restored = readPracticeQueueStateForKey(key, eligibleIds);
      if (Array.isArray(restored)) return restored;
    }
    return null;
  } catch {
    return null;
  }
}
function savePracticeQueueState() {
  try {
    localStorage.setItem(
      getPracticePoolStorageKey(),
      JSON.stringify({
        version: 3,
        filterMode: normalizePracticeFilterMode(practiceFilterMode),
        queue: (practiceQueue || []).map(String),
        lastEntryKey: practiceLastEntryKey || "",
        lastCandleKey: practiceLastCandleKey || "",
        savedAt: Date.now(),
      })
    );
  } catch {}
}
function clearPracticeQueueState(mode = null) {
  try {
    const modes = mode ? [mode] : [PRACTICE_FILTER_ALL, PRACTICE_FILTER_GIRO, PRACTICE_FILTER_NORMAL];
    for (const m of modes) {
      localStorage.removeItem(getPracticePoolStorageKey(m));
      for (const legacyKey of getLegacyPracticePoolStorageKeys(m)) localStorage.removeItem(legacyKey);
    }
    if (!mode || normalizePracticeFilterMode(mode) === normalizePracticeFilterMode(practiceFilterMode)) {
      practiceLastEntryKey = "";
      practiceLastCandleKey = "";
    }
  } catch {}
}
function ensurePracticeQueue({ forceNew = false } = {}) {
  if (forceNew) practiceQueue = [];

  const eligibleEntries = getEligiblePracticeEntries();
  const eligibleIds = new Set(eligibleEntries.map((entry) => getPracticeEntryKey(entry)).filter(Boolean).map(String));
  const entryById = getPracticeEntryByIdMap(eligibleEntries);

  if (!forceNew && !practiceQueue.length) {
    const restored = loadPracticeQueueState(eligibleIds);
    if (Array.isArray(restored)) practiceQueue = restored;
  }

  practiceQueue = dedupePracticeQueueIds(practiceQueue, eligibleIds);
  practiceQueue = avoidImmediatePracticeRepeat(practiceQueue, entryById);

  if (!practiceQueue.length && eligibleEntries.length) {
    practiceQueue = buildNewPracticeQueue(eligibleEntries);
  }

  savePracticeQueueState();
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

  // Confirmaciones: se mantienen en el panel de confirmaciones, pero ya no se dibujan sobre el gráfico.

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
    const isTradeBtn = key === "CALL" || key === "PUT";
    const sideLocked =
      !disabled &&
      !!practiceRound &&
      !practiceRound.finished &&
      !practiceRound.answer &&
      isTradeBtn &&
      !hasPracticeMinimumConfirmations(key);

    btn.disabled = isNextBtn ? false : !!disabled || sideLocked;
    btn.classList.toggle("selected", !isNextBtn && selected === key);

    if (isTradeBtn && sideLocked) {
      const faltan = getPracticeMissingConfirmations(key);
      btn.style.filter = "grayscale(1) saturate(.65)";
      btn.style.opacity = ".44";
      btn.title = `Faltan ${faltan} confirmación${faltan === 1 ? "" : "es"} neta${faltan === 1 ? "" : "s"} para ${key === "CALL" ? "COMPRA" : "VENTA"}.`;
    } else if (isTradeBtn && !disabled) {
      btn.style.filter = "";
      btn.style.opacity = "";
      btn.title = key === "CALL" ? "COMPRA habilitada por confirmaciones" : "VENTA habilitada por confirmaciones";
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
  const entryKey = getPracticeEntryKey(entry);
  const baseSig = buildPracticeSignature(entry?.ticks || [], cutoffMs);
  if (!entryKey || !baseSig) return [];

  return getEligiblePracticeEntries()
    .filter((candidate) => getPracticeEntryKey(candidate) !== entryKey)
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

  let entries = getEligiblePracticeEntries();
  let entryById = getPracticeEntryByIdMap(entries);
  let next = null;

  while (practiceQueue.length && !next) {
    practiceQueue = avoidImmediatePracticeRepeat(practiceQueue, entryById);
    const nextId = String(practiceQueue.shift());
    const candidate = entryById.get(nextId) || null;
    if (!candidate) continue;

    const candleKey = getPracticeCandleKey(candidate);
    if (practiceLastCandleKey && candleKey === practiceLastCandleKey && entries.length > 1) {
      const hasAlternative = practiceQueue.some((id) => getPracticeCandleKey(entryById.get(String(id))) !== practiceLastCandleKey);
      if (hasAlternative) {
        practiceQueue.push(nextId);
        continue;
      }
      practiceQueue = buildNewPracticeQueue(entries);
      entryById = getPracticeEntryByIdMap(entries);
      continue;
    }

    next = candidate;
  }

  if (!next && entries.length) {
    practiceQueue = buildNewPracticeQueue(entries);
    entryById = getPracticeEntryByIdMap(entries);
    while (practiceQueue.length && !next) {
      const nextId = String(practiceQueue.shift());
      next = entryById.get(nextId) || null;
    }
  }

  if (next) {
    practiceLastEntryKey = getPracticeEntryKey(next);
    practiceLastCandleKey = getPracticeCandleKey(next);
  }

  savePracticeQueueState();
  updatePracticePoolLabel();
  return next;
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

  const confirmText = ` | ${getPracticeConfirmationStatusText()}`;
  const autoText = round.autoEntry ? ` | AUTO ${PRACTICE_AUTO_ENTRY_SEC}s` : "";
  const outcomeText = getOutcomeLabel(round.entry.nextOutcome);
  if (resultType === "ITM") {
    updatePracticeResult(`✅ ITM${autoText} | Tu decisión: ${round.answer === "CALL" ? "COMPRA" : "VENTA"}${confirmText} | Próxima vela: ${outcomeText}`, "is-itm");
  } else if (resultType === "OTM") {
    updatePracticeResult(`❌ OTM${autoText} | Tu decisión: ${round.answer === "CALL" ? "COMPRA" : "VENTA"}${confirmText} | Próxima vela: ${outcomeText}`, "is-otm");
  } else {
    updatePracticeResult(`⏭️ PASAR | Próxima vela: ${outcomeText}`, "is-pass");
  }

  setPracticePassButtonMode("NEXT");
  setPracticeDecisionState(true, round.answer);
  practiceSimilarResults = [];
  if (getEligiblePracticeEntries().length > 1) setPracticeSimilarButtonVisible(true);
  if (practiceSimilarBtn) practiceSimilarBtn.textContent = "🔎 Ver similares";
  refreshCurrentPracticeExportSavedSnapshot();
  updatePracticeExportSaveButtonUI();
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

  // Auto-entrada de práctica: al segundo 57, si ya hay 4 puntos netos
  // para COMPRA o VENTA y no hubo decisión manual, se elige esa dirección.
  tryPracticeAutoEntryAt57("TIMER_57");

  const remainingSec = Math.max(0, Math.ceil((60000 - replayMs) / 1000));
  const tramo = replayMs < 15000 ? "0-15s" : replayMs < 30000 ? "15-30s" : replayMs < 45000 ? "30-45s" : "45-60s";
  const picked = practiceRound.answer === "CALL" ? "COMPRA" : practiceRound.answer === "PUT" ? "VENTA" : practiceRound.answer === "PASS" ? "PASAR" : "—";
  updatePracticeStatusText(`Tiempo para decidir: ${remainingSec}s | tramo: ${tramo} | ${getPracticeConfirmationStatusText()} | decisión: ${picked}`);

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
    updatePracticeExportSaveButtonUI();
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
    autoEntry: null,
    confirmations: [],
    segmentMarks: freshPracticeSegmentMarks(),
  };

  if (practiceRoundLabelEl) {
    practiceRoundLabelEl.textContent = `${chosen.symbol} | ${chosen.mode || "NORMAL"} | ${chosen.time}`;
  }
  updatePracticePoolLabel();
  setPracticeConfirmationControlsVisible(true);
  updatePracticeExportSaveButtonUI();
  updatePracticeConfirmationUI();
  updatePracticeResult(`Marcá confirmaciones direccionales. Con ${PRACTICE_CONFIRM_MIN} netas se habilita COMPRA o VENTA. En ${PRACTICE_AUTO_ENTRY_SEC}s entra automático si ya está habilitada. PASAR siempre vale.`, "is-pass");
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
  ensurePracticeExportSaveButton();
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
    updatePracticeStatusText(`Toca PASAR para empezar una ronda con trades aleatorios sin repetir. ${msgFiltro} En Práctica, las señales siguen activas y pueden auto-abrirse si Auto-abrir está ON.`);
    setPracticeConfirmationControlsVisible(false);
    updatePracticeExportSaveButtonUI();
    updatePracticeResult(`Se usa tu journal de trades. PASAR no entra en el porcentaje. Auto-entrada: ${PRACTICE_AUTO_ENTRY_SEC}s con ${PRACTICE_CONFIRM_MIN} puntos netos.`, "is-pass");
    setPracticePassButtonMode("NEXT");
    setPracticeDecisionState(true);
  } else if (practiceRound.finished) {
    if (getEligiblePracticeEntries().length > 1) setPracticeSimilarButtonVisible(true);
    setPracticeConfirmationControlsVisible(true);
    updatePracticeConfirmationUI();
    updatePracticeExportSaveButtonUI();
    setPracticePassButtonMode("NEXT");
    setPracticeDecisionState(true, practiceRound.answer || "");
    drawPracticeChart(practiceCanvas, buildPracticeVisibleTicks(practiceRound.ticks, 60000), 60000, practiceRound.segmentMarks);
    redrawPracticeSimilarCanvases();
  } else {
    resetPracticeSimilarState();
    setPracticeConfirmationControlsVisible(true);
    updatePracticeConfirmationUI();
    updatePracticeExportSaveButtonUI();
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
  const selectedPractice = getPracticeExportSavedList();
  const markedTrades = (tradesJournal || []).filter((x) => x && (x.vote || x.comment));
  const aprendizaje = Array.isArray(giroAprendizajeExamples) ? giroAprendizajeExamples : [];
  const aprendizajeStats = getGiroAprendizajeStats();
  return {
    exported_at: new Date().toISOString(),
    export_scope: "trades_feedback_practice_clear_and_giro_aprendizaje",
    count_trades_total: (tradesJournal || []).length,
    count_marked_trades: markedTrades.length,
    count_practice_selected: selectedPractice.length,
    count_clear_formations: selectedPractice.length,
    count_giro_aprendizaje_examples: aprendizaje.length,
    giro_aprendizaje_stats: aprendizajeStats,
    description: "Incluye trades marcados desde la pestaña Trades, formaciones claras guardadas desde Modo Práctica y ejemplos enseñados para Giro + Aprendizaje.",

    // Operaciones marcadas desde la pestaña Trades para mostrar qué formaciones buscás/evitás.
    trades_marked: markedTrades.map((x) => ({
      journal_id: x.journal_id || "",
      saved_at: x.saved_at || 0,
      feedback_at: x.feedback_at || 0,
      feedback_source: x.feedback_source || "trades_tab",
      vote: x.vote || "",
      comment: x.comment || "",
      id: x.id || "",
      minute: x.minute || 0,
      time: x.time || "",
      symbol: x.symbol || "",
      direction: x.direction || "",
      mode: x.mode || "NORMAL",
      mode_version: x.mode_version || getModeVersion(x.mode || "NORMAL") || "",
      nextOutcome: x.nextOutcome || "",
      minuteComplete: !!x.minuteComplete,
      trade: x.trade || null,
      ticks: Array.isArray(x.ticks) ? x.ticks : [],
    })),

    // Formaciones marcadas con 💾 Guardar formación clara en Modo Práctica.
    practice_selected: selectedPractice.map((x) => ({
      ...x,
      ticks: Array.isArray(x?.ticks) ? x.ticks : [],
      confirmations: Array.isArray(x?.confirmations) ? x.confirmations : [],
    })),

    giro_aprendizaje_examples: aprendizaje.map((x) => ({
      ...x,
      ticks: Array.isArray(x?.ticks) ? x.ticks : [],
    })),
  };
}
async function exportTradesJournal() {
  const payload = buildExportPayloadTrades();
  const json = JSON.stringify(payload, null, 2);

  if (!payload.count_marked_trades && !payload.count_practice_selected && !payload.count_giro_aprendizaje_examples) {
    alert("No hay trades marcados, formaciones claras ni ejemplos de Giro + Aprendizaje para exportar todavía.");
    return;
  }

  try {
    await navigator.clipboard.writeText(json);
    alert(`✅ Exportado al portapapeles: ${payload.count_marked_trades} trades marcados + ${payload.count_practice_selected} claras + ${payload.count_giro_aprendizaje_examples} aprendizaje. Pegalo acá en el chat.`);
    return;
  } catch {
    const ts = new Date().toISOString().replaceAll(":", "-");
    downloadTextFile(`deriv-trades-feedback-estudio-${ts}.json`, json);
    alert(`📥 Descargado JSON: ${payload.count_marked_trades} trades marcados + ${payload.count_practice_selected} claras + ${payload.count_giro_aprendizaje_examples} aprendizaje.`);
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
  btn.textContent = "📤 Exportar estudio";
  btn.title = "Copia al portapapeles / descarga JSON con trades marcados y formaciones claras";
  host.appendChild(btn);
  updateExportTradesButtonUI();
  return btn;
}
function updateExportTradesButtonUI() {
  const btn = document.getElementById("exportTradesBtn");
  if (!btn) return;
  const claras = getPracticeExportSavedList().length;
  const marcados = (tradesJournal || []).filter((x) => x && (x.vote || x.comment)).length;
  const aprendizaje = Array.isArray(giroAprendizajeExamples) ? giroAprendizajeExamples.length : 0;
  const total = claras + marcados + aprendizaje;
  btn.textContent = total ? `📤 Exportar estudio (${marcados}T/${claras}C/${aprendizaje}A)` : "📤 Exportar estudio";
  btn.title = total
    ? `Exporta ${marcados} trade${marcados === 1 ? " marcado" : "s marcados"}, ${claras} formación${claras === 1 ? " clara" : "es claras"} y ${aprendizaje} ejemplo${aprendizaje === 1 ? "" : "s"} de Giro + Aprendizaje.`
    : "Exporta trades marcados, formaciones claras y ejemplos de Giro + Aprendizaje.";
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
  updateExportTradesButtonUI();

  let clearPracticeExportBtn = document.getElementById("clearPracticeExportBtn");
  if (!clearPracticeExportBtn) {
    clearPracticeExportBtn = document.createElement("button");
    clearPracticeExportBtn.id = "clearPracticeExportBtn";
    clearPracticeExportBtn.type = "button";
    clearPracticeExportBtn.className = "btn btnGhost";
    clearPracticeExportBtn.textContent = "🧹 Borrar guardadas de práctica";
    clearPracticeExportBtn.title = "Borra solo las formaciones claras marcadas en Modo Práctica para exportar";
    host.appendChild(clearPracticeExportBtn);
  }
  clearPracticeExportBtn.onclick = () => {
    if (!getPracticeExportSavedList().length) {
      toast("No hay formaciones claras guardadas", 1300);
      return;
    }
    if (!confirm("¿Borrar las formaciones claras guardadas desde Práctica? No borra el journal de trades.")) return;
    clearPracticeExportSaved();
  };

  let clearGiroLearningBtn = document.getElementById("clearGiroAprendizajeBtn");
  if (!clearGiroLearningBtn) {
    clearGiroLearningBtn = document.createElement("button");
    clearGiroLearningBtn.id = "clearGiroAprendizajeBtn";
    clearGiroLearningBtn.type = "button";
    clearGiroLearningBtn.className = "btn btnGhost";
    clearGiroLearningBtn.textContent = "🧠 Borrar aprendizaje Giro";
    clearGiroLearningBtn.title = "Borra solo las marcas del panel Giro + Aprendizaje";
    host.appendChild(clearGiroLearningBtn);
  }
  clearGiroLearningBtn.onclick = () => {
    if (!giroAprendizajeExamples.length) {
      toast("No hay ejemplos de aprendizaje", 1300);
      return;
    }
    if (!confirm("¿Borrar SOLO los ejemplos enseñados de Giro + Aprendizaje? No borra Trades ni Práctica.")) return;
    clearGiroAprendizajeExamples();
  };

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
    modeBtn.title = "Tocá para alternar entre NORMAL, NORMAL + DEBILIDAD, FUERZA/DEBILIDAD, LIKE MANTENIDO, GIRO + APRENDIZAJE, GIRO y GIRO FLEX.";
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
function normalizeSignalConfirmationSide(side) {
  const s = String(side || "").toUpperCase();
  if (s === "CALL" || s === "BUY" || s === "COMPRA") return "CALL";
  if (s === "PUT" || s === "SELL" || s === "VENTA") return "PUT";
  return "";
}
function getSignalConfirmationEvents(item = modalCurrentItem) {
  const arr = Array.isArray(item?.signalConfirmations) ? item.signalConfirmations : [];
  const fallbackSide = normalizeSignalConfirmationSide(item?.direction);
  return arr
    .map((ev) => {
      if (ev && typeof ev === "object") {
        const side = normalizeSignalConfirmationSide(ev.side) || fallbackSide;
        return { ...ev, side };
      }
      return { side: fallbackSide, ms: 0, at: 0 };
    })
    .filter((ev) => normalizeSignalConfirmationSide(ev.side));
}
function getSignalConfirmationScore(item = modalCurrentItem) {
  return getSignalConfirmationEvents(item).reduce((acc, ev) => {
    const side = normalizeSignalConfirmationSide(ev?.side);
    if (side === "CALL") return acc + 1;
    if (side === "PUT") return acc - 1;
    return acc;
  }, 0);
}
function getSignalNetBuyPoints(item = modalCurrentItem) {
  return Math.max(0, getSignalConfirmationScore(item));
}
function getSignalNetSellPoints(item = modalCurrentItem) {
  return Math.max(0, -getSignalConfirmationScore(item));
}
function getSignalEnabledTradeSide(item = modalCurrentItem) {
  const score = getSignalConfirmationScore(item);
  if (score >= SIGNAL_CONFIRM_MIN) return "CALL";
  if (score <= -SIGNAL_CONFIRM_MIN) return "PUT";
  return "";
}
function getSignalConfirmationCount(item = modalCurrentItem, side = null) {
  const wanted = normalizeSignalConfirmationSide(side);
  if (wanted === "CALL") return getSignalNetBuyPoints(item);
  if (wanted === "PUT") return getSignalNetSellPoints(item);
  return Math.max(getSignalNetBuyPoints(item), getSignalNetSellPoints(item));
}
function hasSignalMinimumConfirmations(item = modalCurrentItem, side = null) {
  const wanted = normalizeSignalConfirmationSide(side);
  const enabled = getSignalEnabledTradeSide(item);
  return wanted ? enabled === wanted : !!enabled;
}
function getSignalConfirmationStatusText(item = modalCurrentItem) {
  return `COMPRA ${getSignalNetBuyPoints(item)}/${SIGNAL_CONFIRM_MIN} · VENTA ${getSignalNetSellPoints(item)}/${SIGNAL_CONFIRM_MIN}`;
}
function getSignalMissingConfirmations(side, item = modalCurrentItem) {
  const wanted = normalizeSignalConfirmationSide(side);
  if (wanted === "CALL") return Math.max(0, SIGNAL_CONFIRM_MIN - getSignalNetBuyPoints(item));
  if (wanted === "PUT") return Math.max(0, SIGNAL_CONFIRM_MIN - getSignalNetSellPoints(item));
  return Math.max(0, SIGNAL_CONFIRM_MIN - getSignalConfirmationCount(item));
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
  row.style.gridTemplateColumns = "minmax(0, 1fr) minmax(0, 1fr) auto";
  row.style.gap = "10px";
  row.style.alignItems = "stretch";

  const buyBtn = document.createElement("button");
  buyBtn.id = "signalConfirmBuyBtn";
  buyBtn.type = "button";
  buyBtn.className = "btn";
  buyBtn.textContent = "🟢 + COMPRA";
  buyBtn.title = "Sumar una confirmación a favor de COMPRA. Si había puntos de VENTA, primero los resta.";
  buyBtn.style.minHeight = "52px";
  buyBtn.style.borderRadius = "16px";
  buyBtn.style.fontWeight = "950";
  buyBtn.style.fontSize = "14px";
  buyBtn.style.letterSpacing = ".25px";
  buyBtn.style.border = "1px solid rgba(34,197,94,.62)";
  buyBtn.style.background = "linear-gradient(180deg, rgba(34,197,94,.26), rgba(34,197,94,.10))";
  buyBtn.style.boxShadow = "0 0 18px rgba(34,197,94,.14), inset 0 0 14px rgba(34,197,94,.07)";
  buyBtn.style.touchAction = "manipulation";

  const sellBtn = document.createElement("button");
  sellBtn.id = "signalConfirmSellBtn";
  sellBtn.type = "button";
  sellBtn.className = "btn";
  sellBtn.textContent = "🔴 + VENTA";
  sellBtn.title = "Sumar una confirmación a favor de VENTA. Si había puntos de COMPRA, primero los resta.";
  sellBtn.style.minHeight = "52px";
  sellBtn.style.borderRadius = "16px";
  sellBtn.style.fontWeight = "950";
  sellBtn.style.fontSize = "14px";
  sellBtn.style.letterSpacing = ".25px";
  sellBtn.style.border = "1px solid rgba(239,68,68,.62)";
  sellBtn.style.background = "linear-gradient(180deg, rgba(239,68,68,.24), rgba(239,68,68,.10))";
  sellBtn.style.boxShadow = "0 0 18px rgba(239,68,68,.13), inset 0 0 14px rgba(239,68,68,.07)";
  sellBtn.style.touchAction = "manipulation";

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

  row.appendChild(buyBtn);
  row.appendChild(sellBtn);
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
  signalConfirmBtnEl = buyBtn; // compat
  signalConfirmBuyBtnEl = buyBtn;
  signalConfirmSellBtnEl = sellBtn;
  signalConfirmUndoBtnEl = undoBtn;
  signalConfirmHintEl = hint;

  buyBtn.onclick = () => addSignalConfirmation("CALL");
  sellBtn.onclick = () => addSignalConfirmation("PUT");
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
function addSignalConfirmation(side = "CALL") {
  if (!modalCurrentItem || !isTradeEntryOpen(modalCurrentItem)) return;
  const safeSide = normalizeSignalConfirmationSide(side);
  if (!safeSide) return;
  modalCurrentItem.signalConfirmations ||= [];
  modalCurrentItem.signalConfirmations.push({ side: safeSide, ms: getSignalConfirmationMs(), at: Date.now() });
  saveHistory(history);
  updateSignalConfirmationUI();
  updateModalCandleStatusUI();

  const enabled = getSignalEnabledTradeSide(modalCurrentItem);
  if (enabled === "CALL") {
    toast(`✅ COMPRA habilitada: ${getSignalConfirmationStatusText(modalCurrentItem)}`, 1400);
  } else if (enabled === "PUT") {
    toast(`✅ VENTA habilitada: ${getSignalConfirmationStatusText(modalCurrentItem)}`, 1400);
  } else {
    toast(`🧠 ${getSignalConfirmationStatusText(modalCurrentItem)}. Faltan puntos para operar.`, 1300);
  }

  // Si el usuario supera los 4 puntos netos cuando la vela ya pasó 57s,
  // también se dispara la auto-entrada sin esperar otro tick/timer.
  trySignalAutoEntryAt57("CONFIRMACION_DESPUES_DE_57");
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
  const buyPts = getSignalNetBuyPoints(modalCurrentItem);
  const sellPts = getSignalNetSellPoints(modalCurrentItem);
  const totalEvents = getSignalConfirmationEvents(modalCurrentItem).length;
  const enabled = getSignalEnabledTradeSide(modalCurrentItem);
  const ok = !!enabled;

  if (signalConfirmCountEl) {
    signalConfirmCountEl.textContent = getSignalConfirmationStatusText(modalCurrentItem);
    signalConfirmCountEl.style.color = enabled === "CALL" ? "#dcfce7" : enabled === "PUT" ? "#fecaca" : "rgba(255,255,255,.92)";
    signalConfirmCountEl.style.borderColor = enabled === "CALL" ? "rgba(34,197,94,.52)" : enabled === "PUT" ? "rgba(239,68,68,.52)" : "rgba(251,191,36,.28)";
    signalConfirmCountEl.style.background = enabled === "CALL" ? "rgba(22,163,74,.18)" : enabled === "PUT" ? "rgba(127,29,29,.22)" : "rgba(0,0,0,.16)";
    signalConfirmCountEl.style.boxShadow = ok ? "0 0 18px rgba(255,255,255,.10)" : "none";
  }
  if (signalConfirmHintEl) {
    const scope = getTradeScopeText ? getTradeScopeText() : "";
    if (enabled === "CALL") {
      signalConfirmHintEl.textContent = `Solo COMPRA habilitada · AUTO ${SIGNAL_AUTO_ENTRY_SEC}s${scope ? " · " + scope : ""}`;
      signalConfirmHintEl.style.color = "#bbf7d0";
    } else if (enabled === "PUT") {
      signalConfirmHintEl.textContent = `Solo VENTA habilitada · AUTO ${SIGNAL_AUTO_ENTRY_SEC}s${scope ? " · " + scope : ""}`;
      signalConfirmHintEl.style.color = "#fecaca";
    } else {
      const score = getSignalConfirmationScore(modalCurrentItem);
      signalConfirmHintEl.textContent = score === 0
        ? `Mínimo ${SIGNAL_CONFIRM_MIN} netas para un lado${scope ? " · " + scope : ""}`
        : `Neto ${score > 0 ? "+" : ""}${score}${scope ? " · " + scope : ""}`;
      signalConfirmHintEl.style.color = "rgba(255,255,255,.72)";
    }
  }

  const controlsDisabled = !hasItem || !isOpen || !!modalCurrentItem?.trade?.badge || !!modalCurrentItem?.signalAutoEntry?.attempted;
  [signalConfirmBuyBtnEl, signalConfirmSellBtnEl].forEach((btn) => {
    if (!btn) return;
    btn.disabled = controlsDisabled;
    btn.style.opacity = btn.disabled ? ".45" : "1";
  });
  if (signalConfirmBuyBtnEl) {
    signalConfirmBuyBtnEl.textContent = `🟢 + COMPRA ${buyPts}/${SIGNAL_CONFIRM_MIN}`;
    signalConfirmBuyBtnEl.style.transform = enabled === "CALL" ? "translateY(-1px)" : "none";
  }
  if (signalConfirmSellBtnEl) {
    signalConfirmSellBtnEl.textContent = `🔴 + VENTA ${sellPts}/${SIGNAL_CONFIRM_MIN}`;
    signalConfirmSellBtnEl.style.transform = enabled === "PUT" ? "translateY(-1px)" : "none";
  }
  if (signalConfirmUndoBtnEl) {
    signalConfirmUndoBtnEl.disabled = controlsDisabled || totalEvents <= 0;
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
  const enabledSide = getSignalEnabledTradeSide(modalCurrentItem);

  if (enabledSide === "CALL") {
    paintGiroOnlyButtonState(modalBuyPutBtn, false, `Confirmaciones reales: solo COMPRA habilitada (${getSignalConfirmationStatusText(modalCurrentItem)}).`);
    return;
  }
  if (enabledSide === "PUT") {
    paintGiroOnlyButtonState(modalBuyCallBtn, false, `Confirmaciones reales: solo VENTA habilitada (${getSignalConfirmationStatusText(modalCurrentItem)}).`);
    return;
  }

  const msg = `Necesitas ${SIGNAL_CONFIRM_MIN} puntos netos en un grupo para operar: ${getSignalConfirmationStatusText(modalCurrentItem)}.`;
  paintGiroOnlyButtonState(modalBuyCallBtn, false, msg);
  paintGiroOnlyButtonState(modalBuyPutBtn, false, msg);
}
function assertSignalMinimumConfirmations(side = null) {
  if (!modalCurrentItem) return;
  const wanted = normalizeSignalConfirmationSide(side);
  if (!hasSignalMinimumConfirmations(modalCurrentItem, wanted)) {
    const faltan = getSignalMissingConfirmations(wanted, modalCurrentItem);
    const label = wanted === "CALL" ? "COMPRA" : wanted === "PUT" ? "VENTA" : "un lado";
    throw new Error(`Faltan ${faltan} punto${faltan === 1 ? "" : "s"} neto${faltan === 1 ? "" : "s"} para ${label}`);
  }
}
function trySignalAutoEntryAt57(reason = "AUTO_57") {
  const item = modalCurrentItem;
  if (!item || !isTradeEntryOpen(item)) return false;
  if (item?.trade?.badge) return false;
  if (tradeInFlight) return false;
  if (item?.signalAutoEntry?.attempted) return false;

  const ms = getSignalConfirmationMs();
  if (ms < SIGNAL_AUTO_ENTRY_MS) return false;

  const side = getSignalEnabledTradeSide(item);
  if (!side) return false;

  const label = side === "CALL" ? "COMPRA" : "VENTA";
  item.signalAutoEntry = {
    type: "AUTO_57_REAL",
    attempted: true,
    status: "sending",
    side,
    ms,
    sec: Math.round(ms / 1000),
    reason: String(reason || "AUTO_57"),
    at: Date.now(),
    confirmation_status: getSignalConfirmationStatusText(item),
  };
  saveHistory(history);
  updateSignalConfirmationUI();

  toast(`🚀 AUTO ${SIGNAL_AUTO_ENTRY_SEC}s: enviando ${label} ${getTradeScopeText()}…`, 1500);

  Promise.race([
    buyOneClick(side),
    new Promise((_, rej) => setTimeout(() => rej(new Error("timeout auto trade")), 22000)),
  ])
    .then((res) => {
      const cid = res?.buy?.contract_id || "";
      item.signalAutoEntry.status = "sent";
      item.signalAutoEntry.contract_id = cid ? String(cid) : "";
      item.signalAutoEntry.sent_at = Date.now();
      saveHistory(history);
      toast(`✅ AUTO ${label} enviado ${cid ? "ID: " + cid : ""}`, 1800);
    })
    .catch((e) => {
      item.signalAutoEntry.status = "error";
      item.signalAutoEntry.error = e?.message || String(e);
      item.signalAutoEntry.error_at = Date.now();
      saveHistory(history);
      toast(`⚠️ AUTO ${label} falló: ${e?.message || e}`, 2600);
    })
    .finally(() => {
      updateDisciplineLockUI(false);
      updateSignalConfirmationUI();
      requestModalDraw(true);
    });

  return true;
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
    setGiroAprendizajeControlsVisible(false);
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
    const giroState = shouldBypassGiroOnlyTradeGate()
      ? { active: false }
      : getGiroAllowedTradeSide(modalCurrentItem);
    let giroTxt = "";
    if (giroState.active) {
      if (giroState.bodyDir > 0) giroTxt = " | SOLO GIRO: habilitada VENTA";
      else if (giroState.bodyDir < 0) giroTxt = " | SOLO GIRO: habilitada COMPRA";
      else giroTxt = " | SOLO GIRO: esperando definición";
    }
    bar.textContent = `🟢 VELA ABIERTA | faltan ${sec}s | ${getSignalConfirmationStatusText(modalCurrentItem)} | AUTO ${SIGNAL_AUTO_ENTRY_SEC}s${autoTxt}${giroTxt}${getC100ModalTag()}`;
    bar.style.color = "#dcfce7";
    bar.style.background = "rgba(22,163,74,.18)";
    bar.style.borderColor = "rgba(34,197,94,.34)";
    bar.style.boxShadow = "0 0 0 1px rgba(34,197,94,.06) inset";
  } else {
    bar.textContent = `${getTradeScopeText()} | VELA CERRADA${getC100ModalTag()}`;
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
  setGiroAprendizajeControlsVisible(true);
  updateSignalConfirmationUI();
  updateGiroAprendizajeControlsUI();

  applyModalExecutionButtonUI(locked, candleClosed);
  applyGiroOnlyTradeButtons(modalCurrentItem, locked, candleClosed);
  applySignalConfirmationTradeGate(locked, candleClosed);
  applyC100TradeGate(locked, candleClosed);

  // Auto-entrada real: igual que práctica, al segundo 57 si ya hay 4 puntos netos.
  if (!locked && !candleClosed) trySignalAutoEntryAt57("TIMER_57");
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
      const confTag = ` | CONF:${getSignalConfirmationStatusText(it)} | AUTO:${SIGNAL_AUTO_ENTRY_SEC}s`;
      const c100Tag = getC100ModalTag();
      modalSub.textContent = `${it.time} | ${getTradeScopeText()} | ticks: ${n}${confTag}${tagLive}${dTag ? " | " + dTag : ""}${tBadge}${autoTag}${c100Tag}`;
    }

    updateModalCandleStatusUI();
  });
}

/* =========================
   Panel Giro + Aprendizaje en modal
========================= */
function ensureGiroAprendizajeControls() {
  if (giroAprendizajePanelEl && giroAprendizajePanelEl.isConnected) return giroAprendizajePanelEl;

  const footer =
    document.querySelector("#chartModal .modalFooter") ||
    (chartModal ? chartModal.querySelector(".modalFooter") : null);
  if (!footer) return null;

  const panel = document.createElement("div");
  panel.id = "giroAprendizajePanel";
  panel.style.width = "100%";
  panel.style.boxSizing = "border-box";
  panel.style.margin = "0 0 10px 0";
  panel.style.padding = "12px";
  panel.style.borderRadius = "18px";
  panel.style.border = "1px solid rgba(34,211,238,.24)";
  panel.style.background = "linear-gradient(180deg, rgba(34,211,238,.10), rgba(255,255,255,.030))";
  panel.style.boxShadow = "0 12px 26px rgba(0,0,0,.16), inset 0 0 0 1px rgba(34,211,238,.035)";

  const top = document.createElement("div");
  top.style.display = "flex";
  top.style.alignItems = "center";
  top.style.justifyContent = "space-between";
  top.style.gap = "10px";
  top.style.marginBottom = "10px";

  const count = document.createElement("div");
  count.id = "giroAprendizajeCount";
  count.style.fontWeight = "950";
  count.style.letterSpacing = ".25px";
  count.style.fontSize = "14px";
  count.style.padding = "8px 10px";
  count.style.borderRadius = "999px";
  count.style.border = "1px solid rgba(34,211,238,.24)";
  count.style.background = "rgba(0,0,0,.16)";
  count.style.whiteSpace = "nowrap";

  const hint = document.createElement("div");
  hint.id = "giroAprendizajeHint";
  hint.style.flex = "1";
  hint.style.textAlign = "right";
  hint.style.fontSize = "12px";
  hint.style.fontWeight = "850";
  hint.style.opacity = ".88";
  hint.style.lineHeight = "1.25";

  top.appendChild(count);
  top.appendChild(hint);

  const row = document.createElement("div");
  row.id = "giroAprendizajeButtons";
  row.style.display = "grid";
  row.style.gridTemplateColumns = "1fr 1fr";
  row.style.gap = "8px";

  const mk = (label, text, title) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btnGhost giroLearnBtn";
    btn.dataset.learnLabel = label;
    btn.textContent = text;
    btn.title = title;
    btn.style.minHeight = "42px";
    btn.style.borderRadius = "14px";
    btn.style.fontWeight = "950";
    btn.style.fontSize = "12px";
    btn.style.padding = "9px 8px";
    btn.style.touchAction = "manipulation";
    btn.onclick = (e) => {
      e.stopPropagation();
      if (!modalCurrentItem) return;
      upsertGiroAprendizajeExample(modalCurrentItem, label, "modal_signal");
    };
    row.appendChild(btn);
    return btn;
  };

  mk("target", "✅ Es mi formación", "Guardar como formación que buscás para Giro + Aprendizaje");
  mk("avoid", "❌ No es", "Guardar como formación a evitar");
  mk("doubt", "⚠️ Dudosa", "Guardar como parecida/dudosa sin usarla como positiva fuerte");
  mk("clear", "⭐ Muy clara", "Guardar como ejemplo fuerte de la esencia buscada");
  mk("remove", "🗑 Quitar marca", "Quitar esta vela del aprendizaje");

  panel.appendChild(top);
  panel.appendChild(row);

  const signalPanel = ensureSignalConfirmationControls();
  if (signalPanel && signalPanel.parentElement === footer) signalPanel.insertAdjacentElement("afterend", panel);
  else footer.prepend(panel);

  giroAprendizajePanelEl = panel;
  giroAprendizajeCountEl = count;
  giroAprendizajeHintEl = hint;
  giroAprendizajeButtonsEl = row;

  updateGiroAprendizajeControlsUI();
  return panel;
}
function updateGiroAprendizajeControlsUI() {
  if (!giroAprendizajePanelEl || !giroAprendizajePanelEl.isConnected) return;
  const stats = getGiroAprendizajeStats();
  const ex = modalCurrentItem ? getGiroAprendizajeExampleForItem(modalCurrentItem) : null;
  const currentLabel = ex ? normalizeGiroAprendizajeLabel(ex.label) : "";

  if (giroAprendizajeCountEl) {
    giroAprendizajeCountEl.textContent = `🧠 Giro + Aprendizaje · ${stats.clear + stats.target} sí / ${stats.avoid} no`;
    giroAprendizajeCountEl.style.color = currentLabel ? "#ecfeff" : "rgba(255,255,255,.92)";
    giroAprendizajeCountEl.style.borderColor = currentLabel ? "rgba(34,211,238,.72)" : "rgba(34,211,238,.24)";
  }
  if (giroAprendizajeHintEl) {
    giroAprendizajeHintEl.textContent = currentLabel ? `Esta vela: ${getGiroAprendizajeLabelText(currentLabel)}` : "Enseñá si esta forma es la esencia buscada";
    giroAprendizajeHintEl.style.color = currentLabel === "avoid" ? "#fecaca" : currentLabel ? "#a5f3fc" : "rgba(255,255,255,.70)";
  }
  if (giroAprendizajeButtonsEl) {
    giroAprendizajeButtonsEl.querySelectorAll(".giroLearnBtn").forEach((btn) => {
      const label = normalizeGiroAprendizajeLabel(btn.dataset.learnLabel || "");
      const selected = label === currentLabel;
      btn.classList.toggle("selected", selected);
      btn.setAttribute("aria-pressed", selected ? "true" : "false");
      btn.style.opacity = selected ? "1" : ".92";
      btn.style.borderColor = selected ? "rgba(34,211,238,.88)" : "rgba(255,255,255,.16)";
      btn.style.boxShadow = selected ? "0 0 14px rgba(34,211,238,.35), inset 0 0 0 1px rgba(34,211,238,.20)" : "";
    });
  }
}
function setGiroAprendizajeControlsVisible(show) {
  ensureGiroAprendizajeControls();
  if (giroAprendizajePanelEl) giroAprendizajePanelEl.style.display = show ? "block" : "none";
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
  ensureGiroAprendizajeControls();
  setGiroAprendizajeControlsVisible(true);
  updateSignalConfirmationUI();
  updateGiroAprendizajeControlsUI();
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
   Feedback Trades / Señales
========================= */
function findTradesJournalEntryForFeedback(item, opts = {}) {
  const journalId = String(opts.journalId || item?.journal_id || "");
  if (journalId) {
    const byJournal = (tradesJournal || []).find((x) => x && String(x.journal_id || "") === journalId);
    if (byJournal) return byJournal;
  }

  const signalId = String(opts.signalId || item?.id || "");
  if (signalId) {
    const bySignal = (tradesJournal || []).find((x) => x && String(x.id || "") === signalId);
    if (bySignal) return bySignal;
  }

  return null;
}
function persistRowFeedback(item, opts = {}, row = null) {
  if (!item) return;

  if (opts.source === "trades") {
    const entry = findTradesJournalEntryForFeedback(item, opts);
    if (!entry) return;

    entry.vote = item.vote || "";
    entry.comment = item.comment || "";
    entry.feedback_at = Date.now();
    entry.feedback_source = "trades_tab";
    saveTradesJournal(tradesJournal);
    updateExportTradesButtonUI();
    return;
  }

  saveHistory(history);
}
function applyVoteButtonsVisual(row, vote = "", { lock = false } = {}) {
  if (!row) return;
  const safeVote = String(vote || "");
  const btns = row.querySelectorAll("button[data-v]");
  btns.forEach((btn) => {
    const selected = String(btn.dataset.v || "") === safeVote;
    btn.classList.toggle("selected", selected);
    btn.disabled = !!lock;
    btn.setAttribute("aria-pressed", selected ? "true" : "false");
  });
  row.classList.toggle("voted", !!safeVote);
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
  const voteIsLocked = !!item.vote && !opts.allowVoteChange;
  const commentPlaceholder = opts.source === "trades" ? "por qué" : "comentario";
  const commentStyle = opts.source === "trades" ? "max-width:190px; min-width:130px;" : "max-width:118px; min-width:90px;";
  const actionsHtml = opts.hideActions
    ? ""
    : `
    <div class="row-actions">
      <button class="voteBtn" data-v="like" type="button" ${voteIsLocked ? "disabled" : ""} title="Me gusta / operación que quiero buscar">👍</button>
      <button class="voteBtn" data-v="dislike" type="button" ${voteIsLocked ? "disabled" : ""} title="No me gusta / operación que quiero evitar">👎</button>
      <button class="savePracticeBtn ${savedForPractice ? "selected" : ""}" type="button" title="${savedForPractice ? "Quitar del pool de práctica" : "Guardar en el pool de práctica del modo correspondiente"}">💾</button>
      <input class="row-comment" style="${commentStyle}" placeholder="${commentPlaceholder}" value="${escapeHtml(item.comment || "")}">
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

  // acciones: señales + Trades de estudio
  if (!opts.hideActions) {
    applyVoteButtonsVisual(row, item.vote || "", { lock: !!item.vote && !opts.allowVoteChange });

    row.querySelectorAll("button[data-v]").forEach((btn) => {
      btn.onclick = (e) => {
        e.stopPropagation();

        const selectedVote = String(btn.dataset.v || "");
        if (!opts.allowVoteChange && item.vote) return;

        // En Trades permitimos cambiar la marca. Si tocás el mismo botón, se quita.
        item.vote = opts.allowVoteChange && item.vote === selectedVote ? "" : selectedVote;
        item.comment = row.querySelector(".row-comment")?.value || "";

        applyVoteButtonsVisual(row, item.vote || "", { lock: !!item.vote && !opts.allowVoteChange });
        persistRowFeedback(item, opts, row);

        if (opts.source === "trades") {
          const txt = item.vote === "like" ? "👍 Me gusta guardado" : item.vote === "dislike" ? "👎 No me gusta guardado" : "Marca quitada";
          toast(txt, 1200);
        }
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
    if (input) {
      input.addEventListener("blur", () => {
        item.comment = input.value || "";
        persistRowFeedback(item, opts, row);
      });
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          input.blur();
          toast(opts.source === "trades" ? "💬 Motivo guardado" : "💬 Comentario guardado", 1000);
        }
      });
    }
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
          handleC100ContractClosed(cid, isWin, profit);
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
  assertSignalMinimumConfirmations(side);
  assertC100CanTrade();

  if (tradeInFlight) throw new Error("Operación en curso");
  tradeInFlight = true;

  try {
    await ensureAuthorized();
    startNewDisciplineWindowIfNeeded();

    const symbol =
      symbolOverride || (modalCurrentItem && modalCurrentItem.symbol) || (history.at(-1)?.symbol || "R_25");
    const stake = Number(getEffectiveTradeStake().toFixed(2));
    let res = null;
    let contractLabel = side;
    let tradeExtra = { side, symbol, stake };

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
      assertC100PayoutOK(Number(plan.profitPct));

      res = await wsRequest({ buy: plan.proposalId, price: plan.askPrice }, 20000);
      contractLabel = plan.contractType || contractLabel;
      tradeExtra = {
        ...tradeExtra,
        exec_mode: executionMode,
        contract_type: contractLabel,
        barrier: plan.barrier,
        payout_pct: Number(plan.profitPct),
        target_return_pct: Math.round(plan.profitPct),
        proposal_id: plan.proposalId,
        c100_enabled: isC100Active(),
        c100_level: c100State?.level || null,
        c100_compoundStep: c100State?.compoundStep || 0,
      };
    } else if (isC100Active()) {
      // C100 siempre pide proposal antes de comprar para validar payout >= 95%.
      const proposalRes = await wsRequest(
        {
          proposal: 1,
          amount: stake,
          basis: "stake",
          contract_type: side,
          currency: DEFAULT_CURRENCY,
          duration: Number(DEFAULT_DURATION) || 1,
          duration_unit: DEFAULT_DURATION_UNIT || "m",
          symbol,
        },
        12000
      );
      if (proposalRes?.error) throw new Error(proposalRes.error.message || "proposal error");

      const proposal = proposalRes?.proposal;
      const proposalId = proposal?.id ? String(proposal.id) : "";
      const askPrice = Number(proposal?.ask_price);
      const payout = Number(proposal?.payout);
      if (!proposalId || !Number.isFinite(askPrice) || askPrice <= 0 || !Number.isFinite(payout)) {
        throw new Error("Deriv no confirmó proposal válida para C100.");
      }
      const profitPct = ((payout - askPrice) / askPrice) * 100;
      assertC100PayoutOK(profitPct);

      res = await wsRequest({ buy: proposalId, price: askPrice }, 20000);
      tradeExtra = {
        ...tradeExtra,
        exec_mode: "C100_RISE_FALL_PROPOSAL",
        contract_type: side,
        payout_pct: Number(profitPct),
        proposal_id: proposalId,
        c100_enabled: true,
        c100_mode: C100_MODE_LABEL,
        c100_level: c100State?.level || null,
        c100_compoundStep: c100State?.compoundStep || 0,
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

    if (isC100Active()) markC100PendingContract(cid);

    if (modalCurrentItem && modalCurrentItem.id) {
      setTradeBadge(modalCurrentItem, "PENDING", { contract_id: String(cid), ...tradeExtra });
      linkContractToSignal(cid, modalCurrentItem.id);
    }

    subscribeContractOutcome(cid, true);
    scheduleOutcomeFallbackPoll(cid, 85000);

    const c100Txt = isC100Active() ? ` | C100 stake $${stake.toFixed(2)}` : "";
    toast(`📌 ${getTradingAccountLabel()} trade registrado (${contractLabel})${c100Txt}. Esperando resultado…`, 1800);

    updateDisciplineLockUI(false);
    updateC100PanelUI();
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
  ensureC100Panel();
  updateC100PanelUI();
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
      stopAllExecutionPlanLoops();
      executionPlanCache.clear();
      updateC100PanelUI();
      toast(`💾 Stake ${getTradingAccountLabel()} guardado ✓`, 1600);
      alert(`✅ Stake ${getTradingAccountLabel()} guardado: ${Number(getTradeStake()).toFixed(2)} USD`);
    };
  }

  if (stakeDefaultBtn && stakeInput) {
    stakeDefaultBtn.onclick = () => {
      clearTradeStake();
      setTradeStake(DEFAULT_STAKE);
      syncStakeInputWithCurrentAccount();
      stopAllExecutionPlanLoops();
      executionPlanCache.clear();
      updateC100PanelUI();
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
    lastStatusBeforeRehydrate = appStatusText || statusEl.textContent || "";
    rehydrateRunning = true;
  }
  setStatus(text);
}
function clearRehydrateStatus() {
  if (!statusEl) return;
  if (!rehydrateRunning) return;
  rehydrateRunning = false;
  setStatus(lastStatusBeforeRehydrate || "Conectado – Analizando");
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
  if (appStatusText === "Conectado – Suscribiendo…") setStatus("Conectado – Analizando");
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

/* =========================
   Motor DEBILIDAD / FORTALEZA CLARA
   - CALL = vendedor agotado + comprador con mejor respuesta
   - PUT  = comprador agotado + vendedor con mejor respuesta
   Se usa como filtro del Modo NORMAL + DEBILIDAD: NORMAL da estructura, DEBILIDAD confirma calidad.
========================= */
const RULES_DEBILIDAD = {
  // FLEX 20260427: más señales, pero manteniendo estructura + debilidad.
  rangeVsVolMin: 1.25,
  weakLeadMinFracRange: 0.17,
  recoveryMinFracRange: 0.11,
  lateWinnerRatioMin: 0.32,
  lateWinnerMoveMinFracRange: -0.005,
  last8WinnerMoveMinFracRange: -0.12,
  lateControlMin: 0.24,
  weakReductionMax: 1.75,
  weakIrregularityMin: 0.018,
  minWeakStepsTotal: 1,
  minWinnerStepsLate: 1,
  clarityMin: 43,
};

const RULES_NORMAL_DEBILIDAD = {
  // NORMAL da contexto/estructura; DEBILIDAD decide si hay agotamiento aprovechable.
  minAlignedDebilidadScore: 43,
  structureRangeVsVolMin: 1.12,
  structureDominanceMin: 0.40,
  structureEarlyRangeMinFrac: 0.18,
};

function buildDebilidadCheckpoints(evalMs) {
  return [...new Set([0, 8000, 16000, 24000, 32000, 40000, evalMs].filter((ms) => ms <= evalMs))].sort((a, b) => a - b);
}

function passesNormalDebilidadStructure(candidate, rules = RULES_NORMAL_DEBILIDAD) {
  const ticks = candidate?.ticks || [];
  const evalMs = EVAL_SEC * 1000;
  if (ticks.length < 6) return false;

  const fullTicks = sliceTicks(ticks, 0, evalMs);
  if (fullTicks.length < 5) return false;

  const qs = fullTicks.map((t) => Number(t.quote)).filter((q) => Number.isFinite(q));
  if (qs.length < 5) return false;

  const minP = Math.min(...qs);
  const maxP = Math.max(...qs);
  const range = Math.max(1e-12, maxP - minP);
  const rangeVsVol = range / (Number(candidate?.vol || 0) || 1e-9);
  if (rangeVsVol < Number(rules.structureRangeVsVolMin || 1.12)) return false;

  // Hay estructura cuando existe una intención predominante mínima dentro de la vela,
  // aunque después aparezca el giro/debilidad. No pedimos continuidad perfecta.
  const cps = [...new Set([0, 10000, 20000, 30000, 40000, evalMs].filter((ms) => ms <= evalMs))].sort((a, b) => a - b);
  let upSum = 0;
  let downSum = 0;
  for (let i = 1; i < cps.length; i++) {
    const a = getPriceAtMs(ticks, cps[i - 1]);
    const b = getPriceAtMs(ticks, cps[i]);
    if (a == null || b == null) return false;
    const mv = b - a;
    if (mv > 0) upSum += mv;
    else downSum += Math.abs(mv);
  }

  const totalLegs = upSum + downSum;
  if (totalLegs <= 1e-12) return false;
  const dominance = Math.max(upSum, downSum) / totalLegs;
  if (dominance < Number(rules.structureDominanceMin || 0.40)) return false;

  const earlyTicks = sliceTicks(ticks, 0, Math.min(30000, evalMs));
  const earlyQs = earlyTicks.map((t) => Number(t.quote)).filter((q) => Number.isFinite(q));
  if (earlyQs.length >= 3) {
    const earlyRange = Math.max(...earlyQs) - Math.min(...earlyQs);
    if (earlyRange < range * Number(rules.structureEarlyRangeMinFrac || 0.18)) return false;
  }

  return true;
}

function buildDebilidadStepSummary(stepMoves, winnerSign, splitIndex) {
  const weakSign = -winnerSign;
  const weakStepsTotal = [];
  const weakStepsEarly = [];
  const weakStepsLate = [];
  const winnerStepsLate = [];
  let weakLateSum = 0;
  let winnerLateSum = 0;

  for (let i = 0; i < stepMoves.length; i++) {
    const raw = Number(stepMoves[i] || 0);
    if (!Number.isFinite(raw) || Math.abs(raw) < 1e-12) continue;
    const abs = Math.abs(raw);
    const isLate = i >= splitIndex;

    if (Math.sign(raw) === weakSign) {
      weakStepsTotal.push(abs);
      if (isLate) {
        weakStepsLate.push(abs);
        weakLateSum += abs;
      } else {
        weakStepsEarly.push(abs);
      }
    } else if (Math.sign(raw) === winnerSign && isLate) {
      winnerStepsLate.push(abs);
      winnerLateSum += abs;
    }
  }

  const weakFirstAvg = average(weakStepsEarly.slice(0, 2).length ? weakStepsEarly.slice(0, 2) : weakStepsTotal.slice(0, 2));
  const weakLastAvg = average(weakStepsLate.slice(-2).length ? weakStepsLate.slice(-2) : weakStepsTotal.slice(-2));
  const weakReduction = weakFirstAvg > 1e-12 ? weakLastAvg / weakFirstAvg : 999;
  const weakIrregularity = coeffVar(weakStepsTotal);
  const lateControl = winnerLateSum / (weakLateSum + 1e-12);

  return {
    weakStepsTotal,
    weakStepsEarly,
    weakStepsLate,
    winnerStepsLate,
    weakLateSum,
    winnerLateSum,
    weakFirstAvg,
    weakLastAvg,
    weakReduction,
    weakIrregularity,
    lateControl,
  };
}

function analyzeDebilidadSide(candidate, winnerSign, rules) {
  const ticks = candidate?.ticks || [];
  const evalMs = EVAL_SEC * 1000;
  if (ticks.length < 6) return null;

  const p0 = getPriceAtMs(ticks, 0);
  const pE = getPriceAtMs(ticks, evalMs);
  if (p0 == null || pE == null) return null;

  const fullTicks = sliceTicks(ticks, 0, evalMs);
  if (fullTicks.length < 5) return null;

  const qs = fullTicks.map((t) => Number(t.quote)).filter((q) => Number.isFinite(q));
  if (qs.length < 5) return null;

  const minP = Math.min(...qs);
  const maxP = Math.max(...qs);
  const range = Math.max(1e-12, maxP - minP);
  const volMean = Number(candidate?.vol || 0);
  const rangeVsVol = range / (volMean || 1e-9);
  if (rangeVsVol < rules.rangeVsVolMin) return null;

  const weakSign = -winnerSign;
  const weakExtreme = weakSign > 0 ? maxP : minP;
  const weakLead = Math.max(0, (weakExtreme - p0) * weakSign);
  const recovery = Math.max(0, (pE - weakExtreme) * winnerSign);

  if (weakLead < range * rules.weakLeadMinFracRange) return null;
  if (recovery < range * rules.recoveryMinFracRange) return null;

  const lateStartMs = Math.max(0, evalMs - 14000);
  const last8StartMs = Math.max(0, evalMs - 8000);
  const lateTicks = sliceTicks(ticks, lateStartMs, evalMs);
  const lateWinnerRatio = directionalRatio(lateTicks, winnerSign);
  const lateWinnerMove = segmentMoveSigned(ticks, lateStartMs, evalMs, winnerSign);
  const last8WinnerMove = segmentMoveSigned(ticks, last8StartMs, evalMs, winnerSign);

  if (lateWinnerRatio < rules.lateWinnerRatioMin) return null;
  if (lateWinnerMove < range * rules.lateWinnerMoveMinFracRange) return null;
  if (last8WinnerMove < range * rules.last8WinnerMoveMinFracRange) return null;

  const cps = buildDebilidadCheckpoints(evalMs);
  const stepMoves = [];
  for (let i = 1; i < cps.length; i++) {
    const a = getPriceAtMs(ticks, cps[i - 1]);
    const b = getPriceAtMs(ticks, cps[i]);
    if (a == null || b == null) return null;
    stepMoves.push(b - a);
  }

  const splitIndex = Math.max(1, Math.floor(stepMoves.length / 2));
  const summary = buildDebilidadStepSummary(stepMoves, winnerSign, splitIndex);

  if (summary.weakStepsTotal.length < rules.minWeakStepsTotal) return null;
  if (summary.winnerStepsLate.length < rules.minWinnerStepsLate) return null;

  const hasWeaknessSignature =
    summary.weakReduction <= rules.weakReductionMax ||
    summary.weakIrregularity >= rules.weakIrregularityMin ||
    summary.lateControl >= rules.lateControlMin;
  if (!hasWeaknessSignature) return null;

  const weakLeadScore = Math.min(1.35, weakLead / range);
  const recoveryScore = Math.min(1.35, recovery / range);
  const lateMoveScore = Math.max(0, Math.min(1.35, lateWinnerMove / range));
  const last8Score = Math.max(0, Math.min(1.1, last8WinnerMove / range));
  const controlScore = Math.min(1.45, summary.lateControl);
  const reductionScore = Math.max(0, 1.25 - Math.min(1.25, summary.weakReduction));
  const irregularityScore = Math.min(1.2, summary.weakIrregularity);

  const quality =
    weakLeadScore * 18 +
    recoveryScore * 26 +
    lateWinnerRatio * 26 +
    lateMoveScore * 22 +
    last8Score * 8 +
    controlScore * 15 +
    reductionScore * 12 +
    irregularityScore * 10;

  if (quality < rules.clarityMin) return null;

  return {
    direction: winnerSign > 0 ? "CALL" : "PUT",
    quality,
    weakLead,
    recovery,
    lateWinnerRatio,
    lateWinnerMove,
    range,
    rangeVsVol,
    weakReduction: summary.weakReduction,
    weakIrregularity: summary.weakIrregularity,
    lateControl: summary.lateControl,
  };
}


/* =========================
   Modo FUERZA/DEBILIDAD CLARA
   Busca la esencia visual: impulsos fuertes de un grupo + retrocesos contrarios débiles/irregulares.
   - CALL = compradores dominan con impulsos alcistas y vendedores no logran recuperar mando.
   - PUT  = vendedores dominan con impulsos bajistas y compradores no logran recuperar mando.
========================= */
const RULES_FUERZA_DEBILIDAD_CLARA = {
  rangeVsVolMin: 1.22,
  minBigDominantLegs: 2,
  dominantLegMinFracRange: 0.105,
  dominanceRatioMin: 1.06,
  closeDominanceMin: 0.50,
  breakCountMin: 1,
  weakResponseMaxVsDomLargest: 1.22,
  minOppositeLegs: 1,
  weakIrregularityMin: 0.04,
  qualityMin: 60,
  minQualityGap: 7,
};

function buildFuerzaDebilidadCheckpoints(evalMs) {
  return [...new Set([0, 7000, 15000, 23000, 30000, 38000, 45000, evalMs].filter((ms) => ms <= evalMs))].sort((a, b) => a - b);
}

function countDominantBreaksByTicks(ticks, dirSign, range, minStep) {
  const pts = (ticks || []).slice().sort((a, b) => a.ms - b.ms);
  if (pts.length < 3) return 0;

  let breaks = 0;
  if (dirSign > 0) {
    let extreme = pts[0].quote;
    for (const t of pts) {
      if (t.ms < 7000) {
        extreme = Math.max(extreme, t.quote);
        continue;
      }
      if (t.quote > extreme + minStep) {
        breaks += 1;
        extreme = t.quote;
      } else {
        extreme = Math.max(extreme, t.quote);
      }
    }
  } else {
    let extreme = pts[0].quote;
    for (const t of pts) {
      if (t.ms < 7000) {
        extreme = Math.min(extreme, t.quote);
        continue;
      }
      if (t.quote < extreme - minStep) {
        breaks += 1;
        extreme = t.quote;
      } else {
        extreme = Math.min(extreme, t.quote);
      }
    }
  }

  return breaks;
}

function analyzeFuerzaDebilidadSide(candidate, dirSign, rules = RULES_FUERZA_DEBILIDAD_CLARA) {
  const ticks = candidate?.ticks || [];
  const evalMs = EVAL_SEC * 1000;
  if (ticks.length < 7) return null;

  const fullTicks = sliceTicks(ticks, 0, evalMs);
  if (fullTicks.length < 6) return null;

  const p0 = getPriceAtMs(ticks, 0);
  const pE = getPriceAtMs(ticks, evalMs);
  if (p0 == null || pE == null) return null;

  const qs = fullTicks.map((t) => Number(t.quote)).filter((q) => Number.isFinite(q));
  if (qs.length < 6) return null;

  const minP = Math.min(...qs);
  const maxP = Math.max(...qs);
  const range = Math.max(1e-12, maxP - minP);
  const volMean = Number(candidate?.vol || 0);
  const rangeVsVol = range / (volMean || 1e-9);
  if (rangeVsVol < rules.rangeVsVolMin) return null;

  const cps = buildFuerzaDebilidadCheckpoints(evalMs);
  const stepMoves = [];
  for (let i = 1; i < cps.length; i++) {
    const a = getPriceAtMs(ticks, cps[i - 1]);
    const b = getPriceAtMs(ticks, cps[i]);
    if (a == null || b == null) return null;
    stepMoves.push(b - a);
  }

  const dominantLegs = [];
  const oppositeLegs = [];
  for (const raw of stepMoves) {
    const mv = Number(raw || 0);
    if (!Number.isFinite(mv) || Math.abs(mv) < range * 0.015) continue;
    const signed = mv * dirSign;
    if (signed > 0) dominantLegs.push(Math.abs(mv));
    else oppositeLegs.push(Math.abs(mv));
  }

  const dominantSum = dominantLegs.reduce((a, b) => a + b, 0);
  const oppositeSum = oppositeLegs.reduce((a, b) => a + b, 0);
  if (dominantSum <= 1e-12) return null;
  if (oppositeLegs.length < rules.minOppositeLegs) return null;

  const bigDominantLegs = dominantLegs.filter((v) => v >= range * rules.dominantLegMinFracRange);
  if (bigDominantLegs.length < rules.minBigDominantLegs) return null;

  const dominanceRatio = dominantSum / (oppositeSum + 1e-12);
  if (dominanceRatio < rules.dominanceRatioMin) return null;

  const dominantLargest = Math.max(...dominantLegs, 0);
  const oppositeLargest = Math.max(...oppositeLegs, 0);
  const weakResponseRatio = oppositeLargest / (dominantLargest + 1e-12);
  if (weakResponseRatio > rules.weakResponseMaxVsDomLargest) return null;

  const closeDominance = dirSign > 0 ? (pE - minP) / range : (maxP - pE) / range;
  if (closeDominance < rules.closeDominanceMin) return null;

  const breakCount = countDominantBreaksByTicks(fullTicks, dirSign, range, range * 0.055);
  if (breakCount < rules.breakCountMin) return null;

  const wholeDirRatio = directionalRatio(fullTicks, dirSign);
  const oppIrregularity = coeffVar(oppositeLegs);
  const domConsistency = 1 / (1 + coeffVar(dominantLegs));
  const pMid = getPriceAtMs(ticks, Math.min(30000, evalMs));
  const midDominantMove = pMid == null ? 0 : (pMid - p0) * dirSign;
  const earlyDominance = Math.max(0, midDominantMove / range);

  const forceScore = Math.min(1.8, dominanceRatio) * 20;
  const impulseScore = Math.min(4, bigDominantLegs.length) * 10;
  const breakScore = Math.min(3, breakCount) * 8;
  const closeScore = Math.min(1.25, closeDominance) * 14;
  const weakFailScore = Math.max(0, 1.25 - Math.min(1.25, weakResponseRatio)) * 16;
  const weakIrregularityScore = Math.min(1.2, oppIrregularity) * 8;
  const dirRatioScore = wholeDirRatio * 10;
  const earlyScore = Math.min(1.2, earlyDominance) * 8;
  const consistencyScore = domConsistency * 5;

  const quality = forceScore + impulseScore + breakScore + closeScore + weakFailScore + weakIrregularityScore + dirRatioScore + earlyScore + consistencyScore;
  if (quality < rules.qualityMin) return null;

  return {
    direction: dirSign > 0 ? "CALL" : "PUT",
    quality,
    dirSign,
    range,
    rangeVsVol,
    dominanceRatio,
    dominantSum,
    oppositeSum,
    dominantLargest,
    oppositeLargest,
    weakResponseRatio,
    breakCount,
    bigDominantLegs: bigDominantLegs.length,
    closeDominance,
    wholeDirRatio,
    weakIrregularity: oppIrregularity,
    earlyDominance,
  };
}

function detectFuerzaDebilidadClaraPattern(candidate) {
  const call = analyzeFuerzaDebilidadSide(candidate, 1, RULES_FUERZA_DEBILIDAD_CLARA);
  const put = analyzeFuerzaDebilidadSide(candidate, -1, RULES_FUERZA_DEBILIDAD_CLARA);
  const matches = [call, put].filter(Boolean).sort((a, b) => b.quality - a.quality);
  if (!matches.length) return null;
  if (matches.length > 1 && matches[0].quality - matches[1].quality < RULES_FUERZA_DEBILIDAD_CLARA.minQualityGap) return null;
  return matches[0];
}


/* =========================
   Modo LIKE MANTENIDO
   Aprende de los trades marcados con 👍 en la pestaña Trades.
   Busca velas parecidas a esas 17: la vela mantiene su dirección actual
   hasta el momento de señal aunque se estanque, y la entrada va al giro:
   - vela verde/mantenida arriba  => PUT
   - vela roja/mantenida abajo    => CALL
========================= */
const RULES_LIKE_MANTENIDO = {
  minLikedPrototypes: 3,
  sampleCount: 28,
  topSimilarityMin: 58,
  avgTop3SimilarityMin: 54,
  bodyVsRangeMin: 0.055,
  leadMoveMin: 0.26,
  closeDominanceMin: 0.48,
  releaseFromExtremeMax: 0.62,
  lateAgainstMax: 0.48,
  retraceMax: 0.88,
  dirRatioMin: 0.30,
  minQualityGap: 4,
};

function normalizeTradeDirection(dir) {
  const d = String(dir || "").toUpperCase();
  if (d === "CALL" || d === "BUY" || d === "COMPRA") return "CALL";
  if (d === "PUT" || d === "SELL" || d === "VENTA") return "PUT";
  return "";
}

function getGiroLeadSignFromSignalDirection(direction) {
  const d = normalizeTradeDirection(direction);
  if (d === "PUT") return 1;
  if (d === "CALL") return -1;
  return 0;
}

function ensureTicksWithBoundary(ticks, evalMs) {
  const pts = (Array.isArray(ticks) ? ticks : [])
    .filter((t) => Number.isFinite(Number(t?.ms)) && Number.isFinite(Number(t?.quote)) && Number(t.ms) <= evalMs)
    .map((t) => ({ ms: Number(t.ms), quote: Number(t.quote) }))
    .sort((a, b) => a.ms - b.ms);

  if (!pts.length) return [];

  const p0 = getPriceAtMs(pts, 0);
  const pE = getPriceAtMs(pts, evalMs);
  if (p0 == null || pE == null) return pts;

  if (pts[0].ms > 0) pts.unshift({ ms: 0, quote: Number(p0) });
  if (pts[pts.length - 1].ms < evalMs) pts.push({ ms: evalMs, quote: Number(pE) });
  return pts;
}

function buildLikeMantenidoSignature(ticks, leadSign, evalMs, sampleCount = RULES_LIKE_MANTENIDO.sampleCount) {
  const dir = Math.sign(Number(leadSign || 0));
  if (!dir) return null;

  const pts = ensureTicksWithBoundary(ticks, evalMs);
  if (pts.length < 6) return null;

  const p0 = Number(getPriceAtMs(pts, 0));
  const pE = Number(getPriceAtMs(pts, evalMs));
  if (!Number.isFinite(p0) || !Number.isFinite(pE)) return null;

  const qs = pts.map((p) => Number(p.quote)).filter(Number.isFinite);
  if (qs.length < 6) return null;

  const minP = Math.min(...qs);
  const maxP = Math.max(...qs);
  const range = Math.max(1e-12, maxP - minP);
  const transformed = (q) => ((Number(q) - p0) * dir) / range;

  const values = [];
  for (let i = 0; i < sampleCount; i++) {
    const ms = (evalMs * i) / Math.max(1, sampleCount - 1);
    const q = getPriceAtMs(pts, ms);
    values.push(transformed(q));
  }

  const slopes = [];
  for (let i = 1; i < values.length; i++) slopes.push(values[i] - values[i - 1]);

  const cpRaw = [0, 7000, 14000, 21000, 28000, 35000, 40000, evalMs];
  const cps = [...new Set(cpRaw.filter((ms) => ms <= evalMs))].sort((a, b) => a - b);
  const segMoves = [];
  for (let i = 1; i < cps.length; i++) {
    const a = getPriceAtMs(pts, cps[i - 1]);
    const b = getPriceAtMs(pts, cps[i]);
    if (a == null || b == null) return null;
    segMoves.push(((Number(b) - Number(a)) * dir) / range);
  }

  const leadExtreme = dir > 0 ? maxP : minP;
  const releaseFromExtreme = dir > 0 ? (maxP - pE) / range : (pE - minP) / range;
  const closeDominance = dir > 0 ? (pE - minP) / range : (maxP - pE) / range;
  const body = ((pE - p0) * dir) / range;
  const leadMove = dir > 0 ? (maxP - p0) / range : (p0 - minP) / range;

  const lateStart = Math.max(0, evalMs - 14000);
  const last8Start = Math.max(0, evalMs - 8000);
  const pLate = Number(getPriceAtMs(pts, lateStart));
  const pLast8 = Number(getPriceAtMs(pts, last8Start));
  const lateMove = Number.isFinite(pLate) ? ((pE - pLate) * dir) / range : 0;
  const last8Move = Number.isFinite(pLast8) ? ((pE - pLast8) * dir) / range : 0;
  const lateAgainst = Math.max(0, -lateMove);

  const fullTicks = sliceTicks(pts, 0, evalMs);
  const lateTicks = sliceTicks(pts, lateStart, evalMs);
  const retrace = maxRetraceAgainst(fullTicks, dir) / range;
  const dirRatio = directionalRatio(fullTicks, dir);
  const lateDirRatio = directionalRatio(lateTicks, dir);

  let lateVol = 0;
  for (let i = 1; i < lateTicks.length; i++) lateVol += Math.abs(Number(lateTicks[i].quote) - Number(lateTicks[i - 1].quote));
  lateVol = lateVol / range;

  return {
    values,
    slopes,
    segMoves,
    leadSign: dir,
    range,
    p0,
    pE,
    minP,
    maxP,
    leadExtreme,
    body,
    bodyVsRange: Math.abs(pE - p0) / range,
    leadMove,
    releaseFromExtreme,
    closeDominance,
    lateMove,
    last8Move,
    lateAgainst,
    lateVol,
    retrace,
    dirRatio,
    lateDirRatio,
  };
}

function passesLikeMantenidoDirection(sig, rules = RULES_LIKE_MANTENIDO) {
  if (!sig) return false;
  if (sig.body <= 0 && sig.closeDominance < rules.closeDominanceMin + 0.12) return false;
  if (sig.bodyVsRange < rules.bodyVsRangeMin && sig.leadMove < rules.leadMoveMin + 0.08) return false;
  if (sig.leadMove < rules.leadMoveMin) return false;
  if (sig.closeDominance < rules.closeDominanceMin) return false;
  if (sig.releaseFromExtreme > rules.releaseFromExtremeMax) return false;
  if (sig.lateAgainst > rules.lateAgainstMax) return false;
  if (sig.retrace > rules.retraceMax) return false;
  if (sig.dirRatio < rules.dirRatioMin) return false;
  return true;
}

function rmsDiffLike(a, b) {
  const n = Math.min((a || []).length, (b || []).length);
  if (!n) return 0;
  let acc = 0;
  for (let i = 0; i < n; i++) {
    const d = Number(a[i] || 0) - Number(b[i] || 0);
    acc += d * d;
  }
  return Math.sqrt(acc / n);
}

function avgAbsDiffLike(a, b) {
  const n = Math.min((a || []).length, (b || []).length);
  if (!n) return 0;
  let acc = 0;
  for (let i = 0; i < n; i++) acc += Math.abs(Number(a[i] || 0) - Number(b[i] || 0));
  return acc / n;
}

function computeLikeMantenidoSimilarity(a, b) {
  if (!a || !b) return 0;
  const distance =
    rmsDiffLike(a.values, b.values) * 1.55 +
    avgAbsDiffLike(a.slopes, b.slopes) * 0.95 +
    avgAbsDiffLike(a.segMoves, b.segMoves) * 1.10 +
    Math.abs(a.body - b.body) * 0.55 +
    Math.abs(a.leadMove - b.leadMove) * 0.55 +
    Math.abs(a.releaseFromExtreme - b.releaseFromExtreme) * 0.70 +
    Math.abs(a.closeDominance - b.closeDominance) * 0.70 +
    Math.abs(a.lateMove - b.lateMove) * 0.70 +
    Math.abs(a.retrace - b.retrace) * 0.40 +
    Math.abs(a.dirRatio - b.dirRatio) * 0.32;
  return Math.max(0, Math.min(100, Math.round(100 * Math.exp(-distance * 0.86))));
}

function getLikedMantenidoPrototypeEntries() {
  return (tradesJournal || []).filter((entry) => {
    if (!entry || entry.vote !== "like") return false;
    const direction = normalizeTradeDirection(entry.direction || entry?.trade?.side);
    if (!direction) return false;
    if (!Array.isArray(entry.ticks) || entry.ticks.length < 6) return false;
    return true;
  });
}

function getLikedMantenidoPrototypes(evalMs, rules = RULES_LIKE_MANTENIDO) {
  const prototypes = [];
  const entries = getLikedMantenidoPrototypeEntries();
  for (const entry of entries) {
    const direction = normalizeTradeDirection(entry.direction || entry?.trade?.side);
    const leadSign = getGiroLeadSignFromSignalDirection(direction);
    if (!leadSign) continue;
    const sig = buildLikeMantenidoSignature(entry.ticks, leadSign, evalMs, rules.sampleCount);
    if (!sig) continue;
    if (!passesLikeMantenidoDirection(sig, { ...rules, topSimilarityMin: 0, avgTop3SimilarityMin: 0 })) continue;
    prototypes.push({ id: entry.journal_id || entry.id || "", direction, leadSign, symbol: entry.symbol || "", time: entry.time || "", sig });
  }
  return prototypes;
}

function inferCandidateLikeLeadSign(candidate, evalMs) {
  const pts = ensureTicksWithBoundary(candidate?.ticks || [], evalMs);
  if (pts.length < 6) return 0;
  const p0 = Number(getPriceAtMs(pts, 0));
  const pE = Number(getPriceAtMs(pts, evalMs));
  if (!Number.isFinite(p0) || !Number.isFinite(pE)) return 0;
  const qs = pts.map((t) => Number(t.quote)).filter(Number.isFinite);
  if (qs.length < 6) return 0;
  const minP = Math.min(...qs);
  const maxP = Math.max(...qs);
  const range = Math.max(1e-12, maxP - minP);
  const body = pE - p0;
  if (Math.abs(body) >= range * 0.035) return Math.sign(body);
  const pos = (pE - minP) / range;
  if (pos >= 0.60) return 1;
  if (pos <= 0.40) return -1;
  return 0;
}

function analyzeLikeMantenidoCandidate(candidate, rules = RULES_LIKE_MANTENIDO) {
  const evalMs = EVAL_SEC * 1000;
  const prototypes = getLikedMantenidoPrototypes(evalMs, rules);
  if (prototypes.length < rules.minLikedPrototypes) return null;
  const leadSign = inferCandidateLikeLeadSign(candidate, evalMs);
  if (!leadSign) return null;
  const sig = buildLikeMantenidoSignature(candidate?.ticks || [], leadSign, evalMs, rules.sampleCount);
  if (!passesLikeMantenidoDirection(sig, rules)) return null;
  const sims = prototypes.map((proto) => ({ proto, similarity: computeLikeMantenidoSimilarity(sig, proto.sig) })).sort((a, b) => b.similarity - a.similarity);
  if (!sims.length) return null;
  const top = sims[0];
  const top3 = sims.slice(0, 3);
  const avgTop3 = top3.reduce((acc, x) => acc + x.similarity, 0) / top3.length;
  if (top.similarity < rules.topSimilarityMin) return null;
  if (avgTop3 < rules.avgTop3SimilarityMin) return null;
  const holdScore = Math.min(1, sig.leadMove) * 18 + Math.min(1, sig.closeDominance) * 18 + Math.max(0, 1 - sig.releaseFromExtreme) * 18 + Math.max(0, 1 - sig.lateAgainst) * 12 + Math.min(1, sig.dirRatio) * 10;
  const quality = top.similarity * 0.75 + avgTop3 * 0.35 + holdScore;
  return {
    direction: leadSign > 0 ? "PUT" : "CALL",
    quality,
    likeScore: top.similarity,
    likeAvgTop3: avgTop3,
    prototypeCount: prototypes.length,
    leadSign,
    signalLogic: leadSign > 0 ? "vela_verde_o_arriba_mantenida_giro_PUT" : "vela_roja_o_abajo_mantenida_giro_CALL",
    meta: {
      topSimilarity: top.similarity,
      avgTop3Similarity: Math.round(avgTop3),
      prototypeCount: prototypes.length,
      matched: top3.map((x) => ({ id: x.proto.id, symbol: x.proto.symbol, time: x.proto.time, direction: x.proto.direction, similarity: x.similarity })),
      leadSign,
      body: sig.body,
      bodyVsRange: sig.bodyVsRange,
      leadMove: sig.leadMove,
      closeDominance: sig.closeDominance,
      releaseFromExtreme: sig.releaseFromExtreme,
      lateMove: sig.lateMove,
      lateAgainst: sig.lateAgainst,
      retrace: sig.retrace,
      dirRatio: sig.dirRatio,
      lateDirRatio: sig.lateDirRatio,
      signalLogic: leadSign > 0 ? "PUT por dirección alcista mantenida/estancada" : "CALL por dirección bajista mantenida/estancada",
    },
  };
}

/* =========================
   Modo GIRO + APRENDIZAJE
   Usa como positivos tus 👍 de Trades y los botones “Es mi formación / Muy clara”.
   Usa como negativos los botones “No es”. La dirección se aprende por la próxima vela
   cuando exista; si no, cae a trade.side/direction.
========================= */
const RULES_GIRO_APRENDIZAJE = {
  minPositivePrototypes: 3,
  sampleCount: 28,
  topSimilarityMin: 56,
  avgTop3SimilarityMin: 52,
  negativeSimilarityMax: 74,
  bodyVsRangeMin: 0.045,
  leadMoveMin: 0.24,
  closeDominanceMin: 0.46,
  releaseFromExtremeMax: 0.66,
  lateAgainstMax: 0.52,
  retraceMax: 0.92,
  dirRatioMin: 0.24,
  minPoints: 5,
  minQualityGap: 4,
};

function getGiroAprendizajePrototypeEntries() {
  const out = [];
  const seen = new Set();
  const push = (entry, label, source) => {
    if (!entry || !Array.isArray(entry.ticks) || entry.ticks.length < 6) return;
    const key = String(entry.source_key || entry.journal_id || entry.practice_id || entry.id || getPracticeCandleKey(entry) || "");
    if (!key || seen.has(`${source}:${key}`)) return;
    seen.add(`${source}:${key}`);
    out.push({ ...entry, aprendizajeLabel: normalizeGiroAprendizajeLabel(label), aprendizajeSource: source });
  };

  for (const entry of tradesJournal || []) {
    if (!entry || entry.vote !== "like") continue;
    push(entry, "clear", "trades_like");
  }

  for (const ex of giroAprendizajeExamples || []) {
    const label = normalizeGiroAprendizajeLabel(ex?.label);
    if (label === "clear" || label === "target" || label === "avoid" || label === "doubt") {
      push(ex, label, "giro_aprendizaje");
    }
  }
  return out;
}
function getGiroAprendizajeLeadSignFromDirection(direction) {
  const d = normalizeTradeDirection(direction);
  if (d === "PUT") return 1;   // vela actual cargada arriba => giro PUT
  if (d === "CALL") return -1; // vela actual cargada abajo => giro CALL
  return 0;
}
function getGiroAprendizajePrototypes(evalMs, rules = RULES_GIRO_APRENDIZAJE) {
  const positives = [];
  const negatives = [];
  for (const entry of getGiroAprendizajePrototypeEntries()) {
    const label = normalizeGiroAprendizajeLabel(entry.aprendizajeLabel || entry.label);
    const learnedDirection = inferLearningDirectionFromOutcome(entry);
    const leadSign = getGiroAprendizajeLeadSignFromDirection(learnedDirection);
    if (!leadSign) continue;
    const sig = buildLikeMantenidoSignature(entry.ticks, leadSign, evalMs, rules.sampleCount);
    if (!sig) continue;
    const proto = {
      id: entry.source_key || entry.journal_id || entry.id || "",
      direction: learnedDirection,
      leadSign,
      label,
      symbol: entry.symbol || "",
      time: entry.time || "",
      sig,
    };
    if (label === "avoid") negatives.push(proto);
    else if (label === "clear" || label === "target") positives.push(proto);
  }
  return { positives, negatives };
}
function getGiroAprendizajePoints(sig, topSimilarity, avgTop3, rules = RULES_GIRO_APRENDIZAJE) {
  if (!sig) return 0;
  let pts = 0;
  if (sig.leadMove >= rules.leadMoveMin) pts += 1;
  if (sig.closeDominance >= rules.closeDominanceMin) pts += 1;
  if (sig.releaseFromExtreme <= rules.releaseFromExtremeMax) pts += 1;
  if (sig.lateAgainst <= rules.lateAgainstMax) pts += 1;
  if (sig.retrace <= rules.retraceMax && sig.dirRatio >= rules.dirRatioMin) pts += 1;
  if (topSimilarity >= rules.topSimilarityMin && avgTop3 >= rules.avgTop3SimilarityMin) pts += 1;
  return pts;
}
function buildAutoLearningConfirmations(side, points, evalMs, meta = {}) {
  const safeSide = normalizeSignalConfirmationSide(side);
  const n = Math.max(0, Math.min(8, Math.floor(Number(points || 0))));
  if (!safeSide || n <= 0) return [];
  const base = Math.max(0, Math.min(56000, Number(evalMs || EVAL_SEC * 1000)));
  return Array.from({ length: n }, (_, i) => ({
    side: safeSide,
    ms: Math.max(0, Math.min(56000, base + i * 250)),
    at: Date.now(),
    source: "GIRO_APRENDIZAJE",
    reason: meta.reason || "score_auto",
  }));
}
function passesGiroAprendizajeEssence(sig, rules = RULES_GIRO_APRENDIZAJE) {
  if (!sig) return false;
  if (sig.bodyVsRange < rules.bodyVsRangeMin && sig.leadMove < rules.leadMoveMin + 0.08) return false;
  if (sig.leadMove < rules.leadMoveMin) return false;
  if (sig.closeDominance < rules.closeDominanceMin) return false;
  if (sig.releaseFromExtreme > rules.releaseFromExtremeMax) return false;
  if (sig.lateAgainst > rules.lateAgainstMax) return false;
  if (sig.retrace > rules.retraceMax) return false;
  if (sig.dirRatio < rules.dirRatioMin) return false;
  return true;
}
function analyzeGiroAprendizajeCandidate(candidate, rules = RULES_GIRO_APRENDIZAJE) {
  const evalMs = EVAL_SEC * 1000;
  const { positives, negatives } = getGiroAprendizajePrototypes(evalMs, rules);
  if (positives.length < rules.minPositivePrototypes) return null;

  const leadSign = inferCandidateLikeLeadSign(candidate, evalMs);
  if (!leadSign) return null;

  const sig = buildLikeMantenidoSignature(candidate?.ticks || [], leadSign, evalMs, rules.sampleCount);
  if (!passesGiroAprendizajeEssence(sig, rules)) return null;

  const sameSidePositives = positives.filter((p) => p.leadSign === leadSign);
  const learningPool = sameSidePositives.length >= rules.minPositivePrototypes ? sameSidePositives : positives;
  const sims = learningPool.map((proto) => ({ proto, similarity: computeLikeMantenidoSimilarity(sig, proto.sig) })).sort((a, b) => b.similarity - a.similarity);
  if (!sims.length) return null;
  const top = sims[0];
  const top3 = sims.slice(0, 3);
  const avgTop3 = top3.reduce((acc, x) => acc + x.similarity, 0) / top3.length;

  const negSameSide = negatives.filter((p) => p.leadSign === leadSign);
  const negSims = negSameSide.map((proto) => computeLikeMantenidoSimilarity(sig, proto.sig)).sort((a, b) => b - a);
  const negativeTop = negSims[0] || 0;

  if (top.similarity < rules.topSimilarityMin) return null;
  if (avgTop3 < rules.avgTop3SimilarityMin) return null;
  if (negativeTop >= rules.negativeSimilarityMax && negativeTop > top.similarity - 3) return null;

  const points = getGiroAprendizajePoints(sig, top.similarity, avgTop3, rules);
  if (points < rules.minPoints) return null;

  const direction = leadSign > 0 ? "PUT" : "CALL";
  const quality = top.similarity * 0.72 + avgTop3 * 0.35 + points * 7 + Math.max(0, top.similarity - negativeTop) * 0.22;

  return {
    direction,
    quality,
    points,
    leadSign,
    giroAprendizajeScore: Math.round(quality),
    topSimilarity: top.similarity,
    avgTop3: Math.round(avgTop3),
    prototypeCount: positives.length,
    negativeTop,
    meta: {
      points,
      topSimilarity: top.similarity,
      avgTop3Similarity: Math.round(avgTop3),
      prototypeCount: positives.length,
      negativeTopSimilarity: Math.round(negativeTop),
      leadSign,
      signalLogic: leadSign > 0 ? "vela cargada arriba => giro PUT" : "vela cargada abajo => giro CALL",
      body: sig.body,
      bodyVsRange: sig.bodyVsRange,
      leadMove: sig.leadMove,
      closeDominance: sig.closeDominance,
      releaseFromExtreme: sig.releaseFromExtreme,
      lateAgainst: sig.lateAgainst,
      retrace: sig.retrace,
      dirRatio: sig.dirRatio,
      matched: top3.map((x) => ({ id: x.proto.id, symbol: x.proto.symbol, time: x.proto.time, direction: x.proto.direction, label: x.proto.label, similarity: x.similarity })),
    },
  };
}

function detectDebilidadPattern(candidate) {
  const call = analyzeDebilidadSide(candidate, 1, RULES_DEBILIDAD);
  const put = analyzeDebilidadSide(candidate, -1, RULES_DEBILIDAD);

  if (call && put) {
    return call.quality >= put.quality ? call : put;
  }
  return call || put || null;
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


  if (signalMode === MODE_LIKE_MANTENIDO) {
    const matches = [];

    for (const c of candidates) {
      const match = analyzeLikeMantenidoCandidate(c, RULES_LIKE_MANTENIDO);
      if (!match) continue;

      matches.push({
        ...c,
        direction: match.direction,
        quality: match.quality,
        likeMantenidoScore: match.likeScore,
        likeMantenidoAvgTop3: match.likeAvgTop3,
        likeMantenidoMeta: match.meta,
      });
    }

    if (!matches.length) return true;

    matches.sort((a, b) => b.quality - a.quality || b.likeMantenidoScore - a.likeMantenidoScore || b.likeMantenidoAvgTop3 - a.likeMantenidoAvgTop3);
    if (matches.length > 1 && matches[0].quality - matches[1].quality < RULES_LIKE_MANTENIDO.minQualityGap) return true;
    const bestMatch = matches[0];

    addSignal(minute, bestMatch.symbol, bestMatch.direction, bestMatch.ticks, {
      likeMantenidoScore: bestMatch.likeMantenidoScore,
      likeMantenidoAvgTop3: bestMatch.likeMantenidoAvgTop3,
      likeMantenido: bestMatch.likeMantenidoMeta,
    });
    return true;
  }

  if (signalMode === MODE_GIRO_APRENDIZAJE) {
    const matches = [];

    for (const c of candidates) {
      const match = analyzeGiroAprendizajeCandidate(c, RULES_GIRO_APRENDIZAJE);
      if (!match) continue;

      matches.push({
        ...c,
        direction: match.direction,
        quality: match.quality,
        giroAprendizajeScore: match.giroAprendizajeScore,
        giroAprendizajePoints: match.points,
        giroAprendizajeMeta: match.meta,
      });
    }

    if (!matches.length) return true;

    matches.sort((a, b) => b.quality - a.quality || b.giroAprendizajePoints - a.giroAprendizajePoints || b.giroAprendizajeScore - a.giroAprendizajeScore);
    if (matches.length > 1 && matches[0].quality - matches[1].quality < RULES_GIRO_APRENDIZAJE.minQualityGap) return true;
    const bestMatch = matches[0];

    addSignal(minute, bestMatch.symbol, bestMatch.direction, bestMatch.ticks, {
      giroAprendizajeScore: bestMatch.giroAprendizajeScore,
      giroAprendizajePoints: bestMatch.giroAprendizajePoints,
      giroAprendizaje: bestMatch.giroAprendizajeMeta,
      // IMPORTANTE: este score automático solo detecta que la formación se parece
      // a tus ejemplos. NO suma puntos de COMPRA/VENTA.
      // Los puntos de COMPRA/VENTA siguen siendo manuales con los botones + COMPRA / + VENTA.
      signalConfirmations: [],
    });
    return true;
  }

  if (signalMode === MODE_FUERZA_DEBILIDAD_CLARA) {
    const matches = [];

    for (const c of candidates) {
      const match = detectFuerzaDebilidadClaraPattern(c);
      if (!match) continue;

      matches.push({
        ...c,
        direction: match.direction,
        quality: match.quality,
        fuerzaDebilidadScore: match.quality,
        fuerzaDebilidadMeta: {
          range: match.range,
          rangeVsVol: match.rangeVsVol,
          dominanceRatio: match.dominanceRatio,
          dominantSum: match.dominantSum,
          oppositeSum: match.oppositeSum,
          dominantLargest: match.dominantLargest,
          oppositeLargest: match.oppositeLargest,
          weakResponseRatio: match.weakResponseRatio,
          breakCount: match.breakCount,
          bigDominantLegs: match.bigDominantLegs,
          closeDominance: match.closeDominance,
          wholeDirRatio: match.wholeDirRatio,
          weakIrregularity: match.weakIrregularity,
          earlyDominance: match.earlyDominance,
        },
      });
    }

    if (!matches.length) return true;

    matches.sort((a, b) => b.quality - a.quality || b.score - a.score);
    const bestMatch = matches[0];

    addSignal(minute, bestMatch.symbol, bestMatch.direction, bestMatch.ticks, {
      fuerzaDebilidadScore: bestMatch.fuerzaDebilidadScore,
      fuerzaDebilidad: bestMatch.fuerzaDebilidadMeta,
    });
    return true;
  }

  if (signalMode === MODE_NORMAL_DEBILIDAD) {
    const matches = [];

    for (const c of candidates) {
      // FLEX: NORMAL ya no exige una continuación perfecta.
      // Solo pide que haya estructura/avance real dentro de la vela;
      // la dirección final la decide la lectura de Debilidad/Fortaleza.
      if (!passesNormalDebilidadStructure(c, RULES_NORMAL_DEBILIDAD)) continue;

      const normalStructureDirection = c.move > 0 ? "CALL" : "PUT";
      const debilidadMatch = detectDebilidadPattern(c);

      // Este modo NO dispara con NORMAL puro: NORMAL solo valida estructura/avance.
      // La dirección final la decide DEBILIDAD, porque buscamos agotamiento de un grupo
      // y aprovechamiento del grupo contrario.
      if (!debilidadMatch) continue;
      if (debilidadMatch.quality < RULES_NORMAL_DEBILIDAD.minAlignedDebilidadScore) continue;

      matches.push({
        ...c,
        direction: debilidadMatch.direction,
        quality: debilidadMatch.quality + Math.min(35, c.score * 3),
        normalScore: c.score,
        normalStructureDirection,
        debilidadScore: debilidadMatch.quality,
        debilidadMeta: {
          weakLead: debilidadMatch.weakLead,
          recovery: debilidadMatch.recovery,
          lateWinnerRatio: debilidadMatch.lateWinnerRatio,
          lateWinnerMove: debilidadMatch.lateWinnerMove,
          range: debilidadMatch.range,
          rangeVsVol: debilidadMatch.rangeVsVol,
          weakReduction: debilidadMatch.weakReduction,
          weakIrregularity: debilidadMatch.weakIrregularity,
          lateControl: debilidadMatch.lateControl,
          normalStructureDirection,
          debilidadDirection: debilidadMatch.direction,
          normalScore: c.score,
        },
      });
    }

    if (!matches.length) return true;

    matches.sort((a, b) => b.quality - a.quality || b.debilidadScore - a.debilidadScore || b.normalScore - a.normalScore);
    const bestMatch = matches[0];

    addSignal(minute, bestMatch.symbol, bestMatch.direction, bestMatch.ticks, {
      normalScore: bestMatch.normalScore,
      debilidadScore: bestMatch.debilidadScore,
      debilidad: bestMatch.debilidadMeta,
    });
    return true;
  }

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
function addSignal(minute, symbol, direction, ticks, extra = {}) {
  if (areSignalsPaused()) return;
  const modeLabel = normalizeSignalMode(signalMode);
  const modeId = modeLabel.replace(/\s+/g, "_").replace(/[^A-Z0-9_]/gi, "");
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
    signalAutoEntry: null,
    ...(extra && typeof extra === "object" ? extra : {}),
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
    setStatus("Conectando…");
    ws = new WebSocket(WS_URL);
  } catch {
    setStatus("Error WS – no se pudo iniciar");
    return;
  }

  ws.onopen = async () => {
    try {
      resetAuthState();
    } catch {}

    setStatus("Conectado – Suscribiendo…");
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
            handleC100ContractClosed(cid, isWin, profit);
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
        setStatus(`⚠️ WS error: ${data.error.message || "unknown"}`);
      }

      if (data.tick) onTick(data.tick);
    } catch (err) {
      setStatus(`❌ Parse WS: ${err?.message || err}`);
    }
  };

  ws.onerror = () => {
    setStatus("Error WS – reconectando…");
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
    setStatus(`Desconectado (${code}) ${reason ? "– " + reason : ""} – reconectando…`);

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
    if (!hasPracticeMinimumConfirmations("CALL")) {
      const faltan = getPracticeMissingConfirmations("CALL");
      updatePracticeResult(`🧠 Faltan ${faltan} confirmación${faltan === 1 ? "" : "es"} neta${faltan === 1 ? "" : "s"} para COMPRA. ${getPracticeConfirmationStatusText()}`, "is-pass");
      toast("Primero marcá 4 confirmaciones netas para COMPRA", 1500);
      return;
    }
    practiceRound.answer = "CALL";
    setPracticeDecisionState(true, "CALL");
    refreshCurrentPracticeExportSavedSnapshot();
    updatePracticeResult("🟢 COMPRA elegida. Esperando cierre de la vela…", "is-pass");
  };
}
if (practicePutBtn) {
  practicePutBtn.onclick = () => {
    if (!practiceRound || practiceRound.finished || practiceRound.answer) return;
    if (!hasPracticeMinimumConfirmations("PUT")) {
      const faltan = getPracticeMissingConfirmations("PUT");
      updatePracticeResult(`🧠 Faltan ${faltan} confirmación${faltan === 1 ? "" : "es"} neta${faltan === 1 ? "" : "s"} para VENTA. ${getPracticeConfirmationStatusText()}`, "is-pass");
      toast("Primero marcá 4 confirmaciones netas para VENTA", 1500);
      return;
    }
    practiceRound.answer = "PUT";
    setPracticeDecisionState(true, "PUT");
    refreshCurrentPracticeExportSavedSnapshot();
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
    refreshCurrentPracticeExportSavedSnapshot();
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
loadC100State();
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
ensureC100Panel();
updateC100PanelUI();
initWakeButton();
initTokenAndStakeUI();

ensureResetCacheButton();
ensureSplitClearButtons();

applyModalTradeButtonsLayout();
updateModalCandleStatusUI();
updateDisciplineLockUI(false);

seedTradesJournalFromHistory();

initTabs();
ensureInlineClearButtons();
ensurePracticeFilterButton();
applyPracticeFilterButtonUI();
ensurePracticeExportSaveButton();
updatePracticeExportSaveButtonUI();
updateExportTradesButtonUI();

connect();
