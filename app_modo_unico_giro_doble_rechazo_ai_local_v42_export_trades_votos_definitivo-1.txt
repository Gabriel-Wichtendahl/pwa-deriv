// app.js — MODO ÚNICO: GIRO SIN NIVEL (ATAQUE + RECHAZO + RETEST DÉBIL) + IA LOCAL + RECORRIDO MODERADO + IC2 + disciplina visible + auto57 demo/real
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
const SYMBOLS = ["R_10", "R_25", "R_50", "R_75", "R_100"];

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
   Capturas de estudio
========================= */
const STUDY_CAPTURE_DB_NAME = "derivStudyCaptures_v1";
const STUDY_CAPTURE_STORE_NAME = "captures";
const STUDY_CAPTURE_VERSION = 1;

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
   Interés Compuesto 2 niveles
   - Reemplaza la antigua gestión C100
   - Nivel 1: stake normal configurado
   - Nivel 2: stake + ganancia real del nivel 1
   - Después del nivel 2, gane o pierda, vuelve al nivel 1
========================= */
const C100_STATE_KEY = "interesCompuesto2_state_v1";
const C100_PAYOUT_REQUIRED = 95; // fallback para estimar nivel 2 si Deriv no informa ganancia
const C100_MIN_PAYOUT = 0; // IC2 no bloquea por payout mínimo
const C100_CAPITAL_BASE = 0;
const C100_MAX_LEVEL = 2;
const C100_MODE_LABEL = "IC2";
const C100_LEVELS = [
  { level: 1, base: DEFAULT_STAKE, compound: DEFAULT_STAKE },
  { level: 2, base: DEFAULT_STAKE, compound: DEFAULT_STAKE * 1.95 },
];

const EXECUTION_MODE_KEY = "executionMode_v1";
const EXECUTION_MODE_RISE_FALL = "RISE_FALL";
const EXECUTION_MODE_HIGHLOW_AUTO = "HIGHLOW_FIXED_BARRIER_BY_SYMBOL";
const AUTO_TARGET_RETURN_PCT = 120; // legado: ya no se usa para buscar High/Low fijo.
const AUTO_PRECALC_REFRESH_MS = 45000;
const AUTO_PRECALC_STALE_MS = 180000;
const HIGHLOW_BARRIER_CACHE_KEY = "highLowBarrierCache_v4_fixed_by_symbol";
const HIGHLOW_BARRIER_CACHE_TTL_MS = 10 * 60 * 1000;
const HIGHLOW_PROPOSAL_COOLDOWN_KEY = "highLowProposalCooldownUntil_v1";
const HIGHLOW_PROPOSAL_LIMIT_COOLDOWN_MS = 90 * 1000;
const HIGHLOW_DISCOVERY_ATTEMPT_KEY = "highLowDiscoveryAttempt_v1";
const HIGHLOW_DISCOVERY_COOLDOWN_MS = 2 * 60 * 1000;
const HIGHLOW_DISCOVERY_CANDIDATES_PER_ATTEMPT = 5;
// Límite de pago total para High/Low: payout potencial / stake.
// Ejemplo: stake $5 => payout máximo aprox. $7.50.
// Evita barreras demasiado lejanas tipo $5 -> $55.
const HIGHLOW_MAX_PAYOUT_TOTAL_PCT = 150;
const HIGHLOW_MIN_PAYOUT_TOTAL_PCT = 100;
// Barreras relativas fijas por símbolo/par.
// IMPORTANTE: son distancias relativas, no precios absolutos.
// COMPRA/HIGHER => +valor. VENTA/LOWER => -valor.
const HIGHLOW_FIXED_RELATIVE_BARRIERS = {
  R_10: "0.192",
  R_25: "0.311",
  R_50: "0.0162",
  R_75: "10.5950",
  R_100: "0.15",
};
// Búsqueda por presets de "pips" relativos (no por rango reciente de la vela),
// porque en práctica los niveles útiles suelen estar mucho más lejos que el micro-rango del minuto.
const AUTO_PRECALC_COARSE_PIPS = [60, 80, 100, 120, 150, 180, 200, 220, 250, 285, 320, 350, 400, 450, 500, 650, 800, 1000, 1200];
const AUTO_PRECALC_FAST_PIPS = [80, 120, 180, 250, 350];
const AUTO_PRECALC_FINE_FACTORS = [0.96, 1.0, 1.04];
const AUTO_FAST_PROPOSAL_TIMEOUT_MS = 2200;
const AUTO_FULL_PROPOSAL_TIMEOUT_MS = 4200;

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
let disciplineBannerEl = null; // banner visible para bloqueo/contador DEMO

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
   Capturas de estudio persistence + render
