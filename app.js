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
   Trade / Token / Currency
========================= */
const DERIV_TOKEN_KEY = "derivDemoToken_v2";
const TRADE_STAKE_KEY = "tradeStake_v2";
const TRADE_CCY_KEY = "tradeCurrency_v1";

const DEFAULT_STAKE = 1; // demo
const DEFAULT_DURATION = 1;
const DEFAULT_DURATION_UNIT = "m";

/* =========================
   Low power mode
========================= */
let lowPowerMode = false;
const LOWPOWER_KEY = "lowPowerMode_v1";

const UI_INTERVAL_NORMAL_MS = 500;
const UI_INTERVAL_LOW_MS = 1200;

const HISTORY_COUNT_MAX_NORMAL = 5000;
const HISTORY_COUNT_MAX_LOW = 1200;

function getUiIntervalMs() {
  return lowPowerMode ? UI_INTERVAL_LOW_MS : UI_INTERVAL_NORMAL_MS;
}
function getHistoryCountMax() {
  return lowPowerMode ? HISTORY_COUNT_MAX_LOW : HISTORY_COUNT_MAX_NORMAL;
}

/* =========================
   DOM
========================= */
const $ = (id) => document.getElementById(id);
const qsAll = (sel) => Array.from(document.querySelectorAll(sel));

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

// Settings inputs
const tokenInput = $("tokenInput");
const saveTokenBtn = $("saveTokenBtn");
const clearTokenBtn = $("clearTokenBtn");
const currencySelect = $("currencySelect");
const stakeInput = $("stakeInput");
const checkBalanceBtn = $("checkBalanceBtn");

const exportVotedBtn = $("exportVotedBtn");
const lowPowerBtn = $("lowPowerBtn");
const resetCacheBtn = $("resetCacheBtn");

// Chart modal
const chartModal = $("chartModal");
const modalCloseBtn = $("modalCloseBtn");
const modalCloseBackdrop = $("modalCloseBackdrop");
const modalTitle = $("modalTitle");
const modalSub = $("modalSub");
const minuteCanvas = $("minuteCanvas");
const modalOpenDerivBtn = $("modalOpenDerivBtn");

const modalBuyCallBtn = $("modalBuyCallBtn");
const modalBuyPutBtn = $("modalBuyPutBtn");
const modalLiveBtn = $("modalLiveBtn");

/* =========================
   State
========================= */
let ws = null;

let soundEnabled = false;
let vibrateEnabled = true;

let EVAL_SEC = 45;
let strongMode = false;

let history = loadHistory();

let minuteData = {};
let candleOC = {};
let lastSeenMinute = null;

let lastEvaluatedMinute = null;
let evalRetryTimer = null;

// tick/time sync
let lastTickLocalNowMs = null;
let lastTickEpochMs = null;
let serverOffsetMs = 0;
let currentMinuteStartMs = null;

let lastQuoteBySymbol = {};
let lastMinuteSeenBySymbol = {};

// chart modal state
let modalCurrentItem = null;
let modalLiveOn = false;
let modalLiveTimer = null;

