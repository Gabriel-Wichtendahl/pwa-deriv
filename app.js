// app.js — BASE V3 CONFIG RESTAURADA: estética/funciones originales preservadas, motores de señal desactivados
// ✅ Base V5 SNR: exporta likes/dislikes de Señales y guarda/exporta niveles SNR
// ✅ FIX UI: Botones COMPRAR / VENDER en el modal uno al lado del otro (grandes, sin encimarse)
// ✅ Disciplina por cuenta: DEMO mantiene bloqueo; REAL queda libre para pruebas
// ✅ V6: agrega botón “Limpiar marcas export” sin borrar historial ni niveles SNR
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
// ✅ NUEVO PRÁCTICA: auto-entrada al segundo 58 si ya hay 4 confirmaciones netas para COMPRA/VENTA
// ✅ NUEVO REAL: señales reales funcionan como práctica: 4 puntos netos por dirección + auto-entrada al segundo 58
// ✅ NUEVO: Modo GIRO + APRENDIZAJE con botones para enseñar “es mi formación / no es / dudosa / muy clara”
// ✅ V8: el modal muestra zonas SNR/amarilla sin rótulos para evitar contaminación visual
// ✅ V9: modal más limpio: header compacto, disciplina sin duplicados, decisión clara y gráfico con precio actual
// ✅ V36: replay tick por tick de la vela de señal en recuadro con zoom
// ✅ V37: SNR horizontal exige mínimo 70% de efectividad; si no, ajusta con cierres actuales o descarta
// ✅ V40: AUTO 58 requiere 4 puntos + precio dentro de zona azul/amarilla en SNR/SNR polaridad
// ✅ V44: SNR usa 70% global + 70% reciente; 2 fallos seguidos revisa/reajusta, 3 fallos bloquea
// ✅ V45: opción en Señales para conservar o purgar señales que cierran fuera de zona SNR/amarilla
// ✅ V46: AUTO 58 en modos SNR/SNR polaridad no exige cierre final ni validación de zona SNR; entra con 4 puntos
// ✅ V48: pestaña En vivo separada, pausa señales, corrige dibujo live y agrega botones compra/venta
// ✅ V51: corrige pausa accidental desde En vivo; al instalar reinicia pausa manual para recuperar señales
// ✅ V53: En vivo usa formato de modal, sin vela lateral, y opera con puntos igual que Señales
// ✅ V55: vuelve al En vivo v53 y agrega espacio scroll para ver COMPRAR/VENDER sin que lo tape disciplina
// ✅ V57: En vivo opera igual que Señales: puntos manuales y ejecución automática al segundo 58
// ✅ V49: En vivo dibuja recorrido/vela con todos los ticks recibidos del par seleccionado
// ✅ V50: En vivo con menos zoom vertical y gráfico un poco más bajo
// ✅ V68: Gestión IC2 5% escalonada por saldo hasta 2000, separada DEMO/REAL
// ✅ V69: Disciplina REAL: 2 OTM o ciclo IC2 completo (2 ITM seguidos) bloquea 1h; DEMO libre para pruebas
// ✅ V70: Merge verificado: conserva V68 escalonado + V69 disciplina REAL + V66 timing pre-proposal
// ✅ V71: Nuevo modo 🔁 Ruptura Débil Giro: rompe zona pero no expande, responde irregular y prepara giro.
// ✅ V74: Despeje mental con imagen integrada, contador real, 10 puntitos y 10 consejos rotativos.
// ✅ V75: Ruptura Débil Giro con filtro duro: solo velas alcistas y solo VENTA/PUT.
// ✅ V76: Ruptura Débil Giro enfocado en arranque irregular alcista temprano (0-30s), con prioridad si entra vendedor fuerte.
// ✅ V77: Ajuste con ejemplos marcados: no depende de resistencia perfecta, prioriza devuelve fuerte/vendedor 20-30s y guarda logic explicativo.
// ✅ V64: AUTO 58 con timing de próxima vela: intenta date_start+date_expiry y fallback date_expiry para cerrar en el segundo 60
// ✅ V65: AUTO post-tick 58 → cierre 60: no compra hasta recibir el tick >=58s y cancela si llega tarde.
// ✅ V66: pre-proposal 56-58s: arma proposal antes y en post-58 solo compra; disciplina 3 ITM/2 OTM desactivada para pruebas.

"use strict";

const BASE_CONFIG_RESTAURADA_VERSION = "BASE_V77_RUPTURA_DEBIL_EJEMPLOS_IRREG_ALCISTA_20260529";

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

const KEEP_CLOSED_AWAY_SIGNALS_KEY = "keepClosedAwaySignals_v1";
let keepClosedAwaySignals = false;

const LIVE_REPLAY_SYMBOL_KEY = "liveReplaySymbol_v1";

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
const C100_MODE_LABEL = "IC2 + 5% escalonado";
const C100_LEVELS = [
  { level: 1, base: DEFAULT_STAKE, compound: DEFAULT_STAKE },
  { level: 2, base: DEFAULT_STAKE, compound: DEFAULT_STAKE * 1.95 },
];

// V68: stake base IC2 por escalones de saldo.
// Menos de 210 => base 100 => stake 5.
// 210/310/410/510/610... => base 200/300/400/500/600...
// Tope final: al llegar a 2000 exactos o más => base 2000 / stake 100.
const C100_BALANCE_STEP_ENABLED = true;
const C100_BALANCE_STEP_PERCENT = 0.05;
const C100_BALANCE_STEP_MIN_BASE = 100;
const C100_BALANCE_STEP_MAX_BASE = 2000;
const C100_BALANCE_STEP_FIRST_THRESHOLD = 210;
const C100_BALANCE_STEP_SIZE = 100;
const ACCOUNT_BALANCE_CACHE_TTL_MS = 15000;

const EXECUTION_MODE_KEY = "executionMode_v1";
const EXECUTION_MODE_RISE_FALL = "RISE_FALL";
const EXECUTION_MODE_HIGHLOW_AUTO = "HIGHLOW_FIXED_BARRIER_BY_SYMBOL";
const ENTRY_TIMING_MODE_KEY = "entryTimingMode_v1";
const ENTRY_TIMING_AUTO58_NEXT_CANDLE_EXPIRY = "AUTO58_NEXT_CANDLE_EXPIRY";
const ENTRY_TIMING_AUTO58_DURATION_1M = "AUTO58_DURATION_1M";
let entryTimingMode = ENTRY_TIMING_AUTO58_NEXT_CANDLE_EXPIRY;
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
const accountBalanceCache = {
  [ACCOUNT_MODE_DEMO]: { balance: null, currency: DEFAULT_CURRENCY, updatedAt: 0 },
  [ACCOUNT_MODE_REAL]: { balance: null, currency: DEFAULT_CURRENCY, updatedAt: 0 },
};

/* =========================
   Disciplina
========================= */
const DISCIPLINE_WINDOW_START_KEY = "discipline_windowStartMs_v1";
const DISCIPLINE_WINS_KEY = "discipline_wins_v1";
const DISCIPLINE_LOSSES_KEY = "discipline_losses_v1";
const DISCIPLINE_LOCK_UNTIL_KEY = "discipline_lockUntilMs_v1";
const DISCIPLINE_PENDING_CONTRACTS_KEY = "discipline_pendingContracts_v1";

// V70: disciplina SOLO para REAL.
// - 2 OTM acumulados en la ventana actual => bloqueo 1h.
// - ciclo IC2 completo (2 ITM consecutivos: nivel 1 + nivel 2) => bloqueo 1h.
const DISCIPLINE_MAX_WINS = 2;
const DISCIPLINE_MAX_LOSSES = 2;
const DISCIPLINE_LOCK_MS = 60 * 60 * 1000;
const DISCIPLINE_SCOPE_LABEL = "REAL";

// Despeje mental: bloqueo total corto después de 1 OTM.
// Es global para la PWA (DEMO/REAL) para evitar operar por impulso.
// El bloqueo REAL de 1 hora se mantiene como está y tiene prioridad visual.
const MENTAL_COOLDOWN_UNTIL_KEY = "mentalCooldownUntilMs_v1";
const MENTAL_COOLDOWN_REASON_KEY = "mentalCooldownReason_v1";
const MENTAL_COOLDOWN_LAST_CONTRACT_KEY = "mentalCooldownLastContractId_v1";
const MENTAL_COOLDOWN_MS = 10 * 60 * 1000;

let mentalCooldownUntilMs = 0;
let mentalCooldownReason = "";
let mentalCooldownLastContractId = "";
let mentalCooldownOverlayEl = null;
const MENTAL_COOLDOWN_IMAGE_SRC = "./despeje-mental-bg.png";
const MENTAL_COOLDOWN_TIPS = [
  "Respirá profundo. No operes desde la urgencia.",
  "Una pérdida no se recupera con impulso, se recupera con criterio.",
  "Soltá el gráfico. La claridad vuelve cuando bajás el ritmo.",
  "No busques revancha. Buscá una lectura limpia.",
  "Tu mejor operación ahora es esperar.",
  "Aceptá el OTM sin pelearlo. El plan sigue.",
  "La próxima entrada necesita calma, no presión.",
  "Volvé cuando puedas explicar la operación antes de tocar el botón.",
  "Si no hay claridad, pasar también es disciplina.",
  "Tu mente es tu herramienta principal. Cuidala."
];

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
  ctx.fillText(`${item?.symbol || "—"} · ${dir === "CALL" ? "COMPRA / CALL" : "VENTA / PUT"} · Entrada ${SIGNAL_AUTO_ENTRY_SEC}s · ${item?.time || ""}`, 52, 72);
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

    const entryMs = Number(item?.trade?.entry_ms || item?.signalAutoEntry?.ms || SIGNAL_AUTO_ENTRY_MS);
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

    const entryTag = isItm ? `T ${SIGNAL_AUTO_ENTRY_SEC}s` : isOtm ? `TM ${SIGNAL_AUTO_ENTRY_SEC}s` : `${dir} ${SIGNAL_AUTO_ENTRY_SEC}s`;
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
  const note = `${isCall ? "Soporte" : "Resistencia"} respetad${isCall ? "o" : "a"} · entrada ${actionLabel} ${SIGNAL_AUTO_ENTRY_SEC}s · pin, línea, cierre y bandera en ${isItm ? "verde" : isOtm ? "rojo" : "amarillo"}`;
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
const MODE_SNR_SEGUNDO_TOQUE = "SNR INTERACCIÓN NIVEL";
const MODE_SNR_POLARIDAD = "SNR POLARIDAD";
const MODE_LINEA_DINAMICA = "LÍNEA DINÁMICA";
const MODE_GIRO_POLARIDAD = "GIRO POLARIDAD";
const MODE_RUPTURA_DEBIL_GIRO = "RUPTURA DÉBIL GIRO";
const ANALYSIS_MODE_KEY = "analysisMode_v1";

const GIRO_LOGIC_VERSION = "GIRO_RAMA_REEMPLAZO_20260421";
const GIRO_FLEX_LOGIC_VERSION = "GIRO_FLEX_RAMA_REEMPLAZO_20260421";
const NORMAL_DEBILIDAD_LOGIC_VERSION = "NORMAL_DEBILIDAD_FUERZA_CLARA_20260427";
const FUERZA_DEBILIDAD_CLARA_LOGIC_VERSION = "FUERZA_DEBILIDAD_CLARA_IMPULSOS_RETROCESOS_20260501";
const LIKE_MANTENIDO_LOGIC_VERSION = "LIKE_MANTENIDO_17_TRADES_DIRECCION_ESTANCADA_20260501";
const GIRO_APRENDIZAJE_LOGIC_VERSION = "GIRO_APRENDIZAJE_42_LIKES_ESENCIA_20260501";
const GIRO_NIVEL_LOGIC_VERSION = "BASE_V12_SNR_70_GLOBAL_RECIENTE_REVIEW_KEEP_FUERA_AUTO58_4PTS_V57_20260523";
const SNR_POLARIDAD_LOGIC_VERSION = "SNR_POLARIDAD_70EF_GLOBAL_RECIENTE_REVIEW_KEEP_FUERA_AUTO58_4PTS_V57_20260523";
const LINEA_DINAMICA_LOGIC_VERSION = "LINEA_DINAMICA_EXTREMA_CIERRES_MECHAS_V34_20260516";
const GIRO_POLARIDAD_LOGIC_VERSION = "GIRO_POLARIDAD_REAL_RUPTURA_RETEST_20260501";
const RUPTURA_DEBIL_GIRO_LOGIC_VERSION = "RUPTURA_DEBIL_GIRO_EJEMPLOS_IRREG_ALCISTA_V77_20260529";
const GIRO_POLARIDAD_CANDLES_KEY = "giroPolarityCandles_v1";
const GIRO_POLARIDAD_MAX_CANDLES = 140;
const GIRO_APRENDIZAJE_STORE_KEY = "giroAprendizajeExamples_v1";
const GIRO_APRENDIZAJE_MAX_EXAMPLES = 600;


function normalizeSignalMode(mode) {
  const raw = String(mode || "").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (raw.includes("LINEA") || raw.includes("DINAMICA")) return MODE_LINEA_DINAMICA;
  if ((raw.includes("RUPTURA") && raw.includes("DEBIL")) || raw.includes("BREAK WEAK") || raw === "RUPTURA_DEBIL_GIRO") return MODE_RUPTURA_DEBIL_GIRO;
  if ((raw.includes("SNR") && raw.includes("POLAR")) || raw === "SNR_POLARIDAD") return MODE_SNR_POLARIDAD;
  if (raw.includes("SNR") || raw.includes("INTERACCION")) return MODE_SNR_SEGUNDO_TOQUE;
  return MODE_SNR_SEGUNDO_TOQUE;
}
function isDynamicLineMode(mode) {
  return normalizeSignalMode(mode) === MODE_LINEA_DINAMICA;
}
function isSNRPolaridadMode(mode) {
  return normalizeSignalMode(mode) === MODE_SNR_POLARIDAD;
}
function isRupturaDebilGiroMode(mode) {
  return normalizeSignalMode(mode) === MODE_RUPTURA_DEBIL_GIRO;
}
function isGiroFamilyMode(mode) {
  const m = normalizeSignalMode(mode);
  return m === MODE_SNR_SEGUNDO_TOQUE || m === MODE_SNR_POLARIDAD || m === MODE_LINEA_DINAMICA || m === MODE_GIRO_NIVEL || m === MODE_GIRO_POLARIDAD;
}
function getModeVersion(mode) {
  const m = normalizeSignalMode(mode);
  if (m === MODE_LINEA_DINAMICA) return LINEA_DINAMICA_LOGIC_VERSION;
  if (m === MODE_RUPTURA_DEBIL_GIRO) return RUPTURA_DEBIL_GIRO_LOGIC_VERSION;
  if (m === MODE_SNR_POLARIDAD) return SNR_POLARIDAD_LOGIC_VERSION;
  return GIRO_NIVEL_LOGIC_VERSION;
}
function loadAnalysisMode() {
  try {
    const stored = localStorage.getItem(ANALYSIS_MODE_KEY);
    localStorage.setItem("giroMode", "false");
    localStorage.setItem("strongMode", "false");
    return normalizeSignalMode(stored || MODE_SNR_SEGUNDO_TOQUE);
  } catch {}
  return MODE_SNR_SEGUNDO_TOQUE;
}
function saveAnalysisMode(mode) {
  try {
    localStorage.setItem(ANALYSIS_MODE_KEY, normalizeSignalMode(mode));
    localStorage.setItem("giroMode", "false");
    localStorage.setItem("strongMode", "false");
  } catch {}
}
function getModeBtnLabel(mode) {
  const m = normalizeSignalMode(mode);
  if (m === MODE_LINEA_DINAMICA) return "📐 Línea dinámica";
  if (m === MODE_RUPTURA_DEBIL_GIRO) return "🔁 Ruptura Débil Giro";
  if (m === MODE_SNR_POLARIDAD) return "🧲 SNR polaridad";
  return "🎯 SNR interacción";
}
function nextSignalMode(mode) {
  const m = normalizeSignalMode(mode);
  if (m === MODE_SNR_SEGUNDO_TOQUE) return MODE_SNR_POLARIDAD;
  if (m === MODE_SNR_POLARIDAD) return MODE_RUPTURA_DEBIL_GIRO;
  if (m === MODE_RUPTURA_DEBIL_GIRO) return MODE_LINEA_DINAMICA;
  return MODE_SNR_SEGUNDO_TOQUE;
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
  if (pol.levelMode === "snr_body" || pol.levelMode === "snr_polaridad") {
    const original = pol.originalType === "support" ? "SOP" : "RES";
    const role = pol.currentRole === "support" || pol.levelType === "support" ? "SOP" : "RES";
    return `SNR ${original}→${role}`;
  }
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
  if (pol.levelMode === "snr_body" || pol.levelMode === "snr_polaridad") {
    const low = Number(pol.zoneLow);
    const high = Number(pol.zoneHigh);
    const zoneTxt = Number.isFinite(low) && Number.isFinite(high)
      ? `${low.toFixed(6)}–${high.toFixed(6)}`
      : Number(pol.level).toFixed(6);
    return `🎯 ${roleText}: ${zoneTxt} → ${dir}${pts}${touches}${broken}`;
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

// guarda/actualiza snapshot de trade: PENDING entra inmediatamente; ITM/OTM actualizan resultado.
function upsertTradeJournalFromSignal(it) {
  if (!it?.trade?.badge) return;
  const b = String(it.trade.badge || "").toUpperCase();
  if (b !== "PENDING" && b !== "ITM" && b !== "OTM") return;

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

    // nivel SNR / polaridad detectado en la señal
    giroPolaridad: getSignalLevelMeta(it),
    snrLevel: getSignalLevelMeta(it),

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

// siembra (una vez) desde history por si existían trades ya guardados
function seedTradesJournalFromHistory() {
  try {
    let changed = false;
    for (const it of history || []) {
      const b = String(it?.trade?.badge || "").toUpperCase();
      if (b === "PENDING" || b === "ITM" || b === "OTM") {
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
const liveView = $("liveView");
const liveReplayCanvas = $("liveReplayCanvas");
const liveReplayInfoEl = $("liveReplayInfo");
const liveReplaySubEl = $("liveReplaySub");
const liveSymbolBarEl = $("liveSymbolBar");
const liveBuyCallBtn = $("liveBuyCallBtn");
const liveBuyPutBtn = $("liveBuyPutBtn");
const liveTradeStatusEl = $("liveTradeStatus");
const liveConfirmCountEl = $("liveConfirmCount");
const liveConfirmHintEl = $("liveConfirmHint");
const liveConfirmBuyBtn = $("liveConfirmBuyBtn");
const liveConfirmSellBtn = $("liveConfirmSellBtn");
const liveConfirmUndoBtn = $("liveConfirmUndoBtn");
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
const modalCandle1mBtn = $("modalCandle1mBtn");
const modalReplayBtn = $("modalReplayBtn");
const modalOpenDerivBtn = $("modalOpenDerivBtn");

const modalBuyCallBtn = pickEl("modalBuyCallBtn");
const modalBuyPutBtn = pickEl("modalBuyPutBtn");
const modalLiveBtn = pickEl("modalLiveBtn");
const modalNavVoteBar = $("modalNavVoteBar");
const modalPrevItemBtn = $("modalPrevItemBtn");
const modalNextItemBtn = $("modalNextItemBtn");
const modalLikeBtn = $("modalLikeBtn");
const modalDislikeBtn = $("modalDislikeBtn");
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
const SIGNAL_AUTO_ENTRY_MS = 58000;
const SIGNAL_AUTO_ENTRY_SEC = Math.round(SIGNAL_AUTO_ENTRY_MS / 1000);
// V65: en el timing de próxima vela no compramos apenas el reloj marca 58s.
// Esperamos a que haya llegado el tick real >=58s y solo disparamos dentro de esta ventana.
const SIGNAL_AUTO_POST58_MAX_MS = 59200;
const SIGNAL_AUTO_POST58_MAX_SEC = SIGNAL_AUTO_POST58_MAX_MS / 1000;
// V66: preparar proposal ANTES del post-58 para que en 58 solo se compre.
const SIGNAL_AUTO_PREPROPOSAL_START_MS = 56000;
const SIGNAL_AUTO_PREPROPOSAL_END_MS = 58000;
const SIGNAL_AUTO_PREPROPOSAL_TTL_MS = 10000;
// V23: la señal vive en 3 etapas: prealerta temprana para analizar,
// validación de autoentrada en 58s y confirmación final por cierre en SNR/amarilla.
const SIGNAL_PREALERT_MIN_SEC = 35;
const SIGNAL_PREALERT_MAX_SEC = 45;
// V7: aunque haya 4 puntos manuales, la entrada real solo se permite
// si al segundo 58 el precio está dentro de la zona SNR o muy cerca.
const SIGNAL_AUTO_SNR_GATE_ENABLED = true;
const SIGNAL_AUTO_SNR_CHECK_MS = SIGNAL_AUTO_ENTRY_MS;
const SIGNAL_AUTO_SNR_NEAR_TOL_MULT = 0.75;
const SIGNAL_AUTO_SNR_NEAR_ZONE_MULT = 0.35;

function buildSNRNearAreaMetaFromLevel(meta) {
  if (!meta || typeof meta !== "object") return null;
  const level = Number(meta.level);
  if (!Number.isFinite(level)) return null;

  let zoneLow = Number(meta.zoneLow);
  let zoneHigh = Number(meta.zoneHigh);
  const bodyLow = Number(meta.bodyZoneLow);
  const bodyHigh = Number(meta.bodyZoneHigh);
  const tolerance = Number(meta.tolerance);
  const zoneSize = Number(meta.zone);

  // Misma reconstrucción usada por el filtro de entrada en 58s.
  // Así lo que ves en el modal coincide con lo que la PWA acepta como "cerca".
  if (!Number.isFinite(zoneLow) || !Number.isFinite(zoneHigh)) {
    if (Number.isFinite(bodyLow) && Number.isFinite(bodyHigh)) {
      zoneLow = Math.min(bodyLow, bodyHigh);
      zoneHigh = Math.max(bodyLow, bodyHigh);
    } else {
      const fallback = Math.max(
        Number.isFinite(tolerance) ? tolerance * 0.50 : 0,
        Number.isFinite(zoneSize) ? zoneSize * 0.50 : 0,
        Math.abs(level) * 0.000001,
        1e-9
      );
      zoneLow = level - fallback;
      zoneHigh = level + fallback;
    }
  }

  const zl = Math.min(zoneLow, zoneHigh);
  const zh = Math.max(zoneLow, zoneHigh);
  const zoneWidth = Math.max(0, zh - zl);
  const nearBuffer = Math.max(
    Number.isFinite(tolerance) ? tolerance * SIGNAL_AUTO_SNR_NEAR_TOL_MULT : 0,
    zoneWidth * SIGNAL_AUTO_SNR_NEAR_ZONE_MULT,
    Number.isFinite(zoneSize) ? zoneSize * 0.25 : 0,
    Math.abs(level) * 0.000001,
    1e-9
  );

  return {
    level,
    zoneLow: zl,
    zoneHigh: zh,
    bodyZoneLow: Number.isFinite(bodyLow) ? bodyLow : null,
    bodyZoneHigh: Number.isFinite(bodyHigh) ? bodyHigh : null,
    tolerance: Number.isFinite(tolerance) ? tolerance : null,
    zoneSize: Number.isFinite(zoneSize) ? zoneSize : null,
    nearBuffer,
    nearLow: zl - nearBuffer,
    nearHigh: zh + nearBuffer,
  };
}

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

// V38: en modo SNR los botones 35/40/45 pasan a ser el FIN del radar.
// El radar arranca siempre en 35s y busca prealerta hasta el segundo elegido.
const SNR_RADAR_START_SEC = 35;

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
let modalOpenContext = { source: "signals", signalId: "", journalId: "" };

let modalLive = false;
let modalDrawRaf = null;
let modalLastDrawAt = 0;
let modalChartView = "line"; // "line" | "candles1m"
let modalReplayState = { open: false, playing: false, speed: 1, currentMs: 0, lastFrameTs: 0, raf: null };
const MODAL_DRAW_MIN_INTERVAL_MS = 120;

let liveReplaySymbol = loadLiveReplaySymbol();
let liveReplayRaf = null;
let liveReplayLastDrawAt = 0;
let liveSignalConfirmations = [];
let liveSignalMinuteKey = "";
let liveAutoEntryState = { minuteKey: "", attempted: false, status: "idle", side: "", contract_id: "", error: "" };
const autoPreProposalInFlight = new Set();
const liveAutoPreProposalCache = new Map();
const LIVE_REPLAY_DRAW_MIN_INTERVAL_MS = 120;

// V32: caché específica para la vista Velas 1m del modal.
// La vista debe usar OHLC reales de Deriv y no velas inventadas/rellenadas.
const MODAL_CANDLES_1M_COUNT = 34;
const modalOHLC1mCache = new Map();
const modalOHLC1mPending = new Map();
const modalOHLC1mFailed = new Set();

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
function formatNextCandleDirectionLabel(direction) {
  const dir = String(direction || "").toUpperCase().trim();
  if (dir === "CALL" || dir === "COMPRA" || dir === "BUY" || dir === "UP") return "PROX VELA ALCISTA";
  if (dir === "PUT" || dir === "VENTA" || dir === "SELL" || dir === "DOWN") return "PROX VELA BAJISTA";
  return "";
}
function getItemNextOutcomeValue(itemOrOutcome) {
  if (itemOrOutcome && typeof itemOrOutcome === "object") return String(itemOrOutcome.nextOutcome || "").toLowerCase().trim();
  return String(itemOrOutcome || "").toLowerCase().trim();
}
function formatNextCandleOutcomeLabel(itemOrOutcome, showPending = true) {
  const out = getItemNextOutcomeValue(itemOrOutcome);
  if (out === "up") return "PROX VELA ALCISTA";
  if (out === "down") return "PROX VELA BAJISTA";
  if (out === "flat" || out === "equal" || out === "neutral") return "PROX VELA NEUTRA";
  return showPending ? "PROX VELA ⏳" : "";
}
function getNextCandleOutcomeTextColor(itemOrOutcome, fallback = "rgba(255,255,255,.74)") {
  const out = getItemNextOutcomeValue(itemOrOutcome);
  if (out === "up") return "#bbf7d0";
  if (out === "down") return "#fecaca";
  if (out === "flat" || out === "equal" || out === "neutral") return "rgba(229,231,235,.88)";
  return fallback;
}

function formatCompactModeLabel(mode) {
  const raw = String(mode || "NORMAL").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  if (!raw) return "Normal";
  const lower = raw.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}
function formatCompactScopeLabel() {
  return String(getTradeScopeText ? getTradeScopeText() : "").replace(/\s+/g, " ").trim();
}
function setCompactModalHeader(item, ticksCount = null) {
  if (!item) return;
  if (modalTitle) {
    const scope = formatCompactScopeLabel();
    modalTitle.textContent = `${item.symbol || "—"} · ${labelDir(item.direction)}${scope ? " · " + scope : ""}`;
  }
  if (modalSub) {
    const mode = formatCompactModeLabel(item.mode || "NORMAL");
    const n = ticksCount == null ? (Array.isArray(item.ticks) ? item.ticks.length : 0) : Number(ticksCount) || 0;
    const live = modalLive && isItemLiveMinute(item) ? " · LIVE" : "";
    const nextOutcomeTxt = formatNextCandleOutcomeLabel(item, true);
    modalSub.textContent = `${item.time || "—"} · ${mode} · ticks ${n} · AUTO ${SIGNAL_AUTO_ENTRY_SEC}s${nextOutcomeTxt ? " · " + nextOutcomeTxt : ""}${live}`;
  }
}

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
    // V67: la gestión IC2 queda separada por cuenta. Al cambiar DEMO/REAL,
    // cargamos el estado propio de esa cuenta en vez de pisar el anterior.
    loadC100State();
    void refreshAccountBalance({ force: true }).catch(() => {});
    updateC100PanelUI();
    updateDisciplineLockUI(false);
    if (chartModal && !chartModal.classList.contains("hidden")) {
      if (modalCurrentItem) {
        setCompactModalHeader(modalCurrentItem);
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
function getCurrentAccountScope() {
  return activeTradingAccount === ACCOUNT_MODE_REAL ? ACCOUNT_MODE_REAL : ACCOUNT_MODE_DEMO;
}
function getScopedStorageKey(baseKey) {
  return `${baseKey}_${getCurrentAccountScope()}`;
}
function getC100StateStorageKey() {
  return getScopedStorageKey(C100_STATE_KEY);
}
function getScopedTradeStakeKey() {
  return getScopedStorageKey(TRADE_STAKE_KEY);
}
function setCachedAccountBalance(balance, currency = DEFAULT_CURRENCY) {
  const b = Number(balance);
  if (!Number.isFinite(b)) return null;
  const scope = getCurrentAccountScope();
  accountBalanceCache[scope] = {
    balance: Number(b.toFixed(2)),
    currency: String(currency || DEFAULT_CURRENCY),
    updatedAt: Date.now(),
  };
  try {
    localStorage.setItem(getScopedStorageKey("derivAccountBalanceCache_v1"), JSON.stringify(accountBalanceCache[scope]));
  } catch {}
  return accountBalanceCache[scope];
}
function loadCachedAccountBalance() {
  const scope = getCurrentAccountScope();
  try {
    const raw = localStorage.getItem(getScopedStorageKey("derivAccountBalanceCache_v1"));
    if (raw) {
      const obj = JSON.parse(raw);
      const b = Number(obj?.balance);
      if (Number.isFinite(b)) {
        accountBalanceCache[scope] = {
          balance: Number(b.toFixed(2)),
          currency: String(obj?.currency || DEFAULT_CURRENCY),
          updatedAt: Number(obj?.updatedAt || 0),
        };
      }
    }
  } catch {}
  return accountBalanceCache[scope] || { balance: null, currency: DEFAULT_CURRENCY, updatedAt: 0 };
}
function getCachedAccountBalance() {
  const scope = getCurrentAccountScope();
  const c = accountBalanceCache[scope];
  if (c && Number.isFinite(Number(c.balance))) return c;
  return loadCachedAccountBalance();
}
function adjustCachedAccountBalanceByProfit(profit) {
  const p = Number(profit);
  if (!Number.isFinite(p) || p === 0) return;
  const c = getCachedAccountBalance();
  const b = Number(c?.balance);
  if (!Number.isFinite(b)) return;
  setCachedAccountBalance(b + p, c.currency || DEFAULT_CURRENCY);
}
async function refreshAccountBalance({ force = false } = {}) {
  const cached = getCachedAccountBalance();
  if (!force && Number.isFinite(Number(cached.balance)) && Date.now() - Number(cached.updatedAt || 0) < ACCOUNT_BALANCE_CACHE_TTL_MS) {
    return cached;
  }
  if (!ws || ws.readyState !== 1 || !getDerivToken()) return cached;

  const res = await wsRequest({ balance: 1 }, 10000);
  if (res?.error) throw new Error(res.error.message || "balance error");
  const payload = res?.balance || {};
  const b = Number(payload.balance ?? payload.amount ?? payload);
  const cur = payload.currency || DEFAULT_CURRENCY;
  return setCachedAccountBalance(b, cur) || cached;
}
function getC100StepInfo(balanceRaw = null) {
  const cached = getCachedAccountBalance();
  const balance = Number(balanceRaw ?? cached?.balance);
  const hasBalance = Number.isFinite(balance);

  if (!C100_BALANCE_STEP_ENABLED || !hasBalance) {
    const manualStake = Number(getTradeStake());
    const safeStake = Number.isFinite(manualStake) && manualStake > 0 ? manualStake : DEFAULT_STAKE;
    return {
      enabled: false,
      hasBalance,
      balance: hasBalance ? Number(balance.toFixed(2)) : null,
      currency: cached?.currency || DEFAULT_CURRENCY,
      base: null,
      stake: Number(safeStake.toFixed(2)),
      nextThreshold: null,
      downThreshold: null,
      capped: false,
      source: hasBalance ? "manual_fallback" : "manual_sin_balance",
    };
  }

  let base = C100_BALANCE_STEP_MIN_BASE;
  if (balance >= C100_BALANCE_STEP_MAX_BASE) {
    // Opción B: el último escalón se activa al llegar a 2000 exactos, no en 2010.
    base = C100_BALANCE_STEP_MAX_BASE;
  } else if (balance >= C100_BALANCE_STEP_FIRST_THRESHOLD) {
    // Escalones: 210=>200, 310=>300, 410=>400, 510=>500, 610=>600...
    base = Math.floor((balance - 10) / C100_BALANCE_STEP_SIZE) * C100_BALANCE_STEP_SIZE;
  }

  base = Math.max(C100_BALANCE_STEP_MIN_BASE, Math.min(C100_BALANCE_STEP_MAX_BASE, base));
  const stake = Number((base * C100_BALANCE_STEP_PERCENT).toFixed(2));
  const nextThreshold = base >= C100_BALANCE_STEP_MAX_BASE
    ? null
    : Math.min(C100_BALANCE_STEP_MAX_BASE, base + 110);
  const downThreshold = base <= C100_BALANCE_STEP_MIN_BASE
    ? null
    : (base >= C100_BALANCE_STEP_MAX_BASE ? C100_BALANCE_STEP_MAX_BASE : base + 10);

  return {
    enabled: true,
    hasBalance: true,
    balance: Number(balance.toFixed(2)),
    currency: cached?.currency || DEFAULT_CURRENCY,
    base,
    stake,
    nextThreshold,
    downThreshold,
    capped: base >= C100_BALANCE_STEP_MAX_BASE,
    source: "balance_step_5pct",
  };
}
function getC100BaseStake() {
  const info = getC100StepInfo();
  return Number(info.stake.toFixed(2));
}
function getC100TradeAuditExtra(stakeUsed = null) {
  if (!isC100Active()) return {};
  const info = getC100StepInfo();
  return {
    c100_balance_step_enabled: !!info.enabled,
    c100_balance_step_source: String(info.source || ""),
    c100_balance: Number.isFinite(Number(info.balance)) ? Number(info.balance) : null,
    c100_balance_currency: String(info.currency || DEFAULT_CURRENCY),
    c100_balance_base: Number.isFinite(Number(info.base)) ? Number(info.base) : null,
    c100_base_stake: Number(info.stake || 0),
    c100_effective_stake: Number.isFinite(Number(stakeUsed)) ? Number(stakeUsed) : Number(getC100Stake()),
    c100_next_threshold: info.nextThreshold,
    c100_down_threshold: info.downThreshold,
    c100_step_cap: info.capped ? C100_BALANCE_STEP_MAX_BASE : null,
  };
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
    const scopedKey = getC100StateStorageKey();
    let raw = localStorage.getItem(scopedKey);
    // Migración suave: si venías usando la clave vieja, solo la toma para DEMO.
    if (raw === null && getCurrentAccountScope() === ACCOUNT_MODE_DEMO) raw = localStorage.getItem(C100_STATE_KEY);
    c100State = normalizeC100State(raw ? JSON.parse(raw) : null);
    c100State.accountMode = getCurrentAccountScope();
  } catch {
    c100State = makeFreshC100State();
  }
  loadCachedAccountBalance();
  saveC100State();
  return c100State;
}
function saveC100State() {
  try {
    if (!c100State) c100State = makeFreshC100State();
    c100State.accountMode = getCurrentAccountScope();
    c100State.updatedAt = Date.now();
    localStorage.setItem(getC100StateStorageKey(), JSON.stringify(c100State));
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
  const info = getC100StepInfo();
  if (info.enabled) return `Nivel 1: 5% de base ${info.base}`;
  return "Nivel 1: stake manual";
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
  panel.style.padding = "10px";
  panel.style.borderRadius = "16px";
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
  const stepInfo = getC100StepInfo();
  const balanceTxt = Number.isFinite(Number(stepInfo.balance)) ? `$${Number(stepInfo.balance).toFixed(2)} ${escapeHtml(stepInfo.currency || DEFAULT_CURRENCY)}` : "sin saldo leído";
  const nextTxt = stepInfo.nextThreshold ? `$${Number(stepInfo.nextThreshold).toFixed(2)}` : "tope 2000";
  const downTxt = stepInfo.downThreshold ? `$${Number(stepInfo.downThreshold).toFixed(2)}` : "—";

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
      <div>Timing: <b>${escapeHtml(getEntryTimingShortText())}</b></div>
      <div>Saldo leído: <b>${balanceTxt}</b></div>
      <div>Regla: <b>5% escalonado cada $100 hasta saldo $2000 · tope stake $100</b></div>
      <div>Nivel actual: <b>${Number(c100State.compoundStep || 0) + 1} / ${C100_MAX_LEVEL}</b></div>
      <div>Base activa: <b>${stepInfo.enabled ? "$" + Number(stepInfo.base).toFixed(2) : "manual"}</b></div>
      <div>Stake base: <b>$${baseStake.toFixed(2)}</b></div>
      <div>Próximo stake: <b>$${stake.toFixed(2)}</b></div>
      <div>Próximo aumento: <b>${nextTxt}</b> · Baja al anterior si cae de: <b>${downTxt}</b></div>
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
  if (Number.isFinite(profitNum)) adjustCachedAccountBalanceByProfit(profitNum);

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

      // V69: en REAL, primer ITM del ciclo IC2. No bloquea todavía.
      if (!isDisciplineBypassedForCurrentAccount() && !isTradeLockedNow()) {
        disciplineWins = 1;
        saveDiscipline();
      }
    } else {
      const dayProfit = Number(c100State.dayProfit || 0);
      const dayLoss = Number(c100State.dayLoss || 0);
      c100State = makeFreshC100State({ keepDay: true });
      c100State.enabled = enabled;
      c100State.dayProfit = dayProfit;
      c100State.dayLoss = dayLoss;
      c100State.lastResult = "CICLO_IC2_COMPLETO";

      // V69: dos ITM consecutivos completando IC2 => bloqueo REAL por 1h.
      if (!isDisciplineBypassedForCurrentAccount() && !isTradeLockedNow()) {
        disciplineWins = DISCIPLINE_MAX_WINS;
        saveDiscipline();
        lockRealDiscipline("IC2 completo: 2 ITM seguidos");
      }
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

    // V69: una OTM corta la secuencia de 2 ITM IC2.
    if (!isDisciplineBypassedForCurrentAccount()) {
      disciplineWins = 0;
      saveDiscipline();
    }
  }

  saveC100State();
  updateC100PanelUI();
  updateModalCandleStatusUI();

  if (normalized === "ITM" && !wasLevel2) {
    toast(`✅ IC2: nivel 1 ganado · próximo stake $${getC100Stake().toFixed(2)}`, 2400);
  } else if (normalized === "ITM" && wasLevel2) {
    if (isTradeLockedNow()) toast("🔒 IC2 completo: REAL bloqueada 1h", 4200);
    else toast("✅ IC2: ciclo de 2 niveles completo · vuelve al stake base", 2600);
  } else {
    if (isTradeLockedNow() && disciplineLosses >= DISCIPLINE_MAX_LOSSES) toast("🔒 2 OTM: REAL bloqueada 1h", 4200);
    else toast("↺ IC2: OTM registrado · vuelve al stake base", 2400);
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
    applyEntryTimingModeUI();
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


/* =========================
   Timing de entrada Rise/Fall
   - AUTO 58 normal: duration 1m.
   - AUTO post-58 cierre 60: espera el tick real >=58s, envía después de ese tick,
     intenta programar inicio en la próxima vela y fija el cierre al segundo 60.
   - V66: la proposal se prepara desde 56s para que al post-58 la compra sea inmediata.
========================= */
function normalizeEntryTimingMode(mode) {
  const m = String(mode || "").toUpperCase().trim();
  if (m === ENTRY_TIMING_AUTO58_DURATION_1M) return ENTRY_TIMING_AUTO58_DURATION_1M;
  return ENTRY_TIMING_AUTO58_NEXT_CANDLE_EXPIRY;
}
function loadEntryTimingMode() {
  try {
    entryTimingMode = normalizeEntryTimingMode(localStorage.getItem(ENTRY_TIMING_MODE_KEY) || ENTRY_TIMING_AUTO58_NEXT_CANDLE_EXPIRY);
  } catch {
    entryTimingMode = ENTRY_TIMING_AUTO58_NEXT_CANDLE_EXPIRY;
  }
}
function saveEntryTimingMode() {
  try { localStorage.setItem(ENTRY_TIMING_MODE_KEY, normalizeEntryTimingMode(entryTimingMode)); } catch {}
}
function isNextCandleExpiryTiming() {
  // High/Low usa barreras/proposals propios; este timing aplica a Rise/Fall.
  return normalizeEntryTimingMode(entryTimingMode) === ENTRY_TIMING_AUTO58_NEXT_CANDLE_EXPIRY && !shouldUseAutoHighLowExecution();
}
function isEntryTimingStoredNextCandle() {
  return normalizeEntryTimingMode(entryTimingMode) === ENTRY_TIMING_AUTO58_NEXT_CANDLE_EXPIRY;
}
function getEntryTimingModeLabel() {
  if (isEntryTimingStoredNextCandle()) return shouldUseAutoHighLowExecution() ? "⏱️ AUTO pre-56/post-58 → cierre 60 (solo RF)" : "⏱️ AUTO pre-56/post-58 → cierre 60";
  return "⏱️ AUTO 58 normal";
}
function getEntryTimingShortText() {
  if (isEntryTimingStoredNextCandle()) return shouldUseAutoHighLowExecution() ? "AUTO pre-56/post-58 → cierre 60 (solo Rise/Fall)" : "AUTO prearmado · cierre vela sig.";
  return "AUTO 58 · duración 1m";
}
function buildNextCandleTimingPlan(item = null) {
  const itemMinute = Number(item?.minute);
  const baseMinute = Number.isFinite(itemMinute) && itemMinute > 0 ? itemMinute : currentServerMinute();
  const currentStartEpochSec = baseMinute * 60;
  const nextStartEpochSec = currentStartEpochSec + 60;
  const nextExpiryEpochSec = nextStartEpochSec + 60;
  const nowEpochSec = Math.floor(serverNowMs() / 1000);
  return {
    mode: ENTRY_TIMING_AUTO58_NEXT_CANDLE_EXPIRY,
    current_minute: baseMinute,
    current_start_epoch_sec: currentStartEpochSec,
    next_start_epoch_sec: nextStartEpochSec,
    next_expiry_epoch_sec: nextExpiryEpochSec,
    now_epoch_sec: nowEpochSec,
    planned_duration_sec: nextExpiryEpochSec - nextStartEpochSec,
  };
}
function buildRiseFallBaseParams(side, symbol, stake) {
  return {
    amount: stake,
    basis: "stake",
    contract_type: side,
    currency: DEFAULT_CURRENCY,
    symbol,
  };
}
function buildRiseFallTimingVariants(side, symbol, stake, item = null) {
  const base = buildRiseFallBaseParams(side, symbol, stake);
  if (!isNextCandleExpiryTiming()) {
    return [{
      label: ENTRY_TIMING_AUTO58_DURATION_1M,
      params: {
        ...base,
        duration: Number(DEFAULT_DURATION) || 1,
        duration_unit: DEFAULT_DURATION_UNIT || "m",
      },
      timing: {
        mode: ENTRY_TIMING_AUTO58_DURATION_1M,
        variant: "duration_1m",
        duration: Number(DEFAULT_DURATION) || 1,
        duration_unit: DEFAULT_DURATION_UNIT || "m",
      },
    }];
  }

  const plan = buildNextCandleTimingPlan(item);
  return [
    {
      label: "AUTO58_DATE_START_EXPIRY",
      params: {
        ...base,
        date_start: plan.next_start_epoch_sec,
        date_expiry: plan.next_expiry_epoch_sec,
      },
      timing: {
        ...plan,
        variant: "date_start_plus_date_expiry",
        message: "AUTO pre-56/post-58: proposal prearmada; compra luego del tick >=58s; inicio programado en próxima vela y cierre fijo al segundo 60.",
      },
    },
    {
      label: "AUTO58_DATE_EXPIRY_ONLY",
      params: {
        ...base,
        date_expiry: plan.next_expiry_epoch_sec,
      },
      timing: {
        ...plan,
        variant: "date_expiry_only",
        fallback_from: "date_start_plus_date_expiry",
        message: "AUTO pre-56/post-58: Deriv no aceptó inicio programado; se usa proposal prearmada con cierre fijo al segundo 60.",
      },
    },
  ];
}
function getRiseFallTimingExtra(timing = null) {
  if (!timing || typeof timing !== "object") return {};
  return {
    entry_timing_mode: String(timing.mode || ""),
    entry_timing_variant: String(timing.variant || ""),
    planned_next_start_time: Number(timing.next_start_epoch_sec || 0) || null,
    planned_expiry_time: Number(timing.next_expiry_epoch_sec || 0) || null,
    planned_duration_sec: Number(timing.planned_duration_sec || 0) || null,
    entry_timing_message: String(timing.message || ""),
    entry_timing: { ...timing },
  };
}
function extractContractAuditFields(src = null) {
  const o = src && typeof src === "object" ? src : {};
  const num = (...keys) => {
    for (const k of keys) {
      const v = Number(o?.[k]);
      if (Number.isFinite(v)) return v;
    }
    return null;
  };
  const str = (...keys) => {
    for (const k of keys) {
      const v = o?.[k];
      if (v !== undefined && v !== null && String(v) !== "") return String(v);
    }
    return "";
  };
  return {
    purchase_time: num("purchase_time", "buy_time", "transaction_time"),
    start_time: num("date_start", "start_time"),
    expiry_time: num("date_expiry", "expiry_time"),
    entry_spot: num("entry_spot", "entry_tick", "entry_spot_display_value"),
    entry_spot_time: num("entry_spot_time", "entry_tick_time"),
    exit_spot: num("exit_spot", "exit_tick", "exit_spot_display_value"),
    exit_spot_time: num("exit_spot_time", "exit_tick_time"),
    buy_price: num("buy_price", "ask_price"),
    sell_price: num("sell_price"),
    payout: num("payout"),
    longcode: str("longcode", "shortcode"),
  };
}
function compactAuditFields(obj = {}) {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) {
    if (v !== null && v !== undefined && v !== "") out[k] = v;
  }
  return out;
}
async function requestRiseFallProposalWithTiming(side, symbol, stake, item = null, timeoutMs = 12000) {
  const variants = buildRiseFallTimingVariants(side, symbol, stake, item);
  const errors = [];
  for (const variant of variants) {
    try {
      const res = await wsRequest({ proposal: 1, ...variant.params }, timeoutMs);
      if (res?.error) throw new Error(res.error.message || res.error.code || "proposal error");
      return { res, timing: variant.timing, params: variant.params, label: variant.label, errors };
    } catch (e) {
      errors.push(`${variant.label}: ${e?.message || e}`);
    }
  }
  throw new Error(`Deriv rechazó el timing de próxima vela (${errors.join(" | ")}). Cambiá a AUTO 58 normal si querés usar duration 1m.`);
}
async function buyRiseFallDirectWithTiming(side, symbol, stake, item = null, timeoutMs = 20000) {
  const variants = buildRiseFallTimingVariants(side, symbol, stake, item);
  const errors = [];
  for (const variant of variants) {
    try {
      const res = await wsRequest({ buy: 1, price: stake, parameters: variant.params }, timeoutMs);
      if (res?.error) throw new Error(res.error.message || res.error.code || "buy error");
      return { res, timing: variant.timing, params: variant.params, label: variant.label, errors };
    } catch (e) {
      errors.push(`${variant.label}: ${e?.message || e}`);
    }
  }
  throw new Error(`Deriv rechazó la compra con timing de próxima vela (${errors.join(" | ")}). Cambiá a AUTO 58 normal si querés usar duration 1m.`);
}

function getAutoPreProposalKey(item, side, symbol, stake) {
  const plan = buildNextCandleTimingPlan(item);
  const id = String(item?.id || `AUTO_PRE_${plan.current_minute}_${symbol}_${side}`);
  return `${id}|${String(side || "")}|${String(symbol || "")}|${Number(stake || 0).toFixed(2)}|${plan.next_expiry_epoch_sec}`;
}
function isAutoPreProposalWindow(item = null) {
  const ms = getSignalConfirmationMs(item);
  return ms >= SIGNAL_AUTO_PREPROPOSAL_START_MS && ms <= SIGNAL_AUTO_PREPROPOSAL_END_MS;
}
function getValidAutoPreProposal(item, side, symbol, stake) {
  const pp = item?.signalAutoPreProposal;
  if (!pp || pp.status !== "ready") return null;
  const safeSide = normalizeSignalConfirmationSide(side);
  if (!safeSide || String(pp.side || "") !== safeSide) return null;
  if (String(pp.symbol || "") !== String(symbol || "")) return null;
  const expectedStake = Number(stake);
  const ppStake = Number(pp.stake);
  if (!Number.isFinite(expectedStake) || !Number.isFinite(ppStake) || Math.abs(expectedStake - ppStake) > 0.005) return null;
  if (!pp.proposal_id || !Number.isFinite(Number(pp.ask_price)) || Number(pp.ask_price) <= 0) return null;
  const plan = buildNextCandleTimingPlan(item);
  if (Number(pp?.timing?.next_expiry_epoch_sec || 0) !== Number(plan.next_expiry_epoch_sec)) return null;
  if (Date.now() - Number(pp.prepared_at || 0) > SIGNAL_AUTO_PREPROPOSAL_TTL_MS) return null;
  return pp;
}
function markAutoPreProposalOnItem(item, payload) {
  if (!item) return;
  item.signalAutoPreProposal = payload && typeof payload === "object" ? { ...payload } : null;
  try { saveHistory(history); } catch {}
  try { if (modalCurrentItem && item.id && modalCurrentItem.id === item.id) updateSignalConfirmationUI(); } catch {}
}
async function prepareRiseFallAutoPreProposal(item, side, reason = "auto_preproposal") {
  const safeSide = normalizeSignalConfirmationSide(side);
  if (!item || !safeSide) return false;
  if (!isNextCandleExpiryTiming() || shouldUseAutoHighLowExecution()) return false;
  if (item?.trade?.badge || item?.signalAutoEntry?.attempted) return false;
  if (!isAutoPreProposalWindow(item)) return false;

  const symbol = String(item.symbol || liveReplaySymbol || SYMBOLS[0] || "R_25");
  try {
    await ensureAuthorized();
    await refreshAccountBalance({ force: false });
  } catch {}
  const stake = Number(getEffectiveTradeStake().toFixed(2));
  const existing = getValidAutoPreProposal(item, safeSide, symbol, stake);
  if (existing) return true;

  const key = getAutoPreProposalKey(item, safeSide, symbol, stake);
  if (autoPreProposalInFlight.has(key)) return false;
  autoPreProposalInFlight.add(key);

  markAutoPreProposalOnItem(item, {
    status: "preparing",
    side: safeSide,
    symbol,
    stake,
    reason: String(reason || "auto_preproposal"),
    prepared_start_at: Date.now(),
    prepared_start_ms: Math.round(getSignalConfirmationMs(item)),
  });

  try {
    await ensureAuthorized();
    const pack = await requestRiseFallProposalWithTiming(safeSide, symbol, stake, item, 9000);
    const proposal = pack?.res?.proposal;
    const proposalId = proposal?.id ? String(proposal.id) : "";
    const askPrice = Number(proposal?.ask_price);
    const payout = Number(proposal?.payout);
    if (!proposalId || !Number.isFinite(askPrice) || askPrice <= 0 || !Number.isFinite(payout)) {
      throw new Error("proposal prearmada inválida");
    }
    const profitPct = ((payout - askPrice) / askPrice) * 100;
    markAutoPreProposalOnItem(item, {
      status: "ready",
      side: safeSide,
      symbol,
      stake,
      proposal_id: proposalId,
      ask_price: askPrice,
      payout,
      profit_pct: Number(profitPct),
      timing: { ...(pack.timing || {}) },
      label: String(pack.label || ""),
      reason: String(reason || "auto_preproposal"),
      prepared_at: Date.now(),
      prepared_ms: Math.round(getSignalConfirmationMs(item)),
      expires_local_at: Date.now() + SIGNAL_AUTO_PREPROPOSAL_TTL_MS,
    });
    return true;
  } catch (e) {
    markAutoPreProposalOnItem(item, {
      status: "error",
      side: safeSide,
      symbol,
      stake,
      reason: String(reason || "auto_preproposal"),
      error: e?.message || String(e),
      error_at: Date.now(),
      error_ms: Math.round(getSignalConfirmationMs(item)),
    });
    return false;
  } finally {
    autoPreProposalInFlight.delete(key);
  }
}
function cancelSignalAutoEntryNoPreProposal(item, side, readiness, reason = "AUTO_PREPROPOSAL_MISSING") {
  if (!item || item?.signalAutoEntry?.attempted) return false;
  const label = side === "CALL" ? "COMPRA" : "VENTA";
  item.signalAutoEntry = {
    type: "AUTO_58_REAL",
    attempted: true,
    status: "cancelled",
    side: normalizeSignalConfirmationSide(side) || "",
    ms: Math.round(Number(readiness?.ms || getSignalConfirmationMs(item))),
    sec: Math.round(Number(readiness?.ms || getSignalConfirmationMs(item)) / 1000),
    reason: String(reason || "AUTO_PREPROPOSAL_MISSING"),
    at: Date.now(),
    error: "Cancelada: la proposal no estaba prearmada antes del post-58. Marcá 4 puntos antes de 56-58s o cambiá a AUTO 58 normal.",
    post58_readiness: { ...(readiness || {}) },
    preproposal: item?.signalAutoPreProposal || null,
  };
  saveHistory(history);
  if (modalCurrentItem && modalCurrentItem.id === item.id) updateSignalConfirmationUI();
  toast(`⛔ AUTO ${label} cancelada: proposal no prearmada`, 2400);
  return true;
}
function scanSignalAutoPreProposals() {
  try {
    if (areSignalsPaused()) return false;
    if (!isNextCandleExpiryTiming() || shouldUseAutoHighLowExecution()) return false;
    const nowMinute = currentServerMinute();
    let started = false;
    const candidates = (history || [])
      .filter((it) => it && it.minute === nowMinute && !it?.trade?.badge && !it?.signalAutoEntry?.attempted)
      .filter((it) => getSignalEnabledTradeSide(it))
      .filter((it) => isAutoPreProposalWindow(it));
    for (const it of candidates) {
      const side = getSignalEnabledTradeSide(it);
      if (side) {
        void prepareRiseFallAutoPreProposal(it, side, "signal_scan_56_58");
        started = true;
      }
    }
    return started;
  } catch { return false; }
}
function getLiveAutoPreProposalKey(sym, side, minute, stake) {
  return `LIVE|${String(sym || "")}|${Number(minute || 0)}|${String(side || "")}|${Number(stake || 0).toFixed(2)}`;
}
function getLiveCachedAutoPreProposal(sym, side, minute, stake) {
  const key = getLiveAutoPreProposalKey(sym, side, minute, stake);
  const pp = liveAutoPreProposalCache.get(key) || null;
  if (!pp || pp.status !== "ready") return null;
  if (Date.now() - Number(pp.prepared_at || 0) > SIGNAL_AUTO_PREPROPOSAL_TTL_MS) return null;
  return pp;
}
async function prepareLiveAutoPreProposalIfNeeded(reason = "live_preproposal") {
  try {
    if (!isNextCandleExpiryTiming() || shouldUseAutoHighLowExecution()) return false;
    if ((localStorage.getItem("activeView") || "signals") !== "live") return false;
    ensureLiveSignalConfirmationsForCurrentMinute();
    const side = getLiveEnabledTradeSide();
    if (!side) return false;
    const sym = liveReplaySymbol || SYMBOLS[0] || "R_25";
    const minute = getLiveReplayMinute(sym);
    const stake = Number(getEffectiveTradeStake().toFixed(2));
    if (getLiveCachedAutoPreProposal(sym, side, minute, stake)) return true;
    const tmp = buildLiveManualTradeItem(side);
    tmp.id = `LIVE_PREPROPOSAL-${minute}-${sym}-${side}`;
    if (!isAutoPreProposalWindow(tmp)) return false;
    const ok = await prepareRiseFallAutoPreProposal(tmp, side, reason);
    if (ok && tmp.signalAutoPreProposal?.status === "ready") {
      liveAutoPreProposalCache.set(getLiveAutoPreProposalKey(sym, side, minute, stake), { ...tmp.signalAutoPreProposal });
      return true;
    }
    if (tmp.signalAutoPreProposal) liveAutoPreProposalCache.set(getLiveAutoPreProposalKey(sym, side, minute, stake), { ...tmp.signalAutoPreProposal });
  } catch {}
  return false;
}
function applyEntryTimingModeUI() {
  const btn = pickEl("entryTimingModeBtn");
  if (!btn) return;
  const storedNext = isEntryTimingStoredNextCandle();
  btn.textContent = getEntryTimingModeLabel();
  btn.classList.toggle("active", storedNext && !shouldUseAutoHighLowExecution());
  btn.title = storedNext
    ? "Prepara proposal desde 56s; espera el tick real >=58s y ahí solo compra con proposal lista. Intenta inicio programado y fija cierre al segundo 60; si Deriv no acepta date_start usa date_expiry fijo. Solo aplica a Rise/Fall."
    : "Modo anterior: AUTO 58 con duración 1 minuto desde la entrada real del contrato.";
}
function ensureEntryTimingModeButton() {
  let btn = pickEl("entryTimingModeBtn");
  if (!btn) {
    const host =
      document.querySelector("#settingsModal .settingsBody .controls") ||
      document.querySelector(".settingsBody .controls") ||
      null;
    if (!host) return null;
    btn = document.createElement("button");
    btn.id = "entryTimingModeBtn";
    btn.type = "button";
    btn.className = "btn btnGhost";
    btn.style.gridColumn = "1 / -1";
    const execBtn = pickEl("executionModeBtn");
    if (execBtn && execBtn.parentElement === host) execBtn.insertAdjacentElement("afterend", btn);
    else host.appendChild(btn);
  }
  btn.onclick = () => {
    entryTimingMode = isEntryTimingStoredNextCandle() ? ENTRY_TIMING_AUTO58_DURATION_1M : ENTRY_TIMING_AUTO58_NEXT_CANDLE_EXPIRY;
    saveEntryTimingMode();
    applyEntryTimingModeUI();
    updateModalCandleStatusUI();
    toast(entryTimingMode === ENTRY_TIMING_AUTO58_NEXT_CANDLE_EXPIRY ? "⏱️ AUTO pre-56/post-58 → cierre 60 ON" : "⏱️ AUTO 58 normal ON", 1700);
  };
  applyEntryTimingModeUI();
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
    updateMentalCooldownUI();
    updateDisciplineLockUI(false);
    updateC100PanelUI();
    // ✅ FIX AUTO 58 DEMO/REAL:
    // La autoentrada no debe depender de que el gráfico se redibuje justo en el segundo 58.
    // Este timer mantiene viva la barra del modal y además revisa señales habilitadas.
    updateModalCandleStatusUI();
    refreshOpenSignalStageBadges();
    scanSignalAutoPreProposals();
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
const LIVE_ANALYSIS_PAUSE_MIGRATION_KEY = "liveAnalysisPauseFix_v51";
let liveAnalysisPaused = false;

function loadLiveAnalysisPaused() {
  try {
    // V51: en versiones anteriores, tocar el botón ▶️ mientras estabas en la pestaña En vivo
    // podía dejar una pausa manual global guardada. Eso hacía que luego salieran muy pocas
    // señales y el celular casi no trabajara. Al instalar esta versión se limpia UNA vez.
    if (localStorage.getItem(LIVE_ANALYSIS_PAUSE_MIGRATION_KEY) !== "1") {
      localStorage.setItem(LIVE_ANALYSIS_PAUSED_KEY, "0");
      localStorage.setItem(LIVE_ANALYSIS_PAUSE_MIGRATION_KEY, "1");
    }
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
function getActiveViewName() {
  try { return localStorage.getItem("activeView") || "signals"; } catch { return "signals"; }
}
function isLiveStandaloneViewActive() {
  return getActiveViewName() === "live";
}
function areSignalsPaused(viewName = null) {
  // Pausa manual global + pausa automática cuando se abre la pestaña En vivo.
  // En vivo es un modo aparte: sigue recibiendo ticks para dibujar, pero no crea nuevas señales
  // ni dispara autoentradas de señales mientras esa pestaña está activa.
  if (isMentalCooldownActive()) return true;
  const view = viewName || getActiveViewName();
  return !!liveAnalysisPaused || view === "live";
}
function getSignalsPauseReason(viewName = null) {
  if (isMentalCooldownActive()) return "mental_cooldown";
  const view = viewName || getActiveViewName();
  if (view === "live") return "live_tab";
  if (liveAnalysisPaused) return "manual";
  return "";
}
function applyLiveAnalysisPauseUI() {
  const btn = document.getElementById("liveAnalysisPauseBtn");
  if (!btn) return;
  const reason = getSignalsPauseReason();
  const paused = areSignalsPaused();
  const autoLive = reason === "live_tab";
  // Botón compacto: solo icono para no ocupar espacio en la fila de pestañas.
  btn.textContent = autoLive ? "👁️" : (paused ? "▶️" : "⏸️");
  btn.dataset.state = autoLive ? "live_auto_pause" : (paused ? "paused" : "live");
  btn.setAttribute("aria-label", autoLive ? "En vivo pausa señales automáticamente" : (paused ? "Reanudar análisis en vivo" : "Pausar análisis en vivo"));
  btn.setAttribute("aria-pressed", paused ? "true" : "false");
  btn.title = autoLive
    ? "La pestaña En vivo pausa señales automáticamente. Volvé a Señales para reanudar análisis."
    : paused
      ? "PAUSADO manualmente: tocar para reanudar análisis en vivo."
      : "LIVE: tocar para pausar nuevas señales.";
  btn.style.borderColor = paused ? "rgba(248,113,113,.72)" : "rgba(34,211,238,.46)";
  btn.style.background = paused
    ? "linear-gradient(180deg, rgba(127,29,29,.42), rgba(127,29,29,.20))"
    : "linear-gradient(180deg, rgba(34,211,238,.16), rgba(255,255,255,.035))";
  btn.style.color = paused ? "#fecaca" : "#ecfeff";
  btn.style.boxShadow = paused ? "0 0 14px rgba(248,113,113,.20)" : "0 0 12px rgba(34,211,238,.12)";
}
function toggleLiveAnalysisPaused() {
  // V51: si estás en En vivo, esa pestaña ya pausa señales automáticamente.
  // No permitimos que este botón deje guardada una pausa manual global por error.
  if (getActiveViewName() === "live") {
    applyLiveAnalysisPauseUI();
    toast("👁️ En vivo pausa señales solo mientras estás en esa pestaña. Volvé a Señales para analizar.", 2200);
    return;
  }
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
  if (activeView === "live") {
    counterEl.textContent = `En vivo: ${liveReplaySymbol || SYMBOLS[0] || "—"}`;
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


function loadKeepClosedAwaySignals() {
  try {
    keepClosedAwaySignals = localStorage.getItem(KEEP_CLOSED_AWAY_SIGNALS_KEY) === "1";
  } catch {
    keepClosedAwaySignals = false;
  }
}
function saveKeepClosedAwaySignals() {
  try {
    localStorage.setItem(KEEP_CLOSED_AWAY_SIGNALS_KEY, keepClosedAwaySignals ? "1" : "0");
  } catch {}
}
function updateKeepClosedAwaySignalsButton() {
  const btn = document.getElementById("keepClosedAwaySignalsBtn");
  if (!btn) return;

  btn.textContent = keepClosedAwaySignals ? "🧪 Guardar fuera SNR: SÍ" : "🧪 Guardar fuera SNR: NO";
  btn.title = keepClosedAwaySignals
    ? "Las señales que cierren fuera de zona azul/amarilla se conservan para testeo."
    : "Las señales sin trade que cierren fuera de zona azul/amarilla se eliminan como antes.";
  btn.setAttribute("aria-pressed", keepClosedAwaySignals ? "true" : "false");
  btn.style.borderColor = keepClosedAwaySignals ? "rgba(34,211,238,.75)" : "rgba(255,255,255,.16)";
  btn.style.background = keepClosedAwaySignals
    ? "linear-gradient(180deg, rgba(34,211,238,.18), rgba(59,130,246,.10))"
    : "";
  btn.style.boxShadow = keepClosedAwaySignals
    ? "0 0 0 1px rgba(34,211,238,.18) inset, 0 0 16px rgba(34,211,238,.18)"
    : "";
}
function toggleKeepClosedAwaySignals() {
  keepClosedAwaySignals = !keepClosedAwaySignals;
  saveKeepClosedAwaySignals();
  updateKeepClosedAwaySignalsButton();

  if (keepClosedAwaySignals) {
    toast("🧪 Test activo: se conservan señales fuera de zona", 1900);
  } else {
    const removed = purgeClosedSignalsOutsideSNRCloseZone("toggle_keep_outside_off");
    toast(removed ? `🧹 Test apagado: ${removed} señal(es) fuera de zona eliminadas` : "🧹 Test apagado", 2000);
  }
}
function ensureKeepClosedAwaySignalsToggle() {
  const btn = ensureViewActionButton("signals", {
    id: "keepClosedAwaySignalsBtn",
    text: keepClosedAwaySignals ? "🧪 Guardar fuera SNR: SÍ" : "🧪 Guardar fuera SNR: NO",
    title: "Conserva o elimina señales sin trade que cierran fuera de zona azul/amarilla",
    onClick: toggleKeepClosedAwaySignals,
  });
  updateKeepClosedAwaySignalsButton();
  return btn;
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


/* =========================
   Pestaña En vivo — vela actual estilo Replay
========================= */
function loadLiveReplaySymbol() {
  try {
    const saved = String(localStorage.getItem(LIVE_REPLAY_SYMBOL_KEY) || "");
    return SYMBOLS.includes(saved) ? saved : (SYMBOLS[0] || "R_10");
  } catch {
    return SYMBOLS[0] || "R_10";
  }
}
function saveLiveReplaySymbol(sym) {
  liveReplaySymbol = SYMBOLS.includes(String(sym || "")) ? String(sym) : (SYMBOLS[0] || "R_10");
  try { localStorage.setItem(LIVE_REPLAY_SYMBOL_KEY, liveReplaySymbol); } catch {}
  resetLiveSignalConfirmations("symbol_change");
  paintLiveSymbolButtons();
  updateCounter("live");
  requestLiveReplayDraw(true);
}
function getLiveReplayMinute(sym = liveReplaySymbol) {
  // Usar la última vela vista del símbolo elegido. Antes dependía del último tick global;
  // si otro par actualizaba el reloj, el replay live podía quedar con ms desfasado y dibujar solo 1 tick.
  const bySymbol = Number(lastMinuteSeenBySymbol?.[sym]);
  if (Number.isFinite(bySymbol) && bySymbol > 0) return bySymbol;
  return currentServerMinute();
}
function getLiveReplayTicks(sym = liveReplaySymbol) {
  const minute = getLiveReplayMinute(sym);
  const arr = minuteData?.[minute]?.[sym];
  return (Array.isArray(arr) ? arr : [])
    .map((p) => ({ ms: Math.max(0, Math.min(60000, Number(p.ms))), quote: Number(p.quote) }))
    .filter((p) => Number.isFinite(p.ms) && Number.isFinite(p.quote))
    .sort((a, b) => a.ms - b.ms);
}
function getLiveReplayMsInMinute(sym = liveReplaySymbol) {
  try {
    const minute = getLiveReplayMinute(sym);
    const now = serverNowMs();
    const byClock = Math.max(0, Math.min(60000, now - minute * 60000));
    const ticks = getLiveReplayTicks(sym);
    const lastTickMs = ticks.length ? Number(ticks[ticks.length - 1].ms) : 0;
    // En vivo debe dibujar todos los ticks recibidos del símbolo, aunque el reloj global
    // venga de otro par o esté algunos segundos corrido.
    return Math.max(0, Math.min(60000, Math.max(byClock, lastTickMs)));
  } catch {
    const ticks = getLiveReplayTicks(sym);
    return ticks.length ? Number(ticks[ticks.length - 1].ms) || 0 : 0;
  }
}
function buildLiveReplayItem(sym = liveReplaySymbol) {
  const minute = getLiveReplayMinute(sym);
  return {
    id: `LIVE::${sym}::${minute}`,
    symbol: sym,
    minute,
    time: "Vela actual",
    mode: "EN VIVO",
    direction: "",
    ticks: getLiveReplayTicks(sym),
  };
}
function paintLiveSymbolButtons() {
  if (!liveSymbolBarEl) return;
  if (!liveSymbolBarEl.dataset.ready) {
    liveSymbolBarEl.innerHTML = SYMBOLS.map((sym) => `<button class="liveSymbolBtn" type="button" data-symbol="${escapeHtml(sym)}">${escapeHtml(sym.replace("R_", "R"))}</button>`).join("");
    liveSymbolBarEl.querySelectorAll(".liveSymbolBtn").forEach((btn) => {
      btn.onclick = () => saveLiveReplaySymbol(btn.dataset.symbol || SYMBOLS[0]);
    });
    liveSymbolBarEl.dataset.ready = "1";
  }
  liveSymbolBarEl.querySelectorAll(".liveSymbolBtn").forEach((btn) => {
    const active = btn.dataset.symbol === liveReplaySymbol;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-pressed", active ? "true" : "false");
  });
}


function getLiveSignalKey(sym = liveReplaySymbol) {
  return `${sym || "—"}::${getLiveReplayMinute(sym) || 0}`;
}
function resetLiveSignalConfirmations(reason = "") {
  liveSignalConfirmations = [];
  liveSignalMinuteKey = getLiveSignalKey(liveReplaySymbol);
  liveAutoEntryState = { minuteKey: liveSignalMinuteKey, attempted: false, status: "idle", side: "", contract_id: "", error: "" };
  updateLiveConfirmationUI(reason);
}
function ensureLiveSignalConfirmationsForCurrentMinute() {
  const key = getLiveSignalKey(liveReplaySymbol);
  if (liveSignalMinuteKey !== key) {
    liveSignalConfirmations = [];
    liveSignalMinuteKey = key;
    liveAutoEntryState = { minuteKey: key, attempted: false, status: "idle", side: "", contract_id: "", error: "" };
  } else if (!liveAutoEntryState || liveAutoEntryState.minuteKey !== key) {
    liveAutoEntryState = { minuteKey: key, attempted: false, status: "idle", side: "", contract_id: "", error: "" };
  }
}
function getLiveConfirmationScore() {
  ensureLiveSignalConfirmationsForCurrentMinute();
  return (Array.isArray(liveSignalConfirmations) ? liveSignalConfirmations : []).reduce((acc, ev) => {
    const side = normalizeSignalConfirmationSide(ev?.side);
    if (side === "CALL") return acc + 1;
    if (side === "PUT") return acc - 1;
    return acc;
  }, 0);
}
function getLiveNetBuyPoints() { return Math.max(0, getLiveConfirmationScore()); }
function getLiveNetSellPoints() { return Math.max(0, -getLiveConfirmationScore()); }
function getLiveEnabledTradeSide() {
  const score = getLiveConfirmationScore();
  if (score >= SIGNAL_CONFIRM_MIN) return "CALL";
  if (score <= -SIGNAL_CONFIRM_MIN) return "PUT";
  return "";
}
function getLiveConfirmationStatusText() {
  return `COMPRA ${getLiveNetBuyPoints()}/${SIGNAL_CONFIRM_MIN} · VENTA ${getLiveNetSellPoints()}/${SIGNAL_CONFIRM_MIN}`;
}
function getLiveMissingConfirmations(side) {
  const wanted = normalizeSignalConfirmationSide(side);
  if (wanted === "CALL") return Math.max(0, SIGNAL_CONFIRM_MIN - getLiveNetBuyPoints());
  if (wanted === "PUT") return Math.max(0, SIGNAL_CONFIRM_MIN - getLiveNetSellPoints());
  return SIGNAL_CONFIRM_MIN;
}
function updateLiveConfirmationUI(reason = "") {
  ensureLiveSignalConfirmationsForCurrentMinute();
  const enabled = getLiveEnabledTradeSide();
  const buyPts = getLiveNetBuyPoints();
  const sellPts = getLiveNetSellPoints();
  const totalEvents = Array.isArray(liveSignalConfirmations) ? liveSignalConfirmations.length : 0;
  if (liveConfirmCountEl) {
    if (enabled === "CALL" || enabled === "PUT") {
      const pts = enabled === "CALL" ? buyPts : sellPts;
      liveConfirmCountEl.innerHTML = `${enabled === "CALL" ? "COMPRA" : "VENTA"} habilitada <span class="signalConfirmPts">${pts}/${SIGNAL_CONFIRM_MIN} pts</span>`;
    } else {
      liveConfirmCountEl.textContent = getLiveConfirmationStatusText();
    }
    liveConfirmCountEl.style.color = enabled === "CALL" ? "#dcfce7" : enabled === "PUT" ? "#fecaca" : "rgba(255,255,255,.92)";
    liveConfirmCountEl.style.borderColor = enabled === "CALL" ? "rgba(34,197,94,.46)" : enabled === "PUT" ? "rgba(239,68,68,.46)" : "rgba(251,191,36,.24)";
    liveConfirmCountEl.style.background = enabled === "CALL" ? "rgba(22,163,74,.16)" : enabled === "PUT" ? "rgba(127,29,29,.19)" : "rgba(0,0,0,.13)";
  }
  if (liveConfirmHintEl) {
    const msNow = getLiveReplayMsInMinute(liveReplaySymbol);
    const secNow = Math.max(0, Math.min(60, Math.floor(msNow / 1000)));
    const faltanAuto = Math.max(0, SIGNAL_AUTO_ENTRY_SEC - secNow);
    liveConfirmHintEl.textContent = enabled
      ? `AUTO ${SIGNAL_AUTO_ENTRY_SEC}s · ${enabled === "CALL" ? "COMPRA" : "VENTA"}${faltanAuto ? ` · faltan ${faltanAuto}s` : ""}`
      : `Modo en vivo · mínimo ${SIGNAL_CONFIRM_MIN} puntos netos · AUTO ${SIGNAL_AUTO_ENTRY_SEC}s`;
    liveConfirmHintEl.style.color = enabled === "CALL" ? "#bbf7d0" : enabled === "PUT" ? "#fecaca" : "rgba(255,255,255,.68)";
  }
  if (liveConfirmBuyBtn) liveConfirmBuyBtn.textContent = `🟢 + COMPRA ${buyPts}/${SIGNAL_CONFIRM_MIN}`;
  if (liveConfirmSellBtn) liveConfirmSellBtn.textContent = `🔴 + VENTA ${sellPts}/${SIGNAL_CONFIRM_MIN}`;
  if (liveConfirmUndoBtn) {
    liveConfirmUndoBtn.disabled = totalEvents <= 0;
    liveConfirmUndoBtn.style.opacity = liveConfirmUndoBtn.disabled ? ".42" : "1";
  }
  if (liveBuyCallBtn) {
    const enabledCall = enabled === "CALL";
    liveBuyCallBtn.textContent = `🟢 AUTO ${SIGNAL_AUTO_ENTRY_SEC}s COMPRA`;
    liveBuyCallBtn.disabled = true;
    liveBuyCallBtn.style.opacity = enabledCall ? "1" : ".45";
    liveBuyCallBtn.title = enabledCall
      ? `COMPRA lista: se ejecuta automáticamente en el segundo ${SIGNAL_AUTO_ENTRY_SEC}`
      : `Faltan ${getLiveMissingConfirmations("CALL")} puntos netos para COMPRA`;
  }
  if (liveBuyPutBtn) {
    const enabledPut = enabled === "PUT";
    liveBuyPutBtn.textContent = `🔴 AUTO ${SIGNAL_AUTO_ENTRY_SEC}s VENTA`;
    liveBuyPutBtn.disabled = true;
    liveBuyPutBtn.style.opacity = enabledPut ? "1" : ".45";
    liveBuyPutBtn.title = enabledPut
      ? `VENTA lista: se ejecuta automáticamente en el segundo ${SIGNAL_AUTO_ENTRY_SEC}`
      : `Faltan ${getLiveMissingConfirmations("PUT")} puntos netos para VENTA`;
  }
  if (enabled === "CALL" || enabled === "PUT") void prepareLiveAutoPreProposalIfNeeded("live_ui_56_58");
}
function addLiveSignalConfirmation(side = "CALL") {
  const safeSide = normalizeSignalConfirmationSide(side);
  if (!safeSide) return;
  ensureLiveSignalConfirmationsForCurrentMinute();
  liveSignalConfirmations.push({ side: safeSide, ms: getLiveReplayMsInMinute(liveReplaySymbol), at: Date.now(), source: "live_tab_points" });
  updateLiveConfirmationUI();
  const enabled = getLiveEnabledTradeSide();
  if (enabled === "CALL" || enabled === "PUT") {
    toast(`✅ ${enabled === "CALL" ? "COMPRA" : "VENTA"} habilitada: ${getLiveConfirmationStatusText()}`, 1400);
    void prepareLiveAutoPreProposalIfNeeded("live_points_enabled");
  } else toast(`🧠 ${getLiveConfirmationStatusText()}. Faltan puntos para operar.`, 1300);
}
function removeLiveSignalConfirmation() {
  ensureLiveSignalConfirmationsForCurrentMinute();
  liveSignalConfirmations.pop();
  updateLiveConfirmationUI();
}

function drawLiveReplayCanvas(canvas, item, replayMs = 0, infoEl = null) {
  if (!canvas || !item) return;

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

  let ticks = Array.isArray(item.ticks) ? item.ticks.slice() : [];
  ticks = ticks
    .map((p, idx) => ({
      ms: Math.max(0, Math.min(60000, Number(p?.ms))),
      quote: Number(p?.quote),
      idx,
    }))
    .filter((p) => Number.isFinite(p.ms) && Number.isFinite(p.quote))
    .sort((a, b) => (a.ms - b.ms) || (a.idx - b.idx));

  if (ticks.length < 2) {
    drawMiniCandlesLoading(ctx, w, h, "Esperando ticks en vivo…");
    if (infoEl) infoEl.textContent = `${item.symbol || "—"} · esperando ticks suficientes`;
    return;
  }

  const pts = ticks;
  const quotes = pts.map((p) => Number(p.quote)).filter(Number.isFinite);
  const open = Number(pts[0].quote);
  const close = Number(pts[pts.length - 1].quote);
  const high = Math.max(...quotes);
  const low = Math.min(...quotes);

  let min = low;
  let max = high;
  if (!Number.isFinite(min) || !Number.isFinite(max)) return;
  let range = max - min;
  if (range < 1e-9) range = Math.max(Math.abs(close || 1) * 0.000001, 1e-9);
  const pad = Math.max(range * 0.18, Math.abs(close || 1) * 0.00010);
  min -= pad;
  max += pad;

  const xOf = (ms) => (Number(ms) / 60000) * (w - 20) + 10;
  const yOf = (q) => (1 - (Number(q) - min) / Math.max(max - min, 1e-12)) * (h - 30) + 10;
  const msNow = Math.max(0, Math.min(60000, Math.max(Number(replayMs || 0), pts[pts.length - 1].ms || 0)));

  const segments = [
    { start: 0, end: 15000 },
    { start: 15000, end: 30000 },
    { start: 30000, end: 45000 },
    { start: 45000, end: 60000 },
  ];

  for (const seg of segments) {
    const x1 = xOf(seg.start);
    const x2 = xOf(seg.end);
    let fill = "rgba(255,255,255,0.025)";
    if (msNow >= seg.end) fill = "rgba(34,211,238,0.10)";
    else if (msNow >= seg.start && msNow < seg.end) fill = "rgba(251,191,36,0.10)";
    ctx.fillStyle = fill;
    ctx.fillRect(x1, 8, Math.max(0, x2 - x1), h - 32);
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

  for (const mark of [0, 15000, 30000, 45000, 60000]) {
    const x = xOf(mark);
    ctx.save();
    ctx.setLineDash(mark === 60000 ? [] : [5, 5]);
    ctx.strokeStyle = mark === 30000 ? "rgba(255,255,255,0.42)" : "rgba(255,255,255,0.26)";
    ctx.lineWidth = mark === 30000 ? 1.8 : 1.2;
    ctx.beginPath();
    ctx.moveTo(x, 10);
    ctx.lineTo(x, h - 22);
    ctx.stroke();
    ctx.restore();

    const label = mark === 0 ? "0s" : mark === 15000 ? "15s" : mark === 30000 ? "30s" : mark === 45000 ? "45s" : "60s";
    ctx.fillStyle = "rgba(255,255,255,0.78)";
    ctx.font = "12px system-ui, sans-serif";
    ctx.textAlign = mark === 60000 ? "right" : "left";
    ctx.fillText(label, mark === 60000 ? w - 8 : Math.min(w - 28, x + 4), h - 6);
  }

  // Recorrido en vivo — sin vela lateral para que el gráfico tenga el mismo espacio que el modal.
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,.86)";
  ctx.lineWidth = 2.35;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  pts.forEach((p, i) => {
    const x = xOf(p.ms), y = yOf(p.quote);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.stroke();

  const step = Math.max(1, Math.floor(pts.length / 100));
  ctx.fillStyle = "rgba(255,255,255,.72)";
  for (let i = 0; i < pts.length; i += step) {
    const p = pts[i];
    ctx.beginPath();
    ctx.arc(xOf(p.ms), yOf(p.quote), 1.15, 0, Math.PI * 2);
    ctx.fill();
  }
  const last = pts[pts.length - 1];
  ctx.fillStyle = "rgba(255,255,255,1)";
  ctx.strokeStyle = "rgba(15,23,42,.90)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(xOf(last.ms), yOf(last.quote), 5.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  if (infoEl) {
    const sec = Math.max(0, Math.min(60, Math.floor(msNow / 1000)));
    const lastMove = pts.length >= 2 ? close - Number(pts[pts.length - 2].quote) : 0;
    const dir = lastMove > 0 ? "↑" : lastMove < 0 ? "↓" : "•";
    infoEl.textContent = `${sec}s · ${pts.length} ticks · ${dir} precio ${close.toFixed(6)} · O ${open.toFixed(6)} H ${high.toFixed(6)} L ${low.toFixed(6)} C ${close.toFixed(6)}`;
  }
}

function drawLiveReplayNow(force = false) {
  if (!liveView || liveView.classList.contains("hidden")) return;
  if (!liveReplayCanvas) return;
  const now = Date.now();
  if (!force && now - liveReplayLastDrawAt < LIVE_REPLAY_DRAW_MIN_INTERVAL_MS) return;
  liveReplayLastDrawAt = now;

  paintLiveSymbolButtons();
  const item = buildLiveReplayItem(liveReplaySymbol);
  const ticks = item.ticks || [];
  const ms = getLiveReplayMsInMinute(liveReplaySymbol);
  ensureLiveSignalConfirmationsForCurrentMinute();
  updateLiveConfirmationUI();
  tryLiveAutoEntryAt59("LIVE_DRAW_58_SCAN");

  if (liveReplaySubEl) {
    const sec = Math.floor(ms / 1000);
    const last = ticks.length ? Number(ticks[ticks.length - 1].quote) : Number(lastQuoteBySymbol?.[liveReplaySymbol]);
    liveReplaySubEl.textContent = `${liveReplaySymbol} · vela actual · ${sec}s/60s${Number.isFinite(last) ? " · " + last.toFixed(6) : ""} · señales pausadas`;
  }

  if (ticks.length < 2) {
    const ctx = liveReplayCanvas.getContext("2d");
    const cssW = liveReplayCanvas.clientWidth || 1;
    const cssH = liveReplayCanvas.clientHeight || 1;
    const dpr = window.devicePixelRatio || 1;
    liveReplayCanvas.width = Math.floor(cssW * dpr);
    liveReplayCanvas.height = Math.floor(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    ctx.fillStyle = "rgba(2,6,23,0.96)";
    ctx.fillRect(0, 0, cssW, cssH);
    drawMiniCandlesLoading(ctx, cssW, cssH, "Esperando ticks en vivo…");
    if (liveReplayInfoEl) liveReplayInfoEl.textContent = `${liveReplaySymbol} · esperando ticks de la vela actual`;
    return;
  }

  // En vivo usa un dibujador propio: no recorta por replayMs como el replay histórico,
  // porque los ticks recibidos YA son la vela actual. Esto evita que se vea solo el punto/barra
  // cuando el reloj y los ms de ticks quedan desfasados.
  drawLiveReplayCanvas(liveReplayCanvas, item, ms, liveReplayInfoEl);
}
function setLiveTradeButtonsBusy(busy = false) {
  [liveBuyCallBtn, liveBuyPutBtn].forEach((btn) => {
    if (!btn) return;
    if (busy) {
      btn.disabled = true;
      btn.style.opacity = ".55";
    }
  });
  if (!busy) updateLiveConfirmationUI();
}
function setLiveTradeStatus(text, tone = "") {
  if (!liveTradeStatusEl) return;
  liveTradeStatusEl.textContent = text || "";
  liveTradeStatusEl.dataset.tone = tone || "";
}
function buildLiveManualTradeItem(side = "CALL") {
  const sym = liveReplaySymbol || SYMBOLS[0] || "R_25";
  const minute = getLiveReplayMinute(sym);
  const ticks = getLiveReplayTicks(sym);
  const safeSide = normalizeSignalConfirmationSide(side) || "CALL";
  ensureLiveSignalConfirmationsForCurrentMinute();
  return {
    id: `LIVE_TRADE-${minute}-${sym}-${safeSide}-${Date.now()}`,
    minute,
    time: `${new Date(minute * 60000).toISOString().slice(11, 19)} UTC`,
    symbol: sym,
    direction: safeSide,
    mode: "EN VIVO",
    mode_version: "V57_LIVE_AUTO58_POINTS",
    ticks: ticks.slice(),
    minuteComplete: false,
    signalConfirmations: (Array.isArray(liveSignalConfirmations) ? liveSignalConfirmations : []).map((ev) => ({ ...ev })),
    liveManualTrade: true,
  };
}

function getLiveReplayLastTickMs(sym = liveReplaySymbol) {
  const ticks = getLiveReplayTicks(sym);
  return ticks.length ? Number(ticks[ticks.length - 1].ms) || 0 : 0;
}
function getPost58EntryReadinessForLive(sym = liveReplaySymbol) {
  const ms = getLiveReplayMsInMinute(sym);
  const lastTickMs = getLiveReplayLastTickMs(sym);

  if (!isNextCandleExpiryTiming()) {
    return { ok: ms >= SIGNAL_AUTO_ENTRY_MS && ms < 60000, ms, lastTickMs, reason: "duration_1m_window" };
  }
  if (ms < SIGNAL_AUTO_ENTRY_MS) {
    return { ok: false, wait: true, ms, lastTickMs, reason: "esperando_58" };
  }
  if (lastTickMs < SIGNAL_AUTO_ENTRY_MS) {
    return { ok: false, wait: true, ms, lastTickMs, reason: "esperando_tick_58" };
  }
  if (ms > SIGNAL_AUTO_POST58_MAX_MS) {
    return { ok: false, late: true, ms, lastTickMs, reason: "tick_58_tarde" };
  }
  return { ok: true, ms, lastTickMs, reason: "post_tick_58_ok" };
}
function isLiveAutoEntryWindowOpen(sym = liveReplaySymbol) {
  return !!getPost58EntryReadinessForLive(sym).ok;
}
function formatLiveAutoEntryWaitText(sym = liveReplaySymbol) {
  const r = getPost58EntryReadinessForLive(sym);
  const sec = Math.max(0, Math.min(60, Math.floor(Number(r.ms || 0) / 1000)));
  if (!isNextCandleExpiryTiming()) {
    if (sec < SIGNAL_AUTO_ENTRY_SEC) return `faltan ${SIGNAL_AUTO_ENTRY_SEC - sec}s para AUTO ${SIGNAL_AUTO_ENTRY_SEC}s`;
    if (sec >= 60) return "vela cerrada";
    return `AUTO ${SIGNAL_AUTO_ENTRY_SEC}s listo`;
  }
  if (r.reason === "esperando_58") return `faltan ${SIGNAL_AUTO_ENTRY_SEC - sec}s para AUTO post-58`;
  if (r.reason === "esperando_tick_58") return "esperando tick real de 58s";
  if (r.late) return `cancelado: pasó ${SIGNAL_AUTO_POST58_MAX_SEC.toFixed(1)}s`;
  return "AUTO post-58 listo";
}
async function liveAutoTradeAt59(side = "CALL", reason = "LIVE_AUTO_58") {
  const safeSide = normalizeSignalConfirmationSide(side);
  if (!safeSide) return false;
  ensureLiveSignalConfirmationsForCurrentMinute();

  const sym = liveReplaySymbol || SYMBOLS[0] || "R_25";
  const key = getLiveSignalKey(sym);
  if (liveAutoEntryState?.minuteKey === key && liveAutoEntryState?.attempted) return false;
  const post58 = getPost58EntryReadinessForLive(sym);
  if (!post58.ok) {
    if (post58.late) {
      liveAutoEntryState = { minuteKey: key, attempted: true, status: "cancelled", side: safeSide, contract_id: "", error: `Cancelada: no llegó a comprar dentro de la ventana post-58 (${SIGNAL_AUTO_POST58_MAX_SEC.toFixed(1)}s).` };
      setLiveTradeStatus(`⛔ AUTO ${safeSide === "CALL" ? "COMPRA" : "VENTA"} cancelada: llegó tarde después de ${SIGNAL_AUTO_POST58_MAX_SEC.toFixed(1)}s`, "error");
    }
    return false;
  }
  if (tradeInFlight) return false;

  const enabledSide = getLiveEnabledTradeSide();
  if (enabledSide !== safeSide) return false;

  const item = buildLiveManualTradeItem(safeSide);
  item.liveManualTrade = false;
  item.liveAuto59Trade = true;
  try {
    const stake = Number(getEffectiveTradeStake().toFixed(2));
    const pp = getLiveCachedAutoPreProposal(sym, safeSide, getLiveReplayMinute(sym), stake);
    if (pp) item.signalAutoPreProposal = { ...pp };
  } catch {}
  if (isNextCandleExpiryTiming() && !shouldUseAutoHighLowExecution() && !item.signalAutoPreProposal) {
    liveAutoEntryState = { minuteKey: key, attempted: true, status: "cancelled", side: safeSide, contract_id: "", error: "Cancelada: proposal no prearmada antes del post-58." };
    setLiveTradeStatus(`⛔ AUTO ${safeSide === "CALL" ? "COMPRA" : "VENTA"} cancelada: proposal no prearmada`, "error");
    return false;
  }
  item.signalAutoEntry = {
    type: "LIVE_AUTO_58",
    attempted: true,
    status: "sending",
    side: safeSide,
    ms: Math.round(getLiveReplayMsInMinute(sym)),
    sec: Math.round(getLiveReplayMsInMinute(sym) / 1000),
    reason: String(reason || "LIVE_AUTO_58"),
    at: Date.now(),
    confirmation_status: getLiveConfirmationStatusText(),
    post58_readiness: post58,
  };

  liveAutoEntryState = { minuteKey: key, attempted: true, status: "sending", side: safeSide, contract_id: "", error: "" };

  try {
    setLiveTradeButtonsBusy(true);
    setLiveTradeStatus(`🚀 AUTO prearmado: enviando ${safeSide === "CALL" ? "COMPRA" : "VENTA"} en vivo ${sym}…`, "pending");

    history.push(item);
    if (history.length > MAX_HISTORY) history = history.slice(-MAX_HISTORY);
    saveHistory(history);

    const res = await Promise.race([
      buyOneClick(safeSide, sym, item),
      new Promise((_, rej) => setTimeout(() => rej(new Error("timeout auto trade en vivo")), 22000)),
    ]);
    const cid = res?.buy?.contract_id ? String(res.buy.contract_id) : "";
    liveAutoEntryState.status = "sent";
    liveAutoEntryState.contract_id = cid;
    item.signalAutoEntry.status = "sent";
    item.signalAutoEntry.contract_id = cid;
    item.signalAutoEntry.sent_at = Date.now();
    saveHistory(history);
    setLiveTradeStatus(`✅ AUTO ${safeSide === "CALL" ? "COMPRA" : "VENTA"} enviado${cid ? " · ID " + cid : ""}`, "ok");
    toast(`✅ AUTO ${SIGNAL_AUTO_ENTRY_SEC}s en vivo enviado ${cid ? "ID: " + cid : ""}`, 1800);
    resetLiveSignalConfirmations("live_auto_sent");
    return true;
  } catch (e) {
    liveAutoEntryState.status = "error";
    liveAutoEntryState.error = e?.message || String(e);
    try {
      if (!item?.trade?.contract_id && !item?.signalAutoEntry?.contract_id) {
        history = (history || []).filter((it) => it?.id !== item.id);
        saveHistory(history);
      }
    } catch {}
    const msg = e?.message || String(e);
    setLiveTradeStatus(`⚠️ AUTO en vivo falló: ${msg}`, "error");
    toast(`⚠️ AUTO en vivo falló: ${msg}`, 2600);
    return false;
  } finally {
    setLiveTradeButtonsBusy(false);
    updateLiveConfirmationUI();
    updateCounter(getActiveViewName());
  }
}
function tryLiveAutoEntryAt59(reason = "LIVE_TIMER_58") {
  try {
    if ((localStorage.getItem("activeView") || "signals") !== "live") return false;
    ensureLiveSignalConfirmationsForCurrentMinute();
    const side = getLiveEnabledTradeSide();
    if (!side) return false;
    return liveAutoTradeAt59(side, reason);
  } catch {
    return false;
  }
}
function liveManualTrade(side = "CALL") {
  const safeSide = normalizeSignalConfirmationSide(side);
  if (!safeSide) return;
  ensureLiveSignalConfirmationsForCurrentMinute();
  const enabledSide = getLiveEnabledTradeSide();
  if (enabledSide !== safeSide) {
    const faltan = getLiveMissingConfirmations(safeSide);
    setLiveTradeStatus(`Faltan ${faltan} punto${faltan === 1 ? "" : "s"} neto${faltan === 1 ? "" : "s"} para ${safeSide === "CALL" ? "COMPRA" : "VENTA"}. ${getLiveConfirmationStatusText()}`, "pending");
    toast(`Primero marcá 4 puntos netos para ${safeSide === "CALL" ? "COMPRA" : "VENTA"}`, 1600);
    return false;
  }
  const wait = formatLiveAutoEntryWaitText(liveReplaySymbol);
  setLiveTradeStatus(`✅ ${safeSide === "CALL" ? "COMPRA" : "VENTA"} preparada · ${wait}. Se ejecuta automáticamente, igual que Señales.`, "pending");
  toast(`AUTO ${SIGNAL_AUTO_ENTRY_SEC}s preparado: ${safeSide === "CALL" ? "COMPRA" : "VENTA"}`, 1500);
  tryLiveAutoEntryAt59("LIVE_BUTTON_CHECK");
  return false;
}

function initLiveTradeButtons() {
  if (liveConfirmBuyBtn && !liveConfirmBuyBtn.dataset.ready) {
    liveConfirmBuyBtn.onclick = () => addLiveSignalConfirmation("CALL");
    liveConfirmBuyBtn.dataset.ready = "1";
  }
  if (liveConfirmSellBtn && !liveConfirmSellBtn.dataset.ready) {
    liveConfirmSellBtn.onclick = () => addLiveSignalConfirmation("PUT");
    liveConfirmSellBtn.dataset.ready = "1";
  }
  if (liveConfirmUndoBtn && !liveConfirmUndoBtn.dataset.ready) {
    liveConfirmUndoBtn.onclick = () => removeLiveSignalConfirmation();
    liveConfirmUndoBtn.dataset.ready = "1";
  }
  if (liveBuyCallBtn && !liveBuyCallBtn.dataset.ready) {
    liveBuyCallBtn.onclick = () => liveManualTrade("CALL");
    liveBuyCallBtn.dataset.ready = "1";
  }
  if (liveBuyPutBtn && !liveBuyPutBtn.dataset.ready) {
    liveBuyPutBtn.onclick = () => liveManualTrade("PUT");
    liveBuyPutBtn.dataset.ready = "1";
  }
  updateLiveConfirmationUI();
  setLiveTradeStatus("Modo en vivo: señales pausadas. Sumá 4 puntos netos; se ejecuta automático en el segundo 58.");
}

function requestLiveReplayDraw(force = false) {
  if ((localStorage.getItem("activeView") || "signals") !== "live") return;
  drawLiveReplayNow(force);
}
function liveReplayLoop() {
  if ((localStorage.getItem("activeView") || "signals") !== "live") {
    stopLiveReplayLoop();
    return;
  }
  drawLiveReplayNow(false);
  liveReplayRaf = requestAnimationFrame(liveReplayLoop);
}
function startLiveReplayLoop() {
  stopLiveReplayLoop();
  initLiveTradeButtons();
  paintLiveSymbolButtons();
  drawLiveReplayNow(true);
  liveReplayRaf = requestAnimationFrame(liveReplayLoop);
}
function stopLiveReplayLoop() {
  if (liveReplayRaf) cancelAnimationFrame(liveReplayRaf);
  liveReplayRaf = null;
}

function updatePerViewClearButtonsVisibility(activeView) {
  const wSignals = document.getElementById("clearSignalsInlineBtnWrap");
  const wTrades = document.getElementById("clearTradesInlineBtnWrap");
  const wKeepOutside = document.getElementById("keepClosedAwaySignalsBtnWrap");

  if (wSignals) wSignals.style.display = activeView === "signals" ? "flex" : "none";
  if (wKeepOutside) wKeepOutside.style.display = activeView === "signals" ? "flex" : "none";
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

  ensureKeepClosedAwaySignalsToggle();

  const oldTradesWrap = document.getElementById("clearTradesInlineBtnWrap");
  if (oldTradesWrap) oldTradesWrap.remove();

  const av = localStorage.getItem("activeView") || "signals";
  updatePerViewClearButtonsVisibility(av);
}

function setActiveView(name) {
  const isSignals = name === "signals";
  const isLive = name === "live";
  const isTrades = name === "trades";
  const isPractice = name === "practice";

  const tv = ensureTradesView();

  if (signalsView) signalsView.classList.toggle("hidden", !isSignals);
  if (liveView) liveView.classList.toggle("hidden", !isLive);
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
  if (isLive) {
    startLiveReplayLoop();
    setLiveTradeStatus("Modo en vivo activo: señales pausadas solo en esta pestaña. Volvé a Señales para reanudar análisis.");
  } else {
    stopLiveReplayLoop();
  }
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
  const initial = ["signals", "live", "trades", "practice"].includes(saved) ? saved : "signals";
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
const PRACTICE_AUTO_ENTRY_MS = 58000;
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
function tryPracticeAutoEntryAt57(reason = "AUTO_58") {
  if (!practiceRound || practiceRound.finished || practiceRound.answer) return false;
  if (!isPracticePastAutoEntryTime(practiceRound)) return false;

  const side = getPracticeEnabledTradeSide();
  if (side !== "CALL" && side !== "PUT") return false;

  practiceRound.answer = side;
  practiceRound.autoEntry = {
    type: "AUTO_58",
    side,
    ms: Math.round(Number(practiceRound.replayMs || PRACTICE_AUTO_ENTRY_MS)),
    sec: PRACTICE_AUTO_ENTRY_SEC,
    reason: String(reason || "AUTO_58"),
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
  panel.style.padding = "10px";
  panel.style.borderRadius = "16px";
  panel.style.border = "1px solid rgba(255,255,255,.14)";
  panel.style.background = "linear-gradient(180deg, rgba(255,255,255,.075), rgba(255,255,255,.035))";
  panel.style.boxShadow = "0 12px 28px rgba(0,0,0,.20), inset 0 0 0 1px rgba(255,255,255,.045)";

  const top = document.createElement("div");
  top.style.display = "flex";
  top.style.alignItems = "center";
  top.style.justifyContent = "space-between";
  top.style.gap = "8px";
  top.style.marginBottom = "8px";

  const count = document.createElement("div");
  count.id = "practiceConfirmCount";
  count.style.fontWeight = "950";
  count.style.letterSpacing = ".25px";
  count.style.fontSize = "14px";
  count.style.padding = "8px 11px";
  count.style.borderRadius = "999px";
  count.style.border = "1px solid rgba(255,255,255,.14)";
  count.style.background = "rgba(0,0,0,.16)";
  count.style.whiteSpace = "normal";
  count.style.lineHeight = "1.15";

  const hint = document.createElement("div");
  hint.id = "practiceConfirmHint";
  hint.style.flex = "1";
  hint.style.textAlign = "right";
  hint.style.fontSize = "11.5px";
  hint.style.fontWeight = "800";
  hint.style.opacity = ".86";
  hint.style.lineHeight = "1.18";
  hint.style.maxWidth = "150px";

  top.appendChild(count);
  top.appendChild(hint);

  const row = document.createElement("div");
  row.style.display = "grid";
  row.style.gridTemplateColumns = "minmax(0, 1fr) minmax(0, 1fr) auto";
  row.style.gap = "8px";
  row.style.alignItems = "stretch";

  const buyBtn = document.createElement("button");
  buyBtn.id = "practiceConfirmBuyBtn";
  buyBtn.type = "button";
  buyBtn.className = "btn";
  buyBtn.textContent = "🟢 + COMPRA";
  buyBtn.title = "Sumar una confirmación a favor de COMPRA. Si había puntos de VENTA, primero los resta.";
  buyBtn.style.minHeight = "48px";
  buyBtn.style.borderRadius = "14px";
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
  sellBtn.style.minHeight = "48px";
  sellBtn.style.borderRadius = "14px";
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
  undoBtn.style.minHeight = "48px";
  undoBtn.style.minWidth = "52px";
  undoBtn.style.borderRadius = "14px";
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

  // Si el usuario supera las 4 confirmaciones netas cuando la ronda ya pasó 58s,
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
  ctx.globalAlpha = 0.14;
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

  // Auto-entrada de práctica: al segundo 58, si ya hay 4 puntos netos
  // para COMPRA o VENTA y no hubo decisión manual, se elige esa dirección.
  tryPracticeAutoEntryAt57("TIMER_58");

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
  try { repairSettingsMenuBindings(); } catch {}
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
      signalAutoEntry: it.signalAutoEntry || null,
      giroPolaridad: getSignalLevelMeta(it),
      snrLevel: getSignalLevelMeta(it),
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
        alert(`✅ Exportado estudio al portapapeles: ${studyPayload.count_marked_signals} señales + ${studyPayload.count_marked_trades} trades + ${studyPayload.count_practice_selected} claras + ${studyPayload.count_giro_aprendizaje_examples} aprendizaje.`);
        return;
      } catch {
        const ts = new Date().toISOString().replaceAll(":", "-");
        downloadTextFile(`deriv-trades-feedback-estudio-${ts}.json`, studyJson);
        alert(`📥 Descargado estudio: ${studyPayload.count_marked_signals} señales + ${studyPayload.count_marked_trades} trades + ${studyPayload.count_practice_selected} claras + ${studyPayload.count_giro_aprendizaje_examples} aprendizaje.`);
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
  const markedSignals = (history || []).filter((x) => x && (x.vote || x.comment));
  const aprendizaje = Array.isArray(giroAprendizajeExamples) ? giroAprendizajeExamples : [];
  const aprendizajeStats = getGiroAprendizajeStats();
  return {
    exported_at: new Date().toISOString(),
    export_scope: "trades_feedback_practice_clear_and_giro_aprendizaje",
    count_trades_total: (journalForExport || []).length,
    count_marked_trades: markedTrades.length,
    count_marked_signals: markedSignals.length,
    count_practice_selected: selectedPractice.length,
    count_clear_formations: selectedPractice.length,
    count_giro_aprendizaje_examples: aprendizaje.length,
    giro_aprendizaje_stats: aprendizajeStats,
    description: "Incluye señales marcadas con like/dislike, trades marcados, niveles SNR detectados, formaciones claras de Práctica y ejemplos de Giro + Aprendizaje.",

    // Señales marcadas desde la pestaña Señales. Incluye el nivel SNR si la señal lo trae.
    signals_marked: markedSignals.map((it) => ({
      id: it.id || "",
      minute: it.minute || 0,
      time: it.time || "",
      symbol: it.symbol || "",
      direction: it.direction || "",
      mode: it.mode || MODE_SNR_SEGUNDO_TOQUE,
      mode_version: it.mode_version || getModeVersion(it.mode || MODE_SNR_SEGUNDO_TOQUE) || "",
      vote: it.vote || "",
      comment: it.comment || "",
      nextOutcome: it.nextOutcome || "",
      minuteComplete: !!it.minuteComplete,
      trade: it.trade || null,
      signalAutoEntry: it.signalAutoEntry || null,
      giroPolaridad: getSignalLevelMeta(it),
      snrLevel: getSignalLevelMeta(it),
      manualGiro: normalizeManualGiroState(it.manualGiro),
      ticks: Array.isArray(it.ticks) ? it.ticks : [],
    })),

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
      giroPolaridad: getSignalLevelMeta(x),
      snrLevel: getSignalLevelMeta(x),
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

  if (!payload.count_marked_signals && !payload.count_marked_trades && !payload.count_practice_selected && !payload.count_giro_aprendizaje_examples) {
    alert("No hay señales/trades marcados, formaciones claras ni ejemplos de Giro + Aprendizaje para exportar todavía.");
    return;
  }

  try {
    await navigator.clipboard.writeText(json);
    alert(`✅ Exportado al portapapeles: ${payload.count_marked_signals} señales + ${payload.count_marked_trades} trades + ${payload.count_practice_selected} claras + ${payload.count_giro_aprendizaje_examples} aprendizaje. Pegalo acá en el chat.`);
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
  const senales = (history || []).filter((x) => x && (x.vote || x.comment)).length;
  const marcados = getTradesJournalExportList().filter((x) => x && (x.vote || x.comment)).length;
  const aprendizaje = Array.isArray(giroAprendizajeExamples) ? giroAprendizajeExamples.length : 0;
  const total = senales + claras + marcados + aprendizaje;
  btn.textContent = total ? `📤 Exportar estudio (${senales}S/${marcados}T/${claras}C/${aprendizaje}A)` : "📤 Exportar estudio";
  btn.title = total
    ? `Exporta ${senales} señal${senales === 1 ? " marcada" : "es marcadas"}, ${marcados} trade${marcados === 1 ? " marcado" : "s marcados"}, ${claras} formación${claras === 1 ? " clara" : "es claras"} y ${aprendizaje} ejemplo${aprendizaje === 1 ? "" : "s"} de Giro + Aprendizaje.`
    : "Exporta señales marcadas, trades marcados, niveles SNR, formaciones claras y ejemplos de Giro + Aprendizaje.";
}

function getExportMarksCount() {
  const signals = (history || []).filter((x) => x && (x.vote || x.comment)).length;
  const trades = (tradesJournal || []).filter((x) => x && (x.vote || x.comment || x.feedback_at || x.feedback_source)).length;
  return { signals, trades, total: signals + trades };
}
function clearExportMarksOnly() {
  const counts = getExportMarksCount();
  if (!counts.total) {
    toast("No hay marcas de export para limpiar", 1500);
    return;
  }
  const msg = `¿Limpiar marcas de export?\n\nSeñales marcadas: ${counts.signals}\nTrades marcados: ${counts.trades}\n\nNo borra señales, trades, niveles SNR, capturas, práctica ni aprendizaje. Solo quita 👍/👎 y comentarios.`;
  if (!confirm(msg)) return;

  let changedHistory = false;
  for (const it of history || []) {
    if (!it) continue;
    if (it.vote || it.comment) {
      it.vote = "";
      it.comment = "";
      changedHistory = true;
    }
  }
  if (changedHistory) saveHistory(history);

  let changedTrades = false;
  for (const tr of tradesJournal || []) {
    if (!tr) continue;
    if (tr.vote || tr.comment || tr.feedback_at || tr.feedback_source) {
      tr.vote = "";
      tr.comment = "";
      tr.feedback_at = 0;
      tr.feedback_source = "";
      changedTrades = true;
    }
  }
  if (changedTrades) saveTradesJournal(tradesJournal);

  try { renderHistory(); } catch {}
  try { renderTradesView(); } catch {}
  try { updateExportTradesButtonUI(); } catch {}
  toast(`🧹 Marcas de export limpiadas: ${counts.signals} señales + ${counts.trades} trades`, 2400);
}
function updateClearExportMarksButtonUI() {
  const btn = document.getElementById("clearExportMarksBtn");
  if (!btn) return;
  const counts = getExportMarksCount();
  btn.textContent = counts.total ? `🧹 Limpiar marcas export (${counts.signals}S/${counts.trades}T)` : "🧹 Limpiar marcas export";
  btn.title = counts.total
    ? `Quita 👍/👎 y comentarios de ${counts.signals} señal(es) y ${counts.trades} trade(s), sin borrar datos.`
    : "Quita likes/dislikes y comentarios de Señales/Trades sin borrar historial.";
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

  let clearExportMarksBtn = document.getElementById("clearExportMarksBtn");
  if (!clearExportMarksBtn) {
    clearExportMarksBtn = document.createElement("button");
    clearExportMarksBtn.id = "clearExportMarksBtn";
    clearExportMarksBtn.type = "button";
    clearExportMarksBtn.className = "btn btnGhost";
    clearExportMarksBtn.textContent = "🧹 Limpiar marcas export";
    clearExportMarksBtn.title = "Quita likes/dislikes y comentarios de Señales/Trades sin borrar historial";
    host.appendChild(clearExportMarksBtn);
  }
  clearExportMarksBtn.onclick = clearExportMarksOnly;
  updateClearExportMarksButtonUI();

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

  try { ensureSettingsSelfCheckButton(); } catch {}
}

function repairSettingsMenuBindings() {
  try { ensureTradingAccountButton(); } catch {}
  try { ensureExecutionModeButton(); applyExecutionModeUI(); } catch {}
  try { ensureEntryTimingModeButton(); applyEntryTimingModeUI(); } catch {}
  try { ensureAutoOpenChartButton(); applyAutoOpenChartUI(); } catch {}
  try { ensureLowPowerButton(); applyLowPowerModeUI(); } catch {}
  try { ensureResetCacheButton(); } catch {}
  try { ensureC100Panel(); updateC100PanelUI(); } catch {}
  try { initTokenAndStakeUI(); } catch {}
  try { ensureSplitClearButtons(); } catch {}
  try { updateExportTradesButtonUI(); } catch {}
  try { updateClearExportMarksButtonUI(); } catch {}
}

function getSettingsMenuSelfCheckItems() {
  return [
    ["Modal configuración", !!settingsModal],
    ["Botón engranaje", !!configBtn && typeof configBtn.onclick === "function"],
    ["Cerrar configuración", (!!settingsCloseBtn && typeof settingsCloseBtn.onclick === "function") || (!!settingsCloseBtn2 && typeof settingsCloseBtn2.onclick === "function")],
    ["Cuenta DEMO/REAL", !!pickEl("tradingAccountBtn") && typeof pickEl("tradingAccountBtn").onclick === "function"],
    ["Modo ejecución", !!pickEl("executionModeBtn") && typeof pickEl("executionModeBtn").onclick === "function"],
    ["Timing entrada", !!pickEl("entryTimingModeBtn") && typeof pickEl("entryTimingModeBtn").onclick === "function"],
    ["IC2 activar", !!pickEl("c100ToggleBtn") && typeof pickEl("c100ToggleBtn").onclick === "function"],
    ["IC2 reset", !!pickEl("c100ResetBtn") && typeof pickEl("c100ResetBtn").onclick === "function"],
    ["Bajo consumo", !!pickEl("lowPowerBtn") && typeof pickEl("lowPowerBtn").onclick === "function"],
    ["Auto-abrir gráfico", !!pickEl("autoOpenChartBtn") && typeof pickEl("autoOpenChartBtn").onclick === "function"],
    ["Reset Cache/SW", !!pickEl("resetCacheBtn") && typeof pickEl("resetCacheBtn").onclick === "function"],
    ["Exportar estudio", !!pickEl("exportTradesBtn") && typeof pickEl("exportTradesBtn").onclick === "function"],
    ["Limpiar marcas export", !!pickEl("clearExportMarksBtn") && typeof pickEl("clearExportMarksBtn").onclick === "function"],
    ["Borrar guardadas práctica", !!pickEl("clearPracticeExportBtn") && typeof pickEl("clearPracticeExportBtn").onclick === "function"],
    ["Borrar aprendizaje", !!pickEl("clearGiroAprendizajeBtn") && typeof pickEl("clearGiroAprendizajeBtn").onclick === "function"],
    ["Borrar Trades", !!pickEl("clearTradesConfigBtn") && typeof pickEl("clearTradesConfigBtn").onclick === "function"],
    ["Token guardar", !pickEl("tokenSaveBtn", "saveTokenBtn", "btnSaveToken") || typeof pickEl("tokenSaveBtn", "saveTokenBtn", "btnSaveToken").onclick === "function"],
    ["Token borrar", !pickEl("tokenClearBtn", "deleteTokenBtn", "btnClearToken", "btnDeleteToken") || typeof pickEl("tokenClearBtn", "deleteTokenBtn", "btnClearToken", "btnDeleteToken").onclick === "function"],
    ["Stake guardar", !pickEl("stakeSaveBtn", "saveStakeBtn", "btnSaveStake") || typeof pickEl("stakeSaveBtn", "saveStakeBtn", "btnSaveStake").onclick === "function"],
    ["Stake default", !pickEl("stakeDefaultBtn", "defaultStakeBtn", "btnDefaultStake") || typeof pickEl("stakeDefaultBtn", "defaultStakeBtn", "btnDefaultStake").onclick === "function"],
    ["Tema", !themeBtn || typeof themeBtn.onclick === "function"],
    ["Sonido", !soundBtn || typeof soundBtn.onclick === "function"],
    ["Vibración", !vibrateBtn || typeof vibrateBtn.onclick === "function"],
    ["Wake lock", !wakeBtn || typeof wakeBtn.onclick === "function"],
  ];
}

function runSettingsMenuSelfCheck({ silent = false } = {}) {
  repairSettingsMenuBindings();
  const checks = getSettingsMenuSelfCheckItems();
  const failed = checks.filter(([, ok]) => !ok).map(([name]) => name);
  const msg = failed.length
    ? `⚠️ Config: ${failed.length} problema(s): ${failed.join(", ")}`
    : "✅ Menú Config OK: botones principales con acción";
  if (!silent) {
    toast(msg, 2400);
    if (failed.length) alert(msg);
  }
  return { ok: !failed.length, failed };
}

function ensureSettingsSelfCheckButton() {
  const host =
    document.querySelector("#settingsModal .settingsBody .controls") ||
    document.querySelector(".settingsBody .controls") ||
    null;
  if (!host) return null;
  let btn = document.getElementById("settingsSelfCheckBtn");
  if (!btn) {
    btn = document.createElement("button");
    btn.id = "settingsSelfCheckBtn";
    btn.type = "button";
    btn.className = "btn btnGhost";
    btn.textContent = "🧪 Chequear Config";
    btn.title = "Revisa y repara acciones del menú de configuración";
    host.appendChild(btn);
  }
  btn.onclick = () => runSettingsMenuSelfCheck({ silent: false });
  return btn;
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

  const savedSec = parseInt(localStorage.getItem("evalSec") || "40", 10);
  EVAL_SEC = [35, 40, 45].includes(savedSec) ? savedSec : 45;

  const savedPracticeSec = parseInt(localStorage.getItem("practiceEvalSec") || "45", 10);
  PRACTICE_EVAL_SEC = [40, 45].includes(savedPracticeSec) ? savedPracticeSec : 45;

  const paintEval = () =>
    getSignalEvalButtons().forEach((b) => {
      const sec = parseInt(b.dataset.sec || "0", 10);
      b.classList.toggle("active", sec === EVAL_SEC);
      b.title = sec === 35 ? "SNR: chequeo en 35s. Línea dinámica: evalúa en 35s." : `SNR: radar 35-${sec}s. Línea dinámica: evalúa en ${sec}s.`;
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

  const paintMode = () => {
    if (!modeBtn) return;
    signalMode = normalizeSignalMode(signalMode);
    modeBtn.textContent = getModeBtnLabel(signalMode);
    modeBtn.classList.remove("active-strong");
    modeBtn.classList.add("active");
    modeBtn.title = isDynamicLineMode(signalMode)
      ? "Modo Línea dinámica: soporte/resistencia inclinada + AUTO 58s con 4 puntos."
      : isRupturaDebilGiroMode(signalMode)
        ? "Modo Ruptura Débil Giro: vela alcista con arranque irregular temprano. Señal cuando detecta; auto solo con 4 puntos."
        : isSNRPolaridadMode(signalMode)
          ? "Modo SNR polaridad: ruptura + cambio de lado + retesteo de zona con radar 35s hasta el segundo elegido."
          : "Modo SNR interacción: radar 35s-segundo elegido + SNR 70% global/reciente.";
  };
  paintMode();

  if (modeBtn)
    modeBtn.onclick = () => {
      signalMode = nextSignalMode(signalMode);
      saveAnalysisMode(signalMode);
      paintMode();
      toast(isDynamicLineMode(signalMode) ? "📐 Modo Línea dinámica" : isRupturaDebilGiroMode(signalMode) ? "🔁 Modo Ruptura Débil Giro" : isSNRPolaridadMode(signalMode) ? "🧲 Modo SNR polaridad" : "🎯 Modo SNR interacción", 1500);
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
      openChartModal(item, { source: "signals", signalId: item.id || "" });
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
  const modalDynamicLine = getSignalDynamicLineMeta(modalCurrentItem);
  const modalSNRNearArea = modalCurrentItem?.giroPolaridad
    ? buildSNRNearAreaMetaFromLevel(modalCurrentItem.giroPolaridad)
    : null;
  if (Number.isFinite(Number(modalPolarityLevel))) {
    min = Math.min(min, Number(modalPolarityLevel));
    max = Math.max(max, Number(modalPolarityLevel));
  }
  if (modalDynamicLine) {
    const dl0 = Number(getDynamicLineValue(modalDynamicLine, modalCurrentItem?.minute, 0));
    const dl1 = Number(getDynamicLineValue(modalDynamicLine, modalCurrentItem?.minute, 60000));
    if (Number.isFinite(dl0)) { min = Math.min(min, dl0); max = Math.max(max, dl0); }
    if (Number.isFinite(dl1)) { min = Math.min(min, dl1); max = Math.max(max, dl1); }
  }
  if (modalSNRNearArea) {
    min = Math.min(min, Number(modalSNRNearArea.nearLow), Number(modalSNRNearArea.zoneLow));
    max = Math.max(max, Number(modalSNRNearArea.nearHigh), Number(modalSNRNearArea.zoneHigh));
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

  // Nivel de polaridad / SNR en el modal (si la señal lo trae)
  if (modalCurrentItem?.giroPolaridad && Number.isFinite(Number(modalCurrentItem.giroPolaridad.level))) {
    const pol = modalCurrentItem.giroPolaridad;
    const level = Number(pol.level);
    const yLevel = yOf(level);
    const isSupport = pol.levelType === "support";
    const strokeCol = isSupport ? "rgba(34,197,94,0.95)" : "rgba(248,113,113,0.95)";
    const fillCol = isSupport ? "rgba(34,197,94,0.10)" : "rgba(248,113,113,0.10)";
    ctx.save();
    if (["snr_body", "snr_polaridad"].includes(String(pol.levelMode || "")) && modalSNRNearArea) {
      const nearLow = Number(modalSNRNearArea.nearLow);
      const nearHigh = Number(modalSNRNearArea.nearHigh);
      const zoneLow = Number(modalSNRNearArea.zoneLow);
      const zoneHigh = Number(modalSNRNearArea.zoneHigh);

      // V8: área amarilla = margen exacto que la PWA considera "cerca" del SNR
      // para permitir AUTO 58s aunque el precio no esté dentro de la zona.
      if ([nearLow, nearHigh, zoneLow, zoneHigh].every(Number.isFinite)) {
        const yNearHigh = yOf(nearHigh);
        const yZoneHigh = yOf(zoneHigh);
        const yZoneLow = yOf(zoneLow);
        const yNearLow = yOf(nearLow);

        ctx.fillStyle = "rgba(251,191,36,0.115)";
        ctx.fillRect(8, Math.min(yNearHigh, yZoneHigh), w - 16, Math.max(3, Math.abs(yZoneHigh - yNearHigh)));
        ctx.fillRect(8, Math.min(yZoneLow, yNearLow), w - 16, Math.max(3, Math.abs(yNearLow - yZoneLow)));

        ctx.save();
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = "rgba(251,191,36,0.54)";
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.moveTo(8, yNearHigh);
        ctx.lineTo(w - 8, yNearHigh);
        ctx.moveTo(8, yNearLow);
        ctx.lineTo(w - 8, yNearLow);
        ctx.stroke();
        ctx.restore();
      }
    }
    if (["snr_body", "snr_polaridad"].includes(String(pol.levelMode || "")) && Number.isFinite(Number(pol.zoneLow)) && Number.isFinite(Number(pol.zoneHigh))) {
      const yA = yOf(Number(pol.zoneHigh));
      const yB = yOf(Number(pol.zoneLow));
      const top = Math.min(yA, yB);
      const bandH = Math.max(4, Math.abs(yB - yA));
      ctx.fillStyle = "rgba(96,165,250,0.09)";
      ctx.fillRect(8, top, w - 16, bandH);
      ctx.save();
      ctx.setLineDash([]);
      ctx.strokeStyle = "rgba(96,165,250,0.90)";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(8, yA);
      ctx.lineTo(w - 8, yA);
      ctx.moveTo(8, yB);
      ctx.lineTo(w - 8, yB);
      ctx.stroke();
      ctx.restore();
      ctx.setLineDash([7, 5]);
      ctx.strokeStyle = "rgba(255,255,255,0.22)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(8, yLevel);
      ctx.lineTo(w - 8, yLevel);
      ctx.stroke();
      ctx.setLineDash([]);
    } else {
      ctx.setLineDash([8, 5]);
      ctx.strokeStyle = strokeCol;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(8, yLevel);
      ctx.lineTo(w - 8, yLevel);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // Sin rótulos sobre la zona SNR ni sobre el área amarilla:
    // se mantienen las bandas y líneas visuales, pero se quitan los textos
    // para evitar contaminación visual dentro del modal.
    ctx.restore();
  }

  // Línea dinámica de tendencia (soporte/resistencia inclinada)
  if (modalDynamicLine) {
    const y0v = Number(getDynamicLineValue(modalDynamicLine, modalCurrentItem?.minute, 0));
    const y1v = Number(getDynamicLineValue(modalDynamicLine, modalCurrentItem?.minute, 60000));
    if (Number.isFinite(y0v) && Number.isFinite(y1v)) {
      const isSupportLine = String(modalDynamicLine.levelType || modalDynamicLine.lineType || "") === "support";
      ctx.save();
      ctx.setLineDash([]);
      ctx.strokeStyle = isSupportLine ? "rgba(34,197,94,0.95)" : "rgba(248,113,113,0.95)";
      ctx.lineWidth = 2.3;
      ctx.shadowColor = isSupportLine ? "rgba(34,197,94,0.20)" : "rgba(248,113,113,0.20)";
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(xOf(0), yOf(y0v));
      ctx.lineTo(xOf(60000), yOf(y1v));
      ctx.stroke();
      ctx.restore();
    }
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
  ctx.globalAlpha = 0.14;
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

  // precio actual / último punto: guía horizontal suave + punto más visible
  const lastPoint = pts[pts.length - 1];
  const lx = xOf(lastPoint.ms);
  const ly = yOf(lastPoint.quote);

  ctx.save();
  ctx.setLineDash([3, 5]);
  ctx.strokeStyle = "rgba(255,255,255,0.30)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(8, ly);
  ctx.lineTo(w - 8, ly);
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.shadowColor = "rgba(255,255,255,0.32)";
  ctx.shadowBlur = 10;
  ctx.fillStyle = "rgba(255,255,255,0.96)";
  ctx.strokeStyle = "rgba(15,23,42,0.85)";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(lx, ly, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
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
    el.style.fontSize = "13px";
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
  panel.style.margin = "0 0 8px 0";
  panel.style.padding = "10px";
  panel.style.borderRadius = "16px";
  panel.style.border = "1px solid rgba(255,255,255,.14)";
  panel.style.background = "linear-gradient(180deg, rgba(251,191,36,.075), rgba(255,255,255,.025))";
  panel.style.boxShadow = "0 10px 22px rgba(0,0,0,.14), inset 0 0 0 1px rgba(251,191,36,.035)";

  const top = document.createElement("div");
  top.style.display = "flex";
  top.style.alignItems = "center";
  top.style.justifyContent = "space-between";
  top.style.gap = "8px";
  top.style.marginBottom = "8px";

  const count = document.createElement("div");
  count.id = "signalConfirmCount";
  count.style.fontWeight = "950";
  count.style.letterSpacing = ".25px";
  count.style.fontSize = "14px";
  count.style.padding = "8px 11px";
  count.style.borderRadius = "999px";
  count.style.border = "1px solid rgba(255,255,255,.14)";
  count.style.background = "rgba(0,0,0,.16)";
  count.style.whiteSpace = "normal";
  count.style.lineHeight = "1.15";

  const hint = document.createElement("div");
  hint.id = "signalConfirmHint";
  hint.style.flex = "1";
  hint.style.textAlign = "right";
  hint.style.fontSize = "11.5px";
  hint.style.fontWeight = "850";
  hint.style.opacity = ".90";
  hint.style.lineHeight = "1.18";
  hint.style.maxWidth = "150px";

  top.appendChild(count);
  top.appendChild(hint);

  const row = document.createElement("div");
  row.style.display = "grid";
  row.style.gridTemplateColumns = "minmax(0, 1fr) minmax(0, 1fr) auto";
  row.style.gap = "8px";
  row.style.alignItems = "stretch";

  const buyBtn = document.createElement("button");
  buyBtn.id = "signalConfirmBuyBtn";
  buyBtn.type = "button";
  buyBtn.className = "btn";
  buyBtn.textContent = "🟢 + COMPRA";
  buyBtn.title = "Sumar una confirmación a favor de COMPRA. Si había puntos de VENTA, primero los resta.";
  buyBtn.style.minHeight = "48px";
  buyBtn.style.borderRadius = "14px";
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
  sellBtn.style.minHeight = "48px";
  sellBtn.style.borderRadius = "14px";
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
  undoBtn.style.minHeight = "48px";
  undoBtn.style.minWidth = "52px";
  undoBtn.style.borderRadius = "14px";
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
function getSignalLastTickMsInMinute(item = modalCurrentItem) {
  if (!item) return 0;
  const minute = Number(item.minute);
  const sym = String(item.symbol || "");
  let ticks = [];

  const liveTicks = Number.isFinite(minute) && sym ? minuteData?.[minute]?.[sym] : null;
  if (Array.isArray(liveTicks) && liveTicks.length) ticks = liveTicks;
  else if (Array.isArray(item.ticks) && item.ticks.length) ticks = item.ticks;

  const clean = (Array.isArray(ticks) ? ticks : [])
    .map((p) => Number(p?.ms))
    .filter((ms) => Number.isFinite(ms));
  return clean.length ? Math.max(...clean) : 0;
}
function getPost58EntryReadinessForSignal(item = modalCurrentItem) {
  const ms = getSignalConfirmationMs(item);

  // El modo viejo conserva su comportamiento: desde 58s hasta antes de cerrar la vela.
  if (!isNextCandleExpiryTiming()) {
    return { ok: ms >= SIGNAL_AUTO_ENTRY_MS && ms < 60000, ms, lastTickMs: getSignalLastTickMsInMinute(item), reason: "duration_1m_window" };
  }

  const lastTickMs = getSignalLastTickMsInMinute(item);
  if (ms < SIGNAL_AUTO_ENTRY_MS) {
    return { ok: false, wait: true, ms, lastTickMs, reason: "esperando_58" };
  }
  if (lastTickMs < SIGNAL_AUTO_ENTRY_MS) {
    return { ok: false, wait: true, ms, lastTickMs, reason: "esperando_tick_58" };
  }
  if (ms > SIGNAL_AUTO_POST58_MAX_MS) {
    return { ok: false, late: true, ms, lastTickMs, reason: "tick_58_tarde" };
  }
  return { ok: true, ms, lastTickMs, reason: "post_tick_58_ok" };
}
function cancelSignalAutoEntryLate(item, side, readiness, reason = "AUTO_POST58_LATE") {
  if (!item || item?.signalAutoEntry?.attempted) return false;
  const label = side === "CALL" ? "COMPRA" : "VENTA";
  item.signalAutoEntry = {
    type: "AUTO_58_REAL",
    attempted: true,
    status: "cancelled",
    side: normalizeSignalConfirmationSide(side) || "",
    ms: Math.round(Number(readiness?.ms || getSignalConfirmationMs(item))),
    sec: Math.round(Number(readiness?.ms || getSignalConfirmationMs(item)) / 1000),
    reason: String(reason || "AUTO_POST58_LATE"),
    at: Date.now(),
    error: `Cancelada: no llegó a comprar dentro de la ventana post-58 (${SIGNAL_AUTO_POST58_MAX_SEC.toFixed(1)}s).`,
    post58_readiness: { ...(readiness || {}) },
  };
  saveHistory(history);
  if (modalCurrentItem && modalCurrentItem.id === item.id) updateSignalConfirmationUI();
  toast(`⛔ AUTO ${label} cancelada: llegó tarde después de ${SIGNAL_AUTO_POST58_MAX_SEC.toFixed(1)}s`, 2200);
  return true;
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
    void prepareRiseFallAutoPreProposal(modalCurrentItem, enabled, "signal_points_enabled");
    toast(`✅ COMPRA habilitada: ${getSignalConfirmationStatusText(modalCurrentItem)}`, 1400);
  } else if (enabled === "PUT") {
    void prepareRiseFallAutoPreProposal(modalCurrentItem, enabled, "signal_points_enabled");
    toast(`✅ VENTA habilitada: ${getSignalConfirmationStatusText(modalCurrentItem)}`, 1400);
  } else {
    toast(`🧠 ${getSignalConfirmationStatusText(modalCurrentItem)}. Faltan puntos para operar.`, 1300);
  }

  // Si el usuario supera los 4 puntos netos cuando la vela ya pasó 58s,
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
    const activePts = enabled === "CALL" ? buyPts : enabled === "PUT" ? sellPts : Math.max(buyPts, sellPts);
    if (enabled === "CALL" || enabled === "PUT") {
      signalConfirmCountEl.innerHTML = `${enabled === "CALL" ? "COMPRA" : "VENTA"} habilitada <span class="signalConfirmPts">${activePts}/${SIGNAL_CONFIRM_MIN} pts</span>`;
    } else {
      signalConfirmCountEl.textContent = getSignalConfirmationStatusText(modalCurrentItem);
    }
    signalConfirmCountEl.style.color = enabled === "CALL" ? "#dcfce7" : enabled === "PUT" ? "#fecaca" : "rgba(255,255,255,.92)";
    signalConfirmCountEl.style.borderColor = enabled === "CALL" ? "rgba(34,197,94,.46)" : enabled === "PUT" ? "rgba(239,68,68,.46)" : "rgba(251,191,36,.24)";
    signalConfirmCountEl.style.background = enabled === "CALL" ? "rgba(22,163,74,.16)" : enabled === "PUT" ? "rgba(127,29,29,.19)" : "rgba(0,0,0,.13)";
    signalConfirmCountEl.style.boxShadow = ok ? "0 0 14px rgba(255,255,255,.07)" : "none";
  }
  if (signalConfirmHintEl) {
    const scope = formatCompactScopeLabel ? formatCompactScopeLabel() : "";
    const nextOutcomeTxt = formatNextCandleOutcomeLabel(modalCurrentItem, true);
    if (enabled === "CALL") {
      signalConfirmHintEl.textContent = `AUTO ${SIGNAL_AUTO_ENTRY_SEC}s · ${nextOutcomeTxt} · ${isDynamicLineMode(modalCurrentItem?.mode) ? "línea respetada" : "zona azul/amarilla"}${scope ? " · " + scope : ""}`;
      signalConfirmHintEl.style.color = getNextCandleOutcomeTextColor(modalCurrentItem, "#bbf7d0");
    } else if (enabled === "PUT") {
      signalConfirmHintEl.textContent = `AUTO ${SIGNAL_AUTO_ENTRY_SEC}s · ${nextOutcomeTxt} · ${isDynamicLineMode(modalCurrentItem?.mode) ? "línea respetada" : "zona azul/amarilla"}${scope ? " · " + scope : ""}`;
      signalConfirmHintEl.style.color = getNextCandleOutcomeTextColor(modalCurrentItem, "#fecaca");
    } else {
      const score = getSignalConfirmationScore(modalCurrentItem);
      signalConfirmHintEl.textContent = score === 0
        ? `PREALERTA · mínimo ${SIGNAL_CONFIRM_MIN} netas`
        : `PREALERTA · neto ${score > 0 ? "+" : ""}${score}`;
      signalConfirmHintEl.style.color = "rgba(255,255,255,.68)";
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
function getSignalSNREntryMeta(item) {
  const meta = getSignalLevelMeta(item);
  if (!meta || typeof meta !== "object") return null;
  if (!["snr_body", "snr_polaridad"].includes(String(meta.levelMode || ""))) return null;
  const level = Number(meta.level);
  if (!Number.isFinite(level)) return null;
  return meta;
}
function getSignalLiveTicksForEntryGate(item) {
  const minute = Number(item?.minute);
  const symbol = String(item?.symbol || "");
  const live = Number.isFinite(minute) && symbol && Array.isArray(minuteData?.[minute]?.[symbol])
    ? minuteData[minute][symbol]
    : [];
  const saved = Array.isArray(item?.ticks) ? item.ticks : [];
  // Si la señal sigue viva, minuteData tiene los ticks hasta el segundo actual.
  // Si no, usamos los ticks guardados/hidratados.
  return live.length >= saved.length ? live.slice() : saved.slice();
}
function getSignalPriceAtEntryCheckMs(item, checkMs = SIGNAL_AUTO_SNR_CHECK_MS) {
  const ticks = getSignalLiveTicksForEntryGate(item)
    .map((p) => ({ ms: Number(p?.ms), quote: Number(p?.quote) }))
    .filter((p) => Number.isFinite(p.ms) && Number.isFinite(p.quote))
    .sort((a, b) => a.ms - b.ms);
  if (ticks.length) {
    const q = Number(getPriceAtMs(ticks, checkMs));
    if (Number.isFinite(q)) return q;
  }
  const live = Number(lastQuoteBySymbol?.[item?.symbol]);
  return Number.isFinite(live) ? live : NaN;
}
function buildSignalSNREntryGate(item, side = "", checkMs = SIGNAL_AUTO_SNR_CHECK_MS) {
  const meta = getSignalSNREntryMeta(item);
  if (!meta) {
    return { ok: false, pending: false, reason: "sin_snr", message: "La señal no trae zona SNR válida." };
  }

  const level = Number(meta.level);
  let zoneLow = Number(meta.zoneLow);
  let zoneHigh = Number(meta.zoneHigh);
  const bodyLow = Number(meta.bodyZoneLow);
  const bodyHigh = Number(meta.bodyZoneHigh);
  const tolerance = Number(meta.tolerance);
  const zoneSize = Number(meta.zone);

  // Preferimos zoneLow/zoneHigh porque ya incluyen la zona chica + tolerancia.
  // Si falta, reconstruimos una franja razonable desde bodyZone o level.
  if (!Number.isFinite(zoneLow) || !Number.isFinite(zoneHigh)) {
    if (Number.isFinite(bodyLow) && Number.isFinite(bodyHigh)) {
      zoneLow = Math.min(bodyLow, bodyHigh);
      zoneHigh = Math.max(bodyLow, bodyHigh);
    } else {
      const fallback = Math.max(
        Number.isFinite(tolerance) ? tolerance * 0.50 : 0,
        Number.isFinite(zoneSize) ? zoneSize * 0.50 : 0,
        Math.abs(level) * 0.000001,
        1e-9
      );
      zoneLow = level - fallback;
      zoneHigh = level + fallback;
    }
  }
  {
    const zA = zoneLow;
    const zB = zoneHigh;
    zoneLow = Math.min(zA, zB);
    zoneHigh = Math.max(zA, zB);
  }
  const zoneWidth = Math.max(0, zoneHigh - zoneLow);

  const nearBuffer = Math.max(
    Number.isFinite(tolerance) ? tolerance * SIGNAL_AUTO_SNR_NEAR_TOL_MULT : 0,
    zoneWidth * SIGNAL_AUTO_SNR_NEAR_ZONE_MULT,
    Number.isFinite(zoneSize) ? zoneSize * 0.25 : 0,
    Math.abs(level) * 0.000001,
    1e-9
  );

  const price = getSignalPriceAtEntryCheckMs(item, checkMs);
  if (!Number.isFinite(price)) {
    return { ok: false, pending: true, reason: "sin_precio_58", message: "Todavía no hay precio suficiente para validar el SNR en 58s." };
  }

  const roleHardBreakInfo = getSignalSNRRoleHardBreakInfo(meta, getSignalLiveTicksForEntryGate(item), checkMs);
  if (roleHardBreakInfo?.broken) {
    return {
      ok: false,
      pending: false,
      reason: "snr_role_broken_intracandle",
      side: normalizeSignalConfirmationSide(side) || "",
      check_ms: checkMs,
      check_sec: Math.round(checkMs / 1000),
      price,
      level,
      zoneLow,
      zoneHigh,
      bodyZoneLow: Number.isFinite(bodyLow) ? bodyLow : null,
      bodyZoneHigh: Number.isFinite(bodyHigh) ? bodyHigh : null,
      tolerance: Number.isFinite(tolerance) ? tolerance : null,
      nearBuffer,
      distance: roleHardBreakInfo.breakDistance,
      relation: "broken_role",
      levelType: String(meta.levelType || ""),
      originalType: String(meta.originalType || ""),
      currentRole: String(meta.currentRole || ""),
      roleHardBreakInfo,
      message: `SNR invalidado: la vela rompió el rol del nivel antes de ${Math.round(checkMs / 1000)}s (${roleHardBreakInfo.breakQuote.toFixed(6)} fuera de ${zoneLow.toFixed(6)}-${zoneHigh.toFixed(6)})`,
    };
  }

  const distance = price < zoneLow ? zoneLow - price : price > zoneHigh ? price - zoneHigh : 0;
  const inside = distance <= 0;
  const near = !inside && distance <= nearBuffer;
  const ok = inside || near;
  const relation = inside ? "inside" : price < zoneLow ? (near ? "near_below" : "far_below") : (near ? "near_above" : "far_above");
  return {
    ok,
    pending: false,
    reason: ok ? (inside ? "inside_snr_zone" : "near_snr_zone") : "far_from_snr_zone",
    side: normalizeSignalConfirmationSide(side) || "",
    check_ms: checkMs,
    check_sec: Math.round(checkMs / 1000),
    price,
    level,
    zoneLow,
    zoneHigh,
    bodyZoneLow: Number.isFinite(bodyLow) ? bodyLow : null,
    bodyZoneHigh: Number.isFinite(bodyHigh) ? bodyHigh : null,
    tolerance: Number.isFinite(tolerance) ? tolerance : null,
    nearBuffer,
    distance,
    relation,
    roleHardBreakInfo: roleHardBreakInfo || null,
    levelType: String(meta.levelType || ""),
    originalType: String(meta.originalType || ""),
    currentRole: String(meta.currentRole || ""),
    message: ok
      ? `Precio ${SIGNAL_AUTO_ENTRY_SEC}s ${price.toFixed(6)} dentro/cerca del SNR ${zoneLow.toFixed(6)}-${zoneHigh.toFixed(6)}`
      : `Precio ${SIGNAL_AUTO_ENTRY_SEC}s ${price.toFixed(6)} lejos del SNR ${zoneLow.toFixed(6)}-${zoneHigh.toFixed(6)} (dist ${distance.toFixed(6)})`,
  };
}
function formatSignalSNREntryGate(gate) {
  if (!gate || typeof gate !== "object") return "SNR no validado";
  if (gate.pending) return gate.message || "SNR pendiente";
  if (!Number.isFinite(Number(gate.price))) return gate.message || "SNR sin precio";
  const status = gate.ok ? (gate.reason === "inside_snr_zone" ? "dentro" : "cerca") : "lejos";
  return `${SIGNAL_AUTO_ENTRY_SEC}s ${status}: ${Number(gate.price).toFixed(6)} | zona ${Number(gate.zoneLow).toFixed(6)}-${Number(gate.zoneHigh).toFixed(6)}`;
}

const SIGNAL_CLOSE_SNR_FILTER_MS = 60000;
function getSignalCloseSNREntryGate(item) {
  if (!item || !item.minuteComplete) return null;
  const meta = getSignalSNREntryMeta(item);
  if (!meta) return null;
  const ticks = Array.isArray(item.ticks) ? item.ticks : [];
  // No borrar hasta tener la vela completa hidratada: evita falsos descartes por falta de ticks.
  if (ticks.length < 2) return null;
  const gate = buildSignalSNREntryGate(item, item.direction || "", SIGNAL_CLOSE_SNR_FILTER_MS);
  if (!gate || gate.pending || !Number.isFinite(Number(gate.price))) return null;
  return gate;
}
function signalHasProtectedTrade(item) {
  if (!item) return false;
  const b = String(item?.trade?.badge || "").toUpperCase();
  if (b === "PENDING" || b === "ITM" || b === "OTM") return true;
  if (item?.trade?.contract_id) return true;
  if (item?.signalAutoEntry?.contract_id) return true;
  const autoStatus = String(item?.signalAutoEntry?.status || "").toLowerCase();
  if (item?.signalAutoEntry?.attempted && ["sending", "sent"].includes(autoStatus)) return true;
  return false;
}
function hasSignalTradeAssociated(item) {
  return signalHasProtectedTrade(item);
}
function shouldRemoveSignalBecauseClosedAwayFromSNR(item) {
  // No purgar señales que ya ejecutaron o están ejecutando un trade.
  // Si se borra una señal con contrato, se pierde el vínculo para actualizar Trades.
  if (signalHasProtectedTrade(item)) return false;
  const gate = getSignalCloseSNREntryGate(item);
  if (!gate) return false;
  item.closeSnrGate = {
    ok: !!gate.ok,
    reason: gate.reason,
    price: gate.price,
    zoneLow: gate.zoneLow,
    zoneHigh: gate.zoneHigh,
    nearBuffer: gate.nearBuffer,
    distance: gate.distance,
    checked_ms: SIGNAL_CLOSE_SNR_FILTER_MS,
    keptByTestMode: keepClosedAwaySignals && !gate.ok,
  };

  // V45: modo test. Si está activo, las señales que cierran fuera de zona se conservan
  // en Señales para que el usuario pueda revisarlas, marcarlas y exportarlas.
  if (keepClosedAwaySignals && !gate.ok) {
    item.keepClosedAwayByUser = true;
    item.keepClosedAwaySavedAt = Date.now();
    return false;
  }

  return !gate.ok;
}
function purgeClosedSignalsOutsideSNRCloseZone(reason = "") {
  if (!Array.isArray(history) || !history.length) return 0;
  const removedIds = new Set();
  const before = history.length;
  let keptOutsideChanged = false;
  history = history.filter((it) => {
    const prevKept = !!it?.keepClosedAwayByUser;
    if (shouldRemoveSignalBecauseClosedAwayFromSNR(it)) {
      if (it && it.id) removedIds.add(String(it.id));
      return false;
    }
    if (!prevKept && !!it?.keepClosedAwayByUser) keptOutsideChanged = true;
    return true;
  });
  const removed = before - history.length;
  if (!removed) {
    if (keptOutsideChanged) {
      try { saveHistory(history); } catch {}
      try { renderHistory(); } catch {}
    }
    return 0;
  }

  try { saveHistory(history); } catch {}
  try {
    for (const id of removedIds) {
      const row = document.querySelector(`.row[data-id="${cssEscape(id)}"]`);
      if (row && row.parentElement) row.parentElement.removeChild(row);
    }
  } catch {}

  if (
    modalCurrentItem &&
    modalOpenContext?.source !== "trades" &&
    removedIds.has(String(modalCurrentItem.id || ""))
  ) {
    try { closeChartModal(); } catch {}
  }

  updateCounter(localStorage.getItem("activeView") || "signals");
  if ((localStorage.getItem("activeView") || "signals") === "signals") {
    try { renderHistory(); } catch {}
  }
  return removed;
}
function assertSignalSNREntryGateAt57(side = null, item = modalCurrentItem) {
  if (!item) return null;

  // V48: operaciones manuales desde la pestaña En vivo son independientes de señales/SNR/AUTO 58.
  // Se registran como estudio, pero no se bloquean por zona ni por segundo 58.
  if (item?.liveManualTrade) {
    const sym = item.symbol || liveReplaySymbol || "";
    const ticks = Array.isArray(item.ticks) ? item.ticks : getLiveReplayTicks(sym);
    const last = ticks.length ? Number(ticks[ticks.length - 1].quote) : Number(lastQuoteBySymbol?.[sym]);
    return {
      ok: true,
      pending: false,
      reason: "live_manual_trade",
      side: normalizeSignalConfirmationSide(side) || "",
      check_ms: Math.round(getLiveReplayMsInMinute(sym)),
      check_sec: Math.round(getLiveReplayMsInMinute(sym) / 1000),
      price: Number.isFinite(last) ? last : null,
      message: "Trade manual desde pestaña En vivo; señales/SNR pausadas y no bloquean esta entrada.",
    };
  }

  const ms = getSignalConfirmationMs(item);
  if (ms < SIGNAL_AUTO_ENTRY_MS) {
    throw new Error(`La autoentrada se valida recién en ${SIGNAL_AUTO_ENTRY_SEC}s.`);
  }

  // Modo Línea dinámica: acá la línea sí valida la entrada.
  // Soporte dinámico => CALL solo si el precio respeta arriba.
  // Resistencia dinámica => PUT solo si el precio respeta abajo.
  if (isDynamicLineMode(item.mode)) {
    const gate = buildSignalDynamicLineEntryGate(item, side, SIGNAL_AUTO_ENTRY_MS);
    if (gate?.pending) throw new Error(gate.message || "Línea dinámica pendiente");
    if (!gate?.ok) throw new Error(gate?.message || "La vela no respeta la línea dinámica");
    return gate;
  }

  // V46: en modos SNR/SNR polaridad NO se exige que la vela cierre dentro del SNR
  // ni se bloquea la autoentrada por estar lejos de la zona al check de 58s.
  // La operación se decide por: vela viva + 4 puntos netos + disciplina OK.
  // Igual calculamos el gate SNR para registrar si el precio estaba dentro/cerca/lejos,
  // pero no lo usamos como bloqueo operativo.
  const gate = buildSignalSNREntryGate(item, side, SIGNAL_AUTO_SNR_CHECK_MS);
  if (gate?.pending) {
    return {
      ok: true,
      pending: false,
      reason: "auto58_4pts_snr_sin_cierre_zona",
      side: normalizeSignalConfirmationSide(side) || "",
      check_ms: SIGNAL_AUTO_SNR_CHECK_MS,
      check_sec: SIGNAL_AUTO_ENTRY_SEC,
      message: "AUTO 58 habilitado por 4 puntos; cierre/zona SNR no bloquean la entrada.",
      original_gate: gate,
    };
  }
  return Object.assign({}, gate || {}, {
    ok: true,
    pending: false,
    reason: gate?.reason ? `auto58_4pts_sin_bloqueo_${gate.reason}` : "auto58_4pts_sin_cierre_zona",
    original_ok: !!gate?.ok,
    original_reason: gate?.reason || "sin_snr_gate",
    message: gate?.ok
      ? (gate.message || "AUTO 58 por 4 puntos; precio dentro/cerca del SNR.")
      : `AUTO 58 por 4 puntos; SNR no bloquea entrada (${gate?.message || "sin validación SNR"}).`,
  });
}

function trySignalAutoEntryAt57(reason = "AUTO_58", itemOverride = null) {
  const item = itemOverride || modalCurrentItem;
  if (!item || !isTradeEntryOpen(item)) return false;
  if (item?.trade?.badge) return false;
  if (tradeInFlight) return false;
  if (item?.signalAutoEntry?.attempted) return false;

  const ms = getSignalConfirmationMs(item);
  if (ms < SIGNAL_AUTO_ENTRY_MS) return false;

  const side = getSignalEnabledTradeSide(item);
  if (!side) return false;

  const post58 = getPost58EntryReadinessForSignal(item);
  if (!post58.ok) {
    if (post58.late) cancelSignalAutoEntryLate(item, side, post58, "AUTO_POST58_TICK_LATE");
    return false;
  }

  if (isNextCandleExpiryTiming() && !shouldUseAutoHighLowExecution()) {
    const symbol = String(item.symbol || SYMBOLS[0] || "R_25");
    const stake = Number(getEffectiveTradeStake().toFixed(2));
    const pp = getValidAutoPreProposal(item, side, symbol, stake);
    if (!pp) {
      cancelSignalAutoEntryNoPreProposal(item, side, post58, "AUTO_PREPROPOSAL_MISSING");
      return false;
    }
  }

  let gate = null;
  try {
    gate = assertSignalSNREntryGateAt57(side, item);
  } catch (err) {
    const msg = err?.message || (isDynamicLineMode(item.mode) ? "La línea dinámica no habilita la entrada" : "La entrada SNR no está habilitada");
    if (!itemOverride || (modalCurrentItem && modalCurrentItem.id === item.id)) toast(`⛔ ${msg}`, 1500);
    return false;
  }
  const label = side === "CALL" ? "COMPRA" : "VENTA";

  item.signalAutoEntry = {
    type: "AUTO_58_REAL",
    attempted: true,
    status: "sending",
    side,
    ms,
    sec: Math.round(ms / 1000),
    reason: String(reason || "AUTO_58"),
    at: Date.now(),
    confirmation_status: getSignalConfirmationStatusText(item),
    snr_entry_gate: gate,
    post58_readiness: post58,
  };
  saveHistory(history);
  if (modalCurrentItem && modalCurrentItem.id === item.id) updateSignalConfirmationUI();

  toast(`🚀 AUTO prearmado: enviando ${label} ${getTradeScopeText()}…`, 1500);

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
    if (areSignalsPaused()) return false;
    if (tradeInFlight) return false;
    const nowMinute = currentServerMinute();
    const candidates = (history || [])
      .filter((it) => it && it.minute === nowMinute && !it?.trade?.badge && !it?.signalAutoEntry?.attempted)
      .filter((it) => getSignalEnabledTradeSide(it));

    for (const it of candidates) {
      if (trySignalAutoEntryAt57("TIMER_58_SCAN", it)) return true;
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
    if (modalNavVoteBar) modalNavVoteBar.style.display = "none";
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
    bar.textContent = `🔒 DEMO bloqueada · ${getDisciplineCounterText()} · falta ${fmtRemaining(remain)}`;
    bar.style.color = "#fff";
    bar.style.background = "linear-gradient(180deg, rgba(127,29,29,.78), rgba(69,10,10,.78))";
    bar.style.borderColor = "rgba(248,113,113,.50)";
    bar.style.boxShadow = "0 0 0 1px rgba(248,113,113,.10) inset, 0 0 12px rgba(239,68,68,.12)";
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
    const enabled = getSignalEnabledTradeSide(modalCurrentItem);
    const sideTxt = enabled === "CALL" ? "COMPRA lista" : enabled === "PUT" ? "VENTA lista" : getSignalConfirmationStatusText(modalCurrentItem);
    bar.textContent = `🟢 Vela abierta · faltan ${sec}s · ${sideTxt} · AUTO ${SIGNAL_AUTO_ENTRY_SEC}s`;
    bar.style.color = "#dcfce7";
    bar.style.background = "rgba(22,163,74,.14)";
    bar.style.borderColor = "rgba(34,197,94,.28)";
    bar.style.boxShadow = "0 0 0 1px rgba(34,197,94,.05) inset";
  } else {
    bar.textContent = `${formatCompactScopeLabel()} · Vela cerrada`;
    bar.style.color = "rgba(229,231,235,.92)";
    bar.style.background = "rgba(107,114,128,.16)";
    bar.style.borderColor = "rgba(156,163,175,.22)";
    bar.style.boxShadow = "none";
  }


  paintTradeButtonLocked(modalBuyCallBtn, locked, remain, candleClosed);
  paintTradeButtonLocked(modalBuyPutBtn, locked, remain, candleClosed);
  setSignalConfirmationControlsVisible(true);
  setGiroAprendizajeControlsVisible(true);
  updateSignalConfirmationUI();
  updateGiroAprendizajeControlsUI();
  updateModalNavVoteUI();

  applyModalExecutionButtonUI(locked, candleClosed);
  applyGiroOnlyTradeButtons(modalCurrentItem, locked, candleClosed);
  applySignalConfirmationTradeGate(locked, candleClosed);
  applyC100TradeGate(locked, candleClosed);

  // Auto-entrada real: igual que práctica, al segundo 58 si ya hay 4 puntos netos.
  if (!locked && !candleClosed) trySignalAutoEntryAt57("TIMER_58");
}


/* =========================
   Modal: vista mini velas 1m
========================= */
function updateModalChartViewBtnUI() {
  const isCandles = modalChartView === "candles1m";
  if (modalCandle1mBtn) {
    modalCandle1mBtn.setAttribute("aria-pressed", isCandles ? "true" : "false");
    modalCandle1mBtn.textContent = isCandles ? "📈 Línea" : "🕯️ Velas 1m";
    modalCandle1mBtn.title = isCandles
      ? "Volver al gráfico de línea intraminuto"
      : "Ver mini gráfico de velas de 1 minuto con el nivel marcado";
  }
  if (modalReplayBtn) {
    modalReplayBtn.classList.toggle("hidden", !isCandles);
    modalReplayBtn.title = "Abrir zoom y reproducir tick por tick la vela de la señal";
  }
}
function setModalChartView(view) {
  modalChartView = view === "candles1m" ? "candles1m" : "line";
  if (modalChartView !== "candles1m") closeModalReplay();
  updateModalChartViewBtnUI();
  requestModalDraw(true);
}
if (modalCandle1mBtn) {
  modalCandle1mBtn.onclick = (e) => {
    e.stopPropagation();
    setModalChartView(modalChartView === "candles1m" ? "line" : "candles1m");
  };
}
if (modalReplayBtn) {
  modalReplayBtn.onclick = (e) => {
    e.stopPropagation();
    if (modalChartView !== "candles1m") setModalChartView("candles1m");
    openModalReplay();
  };
}
function candleFromTicks(symbol, minute, ticks = []) {
  const pts = (Array.isArray(ticks) ? ticks : [])
    .map((p) => ({ ms: Number(p.ms), quote: Number(p.quote) }))
    .filter((p) => Number.isFinite(p.ms) && Number.isFinite(p.quote))
    .sort((a, b) => a.ms - b.ms);
  if (!pts.length) return null;
  const prices = pts.map((p) => p.quote);
  const open = prices[0];
  const close = prices[prices.length - 1];
  const high = Math.max(...prices);
  const low = Math.min(...prices);
  if (![open, high, low, close].every(Number.isFinite)) return null;
  return { symbol, minute: Number(minute), open, high, low, close, fromTicks: true };
}
function getStoredCandleByMinute(symbol, minute) {
  const arr = Array.isArray(giroPolarityCandles?.[symbol]) ? giroPolarityCandles[symbol] : [];
  return arr.find((c) => Number(c?.minute) === Number(minute)) || null;
}
function sanitizeMiniCandle(symbol, candle, opts = {}) {
  const m = Number(candle?.minute);
  const open = Number(candle?.open);
  const high = Number(candle?.high);
  const low = Number(candle?.low);
  const close = Number(candle?.close);
  if (![m, open, high, low, close].every(Number.isFinite)) return null;
  return {
    ...candle,
    ...opts,
    symbol,
    minute: m,
    open,
    high: Math.max(open, high, low, close),
    low: Math.min(open, high, low, close),
    close,
  };
}
function modalOHLC1mCacheKey(symbol, endMinute, count = MODAL_CANDLES_1M_COUNT) {
  return `${symbol || ""}::${Number(endMinute)}::${Number(count) || MODAL_CANDLES_1M_COUNT}`;
}
function normalizeDerivOHLC1mCandles(symbol, candles, endMinute, maxCount = MODAL_CANDLES_1M_COUNT) {
  const endM = Number(endMinute);
  const minM = Number.isFinite(endM) ? endM - maxCount + 1 : -Infinity;
  const byMinute = new Map();

  for (const c of Array.isArray(candles) ? candles : []) {
    const epoch = Number(c?.epoch ?? c?.time ?? c?.timestamp);
    const minute = Number.isFinite(epoch) ? Math.floor(epoch / 60) : Number(c?.minute);
    if (!Number.isFinite(minute)) continue;
    if (Number.isFinite(endM) && (minute < minM || minute > endM)) continue;

    const clean = sanitizeMiniCandle(symbol, { ...c, minute }, { source: "deriv_ohlc" });
    if (!clean) continue;
    byMinute.set(Number(clean.minute), clean);
  }

  return [...byMinute.values()]
    .sort((a, b) => Number(a.minute) - Number(b.minute))
    .slice(-maxCount);
}
async function fetchDerivOHLC1mCandles(symbol, endMinute, maxCount = MODAL_CANDLES_1M_COUNT) {
  const endM = Number(endMinute);
  if (!symbol || !Number.isFinite(endM)) return [];

  const start = minuteToEpochSec(endM - maxCount + 1);
  const end = minuteToEpochSec(endM + 1);

  const res = await wsRequest({
    ticks_history: symbol,
    start,
    end,
    style: "candles",
    granularity: 60,
    adjust_start_time: 1,
  });

  return normalizeDerivOHLC1mCandles(symbol, res?.candles, endM, maxCount);
}
function requestModalOHLC1mCandles(item, maxCount = MODAL_CANDLES_1M_COUNT) {
  if (!item) return false;
  const symbol = item.symbol;
  const endMinute = getModalOneMinuteCandlesEndMinute(item);
  if (!symbol || !Number.isFinite(endMinute)) return false;

  const key = modalOHLC1mCacheKey(symbol, endMinute, maxCount);
  if (modalOHLC1mCache.has(key) || modalOHLC1mPending.has(key)) return true;
  if (!ws || ws.readyState !== 1) {
    modalOHLC1mFailed.add(key);
    return false;
  }

  const promise = fetchDerivOHLC1mCandles(symbol, endMinute, maxCount)
    .then((candles) => {
      if (Array.isArray(candles) && candles.length) {
        modalOHLC1mCache.set(key, candles);
        modalOHLC1mFailed.delete(key);
      } else {
        modalOHLC1mFailed.add(key);
      }
    })
    .catch(() => {
      modalOHLC1mFailed.add(key);
    })
    .finally(() => {
      modalOHLC1mPending.delete(key);
      if (
        modalCurrentItem &&
        modalChartView === "candles1m" &&
        modalCurrentItem.symbol === symbol &&
        Number(getModalOneMinuteCandlesEndMinute(modalCurrentItem)) === endMinute
      ) {
        requestModalDraw(true);
      }
    });

  modalOHLC1mPending.set(key, promise);
  return true;
}
function getCachedModalOHLC1mCandles(symbol, endMinute, maxCount = MODAL_CANDLES_1M_COUNT) {
  const key = modalOHLC1mCacheKey(symbol, endMinute, maxCount);
  const cached = modalOHLC1mCache.get(key);
  return Array.isArray(cached) ? cached.slice() : [];
}
function hasResolvedNextResultCandle(item) {
  const out = getItemNextOutcomeValue(item);
  return out === "up" || out === "down" || out === "flat" || out === "equal" || out === "neutral";
}
function getModalOneMinuteCandlesEndMinute(item) {
  const m = Number(item?.minute);
  if (!Number.isFinite(m)) return m;
  // V42: si la señal ya tiene resultado de próxima vela, el modal de Velas 1m
  // debe mostrar también esa vela siguiente, después de la vela señal remarcada.
  return hasResolvedNextResultCandle(item) ? m + 1 : m;
}
function isModalSignalCandle(item, candle) {
  return Number(candle?.minute) === Number(item?.minute);
}
function isModalNextResultCandle(item, candle) {
  return hasResolvedNextResultCandle(item) && Number(candle?.minute) === Number(item?.minute) + 1;
}
function buildLocalOneMinuteCandlesFallback(item, liveTicks = [], maxCount = MODAL_CANDLES_1M_COUNT, endMinuteOverride = null) {
  if (!item) return [];
  const symbol = item.symbol;
  const minute = Number(item.minute);
  const endMinute = Number.isFinite(Number(endMinuteOverride)) ? Number(endMinuteOverride) : getModalOneMinuteCandlesEndMinute(item);
  const byMinute = new Map();

  // Fallback solo con velas disponibles localmente. No rellena huecos y no fuerza
  // aperturas/cierres, para evitar las velas falsas que se veían en v31.
  for (const c of getGiroPolarityCandles(symbol, endMinute, maxCount) || []) {
    const clean = sanitizeMiniCandle(symbol, c, { source: "local_ohlc" });
    if (clean) byMinute.set(Number(clean.minute), clean);
  }

  let current = null;
  if (modalLive && isItemLiveMinute(item)) {
    const lt = minuteData?.[minute]?.[symbol];
    current = candleFromTicks(symbol, minute, Array.isArray(lt) && lt.length ? lt : liveTicks);
  }
  if (!current && !modalLive) current = getStoredCandleByMinute(symbol, minute);
  if (!current && candleOC?.[minute]?.[symbol]) current = { symbol, minute, ...candleOC[minute][symbol], current: modalLive && isItemLiveMinute(item) };
  if (!current && Array.isArray(item?.ticks) && item.ticks.length) current = candleFromTicks(symbol, minute, item.ticks);

  const cleanCurrent = current ? sanitizeMiniCandle(symbol, current, { current: modalLive && isItemLiveMinute(item), source: current.fromTicks ? "ticks" : "local_current" }) : null;
  if (cleanCurrent) byMinute.set(Number(cleanCurrent.minute), cleanCurrent);

  if (hasResolvedNextResultCandle(item)) {
    const nextMinute = Number(minute) + 1;
    const nextStored = getStoredCandleByMinute(symbol, nextMinute);
    const nextOC = candleOC?.[nextMinute]?.[symbol] ? { symbol, minute: nextMinute, ...candleOC[nextMinute][symbol] } : null;
    const cleanNext = sanitizeMiniCandle(symbol, nextStored || nextOC || {}, { source: nextStored ? "local_next_result" : "candle_oc_next_result" });
    if (cleanNext) byMinute.set(Number(cleanNext.minute), cleanNext);
  }

  return [...byMinute.values()]
    .sort((a, b) => Number(a.minute) - Number(b.minute))
    .slice(-maxCount);
}
function buildModalOneMinuteCandles(item, liveTicks = []) {
  if (!item) return [];
  const symbol = item.symbol;
  const minute = Number(item.minute);
  const count = MODAL_CANDLES_1M_COUNT;
  const endMinute = getModalOneMinuteCandlesEndMinute(item);
  const key = modalOHLC1mCacheKey(symbol, endMinute, count);

  let candles = getCachedModalOHLC1mCandles(symbol, endMinute, count);

  if (!candles.length) {
    requestModalOHLC1mCandles(item, count);
    // Mientras llegan las velas reales, solo usamos fallback local si ya falló el pedido.
    // Así no se vuelve a mostrar el gráfico deformado por datos incompletos.
    if (modalOHLC1mFailed.has(key)) candles = buildLocalOneMinuteCandlesFallback(item, liveTicks, count, endMinute);
  }

  if (candles.length && modalLive && isItemLiveMinute(item)) {
    const lt = minuteData?.[minute]?.[symbol];
    const current = candleFromTicks(symbol, minute, Array.isArray(lt) && lt.length ? lt : liveTicks);
    const cleanCurrent = current ? sanitizeMiniCandle(symbol, current, { current: true, source: "ticks_live" }) : null;
    if (cleanCurrent) {
      const byMinute = new Map(candles.map((c) => [Number(c.minute), c]));
      byMinute.set(Number(cleanCurrent.minute), cleanCurrent);
      candles = [...byMinute.values()].sort((a, b) => Number(a.minute) - Number(b.minute)).slice(-count);
    }
  }

  return candles;
}
function drawMiniCandlesLoading(ctx, w, h, text = "Cargando velas 1m reales…") {
  ctx.save();
  ctx.fillStyle = "rgba(148,163,184,0.92)";
  ctx.font = "800 15px system-ui, -apple-system, Segoe UI, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, w / 2, h / 2);
  ctx.restore();
}
function drawRoundedRect(ctx, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
function drawDerivLikeOneMinuteCandles(canvas, item, ticks = []) {
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
  ctx.fillStyle = "rgba(2,6,23,0.94)";
  ctx.fillRect(0, 0, w, h);

  const candles = buildModalOneMinuteCandles(item, ticks);
  if (!candles.length) {
    const pendingKey = item ? modalOHLC1mCacheKey(item.symbol, getModalOneMinuteCandlesEndMinute(item), MODAL_CANDLES_1M_COUNT) : "";
    const isPending = pendingKey && modalOHLC1mPending.has(pendingKey);
    drawMiniCandlesLoading(ctx, w, h, isPending ? "Cargando velas 1m reales…" : "Sin velas 1m reales disponibles");
    return;
  }

  const padL = 34;
  const padR = 12;
  const padT = 12;
  const padB = 24;
  const plotW = Math.max(1, w - padL - padR);
  const plotH = Math.max(1, h - padT - padB);
  const meta = getSignalDynamicLineMeta(item);
  const pol = item?.giroPolaridad && String(item.giroPolaridad?.levelMode || "") !== "dynamic_line" ? item.giroPolaridad : null;
  const snrArea = pol ? buildSNRNearAreaMetaFromLevel(pol) : null;

  // V33: la vista Velas 1m debe usar EXACTAMENTE la misma proyección
  // que el gráfico de línea intraminuto. Antes se reconstruía la pendiente
  // con touchDetails y eso podía desplazar el nivel: la línea de velas no
  // coincidía con la línea del gráfico normal. Ahora cada vela pregunta el
  // valor real de la línea para su minuto con getDynamicLineValue(meta,...).
  const buildDynamicLineVisual = () => {
    if (!meta || !candles.length) return null;
    const projected = candles.map((c) => Number(getDynamicLineValue(meta, Number(c.minute), 0)));
    if (projected.filter(Number.isFinite).length < 2) return null;

    // Si algún minuto aislado no proyecta, interpolamos entre vecinos válidos
    // solo para dibujar continuo, sin cambiar la lógica de entrada.
    const filled = projected.slice();
    for (let i = 0; i < filled.length; i++) {
      if (Number.isFinite(filled[i])) continue;
      let l = i - 1;
      while (l >= 0 && !Number.isFinite(filled[l])) l--;
      let r = i + 1;
      while (r < filled.length && !Number.isFinite(filled[r])) r++;
      if (l >= 0 && r < filled.length && Number.isFinite(filled[l]) && Number.isFinite(filled[r])) {
        const t = (i - l) / Math.max(1, r - l);
        filled[i] = filled[l] + (filled[r] - filled[l]) * t;
      } else if (l >= 0 && Number.isFinite(filled[l])) {
        filled[i] = filled[l];
      } else if (r < filled.length && Number.isFinite(filled[r])) {
        filled[i] = filled[r];
      }
    }
    return (i) => Number(filled[i]);
  };
  const dynamicLineVisualAt = buildDynamicLineVisual();

  const values = [];
  for (const c of candles) values.push(Number(c.high), Number(c.low), Number(c.open), Number(c.close));
  if (meta && dynamicLineVisualAt) {
    for (let i = 0; i < candles.length; i++) values.push(Number(dynamicLineVisualAt(i)));
  }
  if (snrArea) values.push(Number(snrArea.nearLow), Number(snrArea.nearHigh), Number(snrArea.zoneLow), Number(snrArea.zoneHigh));
  else if (pol && Number.isFinite(Number(pol.level))) values.push(Number(pol.level));
  let min = Math.min(...values.filter(Number.isFinite));
  let max = Math.max(...values.filter(Number.isFinite));
  if (!Number.isFinite(min) || !Number.isFinite(max)) return;
  if (min === max) { min -= Math.abs(min || 1) * 0.00001; max += Math.abs(max || 1) * 0.00001; }
  const padding = (max - min) * 0.12;
  min -= padding;
  max += padding;

  const yOf = (v) => padT + (max - Number(v)) / Math.max(max - min, 1e-12) * plotH;
  const step = plotW / Math.max(candles.length, 1);
  const xOf = (i) => padL + step * i + step / 2;
  const candleW = Math.max(4, Math.min(16, step * 0.56));

  // Grilla tipo Deriv, suave.
  ctx.save();
  ctx.strokeStyle = "rgba(148,163,184,0.14)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = padT + (plotH * i) / 4;
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke();
  }
  const vStep = Math.max(4, Math.floor(candles.length / 6));
  for (let i = 0; i < candles.length; i += vStep) {
    const x = xOf(i);
    ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, h - padB); ctx.stroke();
  }
  ctx.restore();

  // Zona SNR horizontal si la señal la trae.
  if (snrArea) {
    const yNearA = yOf(Number(snrArea.nearLow));
    const yNearB = yOf(Number(snrArea.nearHigh));
    const yZoneA = yOf(Number(snrArea.zoneLow));
    const yZoneB = yOf(Number(snrArea.zoneHigh));
    const yTopNear = Math.min(yNearA, yNearB), hNear = Math.abs(yNearB - yNearA);
    const yTopZone = Math.min(yZoneA, yZoneB), hZone = Math.abs(yZoneB - yZoneA);
    ctx.save();
    ctx.fillStyle = "rgba(250,204,21,0.12)";
    ctx.fillRect(padL, yTopNear, plotW, Math.max(1, hNear));
    ctx.fillStyle = "rgba(59,130,246,0.18)";
    ctx.fillRect(padL, yTopZone, plotW, Math.max(1, hZone));
    ctx.strokeStyle = "rgba(96,165,250,0.80)";
    ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.moveTo(padL, yZoneA); ctx.lineTo(w - padR, yZoneA); ctx.moveTo(padL, yZoneB); ctx.lineTo(w - padR, yZoneB); ctx.stroke();
    ctx.restore();
  } else if (pol && Number.isFinite(Number(pol.level))) {
    const y = yOf(Number(pol.level));
    ctx.save();
    ctx.setLineDash([7, 5]);
    ctx.strokeStyle = "rgba(96,165,250,0.86)";
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke();
    ctx.restore();
  }

  // Velas 1 minuto reales de Deriv.
  candles.forEach((c, i) => {
    const x = xOf(i);
    const open = Number(c.open), high = Number(c.high), low = Number(c.low), close = Number(c.close);
    const up = close >= open;
    const col = up ? "rgba(34,197,94,0.95)" : "rgba(248,113,113,0.95)";
    const yH = yOf(high), yL = yOf(low), yO = yOf(open), yC = yOf(close);
    ctx.save();
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x, yH); ctx.lineTo(x, yL); ctx.stroke();
    const bodyTop = Math.min(yO, yC);
    const bodyH = Math.max(2, Math.abs(yC - yO));
    ctx.fillStyle = col;
    drawRoundedRect(ctx, x - candleW / 2, bodyTop, candleW, bodyH, Math.min(3, candleW / 3));
    ctx.fill();
    if (isModalSignalCandle(item, c)) {
      ctx.strokeStyle = "rgba(255,255,255,0.55)";
      ctx.lineWidth = 1.25;
      drawRoundedRect(ctx, x - candleW / 2 - 2, bodyTop - 2, candleW + 4, bodyH + 4, 4);
      ctx.stroke();
    }
    if (isModalNextResultCandle(item, c)) {
      const out = getItemNextOutcomeValue(item);
      const outCol = out === "up" ? "rgba(34,197,94,0.98)" : out === "down" ? "rgba(248,113,113,0.98)" : "rgba(229,231,235,0.92)";
      ctx.strokeStyle = outCol;
      ctx.lineWidth = 2.15;
      ctx.shadowColor = outCol;
      ctx.shadowBlur = 8;
      drawRoundedRect(ctx, x - candleW / 2 - 3, bodyTop - 3, candleW + 6, bodyH + 6, 5);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = outCol;
      ctx.font = "900 13px system-ui, -apple-system, Segoe UI, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(out === "up" ? "▲" : out === "down" ? "▼" : "=" , x, Math.max(8, Math.min(bodyTop - 9, padT + 9)));
    }
    ctx.restore();
  });

  // Línea dinámica marcada sobre las velas de 1 minuto.
  if (meta && dynamicLineVisualAt) {
    const isSupportLine = String(meta.levelType || meta.lineType || "") === "support";
    ctx.save();
    ctx.strokeStyle = isSupportLine ? "rgba(34,197,94,0.96)" : "rgba(248,113,113,0.96)";
    ctx.lineWidth = 2.2;
    ctx.shadowColor = isSupportLine ? "rgba(34,197,94,0.22)" : "rgba(248,113,113,0.22)";
    ctx.shadowBlur = 9;
    ctx.beginPath();
    const x0 = xOf(0);
    const y0 = yOf(dynamicLineVisualAt(0));
    const x1 = xOf(candles.length - 1);
    const y1 = yOf(dynamicLineVisualAt(candles.length - 1));
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();

    const touchSet = new Set((Array.isArray(meta.touchMinutes) ? meta.touchMinutes : []).map((m) => Number(m)));
    if (touchSet.size) {
      ctx.fillStyle = isSupportLine ? "rgba(187,247,208,0.95)" : "rgba(254,202,202,0.95)";
      ctx.strokeStyle = "rgba(2,6,23,0.70)";
      ctx.lineWidth = 1.2;
      candles.forEach((c, i) => {
        if (!touchSet.has(Number(c.minute))) return;
        const x = xOf(i);
        const y = yOf(dynamicLineVisualAt(i));
        ctx.beginPath(); ctx.arc(x, y, 4.2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      });
    }
    ctx.restore();
  }

  // Línea del último cierre.
  const last = candles[candles.length - 1];
  if (last) {
    const y = yOf(Number(last.close));
    ctx.save();
    ctx.setLineDash([3, 5]);
    ctx.strokeStyle = "rgba(255,255,255,0.26)";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke();
    ctx.restore();
  }
}


/* =========================
   Replay vela señal — zoom tick por tick
========================= */
function getModalReplayTicks(item = modalCurrentItem) {
  if (!item) return [];
  let ticks = Array.isArray(item.ticks) ? item.ticks.slice() : [];
  if (modalLive && isItemLiveMinute(item)) {
    const liveTicks = minuteData?.[item.minute]?.[item.symbol];
    if (Array.isArray(liveTicks) && liveTicks.length >= ticks.length) ticks = liveTicks.slice();
  }
  return ticks
    .map((p) => ({ ms: Number(p?.ms), quote: Number(p?.quote) }))
    .filter((p) => Number.isFinite(p.ms) && Number.isFinite(p.quote))
    .map((p) => ({ ms: Math.max(0, Math.min(60000, p.ms)), quote: p.quote }))
    .sort((a, b) => a.ms - b.ms);
}
function ensureModalReplayBox() {
  let box = document.getElementById("modalReplayBox");
  if (box) return box;
  const host = document.querySelector("#chartModal .minuteCanvasWrap") || (chartModal ? chartModal.querySelector(".minuteCanvasWrap") : null);
  if (!host) return null;
  box = document.createElement("div");
  box.id = "modalReplayBox";
  box.className = "modalReplayBox hidden";
  box.innerHTML = `
    <div class="modalReplayHead">
      <div class="modalReplayTitle">🔎 Replay vela de señal</div>
      <button id="modalReplayCloseBtn" class="modalReplayClose" type="button" aria-label="Cerrar replay">✖</button>
    </div>
    <canvas id="modalReplayCanvas"></canvas>
    <div id="modalReplayInfo" class="modalReplayInfo">—</div>
    <div class="modalReplayControls">
      <button id="modalReplayPlayBtn" class="modalReplayControlBtn" type="button">▶️</button>
      <button id="modalReplayResetBtn" class="modalReplayControlBtn" type="button">↺</button>
      <button id="modalReplaySpeedBtn" class="modalReplayControlBtn" type="button">1x</button>
      <input id="modalReplaySeek" type="range" min="0" max="60000" step="250" value="0" aria-label="Tiempo del replay" />
    </div>`;
  host.appendChild(box);

  const closeBtn = box.querySelector("#modalReplayCloseBtn");
  const playBtn = box.querySelector("#modalReplayPlayBtn");
  const resetBtn = box.querySelector("#modalReplayResetBtn");
  const speedBtn = box.querySelector("#modalReplaySpeedBtn");
  const seek = box.querySelector("#modalReplaySeek");
  if (closeBtn) closeBtn.onclick = (e) => { e.stopPropagation(); closeModalReplay(); };
  if (playBtn) playBtn.onclick = (e) => {
    e.stopPropagation();
    modalReplayState.playing = !modalReplayState.playing;
    modalReplayState.lastFrameTs = 0;
    if (modalReplayState.playing && modalReplayState.currentMs >= 60000) modalReplayState.currentMs = 0;
    startModalReplayLoop();
    updateModalReplayControlsUI();
  };
  if (resetBtn) resetBtn.onclick = (e) => {
    e.stopPropagation();
    modalReplayState.currentMs = 0;
    modalReplayState.lastFrameTs = 0;
    modalReplayState.playing = true;
    startModalReplayLoop();
    drawModalReplayFrame();
  };
  if (speedBtn) speedBtn.onclick = (e) => {
    e.stopPropagation();
    const speeds = [1, 2, 4];
    const idx = speeds.indexOf(Number(modalReplayState.speed || 1));
    modalReplayState.speed = speeds[(idx + 1) % speeds.length];
    updateModalReplayControlsUI();
  };
  if (seek) seek.oninput = (e) => {
    e.stopPropagation();
    modalReplayState.currentMs = Math.max(0, Math.min(60000, Number(seek.value) || 0));
    modalReplayState.lastFrameTs = 0;
    drawModalReplayFrame();
  };
  box.addEventListener("click", (e) => e.stopPropagation());
  return box;
}
function updateModalReplayControlsUI() {
  const box = document.getElementById("modalReplayBox");
  if (!box) return;
  const playBtn = box.querySelector("#modalReplayPlayBtn");
  const speedBtn = box.querySelector("#modalReplaySpeedBtn");
  const seek = box.querySelector("#modalReplaySeek");
  if (playBtn) {
    playBtn.textContent = modalReplayState.playing ? "⏸️" : "▶️";
    playBtn.classList.toggle("active", !!modalReplayState.playing);
  }
  if (speedBtn) speedBtn.textContent = `${Number(modalReplayState.speed || 1)}x`;
  if (seek) seek.value = String(Math.max(0, Math.min(60000, Number(modalReplayState.currentMs || 0))));
}
function openModalReplay() {
  if (!modalCurrentItem) return;
  const ticks = getModalReplayTicks(modalCurrentItem);
  if (ticks.length < 2) {
    toast("⚠️ Sin ticks suficientes para replay", 1600);
    return;
  }
  const box = ensureModalReplayBox();
  if (!box) return;
  box.classList.remove("hidden");
  modalReplayState.open = true;
  modalReplayState.playing = true;
  modalReplayState.speed = 1;
  modalReplayState.currentMs = 0;
  modalReplayState.lastFrameTs = 0;
  updateModalReplayControlsUI();
  startModalReplayLoop();
}
function closeModalReplay() {
  modalReplayState.open = false;
  modalReplayState.playing = false;
  modalReplayState.lastFrameTs = 0;
  if (modalReplayState.raf) cancelAnimationFrame(modalReplayState.raf);
  modalReplayState.raf = null;
  const box = document.getElementById("modalReplayBox");
  if (box) box.classList.add("hidden");
}
function startModalReplayLoop() {
  if (!modalReplayState.open) return;
  if (modalReplayState.raf) cancelAnimationFrame(modalReplayState.raf);
  modalReplayState.raf = requestAnimationFrame(modalReplayLoop);
}
function modalReplayLoop(ts) {
  if (!modalReplayState.open) return;
  if (modalReplayState.playing) {
    if (!modalReplayState.lastFrameTs) modalReplayState.lastFrameTs = ts;
    const dt = Math.max(0, ts - modalReplayState.lastFrameTs);
    modalReplayState.lastFrameTs = ts;
    modalReplayState.currentMs = Math.min(60000, Number(modalReplayState.currentMs || 0) + dt * Number(modalReplayState.speed || 1));
    if (modalReplayState.currentMs >= 60000) {
      modalReplayState.currentMs = 60000;
      modalReplayState.playing = false;
    }
  } else {
    modalReplayState.lastFrameTs = 0;
  }
  drawModalReplayFrame();
  modalReplayState.raf = requestAnimationFrame(modalReplayLoop);
}
function drawModalReplayFrame() {
  const box = document.getElementById("modalReplayBox");
  if (!box || box.classList.contains("hidden") || !modalCurrentItem) return;
  const canvas = box.querySelector("#modalReplayCanvas");
  const info = box.querySelector("#modalReplayInfo");
  drawModalReplayCanvas(canvas, modalCurrentItem, Number(modalReplayState.currentMs || 0), info);
  updateModalReplayControlsUI();
}
function drawModalReplayCanvas(canvas, item, replayMs = 0, infoEl = null) {
  if (!canvas || !item) return;
  const ctx = canvas.getContext("2d");
  const cssW = canvas.clientWidth || 1;
  const cssH = canvas.clientHeight || 1;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(cssW * dpr);
  canvas.height = Math.floor(cssH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const w = cssW, h = cssH;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "rgba(2,6,23,0.96)";
  ctx.fillRect(0, 0, w, h);

  const ticks = getModalReplayTicks(item);
  if (ticks.length < 2) {
    drawMiniCandlesLoading(ctx, w, h, "Sin ticks suficientes para replay");
    if (infoEl) infoEl.textContent = "Sin ticks suficientes para reproducir la vela.";
    return;
  }

  const ms = Math.max(0, Math.min(60000, Number(replayMs || 0)));
  let lastIdx = ticks.findIndex((p) => Number(p.ms) > ms) - 1;
  if (lastIdx < 0) lastIdx = 0;
  if (lastIdx >= ticks.length) lastIdx = ticks.length - 1;
  const seen = ticks.slice(0, lastIdx + 1);
  const open = Number(ticks[0].quote);
  const cur = Number(seen[seen.length - 1]?.quote ?? open);
  const highs = seen.map((p) => Number(p.quote)).filter(Number.isFinite);
  const high = Math.max(open, cur, ...highs);
  const low = Math.min(open, cur, ...highs);
  const close = cur;

  const meta = getSignalDynamicLineMeta(item);
  const line0 = meta ? Number(getDynamicLineValue(meta, item.minute, 0)) : NaN;
  const line1 = meta ? Number(getDynamicLineValue(meta, item.minute, 60000)) : NaN;
  const values = ticks.map((p) => p.quote).filter(Number.isFinite);
  if (Number.isFinite(line0)) values.push(line0);
  if (Number.isFinite(line1)) values.push(line1);
  let min = Math.min(...values), max = Math.max(...values);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return;
  if (min === max) { min -= Math.abs(min || 1) * 0.00001; max += Math.abs(max || 1) * 0.00001; }
  const pad = (max - min) * 0.12;
  min -= pad; max += pad;

  const plotX = 12;
  const plotY = 12;
  const plotW = Math.max(80, w * 0.68 - 20);
  const plotH = Math.max(100, h - 28);
  const candleX = Math.max(plotX + plotW + 18, w * 0.82);
  const candleTop = plotY + 10;
  const candleBot = plotY + plotH - 10;
  const yOf = (q) => plotY + (max - Number(q)) / Math.max(max - min, 1e-12) * plotH;
  const xOf = (m) => plotX + (Number(m) / 60000) * plotW;

  ctx.save();
  ctx.strokeStyle = "rgba(148,163,184,.16)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = plotY + (plotH * i) / 4;
    ctx.beginPath(); ctx.moveTo(plotX, y); ctx.lineTo(plotX + plotW, y); ctx.stroke();
  }
  for (const mark of [0, 15000, 30000, 45000, 60000]) {
    const x = xOf(mark);
    ctx.setLineDash(mark === 60000 ? [] : [4, 6]);
    ctx.beginPath(); ctx.moveTo(x, plotY); ctx.lineTo(x, plotY + plotH); ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.restore();

  if (meta && Number.isFinite(line0) && Number.isFinite(line1)) {
    const isSupport = String(meta.levelType || meta.lineType || "") === "support";
    ctx.save();
    ctx.strokeStyle = isSupport ? "rgba(34,197,94,.90)" : "rgba(248,113,113,.90)";
    ctx.lineWidth = 1.8;
    ctx.shadowColor = isSupport ? "rgba(34,197,94,.20)" : "rgba(248,113,113,.20)";
    ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.moveTo(xOf(0), yOf(line0)); ctx.lineTo(xOf(60000), yOf(line1)); ctx.stroke();
    ctx.restore();
  }

  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,.82)";
  ctx.lineWidth = 2.2;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  seen.forEach((p, i) => {
    const x = xOf(p.ms), y = yOf(p.quote);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,.90)";
  for (const p of seen) {
    ctx.beginPath(); ctx.arc(xOf(p.ms), yOf(p.quote), 1.5, 0, Math.PI * 2); ctx.fill();
  }
  const cx = xOf(seen[seen.length - 1].ms), cy = yOf(cur);
  ctx.fillStyle = "rgba(255,255,255,1)";
  ctx.strokeStyle = "rgba(15,23,42,.85)";
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.restore();

  // Vela grande formándose con el mismo recorrido ya visto.
  const yH = yOf(high), yL = yOf(low), yO = yOf(open), yC = yOf(close);
  const up = close >= open;
  const col = up ? "rgba(34,197,94,.96)" : "rgba(248,113,113,.96)";
  const bodyTop = Math.min(yO, yC);
  const bodyH = Math.max(3, Math.abs(yC - yO));
  const bodyW = Math.min(34, Math.max(20, w * 0.085));
  ctx.save();
  ctx.strokeStyle = col;
  ctx.lineWidth = 2.4;
  ctx.beginPath(); ctx.moveTo(candleX, yH); ctx.lineTo(candleX, yL); ctx.stroke();
  ctx.fillStyle = col;
  drawRoundedRect(ctx, candleX - bodyW / 2, bodyTop, bodyW, bodyH, 5);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,.30)";
  ctx.lineWidth = 1;
  drawRoundedRect(ctx, candleX - bodyW / 2 - 3, bodyTop - 3, bodyW + 6, bodyH + 6, 6);
  ctx.stroke();
  ctx.fillStyle = "rgba(226,232,240,.72)";
  ctx.font = "800 10px system-ui, -apple-system, Segoe UI, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("VELA", candleX, Math.max(10, candleTop - 2));
  ctx.restore();

  ctx.save();
  ctx.fillStyle = "rgba(226,232,240,.74)";
  ctx.font = "800 10px system-ui, -apple-system, Segoe UI, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("0s", xOf(0), h - 5);
  ctx.textAlign = "center";
  ctx.fillText(`${Math.round(ms / 1000)}s`, xOf(ms), h - 5);
  ctx.textAlign = "right";
  ctx.fillText("60s", xOf(60000), h - 5);
  ctx.restore();

  if (infoEl) {
    const tickTxt = `${lastIdx + 1}/${ticks.length} ticks`;
    infoEl.textContent = `${(ms / 1000).toFixed(1)}s · ${tickTxt} · precio ${close.toFixed(6)} · O ${open.toFixed(6)} H ${high.toFixed(6)} L ${low.toFixed(6)} C ${close.toFixed(6)}`;
  }
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

    if (modalChartView === "candles1m") drawDerivLikeOneMinuteCandles(minuteCanvas, it, ticks);
    else drawDerivLikeChart(minuteCanvas, ticks);

    const n = Array.isArray(ticks) ? ticks.length : 0;
    setCompactModalHeader(it, n);

    updateModalCandleStatusUI();
    updateModalNavVoteUI();
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
function normalizeSNRLevelMeta(meta) {
  if (!meta || typeof meta !== "object") return null;
  const n = (v, fallback = null) => {
    const x = Number(v);
    return Number.isFinite(x) ? x : fallback;
  };
  const s = (v) => String(v || "");
  return {
    level: n(meta.level),
    levelMode: s(meta.levelMode),
    levelType: s(meta.levelType),
    originalType: s(meta.originalType),
    currentRole: s(meta.currentRole),
    direction: s(meta.direction),
    zoneLow: n(meta.zoneLow),
    zoneHigh: n(meta.zoneHigh),
    bodyZoneLow: n(meta.bodyZoneLow),
    bodyZoneHigh: n(meta.bodyZoneHigh),
    tolerance: n(meta.tolerance),
    zone: n(meta.zone),
    touches: n(meta.touches, 0),
    brokenAt: n(meta.brokenAt, 0),
    breakDirection: s(meta.breakDirection),
    firstTouchMs: n(meta.firstTouchMs),
    secondTouchMs: n(meta.secondTouchMs),
    firstRejection: n(meta.firstRejection),
    rejectionHasForce: !!meta.rejectionHasForce,
    secondTouchDistance: n(meta.secondTouchDistance),
    stage: s(meta.stage),
    status: s(meta.status),
    logic: s(meta.logic),
  };
}
function getSignalLevelMeta(item) {
  return normalizeSNRLevelMeta(item?.giroPolaridad || item?.polarityLevel || item?.giroNivelMeta || item?.levelMeta || null);
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
  panel.style.margin = "0 0 8px 0";
  panel.style.padding = "10px";
  panel.style.borderRadius = "16px";
  panel.style.border = "1px solid rgba(34,211,238,.24)";
  panel.style.background = "linear-gradient(180deg, rgba(34,211,238,.10), rgba(255,255,255,.030))";
  panel.style.boxShadow = "0 12px 26px rgba(0,0,0,.16), inset 0 0 0 1px rgba(34,211,238,.035)";

  const top = document.createElement("div");
  top.style.display = "flex";
  top.style.alignItems = "center";
  top.style.justifyContent = "space-between";
  top.style.gap = "8px";
  top.style.marginBottom = "8px";

  const count = document.createElement("div");
  count.id = "giroAprendizajeCount";
  count.style.fontWeight = "950";
  count.style.letterSpacing = ".25px";
  count.style.fontSize = "14px";
  count.style.padding = "8px 11px";
  count.style.borderRadius = "999px";
  count.style.border = "1px solid rgba(34,211,238,.24)";
  count.style.background = "rgba(0,0,0,.16)";
  count.style.whiteSpace = "normal";
  count.style.lineHeight = "1.15";

  const hint = document.createElement("div");
  hint.id = "giroAprendizajeHint";
  hint.style.flex = "1";
  hint.style.textAlign = "right";
  hint.style.fontSize = "11.5px";
  hint.style.fontWeight = "850";
  hint.style.opacity = ".88";
  hint.style.lineHeight = "1.18";
  hint.style.maxWidth = "150px";

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
      const current = getGiroAprendizajeExampleForItem(modalCurrentItem);
      const currentLabel = current ? normalizeGiroAprendizajeLabel(current.label) : "";
      // Si tocás de nuevo la misma etiqueta, se destilda.
      upsertGiroAprendizajeExample(modalCurrentItem, currentLabel === normalizeGiroAprendizajeLabel(label) ? "remove" : label, "modal_signal");
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
  row.style.gap = "8px";
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

/* =========================
   Despeje mental post-OTM
   - Bloqueo total corto para cortar impulso/revancha.
   - No reemplaza el bloqueo REAL de 1 hora: ese queda como estaba.
========================= */
function loadMentalCooldown() {
  try {
    mentalCooldownUntilMs = Number(localStorage.getItem(MENTAL_COOLDOWN_UNTIL_KEY) || 0) || 0;
    mentalCooldownReason = String(localStorage.getItem(MENTAL_COOLDOWN_REASON_KEY) || "");
    mentalCooldownLastContractId = String(localStorage.getItem(MENTAL_COOLDOWN_LAST_CONTRACT_KEY) || "");
    if (mentalCooldownUntilMs && Date.now() >= mentalCooldownUntilMs) clearMentalCooldown({ silent: true });
  } catch {
    mentalCooldownUntilMs = 0;
    mentalCooldownReason = "";
    mentalCooldownLastContractId = "";
  }
}
function saveMentalCooldown() {
  try {
    localStorage.setItem(MENTAL_COOLDOWN_UNTIL_KEY, String(mentalCooldownUntilMs || 0));
    localStorage.setItem(MENTAL_COOLDOWN_REASON_KEY, mentalCooldownReason || "");
    localStorage.setItem(MENTAL_COOLDOWN_LAST_CONTRACT_KEY, mentalCooldownLastContractId || "");
  } catch {}
}
function clearMentalCooldown({ silent = false } = {}) {
  mentalCooldownUntilMs = 0;
  mentalCooldownReason = "";
  mentalCooldownLastContractId = "";
  try {
    localStorage.removeItem(MENTAL_COOLDOWN_UNTIL_KEY);
    localStorage.removeItem(MENTAL_COOLDOWN_REASON_KEY);
    localStorage.removeItem(MENTAL_COOLDOWN_LAST_CONTRACT_KEY);
  } catch {}
  updateMentalCooldownUI();
  applyLiveAnalysisPauseUI();
  if (!silent) toast("🌿 Despeje mental terminado. Volvé despacio.", 2200);
}
function isMentalCooldownActive() {
  const until = Number(mentalCooldownUntilMs || 0);
  if (!until) return false;
  if (Date.now() >= until) {
    clearMentalCooldown({ silent: true });
    return false;
  }
  return true;
}
function getMentalCooldownRemainingMs() {
  return Math.max(0, Number(mentalCooldownUntilMs || 0) - Date.now());
}
function fmtMentalCooldownRemaining(ms) {
  const s = Math.max(0, Math.ceil(Number(ms || 0) / 1000));
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return `${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}
function ensureMentalCooldownOverlay() {
  if (mentalCooldownOverlayEl && mentalCooldownOverlayEl.isConnected) return mentalCooldownOverlayEl;

  let el = document.getElementById("mentalCooldownOverlay");
  if (!el) {
    el = document.createElement("div");
    el.id = "mentalCooldownOverlay";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "true");
    el.setAttribute("aria-label", "Despeje mental");
    el.style.position = "fixed";
    el.style.inset = "0";
    el.style.zIndex = "2147483000";
    el.style.display = "none";
    el.style.alignItems = "center";
    el.style.justifyContent = "center";
    el.style.padding = "10px";
    el.style.background = "rgba(2,6,23,.96)";
    el.style.color = "#e5f7ff";
    el.style.backdropFilter = "blur(10px)";
    el.style.pointerEvents = "auto";
    el.style.touchAction = "none";
    el.innerHTML = `
      <div id="mentalCooldownArtCard" style="position:relative;width:min(94vw,560px);max-height:96svh;aspect-ratio:941/1672;overflow:hidden;border-radius:26px;box-shadow:0 26px 90px rgba(0,0,0,.72),0 0 42px rgba(34,211,238,.16);">
        <img id="mentalCooldownBgImg" src="${MENTAL_COOLDOWN_IMAGE_SRC}" alt="Despeje mental" style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain;display:block;user-select:none;-webkit-user-drag:none;pointer-events:none;" draggable="false" />

        <div id="mentalCooldownCountdown" style="position:absolute;left:11.5%;right:11.5%;top:63.2%;height:11.8%;display:flex;align-items:center;justify-content:center;font-size:clamp(50px,15vw,104px);line-height:1;font-weight:950;font-variant-numeric:tabular-nums;letter-spacing:.045em;color:#7dfcff;text-shadow:0 0 10px rgba(125,252,255,.55),0 0 30px rgba(34,211,238,.34);font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;">10:00</div>

        <div id="mentalCooldownAdviceLayer" style="position:absolute;left:11.5%;right:11.5%;top:77.2%;height:9.6%;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;gap:12px;text-align:center;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;">
          <div id="mentalCooldownDots" style="display:flex;align-items:center;justify-content:center;gap:clamp(7px,1.9vw,13px);min-height:18px;" aria-label="Progreso de despeje mental"></div>
          <div id="mentalCooldownTipText" style="max-width:92%;min-height:44px;display:flex;align-items:center;justify-content:center;color:#9ffdf0;text-shadow:0 0 12px rgba(34,211,238,.24);font-size:clamp(13px,3.2vw,18px);line-height:1.28;font-weight:760;">Respirá profundo. No operes desde la urgencia.</div>
        </div>

        <div id="mentalCooldownReasonText" style="position:absolute;left:11.5%;right:11.5%;bottom:4.3%;height:3.2%;display:flex;align-items:center;justify-content:center;font-size:clamp(10px,2.6vw,13px);font-weight:800;line-height:1.2;color:rgba(203,213,225,.78);text-align:center;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;opacity:.0;pointer-events:none;">Señales y operaciones pausadas.</div>
      </div>
    `;

    const dotsHost = el.querySelector("#mentalCooldownDots");
    if (dotsHost) {
      dotsHost.innerHTML = MENTAL_COOLDOWN_TIPS.map((_, i) => `<span class="mentalCooldownDot" data-i="${i}" style="width:clamp(8px,2vw,12px);height:clamp(8px,2vw,12px);border-radius:999px;background:rgba(45,212,191,.34);box-shadow:none;transition:background .25s ease, transform .25s ease, box-shadow .25s ease, opacity .25s ease;opacity:.72;"></span>`).join("");
    }

    el.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
    }, true);
    el.addEventListener("touchmove", (e) => {
      e.preventDefault();
    }, { passive: false });
    document.body.appendChild(el);
  }

  mentalCooldownOverlayEl = el;
  return mentalCooldownOverlayEl;
}
function updateMentalCooldownAdviceUI(el, remainingMs) {
  try {
    const total = Number(MENTAL_COOLDOWN_MS || 600000);
    const remain = Math.max(0, Number(remainingMs || 0));
    const elapsed = Math.max(0, total - remain);
    const stepMs = total / MENTAL_COOLDOWN_TIPS.length;
    const idx = Math.min(MENTAL_COOLDOWN_TIPS.length - 1, Math.max(0, Math.floor(elapsed / stepMs)));
    const tipEl = el?.querySelector?.("#mentalCooldownTipText");
    if (tipEl) tipEl.textContent = MENTAL_COOLDOWN_TIPS[idx] || "Respirá profundo. No operes desde la urgencia.";

    const dots = Array.from(el?.querySelectorAll?.(".mentalCooldownDot") || []);
    dots.forEach((dot, i) => {
      const isActive = i === idx;
      const isDone = i < idx;
      dot.style.background = isActive ? "#22f4e8" : isDone ? "rgba(34,244,232,.72)" : "rgba(45,212,191,.34)";
      dot.style.opacity = isActive ? "1" : isDone ? ".88" : ".62";
      dot.style.transform = isActive ? "scale(1.45)" : "scale(1)";
      dot.style.boxShadow = isActive ? "0 0 16px rgba(34,244,232,.72), 0 0 26px rgba(34,211,238,.32)" : isDone ? "0 0 8px rgba(34,211,238,.22)" : "none";
    });
  } catch {}
}
function updateMentalCooldownUI() {
  const active = isMentalCooldownActive();
  const el = ensureMentalCooldownOverlay();
  if (!el) return;
  if (!active) {
    el.style.display = "none";
    return;
  }
  const remain = getMentalCooldownRemainingMs();
  el.style.display = "flex";
  const cd = el.querySelector("#mentalCooldownCountdown");
  const rs = el.querySelector("#mentalCooldownReasonText");
  if (cd) cd.textContent = fmtMentalCooldownRemaining(remain);
  updateMentalCooldownAdviceUI(el, remain);
  if (rs) rs.textContent = `${mentalCooldownReason || "OTM registrada"} · señales, gráfico y operaciones bloqueadas`;
  try { setStatus(`🌿 Despeje mental · ${fmtMentalCooldownRemaining(remain)}`); } catch {}
}
function startMentalCooldownAfterOtm(contractId = "", reason = "OTM registrada") {
  // Si el OTM también disparó el bloqueo REAL de 1 hora, respetamos ese flujo como estaba:
  // no mostramos overlay total para que puedas revisar Trades/velas durante la hora.
  if (isTradeLockedNow()) return false;

  const cid = String(contractId || "");
  if (cid && cid === mentalCooldownLastContractId && isMentalCooldownActive()) return false;

  mentalCooldownUntilMs = Date.now() + MENTAL_COOLDOWN_MS;
  mentalCooldownReason = reason || "OTM registrada";
  mentalCooldownLastContractId = cid;
  saveMentalCooldown();
  updateMentalCooldownUI();
  applyLiveAnalysisPauseUI();
  toast("🌿 Despeje mental: PWA bloqueada 10 minutos", 2600);
  return true;
}

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
  // V70: la disciplina de bloqueo se aplica solo en REAL.
  // En DEMO queda libre para pruebas, pero se siguen controlando contratos pendientes.
  return activeTradingAccount !== ACCOUNT_MODE_REAL;
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
  if (disciplineWins >= DISCIPLINE_MAX_WINS) return `IC2 completo: 2 ITM seguidos`;
  if (disciplineLosses >= DISCIPLINE_MAX_LOSSES) return `2 OTM alcanzados`;
  return `límite REAL alcanzado`;
}
function getDisciplineCounterText() {
  return `IC2 ${disciplineWins}/${DISCIPLINE_MAX_WINS} ITM · ${disciplineLosses}/${DISCIPLINE_MAX_LOSSES} OTM`;
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
    el.style.padding = "10px 12px";
    el.style.borderRadius = "16px";
    el.style.border = "1px solid rgba(248,113,113,.72)";
    el.style.background = "linear-gradient(180deg, rgba(127,29,29,.96), rgba(69,10,10,.96))";
    el.style.color = "#fff";
    el.style.boxShadow = "0 12px 30px rgba(0,0,0,.42), 0 0 16px rgba(239,68,68,.16)";
    el.style.fontWeight = "950";
    el.style.fontSize = "13px";
    el.style.lineHeight = "1.2";
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

  const modalOpen = chartModal && !chartModal.classList.contains("hidden");
  if (modalOpen) {
    el.style.display = "none";
    return;
  }

  const locked = isTradeLockedNow();
  const remain = locked ? Math.max(0, disciplineLockUntilMs - Date.now()) : 0;

  if (locked) {
    el.style.display = "block";
    el.style.borderColor = "rgba(248,113,113,.82)";
    el.style.background = "linear-gradient(180deg, rgba(127,29,29,.92), rgba(69,10,10,.92))";
    el.style.boxShadow = "0 12px 30px rgba(0,0,0,.42), 0 0 16px rgba(239,68,68,.16)";
    el.innerHTML = `🔒 <b>REAL bloqueada</b> · ${getDisciplineCounterText()} · falta ${fmtRemaining(remain)}`;
    return;
  }

  const closeToLimit = disciplineWins >= DISCIPLINE_MAX_WINS - 1 || disciplineLosses >= DISCIPLINE_MAX_LOSSES - 1;
  if (closeToLimit && (disciplineWins > 0 || disciplineLosses > 0)) {
    el.style.display = "block";
    el.style.borderColor = "rgba(251,191,36,.72)";
    el.style.background = "linear-gradient(180deg, rgba(120,53,15,.96), rgba(69,26,3,.96))";
    el.style.boxShadow = "0 18px 44px rgba(0,0,0,.45), 0 0 22px rgba(251,191,36,.24)";
    el.innerHTML = `⚠️ <b>DISCIPLINA REAL</b><br>${getDisciplineCounterText()} · bloquea con 2 OTM o ciclo IC2 completo`;
    return;
  }

  el.style.display = "none";
}
function disciplineTagText() {
  if (isDisciplineBypassedForCurrentAccount()) {
    const pend = (disciplinePendingContracts || []).length;
    const pTxt = pend ? ` • Pendientes:${pend}` : "";
    return `Disciplina DEMO: libre para pruebas${pTxt}`;
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
    return `🔒 REAL BLOQUEADA ${fmtRemaining(remain)} · ${getDisciplineLockReasonText()} · ${getDisciplineCounterText()}`;
  }

  const pend = (disciplinePendingContracts || []).length;
  const pTxt = pend ? ` • Pendientes:${pend}` : "";
  return `Disciplina REAL: ${getDisciplineCounterText()}${pTxt}`;
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
function lockRealDiscipline(reason = "") {
  if (isDisciplineBypassedForCurrentAccount()) return false;
  if (isTradeLockedNow()) return true;
  disciplineLockUntilMs = Date.now() + DISCIPLINE_LOCK_MS;
  saveDiscipline();
  updateDisciplineLockUI(true);
  const msgReason = reason || getDisciplineLockReasonText();
  toast(`🔒 REAL BLOQUEADA 1h: ${msgReason} · ${getDisciplineCounterText()}`, 5200);
  return true;
}

function applyDisciplineOutcome(isWin) {
  updateDisciplineLockUI(false);
  if (isDisciplineBypassedForCurrentAccount()) return;
  if (isTradeLockedNow()) return;

  // V70: los ITM consecutivos se manejan desde IC2, porque solo bloquean
  // cuando se completa el ciclo de dos niveles. Acá contamos OTM reales.
  if (!isWin) {
    disciplineLosses += 1;
    disciplineWins = 0; // corta la secuencia IC2 de 2 ITM seguidos
    saveDiscipline();

    if (disciplineLosses >= DISCIPLINE_MAX_LOSSES) {
      lockRealDiscipline("2 OTM alcanzados");
      return;
    }

    toast(`⚠️ Disciplina REAL: ${getDisciplineCounterText()}`, 1900);
    updateDisciplineLockUI(false);
    return;
  }

  // ITM nivel 1/nivel 2 se registra en updateC100AfterResult().
  saveDiscipline();
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
   Modal navigation + like/dislike
   - Las flechas no ocupan espacio sobre COMPRA/VENTA: van superpuestas al gráfico.
   - La navegación respeta la pestaña desde la que se abrió: Señales o Trades.
========================= */
function hasResolvedNextArrow(item) {
  const out = String(item?.nextOutcome || "").toLowerCase();
  return out === "up" || out === "down" || out === "flat";
}
function normalizeModalContext(opts = {}, item = null) {
  const active = localStorage.getItem("activeView") || "signals";
  const source = String(opts.source || active || "signals") === "trades" ? "trades" : "signals";
  return {
    source,
    signalId: String(opts.signalId || item?.id || ""),
    journalId: String(opts.journalId || item?.journal_id || ""),
  };
}
function buildModalItemFromTradeEntry(entry) {
  if (!entry) return null;
  const live = entry.id ? findHistoryItemById(String(entry.id)) : null;
  const ticks = Array.isArray(entry.ticks) && entry.ticks.length
    ? entry.ticks
    : (Array.isArray(live?.ticks) ? live.ticks : []);
  return {
    id: entry.id || live?.id || "",
    minute: entry.minute ?? live?.minute,
    time: entry.time || live?.time || "",
    symbol: entry.symbol || live?.symbol || "",
    direction: entry.direction || live?.direction || "",
    mode: entry.mode || live?.mode || "NORMAL",
    mode_version: entry.mode_version || live?.mode_version || getModeVersion(entry.mode || live?.mode || "NORMAL") || "",
    vote: entry.vote || "",
    comment: entry.comment || "",
    journal_id: entry.journal_id || makeJournalIdFromSignal(entry) || "",
    feedback_at: entry.feedback_at || 0,
    feedback_source: entry.feedback_source || "",
    ticks,
    nextOutcome: entry.nextOutcome || live?.nextOutcome || "",
    minuteComplete: entry.minuteComplete !== false,
    trade: entry.trade || live?.trade || null,
    study_capture_id: entry.study_capture_id || entry?.trade?.study_capture_id || live?.study_capture_id || live?.trade?.study_capture_id || "",
    manualGiro: normalizeManualGiroState(entry.manualGiro || live?.manualGiro),
    giroPolaridad: entry.giroPolaridad || entry.snrLevel || live?.giroPolaridad || live?.snrLevel || live?.polarityLevel || null,
  };
}
function getModalNavigationList() {
  const source = modalOpenContext?.source === "trades" ? "trades" : "signals";
  if (source === "trades") {
    return (tradesJournal || [])
      .map((entry) => buildModalItemFromTradeEntry(entry))
      .filter((item) => item && (item.minuteComplete || isItemLiveMinute(item)));
  }
  return [...(history || [])]
    .reverse()
    .filter((item) => item && (item.minuteComplete || isItemLiveMinute(item)));
}
function getModalItemKey(item, source = modalOpenContext?.source) {
  if (!item) return "";
  if (source === "trades") return String(item.journal_id || makeJournalIdFromSignal(item) || item.id || "");
  return String(item.id || "");
}
function getModalCurrentIndex(list = getModalNavigationList()) {
  const source = modalOpenContext?.source === "trades" ? "trades" : "signals";
  const ctxJournal = String(modalOpenContext?.journalId || "");
  const ctxSignal = String(modalOpenContext?.signalId || modalCurrentItem?.id || "");
  const currentKey = source === "trades"
    ? String(ctxJournal || getModalItemKey(modalCurrentItem, source) || ctxSignal)
    : String(ctxSignal || getModalItemKey(modalCurrentItem, source));
  return list.findIndex((item) => {
    if (!item) return false;
    if (source === "trades") {
      const jid = String(item.journal_id || makeJournalIdFromSignal(item) || "");
      const sid = String(item.id || "");
      return (!!currentKey && (jid === currentKey || sid === currentKey)) || (!!ctxSignal && sid === ctxSignal);
    }
    return String(item.id || "") === currentKey;
  });
}
function findTradeJournalFeedbackEntry() {
  const journalId = String(modalOpenContext?.journalId || modalCurrentItem?.journal_id || "");
  if (journalId) {
    const byJournal = (tradesJournal || []).find((x) => x && String(x.journal_id || "") === journalId);
    if (byJournal) return byJournal;
  }
  const signalId = String(modalOpenContext?.signalId || modalCurrentItem?.id || "");
  if (signalId) {
    const bySignal = (tradesJournal || []).find((x) => x && String(x.id || "") === signalId);
    if (bySignal) return bySignal;
  }
  return null;
}
function getModalCurrentVote() {
  if (modalOpenContext?.source === "trades") {
    const entry = findTradeJournalFeedbackEntry();
    return String(entry?.vote || modalCurrentItem?.vote || "");
  }
  return String(modalCurrentItem?.vote || "");
}
function syncVisibleVoteRows(vote = getModalCurrentVote()) {
  try {
    const sid = String(modalOpenContext?.signalId || modalCurrentItem?.id || "");
    const jid = String(modalOpenContext?.journalId || modalCurrentItem?.journal_id || "");
    const rows = [];
    if (sid) rows.push(...document.querySelectorAll(`.row[data-id="${cssEscape(sid)}"]`));
    if (jid) rows.push(...document.querySelectorAll(`.row[data-journal-id="${cssEscape(jid)}"]`));
    [...new Set(rows)].forEach((row) => applyVoteButtonsVisual(row, vote || "", { lock: false }));
  } catch {}
}
function updateModalNavVoteUI() {
  if (!modalNavVoteBar) return;
  if (!modalCurrentItem || !chartModal || chartModal.classList.contains("hidden")) {
    modalNavVoteBar.style.display = "none";
    return;
  }

  modalNavVoteBar.style.display = "inline-flex";

  const source = modalOpenContext?.source === "trades" ? "trades" : "signals";
  const list = getModalNavigationList();
  const idx = getModalCurrentIndex(list);
  const ready = hasResolvedNextArrow(modalCurrentItem);
  const canPrev = ready && idx > 0;
  const canNext = ready && idx >= 0 && idx < list.length - 1;

  [modalPrevItemBtn, modalNextItemBtn].forEach((btn) => {
    if (!btn) return;
    btn.style.display = ready ? "inline-flex" : "none";
    btn.setAttribute("aria-hidden", ready ? "false" : "true");
  });

  if (modalPrevItemBtn) {
    modalPrevItemBtn.disabled = !canPrev;
    modalPrevItemBtn.title = ready
      ? (canPrev ? `Anterior en ${source === "trades" ? "Trades" : "Señales"}` : "No hay anterior")
      : "Disponible cuando NEXT esté resuelto";
  }
  if (modalNextItemBtn) {
    modalNextItemBtn.disabled = !canNext;
    modalNextItemBtn.title = ready
      ? (canNext ? `Siguiente en ${source === "trades" ? "Trades" : "Señales"}` : "No hay siguiente")
      : "Disponible cuando NEXT esté resuelto";
  }

  const vote = getModalCurrentVote();
  [modalLikeBtn, modalDislikeBtn].forEach((btn) => {
    if (!btn) return;
    const selected = String(btn.dataset.v || "") === vote;
    btn.classList.toggle("selected", selected);
    btn.setAttribute("aria-pressed", selected ? "true" : "false");
    btn.title = btn.dataset.v === "like"
      ? (selected ? "Quitar me gusta" : "Me gusta / operación que quiero buscar")
      : (selected ? "Quitar no me gusta" : "No me gusta / operación que quiero evitar");
  });
}
function setModalFeedbackVote(selectedVote = "") {
  if (!modalCurrentItem) return;
  const selected = String(selectedVote || "");
  if (selected !== "like" && selected !== "dislike") return;

  const current = getModalCurrentVote();
  const nextVote = current === selected ? "" : selected;

  modalCurrentItem.vote = nextVote;
  modalCurrentItem.comment = modalCurrentItem.comment || "";

  if (modalOpenContext?.source === "trades") {
    const entry = findTradeJournalFeedbackEntry();
    if (entry) {
      entry.vote = nextVote;
      entry.comment = entry.comment || modalCurrentItem.comment || "";
      entry.feedback_at = Date.now();
      entry.feedback_source = "modal_trades";
      modalCurrentItem.comment = entry.comment || "";
      saveTradesJournal(tradesJournal);
      updateExportTradesButtonUI();
    } else {
      persistRowFeedback(modalCurrentItem, {
        source: "trades",
        signalId: modalOpenContext?.signalId || modalCurrentItem.id || "",
        journalId: modalOpenContext?.journalId || modalCurrentItem.journal_id || "",
      });
    }
  } else {
    const live = modalCurrentItem.id ? findHistoryItemById(String(modalCurrentItem.id)) : null;
    if (live) {
      live.vote = nextVote;
      live.comment = live.comment || modalCurrentItem.comment || "";
      modalCurrentItem = live;
    }
    saveHistory(history);
    updateExportTradesButtonUI();
  }

  syncVisibleVoteRows(nextVote);
  updateModalNavVoteUI();
  toast(nextVote === "like" ? "👍 Me gusta guardado" : nextVote === "dislike" ? "👎 No me gusta guardado" : "Marca quitada", 1200);
}
function navigateModalItem(step = 1) {
  if (!modalCurrentItem || !hasResolvedNextArrow(modalCurrentItem)) return;
  const list = getModalNavigationList();
  const idx = getModalCurrentIndex(list);
  if (idx < 0) return;
  const nextIdx = idx + Number(step || 0);
  if (nextIdx < 0 || nextIdx >= list.length) return;
  const nextItem = list[nextIdx];
  if (!nextItem) return;
  openChartModal(nextItem, {
    source: modalOpenContext?.source === "trades" ? "trades" : "signals",
    signalId: nextItem.id || "",
    journalId: nextItem.journal_id || "",
  });
}

/* =========================
   Chart modal
========================= */
function openChartModal(item, opts = {}) {
  closeModalReplay();
  modalCurrentItem = item;
  modalOpenContext = normalizeModalContext(opts, item);
  if (!chartModal || !modalTitle || !modalSub) return;

  if (modalOpenContext.source === "trades") {
    const entry = findTradeJournalFeedbackEntry();
    if (entry) {
      modalCurrentItem.vote = entry.vote || "";
      modalCurrentItem.comment = entry.comment || "";
      modalCurrentItem.journal_id = entry.journal_id || modalCurrentItem.journal_id || "";
      modalOpenContext.journalId = modalOpenContext.journalId || modalCurrentItem.journal_id || "";
    }
  }

  setCompactModalHeader(modalCurrentItem);

  modalLive = isItemLiveMinute(modalCurrentItem);
  updateModalLiveUI();

  chartModal.classList.remove("hidden");
  chartModal.setAttribute("aria-hidden", "false");

  modalCurrentItem.signalConfirmations ||= [];
  applyModalTradeButtonsLayout();
  setSignalConfirmationControlsVisible(true);
  ensureGiroAprendizajeControls();
  setGiroAprendizajeControlsVisible(true);
  updateSignalConfirmationUI();
  updateGiroAprendizajeControlsUI();
  if (shouldUseAutoHighLowExecution()) ensureSignalAutoPrecalc(modalCurrentItem);
  updateDisciplineLockUI(false);
  updateModalCandleStatusUI();
  updateModalNavVoteUI();
  updateModalChartViewBtnUI();

  requestModalDraw(true);
}
function closeChartModal() {
  closeModalReplay();
  if (!chartModal) return;
  chartModal.classList.add("hidden");
  chartModal.setAttribute("aria-hidden", "true");
  modalCurrentItem = null;
  modalLive = false;
  updateModalLiveUI();
  if (modalCandleStatusEl) modalCandleStatusEl.style.display = "none";
  if (modalNavVoteBar) modalNavVoteBar.style.display = "none";
  setSignalConfirmationControlsVisible(false);
  setGiroAprendizajeControlsVisible(false);
  updateDisciplineLockUI(false);
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
  if (modalReplayState.open) drawModalReplayFrame();
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

if (modalPrevItemBtn) modalPrevItemBtn.onclick = (e) => { e.stopPropagation(); navigateModalItem(-1); };
if (modalNextItemBtn) modalNextItemBtn.onclick = (e) => { e.stopPropagation(); navigateModalItem(1); };
if (modalLikeBtn) modalLikeBtn.onclick = (e) => { e.stopPropagation(); setModalFeedbackVote("like"); };
if (modalDislikeBtn) modalDislikeBtn.onclick = (e) => { e.stopPropagation(); setModalFeedbackVote("dislike"); };

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
  const candleBtn = row.querySelector(".rowCandleBtn");

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

  if (candleBtn) {
    candleBtn.disabled = !ready;
    candleBtn.title = ready ? "Ver mini gráfico de velas de 1 minuto" : "Esperando cierre del minuto…";
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
  if (modalCurrentItem && String(modalCurrentItem.id || "") === String(item.id || "")) {
    modalCurrentItem.nextOutcome = outcome;
    setCompactModalHeader(modalCurrentItem);
    updateSignalConfirmationUI();
    updateModalCandleStatusUI();
    updateModalNavVoteUI();
    requestModalDraw(true);
  }

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
  try { updateExportTradesButtonUI(); } catch {}
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
      giroPolaridad: getSignalLevelMeta(it),
      snrLevel: getSignalLevelMeta(it),
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


function getSignalLifecycleStageInfo(item) {
  if (!item) return { key: "", label: "", title: "" };
  const autoSec = Number(item.signalAutoEntrySec || SIGNAL_AUTO_ENTRY_SEC || 58);
  const preSec = Number(item.signalPrealertAtSec || item?.giroPolaridad?.evalSec || EVAL_SEC || 45);
  const pointsTxt = getSignalConfirmationStatusText(item);
  const hasTrade = hasSignalTradeAssociated(item);
  const attempted = !!item?.signalAutoEntry?.attempted;
  const status = String(item?.signalAutoEntry?.status || "");

  const dynamicMode = isDynamicLineMode(item.mode);

  if (item.minuteComplete) {
    if (hasTrade || attempted) {
      const badge = item?.trade?.badge ? String(item.trade.badge) : status === "sent" ? "TRADE" : "AUTO";
      return {
        key: "trade",
        label: `📌 ${badge}`,
        title: `Operación asociada. No se elimina por filtro de cierre. ${pointsTxt}`,
      };
    }
    if (dynamicMode) {
      const gate = buildSignalDynamicLineEntryGate(item, item.direction || "", 60000);
      return gate?.ok
        ? { key: "closed_line_ok", label: "✅ RESPETA LÍNEA", title: `La vela cerró respetando la línea dinámica. ${pointsTxt}` }
        : { key: "closed_line_break", label: "❌ ROMPE LÍNEA", title: `La vela cerró del lado inválido de la línea dinámica. ${pointsTxt}` };
    }
    const gate = getSignalCloseSNREntryGate(item);
    if (gate?.ok) {
      return {
        key: "closed_ok",
        label: "✅ CERRÓ SNR",
        title: `La vela cerró dentro/cerca del SNR. ${pointsTxt}`,
      };
    }
    return {
      key: "closed_far",
      label: keepClosedAwaySignals || item.keepClosedAwayByUser ? "🧪 FUERA SNR" : "❌ FUERA SNR",
      title: `${keepClosedAwaySignals || item.keepClosedAwayByUser ? "Cierre fuera del SNR/amarilla conservado para testeo." : "Cierre fuera del SNR/amarilla. Si no hay trade, se descarta."} ${pointsTxt}`,
    };
  }

  const ms = getSignalConfirmationMs(item);
  if (ms >= SIGNAL_AUTO_ENTRY_MS) {
    const side = getSignalEnabledTradeSide(item) || item.direction || "";
    const gate = dynamicMode ? buildSignalDynamicLineEntryGate(item, side, SIGNAL_AUTO_ENTRY_MS) : buildSignalSNREntryGate(item, side, SIGNAL_AUTO_SNR_CHECK_MS);
    if (dynamicMode) {
      if (gate?.ok && getSignalEnabledTradeSide(item)) {
        return { key: "auto_ready_line", label: `🟢 AUTO ${autoSec}s`, title: `Listo: ${SIGNAL_AUTO_ENTRY_SEC}s + 4 puntos + línea dinámica respetada. ${pointsTxt}` };
      }
      return { key: "auto_wait_line", label: gate?.ok ? `🟢 LÍNEA ${autoSec}s` : `⛔ LÍNEA ${autoSec}s`, title: `${gate?.message || "Línea dinámica pendiente"}. ${pointsTxt}` };
    }
    if (gate?.ok && getSignalEnabledTradeSide(item)) {
      return {
        key: "auto_ready",
        label: `🟢 AUTO ${autoSec}s`,
        title: `Listo para autoentrada: ${SIGNAL_AUTO_ENTRY_SEC}s + 4 puntos completos + precio dentro de zona azul/amarilla. ${pointsTxt}`,
      };
    }
    if (gate?.ok) {
      return {
        key: "auto_zone",
        label: `🟢 ZONA ${autoSec}s`,
        title: `Precio dentro/cerca del SNR como referencia. Para operar faltan 4 puntos. ${pointsTxt}`,
      };
    }
    return {
      key: "auto_wait",
      label: `🟠 ${autoSec}s`,
      title: `En ${autoSec}s el SNR queda solo como referencia. Para operar importan los 4 puntos. ${pointsTxt}`,
    };
  }

  return {
    key: "prealert",
    label: dynamicMode ? "🟡 PREALERTA LÍNEA" : "🟡 PREALERTA",
    title: dynamicMode
      ? `Prealerta de línea dinámica: revisá si respeta soporte/resistencia. Auto solo en ${autoSec}s con ${SIGNAL_CONFIRM_MIN} puntos netos y línea respetada. ${pointsTxt}`
      : `Prealerta SNR en ${Math.round(preSec)}s: tenés tiempo para analizar. Auto solo en ${autoSec}s con ${SIGNAL_CONFIRM_MIN} puntos netos y precio dentro de zona azul/amarilla. ${pointsTxt}`,
  };
}

function updateRowSignalStageOnRow(row, item) {
  if (!row || !item) return;
  let el = row.querySelector(".signalStageBadge");
  if (!el) return;
  const st = getSignalLifecycleStageInfo(item);
  el.textContent = st.label || "";
  el.title = st.title || "";
  el.dataset.stage = st.key || "";
  el.style.display = st.label ? "inline-flex" : "none";
  el.style.alignItems = "center";
  el.style.justifyContent = "center";
  el.style.marginLeft = "6px";
  el.style.padding = "3px 7px";
  el.style.borderRadius = "999px";
  el.style.fontSize = "10.5px";
  el.style.fontWeight = "950";
  el.style.letterSpacing = ".15px";
  el.style.whiteSpace = "nowrap";
  el.style.border = "1px solid rgba(255,255,255,.14)";
  el.style.background = "rgba(255,255,255,.055)";
  el.style.color = "rgba(255,255,255,.84)";
  if (st.key === "prealert") {
    el.style.borderColor = "rgba(251,191,36,.42)";
    el.style.background = "rgba(251,191,36,.10)";
    el.style.color = "#fef3c7";
  } else if (st.key === "auto_ready" || st.key === "auto_zone" || st.key === "closed_ok") {
    el.style.borderColor = "rgba(34,197,94,.42)";
    el.style.background = "rgba(34,197,94,.10)";
    el.style.color = "#dcfce7";
  } else if (st.key === "auto_wait") {
    el.style.borderColor = "rgba(251,146,60,.40)";
    el.style.background = "rgba(251,146,60,.10)";
    el.style.color = "#ffedd5";
  } else if (st.key === "closed_far") {
    el.style.borderColor = "rgba(239,68,68,.40)";
    el.style.background = "rgba(239,68,68,.10)";
    el.style.color = "#fee2e2";
  } else if (st.key === "trade") {
    el.style.borderColor = "rgba(56,189,248,.42)";
    el.style.background = "rgba(56,189,248,.10)";
    el.style.color = "#e0f2fe";
  }
}

function refreshOpenSignalStageBadges() {
  if (!signalsEl) return;
  const liveMinute = currentServerMinute();
  const rows = signalsEl.querySelectorAll(".row[data-id]");
  rows.forEach((row) => {
    const id = String(row.dataset.id || "");
    const item = findHistoryItemById(id);
    if (!item) return;
    if (item.minute === liveMinute || !item.minuteComplete || item.signalAutoEntry || item.trade) {
      updateRowSignalStageOnRow(row, item);
    }
  });
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
  // En Señales también se puede destildar/cambiar 👍 👎. Solo se bloquea si una llamada futura pide voteLocked explícito.
  const voteIsLocked = !!opts.voteLocked && !!item.vote && !opts.allowVoteChange;
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
      <span class="signalStageBadge" title=""></span>
      <button class="chartBtn" type="button"></button>
      <button class="rowCandleBtn" type="button" title="Ver mini gráfico de velas 1m">🕯️</button>
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
    if (canOpen) {
      modalChartView = "line";
      openChartModal(target, { source: opts.source === "trades" ? "trades" : "signals", signalId: opts.signalId || item.id || target.id || "", journalId: opts.journalId || item.journal_id || target.journal_id || "" });
    }
  };

  const rowCandleBtn = row.querySelector(".rowCandleBtn");
  if (rowCandleBtn) {
    rowCandleBtn.onclick = (e) => {
      e.stopPropagation();

      let target = item;
      if (opts.source === "trades" && opts.signalId) {
        const real = findHistoryItemById(String(opts.signalId));
        if (real) target = real;
      }

      const canOpen = target.minuteComplete || isItemLiveMinute(target);
      if (canOpen) {
        modalChartView = "candles1m";
        openChartModal(target, { source: opts.source === "trades" ? "trades" : "signals", signalId: opts.signalId || item.id || target.id || "", journalId: opts.journalId || item.journal_id || target.journal_id || "" });
      }
    };
  }

  updateRowChartBtnOnRow(row, item);
  updateRowTradeBadgeOnRow(row, item);
  updateRowNextArrowOnRow(row, item);
  updateRowSignalStageOnRow(row, item);

  // acciones: señales + Trades de estudio
  if (!opts.hideActions) {
    applyVoteButtonsVisual(row, item.vote || "", { lock: voteIsLocked });

    row.querySelectorAll("button[data-v]").forEach((btn) => {
      btn.onclick = (e) => {
        e.stopPropagation();

        const selectedVote = String(btn.dataset.v || "");
        if (voteIsLocked) return;

        // En Señales y Trades: si tocás el mismo voto otra vez, se destilda.
        // Si tocás el contrario, cambia la marca.
        item.vote = item.vote === selectedVote ? "" : selectedVote;
        item.comment = row.querySelector(".row-comment")?.value || "";

        applyVoteButtonsVisual(row, item.vote || "", { lock: voteIsLocked });
        persistRowFeedback(item, opts, row);

        const txt = item.vote === "like" ? "👍 Me gusta guardado" : item.vote === "dislike" ? "👎 No me gusta guardado" : "Marca quitada";
        toast(txt, 1200);
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
  let raw = null;
  try {
    raw = localStorage.getItem(getScopedTradeStakeKey());
    // Migración suave: si no existe stake específico y estás en DEMO, usa el viejo.
    if (raw === null && getCurrentAccountScope() === ACCOUNT_MODE_DEMO) raw = localStorage.getItem(TRADE_STAKE_KEY);
  } catch {}
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_STAKE;
}
function setTradeStake(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return false;
  try {
    localStorage.setItem(getScopedTradeStakeKey(), String(v));
    return true;
  } catch {
    return false;
  }
}
function clearTradeStake() {
  try {
    localStorage.removeItem(getScopedTradeStakeKey());
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
      const outcomeExtra = {
        profit: Number(poc.profit),
        status: String(poc.status || ""),
        sold_time: Number(poc.sell_time || 0),
        contract_id: cid,
        outcome_source: sourceLabel,
        ...compactAuditFields(extractContractAuditFields(poc)),
      };
      const it = signalId ? findHistoryItemById(signalId) : null;
      if (it) {
        setTradeBadge(it, isWin ? "ITM" : "OTM", outcomeExtra);
      } else {
        // Salvavidas: si la señal fue purgada o no está en Signals, actualizamos el trade en Journal por contract_id.
        const idx = tradesJournal.findIndex((x) => String(x?.trade?.contract_id || "") === cid);
        if (idx >= 0) {
          tradesJournal[idx].trade ||= {};
          tradesJournal[idx].trade.badge = isWin ? "ITM" : "OTM";
          Object.assign(tradesJournal[idx].trade, outcomeExtra);
          tradesJournal[idx].saved_at = Date.now();
          saveTradesJournal(tradesJournal);
          try { if ((localStorage.getItem("activeView") || "signals") === "trades") renderTradesView(); } catch {}
        }
      }
    } catch {}

    applyDisciplineOutcome(isWin);
    handleC100ContractClosed(cid, isWin, profit);
    if (!isWin) startMentalCooldownAfterOtm(cid, `OTM ${String(poc?.underlying || poc?.display_name || "").trim() || "registrada"}`);
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
      try {
        const auth = res?.authorize || {};
        const b = Number(auth.balance);
        if (Number.isFinite(b)) setCachedAccountBalance(b, auth.currency || DEFAULT_CURRENCY);
      } catch {}
      isAuthorized = true;
      return true;
    })
    .finally(() => {
      authorizeInFlight = null;
    });

  return authorizeInFlight;
}

function assertCanTrade() {
  updateMentalCooldownUI();
  if (isMentalCooldownActive()) {
    throw new Error(`Despeje mental activo (${fmtMentalCooldownRemaining(getMentalCooldownRemainingMs())})`);
  }
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
  // V46: en SNR/SNR polaridad, la operación se permite por 4 puntos + AUTO 58.
  // El cierre final fuera de SNR y la distancia al SNR quedan registrados, pero no bloquean.
  // En Línea dinámica se mantiene su validación específica.
  const snrEntryGate = assertSignalSNREntryGateAt57(side, itemCtx);
  assertC100CanTrade();

  if (tradeInFlight) throw new Error("Operación en curso");
  tradeInFlight = true;

  try {
    await ensureAuthorized();
    try { await refreshAccountBalance({ force: true }); } catch {}
    startNewDisciplineWindowIfNeeded();

    const symbol =
      symbolOverride || (itemCtx && itemCtx.symbol) || (modalCurrentItem && modalCurrentItem.symbol) || (history.at(-1)?.symbol || "R_25");
    const stake = Number(getEffectiveTradeStake().toFixed(2));
    let res = null;
    let contractLabel = side;
    let tradeExtra = { side, symbol, stake, ...getC100TradeAuditExtra(stake) };
    const autoPreProposal = isNextCandleExpiryTiming() && !shouldUseAutoHighLowExecution()
      ? getValidAutoPreProposal(itemCtx, side, symbol, stake)
      : null;
    const isStrictAutoPrearmedEntry = !!(isNextCandleExpiryTiming() && !shouldUseAutoHighLowExecution() && itemCtx?.signalAutoEntry?.attempted);
    if (snrEntryGate) tradeExtra.entry_gate = snrEntryGate;
    if (snrEntryGate && snrEntryGate.reason && String(snrEntryGate.reason).includes("linea")) tradeExtra.dynamic_line_gate = snrEntryGate;
    else if (snrEntryGate) tradeExtra.snr_entry_gate = snrEntryGate;

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
      // V66: si es AUTO post-58 con cierre 60, la proposal debe estar prearmada desde 56-58s.
      // Así en el post-58 solo enviamos buy(proposal_id), sin gastar tiempo pidiendo proposal.
      let proposalId = "";
      let askPrice = NaN;
      let payout = NaN;
      let profitPct = NaN;
      let timing = null;
      let usedPreProposal = false;

      if (autoPreProposal) {
        proposalId = String(autoPreProposal.proposal_id || "");
        askPrice = Number(autoPreProposal.ask_price);
        payout = Number(autoPreProposal.payout);
        profitPct = Number(autoPreProposal.profit_pct);
        timing = autoPreProposal.timing || null;
        usedPreProposal = true;
      } else {
        if (isStrictAutoPrearmedEntry) {
          throw new Error("AUTO post-58 cancelado: la proposal no estaba prearmada antes de 58s.");
        }
        const proposalPack = await requestRiseFallProposalWithTiming(side, symbol, stake, itemCtx, 12000);
        const proposal = proposalPack?.res?.proposal;
        proposalId = proposal?.id ? String(proposal.id) : "";
        askPrice = Number(proposal?.ask_price);
        payout = Number(proposal?.payout);
        profitPct = ((payout - askPrice) / askPrice) * 100;
        timing = proposalPack.timing;
      }

      if (!proposalId || !Number.isFinite(askPrice) || askPrice <= 0 || !Number.isFinite(payout)) {
        throw new Error("Deriv no confirmó proposal válida para IC2.");
      }
      assertC100PayoutOK(profitPct);

      res = await wsRequest({ buy: proposalId, price: askPrice }, 20000);
      tradeExtra = {
        ...tradeExtra,
        exec_mode: usedPreProposal ? "IC2_RISE_FALL_PREPROPOSAL" : "IC2_RISE_FALL_PROPOSAL",
        contract_type: side,
        payout_pct: Number(profitPct),
        proposal_id: proposalId,
        ic2_enabled: true,
        ic2_mode: C100_MODE_LABEL,
        ic2_level: c100State?.level || null,
        ic2_step: c100State?.compoundStep || 0,
        entry_preproposal_used: !!usedPreProposal,
        entry_preproposal_prepared_ms: usedPreProposal ? Math.round(Number(autoPreProposal.prepared_ms || 0)) : null,
        entry_preproposal_age_ms: usedPreProposal ? Math.max(0, Date.now() - Number(autoPreProposal.prepared_at || Date.now())) : null,
        entry_preproposal_reason: usedPreProposal ? String(autoPreProposal.reason || "") : "",
        ...getRiseFallTimingExtra(timing),
      };
    } else {
      if (autoPreProposal) {
        res = await wsRequest({ buy: autoPreProposal.proposal_id, price: Number(autoPreProposal.ask_price) }, 20000);
        tradeExtra = {
          ...tradeExtra,
          exec_mode: "RISE_FALL_PREPROPOSAL",
          contract_type: side,
          payout_pct: Number(autoPreProposal.profit_pct),
          proposal_id: String(autoPreProposal.proposal_id || ""),
          entry_preproposal_used: true,
          entry_preproposal_prepared_ms: Math.round(Number(autoPreProposal.prepared_ms || 0)),
          entry_preproposal_age_ms: Math.max(0, Date.now() - Number(autoPreProposal.prepared_at || Date.now())),
          entry_preproposal_reason: String(autoPreProposal.reason || ""),
          ...getRiseFallTimingExtra(autoPreProposal.timing),
        };
      } else {
        if (isStrictAutoPrearmedEntry) {
          throw new Error("AUTO post-58 cancelado: la proposal no estaba prearmada antes de 58s.");
        }
        const buyPack = await buyRiseFallDirectWithTiming(side, symbol, stake, itemCtx, 20000);
        res = buyPack.res;
        tradeExtra = {
          ...tradeExtra,
          exec_mode: "RISE_FALL_BUY",
          contract_type: side,
          entry_preproposal_used: false,
          ...getRiseFallTimingExtra(buyPack.timing),
        };
      }
    }

    if (res?.error) throw new Error(res.error.message || "buy error");
    if (!res?.buy) throw new Error("buy: respuesta inválida (sin buy)");

    const cid = res?.buy?.contract_id;
    if (!cid) throw new Error("buy ok pero sin contract_id (no puedo trackear ITM/OTM)");

    try {
      Object.assign(tradeExtra, compactAuditFields(extractContractAuditFields(res?.buy || {})));
      if (!tradeExtra.purchase_time) tradeExtra.purchase_time = Math.floor(serverNowMs() / 1000);
      if (itemCtx?.signalAutoEntry?.post58_readiness) {
        tradeExtra.entry_trigger_mode = isNextCandleExpiryTiming() ? "PREPROPOSAL_POST_TICK_58" : "AUTO58_NORMAL";
        tradeExtra.entry_trigger_ms = Math.round(Number(itemCtx.signalAutoEntry.post58_readiness.ms || 0));
        tradeExtra.entry_trigger_last_tick_ms = Math.round(Number(itemCtx.signalAutoEntry.post58_readiness.lastTickMs || 0));
        tradeExtra.entry_trigger_reason = String(itemCtx.signalAutoEntry.post58_readiness.reason || "");
      }
    } catch {}

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
      void ensureAuthorized().then(() => refreshAccountBalance({ force: true })).then(() => updateC100PanelUI()).catch(() => {});
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
      purgeClosedSignalsOutsideSNRCloseZone("rehydrate_minute_complete");
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
    purgeClosedSignalsOutsideSNRCloseZone("finalize_minute_complete");

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

  if ((localStorage.getItem("activeView") || "signals") === "live" && symbol === liveReplaySymbol) {
    requestLiveReplayDraw(false);
  }

  if (history && history.length) {
    const tail = history.slice(-12);
    for (const it of tail) updateRowChartBtn(it);
  }

  // ✅ FIX AUTO 58: también revisar en cada tick, salvo cuando el análisis está pausado
  // o la pestaña En vivo está activa (modo aparte).
  if (!areSignalsPaused()) scanSignalAutoEntriesAt57();

  if (!areSignalsPaused()) {
    const activeModeForTick = normalizeSignalMode(signalMode);

    if (isRupturaDebilGiroMode(activeModeForTick)) {
      // V76 Ruptura Débil Giro:
      // Solo velas alcistas y solo busca arranque irregular temprano.
      // No depende del selector 35/40/45. Escanea desde el inicio operativo hasta 30s.
      // La operación no sale sola por radar: requiere 4 puntos manuales como el resto.
      const ruptureStartSec = 8;
      const ruptureEndSec = 30;
      if (sec >= ruptureStartSec && sec <= ruptureEndSec && lastEvaluatedMinute !== minute) {
        const ok = evaluateMinute(minute, {
          evalMs: Math.max(ruptureStartSec * 1000, Math.min(msInMinute, ruptureEndSec * 1000)),
          evalSec: sec,
          radar: true,
          radarStartSec: ruptureStartSec,
          radarEndSec: ruptureEndSec,
        });
        if (ok) lastEvaluatedMinute = minute;
      } else if (sec > ruptureEndSec && lastEvaluatedMinute !== minute) {
        lastEvaluatedMinute = minute;
      }
    } else if (isDynamicLineMode(activeModeForTick)) {
      // Línea dinámica queda igual: evalúa una sola vez en el segundo elegido.
      if (sec >= EVAL_SEC && lastEvaluatedMinute !== minute) {
        lastEvaluatedMinute = minute;
        const ok = evaluateMinute(minute, {
          evalMs: Math.max(1000, Number(EVAL_SEC || 45) * 1000),
          evalSec: Number(EVAL_SEC || 45),
          radar: false,
        });

        if (!ok && signalMode === MODE_NORMAL) scheduleRetry(minute);
      }
    } else {
      // V38 SNR RADAR:
      // En SNR ya no evalúa solo en un segundo exacto.
      // Desde 35s hasta el segundo elegido escanea en cada tick.
      // Si encuentra interacción válida con el SNR, crea la prealerta y deja de escanear esa vela.
      const radarStartSec = SNR_RADAR_START_SEC;
      const radarEndSec = Math.max(radarStartSec, Math.min(45, Number(EVAL_SEC || 40)));

      if (sec >= radarStartSec && sec <= radarEndSec && lastEvaluatedMinute !== minute) {
        const ok = evaluateMinute(minute, {
          evalMs: Math.max(radarStartSec * 1000, Math.min(msInMinute, radarEndSec * 1000)),
          evalSec: sec,
          radar: true,
          radarStartSec,
          radarEndSec,
        });
        if (ok) lastEvaluatedMinute = minute;
      } else if (sec > radarEndSec && lastEvaluatedMinute !== minute) {
        // Se terminó la ventana de radar sin señal. No volver a evaluar esta vela.
        lastEvaluatedMinute = minute;
      }
    }
  }
}
function scheduleRetry(minute) {
  if (evalRetryTimer) clearTimeout(evalRetryTimer);
  evalRetryTimer = setTimeout(() => {
    if (areSignalsPaused()) return;
    if (Math.floor(Date.now() / 60000) === minute) evaluateMinute(minute, { evalMs: Math.max(1000, Number(EVAL_SEC || 45) * 1000), evalSec: Number(EVAL_SEC || 45), radar: false });
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
function getGiroSNRBodyTolerance(symbol, currentRange = 0) {
  const candles = getGiroPolarityCandles(symbol, null, 70);
  const bodies = candles
    .map((c) => Math.abs(Number(c.close) - Number(c.open)))
    .filter((x) => Number.isFinite(x) && x > 0);
  const closes = candles
    .map((c) => Number(c.close))
    .filter(Number.isFinite);
  const steps = [];
  for (let i = 1; i < closes.length; i++) {
    const d = Math.abs(closes[i] - closes[i - 1]);
    if (Number.isFinite(d) && d > 0) steps.push(d);
  }
  const avgBody = bodies.length
    ? bodies.reduce((a, b) => a + b, 0) / bodies.length
    : Math.max(Math.abs(Number(currentRange || 0)) * 0.18, 1e-9);
  const avgStep = steps.length
    ? steps.reduce((a, b) => a + b, 0) / steps.length
    : avgBody;

  // V21: tolerancia un poco más fina. El nivel se arma por CIERRES con reacción,
  // no por todo el cuerpo de la vela. Por eso no necesitamos una banda tan grande.
  return Math.max(avgBody * 0.38, avgStep * 0.92, Math.abs(Number(currentRange || 0)) * 0.024, 1e-9);
}
function getArrayPercentileValue(src, pct = 0.5) {
  const arr = (src || []).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (!arr.length) return null;
  const p = Math.max(0, Math.min(1, Number(pct || 0)));
  const idx = (arr.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return arr[lo];
  const t = idx - lo;
  return arr[lo] * (1 - t) + arr[hi] * t;
}
function getGiroSNRCloseReactionRawLevels(candles, currentRange, tolerance) {
  const out = [];
  const src = (candles || []).filter((c) => c && [c.open, c.high, c.low, c.close].map(Number).every(Number.isFinite));
  if (src.length < 4) return out;

  const reactionMin = Math.max(Number(tolerance || 0) * 0.78, Math.abs(Number(currentRange || 0)) * 0.040, 1e-9);
  const lookAhead = 4;

  for (let i = 0; i < src.length - 1; i++) {
    const c = src[i];
    const close = Number(c.close);
    const open = Number(c.open);
    if (![open, close].every(Number.isFinite)) continue;

    const future = src.slice(i + 1, Math.min(src.length, i + 1 + lookAhead));
    if (!future.length) continue;

    const futureHigh = Math.max(...future.map((x) => Number(x.high)).filter(Number.isFinite));
    const futureLow = Math.min(...future.map((x) => Number(x.low)).filter(Number.isFinite));
    const futureCloseHigh = Math.max(...future.map((x) => Number(x.close)).filter(Number.isFinite));
    const futureCloseLow = Math.min(...future.map((x) => Number(x.close)).filter(Number.isFinite));
    if (![futureHigh, futureLow, futureCloseHigh, futureCloseLow].every(Number.isFinite)) continue;

    const pureDownMove = Math.max(0, close - futureLow, close - futureCloseLow);
    const pureUpMove = Math.max(0, futureHigh - close, futureCloseHigh - close);

    const body = Math.abs(close - open);
    const bodyPenalty = body > reactionMin * 1.9 ? 0.90 : 1;

    // Si desde ese cierre el precio reacciona hacia abajo, ese cierre cuenta como resistencia.
    if (pureDownMove >= reactionMin && pureDownMove >= pureUpMove * 0.58) {
      out.push({
        price: close,
        type: "resistance",
        minute: Number(c.minute),
        reactionMove: pureDownMove,
        reactionScore: Math.max(0.01, (pureDownMove / reactionMin) * bodyPenalty),
        source: "close_reaction_down",
      });
    }

    // Si desde ese cierre el precio reacciona hacia arriba, ese cierre cuenta como soporte.
    if (pureUpMove >= reactionMin && pureUpMove >= pureDownMove * 0.58) {
      out.push({
        price: close,
        type: "support",
        minute: Number(c.minute),
        reactionMove: pureUpMove,
        reactionScore: Math.max(0.01, (pureUpMove / reactionMin) * bodyPenalty),
        source: "close_reaction_up",
      });
    }
  }
  return out;
}
function clusterGiroSNRBodyLevels(rawLevels, tolerance) {
  const clusters = [];
  for (const type of ["resistance", "support"]) {
    const sorted = (rawLevels || [])
      .filter((x) => x && x.type === type && Number.isFinite(Number(x.price)))
      .map((x) => ({
        ...x,
        price: Number(x.price),
        minute: Number(x.minute || 0),
        reactionScore: Number.isFinite(Number(x.reactionScore)) ? Number(x.reactionScore) : 1,
        reactionMove: Number.isFinite(Number(x.reactionMove)) ? Number(x.reactionMove) : 0,
      }))
      .sort((a, b) => Number(a.price) - Number(b.price));

    for (const lvl of sorted) {
      const price = Number(lvl.price);
      const weight = Math.max(0.25, Math.min(3.5, Number(lvl.reactionScore || 1)));
      const sameType = clusters.filter((x) => x.originalType === type);
      const last = sameType[sameType.length - 1];
      if (!last || Math.abs(price - last.price) > tolerance) {
        clusters.push({
          price,
          weightedPriceSum: price * weight,
          weightSum: weight,
          originalType: type,
          type,
          touches: 1,
          minutes: [Number(lvl.minute || 0)],
          firstMinute: Number(lvl.minute || 0),
          lastTouchMinute: Number(lvl.minute || 0),
          zoneLow: price,
          zoneHigh: price,
          rawPrices: [price],
          reactionSum: Number(lvl.reactionScore || 1),
          reactionMax: Number(lvl.reactionScore || 1),
          reactionMoveMax: Number(lvl.reactionMove || 0),
        });
      } else {
        last.weightedPriceSum += price * weight;
        last.weightSum += weight;
        last.price = last.weightedPriceSum / Math.max(last.weightSum, 1e-9);
        last.touches += 1;
        last.minutes.push(Number(lvl.minute || 0));
        last.firstMinute = Math.min(last.firstMinute, Number(lvl.minute || 0));
        last.lastTouchMinute = Math.max(last.lastTouchMinute, Number(lvl.minute || 0));
        last.zoneLow = Math.min(Number(last.zoneLow), price);
        last.zoneHigh = Math.max(Number(last.zoneHigh), price);
        last.rawPrices.push(price);
        last.reactionSum += Number(lvl.reactionScore || 1);
        last.reactionMax = Math.max(Number(last.reactionMax || 0), Number(lvl.reactionScore || 1));
        last.reactionMoveMax = Math.max(Number(last.reactionMoveMax || 0), Number(lvl.reactionMove || 0));
      }
    }
  }

  for (const cluster of clusters) {
    const prices = (cluster.rawPrices || []).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
    const median = getArrayPercentileValue(prices, 0.50);
    let coreLow = prices.length >= 3 ? getArrayPercentileValue(prices, 0.25) : getArrayPercentileValue(prices, 0.00);
    let coreHigh = prices.length >= 3 ? getArrayPercentileValue(prices, 0.75) : getArrayPercentileValue(prices, 1.00);
    if (!Number.isFinite(coreLow)) coreLow = Number(cluster.zoneLow);
    if (!Number.isFinite(coreHigh)) coreHigh = Number(cluster.zoneHigh);
    if (Number.isFinite(median)) cluster.price = median;
    cluster.coreLow = Math.min(coreLow, coreHigh);
    cluster.coreHigh = Math.max(coreLow, coreHigh);
    cluster.zoneLow = cluster.coreLow;
    cluster.zoneHigh = cluster.coreHigh;
    cluster.zoneSpan = Math.max(0, Number(cluster.zoneHigh) - Number(cluster.zoneLow));
    cluster.uniqueMinutes = new Set((cluster.minutes || []).map(Number).filter(Number.isFinite)).size;
    cluster.reactionScore = Number(cluster.reactionSum || 0) / Math.max(1, Number(cluster.touches || 0));
    cluster.compactness = Math.max(0, 1 - cluster.zoneSpan / Math.max(tolerance * 1.75, 1e-9));
  }
  return clusters.sort((a, b) => Number(a.price) - Number(b.price));
}
const SNR_EFFECTIVENESS_MIN_RATIO = 0.70;
const SNR_EFFECTIVENESS_MIN_TESTS = 3;
const SNR_RECENT_EFFECTIVENESS_MIN_RATIO = 0.70;
const SNR_RECENT_EFFECTIVENESS_MIN_TESTS = 3;
const SNR_RECENT_EFFECTIVENESS_MAX_TESTS = 5;
const SNR_REVIEW_CONSECUTIVE_RECENT_FAILS = 2;
const SNR_MAX_CONSECUTIVE_RECENT_FAILS = 3;

function buildSNRRecentEffectivenessAudit(tests) {
  const src = (tests || [])
    .filter((x) => x && Number.isFinite(Number(x.minute)))
    .sort((a, b) => Number(a.minute || 0) - Number(b.minute || 0));
  const recent = src.slice(-SNR_RECENT_EFFECTIVENESS_MAX_TESTS);
  const recentTotal = recent.length;
  const recentWins = recent.filter((x) => !!x.success).length;
  const recentFails = Math.max(0, recentTotal - recentWins);
  const recentRatio = recentTotal > 0 ? recentWins / recentTotal : 0;

  let consecutiveRecentFails = 0;
  for (let i = src.length - 1; i >= 0; i--) {
    if (src[i]?.success) break;
    consecutiveRecentFails += 1;
  }

  const recentOk = recentTotal < SNR_RECENT_EFFECTIVENESS_MIN_TESTS || recentRatio >= SNR_RECENT_EFFECTIVENESS_MIN_RATIO;
  const consecutiveFailsOk = consecutiveRecentFails < SNR_MAX_CONSECUTIVE_RECENT_FAILS;

  return {
    recentTests: recent,
    recentTotal,
    recentWins,
    recentFails,
    recentRatio,
    recentPct: Math.round(recentRatio * 100),
    consecutiveRecentFails,
    reviewNeeded: consecutiveRecentFails >= SNR_REVIEW_CONSECUTIVE_RECENT_FAILS,
    recentOk,
    consecutiveFailsOk,
    ok: recentOk && consecutiveFailsOk,
  };
}

function getSignalSNRRoleHardBreakInfo(meta, ticks, checkMs = 60000) {
  const m = meta || {};
  const currentRole = String(m.currentRole || m.levelType || "").toLowerCase();
  if (!["support", "resistance"].includes(currentRole)) return null;

  let zoneLow = Number(m.zoneLow);
  let zoneHigh = Number(m.zoneHigh);
  const level = Number(m.level);
  const tol = Math.max(Number(m.tolerance || 0), 1e-9);
  const zoneSize = Number(m.zone);

  if (!Number.isFinite(zoneLow) || !Number.isFinite(zoneHigh)) {
    const bodyLow = Number(m.bodyZoneLow);
    const bodyHigh = Number(m.bodyZoneHigh);
    if (Number.isFinite(bodyLow) && Number.isFinite(bodyHigh)) {
      zoneLow = Math.min(bodyLow, bodyHigh);
      zoneHigh = Math.max(bodyLow, bodyHigh);
    } else if (Number.isFinite(level)) {
      const fallback = Math.max(tol * 0.50, Number.isFinite(zoneSize) ? zoneSize * 0.50 : 0, Math.abs(level) * 0.000001, 1e-9);
      zoneLow = level - fallback;
      zoneHigh = level + fallback;
    }
  }
  if (![zoneLow, zoneHigh].every(Number.isFinite)) return null;
  {
    const a = zoneLow;
    const b = zoneHigh;
    zoneLow = Math.min(a, b);
    zoneHigh = Math.max(a, b);
  }

  const pts = (ticks || [])
    .map((p) => ({ ms: Number(p?.ms), quote: Number(p?.quote) }))
    .filter((p) => Number.isFinite(p.ms) && Number.isFinite(p.quote) && p.ms <= checkMs)
    .sort((a, b) => a.ms - b.ms);
  if (pts.length < 2) return null;

  const values = pts.map((p) => Number(p.quote)).filter(Number.isFinite);
  if (!values.length) return null;
  const high = Math.max(...values);
  const low = Math.min(...values);
  const range = Math.max(high - low, Math.abs(Number(level || values[0] || 0)) * 0.000001, 1e-9);
  const zoneWidth = Math.max(zoneHigh - zoneLow, tol * 0.45, 1e-9);
  const hardBreak = Math.max(tol * 0.80, zoneWidth * 0.80, range * 0.13, 1e-9);

  const breakDistance = currentRole === "resistance" ? Math.max(0, high - zoneHigh) : Math.max(0, zoneLow - low);
  const broken = breakDistance > hardBreak;
  const breakQuote = currentRole === "resistance" ? high : low;

  return {
    broken,
    currentRole,
    checkMs,
    zoneLow,
    zoneHigh,
    tolerance: tol,
    hardBreak,
    breakDistance,
    breakQuote,
    high,
    low,
    reason: broken ? "snr_role_broken_intracandle" : "snr_role_respected_intracandle",
  };
}

function getGiroSNREffectivenessTests(candles, role, zoneLow, zoneHigh, tolerance, currentRange) {
  const out = [];
  const src = (candles || [])
    .filter((c) => c && [c.open, c.high, c.low, c.close].map(Number).every(Number.isFinite))
    .sort((a, b) => Number(a.minute || 0) - Number(b.minute || 0));
  if (src.length < 5) return out;

  const zLow = Math.min(Number(zoneLow), Number(zoneHigh));
  const zHigh = Math.max(Number(zoneLow), Number(zoneHigh));
  if (![zLow, zHigh].every(Number.isFinite)) return out;

  const isSupport = role === "support";
  const reactionNeed = Math.max(Number(tolerance || 0) * 0.55, Math.abs(Number(currentRange || 0)) * 0.030, 1e-9);
  const lookAhead = 3;

  for (let i = 0; i < src.length - 1; i++) {
    const c = src[i];
    const close = Number(c.close);
    if (!Number.isFinite(close) || close < zLow || close > zHigh) continue;

    const future = src.slice(i + 1, Math.min(src.length, i + 1 + lookAhead));
    if (!future.length) continue;
    const futureHigh = Math.max(...future.map((x) => Number(x.high)).filter(Number.isFinite));
    const futureLow = Math.min(...future.map((x) => Number(x.low)).filter(Number.isFinite));
    const futureClose = Number(future[future.length - 1]?.close);
    if (![futureHigh, futureLow, futureClose].every(Number.isFinite)) continue;

    const goodMove = isSupport
      ? Math.max(0, futureHigh - close, futureClose - close)
      : Math.max(0, close - futureLow, close - futureClose);
    const badMove = isSupport
      ? Math.max(0, close - futureLow, close - futureClose)
      : Math.max(0, futureHigh - close, futureClose - close);

    // Si cierra en el nivel y no gira, cuenta como fallo. No se permite “decorar”
    // un SNR con cierres que lo atraviesan o no reaccionan.
    const success = goodMove >= reactionNeed && goodMove >= badMove * 0.75;
    out.push({
      minute: Number(c.minute || 0),
      close,
      success,
      goodMove,
      badMove,
      reactionNeed,
    });
  }
  return out;
}

function scoreGiroSNREffectiveness(candles, role, zoneLow, zoneHigh, tolerance, currentRange) {
  const tests = getGiroSNREffectivenessTests(candles, role, zoneLow, zoneHigh, tolerance, currentRange);
  const total = tests.length;
  const wins = tests.filter((x) => x.success).length;
  const ratio = total > 0 ? wins / total : 0;
  const lastTestMinute = tests.reduce((m, x) => Math.max(m, Number(x.minute || 0)), 0);
  const audit = buildSNRRecentEffectivenessAudit(tests);
  return {
    tests,
    total,
    wins,
    fails: Math.max(0, total - wins),
    ratio,
    pct: Math.round(ratio * 100),
    lastTestMinute,
    recentTests: audit.recentTests,
    recentTotal: audit.recentTotal,
    recentWins: audit.recentWins,
    recentFails: audit.recentFails,
    recentRatio: audit.recentRatio,
    recentPct: audit.recentPct,
    consecutiveRecentFails: audit.consecutiveRecentFails,
    reviewNeeded: audit.reviewNeeded,
    recentOk: audit.recentOk,
    consecutiveFailsOk: audit.consecutiveFailsOk,
    ok: total >= SNR_EFFECTIVENESS_MIN_TESTS && ratio >= SNR_EFFECTIVENESS_MIN_RATIO && audit.ok,
  };
}

function adjustGiroSNRZoneToEffectiveCloses(candles, role, center, coreLow, coreHigh, tolerance, currentRange) {
  const tol = Math.max(Number(tolerance || 0), 1e-9);
  let zLow = Math.min(Number(coreLow), Number(coreHigh));
  let zHigh = Math.max(Number(coreLow), Number(coreHigh));
  const baseCenter = Number(center);
  if (![zLow, zHigh, baseCenter].every(Number.isFinite)) {
    zLow = baseCenter - tol * 0.35;
    zHigh = baseCenter + tol * 0.35;
  }

  let best = {
    zoneLow: zLow,
    zoneHigh: zHigh,
    adjusted: false,
    effectiveness: scoreGiroSNREffectiveness(candles, role, zLow, zHigh, tol, currentRange),
  };

  // Si la zona actual no llega a 70%, se recalibra alrededor de los cierres que sí
  // respetaron el nivel. Esto evita mantener un SNR viejo cuando los cierres actuales
  // dejaron de girar desde ahí.
  if (best.effectiveness.ok && !best.effectiveness.reviewNeeded) return best;

  const expandedLow = baseCenter - tol * 1.25;
  const expandedHigh = baseCenter + tol * 1.25;
  const broadTests = getGiroSNREffectivenessTests(candles, role, expandedLow, expandedHigh, tol, currentRange);
  const successfulCloses = broadTests
    .filter((x) => x.success && Number.isFinite(Number(x.close)))
    .map((x) => Number(x.close))
    .sort((a, b) => a - b);

  if (successfulCloses.length >= 2) {
    const median = getArrayPercentileValue(successfulCloses, 0.50);
    const q1 = getArrayPercentileValue(successfulCloses, 0.25);
    const q3 = getArrayPercentileValue(successfulCloses, 0.75);
    const successfulSpan = Math.max(0, Number(q3) - Number(q1));
    const width = Math.max(successfulSpan + tol * 0.18, tol * 0.42, Math.abs(Number(currentRange || 0)) * 0.016, 1e-9);
    const newLow = Number(median) - width / 2;
    const newHigh = Number(median) + width / 2;
    const eff = scoreGiroSNREffectiveness(candles, role, newLow, newHigh, tol, currentRange);
    const candidate = { zoneLow: newLow, zoneHigh: newHigh, adjusted: true, effectiveness: eff };
    if (
      (candidate.effectiveness.ok && !best.effectiveness.ok) ||
      Number(candidate.effectiveness.ratio || 0) > Number(best.effectiveness.ratio || 0) ||
      (Number(candidate.effectiveness.ratio || 0) === Number(best.effectiveness.ratio || 0) && Number(candidate.effectiveness.total || 0) > Number(best.effectiveness.total || 0))
    ) {
      best = candidate;
    }
  }

  return best;
}

function buildGiroSNRBodyCandidateLevelsForCandles(symbol, candles, currentRange, lookbackLabel = "") {
  if (!candles.length) return [];
  const tol = getGiroSNRBodyTolerance(symbol, currentRange);

  // Niveles SNR por cierres + reacción posterior, pero ahora con auditoría:
  // solo sobreviven si al menos el 70% de los cierres que caen en la zona giran.
  const raw = getGiroSNRCloseReactionRawLevels(candles, currentRange, tol);
  const clusters = clusterGiroSNRBodyLevels(raw, tol * 0.82);

  const out = [];
  for (const cluster of clusters) {
    const touches = Number(cluster.touches || 0);
    const uniqueMinutes = Number(cluster.uniqueMinutes || 0);
    const reactionScore = Number(cluster.reactionScore || 0);
    let coreLow = Number(cluster.zoneLow);
    let coreHigh = Number(cluster.zoneHigh);
    let center = Number(cluster.price);
    if (![coreLow, coreHigh, center].every(Number.isFinite)) continue;
    {
      const cLow = coreLow;
      const cHigh = coreHigh;
      coreLow = Math.min(cLow, cHigh);
      coreHigh = Math.max(cLow, cHigh);
    }
    let closeBand = Math.max(0, coreHigh - coreLow);

    if (uniqueMinutes < 2 || touches < 2) continue;
    if (touches < 3 && reactionScore < 1.75) continue;

    const maxCloseBand = Math.max(tol * 1.55, Math.abs(Number(currentRange || 0)) * 0.090, 1e-9);
    if (closeBand > maxCloseBand) {
      coreLow = center - maxCloseBand / 2;
      coreHigh = center + maxCloseBand / 2;
      closeBand = maxCloseBand;
    }

    const minCloseBand = Math.max(tol * 0.34, Math.abs(Number(currentRange || 0)) * 0.014, 1e-9);
    if (closeBand < minCloseBand) {
      coreLow = center - minCloseBand / 2;
      coreHigh = center + minCloseBand / 2;
      closeBand = minCloseBand;
    }

    const role = cluster.originalType === "support" ? "support" : "resistance";
    const adjusted = adjustGiroSNRZoneToEffectiveCloses(candles, role, center, coreLow, coreHigh, tol, currentRange);
    const eff = adjusted.effectiveness || scoreGiroSNREffectiveness(candles, role, coreLow, coreHigh, tol, currentRange);

    // Regla nueva: mínimo 70% efectivo. Si los cierres en esa zona no giran,
    // se descarta el nivel y se busca el próximo candidato.
    if (!eff.ok) continue;
    // V44: 2 fallos recientes seguidos no descartan el nivel de una, pero obligan a reajustar.
    // Si luego del reajuste el nivel sigue debilitado, no genera señal nueva.
    if (eff.reviewNeeded) continue;

    coreLow = Math.min(Number(adjusted.zoneLow), Number(adjusted.zoneHigh));
    coreHigh = Math.max(Number(adjusted.zoneLow), Number(adjusted.zoneHigh));
    center = (coreLow + coreHigh) / 2;
    closeBand = Math.max(0, coreHigh - coreLow);

    const zonePad = Math.min(
      Math.max(tol * 0.055, Math.abs(Number(currentRange || 0)) * 0.0045, 1e-9),
      Math.max(tol * 0.16, 1e-9)
    );

    out.push({
      ...cluster,
      levelMode: "snr_body",
      originalType: role,
      currentRole: role,
      levelType: role,
      direction: role === "support" ? "CALL" : "PUT",
      breakDirection: "",
      brokenAt: NaN,
      level: center,
      price: center,
      tolerance: tol,
      compactness: Number(cluster.compactness || 0),
      reactionScore,
      reactionMax: Number(cluster.reactionMax || 0),
      reactionMoveMax: Number(cluster.reactionMoveMax || 0),
      zoneLow: coreLow - zonePad,
      zoneHigh: coreHigh + zonePad,
      bodyZoneLow: coreLow,
      bodyZoneHigh: coreHigh,
      closeReactionZoneLow: coreLow,
      closeReactionZoneHigh: coreHigh,
      closeBand,
      zonePad,
      snrEffectivenessRatio: Number(eff.ratio || 0),
      snrEffectivenessPct: Number(eff.pct || 0),
      snrEffectivenessWins: Number(eff.wins || 0),
      snrEffectivenessTests: Number(eff.total || 0),
      snrEffectivenessFails: Number(eff.fails || 0),
      snrRecentEffectivenessRatio: Number(eff.recentRatio || 0),
      snrRecentEffectivenessPct: Number(eff.recentPct || 0),
      snrRecentEffectivenessWins: Number(eff.recentWins || 0),
      snrRecentEffectivenessTests: Number(eff.recentTotal || 0),
      snrRecentEffectivenessFails: Number(eff.recentFails || 0),
      snrRecentConsecutiveFails: Number(eff.consecutiveRecentFails || 0),
      snrRecentReviewNeeded: !!eff.reviewNeeded,
      snrEffectivenessMinPct: 70,
      snrAdjustedToEffectiveCloses: !!adjusted.adjusted,
      snrLookbackLabel: lookbackLabel,
      lastTouchMinute: Math.max(Number(cluster.lastTouchMinute || 0), Number(eff.lastTestMinute || 0)),
    });
  }

  return out;
}

function getGiroSNRBodyCandidateLevels(symbol, minute, currentRange, rules = RULES_GIRO_DOBLE_RECHAZO) {
  const allCandles = getGiroPolarityCandles(symbol, minute, 160);
  if (!allCandles.length) return [];

  // V37: si un SNR viejo dejó de funcionar, la PWA prueba ventanas más actuales
  // antes de descartarlo. Prioridad: 60/90/140 velas, todas auditadas al 70%.
  const windows = [60, 90, 140];
  const gathered = [];
  for (const w of windows) {
    const slice = allCandles.slice(Math.max(0, allCandles.length - w));
    gathered.push(...buildGiroSNRBodyCandidateLevelsForCandles(symbol, slice, currentRange, `${w}m`));
  }

  const deduped = [];
  for (const lvl of gathered.sort((a, b) =>
    Number(b.snrEffectivenessRatio || 0) - Number(a.snrEffectivenessRatio || 0) ||
    Number(b.snrEffectivenessTests || 0) - Number(a.snrEffectivenessTests || 0) ||
    Number(b.reactionScore || 0) - Number(a.reactionScore || 0) ||
    Number(b.lastTouchMinute || 0) - Number(a.lastTouchMinute || 0)
  )) {
    const role = String(lvl.levelType || lvl.currentRole || lvl.originalType || "");
    const level = Number(lvl.level || lvl.price);
    const tol = Math.max(Number(lvl.tolerance || 0), 1e-9);
    if (!Number.isFinite(level)) continue;
    const duplicate = deduped.find((x) =>
      String(x.levelType || x.currentRole || x.originalType || "") === role &&
      Math.abs(Number(x.level || x.price) - level) <= tol * 0.72
    );
    if (!duplicate) deduped.push(lvl);
  }

  return deduped.sort((a, b) =>
    Number(b.snrEffectivenessRatio || 0) - Number(a.snrEffectivenessRatio || 0) ||
    Number(b.snrEffectivenessTests || 0) - Number(a.snrEffectivenessTests || 0) ||
    Number(b.reactionScore || 0) - Number(a.reactionScore || 0) ||
    Number(b.touches || 0) - Number(a.touches || 0) ||
    Number(a.zoneSpan || 0) - Number(b.zoneSpan || 0)
  );
}

// =========================
// Modo SNR POLARIDAD v39
// Nivel horizontal de polaridad: resistencia rota -> soporte, soporte roto -> resistencia.
// La señal no sale por ruptura: sale por retesteo de la zona después de cambiar de lado.
// =========================
const SNR_POLARIDAD_EFFECTIVENESS_MIN_RATIO = 0.70;
const SNR_POLARIDAD_EFFECTIVENESS_MIN_TESTS = 2;

function getSNRPolarityEffectivenessTests(candles, role, zoneLow, zoneHigh, tolerance, currentRange, afterMinute = null) {
  const src = (candles || [])
    .filter((c) => c && [c.open, c.high, c.low, c.close].map(Number).every(Number.isFinite))
    .filter((c) => !Number.isFinite(Number(afterMinute)) || Number(c.minute || 0) > Number(afterMinute))
    .sort((a, b) => Number(a.minute || 0) - Number(b.minute || 0));
  return getGiroSNREffectivenessTests(src, role, zoneLow, zoneHigh, tolerance, currentRange);
}

function scoreSNRPolarityEffectiveness(candles, role, zoneLow, zoneHigh, tolerance, currentRange, afterMinute = null) {
  const tests = getSNRPolarityEffectivenessTests(candles, role, zoneLow, zoneHigh, tolerance, currentRange, afterMinute);
  const total = tests.length;
  const wins = tests.filter((x) => x.success).length;
  const ratio = total > 0 ? wins / total : 0;
  const audit = buildSNRRecentEffectivenessAudit(tests);
  return {
    tests,
    total,
    wins,
    fails: Math.max(0, total - wins),
    ratio,
    pct: Math.round(ratio * 100),
    recentTests: audit.recentTests,
    recentTotal: audit.recentTotal,
    recentWins: audit.recentWins,
    recentFails: audit.recentFails,
    recentRatio: audit.recentRatio,
    recentPct: audit.recentPct,
    consecutiveRecentFails: audit.consecutiveRecentFails,
    reviewNeeded: audit.reviewNeeded,
    recentOk: audit.recentOk,
    consecutiveFailsOk: audit.consecutiveFailsOk,
    ok: total >= SNR_POLARIDAD_EFFECTIVENESS_MIN_TESTS && ratio >= SNR_POLARIDAD_EFFECTIVENESS_MIN_RATIO && audit.ok,
  };
}

function buildSNRPolarityCandidateLevelsForCandles(symbol, candles, currentRange, lookbackLabel = "") {
  const src = (candles || [])
    .filter((c) => c && [c.open, c.high, c.low, c.close].map(Number).every(Number.isFinite))
    .sort((a, b) => Number(a.minute || 0) - Number(b.minute || 0));
  if (src.length < 12) return [];

  const tol = getGiroSNRBodyTolerance(symbol, currentRange);
  const raw = getGiroSNRCloseReactionRawLevels(src, currentRange, tol);
  const clusters = clusterGiroSNRBodyLevels(raw, tol * 0.82);
  const out = [];

  for (const cluster of clusters) {
    const originalType = cluster.originalType === "support" ? "support" : "resistance";
    const touches = Number(cluster.touches || 0);
    const uniqueMinutes = Number(cluster.uniqueMinutes || 0);
    const reactionScore = Number(cluster.reactionScore || 0);
    if (touches < 2 || uniqueMinutes < 2) continue;
    if (touches < 3 && reactionScore < 1.45) continue;

    let coreLow = Math.min(Number(cluster.zoneLow), Number(cluster.zoneHigh));
    let coreHigh = Math.max(Number(cluster.zoneLow), Number(cluster.zoneHigh));
    let center = Number(cluster.price);
    if (![coreLow, coreHigh, center].every(Number.isFinite)) continue;

    const maxCloseBand = Math.max(tol * 1.75, Math.abs(Number(currentRange || 0)) * 0.095, 1e-9);
    if (coreHigh - coreLow > maxCloseBand) {
      coreLow = center - maxCloseBand / 2;
      coreHigh = center + maxCloseBand / 2;
    }
    const minCloseBand = Math.max(tol * 0.34, Math.abs(Number(currentRange || 0)) * 0.014, 1e-9);
    if (coreHigh - coreLow < minCloseBand) {
      coreLow = center - minCloseBand / 2;
      coreHigh = center + minCloseBand / 2;
    }

    const zonePad = Math.min(
      Math.max(tol * 0.12, Math.abs(Number(currentRange || 0)) * 0.006, 1e-9),
      Math.max(tol * 0.26, 1e-9)
    );
    const zoneLow = coreLow - zonePad;
    const zoneHigh = coreHigh + zonePad;
    const breakMargin = Math.max(tol * 0.42, (zoneHigh - zoneLow) * 0.32, 1e-9);
    const lastOriginalTouch = Math.max(...(cluster.minutes || []).map(Number).filter(Number.isFinite), 0);

    let breakCandle = null;
    for (const c of src) {
      const m = Number(c.minute || 0);
      if (!Number.isFinite(m) || m <= lastOriginalTouch) continue;
      const close = Number(c.close);
      const high = Number(c.high);
      const low = Number(c.low);
      if (![close, high, low].every(Number.isFinite)) continue;

      if (originalType === "resistance") {
        // Resistencia rota hacia arriba: puede convertirse en soporte.
        if (close >= zoneHigh + breakMargin && high >= zoneHigh + breakMargin * 0.55) {
          breakCandle = c;
          break;
        }
      } else {
        // Soporte roto hacia abajo: puede convertirse en resistencia.
        if (close <= zoneLow - breakMargin && low <= zoneLow - breakMargin * 0.55) {
          breakCandle = c;
          break;
        }
      }
    }
    if (!breakCandle) continue;

    const brokenAt = Number(breakCandle.minute || 0);

    // V43: antes de aceptar una polaridad, el nivel original también debe
    // estar sano recientemente. Si un soporte/resistencia funcionó hace mucho
    // pero en lo último cerró varias veces en zona y no giró, se descarta.
    const beforeBreak = src.filter((c) => Number(c.minute || 0) < brokenAt);
    const originalEff = scoreGiroSNREffectiveness(beforeBreak, originalType, zoneLow, zoneHigh, tol, currentRange);
    if (!originalEff.ok) continue;

    const afterBreak = src.filter((c) => Number(c.minute || 0) > brokenAt);
    if (!afterBreak.length) continue;

    const currentRole = originalType === "resistance" ? "support" : "resistance";
    const direction = currentRole === "support" ? "CALL" : "PUT";
    const breakDirection = originalType === "resistance" ? "up" : "down";

    // Confirmación de cambio de lado: no alcanza con una mecha o una ruptura aislada.
    // Debe existir al menos un cierre del lado nuevo antes del retesteo actual.
    const sideClose = afterBreak.find((c) => {
      const close = Number(c.close);
      if (!Number.isFinite(close)) return false;
      return currentRole === "support" ? close >= zoneHigh + tol * 0.18 : close <= zoneLow - tol * 0.18;
    });
    if (!sideClose) continue;

    const eff = scoreSNRPolarityEffectiveness(src, currentRole, zoneLow, zoneHigh, tol, currentRange, brokenAt);
    // V43: si ya existen retesteos después de la ruptura, no alcanza con que
    // el nivel haya funcionado en el pasado. Debe sostener 70% y no puede traer
    // fallos consecutivos recientes. Si todavía no hay retesteos cerrados, se
    // permite que el primer retesteo vivo sea evaluado por la vela actual.
    const enoughTests = Number(eff.total || 0) >= SNR_POLARIDAD_EFFECTIVENESS_MIN_TESTS;
    if (enoughTests && !eff.ok) continue;
    // V44: si ya hay retesteos y aparecen 2 fallos seguidos, el nivel queda en revisión.
    // En polaridad no se reajusta automáticamente el rol nuevo, así que por seguridad no genera señal.
    if (enoughTests && eff.reviewNeeded) continue;
    if (Number(eff.consecutiveRecentFails || 0) >= SNR_MAX_CONSECUTIVE_RECENT_FAILS) continue;

    out.push({
      ...cluster,
      levelMode: "snr_polaridad",
      originalType,
      currentRole,
      levelType: currentRole,
      direction,
      breakDirection,
      brokenAt,
      breakClose: Number(breakCandle.close),
      breakHigh: Number(breakCandle.high),
      breakLow: Number(breakCandle.low),
      sideConfirmedAt: Number(sideClose.minute || 0),
      level: (zoneLow + zoneHigh) / 2,
      price: (zoneLow + zoneHigh) / 2,
      tolerance: tol,
      zoneLow,
      zoneHigh,
      bodyZoneLow: coreLow,
      bodyZoneHigh: coreHigh,
      closeReactionZoneLow: coreLow,
      closeReactionZoneHigh: coreHigh,
      closeBand: Math.max(0, coreHigh - coreLow),
      zonePad,
      reactionScore,
      reactionMax: Number(cluster.reactionMax || 0),
      reactionMoveMax: Number(cluster.reactionMoveMax || 0),
      snrEffectivenessRatio: Number(eff.ratio || 0),
      snrEffectivenessPct: Number(eff.pct || 0),
      snrEffectivenessWins: Number(eff.wins || 0),
      snrEffectivenessTests: Number(eff.total || 0),
      snrEffectivenessFails: Number(eff.fails || 0),
      snrRecentEffectivenessRatio: Number(eff.recentRatio || 0),
      snrRecentEffectivenessPct: Number(eff.recentPct || 0),
      snrRecentEffectivenessWins: Number(eff.recentWins || 0),
      snrRecentEffectivenessTests: Number(eff.recentTotal || 0),
      snrRecentEffectivenessFails: Number(eff.recentFails || 0),
      snrRecentConsecutiveFails: Number(eff.consecutiveRecentFails || 0),
      snrRecentReviewNeeded: !!eff.reviewNeeded,
      snrOriginalEffectivenessRatio: Number(originalEff.ratio || 0),
      snrOriginalEffectivenessPct: Number(originalEff.pct || 0),
      snrOriginalEffectivenessWins: Number(originalEff.wins || 0),
      snrOriginalEffectivenessTests: Number(originalEff.total || 0),
      snrOriginalEffectivenessFails: Number(originalEff.fails || 0),
      snrOriginalRecentEffectivenessRatio: Number(originalEff.recentRatio || 0),
      snrOriginalRecentEffectivenessPct: Number(originalEff.recentPct || 0),
      snrOriginalRecentConsecutiveFails: Number(originalEff.consecutiveRecentFails || 0),
      snrOriginalRecentReviewNeeded: !!originalEff.reviewNeeded,
      snrEffectivenessMinPct: 70,
      snrLookbackLabel: lookbackLabel,
      touches,
      polarityReady: true,
      lastTouchMinute: Math.max(Number(cluster.lastTouchMinute || 0), brokenAt, Number(sideClose.minute || 0)),
    });
  }

  return out;
}

function getSNRPolarityCandidateLevels(symbol, minute, currentRange) {
  const allCandles = getGiroPolarityCandles(symbol, minute, 170);
  if (!allCandles.length) return [];
  const windows = [70, 100, 150];
  const gathered = [];
  for (const w of windows) {
    const slice = allCandles.slice(Math.max(0, allCandles.length - w));
    gathered.push(...buildSNRPolarityCandidateLevelsForCandles(symbol, slice, currentRange, `${w}m`));
  }
  const deduped = [];
  for (const lvl of gathered.sort((a, b) =>
    Number(b.snrEffectivenessRatio || 0) - Number(a.snrEffectivenessRatio || 0) ||
    Number(b.snrEffectivenessTests || 0) - Number(a.snrEffectivenessTests || 0) ||
    Number(b.touches || 0) - Number(a.touches || 0) ||
    Number(b.lastTouchMinute || 0) - Number(a.lastTouchMinute || 0)
  )) {
    const role = String(lvl.currentRole || lvl.levelType || "");
    const level = Number(lvl.level || lvl.price);
    const tol = Math.max(Number(lvl.tolerance || 0), 1e-9);
    if (!Number.isFinite(level)) continue;
    const duplicate = deduped.find((x) =>
      String(x.currentRole || x.levelType || "") === role &&
      Math.abs(Number(x.level || x.price) - level) <= tol * 0.72
    );
    if (!duplicate) deduped.push(lvl);
  }
  return deduped.sort((a, b) =>
    Number(b.snrEffectivenessRatio || 0) - Number(a.snrEffectivenessRatio || 0) ||
    Number(b.snrEffectivenessTests || 0) - Number(a.snrEffectivenessTests || 0) ||
    Number(b.reactionScore || 0) - Number(a.reactionScore || 0) ||
    Number(b.touches || 0) - Number(a.touches || 0)
  );
}

function analyzeSNRPolaridadCandidate(candidate, minute, rules = RULES_GIRO_DOBLE_RECHAZO, opts = {}) {
  const ticks = (candidate?.ticks || []).slice().sort((a, b) => Number(a.ms) - Number(b.ms));
  if (ticks.length < 4) return null;

  const optEvalMs = Number(opts?.evalMs);
  const evalMs = Math.max(1000, Math.min(58000, Number.isFinite(optEvalMs) ? optEvalMs : Number(EVAL_SEC || 45) * 1000));
  const evalSecUsed = Number.isFinite(Number(opts?.evalSec)) ? Number(opts.evalSec) : Math.round(evalMs / 1000);
  const radarStartSec = Number.isFinite(Number(opts?.radarStartSec)) ? Number(opts.radarStartSec) : SNR_RADAR_START_SEC;
  const radarEndSec = Number.isFinite(Number(opts?.radarEndSec)) ? Number(opts.radarEndSec) : Number(EVAL_SEC || 45);
  const usingRadar = !!opts?.radar;

  const tickOpen = Number(getPriceAtMs(ticks, 0));
  const realOpen = Number(getCandidateRealOpenPrice(candidate, minute));
  const p0 = Number.isFinite(realOpen) ? realOpen : tickOpen;
  const pE = Number(getPriceAtMs(ticks, evalMs));
  if (!Number.isFinite(p0) || !Number.isFinite(pE)) return null;

  const pts = ensureTicksWithBoundary(ticks, evalMs);
  const qs = pts.map((p) => Number(p.quote)).filter(Number.isFinite);
  if (qs.length < 3) return null;

  const high = Math.max(...qs);
  const low = Math.min(...qs);
  const range = Math.max(high - low, Math.abs(pE) * 0.000001, 1e-9);
  const levels = getSNRPolarityCandidateLevels(candidate.symbol, minute, range);
  if (!levels.length) return null;

  const matches = [];
  for (const lvl of levels) {
    const level = Number(lvl.level || lvl.price);
    const tol = Math.max(Number(lvl.tolerance || getGiroSNRBodyTolerance(candidate.symbol, range)), 1e-9);
    let zoneLow = Math.min(Number(lvl.zoneLow), Number(lvl.zoneHigh));
    let zoneHigh = Math.max(Number(lvl.zoneLow), Number(lvl.zoneHigh));
    if (![level, tol, zoneLow, zoneHigh].every(Number.isFinite)) continue;

    const currentRole = lvl.currentRole === "support" ? "support" : "resistance";
    const direction = currentRole === "support" ? "CALL" : "PUT";
    const zoneWidth = Math.max(zoneHigh - zoneLow, tol * 0.45, 1e-9);
    const interactionMargin = Math.max(tol * 0.82, zoneWidth * 0.55, range * 0.045, 1e-9);

    const candleBreakInfo = getSignalSNRRoleHardBreakInfo(
      { ...lvl, currentRole, levelType: currentRole, zoneLow, zoneHigh, tolerance: tol, level },
      pts,
      evalMs
    );
    if (candleBreakInfo?.broken) continue;

    const distance = pE < zoneLow ? zoneLow - pE : pE > zoneHigh ? pE - zoneHigh : 0;
    const inside = distance <= 1e-12;
    const interacting = distance <= interactionMargin;
    if (!interacting) continue;

    const roleSideOk = currentRole === "support" ? pE >= zoneLow - interactionMargin * 0.32 : pE <= zoneHigh + interactionMargin * 0.32;
    if (!roleSideOk) continue;

    // Retesteo desde el lado correcto:
    // resistencia rota -> soporte: el precio tuvo que estar arriba y volver hacia la zona.
    // soporte roto -> resistencia: el precio tuvo que estar abajo y volver hacia la zona.
    const traveledFromRoleSide = currentRole === "support"
      ? (p0 > zoneHigh + tol * 0.10 || high > zoneHigh + interactionMargin * 0.45)
      : (p0 < zoneLow - tol * 0.10 || low < zoneLow - interactionMargin * 0.45);
    if (!traveledFromRoleSide) continue;

    const wrongSide = currentRole === "support" ? Math.max(0, zoneLow - pE) : Math.max(0, pE - zoneHigh);
    if (wrongSide > interactionMargin * 0.40) continue;

    const rejection = currentRole === "support" ? Math.max(0, pE - low) : Math.max(0, high - pE);
    const rejectRatio = rejection / Math.max(range, 1e-9);
    const proximityScore = Math.max(0, 1 - distance / Math.max(interactionMargin, 1e-9));
    const sideScore = Math.max(0, 1 - wrongSide / Math.max(interactionMargin * 0.40, 1e-9));
    const effRatio = Number(lvl.snrEffectivenessRatio || 0);
    const effTests = Number(lvl.snrEffectivenessTests || 0);
    const touches = Number(lvl.touches || 0);

    let points = 0;
    if (interacting) points += 2;
    if (inside) points += 1;
    if (Number.isFinite(Number(lvl.brokenAt))) points += 2;
    if (traveledFromRoleSide) points += 1;
    if (touches >= 2) points += 1;
    if (touches >= 3) points += 1;
    if (effTests >= 2 && effRatio >= 0.70) points += 2;
    else if (effTests >= 1) points += 1;
    if (rejectRatio >= 0.07) points += 1;
    if (sideScore >= 0.70) points += 1;

    const minutesAfterBreak = Number(minute || 0) - Number(lvl.brokenAt || 0);
    const quality =
      proximityScore * 48 +
      (inside ? 18 : 0) +
      Math.min(5, touches) * 6 +
      Math.min(28, effRatio * 28) +
      Math.min(12, effTests * 3) +
      sideScore * 14 +
      rejectRatio * 20 +
      Math.min(12, Math.max(0, minutesAfterBreak) * 0.8) -
      Math.max(0, wrongSide / tol) * 10;

    matches.push({
      direction,
      quality,
      points,
      meta: {
        level,
        levelMode: "snr_polaridad",
        originalType: lvl.originalType,
        currentRole,
        levelType: currentRole,
        direction,
        tolerance: tol,
        zone: Math.max(zoneWidth, interactionMargin),
        zoneLow,
        zoneHigh,
        bodyZoneLow: Number(lvl.bodyZoneLow),
        bodyZoneHigh: Number(lvl.bodyZoneHigh),
        touches,
        reactionScore: Number(lvl.reactionScore || 0),
        reactionMax: Number(lvl.reactionMax || 0),
        reactionMoveMax: Number(lvl.reactionMoveMax || 0),
        brokenAt: Number(lvl.brokenAt || 0),
        breakDirection: lvl.breakDirection || "",
        breakClose: Number(lvl.breakClose),
        sideConfirmedAt: Number(lvl.sideConfirmedAt || 0),
        snrEffectivenessRatio: effRatio,
        snrEffectivenessPct: Number(lvl.snrEffectivenessPct || Math.round(effRatio * 100)),
        snrEffectivenessWins: Number(lvl.snrEffectivenessWins || 0),
        snrEffectivenessTests: effTests,
        snrEffectivenessFails: Number(lvl.snrEffectivenessFails || 0),
        snrRecentEffectivenessRatio: Number(lvl.snrRecentEffectivenessRatio || 0),
        snrRecentEffectivenessPct: Number(lvl.snrRecentEffectivenessPct || 0),
        snrRecentEffectivenessWins: Number(lvl.snrRecentEffectivenessWins || 0),
        snrRecentEffectivenessTests: Number(lvl.snrRecentEffectivenessTests || 0),
        snrRecentEffectivenessFails: Number(lvl.snrRecentEffectivenessFails || 0),
        snrRecentConsecutiveFails: Number(lvl.snrRecentConsecutiveFails || 0),
        snrRecentReviewNeeded: !!lvl.snrRecentReviewNeeded,
        snrRoleHardBreakInfo: candleBreakInfo || null,
        snrEffectivenessMinPct: 70,
        snrLookbackLabel: lvl.snrLookbackLabel || "",
        points,
        high,
        low,
        p0,
        tickOpen,
        realOpen,
        pE,
        evalSec: evalSecUsed,
        radar: usingRadar,
        radarStartSec,
        radarEndSec,
        interactionMargin,
        interactionDistance: distance,
        interactionInside: inside,
        wrongSide,
        roleSideOk,
        traveledFromRoleSide,
        rejection,
        rejectRatio,
        proximityScore,
        sideScore,
        stage: "snr_polaridad_retest",
        movementFilter: "snr_polaridad_ruptura_retest_cierre_zona",
        status: usingRadar
          ? `PREALERTA SNR POLARIDAD RADAR ${radarStartSec}-${radarEndSec}s: ruptura previa + cambio de lado + retesteo de zona. Auto solo en ${SIGNAL_AUTO_ENTRY_SEC}s con puntos suficientes.`
          : `PREALERTA SNR POLARIDAD: ruptura previa + cambio de lado + retesteo de zona. Auto solo en ${SIGNAL_AUTO_ENTRY_SEC}s con puntos suficientes.`,
        logic: currentRole === "support"
          ? "resistencia rota hacia arriba -> retesteo desde arriba como soporte de polaridad => CALL"
          : "soporte roto hacia abajo -> retesteo desde abajo como resistencia de polaridad => PUT",
      },
    });
  }

  if (!matches.length) return null;
  matches.sort((a, b) => b.quality - a.quality || b.points - a.points || Number(b.meta?.snrEffectivenessTests || 0) - Number(a.meta?.snrEffectivenessTests || 0));
  return matches[0];
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
function getDirectionalLegWeakness(arr, leg) {
  if (!leg) return { lateWeakening: false, irregularity: 1, earlySlope: 0, lateSlope: 0, efficiency: 0 };
  const a = Math.max(0, Number(leg.startIdx || 0));
  const b = Math.min(arr.length - 1, Number(leg.endIdx || 0));
  if (b <= a) return { lateWeakening: false, irregularity: 1, earlySlope: 0, lateSlope: 0, efficiency: 0 };
  const mid = Math.max(a + 1, Math.floor((a + b) * 0.58));
  const totalMove = Math.abs(Number(arr[b].z) - Number(arr[a].z));
  const path = Math.max(sumAbsDeltaZ(arr, a, b), 1e-9);
  const efficiency = totalMove / path;
  const earlyMove = Math.abs(Number(arr[mid].z) - Number(arr[a].z));
  const lateMove = Math.abs(Number(arr[b].z) - Number(arr[mid].z));
  const earlyDt = Math.max(1, Number(arr[mid].ms) - Number(arr[a].ms));
  const lateDt = Math.max(1, Number(arr[b].ms) - Number(arr[mid].ms));
  const earlySlope = earlyMove / earlyDt;
  const lateSlope = lateMove / lateDt;
  const lateWeakening = earlySlope > 0 && lateSlope <= earlySlope * 0.88;
  const irregularity = path / Math.max(totalMove, 1e-9);
  return { lateWeakening, irregularity, earlySlope, lateSlope, efficiency };
}
function getLegSlope(arr, leg) {
  if (!leg) return 0;
  const a = Math.max(0, Number(leg.startIdx || 0));
  const b = Math.min(arr.length - 1, Number(leg.endIdx || 0));
  const dt = Math.max(1, Number(arr[b]?.ms || 0) - Number(arr[a]?.ms || 0));
  return Math.abs(Number(leg.size || 0)) / dt;
}
function pickFuerzaDebilidadSequence(arr, range, allowPartialAt35) {
  // Macro-movimientos: ignoramos micro-serruchos y buscamos una secuencia simple + - + (- opcional).
  const minMacro = range * (allowPartialAt35 ? 0.085 : 0.095);
  const legs = getGiroMajorMovementLegs(arr, range, allowPartialAt35 ? 0.085 : 0.095)
    .filter((l) => Number(l?.size || 0) >= minMacro);
  if (legs.length < 3) return null;
  // Si hay demasiados recorridos importantes, la vela es más zigzag que formación clara.
  if (legs.length > (allowPartialAt35 ? 5 : 6)) return null;

  let best = null;
  for (let i = 0; i <= legs.length - 3; i++) {
    const l1 = legs[i], l2 = legs[i + 1], l3 = legs[i + 2], l4 = legs[i + 3] || null;
    if (l1.sign !== 1 || l2.sign !== -1 || l3.sign !== 1) continue;
    if (!allowPartialAt35 && (!l4 || l4.sign !== -1)) continue;

    // La secuencia no debe empezar tardísimo. Si aparece demasiado tarde, ya no sirve para señal temprana.
    if (Number(arr[l1.endIdx]?.ms || 0) > (allowPartialAt35 ? 26000 : 33000)) continue;

    const attack = l1.size;
    const rejection = l2.size;
    const response = l3.size;
    const secondReject = l4 ? l4.size : 0;
    const attackSlope = getLegSlope(arr, l1);
    const rejectionSlope = getLegSlope(arr, l2);
    const responseSlope = getLegSlope(arr, l3);
    const secondRejectSlope = l4 ? getLegSlope(arr, l4) : 0;
    const weakInfo = getDirectionalLegWeakness(arr, l1);

    const attackWide = attack >= range * (allowPartialAt35 ? 0.24 : 0.27);
    if (!attackWide) continue;

    // El primer grupo puede avanzar grande/mediano/chico, lento o irregular: eso es debilidad del dominante.
    const attackWeakOrIrregular = weakInfo.lateWeakening || weakInfo.irregularity >= 1.18 || weakInfo.efficiency <= 0.78;
    if (!attackWeakOrIrregular) continue;

    // El contrario debe responder mejor: más ángulo/intensidad o desplazamiento convincente.
    const rejectionStrong =
      rejection >= range * (allowPartialAt35 ? 0.15 : 0.17) &&
      (rejectionSlope >= attackSlope * 0.95 || rejection >= attack * 0.52);
    if (!rejectionStrong) continue;

    // La respuesta del grupo inicial tiene que ser débil frente al rechazo.
    const responseRatio = response / Math.max(rejection, 1e-9);
    const weakBySize = responseRatio <= (allowPartialAt35 ? 0.72 : 0.66);
    const weakBySpeed = responseSlope <= rejectionSlope * (allowPartialAt35 ? 0.78 : 0.72);
    const doesNotRecoverExtreme = Number(arr[l3.endIdx]?.z || 0) <= Number(arr[l1.endIdx]?.z || 0) + range * 0.035;
    const weakResponse = weakBySpeed && (weakBySize || doesNotRecoverExtreme || responseRatio <= 0.50);
    if (!weakResponse) continue;

    let secondRejectOk = true;
    if (!allowPartialAt35) {
      secondRejectOk = !!l4 && secondReject >= range * 0.055 && (secondRejectSlope >= responseSlope * 0.80 || secondReject >= response * 0.50);
      if (!secondRejectOk) continue;
    }

    let points = 0;
    if (attackWide) points += 1;
    if (attackWeakOrIrregular) points += 2;
    if (rejectionStrong) points += 2;
    if (rejectionSlope >= attackSlope * 1.05) points += 1;
    if (weakBySize) points += 2;
    if (weakBySpeed) points += 2;
    if (doesNotRecoverExtreme) points += 1;
    if (!allowPartialAt35 && secondRejectOk) points += 2;

    const required = allowPartialAt35 ? 7 : 9;
    if (points < required) continue;

    const score =
      (attack / Math.max(range, 1e-9)) * 18 +
      (weakInfo.irregularity >= 1.18 ? 10 : 0) +
      (weakInfo.lateWeakening ? 10 : 0) +
      (rejection / Math.max(range, 1e-9)) * 30 +
      Math.min(30, (rejectionSlope / Math.max(attackSlope, 1e-9)) * 16) +
      (1 - Math.min(1, responseRatio)) * 34 +
      (weakBySpeed ? 18 : 0) +
      (doesNotRecoverExtreme ? 12 : 0) +
      (secondReject / Math.max(range, 1e-9)) * 16 +
      points * 9 -
      i * 5;

    const res = {
      isResistance: null,
      direction: null,
      level: Number(arr[l1.endIdx]?.q || 0),
      firstTopIdx: l1.endIdx,
      rejectLowIdx: l2.endIdx,
      secondTopIdx: l3.endIdx,
      afterLowIdx: l4 ? l4.endIdx : -1,
      attackFromSwing: attack,
      attackFromOpen: Math.abs(Number(arr[l1.endIdx]?.z || 0) - Number(arr[0]?.z || 0)),
      attackEfficiency: weakInfo.efficiency,
      attackIrregularity: weakInfo.irregularity,
      lateWeakening: weakInfo.lateWeakening,
      rejection1: rejection,
      rejectionSlope,
      attackSlope,
      rejectionHasForce: rejectionStrong,
      responseAmp: response,
      responseRatio,
      responseSlope,
      weakResponse,
      weakBySize,
      weakBySpeed,
      lowerHigh: doesNotRecoverExtreme,
      noStrongBreak: doesNotRecoverExtreme,
      rejection2: secondReject,
      rejection2Slope: secondRejectSlope,
      secondRejectByAngle: secondRejectOk,
      closeAdvantage: Math.max(0, Number(arr[l3.endIdx]?.z || 0) - Number(arr[arr.length - 1]?.z || 0)),
      zoneRetestQuality: doesNotRecoverExtreme ? 1 : 0.45,
      movementLegs: legs.length,
      movementFilter: "fuerza_debilidad_macro",
      partial35: allowPartialAt35,
      stage: allowPartialAt35 ? "35s_debilidad_rechazo_respuesta_debil" : "40plus_dos_rechazos_dos_respuestas_debiles",
      points,
      score,
      macroStartIdx: i,
    };
    if (!best || res.score > best.score) best = res;
  }
  return best;
}

function getLegEndMs(arr, leg) {
  if (!leg) return 0;
  const i = Math.max(0, Math.min(arr.length - 1, Number(leg.endIdx || 0)));
  return Number(arr[i]?.ms || 0);
}
function getLegStartMs(arr, leg) {
  if (!leg) return 0;
  const i = Math.max(0, Math.min(arr.length - 1, Number(leg.startIdx || 0)));
  return Number(arr[i]?.ms || 0);
}
function getPatronVisualLegQuality(arr, legs, i, range, allowPartialAt35) {
  const l1 = legs[i], l2 = legs[i + 1], l3 = legs[i + 2], l4 = legs[i + 3] || null;
  if (!l1 || !l2 || !l3) return null;
  if (l1.sign !== 1 || l2.sign !== -1 || l3.sign !== 1) return null;
  if (!allowPartialAt35 && (!l4 || l4.sign !== -1)) return null;

  const attack = Number(l1.size || 0);
  const rejection = Number(l2.size || 0);
  const response = Number(l3.size || 0);
  const secondReject = l4 ? Number(l4.size || 0) : 0;
  const attackSlope = getLegSlope(arr, l1);
  const rejectionSlope = getLegSlope(arr, l2);
  const responseSlope = getLegSlope(arr, l3);
  const secondRejectSlope = l4 ? getLegSlope(arr, l4) : 0;
  const weakInfo = getDirectionalLegWeakness(arr, l1);

  const evalMs = Math.max(1, Number(arr[arr.length - 1]?.ms || 0));
  const l1EndMs = getLegEndMs(arr, l1);
  const l2EndMs = getLegEndMs(arr, l2);
  const l3EndMs = getLegEndMs(arr, l3);

  // El patrón visual no debe empezar demasiado tarde ni terminar sin tiempo para decidir.
  if (l1EndMs > (allowPartialAt35 ? 28500 : 34000)) return null;
  if (l2EndMs > (allowPartialAt35 ? 34500 : 41000)) return null;
  if (allowPartialAt35 && l3EndMs > evalMs + 500) return null;

  const attackWide = attack >= range * (allowPartialAt35 ? 0.18 : 0.22);
  if (!attackWide) return null;

  // Movimiento 1: amplio, pero con señales de pérdida de fuerza o irregularidad.
  const attackWeakOrIrregular = weakInfo.lateWeakening || weakInfo.irregularity >= 1.08 || weakInfo.efficiency <= 0.90;
  // v45: no bloqueamos por una sola métrica de debilidad; si el rechazo y la respuesta débil aparecen claros, puede ser señal.


  // Movimiento 2: el contrario responde mejor. Puede ser fuerte por tamaño, por ángulo o por recuperación clara.
  const rejectionStrongBySize = rejection >= range * (allowPartialAt35 ? 0.095 : 0.120);
  const rejectionBetterAngle = rejectionSlope >= attackSlope * (allowPartialAt35 ? 0.70 : 0.82);
  const rejectionGoodVsAttack = rejection >= attack * (allowPartialAt35 ? 0.30 : 0.38);
  const rejectionStrong = rejectionStrongBySize && (rejectionBetterAngle || rejectionGoodVsAttack || rejection >= range * (allowPartialAt35 ? 0.14 : 0.16));
  if (!rejectionStrong) return null;

  // Movimiento 3: el grupo inicial vuelve, pero peor: menos tamaño y/o peor ángulo, sin recuperar el extremo.
  const responseRatio = response / Math.max(rejection, 1e-9);
  const responseVsAttack = response / Math.max(attack, 1e-9);
  const weakBySize = responseRatio <= (allowPartialAt35 ? 0.86 : 0.76) || responseVsAttack <= 0.58;
  const weakBySpeed = responseSlope <= rejectionSlope * (allowPartialAt35 ? 0.92 : 0.82);
  const doesNotRecoverExtreme = Number(arr[l3.endIdx]?.z || 0) <= Number(arr[l1.endIdx]?.z || 0) + range * (allowPartialAt35 ? 0.085 : 0.055);
  const responseExists = response >= range * 0.025;
  const weakResponse = responseExists && (weakBySpeed || weakBySize) && (weakBySize || doesNotRecoverExtreme || responseRatio <= 0.68);
  if (!weakResponse) return null;

  // Movimiento 4: para 40s+ se pide aprovechamiento/segundo rechazo.
  let secondRejectOk = true;
  if (!allowPartialAt35) {
    secondRejectOk = !!l4 && l4.sign === -1 && secondReject >= range * 0.035 && (secondRejectSlope >= responseSlope * 0.60 || secondReject >= response * 0.32);
    if (!secondRejectOk) return null;
  }

  // Patrón visual: pocas piernas, orden simple, sin zigzag exagerado.
  const importantCount = legs.filter((l) => Number(l.size || 0) >= range * 0.085).length;
  const maxImportant = allowPartialAt35 ? 5 : 6;
  if (importantCount > maxImportant) return null;

  // Score de parecido al molde: ataque amplio + rechazo más claro + retorno débil.
  const attackScore = Math.min(24, (attack / Math.max(range * 0.45, 1e-9)) * 24);
  const attackWeakScore = (weakInfo.lateWeakening ? 12 : 0) + (weakInfo.irregularity >= 1.14 ? 8 : 0) + (weakInfo.efficiency <= 0.82 ? 8 : 0);
  const rejectSizeScore = Math.min(24, (rejection / Math.max(range * 0.24, 1e-9)) * 24);
  const rejectAngleScore = Math.min(18, (rejectionSlope / Math.max(attackSlope, 1e-9)) * 12);
  const responseWeakScore = Math.min(30, (1 - Math.min(1, responseRatio)) * 34) + (weakBySpeed ? 14 : 0) + (doesNotRecoverExtreme ? 12 : 0);
  const simplicityScore = Math.max(0, 16 - Math.max(0, importantCount - 3) * 7 - i * 4);
  const fourthScore = !allowPartialAt35 && secondRejectOk ? Math.min(18, (secondReject / Math.max(range * 0.12, 1e-9)) * 18) : 0;
  const visualScore = attackScore + attackWeakScore + rejectSizeScore + rejectAngleScore + responseWeakScore + simplicityScore + fourthScore;
  const minVisualScore = allowPartialAt35 ? 58 : 72;
  if (visualScore < minVisualScore) return null;

  let points = 0;
  if (attackWide) points += 1;
  if (attackWeakOrIrregular) points += 2;
  if (rejectionStrongBySize) points += 1;
  if (rejectionBetterAngle) points += 1;
  if (rejectionGoodVsAttack) points += 1;
  if (weakBySize) points += 2;
  if (weakBySpeed) points += 2;
  if (doesNotRecoverExtreme) points += 1;
  if (importantCount <= 4) points += 1;
  if (!allowPartialAt35 && secondRejectOk) points += 2;

  const quality = visualScore + points * 8;
  return {
    isResistance: null,
    direction: null,
    level: Number(arr[l1.endIdx]?.q || 0),
    firstTopIdx: l1.endIdx,
    rejectLowIdx: l2.endIdx,
    secondTopIdx: l3.endIdx,
    afterLowIdx: l4 ? l4.endIdx : -1,
    attackFromSwing: attack,
    attackFromOpen: Math.abs(Number(arr[l1.endIdx]?.z || 0) - Number(arr[0]?.z || 0)),
    attackEfficiency: weakInfo.efficiency,
    attackIrregularity: weakInfo.irregularity,
    lateWeakening: weakInfo.lateWeakening,
    rejection1: rejection,
    rejectionSlope,
    attackSlope,
    rejectionHasForce: rejectionStrong,
    responseAmp: response,
    responseRatio,
    responseVsAttack,
    responseSlope,
    weakResponse,
    weakBySize,
    weakBySpeed,
    lowerHigh: doesNotRecoverExtreme,
    noStrongBreak: doesNotRecoverExtreme,
    rejection2: secondReject,
    rejection2Slope: secondRejectSlope,
    secondRejectByAngle: secondRejectOk,
    closeAdvantage: Math.max(0, Number(arr[l3.endIdx]?.z || 0) - Number(arr[arr.length - 1]?.z || 0)),
    zoneRetestQuality: doesNotRecoverExtreme ? 1 : 0.45,
    movementLegs: importantCount,
    movementFilter: "patron_visual_sensible",
    partial35: allowPartialAt35,
    stage: allowPartialAt35 ? "35s_patron_3_movimientos" : "40plus_patron_4_movimientos",
    points,
    score: quality,
    visualScore: Math.round(visualScore),
    macroStartIdx: i,
  };
}
function pickPatronVisualEstrictoSequence(arr, range, allowPartialAt35) {
  const minFrac = allowPartialAt35 ? 0.042 : 0.050;
  const legs = getGiroMajorMovementLegs(arr, range, minFrac)
    .filter((l) => Number(l?.size || 0) >= range * minFrac);
  if (legs.length < 3) return null;

  let best = null;
  // Permitimos que haya una pierna inicial pequeña, pero el patrón principal debe aparecer claro.
  for (let i = 0; i <= legs.length - 3; i++) {
    if (i > 2) break;
    const q = getPatronVisualLegQuality(arr, legs, i, range, allowPartialAt35);
    if (!q) continue;
    if (!best || q.score > best.score) best = q;
  }
  return best;
}
function analyzeGiroPatronVisualSide(pts, isResistance, range, rules = RULES_GIRO_DOBLE_RECHAZO) {
  // v44: Patrón visual estricto.
  // La señal ya no nace por "cualquier fuerza/debilidad". Debe parecerse al molde:
  // 35s: ataque amplio débil/irregular -> rechazo contrario claro -> respuesta débil.
  // 40s+: agrega aprovechamiento / segundo rechazo.
  const sign = isResistance ? 1 : -1;
  const arr = (pts || [])
    .map((p, idx) => ({ idx, ms: Number(p.ms || 0), q: Number(p.quote), z: sign * Number(p.quote) }))
    .filter((p) => Number.isFinite(p.q) && Number.isFinite(p.z));
  if (arr.length < 7) return null;
  const evalMs = Math.max(1, Number(arr[arr.length - 1]?.ms || 0));
  const allowPartialAt35 = !!rules.allowPartialAt35 && evalMs <= (Number(rules.partialEvalSec || 35) * 1000 + 800);
  const seq = pickPatronVisualEstrictoSequence(arr, range, allowPartialAt35);
  if (!seq) return null;
  seq.isResistance = isResistance;
  seq.direction = isResistance ? "PUT" : "CALL";
  seq.level = sign * Number(arr[seq.firstTopIdx]?.z || 0);
  return seq;
}
function analyzeGiroPatronVisualCandidate(candidate, minute, rules = RULES_GIRO_DOBLE_RECHAZO) {
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

  const put = analyzeGiroPatronVisualSide(pts, true, range, rules);
  const call = analyzeGiroPatronVisualSide(pts, false, range, rules);
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
      levelMode: "patron_visual",
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
      attackIrregularity: seq.attackIrregularity,
      approachWeakening: !!seq.lateWeakening,
      firstRejection: seq.rejection1,
      rejectionHasForce: !!seq.rejectionHasForce,
      responseRatio: seq.responseRatio,
      responseVsAttack: seq.responseVsAttack,
      responseSlope: seq.responseSlope,
      weakResponse: !!seq.weakResponse,
      lowerHigh: !!seq.lowerHigh,
      secondRejection: seq.rejection2,
      secondRejectByAngle: !!seq.secondRejectByAngle,
      closeAdvantage: seq.closeAdvantage,
      partial35: !!seq.partial35,
      stage: seq.stage,
      visualScore: seq.visualScore,
      movementLegs: seq.movementLegs,
      movementFilter: seq.movementFilter,
      status: seq.partial35
        ? "Patrón visual sensible 35s: ataque + rechazo + respuesta débil"
        : "Patrón visual sensible 40s+: ataque + rechazo + respuesta débil + aprovechamiento",
      logic: seq.isResistance
        ? "patrón visual sensible: comprador avanza, vendedor responde mejor y comprador vuelve débil => PUT"
        : "patrón visual sensible: vendedor avanza, comprador responde mejor y vendedor vuelve débil => CALL",
    },
  };
}

function getCandidateRealOpenPrice(candidate, minute) {
  const symbol = String(candidate?.symbol || "");
  const cm = Number(minute);
  const ocOpen = Number(candleOC?.[cm]?.[symbol]?.open);
  if (Number.isFinite(ocOpen)) return ocOpen;
  const liveOpen = Number(minuteData?.[cm]?.[symbol]?.[0]?.quote);
  if (Number.isFinite(liveOpen)) return liveOpen;
  const firstTick = (candidate?.ticks || [])
    .map((t) => ({ ms: Number(t?.ms), quote: Number(t?.quote) }))
    .filter((t) => Number.isFinite(t.ms) && Number.isFinite(t.quote))
    .sort((a, b) => a.ms - b.ms)[0];
  return firstTick && Number.isFinite(firstTick.quote) ? Number(firstTick.quote) : NaN;
}

function analyzeGiroSNRSecondTouchCandidate(candidate, minute, rules = RULES_GIRO_DOBLE_RECHAZO, opts = {}) {
  // V14: regla simplificada solicitada.
  // La señal sale cuando, al segundo seleccionado (EVAL_SEC), el precio está
  // interactuando con una zona SNR válida por cuerpos/cierres.
  // Se quita la exigencia de secuencia: rechazo, respuesta débil y segundo rechazo.
  const ticks = (candidate?.ticks || []).slice().sort((a, b) => Number(a.ms) - Number(b.ms));
  if (ticks.length < 4) return null;

  const optEvalMs = Number(opts?.evalMs);
  const evalMs = Math.max(1000, Math.min(58000, Number.isFinite(optEvalMs) ? optEvalMs : Number(EVAL_SEC || 45) * 1000));
  const evalSecUsed = Number.isFinite(Number(opts?.evalSec)) ? Number(opts.evalSec) : Math.round(evalMs / 1000);
  const radarStartSec = Number.isFinite(Number(opts?.radarStartSec)) ? Number(opts.radarStartSec) : SNR_RADAR_START_SEC;
  const radarEndSec = Number.isFinite(Number(opts?.radarEndSec)) ? Number(opts.radarEndSec) : Number(EVAL_SEC || 45);
  const usingRadar = !!opts?.radar;
  const tickOpen = Number(getPriceAtMs(ticks, 0));
  const realOpen = Number(getCandidateRealOpenPrice(candidate, minute));
  const p0 = Number.isFinite(realOpen) ? realOpen : tickOpen;
  const pE = Number(getPriceAtMs(ticks, evalMs));
  if (!Number.isFinite(p0) || !Number.isFinite(pE)) return null;

  const pts = ensureTicksWithBoundary(ticks, evalMs);
  const qs = pts.map((p) => Number(p.quote)).filter(Number.isFinite);
  if (qs.length < 3) return null;

  const high = Math.max(...qs);
  const low = Math.min(...qs);
  const range = Math.max(high - low, Math.abs(pE) * 0.000001, 1e-9);

  const levels = getGiroSNRBodyCandidateLevels(candidate.symbol, minute, range, rules);
  if (!levels.length) return null;

  const matches = [];
  for (const lvl of levels) {
    const level = Number(lvl.level || lvl.price);
    const tol = Number(lvl.tolerance || getGiroSNRBodyTolerance(candidate.symbol, range));
    if (!Number.isFinite(level) || !Number.isFinite(tol) || tol <= 0) continue;

    const isResistance = (lvl.currentRole || lvl.levelType) === "resistance";
    const direction = isResistance ? "PUT" : "CALL";

    let zoneLow = Number(lvl.zoneLow);
    let zoneHigh = Number(lvl.zoneHigh);
    if (!Number.isFinite(zoneLow) || !Number.isFinite(zoneHigh)) {
      zoneLow = level - tol * 0.35;
      zoneHigh = level + tol * 0.35;
    }
    {
      const zA = zoneLow;
      const zB = zoneHigh;
      zoneLow = Math.min(zA, zB);
      zoneHigh = Math.max(zA, zB);
    }

    const bodyBand = Math.max(0, zoneHigh - zoneLow);
    const compactBand = Math.max(0, 1 - bodyBand / Math.max(tol * 2.2, 1e-9));
    const interactionMargin = Math.max(tol * 0.72, bodyBand * 0.55, range * 0.040, 1e-9);

    const distance = pE < zoneLow ? zoneLow - pE : pE > zoneHigh ? pE - zoneHigh : 0;
    const inside = distance <= 1e-12;
    const interacting = distance <= interactionMargin;
    if (!interacting) continue;

    // V20: la vela de señal NO puede nacer dentro ni pegada al SNR.
    // Usa apertura real de la vela (candleOC/minuteData), no solo el primer tick disponible.
    const bodyLowRaw = Math.min(Number(lvl.bodyZoneLow), Number(lvl.bodyZoneHigh));
    const bodyHighRaw = Math.max(Number(lvl.bodyZoneLow), Number(lvl.bodyZoneHigh));
    const hasBodyZone = Number.isFinite(bodyLowRaw) && Number.isFinite(bodyHighRaw);
    const openInsideSNRZone = p0 >= zoneLow && p0 <= zoneHigh;
    const openInsideBodyZone = hasBodyZone && p0 >= bodyLowRaw && p0 <= bodyHighRaw;
    const openDistanceToZone = p0 < zoneLow ? zoneLow - p0 : p0 > zoneHigh ? p0 - zoneHigh : 0;
    const minOpenDistanceToZone = Math.max(interactionMargin * 1.20, tol * 1.15, bodyBand * 0.85, range * 0.070, 1e-9);
    const openTooNearSNR = openInsideSNRZone || openInsideBodyZone || openDistanceToZone < minOpenDistanceToZone;
    if (openTooNearSNR) continue;

    // También debe abrir del lado lógico del viaje hacia el nivel:
    // resistencia => abre claramente por debajo y viaja hacia arriba; soporte => abre claramente por arriba y viaja hacia abajo.
    const openOnTravelSide = isResistance ? p0 < zoneLow - Math.max(tol * 0.15, 1e-9) : p0 > zoneHigh + Math.max(tol * 0.15, 1e-9);
    if (!openOnTravelSide) continue;

    const approachFromOpen = isResistance ? pE - p0 : p0 - pE;
    if (approachFromOpen < Math.max(minOpenDistanceToZone * 0.42, tol * 0.50, 1e-9)) continue;

    // Para evitar tomar una ruptura sostenida como interacción:
    // - en resistencia, toleramos apenas arriba de la zona;
    // - en soporte, toleramos apenas abajo de la zona.
    const wrongSide = isResistance ? Math.max(0, pE - zoneHigh) : Math.max(0, zoneLow - pE);
    if (wrongSide > interactionMargin * 0.65) continue;

    const touches = Number(lvl.touches || 0);
    const reactionStrength = Math.min(2.4, Math.max(0, Number(lvl.reactionScore || 0)));
    const proximityScore = Math.max(0, 1 - distance / Math.max(interactionMargin, 1e-9));
    const sideScore = wrongSide <= 1e-12 ? 1 : Math.max(0, 1 - wrongSide / Math.max(interactionMargin * 0.65, 1e-9));

    let points = 0;
    if (interacting) points += 2;
    if (inside) points += 1;
    if (touches >= 2) points += 1;
    if (touches >= 3) points += 1;
    if (touches >= 4) points += 1;
    if (compactBand >= 0.45) points += 1;
    if (reactionStrength >= 1.20) points += 1;
    if (sideScore >= 0.70) points += 1;
    if (openDistanceToZone >= minOpenDistanceToZone * 1.35) points += 1;

    const openDistanceScore = Math.min(1, openDistanceToZone / Math.max(minOpenDistanceToZone * 1.65, 1e-9));
    const quality =
      proximityScore * 55 +
      (inside ? 18 : 0) +
      Math.min(5, touches) * 8 +
      compactBand * 18 +
      reactionStrength * 10 +
      sideScore * 10 +
      openDistanceScore * 12 -
      Math.max(0, wrongSide / Math.max(tol, 1e-9)) * 4;

    matches.push({
      direction,
      quality,
      points,
      meta: {
        level,
        levelMode: "snr_body",
        originalType: lvl.originalType,
        currentRole: lvl.currentRole,
        levelType: isResistance ? "resistance" : "support",
        direction,
        tolerance: tol,
        zone: Math.max(bodyBand, interactionMargin),
        zoneLow,
        zoneHigh,
        bodyZoneLow: Number(lvl.bodyZoneLow),
        bodyZoneHigh: Number(lvl.bodyZoneHigh),
        touches,
        reactionScore: Number(lvl.reactionScore || 0),
        reactionMax: Number(lvl.reactionMax || 0),
        reactionMoveMax: Number(lvl.reactionMoveMax || 0),
        bodyBand,
        compactBodyBand: compactBand,
        brokenAt: Number(lvl.brokenAt || 0),
        breakDirection: lvl.breakDirection || "",
        points,
        high,
        low,
        p0,
        tickOpen,
        realOpen,
        pE,
        evalSec: evalSecUsed,
        radar: usingRadar,
        radarStartSec,
        radarEndSec,
        interactionMargin,
        interactionDistance: distance,
        interactionInside: inside,
        openDistanceToZone,
        minOpenDistanceToZone,
        openInsideSNRZone,
        openInsideBodyZone,
        openTooNearSNR,
        openOnTravelSide,
        approachFromOpen,
        openDistanceScore,
        wrongSide,
        proximityScore,
        sideScore,
        stage: "snr_prealerta_cierre_snr",
        movementFilter: "snr_cierres_reaccion_prealerta_eval_sec",
        status: usingRadar
          ? `PREALERTA SNR RADAR ${radarStartSec}-${radarEndSec}s: apertura fuera/lejos del SNR y precio ${evalSecUsed}s dentro/cerca del nivel. Auto solo en ${SIGNAL_AUTO_ENTRY_SEC}s con puntos suficientes.`
          : `PREALERTA SNR: apertura fuera/lejos del SNR y precio ${evalSecUsed}s dentro/cerca del nivel. Auto solo en ${SIGNAL_AUTO_ENTRY_SEC}s con puntos suficientes.`,
        logic: isResistance
          ? `abre fuera/lejos por debajo y precio en ${evalSecUsed}s interactúa con resistencia SNR => PUT`
          : `abre fuera/lejos por arriba y precio en ${evalSecUsed}s interactúa con soporte SNR => CALL`,
      },
    });
  }

  if (!matches.length) return null;
  matches.sort((a, b) => b.quality - a.quality || b.points - a.points || Number(b.meta?.touches || 0) - Number(a.meta?.touches || 0));
  return matches[0];
}

function analyzeGiroSNRBodyCandidate(candidate, minute, rules = RULES_GIRO_DOBLE_RECHAZO) {
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

  const levels = getGiroSNRBodyCandidateLevels(candidate.symbol, minute, range, rules);
  if (!levels.length) return null;

  const matches = [];
  for (const lvl of levels) {
    const level = Number(lvl.level || lvl.price);
    const tol = Number(lvl.tolerance || getGiroSNRBodyTolerance(candidate.symbol, range));
    if (!Number.isFinite(level) || !Number.isFinite(tol) || tol <= 0) continue;

    const isResistance = (lvl.currentRole || lvl.levelType) === "resistance";
    const band = Math.max(Math.abs(Number(lvl.zoneHigh) - Number(lvl.zoneLow)), tol * 0.40);
    const compactBand = Math.max(0, 1 - band / Math.max(tol * 2.2, 1e-9));
    const zone = Math.max(band + tol * 0.20, range * 0.055);
    const seq = analyzeGiroMandatorySequence(pts, level, isResistance, zone, tol, range, {
      ...rules,
      zoneMult: Math.min(Number(rules.zoneMult || 2.35), 1.30),
      zoneRangeMult: Math.min(Number(rules.zoneRangeMult || 0.32), 0.14),
      minOpenToLevelRatio: 0.24,
      minApproachRatio: 0.22,
      minFirstRejectRatio: 0.11,
      minSecondRejectRatio: 0.045,
      maxCloseBeyondTol: 0.48,
      maxDominantResponseRatio: 0.72,
    });
    if (!seq) continue;

    let points = 0;
    if (Number(lvl.touches || 0) >= 2) points += 1;
    if (Number(lvl.touches || 0) >= 3) points += 1;
    if (Number(lvl.touches || 0) >= 4) points += 1;
    if (compactBand >= 0.45) points += 1;
    if (seq.openToLevel >= Math.max(range * 0.24, tol * 1.15)) points += 1;
    if (seq.approachMove >= range * 0.24) points += 1;
    if (seq.routeBodyRatio >= 0.42) points += 1;
    if (seq.approachIrregularity >= 1.04 || seq.approachWeakening) points += 1;
    if (seq.rejection1 >= Math.max(range * 0.11, tol * 0.65) || seq.rejectionHasForce) points += 1;
    if (seq.weakResponse) points += 1;
    if (seq.responseRatio <= 0.70) points += 1;
    if (!seq.partial35 && (seq.rejection2 >= Math.max(range * 0.045, tol * 0.38) || seq.secondRejectByAngle)) points += 1;
    if (!seq.partial35 && (seq.closeAdvantage >= Math.max(range * 0.050, tol * 0.30) || seq.secondRejectByAngle)) points += 1;

    const requiredPoints = seq.partial35 ? 6 : 8;
    if (points < requiredPoints) continue;

    const zoneCenter = (Number(lvl.zoneLow) + Number(lvl.zoneHigh)) / 2;
    const distClose = Math.abs(pE - zoneCenter);
    const nearScore = Math.max(0, 1 - distClose / Math.max(zone * 1.15, 1e-9));
    const quality = seq.score + points * 14 + nearScore * 14 + compactBand * 16 + Math.min(5, Number(lvl.touches || 0)) * 7 - Math.max(0, distClose / Math.max(tol, 1e-9)) * 5;
    const direction = isResistance ? "PUT" : "CALL";

    matches.push({
      direction,
      quality,
      points,
      meta: {
        level,
        levelMode: "snr_body",
        originalType: lvl.originalType,
        currentRole: lvl.currentRole,
        levelType: isResistance ? "resistance" : "support",
        direction,
        tolerance: tol,
        zone,
        zoneLow: Number(lvl.zoneLow),
        zoneHigh: Number(lvl.zoneHigh),
        bodyZoneLow: Number(lvl.bodyZoneLow),
        bodyZoneHigh: Number(lvl.bodyZoneHigh),
        touches: Number(lvl.touches || 0),
        bodyBand,
        compactBodyBand: compactBand,
        brokenAt: Number(lvl.brokenAt || 0),
        breakDirection: lvl.breakDirection || "",
        points,
        high,
        low,
        p0,
        pE,
        openToLevel: seq.openToLevel,
        approachMove: seq.approachMove,
        approachIrregularity: seq.approachIrregularity,
        approachWeakening: !!seq.approachWeakening,
        routeBodyRatio: seq.routeBodyRatio,
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
        stage: seq.partial35 ? "35s_snr_rechazo_respuesta" : "40plus_snr_doble_rechazo",
        movementFilter: "snr_cuerpos_role_reversal",
        status: seq.partial35
          ? "SNR por cuerpos 35s: recorrido -> rechazo fuerte -> respuesta débil"
          : "SNR por cuerpos 40s+: recorrido -> rechazo fuerte -> respuesta débil -> segundo rechazo",
        logic: isResistance
          ? "viejo soporte roto que pasa a resistencia; retesteo con rechazo fuerte y respuesta débil del comprador => PUT"
          : "vieja resistencia rota que pasa a soporte; retesteo con rechazo fuerte y respuesta débil del vendedor => CALL",
      },
    });
  }

  if (!matches.length) return null;
  matches.sort((a, b) => b.quality - a.quality || b.points - a.points || Number(b.meta?.touches || 0) - Number(a.meta?.touches || 0));
  return matches[0];
}

function analyzeGiroSinNivelSide(pts, isResistance, range, rules = RULES_GIRO_DOBLE_RECHAZO) {
  // v43: Giro por FUERZA/DEBILIDAD de grupos.
  // No depende de un nivel histórico. Lee macro-movimientos claros:
  // 35s: movimiento débil/irregular del dominante -> respuesta fuerte contraria -> respuesta débil del dominante.
  // 40s+: agrega un cuarto movimiento: nuevo rechazo/aprovechamiento del grupo contrario.
  const sign = isResistance ? 1 : -1;
  const arr = (pts || [])
    .map((p, idx) => ({ idx, ms: Number(p.ms || 0), q: Number(p.quote), z: sign * Number(p.quote) }))
    .filter((p) => Number.isFinite(p.q) && Number.isFinite(p.z));
  if (arr.length < 7) return null;

  const evalMs = Math.max(1, Number(arr[arr.length - 1]?.ms || 0));
  const allowPartialAt35 = !!rules.allowPartialAt35 && evalMs <= (Number(rules.partialEvalSec || 35) * 1000 + 800);
  const seq = pickFuerzaDebilidadSequence(arr, range, allowPartialAt35);
  if (!seq) return null;
  seq.isResistance = isResistance;
  seq.direction = isResistance ? "PUT" : "CALL";
  seq.level = sign * Number(arr[seq.firstTopIdx]?.z || 0);
  return seq;
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



/* =========================
   Línea dinámica — soporte/resistencia de tendencia
========================= */
function getDynamicLineAvgRange(candles, fallback = 0) {
  const ranges = (candles || [])
    .map((c) => Math.abs(Number(c.high) - Number(c.low)))
    .filter((x) => Number.isFinite(x) && x > 0);
  if (ranges.length) return ranges.reduce((a, b) => a + b, 0) / ranges.length;
  return Math.max(Math.abs(Number(fallback || 0)), 1e-9);
}
function getDynamicLineValue(meta, minute, ms = 0) {
  if (!meta) return NaN;
  if (Number.isFinite(Number(meta.anchorMinute)) && Number.isFinite(Number(meta.anchorValue)) && Number.isFinite(Number(meta.slopePerCandle))) {
    return Number(meta.anchorValue) + Number(meta.slopePerCandle) * ((Number(minute) - Number(meta.anchorMinute)) + Number(ms || 0) / 60000);
  }
  if (Number.isFinite(Number(meta.lineAtMinuteStart)) && Number.isFinite(Number(meta.lineAtMinuteEnd))) {
    return Number(meta.lineAtMinuteStart) + (Number(meta.lineAtMinuteEnd) - Number(meta.lineAtMinuteStart)) * (Number(ms || 0) / 60000);
  }
  return Number(meta.level);
}
function candlePivotPoints(candles, field, type) {
  // V34: pivotes extremos, no internos. Para línea dinámica ya no usamos
  // solamente high/low crudo: armamos candidatos externos combinando mecha,
  // cuerpo y cierre. Esta función queda como fallback para código viejo.
  const arr = (candles || []).map((c, idx) => ({ ...c, idx, v: Number(c?.[field]) })).filter((p) => Number.isFinite(p.v));
  if (arr.length < 4) return arr;
  const out = [];
  for (let i = 1; i < arr.length - 1; i++) {
    const v = arr[i].v;
    const prev = arr[i - 1].v;
    const next = arr[i + 1].v;
    if (type === "low") {
      if (v <= prev && v <= next) out.push(arr[i]);
    } else {
      if (v >= prev && v >= next) out.push(arr[i]);
    }
  }
  return out.length >= 2 ? out : arr;
}
function getDynamicLineBodyTop(c) {
  return Math.max(Number(c?.open), Number(c?.close));
}
function getDynamicLineBodyBottom(c) {
  return Math.min(Number(c?.open), Number(c?.close));
}
function getDynamicLineExtremeValue(c, isSupport, source = "wick") {
  const open = Number(c?.open), high = Number(c?.high), low = Number(c?.low), close = Number(c?.close);
  const bodyTop = Math.max(open, close);
  const bodyBottom = Math.min(open, close);
  if (source === "close") return close;
  if (source === "body") return isSupport ? bodyBottom : bodyTop;
  if (source === "open") return open;
  return isSupport ? low : high;
}
function getDynamicLineBestTouch(c, line, isSupport) {
  const open = Number(c?.open), high = Number(c?.high), low = Number(c?.low), close = Number(c?.close);
  if (![open, high, low, close, line].every(Number.isFinite)) return null;
  const bodyTop = Math.max(open, close);
  const bodyBottom = Math.min(open, close);
  const items = isSupport
    ? [
        { source: "wick", value: low, weight: 0.98 },
        { source: "body", value: bodyBottom, weight: 1.10 },
        { source: "close", value: close, weight: 1.18 },
        { source: "open", value: open, weight: 0.92 },
      ]
    : [
        { source: "wick", value: high, weight: 0.98 },
        { source: "body", value: bodyTop, weight: 1.10 },
        { source: "close", value: close, weight: 1.18 },
        { source: "open", value: open, weight: 0.92 },
      ];
  let best = null;
  for (const it of items) {
    if (!Number.isFinite(it.value)) continue;
    const dist = Math.abs(Number(it.value) - Number(line));
    if (!best || dist < best.dist || (dist === best.dist && it.weight > best.weight)) {
      best = { ...it, dist };
    }
  }
  if (!best) return null;
  const wickDist = Math.abs((isSupport ? low : high) - line);
  const closeDist = Math.abs(close - line);
  const bodyDist = Math.abs((isSupport ? bodyBottom : bodyTop) - line);
  return {
    ...best,
    wickDist,
    closeDist,
    bodyDist,
    closeValue: close,
    wickValue: isSupport ? low : high,
    bodyValue: isSupport ? bodyBottom : bodyTop,
  };
}
function buildDynamicLineExtremeCandidates(candles, isSupport, maxCount = 34) {
  const src = Array.isArray(candles) ? candles : [];
  const n = src.length;
  if (n < 5) return [];
  const avgRange = getDynamicLineAvgRange(src.slice(-40), 0);
  const local = [];
  for (let i = 1; i < n - 1; i++) {
    const c = src[i];
    const prev = src[i - 1];
    const next = src[i + 1];
    const high = Number(c.high), low = Number(c.low), close = Number(c.close), open = Number(c.open);
    if (![high, low, close, open].every(Number.isFinite)) continue;
    const bodyTop = Math.max(open, close);
    const bodyBottom = Math.min(open, close);
    const side = isSupport ? low : high;
    const prevSide = isSupport ? Number(prev.low) : Number(prev.high);
    const nextSide = isSupport ? Number(next.low) : Number(next.high);
    const bodySide = isSupport ? bodyBottom : bodyTop;
    const closeSide = close;
    const pivotByWick = isSupport ? (side <= prevSide && side <= nextSide) : (side >= prevSide && side >= nextSide);
    const pivotByBody = isSupport
      ? (bodySide <= getDynamicLineBodyBottom(prev) && bodySide <= getDynamicLineBodyBottom(next))
      : (bodySide >= getDynamicLineBodyTop(prev) && bodySide >= getDynamicLineBodyTop(next));
    // Se permiten cierres fuertes como parte del nivel si están en el borde.
    const pivotByClose = isSupport
      ? (closeSide <= Number(prev.close) && closeSide <= Number(next.close))
      : (closeSide >= Number(prev.close) && closeSide >= Number(next.close));
    if (!pivotByWick && !pivotByBody && !pivotByClose) continue;
    const left = src.slice(Math.max(0, i - 4), i);
    const right = src.slice(i + 1, Math.min(n, i + 5));
    const neigh = left.concat(right);
    const neighVals = neigh
      .map((x) => isSupport ? Number(x.low) : Number(x.high))
      .filter(Number.isFinite);
    const extremeGap = neighVals.length
      ? (isSupport ? Math.min(...neighVals) - side : side - Math.max(...neighVals))
      : 0;
    const bodyGap = neigh.length
      ? (isSupport
          ? Math.min(...neigh.map(getDynamicLineBodyBottom).filter(Number.isFinite)) - bodySide
          : bodySide - Math.max(...neigh.map(getDynamicLineBodyTop).filter(Number.isFinite)))
      : 0;
    const prominence = Math.max(0, extremeGap, bodyGap, avgRange * 0.02);
    // Cuanto más exterior, más prioridad. El cierre/cuerpo también suma para que
    // puedan coincidir cierre+mecha, cierre+cierre o mezcla cierre/mecha.
    const baseRank = prominence / Math.max(avgRange, 1e-9);
    local.push({ idx: i, candle: c, side, bodySide, closeSide, bodyTop, bodyBottom, baseRank, pivotByWick, pivotByBody, pivotByClose });
  }
  if (local.length < 2) {
    for (let i = 0; i < n; i++) {
      const c = src[i];
      const side = isSupport ? Number(c.low) : Number(c.high);
      if (Number.isFinite(side)) local.push({ idx: i, candle: c, side, bodySide: getDynamicLineExtremeValue(c, isSupport, "body"), closeSide: Number(c.close), baseRank: 0.05, pivotByWick: true });
    }
  }
  const candidates = [];
  for (const p of local) {
    const c = p.candle;
    const minute = Number(c.minute);
    const wick = isSupport ? Number(c.low) : Number(c.high);
    const body = isSupport ? Number(p.bodyBottom) : Number(p.bodyTop);
    const close = Number(c.close);
    const open = Number(c.open);
    const vals = [
      { source: "wick", v: wick, sourceWeight: 1.00 + (p.pivotByWick ? 0.18 : 0) },
      { source: "body", v: body, sourceWeight: 1.12 + (p.pivotByBody ? 0.18 : 0) },
      { source: "close", v: close, sourceWeight: 1.18 + (p.pivotByClose ? 0.20 : 0) },
    ];
    // El open se usa con menos peso solo si también coincide con borde del cuerpo.
    if (Number.isFinite(open)) vals.push({ source: "open", v: open, sourceWeight: 0.88 });
    for (const it of vals) {
      if (!Number.isFinite(it.v)) continue;
      // Para soporte, no queremos candidatos de cierre muy arriba de la vela; para
      // resistencia, no queremos cierres muy abajo: serían puntos internos.
      const edgeDistance = Math.abs(it.v - wick);
      const bodyRange = Math.max(Math.abs(Number(c.high) - Number(c.low)), avgRange * 0.25, 1e-9);
      if ((it.source === "close" || it.source === "open") && edgeDistance > bodyRange * 0.86) continue;
      candidates.push({
        idx: p.idx,
        minute,
        v: Number(it.v),
        source: it.source,
        sourceWeight: it.sourceWeight,
        exteriorRank: p.baseRank + (it.source === "close" ? 0.10 : it.source === "body" ? 0.07 : 0.03),
        candle: c,
      });
    }
  }
  candidates.sort((a, b) =>
    Number(a.idx) - Number(b.idx) ||
    (Number(b.exteriorRank || 0) + Number(b.sourceWeight || 0)) - (Number(a.exteriorRank || 0) + Number(a.sourceWeight || 0))
  );
  // Reducir duplicados: máximo 2 candidatos por vela para no favorecer líneas internas.
  const perIdx = new Map();
  const compact = [];
  for (const c of candidates) {
    const arr = perIdx.get(c.idx) || [];
    if (arr.length >= 2) continue;
    arr.push(c);
    perIdx.set(c.idx, arr);
    compact.push(c);
  }
  return compact.slice(-maxCount);
}
function scoreDynamicTrendLine(candles, pA, pB, isSupport, currentMinute, currentPrice, currentRange = 0) {
  if (!pA || !pB || pB.idx <= pA.idx) return null;
  const avgRange = getDynamicLineAvgRange(candles.slice(-40), currentRange);
  const minGap = 5;
  const gap = pB.idx - pA.idx;
  if (gap < minGap) return null;
  const slope = (Number(pB.v) - Number(pA.v)) / gap;
  const slopeAbs = Math.abs(slope);
  const minSlope = Math.max(avgRange * 0.0045, Math.abs(Number(currentPrice || pB.v)) * 0.000000045, 1e-12);
  const maxSlope = Math.max(avgRange * 1.18, minSlope * 4);
  // V35: soporte/resistencia se define por BORDE externo, no por la pendiente.
  // Un soporte puede ir subiendo o bajando si sostiene por debajo; una resistencia
  // puede ir subiendo o bajando si techa por arriba. No convertir soportes rotos
  // en resistencia ni resistencias rotas en soporte.
  if (slopeAbs < minSlope) return null;
  if (slopeAbs > maxSlope) return null;

  // Tolerancia de toque: permite que el nivel se forme por cierres, cuerpos o mechas,
  // pero sigue siendo exigente para evitar líneas internas.
  const tol = Math.max(avgRange * 0.26, Math.abs(Number(currentPrice || pB.v)) * 0.0000038, 1e-9);
  const reboundNeed = Math.max(avgRange * 0.52, Math.abs(Number(currentRange || 0)) * 0.17, tol * 1.55, 1e-9);
  const anchorIdx = Number(pA.idx);
  const anchorMinute = Number(pA.minute);
  const anchorValue = Number(pA.v);
  const valueAtIdx = (idx) => anchorValue + slope * (Number(idx) - anchorIdx);
  const valueAtMinute = (m) => anchorValue + slope * (Number(m) - anchorMinute);

  const touches = [];
  let wrongCloses = 0;
  let hardBreaks = 0;
  let bodyCuts = 0;
  let middleCuts = 0;
  let oppositeSide = 0;
  let envelopeFails = 0;
  let recentWrongRun = 0;
  let maxRecentWrongRun = 0;
  let lastHardBreakIdx = -1;
  let lastReentryIdx = -1;
  let reboundScore = 0;
  let sourceScore = 0;
  let lastTouchIdx = -999;
  let evaluated = 0;
  for (let i = Math.max(0, pA.idx); i < candles.length; i++) {
    const c = candles[i];
    const line = valueAtIdx(i);
    const low = Number(c.low), high = Number(c.high), open = Number(c.open), close = Number(c.close);
    if (![low, high, open, close, line].every(Number.isFinite)) continue;
    evaluated++;
    const bodyTop = Math.max(open, close);
    const bodyBottom = Math.min(open, close);
    const range = Math.max(Math.abs(high - low), avgRange * 0.25, 1e-9);

    // Línea externa: resistencia debe techar; soporte debe sostener.
    const closeWrong = isSupport ? close < line - tol * 0.48 : close > line + tol * 0.48;
    const hardBreak = isSupport ? low < line - tol * 1.28 : high > line + tol * 1.28;
    const cutsBody = bodyBottom < line - tol * 0.12 && bodyTop > line + tol * 0.12;
    const cutsMiddle = line > low + range * 0.30 && line < high - range * 0.30;
    const wrongSideBody = isSupport ? bodyTop < line - tol * 0.25 : bodyBottom > line + tol * 0.25;
    // V35: filtro de borde externo.
    // Soporte: la línea debe sostener por debajo; si varios cuerpos quedan claramente
    // debajo, el soporte fue roto y no se permite usarlo como venta/polaridad.
    // Resistencia: la línea debe techar por arriba; si varios cuerpos quedan claramente
    // encima, la resistencia fue rota y no se permite usarla como compra/polaridad.
    const envelopeFail = isSupport ? bodyBottom < line - tol * 0.42 : bodyTop > line + tol * 0.42;
    const correctClose = isSupport ? close >= line - tol * 0.16 : close <= line + tol * 0.16;
    if (envelopeFail) envelopeFails++;
    if (closeWrong || envelopeFail) {
      recentWrongRun++;
      if (recentWrongRun > maxRecentWrongRun) maxRecentWrongRun = recentWrongRun;
    } else if (correctClose) {
      recentWrongRun = 0;
      lastReentryIdx = i;
    }
    if (hardBreak) lastHardBreakIdx = i;
    if (closeWrong) wrongCloses++;
    if (hardBreak) hardBreaks++;
    if (cutsBody) bodyCuts++;
    if (cutsMiddle) middleCuts++;
    if (wrongSideBody) oppositeSide++;

    const best = getDynamicLineBestTouch(c, line, isSupport);
    if (!best) continue;
    const multiConfirm =
      (best.wickDist <= tol * 1.05 ? 1 : 0) +
      (best.closeDist <= tol * 1.05 ? 1 : 0) +
      (best.bodyDist <= tol * 1.05 ? 1 : 0);
    const touchOk = best.dist <= tol || (best.closeDist <= tol * 1.18 && best.bodyDist <= tol * 1.22);
    if (touchOk && i - lastTouchIdx >= 3) {
      const next = candles.slice(i + 1, Math.min(candles.length, i + 6));
      const excursion = next.length
        ? (isSupport
            ? Math.max(...next.map((x) => Number(x.high)).filter(Number.isFinite)) - line
            : line - Math.min(...next.map((x) => Number(x.low)).filter(Number.isFinite)))
        : 0;
      const reacted = Number.isFinite(excursion) && excursion >= reboundNeed;
      if (reacted) reboundScore += Math.min(2.4, excursion / Math.max(reboundNeed, 1e-9));
      // Un toque sin reacción vale menos, pero sirve si otros cierres/mechas refuerzan el nivel.
      const srcW = best.source === "close" ? 1.28 : best.source === "body" ? 1.14 : best.source === "wick" ? 1.02 : 0.86;
      const comboW = multiConfirm >= 2 ? 0.36 : 0;
      sourceScore += srcW + comboW + (reacted ? 0.58 : 0);
      touches.push({
        idx: i,
        minute: Number(c.minute),
        price: best.value,
        line,
        source: best.source,
        multiConfirm,
        wickDist: Number(best.wickDist || 0),
        closeDist: Number(best.closeDist || 0),
        bodyDist: Number(best.bodyDist || 0),
        excursion: Number(excursion || 0),
        reacted,
      });
      lastTouchIdx = i;
    }
  }
  if (touches.length < 2) return null;
  const separatedTouches = touches[touches.length - 1].idx - touches[0].idx;
  if (separatedTouches < 7) return null;
  const span = Math.max(1, candles.length - Math.max(0, pA.idx));
  const closeBreakLimit = Math.max(1, Math.floor(span * 0.08));
  const hardBreakLimit = Math.max(1, Math.floor(span * 0.075));
  const bodyCutLimit = Math.max(1, Math.floor(span * 0.07));
  const middleCutLimit = Math.max(1, Math.floor(span * 0.10));
  const envelopeFailLimit = Math.max(1, Math.floor(span * 0.075));
  if (wrongCloses > closeBreakLimit) return null;
  if (hardBreaks > hardBreakLimit) return null;
  if (bodyCuts > bodyCutLimit) return null;
  if (middleCuts > middleCutLimit) return null;
  if (envelopeFails > envelopeFailLimit) return null;
  if (maxRecentWrongRun >= 2) {
    // Si rompe y queda 2 velas del lado incorrecto, el nivel queda inválido.
    // Para volver a usarlo debe reingresar al lado correcto y retestear desde ese lado.
    if (lastReentryIdx <= lastHardBreakIdx || touches[touches.length - 1].idx <= lastReentryIdx) return null;
  }
  if (oppositeSide > Math.max(1, Math.floor(span * 0.08))) return null;

  const projectedStart = valueAtMinute(currentMinute);
  const projectedEnd = valueAtMinute(Number(currentMinute) + 1);
  const price = Number(currentPrice);
  const distance = Math.abs(price - projectedStart);
  if ((candles.length - 1) - touches[touches.length - 1].idx > 26) return null;
  const nearLimit = Math.max(avgRange * 0.82, Math.abs(Number(currentRange || 0)) * 0.36, tol * 2.35);
  const respects = isSupport ? price >= projectedStart - tol * 0.10 : price <= projectedStart + tol * 0.10;
  const near = distance <= nearLimit;
  // V35: sin polaridad. Soporte solo existe si el precio está arriba y lo testea
  // desde arriba; resistencia solo si el precio está abajo y la testea desde abajo.
  if (!near || !respects) return null;

  const closeTouches = touches.filter((t) => t.source === "close" || t.closeDist <= tol * 1.05).length;
  const wickTouches = touches.filter((t) => t.source === "wick" || t.wickDist <= tol * 1.05).length;
  const bodyTouches = touches.filter((t) => t.source === "body" || t.bodyDist <= tol * 1.05).length;
  const reactedTouches = touches.filter((t) => t.reacted).length;
  const endpointExterior = Number(pA.exteriorRank || 0) + Number(pB.exteriorRank || 0) + Number(pA.sourceWeight || 0) * 0.18 + Number(pB.sourceWeight || 0) * 0.18;
  const externalPenalty = wrongCloses * 17 + hardBreaks * 16 + bodyCuts * 13 + middleCuts * 8 + oppositeSide * 12;
  const quality =
    touches.length * 25 +
    Math.min(3.4, reboundScore) * 18 +
    Math.min(30, separatedTouches) +
    Math.max(0, 1 - distance / Math.max(nearLimit, 1e-9)) * 30 +
    Math.min(18, slopeAbs / Math.max(avgRange * 0.04, 1e-9)) +
    Math.min(18, sourceScore * 2.2) +
    Math.min(16, endpointExterior * 8) +
    Math.min(12, closeTouches * 3 + bodyTouches * 2 + wickTouches * 1.6) +
    Math.min(10, reactedTouches * 3.5) -
    externalPenalty;
  return {
    direction: isSupport ? "CALL" : "PUT",
    quality,
    points: Math.min(6, 2 + touches.length + Math.floor(reboundScore) + (closeTouches >= 2 ? 1 : 0)),
    meta: {
      levelMode: "dynamic_line",
      levelType: isSupport ? "support" : "resistance",
      lineType: isSupport ? "support" : "resistance",
      direction: isSupport ? "CALL" : "PUT",
      anchorMinute,
      anchorValue,
      anchorIdx,
      slopePerCandle: slope,
      tolerance: tol,
      avgRange,
      touches: touches.length,
      closeTouches,
      wickTouches,
      bodyTouches,
      touchSources: touches.map((t) => t.source),
      touchMinutes: touches.map((t) => t.minute),
      touchDetails: touches.map((t) => ({ idx: t.idx, minute: t.minute, line: t.line, price: t.price, source: t.source, multiConfirm: t.multiConfirm, excursion: t.excursion, reacted: t.reacted })),
      firstTouchMinute: touches[0]?.minute,
      lastTouchMinute: touches[touches.length - 1]?.minute,
      reboundScore,
      wrongCloses,
      hardBreaks,
      bodyCuts,
      middleCuts,
      envelopeFails,
      maxRecentWrongRun,
      lastHardBreakIdx,
      lastReentryIdx,
      noPolarity: true,
      crosses: hardBreaks,
      level: projectedStart,
      lineAtEval: projectedStart,
      lineAtMinuteStart: projectedStart,
      lineAtMinuteEnd: projectedEnd,
      currentPrice: price,
      distanceToLine: distance,
      nearLimit,
      respectsLine: respects,
      stage: "linea_dinamica_extrema_no_polaridad_v35",
      movementFilter: "extremos_cierres_mechas_cuerpo_recorrido_sin_polaridad",
      status: isSupport
        ? "Soporte dinámico extremo: piso por mínimos/cierres/mechas. Solo COMPRA si el precio está arriba y retestea desde arriba; si rompe abajo se invalida hasta reingreso."
        : "Resistencia dinámica extrema: techo por máximos/cierres/mechas. Solo VENTA si el precio está abajo y retestea desde abajo; si rompe arriba se invalida hasta reingreso.",
      logic: isSupport
        ? "soporte dinámico extremo comprador sin polaridad: mínimos externos + cierres/mechas/cuerpo + recorrido + precio arriba => CALL"
        : "resistencia dinámica extrema vendedora sin polaridad: máximos externos + cierres/mechas/cuerpo + recorrido + precio abajo => PUT",
    },
  };
}
function findBestDynamicLine(symbol, minute, currentPrice, currentRange = 0) {
  const candles = getGiroPolarityCandles(symbol, minute, 80);
  if (!candles || candles.length < 14) return null;
  const lows = buildDynamicLineExtremeCandidates(candles, true, 36);
  const highs = buildDynamicLineExtremeCandidates(candles, false, 36);
  const matches = [];
  for (let a = 0; a < lows.length - 1; a++) {
    for (let b = a + 1; b < lows.length; b++) {
      if (lows[a].idx === lows[b].idx) continue;
      const m = scoreDynamicTrendLine(candles, lows[a], lows[b], true, minute, currentPrice, currentRange);
      if (m) matches.push(m);
    }
  }
  for (let a = 0; a < highs.length - 1; a++) {
    for (let b = a + 1; b < highs.length; b++) {
      if (highs[a].idx === highs[b].idx) continue;
      const m = scoreDynamicTrendLine(candles, highs[a], highs[b], false, minute, currentPrice, currentRange);
      if (m) matches.push(m);
    }
  }
  if (!matches.length) return null;
  matches.sort((a, b) =>
    b.quality - a.quality ||
    Number(b.meta?.touches || 0) - Number(a.meta?.touches || 0) ||
    Number(b.meta?.closeTouches || 0) - Number(a.meta?.closeTouches || 0) ||
    Number(b.meta?.wickTouches || 0) - Number(a.meta?.wickTouches || 0)
  );
  return matches[0];
}
function analyzeDynamicLineCandidate(candidate, minute) {
  const ticks = (candidate?.ticks || []).slice().sort((a, b) => Number(a.ms) - Number(b.ms));
  if (ticks.length < 3) return null;
  const evalMs = Math.max(1000, Number(EVAL_SEC || 45) * 1000);
  const pE = Number(getPriceAtMs(ticks, evalMs));
  if (!Number.isFinite(pE)) return null;
  const qs = ensureTicksWithBoundary(ticks, evalMs).map((p) => Number(p.quote)).filter(Number.isFinite);
  const range = qs.length ? Math.max(Math.max(...qs) - Math.min(...qs), Math.abs(pE) * 0.000001, 1e-9) : Math.abs(pE) * 0.000001;
  const match = findBestDynamicLine(candidate.symbol, minute, pE, range);
  if (!match) return null;
  match.meta.pE = pE;
  match.meta.evalSec = Number(EVAL_SEC || 45);
  return match;
}
function getSignalDynamicLineMeta(item) {
  const meta = item?.dynamicLine || item?.giroPolaridad || item?.lineaDinamica || null;
  if (!meta || typeof meta !== "object") return null;
  if (String(meta.levelMode || "") !== "dynamic_line") return null;
  if (!Number.isFinite(Number(meta.lineAtMinuteStart)) && !Number.isFinite(Number(meta.anchorValue))) return null;
  return meta;
}
function buildSignalDynamicLineEntryGate(item, side = "", checkMs = SIGNAL_AUTO_ENTRY_MS) {
  const meta = getSignalDynamicLineMeta(item);
  if (!meta) return { ok: false, pending: false, reason: "sin_linea_dinamica", message: "La señal no trae línea dinámica válida." };
  const price = getSignalPriceAtEntryCheckMs(item, checkMs);
  if (!Number.isFinite(price)) return { ok: false, pending: true, reason: "sin_precio_58", message: "Todavía no hay precio suficiente para validar la línea en 58s." };
  const line = getDynamicLineValue(meta, item?.minute, checkMs);
  if (!Number.isFinite(line)) return { ok: false, pending: false, reason: "linea_invalida", message: "No se pudo proyectar la línea dinámica." };
  const wanted = normalizeSignalConfirmationSide(side) || String(meta.direction || item?.direction || "").toUpperCase();
  const expected = normalizeSignalConfirmationSide(meta.direction || item?.direction || "");
  if (wanted && expected && wanted !== expected) {
    return {
      ok: false,
      pending: false,
      reason: "direccion_invalida_linea_dinamica",
      side: wanted,
      expectedSide: expected,
      check_ms: checkMs,
      check_sec: Math.round(checkMs / 1000),
      price,
      line,
      distance: Math.abs(price - line),
      levelType: String(meta.levelType || meta.lineType || ""),
      message: expected === "CALL"
        ? "Esta línea es soporte dinámico: solo habilita COMPRA."
        : "Esta línea es resistencia dinámica: solo habilita VENTA.",
    };
  }
  const isSupport = String(meta.levelType || meta.lineType || "") === "support" || expected === "CALL";
  const eps = Math.max(Math.abs(line) * 0.00000002, 1e-9);
  const ok = isSupport ? price >= line - eps : price <= line + eps;
  return {
    ok,
    pending: false,
    reason: ok ? "respeta_linea_dinamica" : "rompe_linea_dinamica",
    side: wanted || expected,
    check_ms: checkMs,
    check_sec: Math.round(checkMs / 1000),
    price,
    line,
    distance: Math.abs(price - line),
    levelType: isSupport ? "support" : "resistance",
    message: ok
      ? `Precio ${Math.round(checkMs / 1000)}s respeta línea dinámica (${price.toFixed(6)} vs ${line.toFixed(6)})`
      : `${isSupport ? "Soporte dinámico roto: precio debajo de la línea, no se convierte en venta" : "Resistencia dinámica rota: precio encima de la línea, no se convierte en compra"} (${price.toFixed(6)} vs ${line.toFixed(6)})`,
  };
}


function getRupturaDebilGiroPathStats(pts) {
  const clean = (Array.isArray(pts) ? pts : [])
    .map((p) => ({ ms: Number(p.ms), quote: Number(p.quote) }))
    .filter((p) => Number.isFinite(p.ms) && Number.isFinite(p.quote))
    .sort((a, b) => a.ms - b.ms);
  if (clean.length < 2) return { path: 0, net: 0, irregularity: 0, turns: 0 };
  let path = 0;
  let turns = 0;
  let lastSign = 0;
  for (let i = 1; i < clean.length; i++) {
    const d = clean[i].quote - clean[i - 1].quote;
    path += Math.abs(d);
    const sign = d > 0 ? 1 : d < 0 ? -1 : 0;
    if (sign && lastSign && sign !== lastSign) turns++;
    if (sign) lastSign = sign;
  }
  const net = clean[clean.length - 1].quote - clean[0].quote;
  return { path, net, irregularity: path / Math.max(Math.abs(net), 1e-9), turns };
}

function getRupturaDebilGiroRuns(pts, tol = 0) {
  const clean = (Array.isArray(pts) ? pts : [])
    .map((p) => ({ ms: Number(p.ms), quote: Number(p.quote) }))
    .filter((p) => Number.isFinite(p.ms) && Number.isFinite(p.quote))
    .sort((a, b) => a.ms - b.ms);
  const runs = [];
  let active = null;
  for (let i = 1; i < clean.length; i++) {
    const prev = clean[i - 1];
    const cur = clean[i];
    const d = cur.quote - prev.quote;
    const sign = d > tol ? 1 : d < -tol ? -1 : 0;
    if (!sign) continue;
    if (!active || active.sign !== sign) {
      if (active) runs.push(active);
      active = {
        sign,
        startMs: Number(prev.ms),
        endMs: Number(cur.ms),
        move: Math.abs(d),
        from: Number(prev.quote),
        to: Number(cur.quote),
        steps: 1,
      };
    } else {
      active.endMs = Number(cur.ms);
      active.move += Math.abs(d);
      active.to = Number(cur.quote);
      active.steps += 1;
    }
  }
  if (active) runs.push(active);
  return runs;
}

function getRupturaDebilGiroMaxPullback(pts) {
  const clean = (Array.isArray(pts) ? pts : [])
    .map((p) => ({ ms: Number(p.ms), quote: Number(p.quote) }))
    .filter((p) => Number.isFinite(p.ms) && Number.isFinite(p.quote))
    .sort((a, b) => a.ms - b.ms);
  if (clean.length < 2) return 0;
  let peak = Number(clean[0].quote);
  let maxPullback = 0;
  for (const p of clean) {
    const q = Number(p.quote);
    if (q > peak) peak = q;
    maxPullback = Math.max(maxPullback, peak - q);
  }
  return maxPullback;
}

function isRupturaDebilGiroBullishOnlySetup(pts, range = null) {
  const clean = (Array.isArray(pts) ? pts : [])
    .map((p) => ({ ms: Number(p.ms), quote: Number(p.quote) }))
    .filter((p) => Number.isFinite(p.ms) && Number.isFinite(p.quote))
    .sort((a, b) => a.ms - b.ms);
  if (clean.length < 3) return false;

  const open = Number(clean[0]?.quote);
  const current = Number(clean[clean.length - 1]?.quote);
  const qs = clean.map((p) => Number(p.quote));
  const localRange = Number.isFinite(Number(range)) && Number(range) > 0
    ? Number(range)
    : Math.max(Math.max(...qs) - Math.min(...qs), Math.abs(open) * 0.000001, 1e-9);

  const bullishTol = Math.max(localRange * 0.025, Math.abs(open) * 0.00000008, 1e-9);
  return Number.isFinite(open) && Number.isFinite(current) && current > open + bullishTol;
}

function analyzeRupturaDebilGiroEarlyBullishIrregular(pts, range, evalMs) {
  const clean = (Array.isArray(pts) ? pts : [])
    .map((p) => ({ ms: Number(p.ms), quote: Number(p.quote) }))
    .filter((p) => Number.isFinite(p.ms) && Number.isFinite(p.quote))
    .sort((a, b) => a.ms - b.ms);
  if (clean.length < 6) return null;

  const evalTime = Number(evalMs || clean[clean.length - 1]?.ms || 0);
  if (evalTime < 8000 || evalTime > 30000) return null;

  const quotes = clean.map((p) => Number(p.quote));
  const open = Number(quotes[0]);
  const current = Number(quotes[quotes.length - 1]);
  const high = Math.max(...quotes);
  const low = Math.min(...quotes);
  const localRange = Math.max(
    Number(range || 0),
    high - low,
    Math.abs(open) * 0.000001,
    1e-9
  );
  const tol = Math.max(localRange * 0.012, Math.abs(open) * 0.00000005, 1e-9);

  // Filtro duro: solo vela alcista en el momento de detección.
  if (!isRupturaDebilGiroBullishOnlySetup(clean, localRange)) return null;

  const stats = getRupturaDebilGiroPathStats(clean);
  const runs = getRupturaDebilGiroRuns(clean, tol);
  const upRuns = runs.filter((r) => r.sign > 0 && r.move > tol * 1.2);
  const downRuns = runs.filter((r) => r.sign < 0 && r.move > tol * 1.2);
  const upMoves = upRuns.map((r) => Number(r.move)).filter(Number.isFinite);
  const downMoves = downRuns.map((r) => Number(r.move)).filter(Number.isFinite);

  const totalUp = upMoves.reduce((a, b) => a + b, 0);
  const totalDown = downMoves.reduce((a, b) => a + b, 0);
  const maxUpRun = upMoves.length ? Math.max(...upMoves) : 0;
  const maxDownRun = downMoves.length ? Math.max(...downMoves) : 0;
  const avgUp = upMoves.length ? totalUp / upMoves.length : 0;
  const upVar = upMoves.length >= 2
    ? upMoves.reduce((a, b) => a + Math.pow(b - avgUp, 2), 0) / upMoves.length
    : 0;
  const upCv = avgUp > 0 ? Math.sqrt(upVar) / avgUp : 0;

  const net = current - open;
  const highFromOpen = high - open;
  const maxPullback = getRupturaDebilGiroMaxPullback(clean);
  const path = Math.max(stats.path, totalUp + totalDown, 1e-9);
  const efficiency = net / path;
  const pullbackRatio = totalDown / Math.max(totalUp, 1e-9);
  const maxPullbackRatio = maxPullback / Math.max(totalUp, localRange, 1e-9);

  const firstUp = upMoves[0] || 0;
  const lastUp = upMoves[upMoves.length - 1] || 0;
  const midUp = upMoves.length >= 3 ? upMoves[Math.floor(upMoves.length / 2)] : 0;

  // V77: los ejemplos marcados muestran que no siempre hay una "ruptura perfecta".
  // Lo importante es: comprador intenta avanzar alcista, pero los empujes salen desparejos,
  // devuelve mucho o aparece vendedor antes de 30s.
  const anySellerEntry = downMoves.length > 0 && maxDownRun >= Math.max(localRange * 0.12, tol * 2.0);
  const decreasingPushes = upMoves.length >= 2 && (lastUp <= firstUp * (anySellerEntry ? 0.96 : 0.84));
  const unevenPushes = upMoves.length >= 3 && (upCv >= 0.30 || Math.min(...upMoves) <= Math.max(...upMoves) * 0.60);
  const differentSizedBreaks = upMoves.length >= 2 && (upCv >= 0.24 || (midUp && Math.abs(midUp - firstUp) >= avgUp * 0.28));
  const zigzagDirty = stats.turns >= 3 || (stats.irregularity >= 1.42 && stats.turns >= 2);
  const givesBackMuch = pullbackRatio >= 0.24 || maxPullbackRatio >= 0.17;
  const strongContrary = maxDownRun >= Math.max(localRange * 0.22, maxUpRun * 0.48, tol * 2.8);

  const sellerRunsInWindow = downRuns.filter((r) => Number(r.startMs) <= 30000);
  const sellerAfter15 = sellerRunsInWindow.some((r) => Number(r.startMs) >= 15000 && Number(r.startMs) <= 30000 && Number(r.move) >= Math.max(localRange * 0.14, tol * 2.1));
  const sellerAfter20 = sellerRunsInWindow.some((r) => Number(r.startMs) >= 20000 && Number(r.startMs) <= 30000 && Number(r.move) >= Math.max(localRange * 0.16, tol * 2.3));
  const buyerTriesTwiceAndFails =
    upRuns.length >= 2 &&
    downRuns.length >= 1 &&
    totalDown >= totalUp * 0.18 &&
    (decreasingPushes || differentSizedBreaks || givesBackMuch);
  const secondPushWeakAfterSeller =
    upRuns.length >= 2 &&
    downRuns.length >= 1 &&
    lastUp <= Math.max(firstUp * 0.98, avgUp * 0.88) &&
    anySellerEntry;

  const highIdx = quotes.indexOf(high);
  const highMs = Number(clean[highIdx]?.ms || evalTime);
  const stalledAfterHigh = highIdx <= clean.length - 3 && (high - current) >= Math.max(localRange * 0.10, tol * 1.5);
  const recent = clean.slice(Math.max(0, clean.length - 4));
  const recentQuotes = recent.map((p) => Number(p.quote));
  const recentRange = recentQuotes.length ? Math.max(...recentQuotes) - Math.min(...recentQuotes) : 0;
  const lateStall = recent.length >= 3 && recentRange <= Math.max(localRange * 0.18, tol * 2.2) && highMs <= evalTime - 4000;

  // Evita marcar un CALL sano como giro: impulso limpio, poca devolución y alta eficiencia.
  const cleanBullishContinuation =
    efficiency >= 0.78 &&
    pullbackRatio <= 0.18 &&
    stats.turns <= 1 &&
    !decreasingPushes &&
    !unevenPushes &&
    !strongContrary;
  if (cleanBullishContinuation) return null;

  // Debe haber desplazamiento alcista suficiente. No queremos ruido sin intención compradora.
  const enoughBullishDisplacement = highFromOpen >= Math.max(localRange * 0.28, tol * 4.0) && net > tol * 1.3;
  if (!enoughBullishDisplacement) return null;

  let points = 0;
  const reasons = [];

  // Base: vela alcista con intención, pero no sana/limpia.
  points += 1;
  reasons.push("vela alcista con desplazamiento inicial");

  if (evalTime <= 15000) { points += 2; reasons.push("irregularidad en 0-15s"); }
  else { points += 1; reasons.push("irregularidad en 15-30s"); }

  if (decreasingPushes) { points += 2; reasons.push("empujes compradores cada vez más cortos"); }
  if (differentSizedBreaks || unevenPushes) { points += 2; reasons.push("quiebres/impulsos de distinto tamaño"); }
  if (givesBackMuch) { points += 2; reasons.push("avanza y devuelve demasiado"); }
  if (zigzagDirty) { points += 2; reasons.push("zigzag sucio / avance desordenado"); }
  if (stalledAfterHigh || lateStall) { points += 1; reasons.push("se traba después de avanzar"); }
  if (buyerTriesTwiceAndFails) { points += 2; reasons.push("comprador intenta dos veces y falla calidad"); }
  if (secondPushWeakAfterSeller) { points += 1; reasons.push("segunda respuesta compradora débil tras vendedor"); }
  if (strongContrary) { points += 3; reasons.push("entrada fuerte del vendedor"); }
  else if (sellerAfter20) {
    points += 2;
    reasons.push("vendedor entra antes de 30s");
  } else if (maxDownRun >= Math.max(localRange * 0.15, maxUpRun * 0.34, tol * 2.1)) {
    points += 1;
    reasons.push("presión vendedora presente");
  }

  const hasIrregularCore = decreasingPushes || differentSizedBreaks || unevenPushes || givesBackMuch || zigzagDirty || stalledAfterHigh || lateStall || buyerTriesTwiceAndFails || secondPushWeakAfterSeller || sellerAfter20;
  if (!hasIrregularCore) return null;

  // Con irregularidad sola ya puede salir. Con vendedor fuerte gana prioridad.
  if (points < 5) return null;

  const earlyBonus = evalTime <= 15000 ? 18 : evalTime <= 22000 ? 10 : 4;
  const priorityBonus =
    (strongContrary ? 36 : 0) +
    (sellerAfter20 ? 14 : sellerAfter15 ? 8 : 0) +
    (buyerTriesTwiceAndFails ? 12 : 0) +
    (givesBackMuch ? 8 : 0);
  const quality =
    points * 14 +
    earlyBonus +
    priorityBonus +
    Math.min(18, stats.turns * 4) +
    Math.min(18, Math.max(0, stats.irregularity - 1) * 12) +
    Math.min(16, pullbackRatio * 18) +
    Math.min(10, upCv * 12) -
    Math.max(0, evalTime - 15000) / 2200;

  const logicText = `Vela alcista con arranque irregular ${evalTime <= 15000 ? "0-15s" : "15-30s"}: ${reasons.join(", ")}.`;

  return {
    direction: "PUT",
    quality,
    points,
    meta: {
      level: high,
      levelMode: "ruptura_debil_giro",
      levelType: "early_bullish_irregularity",
      direction: "PUT",
      tolerance: tol,
      zone: Math.max(tol * 4, localRange * 0.10),
      zoneLow: high - Math.max(tol * 2, localRange * 0.045),
      zoneHigh: high + Math.max(tol * 2, localRange * 0.045),
      points,
      maxPoints: 12,
      reasons,
      p0: open,
      pE: current,
      high,
      low,
      range: localRange,
      evalSec: Math.round(evalTime / 1000),
      earlyWindow: evalTime <= 15000 ? "0-15s" : "15-30s",
      analysisWindowMs: evalTime,
      bullishCandleOnly: true,
      disabledMirrorCall: true,
      earlyIrregularityOnly: true,
      strongContrary,
      sellerAfter15,
      sellerAfter20,
      buyerTriesTwiceAndFails,
      secondPushWeakAfterSeller,
      totalUp,
      totalDown,
      maxUpRun,
      maxDownRun,
      pullbackRatio,
      maxPullback,
      maxPullbackRatio,
      pathStats: stats,
      efficiency,
      upRuns: upMoves,
      downRuns: downMoves,
      upCv,
      decreasingPushes,
      unevenPushes,
      differentSizedBreaks,
      zigzagDirty,
      givesBackMuch,
      stalledAfterHigh,
      lateStall,
      breakMs: null,
      breakPrice: null,
      stage: "ruptura_debil_giro_inicio_irregular_alcista_v77",
      movementFilter: "vela_alcista_con_arranque_irregular_0_30s_ejemplos",
      priority: strongContrary || sellerAfter20 ? "ALTA" : "NORMAL",
      logic: logicText,
      status: `🔁 Ruptura Débil Giro: vela alcista con arranque irregular temprano${strongContrary ? " + vendedor fuerte" : sellerAfter20 ? " + vendedor antes de 30s" : ""}. Señal a VENTA. Auto solo en ${SIGNAL_AUTO_ENTRY_SEC}s con ${SIGNAL_CONFIRM_MIN} puntos manuales.`,
    },
  };
}

function analyzeRupturaDebilGiroCandidate(candidate, minute, opts = {}) {
  const ticks = (candidate?.ticks || []).slice().sort((a, b) => Number(a.ms) - Number(b.ms));
  if (ticks.length < 6) return null;
  const lastMs = Number(ticks[ticks.length - 1]?.ms || 0);
  const optEvalMs = Number(opts?.evalMs);
  const evalMs = Math.max(8000, Math.min(30000, Number.isFinite(optEvalMs) ? optEvalMs : lastMs));
  if (evalMs < 8000 || evalMs > 30000) return null;
  const pts = ensureTicksWithBoundary(ticks, evalMs);
  if (pts.length < 6) return null;
  const qs = pts.map((p) => Number(p.quote)).filter(Number.isFinite);
  if (qs.length < 6) return null;
  const high = Math.max(...qs);
  const low = Math.min(...qs);
  const range = Math.max(high - low, Math.abs(qs[0]) * 0.000001, 1e-9);
  if (!Number.isFinite(range) || range <= 0) return null;

  // V76: este modo queda enfocado SOLO en velas alcistas con arranque irregular.
  // Ya no exige ruptura clásica; la irregularidad temprana sola puede crear señal.
  // Si además aparece una entrada fuerte vendedora, se prioriza frente a otros pares.
  if (!isRupturaDebilGiroBullishOnlySetup(pts, range)) return null;

  return analyzeRupturaDebilGiroEarlyBullishIrregular(pts, range, evalMs);
}

function evaluateMinute(minute, opts = {}) {
  if (areSignalsPaused()) return false;

  const evalOptions = opts && typeof opts === "object" ? opts : {};
  const data = minuteData[minute];
  if (!data) return false;

  const candidates = [];
  let readySymbols = 0;

  for (const sym of SYMBOLS) {
    const ticks = data[sym] || [];
    if (ticks.length >= MIN_TICKS) readySymbols++;
    if (ticks.length < MIN_TICKS) continue;

    const prices = ticks.map((t) => Number(t.quote)).filter(Number.isFinite);
    if (prices.length < MIN_TICKS) continue;

    const move = prices[prices.length - 1] - prices[0];
    let vol = 0;
    for (let i = 1; i < prices.length; i++) vol += Math.abs(prices[i] - prices[i - 1]);
    vol = vol / Math.max(1, prices.length - 1);

    candidates.push({
      symbol: sym,
      move,
      score: Math.abs(move) / (vol || 1e-9),
      ticks,
      vol,
    });
  }

  if (readySymbols < MIN_SYMBOLS_READY || candidates.length === 0) return false;

  const activeMode = normalizeSignalMode(signalMode);
  const matches = [];
  for (const c of candidates) {
    let match = null;
    let matchSource = "SNR_INTERACCION_NIVEL";
    if (isDynamicLineMode(activeMode)) {
      match = analyzeDynamicLineCandidate(c, minute);
      matchSource = "LINEA_DINAMICA";
    } else if (isRupturaDebilGiroMode(activeMode)) {
      // V76: doble seguro para que este modo no muestre velas bajistas ni señales COMPRA.
      // Solo acepta velas alcistas con irregularidad temprana en 0-30s.
      const evalMsForRuptura = Number(evalOptions?.evalMs || 0);
      const ptsForRuptura = ensureTicksWithBoundary(c.ticks || [], Number.isFinite(evalMsForRuptura) && evalMsForRuptura > 0 ? evalMsForRuptura : Number((c.ticks || []).slice(-1)[0]?.ms || 0));
      const qsForRuptura = ptsForRuptura.map((p) => Number(p.quote)).filter(Number.isFinite);
      const rangeForRuptura = qsForRuptura.length
        ? Math.max(Math.max(...qsForRuptura) - Math.min(...qsForRuptura), Math.abs(qsForRuptura[0]) * 0.000001, 1e-9)
        : 0;
      if (!isRupturaDebilGiroBullishOnlySetup(ptsForRuptura, rangeForRuptura)) continue;

      match = analyzeRupturaDebilGiroCandidate(c, minute, evalOptions);
      if (match && String(match.direction || "").toUpperCase() !== "PUT") match = null;
      matchSource = "RUPTURA_DEBIL_GIRO_INICIO_IRREGULAR";
    } else if (isSNRPolaridadMode(activeMode)) {
      match = analyzeSNRPolaridadCandidate(c, minute, RULES_GIRO_DOBLE_RECHAZO, evalOptions);
      matchSource = "SNR_POLARIDAD";
    } else {
      match = analyzeGiroSNRSecondTouchCandidate(c, minute, RULES_GIRO_DOBLE_RECHAZO, evalOptions);
    }
    if (!match) continue;

    matches.push({
      ...c,
      direction: match.direction,
      quality: match.quality,
      giroNivelScore: Math.round(match.quality),
      giroNivelPoints: match.points,
      giroPolaridadScore: Math.round(match.quality),
      giroPolaridadPoints: match.points,
      giroPolaridadMeta: match.meta,
      dynamicLineMeta: String(match.meta?.levelMode || "") === "dynamic_line" ? match.meta : null,
      matchSource,
    });
  }

  if (!matches.length) return false;
  matches.sort((a, b) => {
    if (isRupturaDebilGiroMode(activeMode)) {
      const ap = a.giroPolaridadMeta?.strongContrary || a.giroPolaridadMeta?.sellerAfter20 ? 1 : 0;
      const bp = b.giroPolaridadMeta?.strongContrary || b.giroPolaridadMeta?.sellerAfter20 ? 1 : 0;
      if (bp !== ap) return bp - ap;
    }
    return (
      b.quality - a.quality ||
      b.giroNivelPoints - a.giroNivelPoints ||
      b.giroNivelScore - a.giroNivelScore
    );
  });

  // V14: si hay interacción con nivel, se elige la mejor; no se cancela por empate de calidad.

  const bestMatch = matches[0];
  const prealertSec = Number(bestMatch?.giroPolaridadMeta?.evalSec || evalOptions.evalSec || EVAL_SEC || 45);
  const added = addSignal(minute, bestMatch.symbol, bestMatch.direction, bestMatch.ticks, {
    mode: activeMode,
    mode_version: getModeVersion(activeMode),
    giroNivelScore: bestMatch.giroNivelScore,
    giroNivelPoints: bestMatch.giroNivelPoints,
    giroPolaridadScore: bestMatch.giroPolaridadScore,
    giroPolaridadPoints: bestMatch.giroPolaridadPoints,
    giroPolaridad: bestMatch.giroPolaridadMeta,
    dynamicLine: bestMatch.dynamicLineMeta,
    aiLocalMatchSource: bestMatch.matchSource,
    signalLifecycleStage: "prealert",
    signalPrealertAtSec: prealertSec,
    signalRadar: !isDynamicLineMode(activeMode) && !!evalOptions.radar,
    signalRadarStartSec: !isDynamicLineMode(activeMode) ? Number(evalOptions.radarStartSec || SNR_RADAR_START_SEC) : null,
    signalRadarEndSec: !isDynamicLineMode(activeMode) ? Number(evalOptions.radarEndSec || EVAL_SEC || 45) : null,
    signalAutoEntrySec: SIGNAL_AUTO_ENTRY_SEC,
    signalRequiresManualPoints: SIGNAL_CONFIRM_MIN,
    signalConfirmations: [],
  });
  return !!added;
}

/* =========================
   Add signal
========================= */
function fmtTimeUTC(minute) {
  return new Date(minute * 60000).toISOString().substr(11, 8) + " UTC";
}
function addSignal(minute, symbol, direction, ticks, extra = {}) {
  if (areSignalsPaused()) return null;
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

  if (history.some((x) => x.id === item.id)) return null;

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
        openChartModal(item, { source: "signals", signalId: item.id || "" });

        if (isItemLiveMinute(item)) {
          modalLive = true;
          updateModalLiveUI();
          requestModalDraw(true);
        }
      } catch {}
    });
  }

  return item;
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
    void ensureAuthorized().then(() => refreshAccountBalance({ force: true })).then(() => updateC100PanelUI()).catch(() => {});
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
loadMentalCooldown();
loadDiscipline();
startPendingContractWatchdog({ immediate: true });
loadTradeLinks();
loadExecutionMode();
loadEntryTimingMode();
loadKeepClosedAwaySignals();

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
ensureEntryTimingModeButton();
applyEntryTimingModeUI();

ensureTradingAccountButton();
applyTradingAccountUI();
applyTradingAccountBannerUI();
ensureC100Panel();
updateC100PanelUI();
initWakeButton();
initTokenAndStakeUI();

ensureResetCacheButton();
ensureSplitClearButtons();
try { ensureSettingsSelfCheckButton(); runSettingsMenuSelfCheck({ silent: true }); } catch {}

applyModalTradeButtonsLayout();
updateModalCandleStatusUI();
updateMentalCooldownUI();
updateDisciplineLockUI(false);

seedTradesJournalFromHistory();

initTabs();
paintLiveSymbolButtons();
ensureInlineClearButtons();
ensureLiveAnalysisPauseButton();
applyLiveAnalysisPauseUI();
ensurePracticeFilterButton();
applyPracticeFilterButtonUI();
ensurePracticeExportSaveButton();
updatePracticeExportSaveButtonUI();
updateExportTradesButtonUI();

connect();