========================= */
let studyCaptureDbPromise = null;
function openStudyCaptureDB() {
  if (!("indexedDB" in window)) return Promise.resolve(null);
  if (studyCaptureDbPromise) return studyCaptureDbPromise;
  studyCaptureDbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(STUDY_CAPTURE_DB_NAME, STUDY_CAPTURE_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STUDY_CAPTURE_STORE_NAME)) db.createObjectStore(STUDY_CAPTURE_STORE_NAME, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("No pude abrir IndexedDB"));
  }).catch((err) => {
    studyCaptureDbPromise = null;
    throw err;
  });
  return studyCaptureDbPromise;
}
async function putStudyCapture(record) {
  const db = await openStudyCaptureDB();
  if (!db || !record?.id) return false;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STUDY_CAPTURE_STORE_NAME, "readwrite");
    tx.objectStore(STUDY_CAPTURE_STORE_NAME).put(record);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error || new Error("No pude guardar captura"));
  });
}
async function getStudyCapture(id) {
  const db = await openStudyCaptureDB();
  if (!db || !id) return null;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STUDY_CAPTURE_STORE_NAME, "readonly");
    const req = tx.objectStore(STUDY_CAPTURE_STORE_NAME).get(String(id));
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error || new Error("No pude leer captura"));
  });
}
function getStudyCaptureIdFromItem(item) {
  if (!item) return "";
  const jid = item.journal_id || makeJournalIdFromSignal(item);
  return jid ? `CAP::${String(jid)}`.slice(0, 230) : "";
}
function getStudyCaptureTradeResult(item) {
  const b = String(item?.trade?.badge || "").toUpperCase();
  return b === "ITM" || b === "OTM" ? b : "";
}
function isStudyCaptureReadyItem(item) {
  return !!getStudyCaptureTradeResult(item) && Array.isArray(item?.ticks) && item.ticks.length >= 2;
}
function getStudyCaptureLevelMeta(item) {
  const meta = item?.giroPolaridad || item?.giroNivelMeta || item?.giroDobleRechazo || item?.levelMeta || null;
  if (meta && typeof meta === "object") return meta;
  return null;
}
async function getStudyCaptureNextTicks(item) {
  if (!item?.symbol || !Number.isFinite(Number(item.minute))) return [];
  try {
    const next = await fetchFullMinuteTicks(item.symbol, Number(item.minute) + 1);
    return Array.isArray(next) ? next.map((p) => ({ ms: Number(p.ms) + 60000, quote: Number(p.quote) })) : [];
  } catch {}
  return [];
}
function normalizeStudyTicks(item, nextTicks = []) {
  const sig = (Array.isArray(item?.ticks) ? item.ticks : [])
    .filter((p) => Number.isFinite(Number(p.ms)) && Number.isFinite(Number(p.quote)))
    .map((p) => ({ ms: Math.max(0, Math.min(60000, Number(p.ms))), quote: Number(p.quote) }));
  const nxt = (Array.isArray(nextTicks) ? nextTicks : [])
    .filter((p) => Number.isFinite(Number(p.ms)) && Number.isFinite(Number(p.quote)))
    .map((p) => ({ ms: Math.max(60000, Math.min(120000, Number(p.ms))), quote: Number(p.quote) }));
  return sig.concat(nxt).sort((a, b) => a.ms - b.ms);
}
function studyRoundRect(ctx, x, y, w, h, r = 12, fill = true, stroke = false, strokeColor = "rgba(255,255,255,.18)") {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  if (fill) ctx.fill();
  if (stroke) { ctx.strokeStyle = strokeColor; ctx.stroke(); }
}
function studyHexToRgba(hex, a = 1) {
  const h = String(hex || "#ffffff").replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return `rgba(${r},${g},${b},${a})`;
}
function studyDrawPill(ctx, x, y, w, h, text, color, textColor = "#f8fbff") {
  ctx.fillStyle = color.startsWith("#") ? studyHexToRgba(color, .18) : color;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  studyRoundRect(ctx, x, y, w, h, h / 2, true, true, color);
  ctx.fillStyle = textColor;
  ctx.font = "700 14px system-ui, -apple-system, Segoe UI, sans-serif";
  const tw = ctx.measureText(text).width;
  ctx.fillText(text, x + (w - tw) / 2, y + h / 2 + 5);
}
function drawStudyCaptureToCanvas(canvas, item, nextTicks = []) {
  const ctx = canvas.getContext("2d");
  const W = canvas.width;
  const H = canvas.height;
  const dir = String(item?.direction || "PUT").toUpperCase() === "CALL" ? "CALL" : "PUT";
  const result = getStudyCaptureTradeResult(item) || "PEND";
  const isCall = dir === "CALL";
  const isItm = result === "ITM";
  const isOtm = result === "OTM";
  const tradeColor = isItm ? "#22c55e" : isOtm ? "#ef4444" : "#f59e0b";
  const tradeSoft = isItm ? "rgba(34,197,94,.13)" : isOtm ? "rgba(239,68,68,.13)" : "rgba(245,158,11,.16)";
  const tradeGlow = isItm ? "rgba(34,197,94,.32)" : isOtm ? "rgba(239,68,68,.32)" : "rgba(245,158,11,.32)";
  const allTicks = normalizeStudyTicks(item, nextTicks);
  const signalTicks = allTicks.filter((p) => p.ms <= 60000);
  const meta = getStudyCaptureLevelMeta(item);

  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#0f172a");
  bg.addColorStop(1, "#111827");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = "rgba(13,22,42,.92)";
  studyRoundRect(ctx, 24, 18, W - 48, 72, 22, true, false);
  ctx.fillStyle = "#e5edf9";
  ctx.font = "800 25px system-ui, -apple-system, Segoe UI, sans-serif";
  ctx.fillText("Captura de estudio PWA", 52, 48);
  ctx.font = "600 14px system-ui, -apple-system, Segoe UI, sans-serif";
  ctx.fillStyle = "rgba(220,235,255,.76)";
  ctx.fillText(`${item?.symbol || "—"} · ${dir === "CALL" ? "COMPRA / CALL" : "VENTA / PUT"} · Entrada 57s · ${item?.time || ""}`, 52, 72);
  studyDrawPill(ctx, W - 255, 32, 205, 38, `Resultado: ${result}`, tradeColor);

  const x0 = 54, y0 = 116, x1 = W - 54, y1 = H - 118;
  studyRoundRect(ctx, x0, y0, x1 - x0, y1 - y0, 24, false, true, "rgba(75,95,135,.65)");
  ctx.save();
  ctx.beginPath();
  studyRoundRect(ctx, x0, y0, x1 - x0, y1 - y0, 24, false, false);
  ctx.clip();
  ctx.fillStyle = "#151a24";
  ctx.fillRect(x0, y0, x1 - x0, y1 - y0);

  const chartPad = { l: 54, r: 42, t: 34, b: 44 };
  const cx0 = x0 + chartPad.l, cy0 = y0 + chartPad.t, cx1 = x1 - chartPad.r, cy1 = y1 - chartPad.b;
  const midX = cx0 + ((cx1 - cx0) * 60) / 120;

  for (let i = 1; i <= 5; i++) {
    const y = cy0 + ((cy1 - cy0) * i) / 6;
    ctx.strokeStyle = "rgba(148,163,184,.12)";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx0, y); ctx.lineTo(cx1, y); ctx.stroke();
  }
  for (let sec = 0; sec <= 120; sec += 15) {
    const x = cx0 + ((cx1 - cx0) * sec) / 120;
    ctx.strokeStyle = sec === 60 ? "rgba(148,163,184,.28)" : "rgba(148,163,184,.10)";
    ctx.lineWidth = sec === 60 ? 2 : 1;
    ctx.beginPath(); ctx.moveTo(x, cy0); ctx.lineTo(x, cy1); ctx.stroke();
    let labelSec = sec;
    if (sec > 60) labelSec = sec - 60;
    if (sec === 60) labelSec = 0;
    ctx.fillStyle = "rgba(203,213,225,.68)";
    ctx.font = "12px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText(`${labelSec}s`, x - 10, cy1 + 25);
  }

  if (allTicks.length >= 2) {
    const qs = allTicks.map((p) => p.quote);
    let min = Math.min(...qs), max = Math.max(...qs);
    let range = max - min;
    if (!Number.isFinite(range) || range < 1e-9) range = 1;
    min -= range * 0.08; max += range * 0.08;
    const xOf = (ms) => cx0 + ((cx1 - cx0) * ms) / 120000;
    const yOf = (q) => cy1 - ((q - min) / (max - min)) * (cy1 - cy0);

    // Etiquetas de bloques sin superposición
    studyDrawPill(ctx, cx0 + 8, cy0 + 6, 118, 26, "Señal 0-60s", "rgba(148,163,184,.28)", "#dbe7ff");
    studyDrawPill(ctx, midX + 12, cy0 + 6, 142, 26, "Resultado 0-60s", "rgba(148,163,184,.28)", "#dbe7ff");

    const level = Number(meta?.level);
    if (Number.isFinite(level)) {
      const ly = yOf(level);
      const levelColor = isCall ? "rgba(34,197,94,.58)" : "rgba(244,63,94,.58)";
      ctx.strokeStyle = levelColor;
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(cx0, ly); ctx.lineTo(cx1, ly); ctx.stroke();
      ctx.fillStyle = isCall ? "rgba(34,197,94,.10)" : "rgba(244,63,94,.10)";
      studyRoundRect(ctx, cx0 + 10, ly - 18, 200, 32, 12, true, false);
      ctx.fillStyle = "#f8fafc";
      ctx.font = "800 13px system-ui, -apple-system, Segoe UI, sans-serif";
      ctx.fillText(isCall ? "NIVEL: SOPORTE" : "NIVEL: RESISTENCIA", cx0 + 20, ly + 3);
    }

    ctx.beginPath();
    allTicks.forEach((p, i) => {
      const x = xOf(p.ms), y = yOf(p.quote);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.lineTo(xOf(allTicks[allTicks.length - 1].ms), cy1);
    ctx.lineTo(xOf(allTicks[0].ms), cy1);
    ctx.closePath();
    ctx.fillStyle = "rgba(229,231,235,.15)";
    ctx.fill();

    ctx.strokeStyle = "#f1f5f9";
    ctx.lineWidth = 3;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    allTicks.forEach((p, i) => {
      const x = xOf(p.ms), y = yOf(p.quote);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();

    const entryMs = Number(item?.trade?.entry_ms || item?.signalAutoEntry?.ms || 57000);
    const safeEntryMs = Math.min(60000, Math.max(0, entryMs));
    const entryQuote = Number(getPriceAtMs(signalTicks.length ? signalTicks : item.ticks, safeEntryMs));
    const ex = xOf(safeEntryMs);
    const ey = Number.isFinite(entryQuote) ? yOf(entryQuote) : cy0 + (cy1 - cy0) / 2;

    const closeTick = allTicks[allTicks.length - 1] || { ms: 120000, quote: entryQuote };
    const closeQuote = Number(closeTick.quote);
    const resultX = cx1 - 58;
    const closeY = Number.isFinite(closeQuote) ? yOf(closeQuote) : ey;

    // Punto de entrada exacto
    ctx.shadowColor = tradeGlow;
    ctx.shadowBlur = 8;
    ctx.strokeStyle = tradeColor;
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(ex, ey, 15, 0, Math.PI * 2); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#0b1220";
    ctx.beginPath(); ctx.arc(ex, ey, 11, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = tradeColor;
    ctx.beginPath(); ctx.arc(ex, ey, 6, 0, Math.PI * 2); ctx.fill();

    // Pin más limpio y chico
    const pinX = ex;
    const pinY = ey - 60;
    ctx.save();
    ctx.translate(pinX, pinY);
    ctx.shadowColor = tradeGlow;
    ctx.shadowBlur = 8;
    ctx.fillStyle = tradeColor;
    ctx.beginPath();
    ctx.moveTo(0, 34);
    ctx.bezierCurveTo(-16, 14, -14, -18, 0, -18);
    ctx.bezierCurveTo(14, -18, 16, 14, 0, 34);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#0b1220";
    ctx.beginPath(); ctx.arc(0, -2, 5.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    const entryTag = isItm ? "T 57s" : isOtm ? "TM 57s" : `${dir} 57s`;
    studyDrawPill(ctx, Math.max(cx0 + 8, Math.min(ex - 18, cx1 - 108)), Math.max(cy0 + 12, pinY - 4), 96, 32, entryTag, tradeColor, "#07120d");

    // Línea horizontal de operación menos gruesa
    ctx.shadowColor = tradeGlow;
    ctx.shadowBlur = 6;
    ctx.strokeStyle = tradeColor;
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(resultX, ey); ctx.stroke();
    ctx.shadowBlur = 0;

    // Bandera más adentro
    const mastX = resultX;
    const flagW = 54, flagH = 32;
    const mastTopY = Math.max(cy0 + 40, ey - 62);
    ctx.strokeStyle = tradeColor;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(mastX, ey); ctx.lineTo(mastX, mastTopY); ctx.stroke();
    ctx.fillStyle = tradeSoft;
    ctx.strokeStyle = tradeColor;
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.rect(mastX, mastTopY, flagW, flagH); ctx.fill(); ctx.stroke();
    const cols = 4, rows = 2;
    const cw = flagW / cols, ch = flagH / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if ((r + c) % 2 === 0) {
          ctx.fillStyle = tradeColor;
          ctx.fillRect(mastX + c * cw, mastTopY + r * ch, cw, ch);
        }
      }
    }

    // Línea punteada y cierre
    ctx.strokeStyle = tradeColor;
    ctx.lineWidth = 3.5;
    ctx.setLineDash([9, 7]);
    ctx.beginPath(); ctx.moveTo(resultX, ey); ctx.lineTo(resultX, closeY); ctx.stroke();
    ctx.setLineDash([]);

    ctx.shadowColor = tradeGlow;
    ctx.shadowBlur = 7;
    ctx.fillStyle = tradeColor;
    ctx.beginPath(); ctx.arc(resultX, closeY, 16, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;

    // Badge de resultado más cerca del cierre
    const pillW = result === "PEND" ? 108 : 92;
    const pillX = Math.max(cx0 + 8, Math.min(resultX - 46, cx1 - pillW - 8));
    const pillY = Math.max(cy0 + 38, closeY - 54);
    studyDrawPill(ctx, pillX, pillY, pillW, 32, result, tradeColor, "#07120d");
  }

  ctx.restore();

  ctx.fillStyle = "rgba(15,23,42,.92)";
  studyRoundRect(ctx, 54, H - 92, W - 108, 58, 18, true, true, "rgba(75,95,135,.5)");
  ctx.fillStyle = "#eaf2ff";
  ctx.font = "800 15px system-ui, -apple-system, Segoe UI, sans-serif";
  ctx.fillText("Resumen:", 82, H - 58);
  ctx.font = "600 14px system-ui, -apple-system, Segoe UI, sans-serif";
  ctx.fillStyle = "rgba(220,235,255,.84)";
  const actionLabel = isItm ? "T" : isOtm ? "TM" : dir;
  const note = `${isCall ? "Soporte" : "Resistencia"} respetad${isCall ? "o" : "a"} · entrada ${actionLabel} 57s · pin, línea, cierre y bandera en ${isItm ? "verde" : isOtm ? "rojo" : "amarillo"}`;
  ctx.fillText(note, 170, H - 58);
}

async function generateAndSaveStudyCaptureForSignal(item, { force = false } = {}) {
  if (!isStudyCaptureReadyItem(item)) return null;
  const captureId = getStudyCaptureIdFromItem(item);
  if (!captureId) return null;
  if (!force) {
    try {
      const existing = await getStudyCapture(captureId);
      if (existing?.dataUrl) return existing;
    } catch {}
  }
  const nextTicks = await getStudyCaptureNextTicks(item);
  const canvas = document.createElement("canvas");
  canvas.width = 1400;
  canvas.height = 820;
  drawStudyCaptureToCanvas(canvas, item, nextTicks);
  const dataUrl = canvas.toDataURL("image/png", 0.92);
  const record = {
    id: captureId,
    journal_id: makeJournalIdFromSignal(item),
    signal_id: String(item.id || ""),
    symbol: String(item.symbol || ""),
    direction: String(item.direction || ""),
    result: getStudyCaptureTradeResult(item),
    created_at: Date.now(),
    dataUrl,
  };
  await putStudyCapture(record);
  item.trade ||= {};
  item.trade.study_capture_id = captureId;
  try { saveHistory(history); } catch {}
  try {
    const jid = makeJournalIdFromSignal(item);
    const idx = tradesJournal.findIndex((x) => x && x.journal_id === jid);
    if (idx >= 0) {
      tradesJournal[idx].study_capture_id = captureId;
      tradesJournal[idx].trade ||= {};
      tradesJournal[idx].trade.study_capture_id = captureId;
      saveTradesJournal(tradesJournal);
    }
  } catch {}
  return record;
}
function ensureStudyCaptureModal() {
  let modal = document.getElementById("studyCaptureModal");
  if (modal) return modal;
  modal = document.createElement("div");
  modal.id = "studyCaptureModal";
  modal.className = "hidden";
  modal.style.position = "fixed";
  modal.style.inset = "0";
  modal.style.zIndex = "9999";
  modal.style.background = "rgba(0,0,0,.76)";
  modal.style.backdropFilter = "blur(8px)";
  modal.style.display = "none";
  modal.style.alignItems = "center";
  modal.style.justifyContent = "center";
  modal.style.padding = "14px";
  modal.innerHTML = `
    <div style="width:min(980px,96vw);max-height:94vh;overflow:auto;border-radius:22px;background:#07101d;border:1px solid rgba(255,255,255,.14);box-shadow:0 24px 80px rgba(0,0,0,.55);padding:12px;">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px;">
        <div style="font-weight:950;color:#eaf2ff;font-size:16px;">📸 Captura de estudio</div>
        <button id="studyCaptureCloseBtn" class="btn btnGhost" type="button" style="min-width:44px;">✕</button>
      </div>
      <img id="studyCaptureImg" alt="Captura de estudio" style="display:block;width:100%;height:auto;border-radius:16px;border:1px solid rgba(255,255,255,.12);background:#020617;"/>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px;">
        <button id="studyCaptureDownloadBtn" class="btn btnGhost" type="button">⬇️ Descargar PNG</button>
        <button id="studyCaptureShareBtn" class="btn btnGhost" type="button">📤 Compartir</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.querySelector("#studyCaptureCloseBtn").onclick = () => closeStudyCaptureModal();
  modal.addEventListener("click", (e) => { if (e.target === modal) closeStudyCaptureModal(); });
  return modal;
}
function closeStudyCaptureModal() {
  const modal = document.getElementById("studyCaptureModal");
  if (!modal) return;
  modal.style.display = "none";
  modal.classList.add("hidden");
}
function dataURLToBlob(dataURL) {
  const [meta, data] = String(dataURL || "").split(",");
  const mime = /data:([^;]+)/.exec(meta || "")?.[1] || "image/png";
  const bin = atob(data || "");
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}
async function showStudyCaptureForItem(item) {
  if (!item) return;
  const modal = ensureStudyCaptureModal();
  const img = modal.querySelector("#studyCaptureImg");
  const dl = modal.querySelector("#studyCaptureDownloadBtn");
  const sh = modal.querySelector("#studyCaptureShareBtn");
  modal.style.display = "flex";
  modal.classList.remove("hidden");
  img.removeAttribute("src");
  img.alt = "Generando captura…";
  try {
    let rec = await getStudyCapture(item?.trade?.study_capture_id || item?.study_capture_id || getStudyCaptureIdFromItem(item));
    if (!rec?.dataUrl) rec = await generateAndSaveStudyCaptureForSignal(item, { force: true });
    if (!rec?.dataUrl) { toast("⚠️ No pude generar la captura todavía", 1800); return; }
    img.src = rec.dataUrl;
    img.alt = `Captura ${item.symbol || ""} ${item.direction || ""}`;
    const filename = `captura-estudio-${item.symbol || "signal"}-${String(item.time || "").replace(/[^0-9A-Za-z]+/g, "-")}-${getStudyCaptureTradeResult(item) || "trade"}.png`;
    dl.onclick = () => downloadTextFile(filename, rec.dataUrl, "image/png");
    sh.onclick = async () => {
      try {
        const blob = dataURLToBlob(rec.dataUrl);
        const file = new File([blob], filename, { type: "image/png" });
        if (navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) {
          await navigator.share({ files: [file], title: "Captura de estudio PWA", text: `${item.symbol || ""} ${item.direction || ""} ${getStudyCaptureTradeResult(item)}` });
        } else {
          downloadTextFile(filename, rec.dataUrl, "image/png");
          toast("📥 Descargada. Compartila desde Descargas/Galería.", 1800);
        }
      } catch {
        downloadTextFile(filename, rec.dataUrl, "image/png");
      }
    };
  } catch {
    toast("⚠️ Error generando captura", 1800);
  }
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
const MODE_GIRO_NIVEL = "GIRO DOBLE RECHAZO";
const MODE_GIRO_POLARIDAD = "GIRO POLARIDAD";
const ANALYSIS_MODE_KEY = "analysisMode_v1";

const GIRO_LOGIC_VERSION = "GIRO_RAMA_REEMPLAZO_20260421";
const GIRO_FLEX_LOGIC_VERSION = "GIRO_FLEX_RAMA_REEMPLAZO_20260421";
const NORMAL_DEBILIDAD_LOGIC_VERSION = "NORMAL_DEBILIDAD_FUERZA_CLARA_20260427";
const FUERZA_DEBILIDAD_CLARA_LOGIC_VERSION = "FUERZA_DEBILIDAD_CLARA_IMPULSOS_RETROCESOS_20260501";
const LIKE_MANTENIDO_LOGIC_VERSION = "LIKE_MANTENIDO_17_TRADES_DIRECCION_ESTANCADA_20260501";
const GIRO_APRENDIZAJE_LOGIC_VERSION = "GIRO_APRENDIZAJE_42_LIKES_ESENCIA_20260501";
const GIRO_NIVEL_LOGIC_VERSION = "GIRO_DOBLE_RECHAZO_NIVEL_MODO_UNICO_20260502";
const GIRO_POLARIDAD_LOGIC_VERSION = "GIRO_POLARIDAD_REAL_RUPTURA_RETEST_20260501";
const GIRO_POLARIDAD_CANDLES_KEY = "giroPolarityCandles_v1";
const GIRO_POLARIDAD_MAX_CANDLES = 140;
const GIRO_APRENDIZAJE_STORE_KEY = "giroAprendizajeExamples_v1";
const GIRO_APRENDIZAJE_MAX_EXAMPLES = 600;


function normalizeSignalMode(mode) {
  // MODO ÚNICO: cualquier modo viejo guardado se fuerza a GIRO DOBLE RECHAZO.
  // Esto evita mezclar NORMAL, GIRO FLEX, LIKE MANTENIDO, POLARIDAD REAL, etc.
  return MODE_GIRO_NIVEL;
}
function isGiroFamilyMode(mode) {
  return true;
}
function getModeVersion(mode) {
  return GIRO_NIVEL_LOGIC_VERSION;
}
function loadAnalysisMode() {
  return MODE_GIRO_NIVEL;
}
function saveAnalysisMode(mode) {
  try {
    localStorage.setItem(ANALYSIS_MODE_KEY, MODE_GIRO_NIVEL);
    saveBool("giroMode", true);
    saveBool("strongMode", false);
  } catch {}
}
function getModeBtnLabel(mode) {
  return "🧠 GIRO FUERZA + IA";
}
function nextSignalMode(mode) {
  return MODE_GIRO_NIVEL;
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
function getGiroAprendizajeLabelWeight(label, source = "") {
  const l = normalizeGiroAprendizajeLabel(label);
  const src = String(source || "").toLowerCase();

  // Pesos de la IA local:
  // ⭐ Muy clara pesa fuerte porque representa la esencia que más querés repetir.
  // ✅ Es mi formación pesa positivo normal.
  // ❌ No es pesa fuerte como ejemplo negativo para bajar/bloquear parecidas.
  // ⚠️ Dudosa queda como referencia muy débil, no decide casi nada.
  if (l === "clear") return 3.0;
  if (l === "target") return 1.0;
  if (l === "avoid") return 3.0;
  if (l === "doubt") return 0.35;
  return 1.0;
}
function getGiroAprendizajeLabelWeightText(label, source = "") {
  const w = getGiroAprendizajeLabelWeight(label, source);
  if (w >= 3) return "peso fuerte";
  if (w >= 1.5) return "peso medio";
  if (w >= 1) return "peso normal";
  return "peso débil";
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
  toast(`${getGiroAprendizajeLabelText(safeLabel)} guardada para IA local`, 1450);
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

/* =========================
   Giro Polaridad REAL — nivel creado, ruptura, cambio de rol y retesteo
   - Vieja resistencia rota hacia arriba => ahora soporte => CALL si retestea y respeta.
   - Viejo soporte roto hacia abajo => ahora resistencia => PUT si retestea y respeta.
========================= */
function loadGiroPolarityCandles() {
  try {
    const raw = localStorage.getItem(GIRO_POLARIDAD_CANDLES_KEY);
    if (!raw) return {};
    const obj = JSON.parse(raw);
    return obj && typeof obj === "object" ? obj : {};
  } catch {
    return {};
  }
}
let giroPolarityCandles = loadGiroPolarityCandles();
function saveGiroPolarityCandles() {
  try {
    const out = {};
    for (const sym of SYMBOLS) {
      const arr = Array.isArray(giroPolarityCandles?.[sym]) ? giroPolarityCandles[sym] : [];
      out[sym] = arr.slice(-GIRO_POLARIDAD_MAX_CANDLES);
    }
    giroPolarityCandles = out;
    localStorage.setItem(GIRO_POLARIDAD_CANDLES_KEY, JSON.stringify(out));
  } catch {}
}
function upsertGiroPolarityCandle(symbol, candle) {
  try {
    if (!symbol || !candle || !Number.isFinite(Number(candle.minute))) return;
    const open = Number(candle.open);
    const high = Number(candle.high);
    const low = Number(candle.low);
    const close = Number(candle.close);
    if (![open, high, low, close].every(Number.isFinite)) return;
    giroPolarityCandles[symbol] ||= [];
    const arr = giroPolarityCandles[symbol];
    const item = { minute: Number(candle.minute), symbol, open, high: Math.max(open, high, low, close), low: Math.min(open, high, low, close), close, updatedAt: Date.now() };
    const idx = arr.findIndex((x) => Number(x?.minute) === item.minute);
    if (idx >= 0) arr[idx] = { ...arr[idx], ...item };
    else arr.push(item);
    arr.sort((a, b) => Number(a.minute || 0) - Number(b.minute || 0));
    giroPolarityCandles[symbol] = arr.slice(-GIRO_POLARIDAD_MAX_CANDLES);
  } catch {}
}
function syncCurrentCandleToPolarity(symbol, minute) {
  const oc = candleOC?.[minute]?.[symbol];
  if (!oc) return;
  upsertGiroPolarityCandle(symbol, { minute, ...oc });
}
function getGiroPolarityCandles(symbol, currentMinute = null, lookback = 120) {
  const arr = Array.isArray(giroPolarityCandles?.[symbol]) ? giroPolarityCandles[symbol] : [];
  const cm = Number(currentMinute);
  return arr
    .filter((c) => c && [c.open, c.high, c.low, c.close].map(Number).every(Number.isFinite))
    .filter((c) => !Number.isFinite(cm) || Number(c.minute) < cm)
    .slice(-lookback);
}
function getGiroPolarityTolerance(symbol, currentRange = 0) {
  const candles = getGiroPolarityCandles(symbol, null, 40);
  const ranges = candles.map((c) => Math.abs(Number(c.high) - Number(c.low))).filter((x) => Number.isFinite(x) && x > 0);
  const avgRange = ranges.length ? ranges.reduce((a, b) => a + b, 0) / ranges.length : Math.abs(Number(currentRange || 0));
  const base = Math.max(Math.abs(Number(currentRange || 0)), avgRange, 1e-9);
  return Math.max(base * 0.16, avgRange * 0.07, 1e-9);
}
function clusterGiroPolarityLevels(rawLevels, tolerance) {
  const clusters = [];
  for (const type of ["resistance", "support"]) {
    const sorted = (rawLevels || [])
      .filter((x) => x && x.type === type && Number.isFinite(Number(x.price)))
      .map((x) => ({ ...x, price: Number(x.price), minute: Number(x.minute || 0) }))
      .sort((a, b) => Number(a.price) - Number(b.price));

    for (const lvl of sorted) {
      const price = Number(lvl.price);
      const sameType = clusters.filter((x) => x.originalType === type);
      const last = sameType[sameType.length - 1];
      if (!last || Math.abs(price - last.price) > tolerance) {
        clusters.push({
          price,
          originalType: type,
          type,
          touches: 1,
          minutes: [Number(lvl.minute || 0)],
          firstMinute: Number(lvl.minute || 0),
          lastTouchMinute: Number(lvl.minute || 0),
        });
      } else {
        const total = last.touches + 1;
        last.price = (last.price * last.touches + price) / total;
        last.touches = total;
        last.minutes.push(Number(lvl.minute || 0));
        last.firstMinute = Math.min(last.firstMinute, Number(lvl.minute || 0));
        last.lastTouchMinute = Math.max(last.lastTouchMinute, Number(lvl.minute || 0));
      }
    }
  }

  return clusters.sort((a, b) => Number(a.price) - Number(b.price));
}
function getGiroPolarityBreakInfo(candles, cluster, tol, rules = RULES_GIRO_POLARIDAD) {
  const level = Number(cluster?.price);
  const originalType = cluster?.originalType === "support" ? "support" : "resistance";
  if (!Number.isFinite(level)) return null;

  const mins = (cluster.minutes || []).map(Number).filter(Number.isFinite);
  const startMinute = mins.length ? Math.min(...mins) : Number(cluster.firstMinute || 0);
  const breakTol = tol * Number(rules.breakCloseTolMult || 0.70);
  let breakCandle = null;

  for (const c of candles || []) {
    const m = Number(c.minute || 0);
    if (!Number.isFinite(m) || m <= startMinute) continue;
    const close = Number(c.close);
    const high = Number(c.high);
    const low = Number(c.low);
    if (![close, high, low].every(Number.isFinite)) continue;

    if (originalType === "resistance") {
      const brokeUp = close >= level + breakTol && high >= level + tol * 0.95;
      if (brokeUp) breakCandle = c;
    } else {
      const brokeDown = close <= level - breakTol && low <= level - tol * 0.95;
      if (brokeDown) breakCandle = c;
    }
  }

  if (!breakCandle) return null;

  const brokenAt = Number(breakCandle.minute || 0);
  const currentRole = originalType === "resistance" ? "support" : "resistance";
  const direction = currentRole === "support" ? "CALL" : "PUT";
  const breakDirection = originalType === "resistance" ? "up" : "down";
  return {
    originalType,
    currentRole,
    levelType: currentRole,
    direction,
    breakDirection,
    brokenAt,
    breakClose: Number(breakCandle.close),
    breakHigh: Number(breakCandle.high),
    breakLow: Number(breakCandle.low),
  };
}
function getGiroPolarityCandidateLevels(symbol, minute, currentRange, rules = RULES_GIRO_POLARIDAD) {
  const candles = getGiroPolarityCandles(symbol, minute, Number(rules.lookbackCandles || 120));
  const tol = getGiroPolarityTolerance(symbol, currentRange);
  const raw = [];
  for (const c of candles) {
    raw.push({ price: Number(c.high), type: "resistance", minute: Number(c.minute) });
    raw.push({ price: Number(c.low), type: "support", minute: Number(c.minute) });
  }

  const clusters = clusterGiroPolarityLevels(raw, tol * Number(rules.clusterTolMult || 1.25));
  const out = [];
  for (const cluster of clusters) {
    if (Number(cluster.touches || 0) < Number(rules.minOriginalTouches || 2)) continue;
    const breakInfo = getGiroPolarityBreakInfo(candles, cluster, tol, rules);
    if (!breakInfo) continue;
    out.push({ ...cluster, ...breakInfo, tolerance: tol });
  }
  return out;
}
function getGiroPolarityRoleText(pol) {
  if (!pol) return "";
  if (pol.levelMode === "sin_nivel") return "ZONA INTRAVELA";
  if (pol.levelMode === "simple" || !pol.originalType) {
    return pol.levelType === "support" ? "SOPORTE" : "RESISTENCIA";
  }
  const original = pol.originalType === "support" ? "SOPORTE" : "RESISTENCIA";
  const role = pol.currentRole === "support" || pol.levelType === "support" ? "SOPORTE" : "RESISTENCIA";
  return `vieja ${original} → ${role}`;
}
function formatGiroPolarityLevel(item) {
  const pol = item?.giroPolaridad || item?.polarityLevel || null;
  if (!pol || !Number.isFinite(Number(pol.level))) return "";
  const roleText = getGiroPolarityRoleText(pol);
  const dir = pol.direction || item?.direction || "";
  const pts = Number.isFinite(Number(pol.points)) ? ` · ${Number(pol.points)} pts` : "";
  const touches = Number.isFinite(Number(pol.touches)) ? ` · ${Number(pol.touches)} toques` : "";
  const broken = Number.isFinite(Number(pol.brokenAt)) ? ` · ruptura m${Number(pol.brokenAt)}` : "";
  if (pol.levelMode === "sin_nivel") {
    return `⚡ Zona intravela · ${roleText}: ${Number(pol.level).toFixed(6)} → ${dir}${pts}`;
  }
  if (pol.levelMode === "simple" || !pol.originalType) {
    return `📍 Nivel ${roleText}: ${Number(pol.level).toFixed(6)} → ${dir}${pts}${touches}`;
  }
  return `🧲 Polaridad ${roleText}: ${Number(pol.level).toFixed(6)} → ${dir}${pts}${touches}${broken}`;
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
    mode: MODE_GIRO_NIVEL,
    mode_version: GIRO_NIVEL_LOGIC_VERSION,
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
    mode: MODE_GIRO_NIVEL,
    mode_version: GIRO_NIVEL_LOGIC_VERSION,
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
    const existing = practiceSavedSignals[idx];
    const existingKey = getPracticeEntryKey(existing);
    practiceSavedSignals.splice(idx, 1);
    savePracticeSavedSignals(practiceSavedSignals);
    if (existingKey) {
      practiceQueue = (practiceQueue || []).filter((id) => String(id) !== String(existingKey));
      savePracticeQueueState();
      updatePracticePoolLabel();
    }
    return false;
  }

  const snap = buildPracticeSavedSnapshotFromItem({
    ...item,
    mode: MODE_GIRO_NIVEL,
    mode_version: GIRO_NIVEL_LOGIC_VERSION,
  });
  if (!snap) return false;
  practiceSavedSignals.unshift(snap);
  savePracticeSavedSignals(practiceSavedSignals);

  // FIX: antes el 💾 guardaba en localStorage, pero si la cola de práctica ya existía,
  // la nueva señal no entraba al pool visible hasta agotar/remezclar todo.
  // Ahora se inserta al frente de la cola si ya tiene nextOutcome resuelto.
  const live = findHistoryItemById(String(snap.source_signal_id || snap.id || ""));
  const merged = live
    ? normalizePracticeSavedSignal({
        ...snap,
        id: live.id,
        minute: live.minute,
        time: live.time,
        symbol: live.symbol,
        direction: live.direction,
        mode: MODE_GIRO_NIVEL,
        mode_version: GIRO_NIVEL_LOGIC_VERSION,
        nextOutcome: live.nextOutcome || snap.nextOutcome || "",
        minuteComplete: !!live.minuteComplete,
        trade: live.trade || snap.trade || null,
        ticks: Array.isArray(live.ticks) ? live.ticks : snap.ticks,
      })
    : snap;
  if (merged?.nextOutcome === "up" || merged?.nextOutcome === "down") pushPracticeEntryToQueueFront(merged);
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
          mode: MODE_GIRO_NIVEL,
          mode_version: GIRO_NIVEL_LOGIC_VERSION,
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
    study_capture_id: it?.trade?.study_capture_id || getStudyCaptureIdFromItem(it),

    // capa manual antiengaño
    manualGiro: normalizeManualGiroState(it.manualGiro),

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

  // si cerró ITM/OTM, guardar en journal y generar captura de estudio
  try {
    upsertTradeJournalFromSignal(item);
  } catch {}

  try {
    if (badge === "ITM" || badge === "OTM") {
      setTimeout(() => {
        generateAndSaveStudyCaptureForSignal(item).then(() => {
          try {
            const av = localStorage.getItem("activeView") || "signals";
            if (av === "trades") renderTradesView();
          } catch {}
        }).catch(() => {});
      }, 250);
    }
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
let manualGiroPanelEl = null;
let manualGiroSummaryEl = null;
let manualGiroStateEl = null;
let manualGiroButtonsEl = null;
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
      c100State.accountMode = activeTradingAccount || ACCOUNT_MODE_DEMO;
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
   Interés Compuesto 2 niveles
   Nota: se conservan nombres internos C100* para no romper integraciones antiguas.
========================= */
function getC100BaseStake() {
  const n = Number(getTradeStake());
  return Number.isFinite(n) && n > 0 ? Number(n.toFixed(2)) : Number(DEFAULT_STAKE.toFixed(2));
}
function getC100Level(level = 1) {
  const base = getC100BaseStake();
  const fallbackCompound = Number((base * (1 + C100_PAYOUT_REQUIRED / 100)).toFixed(2));
  const storedCompound = Number(c100State?.nextCompoundStake || c100State?.currentStake || 0);
  const compound = Number.isFinite(storedCompound) && storedCompound > 0 && Number(c100State?.compoundStep || 0) === 1
    ? Number(storedCompound.toFixed(2))
    : fallbackCompound;
  const safeLevel = Number(level || 1) >= 2 ? 2 : 1;
  return { level: safeLevel, base, compound };
}
function makeFreshC100State({ keepDay = false } = {}) {
  const prev = c100State || {};
  const baseStake = getC100BaseStake();
  return {
    enabled: !!prev.enabled,
    accountMode: activeTradingAccount || ACCOUNT_MODE_DEMO,
    level: 1,
    compoundStep: 0,
    currentStake: baseStake,
    baseStake,
    nextCompoundStake: 0,
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
  const compoundStep = Number(obj.compoundStep || 0) === 1 || Number(obj.level || 1) >= 2 ? 1 : 0;
  const level = compoundStep ? 2 : 1;
  const baseStake = getC100BaseStake();
  const nextCompoundStake = Number(obj.nextCompoundStake || (compoundStep ? obj.currentStake : 0));
  const currentStake = Number(obj.currentStake);
  return {
    ...base,
    ...obj,
    enabled: !!obj.enabled,
    accountMode: obj.accountMode || activeTradingAccount || ACCOUNT_MODE_DEMO,
    level,
    compoundStep,
    baseStake,
    nextCompoundStake: Number.isFinite(nextCompoundStake) && nextCompoundStake > 0 ? Number(nextCompoundStake.toFixed(2)) : 0,
    currentStake: Number.isFinite(currentStake) && currentStake > 0 ? Number(currentStake.toFixed(2)) : baseStake,
    cycleLoss: 0,
    dayProfit: Number(obj.dayProfit || 0),
    dayLoss: Number(obj.dayLoss || 0),
    locked: false,
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
  // IC2 puede usarse tanto en DEMO como en REAL; respeta la cuenta activa.
  return true;
}
function isC100Active() {
  return !!c100State?.enabled;
}
function getC100Stake() {
  if (!c100State) loadC100State();
  const base = getC100BaseStake();
  if (Number(c100State.compoundStep || 0) === 1) {
    const compound = Number(c100State.nextCompoundStake || c100State.currentStake || 0);
    const fallback = Number((base * (1 + C100_PAYOUT_REQUIRED / 100)).toFixed(2));
    const stake = Number.isFinite(compound) && compound > 0 ? compound : fallback;
    c100State.level = 2;
    c100State.currentStake = Number(stake.toFixed(2));
    return Number(stake.toFixed(2));
  }
  c100State.level = 1;
  c100State.currentStake = base;
  c100State.baseStake = base;
  return base;
}
function getEffectiveTradeStake() {
  return isC100Active() ? getC100Stake() : getTradeStake();
}
function getC100StatusText() {
  if (!c100State) loadC100State();
  if (!c100State.enabled) return "Desactivado";
  if (c100State.pendingContractId) return "Contrato pendiente";
  if (Number(c100State.compoundStep || 0) === 1) return "Nivel 2: compuesto listo";
  return "Nivel 1: stake base";
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
  panel.style.border = "1px solid rgba(34,211,238,.32)";
  panel.style.background = "linear-gradient(180deg, rgba(34,211,238,.10), rgba(255,255,255,.025))";
  panel.style.boxShadow = "0 0 22px rgba(34,211,238,.10), inset 0 0 0 1px rgba(255,255,255,.04)";
  panel.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px;">
      <div style="font-weight:950;font-size:15px;letter-spacing:.2px;">Interés Compuesto 2 niveles</div>
      <div id="c100StateBadge" style="font-weight:950;font-size:12px;padding:6px 10px;border-radius:999px;border:1px solid rgba(255,255,255,.14);background:rgba(0,0,0,.16);">OFF</div>
    </div>
    <div id="c100Info" style="display:grid;grid-template-columns:1fr;gap:6px;font-size:13px;line-height:1.35;color:var(--text,#e5e7eb);"></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px;">
      <button id="c100ToggleBtn" class="btn btnGhost" type="button">Activar IC2</button>
      <button id="c100ResetBtn" class="btn btnGhost" type="button">Reset IC2</button>
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
      c100State.accountMode = activeTradingAccount || ACCOUNT_MODE_DEMO;
      saveC100State();
      stopAllExecutionPlanLoops();
      executionPlanCache.clear();
      updateC100PanelUI();
      updateModalCandleStatusUI();
      toast(c100State.enabled ? "🧮 Interés Compuesto 2 niveles ON" : "⚪ Interés Compuesto 2 niveles OFF", 1600);
    };
  }
  if (resetBtn) {
    resetBtn.onclick = () => {
      const ok = confirm("¿Resetear Interés Compuesto 2 niveles? Vuelve al nivel 1 y conserva Ganancia/Pérdida del día.");
      if (!ok) return;
      resetC100Gestion({ keepDay: true, keepEnabled: true });
      toast("↺ IC2 reseteado", 1600);
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
  const baseStake = getC100BaseStake();
  const net = getC100DayNet();
  const status = getC100StatusText();

  if (badge) {
    badge.textContent = active ? `ON · N${Number(c100State.compoundStep || 0) + 1}/2` : "OFF";
    badge.style.color = active ? "#cffafe" : "rgba(229,231,235,.82)";
    badge.style.borderColor = active ? "rgba(34,211,238,.48)" : "rgba(255,255,255,.14)";
    badge.style.boxShadow = active ? "0 0 14px rgba(34,211,238,.18)" : "none";
  }
  if (toggleBtn) {
    toggleBtn.textContent = c100State.enabled ? "Desactivar IC2" : "Activar IC2";
    toggleBtn.classList.toggle("active", active);
    toggleBtn.title = "Interés compuesto simple: nivel 1 base; si gana, nivel 2 con stake+ganancia; luego vuelve al nivel 1.";
  }
  if (resetBtn) {
    resetBtn.disabled = false;
    resetBtn.title = "Vuelve al nivel 1. Mantiene Ganancia/Pérdida del día.";
  }
  if (info) {
    info.innerHTML = `
      <div>Modo: <b>${C100_MODE_LABEL}</b> · Cuenta activa: <b>${getTradingAccountLabel()}</b></div>
      <div>Regla: <b>Nivel 1 stake base → si gana, Nivel 2 stake + ganancia → reset</b></div>
      <div>Nivel actual: <b>${Number(c100State.compoundStep || 0) + 1} / ${C100_MAX_LEVEL}</b></div>
      <div>Stake base: <b>$${baseStake.toFixed(2)}</b></div>
      <div>Próximo stake: <b>$${stake.toFixed(2)}</b></div>
      <div>Estado: <b>${escapeHtml(status)}</b></div>
      <div>Ganancia/Pérdida del día: <b>${net >= 0 ? "+" : "-"}$${Math.abs(net).toFixed(2)}</b></div>
      ${c100State.pendingContractId ? `<div>Contrato pendiente: <b>${escapeHtml(c100State.pendingContractId)}</b></div>` : ""}
    `;
  }
}
function assertC100CanTrade() {
  if (!isC100Active()) return;
  if (c100State.pendingContractId) throw new Error(`IC2: contrato pendiente ${c100State.pendingContractId}`);
  if ((disciplinePendingContracts || []).length > 0) throw new Error("Hay contrato pendiente. Esperá el cierre antes de operar IC2.");
  if (!ws || ws.readyState !== 1) throw new Error("Conexión inestable: WebSocket no está listo.");
  if (!lastTickLocalNowMs) throw new Error("Conexión inestable: todavía no hay ticks confirmados.");
  const age = Date.now() - lastTickLocalNowMs;
  if (age > 8000) throw new Error(`Conexión inestable: último tick hace ${Math.round(age / 1000)}s.`);
}
function assertC100PayoutOK(profitPct) {
  // IC2 no filtra por payout mínimo. Se conserva la función para compatibilidad.
  return true;
}
function markC100PendingContract(contractId) {
  if (!isC100Active() || !contractId) return;
  c100State.pendingContractId = String(contractId);
  c100State.accountMode = activeTradingAccount || ACCOUNT_MODE_DEMO;
  c100State.currentStake = getC100Stake();
  c100State.lastResult = "PENDING";
  saveC100State();
  updateC100PanelUI();
}
function updateC100AfterResult(result, profit = null) {
  if (!c100State) loadC100State();
  const normalized = String(result || "").toUpperCase() === "ITM" ? "ITM" : "OTM";
  const stakeUsed = Number(c100State.currentStake || getC100Stake());
  const profitNum = Number(profit);
  const wasLevel2 = Number(c100State.compoundStep || 0) === 1;
  const enabled = !!c100State.enabled;

  c100State.pendingContractId = "";
  c100State.lastResult = normalized;

  if (normalized === "ITM") {
    const gain = Number.isFinite(profitNum) && profitNum > 0 ? profitNum : stakeUsed * (C100_PAYOUT_REQUIRED / 100);
    c100State.dayProfit = Number(c100State.dayProfit || 0) + gain;

    if (!wasLevel2) {
      const nextStake = Number((stakeUsed + gain).toFixed(2));
      c100State.level = 2;
      c100State.compoundStep = 1;
      c100State.nextCompoundStake = nextStake;
      c100State.currentStake = nextStake;
      c100State.lastResult = "ITM_NIVEL_1_PASA_A_NIVEL_2";
    } else {
      const dayProfit = Number(c100State.dayProfit || 0);
      const dayLoss = Number(c100State.dayLoss || 0);
      c100State = makeFreshC100State({ keepDay: true });
      c100State.enabled = enabled;
      c100State.dayProfit = dayProfit;
      c100State.dayLoss = dayLoss;
      c100State.lastResult = "CICLO_IC2_COMPLETO";
    }
  } else {
    const loss = Number.isFinite(profitNum) && profitNum < 0 ? Math.abs(profitNum) : stakeUsed;
    const dayProfit = Number(c100State.dayProfit || 0);
    const dayLoss = Number(c100State.dayLoss || 0) + loss;
    c100State = makeFreshC100State({ keepDay: false });
    c100State.enabled = enabled;
    c100State.dayProfit = dayProfit;
    c100State.dayLoss = dayLoss;
    c100State.lastResult = wasLevel2 ? "OTM_NIVEL_2_RESET" : "OTM_NIVEL_1_RESET";
  }

  saveC100State();
  updateC100PanelUI();
  updateModalCandleStatusUI();

  if (normalized === "ITM" && !wasLevel2) {
    toast(`✅ IC2: nivel 1 ganado · próximo stake $${getC100Stake().toFixed(2)}`, 2400);
  } else if (normalized === "ITM" && wasLevel2) {
    toast("✅ IC2: ciclo de 2 niveles completo · vuelve al stake base", 2600);
  } else {
    toast("↺ IC2: OTM registrado · vuelve al stake base", 2400);
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

  if (c100State.pendingContractId || (disciplinePendingContracts || []).length > 0) {
    paintGiroOnlyButtonState(modalBuyCallBtn, false, "IC2: hay contrato pendiente.");
    paintGiroOnlyButtonState(modalBuyPutBtn, false, "IC2: hay contrato pendiente.");
    return;
  }
  if (!ws || ws.readyState !== 1 || !lastTickLocalNowMs || Date.now() - lastTickLocalNowMs > 8000) {
    paintGiroOnlyButtonState(modalBuyCallBtn, false, "IC2: conexión inestable.");
    paintGiroOnlyButtonState(modalBuyPutBtn, false, "IC2: conexión inestable.");
  }
}
function getC100ModalTag() {
  if (!isC100Active()) return "";
  return ` | IC2 N${Number(c100State.compoundStep || 0) + 1}/${C100_MAX_LEVEL} S$${getC100Stake().toFixed(2)} ${getC100StatusText()}`;
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
  return shouldUseAutoHighLowExecution() ? "🎯 High/Low fijo por par" : "↕️ Rise/Fall 1m";
}
function applyExecutionModeUI() {
  const btn = pickEl("executionModeBtn");
  if (!btn) return;
  btn.textContent = getExecutionModeLabel();
  btn.classList.toggle("active", shouldUseAutoHighLowExecution());
  btn.title = shouldUseAutoHighLowExecution()
    ? "Usa barrera fija por par: COMPRA = HIGHER y VENTA = LOWER. Si no hay propuesta válida, cancela; NO cae a Rise/Fall."
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

const AUTO_PRECALC_SCALE_FACTORS = [1, 0.5, 0.25, 0.1, 0.05, 0.01, 0.005, 0.001, 0.0005, 0.0001];

function readHighLowProposalCooldownUntil() {
  try { return Math.max(0, Number(localStorage.getItem(HIGHLOW_PROPOSAL_COOLDOWN_KEY) || 0)); }
  catch { return 0; }
}
function writeHighLowProposalCooldown(ms = HIGHLOW_PROPOSAL_LIMIT_COOLDOWN_MS) {
  const until = Date.now() + Math.max(15000, Number(ms || HIGHLOW_PROPOSAL_LIMIT_COOLDOWN_MS));
  try { localStorage.setItem(HIGHLOW_PROPOSAL_COOLDOWN_KEY, String(until)); } catch {}
  return until;
}
function isHighLowProposalCooldownActive() {
  return Date.now() < readHighLowProposalCooldownUntil();
}
function highLowCooldownRemainingMs() {
  return Math.max(0, readHighLowProposalCooldownUntil() - Date.now());
}
function isHighLowProposalLimitError(message) {
  const txt = String(message || "").toLowerCase();
  return txt.includes("proposal") && (txt.includes("limit") || txt.includes("too many") || txt.includes("rate"));
}
function getHighLowDiscoveryAttemptKey(symbol, side) {
  return `${String(symbol || "")}|${String(side || "")}`;
}
function readHighLowDiscoveryAttempts() {
  try {
    const raw = JSON.parse(localStorage.getItem(HIGHLOW_DISCOVERY_ATTEMPT_KEY) || "{}");
    return raw && typeof raw === "object" ? raw : {};
  } catch { return {}; }
}
function canAttemptHighLowDiscovery(symbol, side) {
  const key = getHighLowDiscoveryAttemptKey(symbol, side);
  const raw = readHighLowDiscoveryAttempts();
  return Date.now() - Number(raw[key] || 0) >= HIGHLOW_DISCOVERY_COOLDOWN_MS;
}
function markHighLowDiscoveryAttempt(symbol, side) {
  try {
    const raw = readHighLowDiscoveryAttempts();
    raw[getHighLowDiscoveryAttemptKey(symbol, side)] = Date.now();
    localStorage.setItem(HIGHLOW_DISCOVERY_ATTEMPT_KEY, JSON.stringify(raw));
  } catch {}
}
function getLatestSignalQuoteForBarrier(item) {
  const ticks = Array.isArray(item?.ticks) ? item.ticks : [];
  for (let i = ticks.length - 1; i >= 0; i--) {
    const q = Number(ticks[i]?.quote);
    if (Number.isFinite(q) && q > 0) return q;
  }
  const live = Number(lastQuoteBySymbol?.[item?.symbol]);
  if (Number.isFinite(live) && live > 0) return live;
  return NaN;
}
function getBarrierPrecisionForAbs(absValue) {
  const n = Math.abs(Number(absValue || 0));
  if (!Number.isFinite(n) || n <= 0) return 3;
  if (n >= 10) return 3;
  if (n >= 1) return 3;
  if (n >= 0.1) return 3;
  if (n >= 0.01) return 4;
  return 5;
}
function makeBarrierCandidateFromAbsolute(side, absValue, forcedPrecision = null) {
  const sign = side === "CALL" ? 1 : -1;
  const raw0 = Math.abs(Number(absValue || 0));
  if (!Number.isFinite(raw0) || raw0 <= 0) return null;

  let precision = Number.isFinite(Number(forcedPrecision)) ? Number(forcedPrecision) : getBarrierPrecisionForAbs(raw0);
  precision = Math.max(0, Math.min(8, precision));
  const raw = Number(raw0.toFixed(precision));
  if (!Number.isFinite(raw) || raw <= 0) return null;

  const barrierNum = sign * raw;
  const barrier = `${sign > 0 ? "+" : "-"}${raw.toFixed(precision)}`;
  return { barrierNum, precision, barrier, relativeBarrier: true };
}
function normalizeHighLowSymbolKey(symbol) {
  return String(symbol || "").trim().toUpperCase();
}
function getHighLowFixedBarrierRaw(symbol) {
  return HIGHLOW_FIXED_RELATIVE_BARRIERS[normalizeHighLowSymbolKey(symbol)] || "";
}
function makeHighLowFixedBarrierCandidate(symbol, side) {
  const rawText = String(getHighLowFixedBarrierRaw(symbol) || "").trim();
  if (!rawText) return null;
  const abs = Math.abs(Number(rawText));
  if (!Number.isFinite(abs) || abs <= 0) return null;
  const precision = Math.max(0, Math.min(8, (rawText.split(".")[1] || "").length));
  const sign = side === "CALL" ? 1 : -1;
  const barrierNum = sign * abs;
  return {
    barrierNum,
    precision,
    barrier: `${sign > 0 ? "+" : "-"}${abs.toFixed(precision)}`,
    relativeBarrier: true,
    fixedBarrier: true,
    source: "fixed_by_symbol",
  };
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
  const fixedCandidate = makeHighLowFixedBarrierCandidate(item?.symbol, side);
  if (fixedCandidate) return { coarse: [fixedCandidate] };

  const sourcePips = mode === "fast" ? AUTO_PRECALC_FAST_PIPS : AUTO_PRECALC_COARSE_PIPS;
  const hint = getExecutionBarrierHint(item?.symbol, side);
  const latestQuote = getLatestSignalQuoteForBarrier(item);

  // IMPORTANTE:
  // La pantalla de Deriv muestra una barrera relativa tipo +0.431.
  // En detalles del contrato puede verse como precio absoluto, por ejemplo 3003.628.
  // Para la API siempre probamos BARRERAS RELATIVAS (+/- distancia), no precio absoluto.
  const defaultLikeAbs = [];
  if (Number.isFinite(latestQuote) && latestQuote > 0) {
    // Factores cercanos a las barreras default que Deriv suele mostrar por símbolo.
    // Ejemplo Volatility 25: 2972 * 0.000145 ≈ 0.431.
    const factors = [
      0.000145, 0.000150, 0.000140, 0.000158, 0.000132,
      0.000120, 0.000100, 0.000180, 0.000200, 0.000080,
      0.000060, 0.000050, 0.000030, 0.000250, 0.000300
    ];
    for (const f of factors) defaultLikeAbs.push(Math.abs(latestQuote * f));
  }

  const hintedAbs = [];
  if (Number.isFinite(Number(hint?.barrierAbs)) && Number(hint.barrierAbs) > 0) {
    const base = Math.abs(Number(hint.barrierAbs));
    for (const factor of [0.90, 0.96, 1, 1.04, 1.10]) hintedAbs.push(base * factor);
  }

  // Barreras relativas pequeñas típicas. No son fijas por par: se prueban como fallback.
  const fineRelativeAbs = [
    0.02, 0.03, 0.04, 0.05, 0.06, 0.08,
    0.10, 0.12, 0.15, 0.18, 0.20, 0.25, 0.30, 0.35,
    0.40, 0.43, 0.431, 0.45, 0.47, 0.471, 0.50, 0.60, 0.75, 0.80, 1.00, 1.20, 1.50
  ];

  const scaledPresets = [];
  for (const pips of sourcePips) {
    const absPips = Math.abs(Number(pips || 0));
    if (!Number.isFinite(absPips) || absPips <= 0) continue;
    for (const scale of AUTO_PRECALC_SCALE_FACTORS) scaledPresets.push(absPips * scale);
  }

  const candidates = dedupeBarrierCandidates([
    ...defaultLikeAbs.map((v) => makeBarrierCandidateFromAbsolute(side, v, 3)),
    ...hintedAbs.map((v) => makeBarrierCandidateFromAbsolute(side, v, getBarrierPrecisionForAbs(v))),
    ...fineRelativeAbs.map((v) => makeBarrierCandidateFromAbsolute(side, v, getBarrierPrecisionForAbs(v))),
    ...scaledPresets.map((v) => makeBarrierCandidateFromAbsolute(side, v, getBarrierPrecisionForAbs(v))),
  ].filter(Boolean));

  return { coarse: candidates };
}
function formatRelativeBarrier(value, precision = 3) {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n === 0) return "+0";
  const p = Math.max(0, Number(precision || 0));
  const abs = Math.abs(n).toFixed(p);
  return `${n >= 0 ? "+" : "-"}${abs}`;
}
function parseRelativeBarrierString(raw) {
  const txt = String(raw ?? "").trim();
  if (!txt) return null;
  const m = txt.match(/([+-])\s*(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const n = Number(m[2]);
  if (!Number.isFinite(n) || n <= 0) return null;
  const precision = (String(m[2]).split(".")[1] || "").length;
  const barrierNum = (m[1] === "-" ? -1 : 1) * n;
  return { barrierNum, precision, barrier: formatRelativeBarrier(barrierNum, precision) };
}
function extractProposalRelativeBarrier(proposal, fallbackSide = "CALL") {
  if (!proposal) return null;
  const direct = [
    proposal.barrier,
    proposal.barrier_display_value,
    proposal.barrier_spot,
    proposal.contract_details?.barrier,
    proposal.contract_details?.barrier_display_value,
  ];
  for (const v of direct) {
    const parsed = parseRelativeBarrierString(v);
    if (parsed) return parsed;
  }
  const longcode = String(proposal.longcode || "");
  const parsedLongcode = parseRelativeBarrierString(longcode);
  if (parsedLongcode) return parsedLongcode;

  // Si Deriv acepta la propuesta por defecto pero no expone la barrera en el payload,
  // la dejamos como "auto". Se puede comprar igual por proposal_id, pero no se puede espejar.
  return {
    barrierNum: NaN,
    precision: 0,
    barrier: fallbackSide === "CALL" ? "+auto" : "-auto",
    defaultBarrier: true,
  };
}
function parseProposalToExecution(planRaw, side, precision) {
  const proposal = planRaw?.proposal;
  const askPrice = Number(proposal?.ask_price);
  const payout = Number(proposal?.payout);
  const id = proposal?.id ? String(proposal.id) : "";

  let barrierNum = Number(planRaw?.barrierNum);
  let barrierPrecision = Math.max(0, Number(planRaw?.precision ?? precision ?? 0));
  let barrier = planRaw?.barrier ? String(planRaw.barrier) : "";
  let defaultBarrier = !!planRaw?.defaultBarrier;

  if (!barrier || !Number.isFinite(barrierNum) || Math.abs(barrierNum) <= 0) {
    const extracted = extractProposalRelativeBarrier(proposal, side);
    if (extracted) {
      barrierNum = Number(extracted.barrierNum);
      barrierPrecision = Math.max(0, Number(extracted.precision ?? barrierPrecision ?? 0));
      barrier = String(extracted.barrier || barrier || (side === "CALL" ? "+auto" : "-auto"));
      defaultBarrier = !!extracted.defaultBarrier;
    }
  }

  if (!id || !Number.isFinite(askPrice) || askPrice <= 0 || !Number.isFinite(payout)) return null;
  const profitPct = ((payout - askPrice) / askPrice) * 100;
  const payoutTotalPct = (payout / askPrice) * 100;
  return {
    proposalId: id,
    contractType: side === "CALL" ? "HIGHER" : "LOWER",
    apiContractType: side,
    askPrice,
    payout,
    profitPct,
    payoutTotalPct,
    distance: 0,
    barrierNum,
    precision: barrierPrecision,
    barrier: barrier || (side === "CALL" ? "+auto" : "-auto"),
    defaultBarrier,
    longcode: proposal?.longcode ? String(proposal.longcode) : "",
    updatedAt: Date.now(),
  };
}
function isHighLowPlanWithinPayoutCap(plan) {
  if (!plan) return false;
  const totalPct = Number(plan.payoutTotalPct);
  if (!Number.isFinite(totalPct)) return true;
  if (totalPct > HIGHLOW_MAX_PAYOUT_TOTAL_PCT) return false;
  if (totalPct < HIGHLOW_MIN_PAYOUT_TOTAL_PCT) return false;
  return true;
}
function getHighLowPayoutCapText() {
  return `pago máx ${Math.round(HIGHLOW_MAX_PAYOUT_TOTAL_PCT)}%`;
}

async function getHighLowDefaultProposalQuote(symbol, side, stake, timeoutMs = AUTO_FULL_PROPOSAL_TIMEOUT_MS) {
  const req = {
    proposal: 1,
    amount: stake,
    basis: "stake",
    contract_type: side,
    currency: DEFAULT_CURRENCY,
    duration: Number(DEFAULT_DURATION) || 1,
    duration_unit: DEFAULT_DURATION_UNIT || "m",
    symbol,
  };
  const res = await wsRequest(req, timeoutMs);
  if (res?.error) {
    const msg = res.error.message || "proposal default error";
    if (isHighLowProposalLimitError(msg)) writeHighLowProposalCooldown();
    throw new Error(msg);
  }
  const plan = parseProposalToExecution({ proposal: res?.proposal, defaultBarrier: true }, side, 0);
  if (plan) {
    plan.symbolDefaultBarrier = true;
    plan.source = "symbol_default";
  }
  return isHighLowPlanWithinPayoutCap(plan) ? plan : null;
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
    contract_type: side,
    currency: DEFAULT_CURRENCY,
    duration: Number(DEFAULT_DURATION) || 1,
    duration_unit: DEFAULT_DURATION_UNIT || "m",
    barrier: candidate.barrier,
    symbol,
  };
  const res = await wsRequest(req, timeoutMs);
  if (res?.error) {
    const msg = res.error.message || "proposal error";
    if (isHighLowProposalLimitError(msg)) writeHighLowProposalCooldown();
    throw new Error(msg);
  }
  const plan = parseProposalToExecution({ proposal: res?.proposal, barrierNum: candidate.barrierNum, precision: candidate.precision, barrier: candidate.barrier }, side, candidate.precision);
  return isHighLowPlanWithinPayoutCap(plan) ? plan : null;
}

async function findBestHighLowPlan(item, side, opts = {}) {
  const symbol = item?.symbol;
  if (!symbol) return null;
  if (isHighLowProposalCooldownActive()) return null;

  const stake = getEffectiveTradeStake();
  const fast = !!opts.fast;
  const timeoutMs = fast ? AUTO_FAST_PROPOSAL_TIMEOUT_MS : AUTO_FULL_PROPOSAL_TIMEOUT_MS;
  const cachedOnly = !!opts.cachedOnly;
  const discovery = !!opts.discovery;

  let candidates = [];
  const fixedCandidate = makeHighLowFixedBarrierCandidate(symbol, side);
  if (fixedCandidate) {
    candidates = [fixedCandidate];
  } else {
    const hint = getExecutionBarrierHint(symbol, side);
    if (hint && Number.isFinite(Number(hint.barrierAbs)) && Number(hint.barrierAbs) > 0) {
      const c = makeBarrierCandidateFromAbsolute(side, Math.abs(Number(hint.barrierAbs)), Math.max(0, Number(hint.precision || 0)));
      if (c) candidates.push(c);
    }

    if (!cachedOnly) {
      if (discovery) {
        if (!canAttemptHighLowDiscovery(symbol, side)) return null;
        markHighLowDiscoveryAttempt(symbol, side);
        const built = buildBarrierCandidates(item, side, fast ? "fast" : "full").coarse || [];
        candidates = dedupeBarrierCandidates([...candidates, ...built]).slice(0, Number(opts.limitCandidates || HIGHLOW_DISCOVERY_CANDIDATES_PER_ATTEMPT));
      } else {
        const built = buildBarrierCandidates(item, side, "fast").coarse || [];
        candidates = dedupeBarrierCandidates([...candidates, ...built]).slice(0, 3);
      }
    }
  }

  candidates = dedupeBarrierCandidates(candidates);
  if (!candidates.length) return null;

  // Importante: pruebas secuenciales, no en paralelo. Evita llegar al límite de proposals.
  for (const candidate of candidates) {
    if (isHighLowProposalCooldownActive()) return null;
    try {
      const plan = await getHighLowProposalQuote(symbol, side, candidate, candidate?.precision || 0, stake, timeoutMs);
      if (plan) {
        if (candidate.fixedBarrier) {
          plan.fixedBarrier = true;
          plan.source = "fixed_by_symbol";
        }
        rememberExecutionBarrierHint(symbol, side, plan, plan.precision || candidate?.precision || 0);
        return plan;
      }
    } catch (e) {
      const msg = e?.message || String(e || "");
      if (isHighLowProposalLimitError(msg)) {
        writeHighLowProposalCooldown();
        return null;
      }
    }
  }
  return null;
}


function getHighLowMirrorReferencePlan(item, side) {
  if (side !== "PUT") return null;
  const cache = item?.id ? executionPlanCache.get(item.id) : null;
  const cachedCall = cache?.call || item?.autoHighLow?.call || null;
  if (cachedCall && Number.isFinite(Number(cachedCall.barrierNum)) && Math.abs(Number(cachedCall.barrierNum)) > 0) return cachedCall;
  const hintCall = getExecutionBarrierHint(item?.symbol, "CALL");
  if (hintCall && Number.isFinite(Number(hintCall.barrierAbs)) && Number(hintCall.barrierAbs) > 0) {
    return {
      barrierNum: Number(hintCall.barrierAbs),
      precision: Math.max(0, Number(hintCall.precision || 0)),
      barrier: String(hintCall.barrier || formatRelativeBarrier(Math.abs(Number(hintCall.barrierAbs)), hintCall.precision || 0)),
    };
  }
  return null;
}
async function findMirroredHighLowPlan(item, side, referencePlan, opts = {}) {
  if (side !== "PUT" || !item?.symbol || !referencePlan) return null;
  const abs = Math.abs(Number(referencePlan.barrierNum || referencePlan.barrierAbs || 0));
  if (!Number.isFinite(abs) || abs <= 0) return null;
  const precision = Math.max(0, Number(referencePlan.precision || 0));
  const candidate = makeBarrierCandidateFromAbsolute("PUT", abs);
  if (!candidate?.barrier) return null;
  candidate.precision = precision;
  candidate.barrier = formatRelativeBarrier(candidate.barrierNum, precision);
  const stake = getEffectiveTradeStake();
  const timeoutMs = opts.fast ? AUTO_FAST_PROPOSAL_TIMEOUT_MS : AUTO_FULL_PROPOSAL_TIMEOUT_MS;
  try {
    const plan = await getHighLowProposalQuote(item.symbol, "PUT", candidate, precision, stake, timeoutMs);
    if (plan) {
      plan.mirroredBarrier = true;
      plan.mirroredFrom = "CALL";
      plan.referenceBarrier = referencePlan.barrier || formatRelativeBarrier(Math.abs(Number(referencePlan.barrierNum || 0)), precision);
    }
    return plan;
  } catch {
    return null;
  }
}
function loadExecutionBarrierHintCache() {
  try {
    const raw = JSON.parse(localStorage.getItem(HIGHLOW_BARRIER_CACHE_KEY) || "{}");
    const now = Date.now();
    const map = new Map();
    for (const [key, value] of Object.entries(raw || {})) {
      if (!value || now - Number(value.updatedAt || 0) > HIGHLOW_BARRIER_CACHE_TTL_MS) continue;
      if (!Number.isFinite(Number(value.barrierAbs)) || Number(value.barrierAbs) <= 0) continue;
      if (Number.isFinite(Number(value.payoutTotalPct)) && Number(value.payoutTotalPct) > HIGHLOW_MAX_PAYOUT_TOTAL_PCT) continue;
      map.set(key, value);
    }
    return map;
  } catch { return new Map(); }
}
const executionBarrierHintCache = loadExecutionBarrierHintCache();
function saveExecutionBarrierHintCache() {
  try {
    const obj = {};
    const now = Date.now();
    for (const [key, value] of executionBarrierHintCache.entries()) {
      if (!value || now - Number(value.updatedAt || 0) > HIGHLOW_BARRIER_CACHE_TTL_MS) continue;
      obj[key] = value;
    }
    localStorage.setItem(HIGHLOW_BARRIER_CACHE_KEY, JSON.stringify(obj));
  } catch {}
}
function getExecutionHintKey(symbol, side) {
  return `${String(symbol || "")}|${String(side || "")}`;
}
function getExecutionBarrierHint(symbol, side) {
  const hint = executionBarrierHintCache.get(getExecutionHintKey(symbol, side)) || null;
  if (!hint) return null;
  if (Date.now() - Number(hint.updatedAt || 0) > HIGHLOW_BARRIER_CACHE_TTL_MS) return null;
  return hint;
}
function rememberExecutionBarrierHint(symbol, side, plan, precision = 3) {
  if (!symbol || !side || !plan) return;
  if (!isHighLowPlanWithinPayoutCap(plan)) return;
  const abs = Math.abs(Number(plan.barrierNum || 0));
  if (!Number.isFinite(abs) || abs <= 0) return;
  executionBarrierHintCache.set(getExecutionHintKey(symbol, side), {
    barrierAbs: abs,
    barrierNum: Number(plan.barrierNum || 0),
    barrier: String(plan.barrier || formatRelativeBarrier(plan.barrierNum, precision)),
    precision: Math.max(0, Number(plan.precision ?? precision ?? 0)),
    payoutTotalPct: Number(plan.payoutTotalPct || 0),
    profitPct: Number(plan.profitPct || 0),
    updatedAt: Date.now(),
  });
  saveExecutionBarrierHintCache();
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
      if (isHighLowProposalCooldownActive()) {
        cache.error = `Cooldown proposals ${Math.ceil(highLowCooldownRemainingMs() / 1000)}s`;
        return cache;
      }
      const callPlan = await findBestHighLowPlan(item, "CALL", { cachedOnly: true, fast: true });
      let putPlan = callPlan ? await findMirroredHighLowPlan(item, "PUT", callPlan, { fast: true }) : null;
      if (!putPlan) putPlan = await findBestHighLowPlan(item, "PUT", { cachedOnly: true, fast: true });
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
    if (!cache.updatedAt || Date.now() - Number(cache.updatedAt || 0) > AUTO_PRECALC_REFRESH_MS) {
      await refreshExecutionPlanForSignal(currentItem);
    }
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
  if (!isHighLowPlanWithinPayoutCap(plan)) return null;
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

  if (isHighLowProposalCooldownActive()) {
    cache.error = `Cooldown proposals ${Math.ceil(highLowCooldownRemainingMs() / 1000)}s`;
    return null;
  }

  let quick = null;
  const fixedSideCandidate = makeHighLowFixedBarrierCandidate(item?.symbol, side);
  if (fixedSideCandidate) {
    // Con barrera fija por par no espejamos ni buscamos otros lados: probamos solo la barrera exacta configurada.
    quick = await findBestHighLowPlan(item, side, { cachedOnly: false, fast: true });
  } else if (side === "PUT") {
    let reference = getHighLowMirrorReferencePlan(item, "PUT");
    if (!reference) {
      reference = await findBestHighLowPlan(item, "CALL", { cachedOnly: true, fast: true });
      if (reference) {
        cache.call = reference;
        item.autoHighLow ||= {};
        item.autoHighLow.call = { ...reference };
      }
    }
    quick = await findMirroredHighLowPlan(item, "PUT", reference, { fast: true });
  }
  if (!quick) quick = await findBestHighLowPlan(item, side, { cachedOnly: true, fast: true });

  // Descubrimiento limitado: solo una tanda chica cada 2 minutos por símbolo/lado.
  // Evita el error "You have reached the limit of proposals".
  if (!quick) quick = await findBestHighLowPlan(item, side, { discovery: true, fast: true, limitCandidates: HIGHLOW_DISCOVERY_CANDIDATES_PER_ATTEMPT });
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

  cache.error = `Sin proposal válida para ${side === "CALL" ? "HIGHER" : "LOWER"} con barrera fija del par (${getHighLowFixedBarrierRaw(item?.symbol) || "sin configurar"})`;
  return null;
}
function formatExecutionPlanMini(plan) {
  if (!plan) return "…";
  const mirror = plan.fixedBarrier ? " · fija" : plan.mirroredBarrier ? " ↔" : plan.symbolDefaultBarrier ? " auto" : " · cache";
  const pct = Number.isFinite(Number(plan.payoutTotalPct)) ? ` · pago ${Math.round(plan.payoutTotalPct)}%` : (Number.isFinite(Number(plan.profitPct)) ? ` · gan ${Math.round(plan.profitPct)}%` : "");
  return `${plan.barrier || "auto"}${mirror}${pct}`;
}
function buildTradeButtonLabel(side, plan = null) {
  const base = side === "CALL" ? "🟢 COMPRA" : "🔴 VENTA";
  const c100 = isC100Active() ? ` · IC2 $${getC100Stake().toFixed(2)}` : "";
  if (!shouldUseAutoHighLowExecution()) return `${base}${c100}`;
  return `${base}${c100} · HL ${formatExecutionPlanMini(plan)}`;
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
      btn.title = `${sideLabel} listo | API ${plan.apiContractType || (sideLabel === "HIGHER" ? "CALL" : "PUT")} + barrier ${plan.barrier || "auto"} | pago ${Math.round(plan.payoutTotalPct || 0)}% | ${getHighLowPayoutCapText()}`;
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
    // ✅ FIX AUTO 57 DEMO/REAL:
    // La autoentrada no debe depender de que el gráfico se redibuje justo en el segundo 57.
    // Este timer mantiene viva la barra del modal y además revisa señales habilitadas.
    updateModalCandleStatusUI();
    scanSignalAutoEntriesAt57();
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

const LIVE_ANALYSIS_PAUSED_KEY = "liveAnalysisPaused_v1";
let liveAnalysisPaused = false;

function loadLiveAnalysisPaused() {
  try {
    liveAnalysisPaused = localStorage.getItem(LIVE_ANALYSIS_PAUSED_KEY) === "1";
  } catch {
    liveAnalysisPaused = false;
  }
}
function saveLiveAnalysisPaused() {
  try {
    localStorage.setItem(LIVE_ANALYSIS_PAUSED_KEY, liveAnalysisPaused ? "1" : "0");
  } catch {}
}
function areSignalsPaused(viewName = null) {
  // Pausa manual global: visible en Señales, Trades y Práctica.
  // Solo frena NUEVOS análisis/señales en vivo. No borra historial ni corta WebSocket.
  return !!liveAnalysisPaused;
}
function applyLiveAnalysisPauseUI() {
  const btn = document.getElementById("liveAnalysisPauseBtn");
  if (!btn) return;
  const paused = areSignalsPaused();
  // Botón compacto: solo icono para no ocupar espacio en la fila de pestañas.
  btn.textContent = paused ? "▶️" : "⏸️";
  btn.dataset.state = paused ? "paused" : "live";
  btn.setAttribute("aria-label", paused ? "Reanudar análisis en vivo" : "Pausar análisis en vivo");
  btn.setAttribute("aria-pressed", paused ? "true" : "false");
  btn.title = paused
    ? "PAUSADO: tocar para reanudar análisis en vivo."
    : "LIVE: tocar para pausar nuevas señales.";
  btn.style.borderColor = paused ? "rgba(248,113,113,.72)" : "rgba(34,211,238,.46)";
  btn.style.background = paused
    ? "linear-gradient(180deg, rgba(127,29,29,.42), rgba(127,29,29,.20))"
    : "linear-gradient(180deg, rgba(34,211,238,.16), rgba(255,255,255,.035))";
  btn.style.color = paused ? "#fecaca" : "#ecfeff";
  btn.style.boxShadow = paused ? "0 0 14px rgba(248,113,113,.20)" : "0 0 12px rgba(34,211,238,.12)";
}
function toggleLiveAnalysisPaused() {
  liveAnalysisPaused = !liveAnalysisPaused;
  saveLiveAnalysisPaused();
  applyLiveAnalysisPauseUI();
  updateTickHealthUI();
  toast(liveAnalysisPaused ? "⏸️ Análisis en vivo pausado" : "▶️ Análisis en vivo reanudado", 1600);
}
function ensureLiveAnalysisPauseButton() {
  let btn = document.getElementById("liveAnalysisPauseBtn");
  const host =
    (configBtn && configBtn.parentElement) ||
    (counterEl && counterEl.parentElement) ||
    document.body;

  if (!btn) {
    btn = document.createElement("button");
    btn.id = "liveAnalysisPauseBtn";
    btn.type = "button";
    // No usa class "tab" porque esa clase lo hacía ocupar demasiado ancho.
    btn.className = "liveAnalysisPauseBtn";
    btn.style.width = "44px";
    btn.style.minWidth = "44px";
    btn.style.maxWidth = "44px";
    btn.style.height = "44px";
    btn.style.minHeight = "44px";
    btn.style.padding = "0";
    btn.style.borderRadius = "16px";
    btn.style.border = "1px solid rgba(255,255,255,.16)";
    btn.style.fontWeight = "950";
    btn.style.fontSize = "18px";
    btn.style.lineHeight = "1";
    btn.style.whiteSpace = "nowrap";
    btn.style.display = "inline-flex";
    btn.style.alignItems = "center";
    btn.style.justifyContent = "center";
    btn.style.marginLeft = "6px";
    btn.style.flex = "0 0 44px";
    btn.style.touchAction = "manipulation";
    btn.style.backdropFilter = "blur(10px)";
    btn.onclick = toggleLiveAnalysisPaused;

    if (configBtn && configBtn.parentElement === host) host.insertBefore(btn, configBtn);
    else host.appendChild(btn);
  } else {
    btn.onclick = toggleLiveAnalysisPaused;
    btn.classList.remove("tab");
    btn.style.flex = "0 0 44px";
    if (btn.parentElement !== host) {
      if (configBtn && configBtn.parentElement === host) host.insertBefore(btn, configBtn);
      else host.appendChild(btn);
    }
  }

  applyLiveAnalysisPauseUI();
  return btn;
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
        study_capture_id: entry.study_capture_id || entry?.trade?.study_capture_id || "",
        manualGiro: normalizeManualGiroState(entry.manualGiro),
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
  ensureLiveAnalysisPauseButton();
  applyLiveAnalysisPauseUI();
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
try { localStorage.setItem(PRACTICE_FILTER_KEY, MODE_GIRO_NIVEL); } catch {}
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
let practiceImageModeBtnEl = null;
const PRACTICE_DISPLAY_MODE_KEY = "practiceDisplayMode_v1";
const PRACTICE_DISPLAY_REPLAY = "REPLAY";
const PRACTICE_DISPLAY_IMAGE = "IMAGE";
let practiceDisplayMode = loadPracticeDisplayMode();
const PRACTICE_CONFIRM_MIN = 4;
const PRACTICE_AUTO_ENTRY_MS = 57000;
const PRACTICE_AUTO_ENTRY_SEC = Math.round(PRACTICE_AUTO_ENTRY_MS / 1000);
const PRACTICE_SEGMENTS = [
  { start: 0, end: 15000, label: "0s" },
  { start: 15000, end: 30000, label: "15s" },
  { start: 30000, end: 45000, label: "30s" },
  { start: 45000, end: 60000, label: "45s" },
];

function loadPracticeDisplayMode() {
  try {
    const raw = localStorage.getItem(PRACTICE_DISPLAY_MODE_KEY);
    return raw === PRACTICE_DISPLAY_IMAGE ? PRACTICE_DISPLAY_IMAGE : PRACTICE_DISPLAY_REPLAY;
  } catch {
    return PRACTICE_DISPLAY_REPLAY;
  }
}
function savePracticeDisplayMode(mode = practiceDisplayMode) {
  try {
    localStorage.setItem(PRACTICE_DISPLAY_MODE_KEY, mode === PRACTICE_DISPLAY_IMAGE ? PRACTICE_DISPLAY_IMAGE : PRACTICE_DISPLAY_REPLAY);
  } catch {}
}
function isPracticeImageMode() {
  return practiceDisplayMode === PRACTICE_DISPLAY_IMAGE;
}
function getPracticeDisplayModeLabel() {
  return isPracticeImageMode() ? "🖼️ Imagen completa" : "▶️ Reproducir";
}
function ensurePracticeDisplayModeButton() {
  if (practiceImageModeBtnEl && practiceImageModeBtnEl.isConnected) return practiceImageModeBtnEl;
  if (!practiceView) return null;

  let btn = document.getElementById("practiceImageModeBtn");
  if (!btn) {
    btn = document.createElement("button");
    btn.id = "practiceImageModeBtn";
    btn.type = "button";
    btn.className = "btn btnGhost";
    btn.style.minHeight = "38px";
    btn.style.borderRadius = "14px";
    btn.style.fontWeight = "900";
    btn.style.fontSize = "13px";
    btn.style.padding = "8px 12px";
    btn.style.whiteSpace = "nowrap";
    btn.style.margin = "8px 0";

    const anchor = practiceRoundLabelEl || practiceCanvas || practiceView.firstElementChild;
    if (anchor && anchor.parentElement) anchor.insertAdjacentElement("afterend", btn);
    else practiceView.prepend(btn);
  }

  btn.onclick = () => {
    practiceDisplayMode = isPracticeImageMode() ? PRACTICE_DISPLAY_REPLAY : PRACTICE_DISPLAY_IMAGE;
    savePracticeDisplayMode();
    updatePracticeDisplayModeButtonUI();
    if (practiceRound && !practiceRound.finished) startPracticeRound(practiceRound.entry);
    else ensurePracticeReady();
  };

  practiceImageModeBtnEl = btn;
  updatePracticeDisplayModeButtonUI();
  return btn;
}
function updatePracticeDisplayModeButtonUI() {
  const btn = practiceImageModeBtnEl || document.getElementById("practiceImageModeBtn");
  if (!btn) return;
  btn.textContent = getPracticeDisplayModeLabel();
  btn.title = isPracticeImageMode()
    ? "Modo imagen completa: muestra toda la formación sin reproducir. Al llegar a 4 puntos netos muestra el resultado."
    : "Modo reproducir: muestra la formación desde el segundo de evaluación y avanza hasta 60s.";
  btn.style.border = isPracticeImageMode() ? "1px solid rgba(34,211,238,.50)" : "1px solid rgba(255,255,255,.16)";
  btn.style.background = isPracticeImageMode()
    ? "linear-gradient(180deg, rgba(34,211,238,.18), rgba(34,211,238,.06))"
    : "linear-gradient(180deg, rgba(255,255,255,.08), rgba(255,255,255,.035))";
  btn.style.color = isPracticeImageMode() ? "#cffafe" : "";
}
function tryPracticeImageModeAutoResult(reason = "IMAGEN_4_PUNTOS") {
  if (!isPracticeImageMode()) return false;
  if (!practiceRound || practiceRound.finished || practiceRound.answer) return false;
  const side = getPracticeEnabledTradeSide();
  if (side !== "CALL" && side !== "PUT") return false;

  practiceRound.autoEntry = {
    type: "PRACTICE_IMAGE_4PTS",
    side,
    ms: 60000,
    sec: 60,
    reason: String(reason || "IMAGEN_4_PUNTOS"),
    confirmationStatus: getPracticeConfirmationStatusText(),
    at: Date.now(),
  };

  const label = side === "CALL" ? "COMPRA" : "VENTA";
  updatePracticeResult(`🖼️ Imagen completa: ${label} llegó a ${PRACTICE_CONFIRM_MIN} puntos. Mostrando resultado…`, side === "CALL" ? "is-itm" : "is-otm");
  finalizePracticeRound(side);
  return true;
}

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
    practice_display_mode: round.displayMode || practiceDisplayMode || PRACTICE_DISPLAY_REPLAY,
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
  const mode = String(entry.mode || "").toUpperCase().trim();
  const version = String(entry.mode_version || entry.giro_version || "");
  return mode === MODE_GIRO_NIVEL || version === GIRO_NIVEL_LOGIC_VERSION;
}

function loadPracticeFilterMode() {
  // MODO ÚNICO: Práctica queda fija en Giro Doble Rechazo.
  // No se alterna entre NORMAL/GIRO/TODOS para no mezclar formaciones.
  try { localStorage.setItem(PRACTICE_FILTER_KEY, MODE_GIRO_NIVEL); } catch {}
  return MODE_GIRO_NIVEL;
}
function savePracticeFilterMode() {
  try { localStorage.setItem(PRACTICE_FILTER_KEY, MODE_GIRO_NIVEL); } catch {}
}
function shouldPracticeOnlyGiro() {
  return true;
}
function shouldPracticeOnlyNormal() {
  return false;
}
function normalizePracticeFilterMode(mode) {
  return MODE_GIRO_NIVEL;
}
function getPracticeFilterTag() {
  return "GIRO DOBLE";
}
function isStrictNormalPracticeEntry(entry) {
  return false;
}
function isStrictGiroPracticeEntry(entry) {
  if (!entry) return false;
  const mode = String(entry.mode || "").toUpperCase().trim();
  const version = String(entry.mode_version || entry.giro_version || "");
  return mode === MODE_GIRO_NIVEL || version === GIRO_NIVEL_LOGIC_VERSION;
}
function applyPracticeFilterButtonUI() {
  const btn = pickEl("practiceFilterBtn");
  if (btn) btn.remove();
}
function ensurePracticeFilterButton() {
  practiceFilterMode = MODE_GIRO_NIVEL;
  savePracticeFilterMode();
  const btn = pickEl("practiceFilterBtn");
  if (btn) btn.remove();
  return null;
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

  // En modo imagen completa no se reproduce la formación: al llegar a 4 puntos netos, muestra resultado al instante.
  if (tryPracticeImageModeAutoResult("CONFIRMACION_IMAGEN_COMPLETA")) return;

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
  const ms = practiceRound.finished || isPracticeImageMode() ? 60000 : (practiceRound.replayMs || practiceRound.cutoffMs || 0);
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

    // Práctica limpia: solo Giro Doble Rechazo.
    // Rechaza entradas viejas de NORMAL, GIRO FLEX, LIKE MANTENIDO, POLARIDAD, etc.
    if (!isStrictGiroPracticeEntry(entry)) return false;
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
function pushPracticeEntryToQueueFront(entry) {
  try {
    const key = getPracticeEntryKey(entry);
    if (!key) return;
    practiceQueue = [String(key), ...(practiceQueue || []).filter((id) => String(id) !== String(key))];
    savePracticeQueueState();
    updatePracticePoolLabel();
  } catch {}
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
    const keys = new Set([
      getPracticePoolStorageKey(MODE_GIRO_NIVEL),
      `${PRACTICE_POOL_STATE_KEY}_${MODE_GIRO_NIVEL}`,
      `${PRACTICE_POOL_STATE_KEY}_ALL`,
      `${PRACTICE_POOL_STATE_KEY}_GIRO`,
      `${PRACTICE_POOL_STATE_KEY}_NORMAL`,
      "practicePoolState_v1_ALL",
      "practicePoolState_v1_GIRO",
      "practicePoolState_v1_NORMAL",
      "practicePoolState_v2_ALL",
      "practicePoolState_v2_GIRO",
      "practicePoolState_v2_NORMAL",
    ]);
    for (const key of keys) localStorage.removeItem(key);
    practiceLastEntryKey = "";
    practiceLastCandleKey = "";
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
    practicePoolLabelEl.textContent = `Pool GIRO DOBLE: ${practiceQueue.length}/${eligible}`;
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
  if (isPracticeImageMode()) return;
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
    replayMs: isPracticeImageMode() ? 60000 : PRACTICE_EVAL_SEC * 1000,
    answer: null,
    finished: false,
    autoEntry: null,
    confirmations: [],
    segmentMarks: freshPracticeSegmentMarks(),
    displayMode: isPracticeImageMode() ? PRACTICE_DISPLAY_IMAGE : PRACTICE_DISPLAY_REPLAY,
  };

  if (practiceRoundLabelEl) {
    practiceRoundLabelEl.textContent = `${chosen.symbol} | GIRO DOBLE RECHAZO | ${chosen.time}`;
  }
  updatePracticePoolLabel();
  ensurePracticeDisplayModeButton();
  setPracticeConfirmationControlsVisible(true);
  updatePracticeExportSaveButtonUI();
  updatePracticeConfirmationUI();
  if (isPracticeImageMode()) {
    updatePracticeResult(`🖼️ Imagen completa: mirá toda la formación, sumá COMPRA o VENTA. Al llegar a ${PRACTICE_CONFIRM_MIN} puntos netos se muestra el resultado.`, "is-pass");
  } else {
    updatePracticeResult(`Marcá confirmaciones direccionales. Con ${PRACTICE_CONFIRM_MIN} netas se habilita COMPRA o VENTA. En ${PRACTICE_AUTO_ENTRY_SEC}s entra automático si ya está habilitada. PASAR siempre vale.`, "is-pass");
  }
  setPracticePassButtonMode("PASS");
  setPracticeDecisionState(false);

  const initialMs = isPracticeImageMode() ? 60000 : practiceRound.cutoffMs;
  const initialTicks = buildPracticeVisibleTicks(practiceRound.ticks, initialMs);
  drawPracticeChart(practiceCanvas, initialTicks, initialMs, practiceRound.segmentMarks);
  if (isPracticeImageMode()) {
    updatePracticeStatusText(`Imagen completa | ${getPracticeConfirmationStatusText()} | al llegar a ${PRACTICE_CONFIRM_MIN} puntos se revela ITM/OTM.`);
  } else {
    practiceRaf = requestAnimationFrame(practiceLoop);
  }
}
function ensurePracticeReady() {
  ensurePracticeFilterButton();
  applyPracticeFilterButtonUI();
  ensurePracticeSimilarBelowPut();
  ensurePracticeDisplayModeButton();
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
    const msgFiltro = "Práctica fija: solo Giro Doble Rechazo.";
    updatePracticeStatusText(`Toca PASAR para empezar una ronda con formaciones de Giro Doble Rechazo sin repetir. ${msgFiltro} En Práctica, las señales siguen activas y pueden auto-abrirse si Auto-abrir está ON.`);
    setPracticeConfirmationControlsVisible(false);
    updatePracticeExportSaveButtonUI();
    updatePracticeResult(`Se usa solo el pool de Giro Doble Rechazo. Modo actual: ${getPracticeDisplayModeLabel()}. En imagen completa, al llegar a ${PRACTICE_CONFIRM_MIN} puntos se revela el resultado.`, "is-pass");
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
    redrawPracticeRoundChart();
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
    const blob = String(text || "").startsWith("data:") ? dataURLToBlob(text) : new Blob([text], { type: mime });
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
      manualGiro: normalizeManualGiroState(it.manualGiro),
      minuteComplete: !!it.minuteComplete,
      ticks: Array.isArray(it.ticks) ? it.ticks : [],
    })),
  };
}
async function exportVotedSignals() {
  // Botón viejo: ahora también respeta los votos de Trades.
  // Si no hay votos en Señales pero sí hay votos en Trades/Práctica/Aprendizaje,
  // exporta el estudio completo para no perder ejemplos.
  try { syncTradesFeedbackFromOpenRows(); } catch {}

  const payload = buildExportPayloadVoted();

  if (!payload.count_voted) {
    const studyPayload = buildExportPayloadTrades();
    if (studyPayload.count_marked_trades || studyPayload.count_practice_selected || studyPayload.count_giro_aprendizaje_examples) {
      const studyJson = JSON.stringify(studyPayload, null, 2);
      try {
        await navigator.clipboard.writeText(studyJson);
        alert(`✅ Exportado estudio al portapapeles: ${studyPayload.count_marked_trades} trades marcados + ${studyPayload.count_practice_selected} claras + ${studyPayload.count_giro_aprendizaje_examples} aprendizaje.`);
        return;
      } catch {
        const ts = new Date().toISOString().replaceAll(":", "-");
        downloadTextFile(`deriv-trades-feedback-estudio-${ts}.json`, studyJson);
        alert(`📥 Descargado estudio: ${studyPayload.count_marked_trades} trades marcados + ${studyPayload.count_practice_selected} claras + ${studyPayload.count_giro_aprendizaje_examples} aprendizaje.`);
        return;
      }
    }
    alert("No hay señales ni trades con voto (like/dislike) para exportar todavía.");
    return;
  }

  const json = JSON.stringify(payload, null, 2);
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
  // Botón viejo oculto: el export correcto ahora es “Exportar estudio”.
  // Si quedó creado por una versión anterior, lo ocultamos y lo redirigimos al estudio.
  let btn = document.getElementById("exportVotedBtn");
  if (btn) {
    btn.style.display = "none";
    btn.onclick = exportTradesJournal;
  }
  return null;
}
(function initExportVoted() {
  ensureExportButton();
})();

/* =========================
   Export Trades (journal)
========================= */
function buildExportPayloadTrades() {
  try { syncTradesFeedbackFromOpenRows(); } catch {}
  const selectedPractice = getPracticeExportSavedList();
  const journalForExport = getTradesJournalExportList();
  const markedTrades = (journalForExport || []).filter((x) => x && (x.vote || x.comment));
  const aprendizaje = Array.isArray(giroAprendizajeExamples) ? giroAprendizajeExamples : [];
  const aprendizajeStats = getGiroAprendizajeStats();
  return {
    exported_at: new Date().toISOString(),
    export_scope: "trades_feedback_practice_clear_and_giro_aprendizaje",
    count_trades_total: (journalForExport || []).length,
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
      manualGiro: normalizeManualGiroState(x.manualGiro),
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
  try { syncTradesFeedbackFromOpenRows(); } catch {}
  const marcados = getTradesJournalExportList().filter((x) => x && (x.vote || x.comment)).length;
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

  signalMode = MODE_GIRO_NIVEL;
  saveAnalysisMode(signalMode);

  const paintMode = () => {
    if (!modeBtn) return;
    modeBtn.textContent = getModeBtnLabel(signalMode);
    modeBtn.classList.add("active-strong", "active");
    modeBtn.title = "Modo único activo: Giro Doble Rechazo/Nivel. No hay otros modos para alternar.";
  };
  paintMode();

  if (modeBtn)
    modeBtn.onclick = () => {
      signalMode = MODE_GIRO_NIVEL;
      saveAnalysisMode(signalMode);
      paintMode();
      toast("🧠 Modo único: GIRO DOBLE RECHAZO + IA", 1500);
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
  const modalPolarityLevel = modalCurrentItem?.giroPolaridad?.level;
  if (Number.isFinite(Number(modalPolarityLevel))) {
    min = Math.min(min, Number(modalPolarityLevel));
    max = Math.max(max, Number(modalPolarityLevel));
  }
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

  // Nivel de polaridad en el modal (si la señal lo trae)
  if (modalCurrentItem?.giroPolaridad && Number.isFinite(Number(modalCurrentItem.giroPolaridad.level))) {
    const pol = modalCurrentItem.giroPolaridad;
    const level = Number(pol.level);
    const yLevel = yOf(level);
    ctx.save();
    ctx.setLineDash([8, 5]);
    ctx.strokeStyle = pol.levelType === "support" ? "rgba(34,197,94,0.95)" : "rgba(248,113,113,0.95)";
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(8, yLevel);
    ctx.lineTo(w - 8, yLevel);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = pol.levelType === "support" ? "rgba(187,247,208,0.98)" : "rgba(254,202,202,0.98)";
    ctx.font = "12px system-ui, sans-serif";
    const roleTxt = pol.levelMode === "sin_nivel"
      ? "ZONA RECHAZO"
      : (pol.originalType ? `${pol.originalType === "support" ? "SOP." : "RES."}→${pol.levelType === "support" ? "SOP." : "RES."}` : `${pol.levelType === "support" ? "SOPORTE" : "RESIST."}`);
    const txt = `${roleTxt} ${level.toFixed(6)}`;
    ctx.fillText(txt, 12, Math.max(18, Math.min(h - 28, yLevel - 6)));
    ctx.restore();
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
function getSignalConfirmationMs(item = modalCurrentItem) {
  if (!item) return 0;
  const now = serverNowMs();
  const itemMinute = Number(item.minute);
  const minuteStart = Number.isFinite(itemMinute) && itemMinute > 0
    ? itemMinute * 60000
    : (Number.isFinite(currentMinuteStartMs) && currentMinuteStartMs
      ? currentMinuteStartMs
      : Math.floor(now / 60000) * 60000);
  return Math.max(0, Math.min(60000, now - minuteStart));
}
function addSignalConfirmation(side = "CALL") {
  if (!modalCurrentItem || !isTradeEntryOpen(modalCurrentItem)) return;
  const safeSide = normalizeSignalConfirmationSide(side);
  if (!safeSide) return;
  modalCurrentItem.signalConfirmations ||= [];
  modalCurrentItem.signalConfirmations.push({ side: safeSide, ms: getSignalConfirmationMs(modalCurrentItem), at: Date.now() });
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
function assertSignalMinimumConfirmations(side = null, item = modalCurrentItem) {
  if (!item) return;
  const wanted = normalizeSignalConfirmationSide(side);
  if (!hasSignalMinimumConfirmations(item, wanted)) {
    const faltan = getSignalMissingConfirmations(wanted, item);
    const label = wanted === "CALL" ? "COMPRA" : wanted === "PUT" ? "VENTA" : "un lado";
    throw new Error(`Faltan ${faltan} punto${faltan === 1 ? "" : "s"} neto${faltan === 1 ? "" : "s"} para ${label}`);
  }
}
function trySignalAutoEntryAt57(reason = "AUTO_57", itemOverride = null) {
  const item = itemOverride || modalCurrentItem;
  if (!item || !isTradeEntryOpen(item)) return false;
  if (item?.trade?.badge) return false;
  if (tradeInFlight) return false;
  if (item?.signalAutoEntry?.attempted) return false;

  const ms = getSignalConfirmationMs(item);
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
  if (modalCurrentItem && modalCurrentItem.id === item.id) updateSignalConfirmationUI();

  toast(`🚀 AUTO ${SIGNAL_AUTO_ENTRY_SEC}s: enviando ${label} ${getTradeScopeText()}…`, 1500);

  Promise.race([
    buyOneClick(side, null, item),
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
      if (modalCurrentItem && modalCurrentItem.id === item.id) {
        updateSignalConfirmationUI();
        requestModalDraw(true);
      }
    });

  return true;
}

function scanSignalAutoEntriesAt57() {
  try {
    if (tradeInFlight) return false;
    const nowMinute = currentServerMinute();
    const candidates = (history || [])
      .filter((it) => it && it.minute === nowMinute && !it?.trade?.badge && !it?.signalAutoEntry?.attempted)
      .filter((it) => getSignalEnabledTradeSide(it));

    for (const it of candidates) {
      if (trySignalAutoEntryAt57("TIMER_57_SCAN", it)) return true;
    }
  } catch {}
  return false;
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
  const locked = isTradeLockedNow();
  const remain = locked ? Math.max(0, disciplineLockUntilMs - Date.now()) : 0;
  const candleClosed = !isOpen;

  if (locked) {
    const polarityTxtLocked = formatGiroPolarityLevel(modalCurrentItem);
    bar.textContent = `🔒 DEMO BLOQUEADA | ${getDisciplineLockReasonText()} | ${getDisciplineCounterText()} | falta ${fmtRemaining(remain)}${polarityTxtLocked ? " | " + polarityTxtLocked : ""}${getC100ModalTag()}`;
    bar.style.color = "#fff";
    bar.style.background = "linear-gradient(180deg, rgba(127,29,29,.92), rgba(69,10,10,.92))";
    bar.style.borderColor = "rgba(248,113,113,.72)";
    bar.style.boxShadow = "0 0 0 1px rgba(248,113,113,.16) inset, 0 0 22px rgba(239,68,68,.24)";
  } else if (isOpen) {
    const sec = String(getCurrentMinuteRemainingSec()).padStart(2, "0");
    const autoTxt = shouldUseAutoHighLowExecution()
      ? ` | AUTO HL C:${formatExecutionPlanMini(callPlan)} V:${formatExecutionPlanMini(putPlan)}`
      : "";
    const polarityTxt = formatGiroPolarityLevel(modalCurrentItem);
    const giroState = shouldBypassGiroOnlyTradeGate()
      ? { active: false }
      : getGiroAllowedTradeSide(modalCurrentItem);
    let giroTxt = "";
    if (giroState.active) {
      if (giroState.bodyDir > 0) giroTxt = " | SOLO GIRO: habilitada VENTA";
      else if (giroState.bodyDir < 0) giroTxt = " | SOLO GIRO: habilitada COMPRA";
      else giroTxt = " | SOLO GIRO: esperando definición";
    }
    bar.textContent = `🟢 VELA ABIERTA | faltan ${sec}s | ${getSignalConfirmationStatusText(modalCurrentItem)} | AUTO ${SIGNAL_AUTO_ENTRY_SEC}s${autoTxt}${giroTxt}${polarityTxt ? " | " + polarityTxt : ""}${getC100ModalTag()}`;
    bar.style.color = "#dcfce7";
    bar.style.background = "rgba(22,163,74,.18)";
    bar.style.borderColor = "rgba(34,197,94,.34)";
    bar.style.boxShadow = "0 0 0 1px rgba(34,197,94,.06) inset";
  } else {
    const polarityTxtClosed = formatGiroPolarityLevel(modalCurrentItem);
    bar.textContent = `${getTradeScopeText()} | VELA CERRADA${polarityTxtClosed ? " | " + polarityTxtClosed : ""}${getC100ModalTag()}`;
    bar.style.color = "rgba(229,231,235,.95)";
    bar.style.background = "rgba(107,114,128,.20)";
    bar.style.borderColor = "rgba(156,163,175,.28)";
    bar.style.boxShadow = "none";
  }


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
      const manualTag = "";
      const c100Tag = getC100ModalTag();
      const polarityTag = formatGiroPolarityLevel(it);
      modalSub.textContent = `${it.time} | ${getTradeScopeText()} | ticks: ${n}${confTag}${tagLive}${dTag ? " | " + dTag : ""}${tBadge}${autoTag}${manualTag}${polarityTag ? " | " + polarityTag : ""}${c100Tag}`;
    }

    updateModalCandleStatusUI();
  });
}

/* =========================
   Giro manual antiengaño
   Capa 100% manual: no detecta, no suma sola.
========================= */
const MANUAL_GIRO_BUTTONS = [
  { key: "avanceReduce", label: "+1 Avance se reduce", weight: 1, kind: "favor" },
  { key: "rompeFalla", label: "+2 Rompe y falla", weight: 2, kind: "favor" },
  { key: "contrarioFuerte", label: "+2 Contrario fuerte", weight: 2, kind: "favor" },
  { key: "respuestaDebil", label: "+1 Respuesta débil", weight: 1, kind: "favor" },
  { key: "rechazoNivel", label: "+2 Rechazo en nivel", weight: 2, kind: "favor" },
  { key: "velaGiro", label: "+1 Vela giro", weight: 1, kind: "favor" },
  { key: "lejosNivel", label: "-2 Lejos del nivel", weight: -2, kind: "contra" },
  { key: "noDesplazo", label: "-2 No desplazó", weight: -2, kind: "contra" },
  { key: "sigueDominando", label: "-2 Sigue dominando", weight: -2, kind: "contra" },
  { key: "trabado", label: "-1 Muy trabado", weight: -1, kind: "contra" },
  { key: "rompeSostiene", label: "-2 Rompe y sostiene", weight: -2, kind: "contra" },
  { key: "estoyForzando", label: "-3 Estoy forzando", weight: -3, kind: "contra", danger: true },
];
function createDefaultManualGiroState() {
  return {
    selected: {
      avanceReduce: false,
      rompeFalla: false,
      contrarioFuerte: false,
      respuestaDebil: false,
      rechazoNivel: false,
      velaGiro: false,
      lejosNivel: false,
      noDesplazo: false,
      sigueDominando: false,
      trabado: false,
      rompeSostiene: false,
      estoyForzando: false,
    },
    favor: 0,
    contra: 0,
    diff: 0,
    status: "NONE",
  };
}
function calculateManualGiroState(state) {
  const base = createDefaultManualGiroState();
  const selected = { ...base.selected, ...(state?.selected || {}) };
  let favor = 0;
  let contra = 0;
  for (const cfg of MANUAL_GIRO_BUTTONS) {
    if (!selected[cfg.key]) continue;
    if (cfg.weight > 0) favor += cfg.weight;
    else contra += Math.abs(cfg.weight);
  }
  const diff = favor - contra;
  const total = favor + contra;
  let status = "NONE";
  if (selected.estoyForzando) status = "FORCING";
  else if (favor >= 4 && contra <= 2 && diff >= 3) status = "OPERABLE";
  else if (total <= 0) status = "NONE";
  else if (contra >= 3 || diff <= 1) status = "NO_OPERAR";
  else if (favor > 0) status = "ESPERAR";
  return { selected, favor, contra, diff, status };
}
function normalizeManualGiroState(state) {
  return calculateManualGiroState(state && typeof state === "object" ? state : createDefaultManualGiroState());
}
function getManualGiroStatusText(status) {
  const s = String(status || "NONE");
  if (s === "OPERABLE") return "🟢 OPERABLE";
  if (s === "ESPERAR") return "🟡 ESPERAR";
  if (s === "NO_OPERAR") return "🔴 NO OPERAR";
  if (s === "FORCING") return "🧠 POSIBLE AUTOENGAÑO";
  return "Sin decisión";
}
function getManualGiroStatusColor(status) {
  const s = String(status || "NONE");
  if (s === "OPERABLE") return "#bbf7d0";
  if (s === "ESPERAR") return "#fde68a";
  if (s === "NO_OPERAR") return "#fecaca";
  if (s === "FORCING") return "#fed7aa";
  return "rgba(255,255,255,.78)";
}
function persistManualGiroForItem(item) {
  if (!item) return;
  item.manualGiro = normalizeManualGiroState(item.manualGiro);
  try {
    const live = item.id ? findHistoryItemById(item.id) : null;
    if (live && live !== item) live.manualGiro = normalizeManualGiroState(item.manualGiro);
    saveHistory(history);
  } catch {}
  try {
    const jid = String(item.journal_id || "");
    const idx = (tradesJournal || []).findIndex((x) => x && ((jid && String(x.journal_id || "") === jid) || (item.id && String(x.id || "") === String(item.id))));
    if (idx >= 0) {
      tradesJournal[idx].manualGiro = normalizeManualGiroState(item.manualGiro);
      saveTradesJournal(tradesJournal);
    }
  } catch {}
}
function ensureManualGiroStateForCurrentItem() {
  if (!modalCurrentItem) return null;
  modalCurrentItem.manualGiro = normalizeManualGiroState(modalCurrentItem.manualGiro);
  return modalCurrentItem.manualGiro;
}
function toggleManualGiroButton(key) {
  return;
}
function makeManualGiroButton(cfg) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.style.display = "none";
  return btn;
}
function ensureManualGiroControls() {
  return null;
}
function updateManualGiroControlsUI() {
  return;
}
function setManualGiroControlsVisible(show) {
  if (manualGiroPanelEl) manualGiroPanelEl.style.display = "none";
  return;
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

  mk("target", "✅ Es mi formación", "Guardar como ejemplo positivo normal para la IA local");
  mk("avoid", "❌ No es", "Guardar como negativo fuerte: baja o bloquea parecidas");
  mk("doubt", "⚠️ Dudosa", "Guardar como referencia débil; no empuja señales fuerte");
  mk("clear", "⭐ Muy clara", "Guardar como positivo fuerte: pesa más que Es mi formación");
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
    giroAprendizajeCountEl.textContent = `🧠 IA local · ⭐${stats.clear} ✅${stats.target} / ❌${stats.avoid}`;
    giroAprendizajeCountEl.style.color = currentLabel ? "#ecfeff" : "rgba(255,255,255,.92)";
    giroAprendizajeCountEl.style.borderColor = currentLabel ? "rgba(34,211,238,.72)" : "rgba(34,211,238,.24)";
  }
  if (giroAprendizajeHintEl) {
    giroAprendizajeHintEl.textContent = currentLabel ? `Esta vela: ${getGiroAprendizajeLabelText(currentLabel)} · ${getGiroAprendizajeLabelWeightText(currentLabel, ex?.source)}` : "⭐ pesa fuerte · ✅ normal · ❌ negativo fuerte · ⚠️ débil";
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
  startPendingContractWatchdog();
}
function removePendingContract(cid) {
  if (!cid) return;
  const s = String(cid);
  const next = (disciplinePendingContracts || []).filter((x) => String(x) !== s);
  disciplinePendingContracts = next;
  pendingContractPollInFlight.delete(s);
  saveDiscipline();
  if (!disciplinePendingContracts.length) stopPendingContractWatchdog();
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

function getDisciplineLockReasonText() {
  if (disciplineWins >= DISCIPLINE_MAX_WINS) return `3 ITM alcanzados`;
  if (disciplineLosses >= DISCIPLINE_MAX_LOSSES) return `2 OTM alcanzados`;
  return `límite alcanzado`;
}
function getDisciplineCounterText() {
  return `${disciplineWins}/${DISCIPLINE_MAX_WINS} ITM · ${disciplineLosses}/${DISCIPLINE_MAX_LOSSES} OTM`;
}
function ensureDisciplineBanner() {
  if (disciplineBannerEl && disciplineBannerEl.isConnected) return disciplineBannerEl;

  let el = document.getElementById("disciplineLockBanner");
  if (!el) {
    el = document.createElement("div");
    el.id = "disciplineLockBanner";
    el.setAttribute("role", "status");
    el.style.position = "fixed";
    el.style.left = "12px";
    el.style.right = "12px";
    el.style.bottom = "14px";
    el.style.zIndex = "99999";
    el.style.display = "none";
    el.style.padding = "13px 14px";
    el.style.borderRadius = "18px";
    el.style.border = "1px solid rgba(248,113,113,.72)";
    el.style.background = "linear-gradient(180deg, rgba(127,29,29,.96), rgba(69,10,10,.96))";
    el.style.color = "#fff";
    el.style.boxShadow = "0 18px 44px rgba(0,0,0,.55), 0 0 28px rgba(239,68,68,.28)";
    el.style.fontWeight = "950";
    el.style.fontSize = "14px";
    el.style.lineHeight = "1.25";
    el.style.textAlign = "center";
    el.style.letterSpacing = ".15px";
    el.style.backdropFilter = "blur(10px)";
    el.style.pointerEvents = "none";
    document.body.appendChild(el);
  }

  disciplineBannerEl = el;
  return disciplineBannerEl;
}
function updateDisciplineBannerUI() {
  const el = ensureDisciplineBanner();
  if (!el) return;

  if (isDisciplineBypassedForCurrentAccount()) {
    el.style.display = "none";
    return;
  }

  const locked = isTradeLockedNow();
  const remain = locked ? Math.max(0, disciplineLockUntilMs - Date.now()) : 0;

  if (locked) {
    el.style.display = "block";
    el.style.borderColor = "rgba(248,113,113,.82)";
    el.style.background = "linear-gradient(180deg, rgba(127,29,29,.98), rgba(69,10,10,.98))";
    el.style.boxShadow = "0 18px 44px rgba(0,0,0,.55), 0 0 28px rgba(239,68,68,.34)";
    el.innerHTML = `🔒 <b>DEMO BLOQUEADA POR DISCIPLINA</b><br>${getDisciplineLockReasonText()} · ${getDisciplineCounterText()} · falta ${fmtRemaining(remain)}`;
    return;
  }

  const closeToLimit = disciplineWins >= DISCIPLINE_MAX_WINS - 1 || disciplineLosses >= DISCIPLINE_MAX_LOSSES - 1;
  if (closeToLimit && (disciplineWins > 0 || disciplineLosses > 0)) {
    el.style.display = "block";
    el.style.borderColor = "rgba(251,191,36,.72)";
    el.style.background = "linear-gradient(180deg, rgba(120,53,15,.96), rgba(69,26,3,.96))";
    el.style.boxShadow = "0 18px 44px rgba(0,0,0,.45), 0 0 22px rgba(251,191,36,.24)";
    el.innerHTML = `⚠️ <b>DISCIPLINA DEMO</b><br>${getDisciplineCounterText()} · bloquea con 3 ITM o 2 OTM`;
    return;
  }

  el.style.display = "none";
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
    return `🔒 DEMO BLOQUEADA ${fmtRemaining(remain)} · ${getDisciplineLockReasonText()} · ${getDisciplineCounterText()}`;
  }

  const pend = (disciplinePendingContracts || []).length;
  const pTxt = pend ? ` • Pendientes:${pend}` : "";
  return `Disciplina DEMO: ${getDisciplineCounterText()}${pTxt}`;
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
  updateDisciplineBannerUI();

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
    toast(`🔒 DEMO BLOQUEADA: ${getDisciplineLockReasonText()} · ${getDisciplineCounterText()} · falta ${fmtRemaining(DISCIPLINE_LOCK_MS)}`, 4200);
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
      scheduleOutcomeFallbackPoll(cid, 45000);
    }
    startPendingContractWatchdog({ immediate: true });

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

  // FIX 💾 -> Práctica:
  // si guardaste una señal para práctica antes de que se resolviera NEXT,
  // al resolverse la próxima vela se mete automáticamente en el pool Giro Doble.
  try {
    if ((outcome === "up" || outcome === "down") && isSignalSavedForPractice(item.id)) {
      const snap = buildPracticeSavedSnapshotFromItem({
        ...item,
        mode: MODE_GIRO_NIVEL,
        mode_version: GIRO_NIVEL_LOGIC_VERSION,
      });
      if (snap) {
        const idx = findPracticeSavedSignalIndex(item.id);
        if (idx >= 0) {
          practiceSavedSignals[idx] = { ...practiceSavedSignals[idx], ...snap, updated_at: Date.now() };
          savePracticeSavedSignals(practiceSavedSignals);
        }
        pushPracticeEntryToQueueFront(snap);
        updatePracticePoolLabel();
      }
    }
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
    const journalId = String(opts.journalId || item?.journal_id || row?.dataset?.journalId || "");
    const signalId = String(opts.signalId || item?.id || row?.dataset?.id || "");
    const nextVote = String(item.vote || "");
    const nextComment = String(item.comment || "");

    let changed = false;
    let targets = [];

    if (journalId) {
      targets = (tradesJournal || []).filter((x) => x && String(x.journal_id || "") === journalId);
    }
    if (!targets.length && signalId) {
      targets = (tradesJournal || []).filter((x) => x && String(x.id || "") === signalId);
    }

    for (const entry of targets) {
      entry.vote = nextVote;
      entry.comment = nextComment;
      entry.feedback_at = Date.now();
      entry.feedback_source = "trades_tab";
      changed = true;
    }

    // Rescate: si por algún motivo la fila de Trades no encontró su entrada en el journal,
    // creamos una entrada mínima con la propia fila para que el voto aparezca en Exportar estudio.
    if (!targets.length && (nextVote || nextComment)) {
      const cloned = {
        ...item,
        journal_id: journalId || item?.journal_id || makeJournalIdFromSignal(item) || `${Date.now()}-${signalId || Math.random()}`,
        id: signalId || item?.id || "",
        vote: nextVote,
        comment: nextComment,
        feedback_at: Date.now(),
        feedback_source: "trades_tab_rescue",
        saved_at: item?.saved_at || Date.now(),
      };
      tradesJournal.unshift(cloned);
      changed = true;
    }

    if (changed) {
      saveTradesJournal(tradesJournal);
      updateExportTradesButtonUI();
    }
    return;
  }

  saveHistory(history);
}

function syncTradesFeedbackFromOpenRows() {
  const list = $("tradesList");
  if (!list) return;
  let changed = false;

  list.querySelectorAll(".row").forEach((row) => {
    const journalId = String(row?.dataset?.journalId || "");
    const signalId = String(row?.dataset?.id || "");
    if (!journalId && !signalId) return;

    const selectedBtn = row.querySelector("button[data-v].selected");
    const vote = String(selectedBtn?.dataset?.v || "");
    const comment = String(row.querySelector(".row-comment")?.value || "");

    let targets = [];
    if (journalId) targets = (tradesJournal || []).filter((x) => x && String(x.journal_id || "") === journalId);
    if (!targets.length && signalId) targets = (tradesJournal || []).filter((x) => x && String(x.id || "") === signalId);

    for (const entry of targets) {
      if (String(entry.vote || "") !== vote || String(entry.comment || "") !== comment) {
        entry.vote = vote;
        entry.comment = comment;
        entry.feedback_at = Date.now();
        entry.feedback_source = "trades_tab";
        changed = true;
      }
    }

    // Si la fila tiene voto/comentario pero no encontramos la entrada en tradesJournal,
    // intentamos reconstruirla desde history por signalId.
    if (!targets.length && (vote || comment)) {
      const base = signalId ? findHistoryItemById(signalId) : null;
      const rescue = {
        ...(base || {}),
        journal_id: journalId || (base ? makeJournalIdFromSignal(base) : `${Date.now()}-${signalId || Math.random()}`),
        id: signalId || base?.id || "",
        vote,
        comment,
        feedback_at: Date.now(),
        feedback_source: "trades_tab_sync_rescue",
        saved_at: Date.now(),
        trade: base?.trade || null,
        ticks: Array.isArray(base?.ticks) ? base.ticks : [],
      };
      tradesJournal.unshift(rescue);
      changed = true;
    }
  });

  if (changed) {
    saveTradesJournal(tradesJournal);
    updateExportTradesButtonUI();
  }
}

function getTradesJournalExportList() {
  const out = [];
  const seen = new Set();

  for (const x of tradesJournal || []) {
    if (!x) continue;
    const key = String(x.journal_id || makeJournalIdFromSignal(x) || x.id || "");
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    out.push(x);
  }

  // Respaldo: si por algún motivo el voto quedó en history y no en el journal,
  // también lo incluimos en el export de estudio para no perder ejemplos.
  for (const it of history || []) {
    if (!it || !(it.vote || it.comment)) continue;
    const badge = String(it?.trade?.badge || "");
    if (badge !== "ITM" && badge !== "OTM") continue;
    const jid = makeJournalIdFromSignal(it);
    if (jid && seen.has(jid)) continue;
    if (jid) seen.add(jid);
    out.push({
      journal_id: jid,
      saved_at: Date.now(),
      feedback_at: Date.now(),
      feedback_source: "signals_tab_fallback",
      vote: it.vote || "",
      comment: it.comment || "",
      id: it.id,
      minute: it.minute,
      time: it.time,
      symbol: it.symbol,
      direction: it.direction,
      mode: it.mode || MODE_GIRO_NIVEL,
      mode_version: it.mode_version || getModeVersion(it.mode || MODE_GIRO_NIVEL) || "",
      nextOutcome: it.nextOutcome || "",
      minuteComplete: !!it.minuteComplete,
      trade: it.trade || null,
      manualGiro: normalizeManualGiroState(it.manualGiro),
      ticks: Array.isArray(it.ticks) ? it.ticks : [],
    });
  }

  return out;
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
  row.dataset.journalId = opts.journalId || item.journal_id || "";

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
      <button class="savePracticeBtn ${savedForPractice ? "selected" : ""}" type="button" title="${savedForPractice ? "Quitar del pool de práctica" : "Guardar en práctica Giro Doble Rechazo"}">💾</button>
      ${opts.source === "trades" && (item?.trade?.badge === "ITM" || item?.trade?.badge === "OTM") ? `<button class="studyCaptureBtn" type="button" title="Ver captura de estudio">📸</button>` : ""}
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
          ? `Ya guardada en práctica Giro Doble Rechazo`
          : `Guardar en práctica Giro Doble Rechazo`;

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
            ? `💾 Guardada para práctica Giro Doble Rechazo`
            : "🗑️ Quitada del pool de práctica",
          1700
        );
      };
    }

    const studyCaptureBtn = row.querySelector(".studyCaptureBtn");
    if (studyCaptureBtn) {
      studyCaptureBtn.style.borderRadius = "12px";
      studyCaptureBtn.style.minWidth = "40px";
      studyCaptureBtn.style.fontWeight = "900";
      studyCaptureBtn.onclick = (e) => {
        e.stopPropagation();
        showStudyCaptureForItem(item);
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
  tickHealthEl.textContent = `Último tick: hace ${ageSec}s${areSignalsPaused() ? " · ⏸️ análisis pausado" : ""}`;
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

const PENDING_CONTRACT_WATCHDOG_INTERVAL_MS = 25000;
const PENDING_CONTRACT_WATCHDOG_TIMEOUT_MS = 9000;
const PENDING_CONTRACT_MIN_POLL_GAP_MS = 22000;
const PENDING_CONTRACT_POC_RATE_LIMIT_COOLDOWN_MS = 90000;
let pendingContractWatchdogTimer = null;
let pendingContractWatchdogRunning = false;
let pendingContractPOCCooldownUntil = 0;
const pendingContractPollInFlight = new Set();
const pendingContractLastPollAt = new Map();
function isPendingContractPOCRateLimitMessage(msg) {
  const s = String(msg || "").toLowerCase();
  return s.includes("rate limit") && s.includes("proposal_open_contract");
}
function setPendingContractPOCCooldown(reason = "rate_limit") {
  pendingContractPOCCooldownUntil = Date.now() + PENDING_CONTRACT_POC_RATE_LIMIT_COOLDOWN_MS;
  try {
    toast("⏳ Deriv limitó consulta de contrato. Espero 90s y no consulto de más.", 2600);
  } catch {}
  return reason;
}
function isPendingContractPOCCooldownActive() {
  return Date.now() < Number(pendingContractPOCCooldownUntil || 0);
}

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
   Watchdog contratos pendientes
   - Solo consulta Deriv cuando hay contract_id pendiente.
   - Se apaga solo cuando no quedan pendientes.
========================= */
function getPendingContractsSnapshot() {
  return Array.from(new Set((disciplinePendingContracts || []).map(String).filter(Boolean)));
}
function startPendingContractWatchdog({ immediate = false } = {}) {
  try {
    const list = getPendingContractsSnapshot();
    if (!list.length) {
      stopPendingContractWatchdog();
      return;
    }
    if (!pendingContractWatchdogTimer) {
      pendingContractWatchdogTimer = setInterval(() => {
        pollPendingContractsOnce("interval");
      }, PENDING_CONTRACT_WATCHDOG_INTERVAL_MS);
    }
    if (immediate) setTimeout(() => pollPendingContractsOnce("immediate"), 15000);
  } catch {}
}
function stopPendingContractWatchdog() {
  try {
    if (pendingContractWatchdogTimer) clearInterval(pendingContractWatchdogTimer);
    pendingContractWatchdogTimer = null;
    pendingContractWatchdogRunning = false;
    pendingContractPollInFlight.clear();
    pendingContractLastPollAt.clear();
  } catch {}
}
function applyClosedContractOutcomeFromPOC(poc, sourceLabel = "watchdog") {
  try {
    const cid = String(poc?.contract_id || "");
    if (!cid) return false;
    if (!(disciplinePendingContracts || []).map(String).includes(cid)) return false;
    if (!poc?.is_sold) return false;

    const status = String(poc.status || "").toLowerCase();
    const profit = Number(poc.profit);

    let isWin = false;
    if (status === "won") isWin = true;
    else if (status === "lost") isWin = false;
    else if (Number.isFinite(profit)) isWin = profit > 0;

    try {
      const signalId = tradeLinks.get(cid) || "";
      const it = signalId ? findHistoryItemById(signalId) : null;
      if (it) {
        setTradeBadge(it, isWin ? "ITM" : "OTM", {
          profit: Number(poc.profit),
          status: String(poc.status || ""),
          sold_time: Number(poc.sell_time || 0),
          contract_id: cid,
          outcome_source: sourceLabel,
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
    updateC100PanelUI();
    toast((isWin ? "✅ ITM (" : "❌ OTM (") + sourceLabel + ") registrada", 1500);
    return true;
  } catch {
    return false;
  }
}
async function pollOnePendingContract(contractId, sourceLabel = "watchdog") {
  const cid = String(contractId || "");
  if (!cid) return false;
  if (pendingContractPollInFlight.has(cid)) return false;
  if (!(disciplinePendingContracts || []).map(String).includes(cid)) return false;
  if (!ws || ws.readyState !== 1) return false;
  if (isPendingContractPOCCooldownActive()) return false;

  const now = Date.now();
  const last = Number(pendingContractLastPollAt.get(cid) || 0);
  if (now - last < PENDING_CONTRACT_MIN_POLL_GAP_MS) return false;
  pendingContractLastPollAt.set(cid, now);

  pendingContractPollInFlight.add(cid);
  try {
    await ensureAuthorized();
    const r = await wsRequest(
      { proposal_open_contract: 1, contract_id: cid },
      PENDING_CONTRACT_WATCHDOG_TIMEOUT_MS
    );
    const errMsg = r?.error?.message || r?.error?.code || "";
    if (errMsg && isPendingContractPOCRateLimitMessage(errMsg)) {
      setPendingContractPOCCooldown("proposal_open_contract_rate_limit");
      return false;
    }
    const poc = r?.proposal_open_contract;
    if (!poc) return false;
    return applyClosedContractOutcomeFromPOC(poc, sourceLabel);
  } catch (err) {
    if (isPendingContractPOCRateLimitMessage(err?.message || err)) {
      setPendingContractPOCCooldown("proposal_open_contract_rate_limit");
    }
    return false;
  } finally {
    pendingContractPollInFlight.delete(cid);
  }
}
async function pollPendingContractsOnce(sourceLabel = "watchdog") {
  try {
    const list = getPendingContractsSnapshot();
    if (!list.length) {
      stopPendingContractWatchdog();
      return;
    }
    if (pendingContractWatchdogRunning) return;
    if (!ws || ws.readyState !== 1) return;
    if (isPendingContractPOCCooldownActive()) return;

    pendingContractWatchdogRunning = true;
    try {
      // Para no chocar con el rate limit de Deriv, se consulta como máximo
      // un contrato pendiente por ciclo. Si hay más, se revisan en ciclos siguientes.
      const cid = list.find((x) => (disciplinePendingContracts || []).map(String).includes(String(x)));
      if (cid) await pollOnePendingContract(cid, sourceLabel);
    } finally {
      pendingContractWatchdogRunning = false;
      if (!getPendingContractsSnapshot().length) stopPendingContractWatchdog();
    }
  } catch {
    pendingContractWatchdogRunning = false;
  }
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
        await pollOnePendingContract(cid, "fallback");
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
function assertEntryWindowOpen(item = modalCurrentItem) {
  if (item && !isTradeEntryOpen(item)) {
    throw new Error("La vela ya cerró");
  }
}

async function buyOneClick(side /* "CALL" | "PUT" */, symbolOverride = null, itemOverride = null) {
  const itemCtx = itemOverride || modalCurrentItem;
  assertCanTrade();
  assertEntryWindowOpen(itemCtx);
  assertSignalMinimumConfirmations(side, itemCtx);
  assertC100CanTrade();

  if (tradeInFlight) throw new Error("Operación en curso");
  tradeInFlight = true;

  try {
    await ensureAuthorized();
    startNewDisciplineWindowIfNeeded();

    const symbol =
      symbolOverride || (itemCtx && itemCtx.symbol) || (modalCurrentItem && modalCurrentItem.symbol) || (history.at(-1)?.symbol || "R_25");
    const stake = Number(getEffectiveTradeStake().toFixed(2));
    let res = null;
    let contractLabel = side;
    let tradeExtra = { side, symbol, stake };

    if (shouldUseAutoHighLowExecution() && itemCtx?.id) {
      ensureSignalAutoPrecalc(itemCtx);
      let plan = getCachedExecutionPlan(itemCtx, side, AUTO_PRECALC_STALE_MS * 2);
      if (!plan) {
        toast(`⏳ Buscando ${side === "CALL" ? "HIGHER" : "LOWER"} rápido…`, 1200);
        plan = await ensureExecutionPlanForTrade(itemCtx, side);
      }
      if (!plan?.proposalId || !Number.isFinite(plan.askPrice)) {
        // MODO ESTRICTO: si está activado High/Low, NO caemos a Rise/Fall.
        // Si Deriv no acepta la barrera fija del par o el pago queda fuera del límite,
        // se cancela la entrada para evitar comprar un contrato distinto al pedido.
        const hlName = side === "CALL" ? "HIGHER" : "LOWER";
        const fixedBarrier = makeHighLowFixedBarrierCandidate(symbol, side)?.barrier || getHighLowFixedBarrierRaw(symbol) || "sin configurar";
        const capTxt = `${Math.round(HIGHLOW_MIN_PAYOUT_TOTAL_PCT)}%-${Math.round(HIGHLOW_MAX_PAYOUT_TOTAL_PCT)}%`;
        toast(`⛔ ${hlName} cancelado: barrera ${fixedBarrier} sin propuesta válida`, 2600);
        throw new Error(`${hlName} cancelado: no hubo propuesta High/Low válida para ${symbol} con barrera ${fixedBarrier}. Posibles causas: Deriv rechazó esa barrera, el pago quedó fuera del rango ${capTxt}, hubo cooldown/rate limit, o el símbolo no aceptó High/Low 1m en ese momento.`);
      } else {
        assertC100PayoutOK(Number(plan.profitPct));

        res = await wsRequest({ buy: plan.proposalId, price: plan.askPrice }, 20000);
        contractLabel = plan.contractType || contractLabel;
        tradeExtra = {
          ...tradeExtra,
          exec_mode: executionMode,
          contract_type: contractLabel,
          barrier: plan.barrier,
          mirrored_barrier: !!plan.mirroredBarrier,
          reference_barrier: plan.referenceBarrier || "",
          payout_pct: Number(plan.profitPct),
          actual_return_pct: Math.round(plan.profitPct),
          payout_total_pct: Number(plan.payoutTotalPct),
          payout_cap_total_pct: HIGHLOW_MAX_PAYOUT_TOTAL_PCT,
          proposal_id: plan.proposalId,
          ic2_enabled: isC100Active(),
          ic2_level: c100State?.level || null,
          ic2_step: c100State?.compoundStep || 0,
        };
      }
    } else if (isC100Active()) {
      // IC2 pide proposal antes de comprar para capturar payout y ejecutar con el stake compuesto exacto.
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
        throw new Error("Deriv no confirmó proposal válida para IC2.");
      }
      const profitPct = ((payout - askPrice) / askPrice) * 100;
      assertC100PayoutOK(profitPct);

      res = await wsRequest({ buy: proposalId, price: askPrice }, 20000);
      tradeExtra = {
        ...tradeExtra,
        exec_mode: "IC2_RISE_FALL_PROPOSAL",
        contract_type: side,
        payout_pct: Number(profitPct),
        proposal_id: proposalId,
        ic2_enabled: true,
        ic2_mode: C100_MODE_LABEL,
        ic2_level: c100State?.level || null,
        ic2_step: c100State?.compoundStep || 0,
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

    if (itemCtx && itemCtx.id) {
      setTradeBadge(itemCtx, "PENDING", { contract_id: String(cid), ...tradeExtra });
      linkContractToSignal(cid, itemCtx.id);
    }

    subscribeContractOutcome(cid, true);
    startPendingContractWatchdog({ immediate: true });
    scheduleOutcomeFallbackPoll(cid, 85000);

    const c100Txt = isC100Active() ? ` | IC2 stake $${stake.toFixed(2)}` : "";
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

  try {
    for (const sym of SYMBOLS) syncCurrentCandleToPolarity(sym, minute);
    saveGiroPolarityCandles();
  } catch {}

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
    candleOC[minute][symbol] = { open: openQ, high: Math.max(openQ, tick.quote), low: Math.min(openQ, tick.quote), close: tick.quote };
  } else {
    candleOC[minute][symbol].high = Math.max(Number(candleOC[minute][symbol].high ?? candleOC[minute][symbol].open ?? tick.quote), tick.quote);
    candleOC[minute][symbol].low = Math.min(Number(candleOC[minute][symbol].low ?? candleOC[minute][symbol].open ?? tick.quote), tick.quote);
    candleOC[minute][symbol].close = tick.quote;
  }
  syncCurrentCandleToPolarity(symbol, minute);

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

  // ✅ FIX AUTO 57: también revisar en cada tick, aunque el modal no haya redibujado.
  scanSignalAutoEntriesAt57();

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
    if (areSignalsPaused()) return;
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
  minQualityGap: 6,
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
   Modo ÚNICO GIRO DOBLE RECHAZO
   Busca giro contra un nivel reciente: resistencia respetada => PUT, soporte respetado => CALL.
   Este es el modo anterior de niveles simples, separado de Polaridad Real.
========================= */
const RULES_GIRO_DOBLE_RECHAZO = {
  // v8: secuencia obligatoria + recorrido moderado antes del nivel.
  // Evita niveles pegados al inicio de la vela. La formación buscada es:
  // 1) vela normal/marubozu: recorrido moderado hasta un nivel fuerte,
  // 2) llegada irregular/estirada o con pérdida de fuerza,
  // 3) respeta el nivel,
  // 4) grupo contrario rechaza fuerte o con incremento de fuerza,
  // 5) dominante vuelve a intentar romper con signos de debilidad,
  // 6) si evalúa en 35s, trabaja en 3 movimientos: ataque amplio + rechazo claro + retesteo débil.
  // v35: nivel/zona más flexible para que no bloquee formaciones buenas por exactitud de precio.
  // 7) si evalúa en 40/45/50/55s, exige además segundo rechazo/aprovechamiento contrario.
  minPoints: 7,
  minPoints35: 5,
  allowPartialAt35: true,
  partialEvalSec: 35,
  minQualityGap: 6,
  zoneMult: 2.35,
  zoneRangeMult: 0.32,
  minApproachRatio: 0.25,
  minOpenToLevelRatio: 0.34,
  minFirstAttackMs: 10000,
  maxFirstAttackMsRatio: 0.82,
  minRouteBodyRatio: 0.56,
  maxRouteIrregularity: 2.55,
  minRejectRatio: 0.120,
  minFirstRejectRatio: 0.105,
  minSecondRejectRatio: 0.050,
  minOppositeAdvanceRatio: 0.060,
  maxCloseBeyondTol: 0.55,
  maxDominantResponseRatio: 0.66,
  maxDominantResponseSlopeVsReject: 0.72,
  veryWeakDominantResponseRatio: 0.44,
  minDominantRetestRatio: 0.045,
  maxSecondAttemptBreakTol: 0.60,
  minClusterGap: 1,
  minClusterSize: 1,
  approachIrregularityMin: 1.12,
  weakAngleRatio: 0.68,
  minRejectionSlopeVsApproach: 0.82,
  minSecondRejectSlopeVsResponse: 0.98,
  allowOneTouchOnlyIfStrongIntracandle: true,
  oneTouchMinFirstRejectRatio: 0.105,
  oneTouchMaxResponseRatio: 0.64,
  oneTouchMinApproachRatio: 0.28,
};
function getGiroNivelSimpleCandidateLevels(symbol, minute, currentRange, rules = RULES_GIRO_DOBLE_RECHAZO) {
  const candles = getGiroPolarityCandles(symbol, minute, 90);
  const tol = getGiroPolarityTolerance(symbol, currentRange);
  const raw = [];
  for (const c of candles) {
    raw.push({ price: Number(c.high), type: "resistance", minute: Number(c.minute) });
    raw.push({ price: Number(c.low), type: "support", minute: Number(c.minute) });
  }
  return clusterGiroPolarityLevels(raw, tol * 1.65).map((lvl) => ({
    ...lvl,
    levelMode: "simple",
    levelType: lvl.originalType === "support" || lvl.type === "support" ? "support" : "resistance",
    tolerance: tol,
  }));
}
function sumAbsDeltaZ(arr, fromIdx, toIdx) {
  let acc = 0;
  const a = Math.max(0, Number(fromIdx || 0));
  const b = Math.min(arr.length - 1, Number(toIdx || 0));
  for (let i = a + 1; i <= b; i++) acc += Math.abs(Number(arr[i].z) - Number(arr[i - 1].z));
  return acc;
}
function clusterSequentialIndexes(indexes) {
  const src = (indexes || []).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (!src.length) return [];
  const out = [];
  let cur = [src[0]];
  for (let i = 1; i < src.length; i++) {
    if (src[i] - src[i - 1] <= 1) cur.push(src[i]);
    else {
      out.push(cur);
      cur = [src[i]];
    }
  }
  if (cur.length) out.push(cur);
  return out;
}
function findMinZIndex(arr, fromIdx, toIdx) {
  let best = -1;
  let bestVal = Infinity;
  const a = Math.max(0, Number(fromIdx || 0));
  const b = Math.min(arr.length - 1, Number(toIdx || 0));
  for (let i = a; i <= b; i++) {
    const z = Number(arr[i]?.z);
    if (Number.isFinite(z) && z < bestVal) {
      bestVal = z;
      best = i;
    }
  }
  return best;
}
function findMaxZIndex(arr, fromIdx, toIdx) {
  let best = -1;
  let bestVal = -Infinity;
  const a = Math.max(0, Number(fromIdx || 0));
  const b = Math.min(arr.length - 1, Number(toIdx || 0));
  for (let i = a; i <= b; i++) {
    const z = Number(arr[i]?.z);
    if (Number.isFinite(z) && z > bestVal) {
      bestVal = z;
      best = i;
    }
  }
  return best;
}
function analyzeGiroMandatorySequence(pts, level, isResistance, zone, tol, range, rules = RULES_GIRO_DOBLE_RECHAZO) {
  const sign = isResistance ? 1 : -1;
  const arr = (pts || [])
    .map((p, idx) => ({ idx, ms: Number(p.ms || 0), q: Number(p.quote), z: sign * Number(p.quote) }))
    .filter((p) => Number.isFinite(p.q) && Number.isFinite(p.z));
  if (arr.length < 7) return null;

  const levelZ = sign * Number(level);
  const evalMs = Math.max(1, Number(arr[arr.length - 1]?.ms || 0));
  const openZ = arr[0].z;

  // La formación NO debe nacer ya pegada al nivel.
  // Tiene que haber recorrido moderado desde el inicio de la vela hasta el nivel.
  const openToLevel = levelZ - openZ;
  const minOpenToLevel = Math.max(range * Number(rules.minOpenToLevelRatio || 0.34), tol * 1.25);
  if (openToLevel < minOpenToLevel) return null;

  const nearIndexes = [];
  for (let i = 0; i < arr.length; i++) {
    if (arr[i].z >= levelZ - zone) nearIndexes.push(i);
  }
  const clusters = clusterSequentialIndexes(nearIndexes).filter((cl) => cl.length >= Math.max(1, Number(rules.minClusterSize || 1)));
  if (clusters.length < 2) return null;

  const minApproach = Math.max(range * Number(rules.minApproachRatio || 0.22), tol * 1.05);
  const minFirstReject = Math.max(range * Number(rules.minFirstRejectRatio || rules.minRejectRatio || 0.075), tol * 0.70);
  const minSecondReject = Math.max(range * Number(rules.minSecondRejectRatio || 0.040), tol * 0.40);
  const minOppositeAdvance = Math.max(range * Number(rules.minOppositeAdvanceRatio || 0.05), tol * 0.35);
  const minFirstAttackMs = Math.max(0, Number(rules.minFirstAttackMs || 10000));
  const maxFirstAttackMs = evalMs * Number(rules.maxFirstAttackMsRatio || 0.86);
  const allowPartialAt35 = !!rules.allowPartialAt35 && evalMs <= (Number(rules.partialEvalSec || 35) * 1000 + 800);

  let best = null;

  for (let a = 0; a < clusters.length - 1; a++) {
    for (let b = a + 1; b < clusters.length; b++) {
      const c1 = clusters[a];
      const c2 = clusters[b];
      if ((c2[0] - c1[c1.length - 1]) < Math.max(1, Number(rules.minClusterGap || 1))) continue;

      const firstTopIdx = findMaxZIndex(arr, c1[0], c1[c1.length - 1]);
      const secondTopIdx = findMaxZIndex(arr, c2[0], c2[c2.length - 1]);
      if (firstTopIdx < 0 || secondTopIdx < 0 || secondTopIdx <= firstTopIdx) continue;
      if (arr[firstTopIdx].ms < minFirstAttackMs || arr[firstTopIdx].ms > maxFirstAttackMs) continue;

      const firstTopZ = arr[firstTopIdx].z;
      const secondTopZ = arr[secondTopIdx].z;
      if (Math.abs(firstTopZ - levelZ) > zone * 1.65) continue;
      if (Math.abs(secondTopZ - levelZ) > zone * 1.85) continue;

      // El recorrido dominante debe verse como vela normal/marubozu: avance real hacia el nivel.
      // No queremos señales donde el nivel aparece en el inicio ni donde solo hay serrucho plano.
      const preLowIdx = findMinZIndex(arr, 0, firstTopIdx);
      if (preLowIdx < 0 || preLowIdx >= firstTopIdx) continue;
      const approachMove = firstTopZ - openZ;
      const approachFromSwing = firstTopZ - arr[preLowIdx].z;
      if (approachMove < minApproach || approachFromSwing < minApproach) continue;

      const routeBodyRatio = approachMove / Math.max(firstTopZ - arr[preLowIdx].z, 1e-9);
      if (routeBodyRatio < Number(rules.minRouteBodyRatio || 0.48)) continue;

      // La llegada debe perder fuerza o estirarse/irregularizarse, pero no ser un caos total.
      const approachPath = sumAbsDeltaZ(arr, 0, firstTopIdx);
      const approachIrregularity = approachPath / Math.max(approachMove, 1e-9);
      if (approachIrregularity > Number(rules.maxRouteIrregularity || 2.85)) continue;

      const midApproachIdx = Math.max(1, Math.floor(firstTopIdx * 0.58));
      const earlyMove = arr[midApproachIdx].z - openZ;
      const lateMove = firstTopZ - arr[midApproachIdx].z;
      const earlyDt = Math.max(1, arr[midApproachIdx].ms - arr[0].ms);
      const lateDt = Math.max(1, arr[firstTopIdx].ms - arr[midApproachIdx].ms);
      const earlySlope = earlyMove / earlyDt;
      const lateSlope = lateMove / lateDt;
      const approachWeakening = earlySlope > 0 && lateSlope <= earlySlope * Number(rules.weakAngleRatio || 0.82);
      const approachIsIrregular = approachIrregularity >= Number(rules.approachIrregularityMin || 1.10);
      const approachIsValid = approachIsIrregular || approachWeakening;
      if (!approachIsValid) continue;

      // Respeta el nivel: no rompe y sostiene claramente del otro lado en el primer ataque.
      const firstBreak = firstTopZ - levelZ;
      if (firstBreak > tol * Number(rules.maxSecondAttemptBreakTol || 0.75)) continue;

      // Grupo contrario entra desde el nivel: rechazo fuerte o con incremento de fuerza.
      const rejectLowIdx = findMinZIndex(arr, firstTopIdx, c2[0]);
      if (rejectLowIdx < 0 || rejectLowIdx <= firstTopIdx) continue;
      const rejection1 = firstTopZ - arr[rejectLowIdx].z;
      if (rejection1 < minFirstReject) continue;
      const rejectionDt = Math.max(1, arr[rejectLowIdx].ms - arr[firstTopIdx].ms);
      const rejectionSlope = rejection1 / rejectionDt;
      const approachSlope = approachMove / Math.max(1, arr[firstTopIdx].ms - arr[0].ms);
      const rejectionHasForce = rejectionSlope >= approachSlope * Number(rules.minRejectionSlopeVsApproach || 0.95) || rejection1 >= range * 0.14;
      if (!rejectionHasForce) continue;

      // El dominante intenta volver a romper, pero con debilidad: menor amplitud o peor ángulo.
      const responseAmp = secondTopZ - arr[rejectLowIdx].z;
      const minDominantRetest = Math.max(range * Number(rules.minDominantRetestRatio || 0.045), tol * 0.45);
      if (responseAmp < minDominantRetest) continue;
      const responseRatio = responseAmp / Math.max(rejection1, 1e-9);
      const responseDt = Math.max(1, arr[secondTopIdx].ms - arr[rejectLowIdx].ms);
      const responseSlope = responseAmp / responseDt;
      const responseSlopeOk = responseSlope <= rejectionSlope * Number(rules.maxDominantResponseSlopeVsReject || 0.66);
      const responseSizeOk = responseRatio <= Number(rules.maxDominantResponseRatio || 0.58);
      const responseVeryWeak = responseRatio <= Number(rules.veryWeakDominantResponseRatio || 0.42);
      // Punto clave: el dominante vuelve al nivel, pero peor.
      // Debe ser menor en tamaño y más lento que el rechazo, salvo que sea extremadamente chico.
      const weakResponse = (responseSizeOk && responseSlopeOk) || responseVeryWeak;
      if (!weakResponse) continue;

      // Segundo intento tampoco debe romper y sostener el nivel.
      const secondBreak = secondTopZ - levelZ;
      if (secondBreak > tol * Number(rules.maxSecondAttemptBreakTol || 0.75)) continue;

      const closeWrongSide = arr[arr.length - 1].z - levelZ;
      if (closeWrongSide > tol * Number(rules.maxCloseBeyondTol || 0.70)) continue;

      // En evaluación de 35s NO exigimos segundo rechazo completo.
      // La señal se arma con 3 movimientos claros:
      // 1) recorrido dominante hasta el nivel,
      // 2) rechazo contrario desde el nivel,
      // 3) respuesta débil del dominante intentando volver.
      let afterLowIdx = -1;
      let rejection2 = 0;
      let closeAdvantage = Math.max(0, secondTopZ - arr[arr.length - 1].z);
      const closeDominantPush = Math.max(0, arr[arr.length - 1].z - secondTopZ);
      let rejection2Slope = 0;
      let secondRejectByAngle = false;
      let partial35 = false;

      if (allowPartialAt35) {
        afterLowIdx = findMinZIndex(arr, secondTopIdx, arr.length - 1);
        if (afterLowIdx > secondTopIdx) {
          rejection2 = Math.max(0, secondTopZ - arr[afterLowIdx].z);
          const rejection2Dt = Math.max(1, arr[afterLowIdx].ms - arr[secondTopIdx].ms);
          rejection2Slope = rejection2 / rejection2Dt;
          secondRejectByAngle = rejection2Slope >= responseSlope * Number(rules.minSecondRejectSlopeVsResponse || 0.92) && rejection2 >= tol * 0.30;
        }
        partial35 = true;
      } else {
        // En 40s+ sí se exige el punto 7: el contrario vuelve a rechazar.
        afterLowIdx = findMinZIndex(arr, secondTopIdx, arr.length - 1);
        if (afterLowIdx < 0 || afterLowIdx <= secondTopIdx) continue;
        rejection2 = secondTopZ - arr[afterLowIdx].z;
        closeAdvantage = secondTopZ - arr[arr.length - 1].z;
        const rejection2Dt = Math.max(1, arr[afterLowIdx].ms - arr[secondTopIdx].ms);
        rejection2Slope = rejection2 / rejection2Dt;
        const secondRejectBySize = Math.max(rejection2, closeAdvantage) >= minSecondReject;
        secondRejectByAngle = rejection2Slope >= responseSlope * Number(rules.minSecondRejectSlopeVsResponse || 0.92) && rejection2 >= tol * 0.30;
        if (!secondRejectBySize && !secondRejectByAngle) continue;
        if (closeAdvantage < minOppositeAdvance && rejection2 < minOppositeAdvance * 1.15 && !secondRejectByAngle) continue;
      }

      const score =
        approachMove / Math.max(range, 1e-9) * 18 +
        Math.min(2.2, approachIrregularity) * 6 +
        (approachWeakening ? 16 : 0) +
        routeBodyRatio * 10 +
        rejection1 / Math.max(range, 1e-9) * 26 +
        (rejectionHasForce ? 12 : 0) +
        (1 - Math.min(1.25, responseRatio) / 1.25) * 26 +
        rejection2 / Math.max(range, 1e-9) * 18 +
        (secondRejectByAngle ? 10 : 0) +
        Math.max(0, -closeWrongSide / Math.max(tol, 1e-9)) * 6 +
        (partial35 ? 8 : 0);

      const result = {
        firstTopIdx,
        rejectLowIdx,
        secondTopIdx,
        afterLowIdx,
        firstExtreme: sign * firstTopZ,
        rejectionExtreme: sign * arr[rejectLowIdx].z,
        secondExtreme: sign * secondTopZ,
        finalExtreme: afterLowIdx > 0 ? sign * arr[afterLowIdx].z : sign * arr[arr.length - 1].z,
        openToLevel,
        approachMove,
        approachFromSwing,
        routeBodyRatio,
        approachIrregularity,
        approachWeakening,
        rejection1,
        rejectionSlope,
        rejectionHasForce,
        responseAmp,
        responseRatio,
        responseSlope,
        weakResponse,
        rejection2,
        rejection2Slope,
        secondRejectByAngle,
        closeAdvantage,
        closeWrongSide,
        partial35,
        stage: partial35 ? "35s_tres_movimientos" : "secuencia_completa_doble_rechazo",
        score,
      };

      if (!best || result.score > best.score) best = result;
    }
  }

  return best;
}

function getGiroMajorMovementLegs(arr, range, minFrac = 0.085) {
  // Convierte la vela en recorridos principales, ignorando micro-serrucho.
  // Para el giro que busca Gabriel, la secuencia válida debe ser:
  // 1) ataque amplio, 2) rechazo, 3) respuesta débil, 4) aprovechamiento/segundo rechazo opcional.
  const minLeg = Math.max(Number(range || 0) * minFrac, 1e-12);
  const pts = (arr || []).filter((p) => Number.isFinite(Number(p.z)));
  if (pts.length < 3) return [];
  const pivots = [{ idx: 0, z: pts[0].z }];
  let dir = 0;
  let extremeIdx = 0;
  let extremeZ = pts[0].z;

  for (let i = 1; i < pts.length; i++) {
    const z = pts[i].z;
    if (!Number.isFinite(z)) continue;
    if (!dir) {
      const d = z - pivots[pivots.length - 1].z;
      if (Math.abs(d) >= minLeg) {
        dir = Math.sign(d);
        extremeIdx = i;
        extremeZ = z;
      }
      continue;
    }
    const movedWithDir = (z - extremeZ) * dir;
    if (movedWithDir >= 0) {
      extremeIdx = i;
      extremeZ = z;
      continue;
    }
    const reversal = (extremeZ - z) * dir;
    if (reversal >= minLeg) {
      const lastPivot = pivots[pivots.length - 1];
      if (Math.abs(extremeZ - lastPivot.z) >= minLeg) pivots.push({ idx: extremeIdx, z: extremeZ });
      dir = -dir;
      extremeIdx = i;
      extremeZ = z;
    }
  }
  const lastPivot = pivots[pivots.length - 1];
  if (Math.abs(extremeZ - lastPivot.z) >= minLeg) pivots.push({ idx: extremeIdx, z: extremeZ });

  const legs = [];
  for (let i = 1; i < pivots.length; i++) {
    const a = pivots[i - 1];
    const b = pivots[i];
    const move = b.z - a.z;
    if (Math.abs(move) >= minLeg) legs.push({
      sign: Math.sign(move),
      startIdx: a.idx,
      endIdx: b.idx,
      size: Math.abs(move),
      startZ: a.z,
      endZ: b.z,
    });
  }
  return legs;
}
function isNearMajorLegEnd(idx, leg, tolerance = 3) {
  if (!leg || !Number.isFinite(Number(idx))) return false;
  return Math.abs(Number(idx) - Number(leg.endIdx)) <= tolerance;
}
function analyzeGiroSinNivelSide(pts, isResistance, range, rules = RULES_GIRO_DOBLE_RECHAZO) {
  // v37: Giro por ZONA INTRAVELA.
  // No depende de un soporte/resistencia histórico elegido por la app.
  // Usa como zona de referencia el extremo del primer ataque dentro de la vela.
  // Secuencia obligatoria: ataque amplio -> rechazo claro -> retesteo/vuelta débil.
  const sign = isResistance ? 1 : -1;
  const arr = (pts || [])
    .map((p, idx) => ({ idx, ms: Number(p.ms || 0), q: Number(p.quote), z: sign * Number(p.quote) }))
    .filter((p) => Number.isFinite(p.q) && Number.isFinite(p.z));
  if (arr.length < 7) return null;

  const evalMs = Math.max(1, Number(arr[arr.length - 1]?.ms || 0));
  const allowPartialAt35 = !!rules.allowPartialAt35 && evalMs <= (Number(rules.partialEvalSec || 35) * 1000 + 800);
  const minFirstAttackMs = allowPartialAt35 ? 7500 : 9000;
  const maxFirstAttackMs = evalMs * (allowPartialAt35 ? 0.66 : 0.68);
  const openZ = arr[0].z;

  // Ataque amplio: lo principal. La primera pata tiene que tener desplazamiento real.
  const minAttackFromSwing = range * (allowPartialAt35 ? 0.32 : 0.35);
  const minAttackFromOpen = range * (allowPartialAt35 ? 0.18 : 0.21);
  const minFirstReject = range * (allowPartialAt35 ? 0.115 : 0.135);
  const minRetest = range * (allowPartialAt35 ? 0.045 : 0.052);
  const maxResponseRatio = allowPartialAt35 ? 0.70 : 0.62;
  const maxBreak = range * (allowPartialAt35 ? 0.050 : 0.045);

  // v39: máximo 4 recorridos principales antes de la señal.
  // La vela válida tiene que leerse simple: ataque -> rechazo -> respuesta débil -> aprovechamiento opcional.
  const majorLegs = getGiroMajorMovementLegs(arr, range, allowPartialAt35 ? 0.105 : 0.115);
  const hasReliableLegs = majorLegs.length >= 3;
  // v40: mantenemos la idea de máximo 4 movimientos, pero ignorando micro-movimientos.
  // Si el detector de recorridos no logra separar bien la vela, no bloquea todo: la secuencia
  // ataque -> rechazo -> retesteo débil todavía se valida con amplitud, velocidad y ángulo.
  if (majorLegs.length > 5) return null;
  if (hasReliableLegs && (majorLegs[0].sign !== 1 || majorLegs[1].sign !== -1 || majorLegs[2].sign !== 1)) return null;
  if (!allowPartialAt35 && hasReliableLegs && majorLegs.length >= 4 && majorLegs[3]?.sign !== -1) return null;

  let best = null;

  for (let firstTopIdx = 2; firstTopIdx <= arr.length - 5; firstTopIdx++) {
    const firstTopZ = arr[firstTopIdx].z;
    if (hasReliableLegs && !isNearMajorLegEnd(firstTopIdx, majorLegs[0], 7)) continue;
    if (arr[firstTopIdx].ms < minFirstAttackMs || arr[firstTopIdx].ms > maxFirstAttackMs) continue;

    // La primera zona debe nacer de un ataque real: extremo dominante hasta ese punto.
    const prevMax = findMaxZIndex(arr, 0, firstTopIdx);
    if (prevMax !== firstTopIdx) continue;

    const preLowIdx = findMinZIndex(arr, 0, firstTopIdx);
    if (preLowIdx < 0 || preLowIdx >= firstTopIdx) continue;

    const attackFromSwing = firstTopZ - arr[preLowIdx].z;
    const attackFromOpen = firstTopZ - openZ;
    if (attackFromSwing < minAttackFromSwing) continue;
    if (attackFromOpen < minAttackFromOpen && attackFromSwing < range * 0.40) continue;

    const attackPath = sumAbsDeltaZ(arr, 0, firstTopIdx);
    const attackEfficiency = attackFromSwing / Math.max(attackPath, 1e-9);
    if (attackEfficiency < 0.38) continue; // v38: evita recorridos en serrucho/trabados; necesitamos ataque real
    const attackSlope = attackFromSwing / Math.max(1, arr[firstTopIdx].ms - arr[preLowIdx].ms);

    // La llegada puede ser fuerte, normal o irregular, pero no debe ser ruido plano.
    const lateStartIdx = Math.max(preLowIdx + 1, Math.floor((preLowIdx + firstTopIdx) * 0.58));
    const earlyMove = arr[lateStartIdx].z - arr[preLowIdx].z;
    const lateMove = firstTopZ - arr[lateStartIdx].z;
    const earlyDt = Math.max(1, arr[lateStartIdx].ms - arr[preLowIdx].ms);
    const lateDt = Math.max(1, arr[firstTopIdx].ms - arr[lateStartIdx].ms);
    const lateWeakening = earlyMove > 0 && (lateMove / lateDt) <= (earlyMove / earlyDt) * 0.96;

    for (let rejectLowIdx = firstTopIdx + 1; rejectLowIdx <= arr.length - 4; rejectLowIdx++) {
      // Rechazo claro del contrario: después del primer extremo tiene que aparecer una salida en contra.
      if (hasReliableLegs && !isNearMajorLegEnd(rejectLowIdx, majorLegs[1], 7)) continue;
      const minAfterAttack = findMinZIndex(arr, firstTopIdx, rejectLowIdx);
      if (minAfterAttack !== rejectLowIdx) continue;

      const rejectLowZ = arr[rejectLowIdx].z;
      const rejection1 = firstTopZ - rejectLowZ;
      if (rejection1 < minFirstReject) continue;

      const rejectionSlope = rejection1 / Math.max(1, arr[rejectLowIdx].ms - arr[firstTopIdx].ms);
      const rejectionHasForce = rejectionSlope >= attackSlope * 0.62 || rejection1 >= range * 0.155;
      if (!rejectionHasForce) continue;

      // Retesteo débil: el dominante vuelve hacia la zona, pero con menos fuerza/ángulo/amplitud.
      const secondTopIdx = findMaxZIndex(arr, rejectLowIdx + 1, arr.length - 1);
      if (secondTopIdx <= rejectLowIdx) continue;
      if (hasReliableLegs && !isNearMajorLegEnd(secondTopIdx, majorLegs[2], 8)) continue;
      const secondTopZ = arr[secondTopIdx].z;
      const responseAmp = secondTopZ - rejectLowZ;
      if (responseAmp < minRetest) continue;
      if (secondTopZ > firstTopZ + maxBreak) continue; // rompe la zona con fuerza => no es giro

      const responseRatio = responseAmp / Math.max(rejection1, 1e-9);
      const responseSlope = responseAmp / Math.max(1, arr[secondTopIdx].ms - arr[rejectLowIdx].ms);
      const weakBySize = responseRatio <= maxResponseRatio;
      const weakBySpeed = responseSlope <= Math.max(attackSlope * 0.68, rejectionSlope * 0.78);
      const lowerHigh = secondTopZ <= firstTopZ - range * (allowPartialAt35 ? 0.025 : 0.035);
      const noStrongBreak = secondTopZ <= firstTopZ + maxBreak;
      const weakResponse = noStrongBreak && weakBySpeed && (weakBySize || lowerHigh || responseRatio <= 0.48);
      if (!weakResponse) continue;

      // v38: aunque en 35s no exigimos segundo rechazo completo, sí exigimos que
      // después del retesteo débil el contrario empiece a tomar control o, como mínimo,
      // que el dominante no cierre empujando fuerte. Esto elimina señales que salen por
      // cualquier rebote sin aprovechamiento contrario.

      let afterLowIdx = -1;
      let rejection2 = 0;
      let closeAdvantage = Math.max(0, secondTopZ - arr[arr.length - 1].z);
      const closeDominantPush = Math.max(0, arr[arr.length - 1].z - secondTopZ);
      let rejection2Slope = 0;
      let secondRejectByAngle = false;
      if (!allowPartialAt35) {
        afterLowIdx = findMinZIndex(arr, secondTopIdx, arr.length - 1);
        if (afterLowIdx <= secondTopIdx) continue;
        if (hasReliableLegs && majorLegs[3] && !isNearMajorLegEnd(afterLowIdx, majorLegs[3], 8)) continue;
        rejection2 = secondTopZ - arr[afterLowIdx].z;
        rejection2Slope = rejection2 / Math.max(1, arr[afterLowIdx].ms - arr[secondTopIdx].ms);
        secondRejectByAngle = rejection2Slope >= responseSlope * 0.85 && rejection2 >= range * 0.040;
        if (rejection2 < range * 0.052 && closeAdvantage < range * 0.048 && !secondRejectByAngle) continue;
      } else {
        afterLowIdx = findMinZIndex(arr, secondTopIdx, arr.length - 1);
        if (afterLowIdx > secondTopIdx) {
          rejection2 = Math.max(0, secondTopZ - arr[afterLowIdx].z);
          rejection2Slope = rejection2 / Math.max(1, arr[afterLowIdx].ms - arr[secondTopIdx].ms);
          secondRejectByAngle = rejection2Slope >= responseSlope * 0.90 && rejection2 >= range * 0.035;
        }
        if (closeDominantPush > range * 0.040) continue;
        if (closeAdvantage < range * 0.010 && rejection2 < range * 0.016 && !secondRejectByAngle) continue;
      }

      let points = 0;
      if (attackFromSwing >= minAttackFromSwing) points += 1;
      if (attackFromOpen >= minAttackFromOpen) points += 1;
      if (attackEfficiency >= 0.34) points += 1;
      if (lateWeakening || attackEfficiency <= 0.78) points += 1;
      if (rejection1 >= minFirstReject) points += 1;
      if (rejectionHasForce) points += 1;
      if (weakBySize) points += 1;
      if (weakBySpeed) points += 1;
      if (lowerHigh) points += 1;
      if (!allowPartialAt35 && (rejection2 >= range * 0.052 || secondRejectByAngle || closeAdvantage >= range * 0.048)) points += 1;

      const requiredPoints = allowPartialAt35 ? 6 : 8;
      if (points < requiredPoints) continue;

      const zoneRetestQuality = Math.max(0, 1 - Math.max(0, secondTopZ - firstTopZ) / Math.max(maxBreak, 1e-9));
      const score =
        (attackFromSwing / Math.max(range, 1e-9)) * 24 +
        attackEfficiency * 12 +
        (lateWeakening ? 7 : 0) +
        (rejection1 / Math.max(range, 1e-9)) * 32 +
        (rejectionHasForce ? 10 : 0) +
        (1 - Math.min(1.2, responseRatio) / 1.2) * 34 +
        (weakBySpeed ? 14 : 0) +
        (lowerHigh ? 12 : 0) +
        zoneRetestQuality * 10 +
        (rejection2 / Math.max(range, 1e-9)) * 16 +
        points * 10 +
        (allowPartialAt35 ? 7 : 0);

      const res = {
        isResistance,
        direction: isResistance ? "PUT" : "CALL",
        level: sign * firstTopZ,
        firstTopIdx,
        rejectLowIdx,
        secondTopIdx,
        afterLowIdx,
        attackFromSwing,
        attackFromOpen,
        attackEfficiency,
        lateWeakening,
        rejection1,
        rejectionSlope,
        rejectionHasForce,
        responseAmp,
        responseRatio,
        responseSlope,
        weakResponse,
        weakBySize,
        weakBySpeed,
        lowerHigh,
        noStrongBreak,
        rejection2,
        rejection2Slope,
        secondRejectByAngle,
        closeAdvantage,
        zoneRetestQuality,
        movementLegs: majorLegs.length,
        movementFilter: hasReliableLegs ? "macro" : "secuencia",
        partial35: allowPartialAt35,
        stage: allowPartialAt35 ? "35s_max4_ataque_rechazo_respuesta_debil" : "max4_ataque_rechazo_respuesta_debil_aprovechamiento",
        points,
        score,
      };
      if (!best || res.score > best.score) best = res;
    }
  }
  return best;
}
function analyzeGiroSinNivelCandidate(candidate, minute, rules = RULES_GIRO_DOBLE_RECHAZO) {
  const ticks = (candidate?.ticks || []).slice().sort((a, b) => Number(a.ms) - Number(b.ms));
  if (ticks.length < 7) return null;

  const evalMs = Math.max(35000, EVAL_SEC * 1000);
  const p0 = Number(getPriceAtMs(ticks, 0));
  const pE = Number(getPriceAtMs(ticks, evalMs));
  if (!Number.isFinite(p0) || !Number.isFinite(pE)) return null;

  const pts = ensureTicksWithBoundary(ticks, evalMs);
  const qs = pts.map((p) => Number(p.quote)).filter(Number.isFinite);
  if (qs.length < 5) return null;

  const high = Math.max(...qs);
  const low = Math.min(...qs);
  const range = Math.max(high - low, 1e-9);
  const evalAbs = Math.abs(pE);
  const minRangeForSymbol = Math.max(evalAbs * 0.000010, 1e-9);
  if (range < minRangeForSymbol) return null;

  const put = analyzeGiroSinNivelSide(pts, true, range, rules);
  const call = analyzeGiroSinNivelSide(pts, false, range, rules);
  const seq = put && call ? (put.score >= call.score ? put : call) : (put || call);
  if (!seq) return null;

  const direction = seq.direction;
  const quality = seq.score;
  return {
    direction,
    quality,
    points: seq.points,
    meta: {
      level: seq.level,
      levelMode: "sin_nivel",
      levelType: seq.isResistance ? "resistance" : "support",
      direction,
      tolerance: range * 0.05,
      zone: range * 0.16,
      touches: 0,
      points: seq.points,
      high,
      low,
      p0,
      pE,
      attackFromSwing: seq.attackFromSwing,
      attackFromOpen: seq.attackFromOpen,
      attackEfficiency: seq.attackEfficiency,
      approachWeakening: !!seq.lateWeakening,
      firstRejection: seq.rejection1,
      rejectionHasForce: !!seq.rejectionHasForce,
      responseRatio: seq.responseRatio,
      responseSlope: seq.responseSlope,
      weakResponse: !!seq.weakResponse,
      lowerHigh: !!seq.lowerHigh,
      secondRejection: seq.rejection2,
      secondRejectByAngle: !!seq.secondRejectByAngle,
      closeAdvantage: seq.closeAdvantage,
      partial35: !!seq.partial35,
      stage: seq.stage,
      status: seq.partial35
        ? "35s: máximo 4 recorridos · ataque amplio + rechazo fuerte + respuesta débil"
        : "máximo 4 recorridos · ataque amplio + rechazo fuerte + respuesta débil + aprovechamiento",
      logic: seq.isResistance
        ? "zona intravela estricta: ataque amplio, rechazo fuerte y retesteo débil real => PUT"
        : "zona intravela estricta: ataque amplio, rechazo fuerte y retesteo débil real => CALL",
    },
  };
}

function analyzeGiroNivelSimpleCandidate(candidate, minute, rules = RULES_GIRO_DOBLE_RECHAZO) {
  const ticks = (candidate?.ticks || []).slice().sort((a, b) => Number(a.ms) - Number(b.ms));
  if (ticks.length < 7) return null;

  const evalMs = Math.max(35000, EVAL_SEC * 1000);
  const p0 = Number(getPriceAtMs(ticks, 0));
  const pE = Number(getPriceAtMs(ticks, evalMs));
  if (!Number.isFinite(p0) || !Number.isFinite(pE)) return null;

  const pts = ensureTicksWithBoundary(ticks, evalMs);
  const qs = pts.map((p) => Number(p.quote)).filter(Number.isFinite);
  if (qs.length < 5) return null;

  const high = Math.max(...qs);
  const low = Math.min(...qs);
  const range = Math.max(high - low, 1e-9);
  const levels = getGiroNivelSimpleCandidateLevels(candidate.symbol, minute, range, rules);
  if (!levels.length) return null;

  const evalAbs = Math.abs(pE);
  const minRangeForSymbol = Math.max(evalAbs * 0.000010, 1e-9);
  if (range < minRangeForSymbol) return null;

  const matches = [];
  for (const lvl of levels) {
    const level = Number(lvl.price);
    const tol = Number(lvl.tolerance || getGiroPolarityTolerance(candidate.symbol, range));
    if (!Number.isFinite(level) || !Number.isFinite(tol) || tol <= 0) continue;

    const isResistance = (lvl.levelType || lvl.originalType || lvl.type) === "resistance";
    const zone = Math.max(tol * rules.zoneMult, range * rules.zoneRangeMult);
    const seq = analyzeGiroMandatorySequence(pts, level, isResistance, zone, tol, range, rules);
    if (!seq) continue;

    const direction = isResistance ? "PUT" : "CALL";
    const touchStrength = Math.min(5, Number(lvl.touches || 1));

    // Si el nivel tiene 1 solo toque externo, solo lo aceptamos cuando la estructura intravela es MUY clara:
    // ataque amplio + rechazo fuerte + retesteo débil. Esto evita niveles flojos que generan señales cualquiera.
    if (touchStrength < 2 && rules.allowOneTouchOnlyIfStrongIntracandle) {
      const oneTouchStrong =
        seq.approachMove >= range * Number(rules.oneTouchMinApproachRatio || 0.36) &&
        seq.rejection1 >= range * Number(rules.oneTouchMinFirstRejectRatio || 0.14) &&
        seq.responseRatio <= Number(rules.oneTouchMaxResponseRatio || 0.52) &&
        seq.weakResponse &&
        Math.abs(seq.closeWrongSide || 0) <= tol * Number(rules.maxCloseBeyondTol || 0.38);
      if (!oneTouchStrong) continue;
    }

    const distClose = Math.abs(pE - level);
    const nearScore = Math.max(0, 1 - distClose / Math.max(zone, 1e-9));
    const rejectRatio = Math.max(seq.rejection1, seq.rejection2) / range;
    const closeBeyond = isResistance ? pE - level : level - pE;

    let points = 0;
    if (touchStrength >= 2) points += 1;
    if (touchStrength >= 3) points += 1;
    if (seq.openToLevel >= Math.max(range * Number(rules.minOpenToLevelRatio || 0.34), tol * 1.25)) points += 1;
    if (seq.approachMove >= range * Number(rules.minApproachRatio || 0.22)) points += 1;
    if (seq.routeBodyRatio >= Number(rules.minRouteBodyRatio || 0.48)) points += 1;
    if (seq.approachIrregularity >= Number(rules.approachIrregularityMin || 1.10) || seq.approachWeakening) points += 1;
    if (seq.rejection1 >= range * Number(rules.minFirstRejectRatio || 0.085) || seq.rejectionHasForce) points += 1;
    if (seq.weakResponse) points += 1;
    if (!seq.partial35 && (seq.rejection2 >= range * Number(rules.minSecondRejectRatio || 0.040) || seq.secondRejectByAngle)) points += 1;
    if (!seq.partial35 && (seq.closeAdvantage >= range * Number(rules.minOppositeAdvanceRatio || 0.050) || seq.secondRejectByAngle)) points += 1;
    if (seq.partial35 && seq.responseRatio <= Number(rules.maxDominantResponseRatio || 0.72)) points += 1;
    if (Math.abs(closeBeyond) <= tol * Number(rules.maxCloseBeyondTol || 0.55)) points += 1;
    const requiredPoints = seq.partial35 ? Number(rules.minPoints35 || 6) : Number(rules.minPoints || 7);
    if (points < requiredPoints) continue;

    const quality =
      seq.score +
      points * 13 +
      touchStrength * 6 +
      nearScore * 12 -
      Math.max(0, closeBeyond / Math.max(tol, 1e-9)) * 10;

    matches.push({
      direction,
      quality,
      points,
      meta: {
        level,
        levelMode: "mandatory_sequence",
        levelType: isResistance ? "resistance" : "support",
        direction,
        tolerance: tol,
        zone,
        touches: touchStrength,
        points,
        distClose,
        rejectRatio,
        closeBeyond,
        high,
        low,
        p0,
        pE,
        firstRejection: seq.rejection1,
        secondRejection: seq.rejection2,
        responseRatio: seq.responseRatio,
        openToLevel: seq.openToLevel,
        routeBodyRatio: seq.routeBodyRatio,
        approachIrregularity: seq.approachIrregularity,
        approachWeakening: !!seq.approachWeakening,
        rejectionHasForce: !!seq.rejectionHasForce,
        weakResponse: !!seq.weakResponse,
        oneTouchStrong: touchStrength < 2,
        responseSlope: seq.responseSlope,
        rejectionSlope: seq.rejectionSlope,
        rejection2Slope: seq.rejection2Slope,
        secondRejectByAngle: !!seq.secondRejectByAngle,
        closeAdvantage: seq.closeAdvantage,
        stage: seq.stage,
        partial35: !!seq.partial35,
        status: seq.partial35
          ? "35s: ataque amplio + rechazo claro + retesteo débil"
          : "ataque amplio al nivel + rechazo claro + retesteo débil + segundo rechazo",
        logic: seq.partial35
          ? (isResistance
              ? "35s: 1) compradores atacan resistencia con recorrido amplio; 2) vendedores rechazan claro; 3) compradores retestean débil => PUT"
              : "35s: 1) vendedores atacan soporte con recorrido amplio; 2) compradores rechazan claro; 3) vendedores retestean débil => CALL")
          : (isResistance
              ? "compradores atacan resistencia con recorrido amplio, pierden fuerza; vendedores rechazan claro; compradores retestean débil; vendedores vuelven a rechazar => PUT"
              : "vendedores atacan soporte con recorrido amplio, pierden fuerza; compradores rechazan claro; vendedores retestean débil; compradores vuelven a rechazar => CALL"),
      },
    });
  }

  if (!matches.length) return null;
  matches.sort((a, b) => b.quality - a.quality || b.points - a.points);
  return matches[0];
}

/* =========================
   Modo GIRO POLARIDAD REAL
   Secuencia obligatoria:
   1) Nivel creado por 2+ toques.
   2) Ruptura con cierre del otro lado.
   3) Cambio de rol.
   4) Retesteo actual respetado.
========================= */
const RULES_GIRO_POLARIDAD = {
  minPoints: 5,
  minQualityGap: 6,
  lookbackCandles: 120,
  minOriginalTouches: 2,
  clusterTolMult: 1.25,
  breakCloseTolMult: 0.70,
  zoneMult: 1.85,
  zoneRangeMult: 0.32,
  minRetestAfterBreak: 1,
  minRejectRatio: 0.08,
  maxCloseWrongSideTol: 0.35,
  minLiveRangeFactor: 0.000012,
};
function analyzeGiroPolaridadCandidate(candidate, minute, rules = RULES_GIRO_POLARIDAD) {
  const ticks = (candidate?.ticks || []).slice().sort((a, b) => Number(a.ms) - Number(b.ms));
  if (ticks.length < 6) return null;

  const evalMs = Math.max(35000, EVAL_SEC * 1000);
  const p0 = Number(getPriceAtMs(ticks, 0));
  const pE = Number(getPriceAtMs(ticks, evalMs));
  if (!Number.isFinite(p0) || !Number.isFinite(pE)) return null;

  const pts = ensureTicksWithBoundary(ticks, evalMs);
  const qs = pts.map((p) => Number(p.quote)).filter(Number.isFinite);
  if (qs.length < 3) return null;

  const high = Math.max(...qs);
  const low = Math.min(...qs);
  const range = Math.max(high - low, 1e-9);
  const minRangeForSymbol = Math.max(Math.abs(pE) * Number(rules.minLiveRangeFactor || 0.000012), 1e-9);
  if (range < minRangeForSymbol) return null;

  const levels = getGiroPolarityCandidateLevels(candidate.symbol, minute, range, rules);
  if (!levels.length) return null;

  const matches = [];
  for (const lvl of levels) {
    const level = Number(lvl.price);
    const tol = Number(lvl.tolerance || getGiroPolarityTolerance(candidate.symbol, range));
    if (!Number.isFinite(level) || !Number.isFinite(tol) || tol <= 0) continue;

    const currentRole = lvl.currentRole === "support" ? "support" : "resistance";
    const direction = currentRole === "support" ? "CALL" : "PUT";
    const zone = Math.max(tol * Number(rules.zoneMult || 1.85), range * Number(rules.zoneRangeMult || 0.24));
    const wrongSideClose = currentRole === "support" ? level - pE : pE - level;
    if (wrongSideClose > tol * Number(rules.maxCloseWrongSideTol || 0.35)) continue;

    const minutesAfterBreak = Number(minute || 0) - Number(lvl.brokenAt || 0);
    if (minutesAfterBreak < Number(rules.minRetestAfterBreak || 1)) continue;

    let didRetest = false;
    let rejection = 0;
    let retestDepth = 0;
    let stayedOnRoleSide = false;
    let approach = 0;

    if (currentRole === "support") {
      didRetest = low <= level + zone;
      rejection = Math.max(0, pE - low);
      retestDepth = Math.max(0, level + zone - low);
      stayedOnRoleSide = pE >= level - tol * Number(rules.maxCloseWrongSideTol || 0.35);
      approach = Math.max(0, p0 - low);
    } else {
      didRetest = high >= level - zone;
      rejection = Math.max(0, high - pE);
      retestDepth = Math.max(0, high - (level - zone));
      stayedOnRoleSide = pE <= level + tol * Number(rules.maxCloseWrongSideTol || 0.35);
      approach = Math.max(0, high - p0);
    }

    if (!didRetest || !stayedOnRoleSide) continue;

    const rejectRatio = rejection / range;
    const nearClose = Math.max(0, 1 - Math.abs(pE - level) / Math.max(zone, 1e-9));
    const retestScore = Math.max(0, Math.min(1, retestDepth / Math.max(zone * 1.25, 1e-9)));
    const touchStrength = Math.min(6, Number(lvl.touches || 1));

    let points = 0;
    if (touchStrength >= 2) points += 1;
    if (touchStrength >= 3) points += 1;
    if (Number.isFinite(Number(lvl.brokenAt))) points += 1;
    if (minutesAfterBreak >= 1) points += 1;
    if (didRetest) points += 1;
    if (stayedOnRoleSide) points += 1;
    if (rejectRatio >= Number(rules.minRejectRatio || 0.08)) points += 1;
    if (nearClose >= 0.30) points += 1;
    if (approach >= range * 0.18) points += 1;

    if (points < Number(rules.minPoints || 5)) continue;

    const roleText = getGiroPolarityRoleText(lvl);
    const quality =
      points * 18 +
      touchStrength * 8 +
      nearClose * 20 +
      retestScore * 16 +
      rejectRatio * 24 -
      Math.max(0, wrongSideClose / tol) * 16 +
      Math.min(18, minutesAfterBreak * 1.5);

    matches.push({
      direction,
      quality,
      points,
      meta: {
        level,
        originalType: lvl.originalType,
        currentRole,
        levelType: currentRole,
        direction,
        tolerance: tol,
        zone,
        touches: touchStrength,
        points,
        brokenAt: Number(lvl.brokenAt || 0),
        breakDirection: lvl.breakDirection,
        breakClose: Number(lvl.breakClose),
        minutesAfterBreak,
        retestAt: Number(minute || 0),
        rejectRatio,
        nearClose,
        retestScore,
        wrongSideClose,
        high,
        low,
        p0,
        pE,
        roleText,
        status: "ruptura + retesteo respetado",
        logic: currentRole === "support"
          ? "vieja resistencia rota hacia arriba => soporte respetado => giro CALL"
          : "viejo soporte roto hacia abajo => resistencia respetada => giro PUT",
      },
    });
  }

  if (!matches.length) return null;
  matches.sort((a, b) => b.quality - a.quality || b.points - a.points);
  return matches[0];
}

/* =========================
   Modo GIRO + APRENDIZAJE
   Usa como positivos tus 👍 de Trades y los botones “Es mi formación / Muy clara”.
   Usa como negativos los botones “No es”. La dirección se aprende por la próxima vela
   cuando exista; si no, cae a trade.side/direction.
========================= */
const RULES_GIRO_APRENDIZAJE = {
  minPositivePrototypes: 3,
  minPositiveWeight: 3,
  sampleCount: 28,
  topSimilarityMin: 56,
  avgTop3SimilarityMin: 52,
  negativeSimilarityMax: 74,
  negativeBlockMargin: 8,
  clearWeightBonus: 4,
  negativeWeightBonus: 5,
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
    const safeLabel = normalizeGiroAprendizajeLabel(label);
    const weight = getGiroAprendizajeLabelWeight(safeLabel, source);
    seen.add(`${source}:${key}`);
    out.push({
      ...entry,
      aprendizajeLabel: safeLabel,
      aprendizajeSource: source,
      aprendizajeWeight: weight,
    });
  };

  // IMPORTANTE:
  // Los 👍/👎 de la pestaña Trades vuelven a cumplir solo su función original:
  // marcar operaciones para exportar y enseñarlas en ChatGPT.
  // No alimentan la IA local de la PWA para evitar mezclar estudio/export con aprendizaje vivo.

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
    const weight = Number(entry.aprendizajeWeight || getGiroAprendizajeLabelWeight(label, entry.aprendizajeSource));
    const proto = {
      id: entry.source_key || entry.journal_id || entry.id || "",
      direction: learnedDirection,
      leadSign,
      label,
      source: entry.aprendizajeSource || "",
      weight: Number.isFinite(weight) && weight > 0 ? weight : 1,
      symbol: entry.symbol || "",
      time: entry.time || "",
      sig,
    };
    if (label === "avoid") negatives.push(proto);
    else if (label === "clear" || label === "target") positives.push(proto);
    else if (label === "doubt") {
      // Dudosa queda como positiva muy débil: ayuda a comparar, pero casi no empuja señales.
      positives.push({ ...proto, weight: Math.min(proto.weight, 0.35) });
    }
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
  const positiveWeight = positives.reduce((acc, p) => acc + Number(p.weight || 1), 0);
  if (positives.length < rules.minPositivePrototypes && positiveWeight < Number(rules.minPositiveWeight || 3)) return null;

  const leadSign = inferCandidateLikeLeadSign(candidate, evalMs);
  if (!leadSign) return null;

  const sig = buildLikeMantenidoSignature(candidate?.ticks || [], leadSign, evalMs, rules.sampleCount);
  if (!passesGiroAprendizajeEssence(sig, rules)) return null;

  const sameSidePositives = positives.filter((p) => p.leadSign === leadSign);
  const sameSideWeight = sameSidePositives.reduce((acc, p) => acc + Number(p.weight || 1), 0);
  const learningPool = (sameSidePositives.length >= rules.minPositivePrototypes || sameSideWeight >= Number(rules.minPositiveWeight || 3))
    ? sameSidePositives
    : positives;
  const sims = learningPool
    .map((proto) => {
      const similarity = computeLikeMantenidoSimilarity(sig, proto.sig);
      const weight = Math.max(0.1, Number(proto.weight || 1));
      const weightedSimilarity = similarity + Math.min(10, Math.max(0, weight - 1) * Number(rules.clearWeightBonus || 4));
      return { proto, similarity, weight, weightedSimilarity };
    })
    .sort((a, b) => b.weightedSimilarity - a.weightedSimilarity || b.similarity - a.similarity);
  if (!sims.length) return null;
  const top = sims[0];
  const top3 = sims.slice(0, 3);
  const top5 = sims.slice(0, 5);
  const weightSum = top5.reduce((acc, x) => acc + Number(x.weight || 1), 0) || 1;
  const avgTop3 = top3.reduce((acc, x) => acc + x.similarity, 0) / top3.length;
  const weightedAvgTop = top5.reduce((acc, x) => acc + x.similarity * Number(x.weight || 1), 0) / weightSum;

  const negSameSide = negatives.filter((p) => p.leadSign === leadSign);
  const negSims = negSameSide
    .map((proto) => {
      const similarity = computeLikeMantenidoSimilarity(sig, proto.sig);
      const weight = Math.max(0.1, Number(proto.weight || 1));
      const weightedSimilarity = similarity + Math.min(14, Math.max(0, weight - 1) * Number(rules.negativeWeightBonus || 5));
      return { proto, similarity, weight, weightedSimilarity };
    })
    .sort((a, b) => b.weightedSimilarity - a.weightedSimilarity || b.similarity - a.similarity);
  const negativeTop = negSims[0]?.similarity || 0;
  const negativeWeightedTop = negSims[0]?.weightedSimilarity || 0;

  if (top.similarity < rules.topSimilarityMin && top.weightedSimilarity < rules.topSimilarityMin + 2) return null;
  if (weightedAvgTop < rules.avgTop3SimilarityMin && avgTop3 < rules.avgTop3SimilarityMin) return null;

  // Un negativo fuerte no siempre borra la regla base, pero sí evita que la IA la refuerce.
  if (
    negativeWeightedTop >= Number(rules.negativeSimilarityMax || 74) &&
    negativeWeightedTop > top.weightedSimilarity - Number(rules.negativeBlockMargin || 8)
  ) {
    return null;
  }

  const points = getGiroAprendizajePoints(sig, top.weightedSimilarity, weightedAvgTop, rules);
  if (points < rules.minPoints) return null;

  const direction = leadSign > 0 ? "PUT" : "CALL";
  const separation = Math.max(0, top.weightedSimilarity - negativeWeightedTop);
  const quality = top.weightedSimilarity * 0.72 + weightedAvgTop * 0.35 + points * 7 + separation * 0.24;

  return {
    direction,
    quality,
    points,
    leadSign,
    giroAprendizajeScore: Math.round(quality),
    topSimilarity: Math.round(top.similarity),
    topWeightedSimilarity: Math.round(top.weightedSimilarity),
    avgTop3: Math.round(weightedAvgTop),
    prototypeCount: positives.length,
    positiveWeight: Math.round(positiveWeight * 10) / 10,
    negativeTop,
    negativeWeightedTop,
    meta: {
      points,
      topSimilarity: Math.round(top.similarity),
      topWeightedSimilarity: Math.round(top.weightedSimilarity),
      avgTop3Similarity: Math.round(avgTop3),
      weightedAvgSimilarity: Math.round(weightedAvgTop),
      prototypeCount: positives.length,
      positiveWeight: Math.round(positiveWeight * 10) / 10,
      negativeTopSimilarity: Math.round(negativeTop),
      negativeWeightedTopSimilarity: Math.round(negativeWeightedTop),
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
      matched: top3.map((x) => ({
        id: x.proto.id,
        symbol: x.proto.symbol,
        time: x.proto.time,
        direction: x.proto.direction,
        label: x.proto.label,
        source: x.proto.source || "",
        weight: x.weight,
        similarity: Math.round(x.similarity),
        weightedSimilarity: Math.round(x.weightedSimilarity),
      })),
      negativeMatched: negSims.slice(0, 2).map((x) => ({
        id: x.proto.id,
        symbol: x.proto.symbol,
        time: x.proto.time,
        direction: x.proto.direction,
        label: x.proto.label,
        source: x.proto.source || "",
        weight: x.weight,
        similarity: Math.round(x.similarity),
        weightedSimilarity: Math.round(x.weightedSimilarity),
      })),
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
  if (areSignalsPaused()) return true;

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


  // MODO ÚNICO: Giro por zona intravela + IA local por ejemplos.
  // La señal exige: ataque amplio + rechazo claro + retesteo débil del dominante.
  // La IA local NO suma puntos de COMPRA/VENTA y NO compra sola; solo refuerza coincidencias.
  if (true) {
    const matches = [];
    for (const c of candidates) {
      const ruleMatch = analyzeGiroSinNivelCandidate(c, minute, RULES_GIRO_DOBLE_RECHAZO);
      const aiMatch = analyzeGiroAprendizajeCandidate(c, RULES_GIRO_APRENDIZAJE);

      if (ruleMatch) {
        matches.push({
          ...c,
          direction: ruleMatch.direction,
          quality: ruleMatch.quality,
          matchSource: "REGLA_SIN_NIVEL",
          giroNivelScore: Math.round(ruleMatch.quality),
          giroNivelPoints: ruleMatch.points,
          giroPolaridadMeta: ruleMatch.meta,
          giroAprendizajeScore: aiMatch ? aiMatch.giroAprendizajeScore : 0,
          giroAprendizajePoints: aiMatch ? aiMatch.points : 0,
          giroAprendizajeMeta: aiMatch ? aiMatch.meta : null,
        });
      }

      // v7: la IA local ya NO puede sacar señales sola.
      // Solo refuerza cuando la secuencia obligatoria sin nivel también aparece.

      // Si ambas coinciden en el mismo lado, sube bastante la calidad: regla + aprendizaje de tus ejemplos.
      if (ruleMatch && aiMatch && ruleMatch.direction === aiMatch.direction) {
        matches.push({
          ...c,
          direction: ruleMatch.direction,
          quality: ruleMatch.quality + aiMatch.quality * 0.42 + 16,
          matchSource: "REGLA_IA",
          giroNivelScore: Math.round(ruleMatch.quality),
          giroNivelPoints: ruleMatch.points,
          giroPolaridadMeta: ruleMatch.meta,
          giroAprendizajeScore: aiMatch.giroAprendizajeScore,
          giroAprendizajePoints: aiMatch.points,
          giroAprendizajeMeta: aiMatch.meta,
        });
      }
    }
    if (!matches.length) return true;
    matches.sort((a, b) =>
      b.quality - a.quality ||
      (b.matchSource === "REGLA_IA" ? 1 : 0) - (a.matchSource === "REGLA_IA" ? 1 : 0) ||
      b.giroNivelPoints - a.giroNivelPoints ||
      b.giroAprendizajePoints - a.giroAprendizajePoints ||
      b.giroNivelScore - a.giroNivelScore ||
      b.giroAprendizajeScore - a.giroAprendizajeScore
    );
    if (matches.length > 1 && matches[0].quality - matches[1].quality < RULES_GIRO_DOBLE_RECHAZO.minQualityGap) return true;
    const bestMatch = matches[0];
    addSignal(minute, bestMatch.symbol, bestMatch.direction, bestMatch.ticks, {
      giroNivelScore: bestMatch.giroNivelScore,
      giroNivelPoints: bestMatch.giroNivelPoints,
      giroPolaridadScore: bestMatch.giroNivelScore,
      giroPolaridadPoints: bestMatch.giroNivelPoints,
      giroPolaridad: bestMatch.giroPolaridadMeta,
      giroAprendizajeScore: bestMatch.giroAprendizajeScore,
      giroAprendizajePoints: bestMatch.giroAprendizajePoints,
      giroAprendizaje: bestMatch.giroAprendizajeMeta,
      aiLocalMatchSource: bestMatch.matchSource,
      // IMPORTANTE: la IA local solo detecta parecido visual.
      // Los puntos de COMPRA/VENTA siguen siendo manuales.
      signalConfirmations: [],
    });
    return true;
  }

  if (signalMode === MODE_GIRO_POLARIDAD) {
    const matches = [];
    for (const c of candidates) {
      const match = analyzeGiroPolaridadCandidate(c, minute, RULES_GIRO_POLARIDAD);
      if (!match) continue;
      matches.push({ ...c, direction: match.direction, quality: match.quality, giroPolaridadScore: Math.round(match.quality), giroPolaridadPoints: match.points, giroPolaridadMeta: match.meta });
    }
    if (!matches.length) return true;
    matches.sort((a, b) => b.quality - a.quality || b.giroPolaridadPoints - a.giroPolaridadPoints || b.giroPolaridadScore - a.giroPolaridadScore);
    if (matches.length > 1 && matches[0].quality - matches[1].quality < RULES_GIRO_POLARIDAD.minQualityGap) return true;
    const bestMatch = matches[0];
    addSignal(minute, bestMatch.symbol, bestMatch.direction, bestMatch.ticks, {
      giroPolaridadScore: bestMatch.giroPolaridadScore,
      giroPolaridadPoints: bestMatch.giroPolaridadPoints,
      giroPolaridad: bestMatch.giroPolaridadMeta,
      signalConfirmations: [],
    });
    return true;
  }

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
    manualGiro: createDefaultManualGiroState(),
    ...(extra && typeof extra === "object" ? extra : {}),
  };

  item.manualGiro = normalizeManualGiroState(item.manualGiro);

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
            applyClosedContractOutcomeFromPOC(poc, "stream");
          }
        }
        return;
      }

      if (data?.error) {
        const emsg = data.error.message || "unknown";
        if (isPendingContractPOCRateLimitMessage(emsg)) {
          setPendingContractPOCCooldown("proposal_open_contract_rate_limit");
          setStatus("⚠️ Deriv limitó consulta de contrato. En cooldown 90s.");
        } else {
          setStatus(`⚠️ WS error: ${emsg}`);
        }
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
    startPendingContractWatchdog({ immediate: true });
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
    if (isPracticeImageMode()) {
      finalizePracticeRound("CALL");
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
    if (isPracticeImageMode()) {
      finalizePracticeRound("PUT");
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
loadLiveAnalysisPaused();
loadAutoOpenChartSetting();
loadTradingAccountMode();
loadC100State();
loadDiscipline();
startPendingContractWatchdog({ immediate: true });
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
ensureLiveAnalysisPauseButton();
applyLiveAnalysisPauseUI();
ensurePracticeFilterButton();
applyPracticeFilterButtonUI();
ensurePracticeExportSaveButton();
updatePracticeExportSaveButtonUI();
updateExportTradesButtonUI();

connect();