/* =========================
   Icons
========================= */
const CHART_ICON_SVG = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
<path d="M4 18V6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
<path d="M4 18H20" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
<path d="M6 14l4-4 3 3 5-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
<circle cx="10" cy="10" r="1" fill="currentColor"/><circle cx="13" cy="13" r="1" fill="currentColor"/><circle cx="18" cy="6" r="1" fill="currentColor"/>
</svg>`;

/* =========================
   Utils
========================= */
function setStatus(msg) {
  if (statusEl) statusEl.textContent = msg;
}

function makeDerivTraderUrl(symbol) {
  const u = new URL(DERIV_DTRADER_TEMPLATE);
  u.searchParams.set("symbol", symbol);
  return u.toString();
}
const labelDir = (d) => (d === "CALL" ? "COMPRA" : "VENTA");

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

function loadBool(key, fallback) {
  const v = localStorage.getItem(key);
  return v === null ? fallback : v === "1";
}
function saveBool(key, value) {
  localStorage.setItem(key, value ? "1" : "0");
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
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

/* =========================
   Token / Currency / Stake
========================= */
function getToken() {
  try { return localStorage.getItem(DERIV_TOKEN_KEY) || ""; } catch { return ""; }
}
function setToken(v) {
  try { localStorage.setItem(DERIV_TOKEN_KEY, v || ""); } catch {}
}
function clearToken() {
  try { localStorage.removeItem(DERIV_TOKEN_KEY); } catch {}
}

function getCurrency() {
  try { return localStorage.getItem(TRADE_CCY_KEY) || "USD"; } catch { return "USD"; }
}
function setCurrency(v) {
  try { localStorage.setItem(TRADE_CCY_KEY, v || "USD"); } catch {}
}

function getStake() {
  const raw = localStorage.getItem(TRADE_STAKE_KEY);
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_STAKE;
}
function setStake(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return;
  try { localStorage.setItem(TRADE_STAKE_KEY, String(v)); } catch {}
}

/* =========================
   UI timers
========================= */
let uiTimer = null;

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
  const textEl = $("countdownText") || countdownEl;

  if (!currentMinuteStartMs) {
    if (textEl) textEl.textContent = "⏱️ 60";
    countdownEl.classList.remove("urgent", "warn", "tick");
    return;
  }

  const serverNow = Date.now() + (serverOffsetMs || 0);
  const msInMinute = (serverNow - currentMinuteStartMs) % 60000;

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

function startUiTimers() {
  if (uiTimer) clearInterval(uiTimer);
  uiTimer = setInterval(() => {
    updateTickHealthUI();
    updateCountdownUI();
  }, getUiIntervalMs());
}

function paintLowPowerBtn() {
  if (!lowPowerBtn) return;
  lowPowerBtn.textContent = lowPowerMode ? "🪫 Bajo consumo ON" : "🔋 Bajo consumo OFF";
  lowPowerBtn.classList.toggle("active", lowPowerMode);
  lowPowerBtn.title = lowPowerMode
    ? "Ahorra batería: UI más lenta, histórico más liviano, WS se corta en background"
    : "Modo normal";
}

/* =========================
   Hits / Counter
========================= */
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
   Eval sec + strong mode
========================= */
(function initEvalMode() {
  const savedSec = parseInt(localStorage.getItem("evalSec") || "45", 10);
  EVAL_SEC = [45, 50, 55].includes(savedSec) ? savedSec : 45;

  const paintEval = () =>
    evalBtns.forEach((b) => {
      const sec = parseInt(b.dataset.sec || "0", 10);
      b.classList.toggle("active", sec === EVAL_SEC);
    });
  paintEval();

  evalBtns.forEach(
    (b) =>
      (b.onclick = () => {
        const v = parseInt(b.dataset.sec || "45", 10);
        EVAL_SEC = [45, 50, 55].includes(v) ? v : 45;
        localStorage.setItem("evalSec", String(EVAL_SEC));
        paintEval();
      })
  );

  strongMode = loadBool("strongMode", false);
  const paintMode = () => {
    if (!modeBtn) return;
    modeBtn.textContent = strongMode ? "🟧 Modo FUERTE" : "🟦 Modo NORMAL";
    modeBtn.classList.toggle("active-strong", strongMode);
  };
  paintMode();

  if (modeBtn)
    modeBtn.onclick = () => {
      strongMode = !strongMode;
      saveBool("strongMode", strongMode);
      paintMode();
    };
})();

/* =========================
   Sound / Vibration
========================= */
(function initSoundToggle() {
  soundEnabled = loadBool("soundEnabled", false);
  if (soundBtn) {
    soundBtn.classList.toggle("active", soundEnabled);
    soundBtn.textContent = soundEnabled ? "🔊 Sonido ON" : "🔇 Sonido OFF";
  }
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
        soundBtn.classList.add("active");
        soundBtn.textContent = "🔊 Sonido ON";
      } catch {
        alert("⚠️ El navegador bloqueó el audio. Tocá nuevamente.");
      }
      return;
    }
    soundEnabled = false;
    saveBool("soundEnabled", false);
    soundBtn.classList.remove("active");
    soundBtn.textContent = "🔇 Sonido OFF";
  };
})();

(function initVibrationToggle() {
  vibrateEnabled = loadBool("vibrateEnabled", true);
  if (!vibrateBtn) return;
  vibrateBtn.classList.toggle("active", vibrateEnabled);
  vibrateBtn.textContent = vibrateEnabled ? "📳 Vibración ON" : "📳 Vibración OFF";

  vibrateBtn.onclick = () => {
    vibrateEnabled = !vibrateEnabled;
    saveBool("vibrateEnabled", vibrateEnabled);
    vibrateBtn.classList.toggle("active", vibrateEnabled);
    vibrateBtn.textContent = vibrateEnabled ? "📳 Vibración ON" : "📳 Vibración OFF";
    if (vibrateEnabled && "vibrate" in navigator) navigator.vibrate([80]);
  };
})();

if (copyBtn && feedbackEl) copyBtn.onclick = () => navigator.clipboard.writeText(feedbackEl.value || "");

/* =========================
   Clear history
========================= */
function clearHistory() {
  history = [];
  saveHistory(history);
  updateCounter();
  if (signalsEl) signalsEl.innerHTML = "";
  if (feedbackEl) feedbackEl.value = "";
}
if (clearHistoryBtn)
  clearHistoryBtn.onclick = () => {
    if (confirm("¿Seguro que querés borrar todas las señales guardadas?")) clearHistory();
  };

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
      minuteComplete: !!it.minuteComplete,
      ticks: Array.isArray(it.ticks) ? it.ticks : [],
    })),
  };
}
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
if (exportVotedBtn) exportVotedBtn.onclick = exportVotedSignals;

/* =========================
   Reset SW/Cache button
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
    location.reload();
  } catch {
    location.reload();
  }
}
if (resetCacheBtn) resetCacheBtn.onclick = resetServiceWorkerAndCaches;

/* =========================
   Low power button
========================= */
if (lowPowerBtn) {
  lowPowerBtn.onclick = () => {
    lowPowerMode = !lowPowerMode;
    saveLowPowerMode();
    paintLowPowerBtn();
    startUiTimers();

    // si hay WS abierto, lo cerramos para que reconecte limpio
    try { if (ws && ws.readyState === 1) ws.close(); } catch {}
  };
}

/* =========================
   Settings: token/currency/stake UI
========================= */
(function initTokenCurrencyStakeUI() {
  if (tokenInput) tokenInput.value = getToken() ? "********" : "";

  if (currencySelect) {
    currencySelect.value = getCurrency();
    currencySelect.onchange = () => setCurrency(currencySelect.value || "USD");
  }

  if (stakeInput) {
    stakeInput.value = String(getStake());
    stakeInput.onchange = () => setStake(stakeInput.value);
  }

  if (saveTokenBtn && tokenInput) {
    saveTokenBtn.onclick = () => {
      const v = (tokenInput.value || "").trim();
      if (!v || v === "********") {
        alert("Pegá el token real (no los asteriscos).");
        return;
      }
      setToken(v);
      tokenInput.value = "********";
      alert("✅ Token guardado.");
      resetAuthState();
    };
  }

  if (clearTokenBtn && tokenInput) {
    clearTokenBtn.onclick = () => {
      if (!confirm("¿Borrar token guardado?")) return;
      clearToken();
      tokenInput.value = "";
      alert("🗑️ Token borrado.");
      resetAuthState();
    };
  }

  if (checkBalanceBtn) {
    checkBalanceBtn.onclick = async () => {
      try {
        await ensureAuthorized();
        const b = await getBalance();
        setStatus(`💰 Saldo: ${b.balance} ${b.currency}`);
      } catch (e) {
        setStatus(`⚠️ Balance: ${e?.message || e}`);
      }
    };
  }
})();

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
   WS req_id requests
========================= */
let reqSeq = 1;
const pending = new Map();

function wsRequest(payload) {
  return new Promise((resolve, reject) => {
    if (!ws || ws.readyState !== 1) return reject(new Error("WS not open"));
    const req_id = reqSeq++;
    const t = setTimeout(() => {
      pending.delete(req_id);
      reject(new Error("timeout"));
    }, HISTORY_TIMEOUT_MS);
    pending.set(req_id, { resolve, reject, t });
    ws.send(JSON.stringify({ ...payload, req_id }));
  });
}

/* =========================
   Authorize + Balance + Buy
========================= */
let isAuthorized = false;
let authorizeInFlight = null;
let tradeInFlight = false;

function resetAuthState() {
  isAuthorized = false;
  authorizeInFlight = null;
  tradeInFlight = false;
}

async function ensureAuthorized() {
  const token = getToken();
  if (!token) throw new Error("No hay token DEMO guardado (Config).");

  if (isAuthorized) return true;
  if (authorizeInFlight) return authorizeInFlight;

  authorizeInFlight = wsRequest({ authorize: token })
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

async function getBalance() {
  const res = await wsRequest({ balance: 1, subscribe: 0 });
  if (res?.error) throw new Error(res.error.message || "balance error");
  const b = res?.balance;
  if (!b) throw new Error("balance vacío");
  return { balance: Number(b.balance).toFixed(2), currency: String(b.currency || "") };
}

function getDefaultTradeSymbol() {
  const last = history && history.length ? history[history.length - 1] : null;
  return (last && last.symbol) || "R_25";
}

async function buyOneClick(side /* "CALL" | "PUT" */, symbolOverride = null) {
  if (tradeInFlight) throw new Error("Operación en curso");
  tradeInFlight = true;

  try {
    await ensureAuthorized();

    const symbol = symbolOverride || getDefaultTradeSymbol();
    const stake = getStake();
    const currency = getCurrency();

    // Chequeo saldo real antes de comprar (y te lo muestra)
    const b = await getBalance();
    setStatus(`💰 Saldo: ${b.balance} ${b.currency} | Comprando ${side} ${symbol}…`);

    const res = await wsRequest({
      buy: 1,
      price: stake,
      parameters: {
        amount: stake,
        basis: "stake",
        contract_type: side,
        currency,
        duration: DEFAULT_DURATION,
        duration_unit: DEFAULT_DURATION_UNIT,
        symbol,
      },
    });

    if (res?.error) throw new Error(res.error.message || "buy error");
    return res;
  } finally {
    tradeInFlight = false;
  }
}

/* =========================
   Chart modal LIVE
========================= */
function setModalLive(on) {
  modalLiveOn = !!on;

  if (modalLiveBtn) {
    modalLiveBtn.setAttribute("aria-pressed", modalLiveOn ? "true" : "false");
    modalLiveBtn.textContent = modalLiveOn ? "🟩 LIVE ON" : "🟦 LIVE OFF";
  }

  if (modalLiveTimer) {
    clearInterval(modalLiveTimer);
    modalLiveTimer = null;
  }

  if (modalLiveOn) {
    // refresco rápido solo mientras esté on
    modalLiveTimer = setInterval(() => {
      try {
        if (!modalCurrentItem) return;
        drawModalChart();
      } catch {}
    }, 220);
  }
}

function drawModalChart() {
  if (!modalCurrentItem || !minuteCanvas) return;

  const item = modalCurrentItem;
  const minute = item.minute;
  const sym = item.symbol;

  // si ya terminó el minuto de ESA señal: cortar LIVE y dibujar fijo
  if (item.minuteComplete) {
    if (modalLiveOn) setModalLive(false);
    drawDerivLikeChart(minuteCanvas, item.ticks || []);
    return;
  }

  // si LIVE está ON, usar minuteData (en vivo). si no, usar lo que tenga item.ticks (snapshot)
  let ticks = item.ticks || [];

  if (modalLiveOn) {
    const data = minuteData[minute] && minuteData[minute][sym];
    if (Array.isArray(data) && data.length >= 2) ticks = data.slice();
  }

  drawDerivLikeChart(minuteCanvas, ticks);
}

function openChartModal(item) {
  modalCurrentItem = item;

  if (!chartModal || !modalTitle || !modalSub) return;

  modalTitle.textContent = `${item.symbol} – ${labelDir(item.direction)} | [${item.mode || "NORMAL"}]`;

  const info = item.minuteComplete
    ? `minuto cerrado | ticks: ${(item.ticks || []).length}`
    : `minuto en curso | LIVE disponible`;

  modalSub.textContent = `${item.time} | ${info}`;

  chartModal.classList.remove("hidden");
  chartModal.setAttribute("aria-hidden", "false");

  // LIVE por defecto OFF
  setModalLive(false);

  // Si minuto ya cerrado, deshabilitar LIVE
  if (modalLiveBtn) {
    modalLiveBtn.disabled = !!item.minuteComplete;
    modalLiveBtn.title = item.minuteComplete ? "Minuto cerrado: LIVE deshabilitado" : "LIVE del minuto de la señal";
  }

  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      drawModalChart();
    })
  );
}

function closeChartModal() {
  if (!chartModal) return;
  chartModal.classList.add("hidden");
  chartModal.setAttribute("aria-hidden", "true");

  setModalLive(false);
  modalCurrentItem = null;
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
  if (modalCurrentItem) drawModalChart();
});

if (modalLiveBtn) {
  modalLiveBtn.onclick = () => {
    if (!modalCurrentItem) return;
    if (modalCurrentItem.minuteComplete) return; // ya cerrado
    setModalLive(!modalLiveOn);
  };
}

/* Modal buy buttons */
async function modalTrade(side) {
  if (!modalCurrentItem) return;
  const symbol = modalCurrentItem.symbol;

  const btn = side === "CALL" ? modalBuyCallBtn : modalBuyPutBtn;
  if (btn) btn.disabled = true;

  try {
    const r = await buyOneClick(side, symbol);
    const cid = r?.buy?.contract_id || r?.buy?.transaction_id || "";
    setStatus(`${side === "CALL" ? "🟢 COMPRADO" : "🔴 VENDIDO"} ✓ ${cid ? "ID: " + cid : ""}`);
  } catch (e) {
    setStatus(`⚠️ ${side}: ${e?.message || e}`);
  } finally {
    if (btn) btn.disabled = false;
  }
}

if (modalBuyCallBtn) modalBuyCallBtn.onclick = () => modalTrade("CALL");
if (modalBuyPutBtn) modalBuyPutBtn.onclick = () => modalTrade("PUT");

/* =========================
   Canvas chart
========================= */
function drawDerivLikeChart(canvas, ticks) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const cssW = canvas.clientWidth || 1,
    cssH = canvas.clientHeight || 1;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(cssW * dpr);
  canvas.height = Math.floor(cssH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const w = cssW,
    h = cssH;
  ctx.clearRect(0, 0, w, h);
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  ctx.fillRect(0, 0, w, h);
  ctx.globalAlpha = 1;

  if (!ticks || ticks.length < 2) return;

  const pts = [...ticks].sort((a, b) => a.ms - b.ms);
  const last = pts[pts.length - 1];
  if (last.ms < 60000) pts.push({ ms: 60000, quote: last.quote });

  const quotes = pts.map((p) => p.quote);
  let min = Math.min(...quotes),
    max = Math.max(...quotes);
  let range = max - min;
  if (range < 1e-9) range = 1e-9;
  const pad = range * 0.08;
  min -= pad;
  max += pad;

  const xOf = (ms) => (ms / 60000) * (w - 20) + 10;
  const yOf = (q) => (1 - (q - min) / (max - min)) * (h - 30) + 10;

  // grid
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

  // 30s marker
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

  // area
  ctx.beginPath();
  ctx.moveTo(xOf(pts[0].ms), h - 20);
  for (const p of pts) ctx.lineTo(xOf(p.ms), yOf(p.quote));
  ctx.lineTo(xOf(pts[pts.length - 1].ms), h - 20);
  ctx.closePath();
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.fill();
  ctx.globalAlpha = 1;

  // line
  ctx.strokeStyle = "rgba(255,255,255,0.95)";
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  pts.forEach((p, i) => {
    const x = xOf(p.ms), y = yOf(p.quote);
    if (!i) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // last dot
  const lx = xOf(pts[pts.length - 1].ms),
    ly = yOf(pts[pts.length - 1].quote);
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.beginPath();
  ctx.arc(lx, ly, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

/* =========================
   Row helpers (candado NO bloquea)
========================= */
function updateRowChartBtn(item) {
  const row = document.querySelector(`.row[data-id="${cssEscape(item.id)}"]`);
  if (!row) return;
  const btn = row.querySelector(".chartBtn");
  if (!btn) return;

  const ready = !!item.minuteComplete;

  // NO usamos disabled: siempre abre modal (LIVE o fijo)
  btn.disabled = false;
  btn.classList.toggle("locked", !ready);

  if (ready) {
    btn.innerHTML = CHART_ICON_SVG;
    btn.title = "Ver gráfico del minuto (fijo)";
  } else {
    btn.innerHTML = `<span class="lockBadge" aria-hidden="true">🔒</span>`;
    btn.title = "Minuto en curso: abrir para ver LIVE (si querés)";
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

function animateHitPop(item) {
  const row = document.querySelector(`.row[data-id="${cssEscape(item.id)}"]`);
  if (!row) return;
  const hit = row.querySelector(".hitIcon");
  if (!hit) return;
  hit.classList.remove("pop");
  void hit.offsetWidth;
  hit.classList.add("pop");
  setTimeout(() => hit.classList.remove("pop"), 260);
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
  const ok = updateRowHitIcon(item);
  updateCounter();

  rebuildFeedbackFromHistory();

  if (ok) animateHitPop(item);
  else animateFailShake(item);
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
    openChartModal(item); // SIEMPRE abre (LIVE o fijo)
  };
  updateRowChartBtn(item);
  updateRowHitIcon(item);

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

  updateRowNextArrow(item);
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
   Rehidratación al abrir
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

const REHYDRATE_MAX_ITEMS = 60;
const REHYDRATE_SLEEP_MS = 180;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchMinuteOC(symbol, minute) {
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

    const h = res?.history;
    if (h && Array.isArray(h.prices) && h.prices.length >= 2) {
      const open = Number(h.prices[0]);
      const close = Number(h.prices[h.prices.length - 1]);
      if (isFinite(open) && isFinite(close)) return { open, close };
    }
  } catch {}

  try {
    const start = minuteToEpochSec(minute);
    const end = minuteToEpochSec(minute + 1);

    const res2 = await wsRequest({
      ticks_history: symbol,
      start,
      end,
      style: "candles",
      granularity: 60,
      count: 1,
    });

    const c = res2?.candles?.[0];
    if (c) {
      const open = Number(c.open);
      const close = Number(c.close);
      if (isFinite(open) && isFinite(close)) return { open, close };
    }
  } catch {}

  return null;
}
function ocToOutcome(oc) {
  if (!oc) return null;
  if (oc.close > oc.open) return "up";
  if (oc.close < oc.open) return "down";
  return "flat";
}

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
        }
      }
      if (changed || anyMark) saveHistory(history);
    } catch {}

    await sleep(REHYDRATE_SLEEP_MS);
  }

  const pendingOutcomes = slice.filter((it) => !it.nextOutcome && it.minute + 1 < nowMin);
  const totalB = pendingOutcomes.length || 1;
  let doneB = 0;

  for (const it of pendingOutcomes) {
    doneB++;
    setRehydrateStatus(`♻️ Rehidratando resultados… ${doneB}/${totalB}`);

    try {
      const oc = await fetchMinuteOC(it.symbol, it.minute + 1);
      const outcome = ocToOutcome(oc);
      if (outcome) setNextOutcome(it, outcome);
    } catch {}

    await sleep(REHYDRATE_SLEEP_MS);
  }

  try {
    for (const it of history) {
      updateRowNextArrow(it);
      updateRowHitIcon(it);
      updateRowChartBtn(it);
    }
  } catch {}

  saveHistory(history);
  updateCounter();
  rebuildFeedbackFromHistory();

  clearRehydrateStatus();
}

/* =========================
   Finalize minute
========================= */
function finalizeMinute(minute) {
  const oc = candleOC[minute];
  if (!oc) return;

  for (const symbol of Object.keys(oc)) {
    const { open, close } = oc[symbol];
    if (open == null || close == null) continue;

    let outcome = "flat";
    if (close > open) outcome = "up";
    else if (close < open) outcome = "down";

    const prevMinute = minute - 1;
    for (const it of history) {
      if (it.minute === prevMinute && it.symbol === symbol && !it.nextOutcome) {
        setNextOutcome(it, outcome);
      }
    }
  }

  (async () => {
    const ticksChanged = await hydrateSignalsFromDerivHistory(minute);

    let changed = ticksChanged;
    for (const it of history) {
      if (it.minute === minute && !it.minuteComplete) {
        it.minuteComplete = true;
        changed = true;
        updateRowChartBtn(it);

        // si el modal está abierto justo en ese item: cortar LIVE y dejar fijo
        if (modalCurrentItem && modalCurrentItem.id === it.id) {
          modalCurrentItem = it;
          drawModalChart();
        }
      }
    }
    if (changed) saveHistory(history);
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
  if (!candleOC[minute][symbol]) candleOC[minute][symbol] = { open: tick.quote, close: tick.quote };
  else candleOC[minute][symbol].close = tick.quote;

  // si modal está abierto en LIVE, refrescamos (sin esperar timer)
  if (modalCurrentItem && modalLiveOn) {
    if (modalCurrentItem.minute === minute && modalCurrentItem.symbol === symbol) {
      drawModalChart();
    }
  }

  if (sec >= EVAL_SEC && lastEvaluatedMinute !== minute) {
    lastEvaluatedMinute = minute;
    const ok = evaluateMinute(minute);
    if (!ok) scheduleRetry(minute);
  }
}

function scheduleRetry(minute) {
  if (evalRetryTimer) clearTimeout(evalRetryTimer);
  evalRetryTimer = setTimeout(() => {
    if (Math.floor(Date.now() / 60000) === minute) evaluateMinute(minute);
  }, RETRY_DELAY_MS);
}

/* =========================
   Technical filters (tu lógica)
========================= */
function getPriceAtMs(ticks, ms) {
  if (!ticks || !ticks.length) return null;
  const pts = ticks.slice().sort((a, b) => a.ms - b.ms);

  if (ms <= pts[0].ms) return pts[0].quote;
  const last = pts[pts.length - 1];
  if (ms >= last.ms) return last.quote;

  for (let i = pts.length - 1; i >= 0; i--) {
    if (pts[i].ms <= ms) return pts[i].quote;
  }
  return pts[0].quote;
}
function sliceTicks(ticks, aMs, bMs) {
  if (!ticks || ticks.length === 0) return [];
  return ticks.filter((t) => t.ms >= aMs && t.ms <= bMs).sort((x, y) => x.ms - y.ms);
}
function directionalRatio(ticks, dirSign) {
  if (!ticks || ticks.length < 2) return 0;
  let ok = 0, total = 0;
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
    let runMax = ticks[0].quote, maxRet = 0;
    for (const t of ticks) {
      runMax = Math.max(runMax, t.quote);
      maxRet = Math.max(maxRet, runMax - t.quote);
    }
    return maxRet;
  } else {
    let runMin = ticks[0].quote, maxRet = 0;
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
const RULES_STRONG = {
  scoreMin: 0.02,
  dirRatioMin_0_30: 0.58,
  dirRatioMin_30_45: 0.56,
  move30_fracOfTotal: 0.38,
  move45_fracOfTotal: 0.2,
  oppAttack_maxFracMove30: 0.48,
  rest_minFracTotal: 0.1,
  rest_maxFracTotal: 0.56,
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
   Evaluation
========================= */
function evaluateMinute(minute) {
  const data = minuteData[minute];
  if (!data) return false;

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
    candidates.push({ symbol: sym, move, score, ticks, vol });
  }

  if (readySymbols < MIN_SYMBOLS_READY || candidates.length === 0) return false;

  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  if (!best) return false;

  const rules = strongMode ? RULES_STRONG : RULES_NORMAL;

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
  const modeLabel = strongMode ? "FUERTE" : "NORMAL";
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
}

/* =========================
   Wake lock
========================= */
let wakeLock = null;
if (wakeBtn)
  wakeBtn.onclick = async () => {
    try {
      if (wakeLock) {
        await wakeLock.release();
        wakeLock = null;
        wakeBtn.textContent = "🔓 Pantalla activa";
        wakeBtn.classList.remove("active");
      } else {
        wakeLock = await navigator.wakeLock.request("screen");
        wakeBtn.textContent = "🔒 Pantalla activa";
        wakeBtn.classList.add("active");
      }
    } catch {
      alert("No se pudo mantener la pantalla activa");
    }
  };

/* =========================
   WebSocket
========================= */
function connect() {
  try {
    setStatus("Conectando…");
    ws = new WebSocket(WS_URL);
  } catch {
    setStatus("Error WS – no se pudo iniciar");
    return;
  }

  ws.onopen = () => {
    resetAuthState();
    setStatus("Conectado – Suscribiendo…");
    SYMBOLS.forEach((sym) => ws.send(JSON.stringify({ ticks: sym, subscribe: 1 })));

    setTimeout(() => {
      try { rehydrateHistoryOnBoot(); } catch {}
    }, 350);
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

      if (data?.error) {
        setStatus(`⚠️ WS: ${data.error.message || "unknown"}`);
      }

      if (data.tick) {
        // cuando empieza a llegar tick real:
        if (statusEl && statusEl.textContent.startsWith("Conectado")) {
          // ok
        } else {
          setStatus("Conectado – Analizando");
        }
        onTick(data.tick);
      }
    } catch (err) {
      setStatus(`❌ Parse WS: ${err?.message || err}`);
    }
  };

  ws.onerror = () => {
    setStatus("Error WS – reconectando…");
  };

  ws.onclose = (ev) => {
    resetAuthState();

    for (const [id, p] of pending.entries()) {
      clearTimeout(p.t);
      pending.delete(id);
      p.reject(new Error("closed"));
    }

    const code = ev?.code || 0;
    const reason = ev?.reason || "";
    setStatus(`Desconectado (${code}) ${reason ? "– " + reason : ""} – reconectando…`);

    // bajo consumo: si está en background, no reconectar
    if (lowPowerMode && document.visibilityState && document.visibilityState !== "visible") return;

    setTimeout(connect, 1500);
  };
}

/* =========================
   Background/foreground
========================= */
document.addEventListener("visibilitychange", () => {
  if (!("visibilityState" in document)) return;

  if (document.visibilityState === "hidden") {
    if (lowPowerMode && ws && ws.readyState === 1) {
      try { ws.close(); } catch {}
    }
    return;
  }

  if (document.visibilityState === "visible") {
    if (!ws || ws.readyState === 3) {
      try { connect(); } catch {}
    }
  }
});

/* =========================
   Start
========================= */
loadLowPowerMode();
paintLowPowerBtn();

renderHistory();
updateTickHealthUI();
updateCountdownUI();
startUiTimers();

connect();