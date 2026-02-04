const WS_URL = "wss://ws.derivws.com/websockets/v3?app_id=1089";
const SYMBOLS = ["R_10", "R_25", "R_50", "R_75"];

/* =========================
   Deriv Deep Link (DEMO + Rise/Fall)
========================= */
const DERIV_DTRADER_TEMPLATE =
  "https://app.deriv.com/dtrader?symbol=R_75&account=demo&lang=ES&chart_type=area&interval=1t&trade_type=rise_fall_equal";

function makeDerivTraderUrl(symbol) {
  const u = new URL(DERIV_DTRADER_TEMPLATE);
  u.searchParams.set("symbol", symbol);
  return u.toString();
}

function labelDir(direction) {
  return direction === "CALL" ? "COMPRA" : "VENTA";
}

/* =========================
   Persistencia historial
========================= */
const STORE_KEY = "derivSignalsHistory_v2";
const MAX_HISTORY = 200;

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

let history = loadHistory();

/* =========================
   Estado
========================= */
let ws;

let soundEnabled = false;
let vibrateEnabled = true;

/* ✅ Config persistente */
let EVAL_SEC = 45;       // 45 / 50 / 55
let strongMode = false;  // NORMAL / FUERTE

let signalCount = 0;

/**
 * minuteData:
 *   minute -> symbol -> [{ms, quote}, ...]
 */
let minuteData = {};
let lastEvaluatedMinute = null;

let evalRetryTimer = null;
const MIN_TICKS = 3;
const MIN_SYMBOLS_READY = 2;
const RETRY_DELAY_MS = 5000;

/* tick health + countdown */
let lastTickEpochMs = null;
let currentMinuteStartMs = null;

/* próxima vela */
let lastSeenMinute = null;
let candleOC = {}; // minute -> symbol -> {open, close}

/* seed estilo Deriv */
let lastQuoteBySymbol = {};
let lastMinuteSeenBySymbol = {};

/* =========================
   UI
========================= */
const statusEl = document.getElementById("status");
const signalsEl = document.getElementById("signals");
const counterEl = document.getElementById("counter");
const feedbackEl = document.getElementById("feedback");

const tickHealthEl = document.getElementById("tickHealth");
const countdownEl = document.getElementById("countdown");

const sound = document.getElementById("alertSound");

const soundBtn = document.getElementById("soundBtn");
const wakeBtn = document.getElementById("wakeBtn");
const themeBtn = document.getElementById("themeBtn");
const vibrateBtn = document.getElementById("vibrateBtn");
const clearHistoryBtn = document.getElementById("clearHistoryBtn");
const copyBtn = document.getElementById("copyFeedback");

/* ✅ Controles nuevos */
const evalBtns = Array.from(document.querySelectorAll(".evalBtn"));
const modeBtn = document.getElementById("modeBtn");

/* Modal */
const chartModal = document.getElementById("chartModal");
const modalCloseBtn = document.getElementById("modalCloseBtn");
const modalCloseBackdrop = document.getElementById("modalCloseBackdrop");
const modalTitle = document.getElementById("modalTitle");
const modalSub = document.getElementById("modalSub");
const minuteCanvas = document.getElementById("minuteCanvas");
const modalOpenDerivBtn = document.getElementById("modalOpenDerivBtn");
let modalCurrentItem = null;

/* =========================
   Helpers
========================= */
function setBtnActive(btn, active) {
  if (!btn) return;
  btn.classList.toggle("active", !!active);
}

function loadBool(key, fallback) {
  const v = localStorage.getItem(key);
  if (v === null) return fallback;
  return v === "1";
}

function saveBool(key, value) {
  localStorage.setItem(key, value ? "1" : "0");
}

function updateCounter() {
  if (counterEl) counterEl.textContent = `Señales: ${signalCount}`;
}

function rebuildFeedbackFromHistory() {
  let text = "";
  for (const it of history) {
    const vote = it.vote || "";
    const comment = it.comment || "";
    if (!vote && !comment) continue;

    const modeLabel = it.mode || "NORMAL";
    text += `${it.time} | ${it.symbol} | ${labelDir(it.direction)} | [${modeLabel}] | ${vote} | ${comment}\n`;
  }
  if (feedbackEl) feedbackEl.value = text;
}

function cssEscape(s) {
  return String(s).replace(/"/g, '\\"');
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* =========================
   🌙 Tema
========================= */
function applyTheme(theme) {
  const isLight = theme === "light";
  document.body.classList.toggle("light", isLight);
  if (themeBtn) themeBtn.textContent = isLight ? "☀️ Claro" : "🌙 Oscuro";
  localStorage.setItem("theme", theme);
}

(function initTheme() {
  const saved = localStorage.getItem("theme") || "dark";
  applyTheme(saved);
  if (themeBtn) {
    themeBtn.onclick = () => {
      const current = document.body.classList.contains("light") ? "light" : "dark";
      applyTheme(current === "light" ? "dark" : "light");
    };
  }
})();

/* =========================
   ✅ Init EvalSec (45/50/55) + Mode (persistente)
========================= */
(function initEvalMode() {
  const savedSec = parseInt(localStorage.getItem("evalSec") || "45", 10);
  EVAL_SEC = [45, 50, 55].includes(savedSec) ? savedSec : 45;

  function paintEval() {
    evalBtns.forEach(b => {
      const sec = parseInt(b.dataset.sec || "0", 10);
      b.classList.toggle("active", sec === EVAL_SEC);
    });
  }

  paintEval();

  evalBtns.forEach(b => {
    b.onclick = () => {
      const v = parseInt(b.dataset.sec || "45", 10);
      EVAL_SEC = [45, 50, 55].includes(v) ? v : 45;
      localStorage.setItem("evalSec", String(EVAL_SEC));
      paintEval();
    };
  });

  strongMode = loadBool("strongMode", false);

  function paintMode() {
    if (!modeBtn) return;
    modeBtn.textContent = strongMode ? "🟧 Modo FUERTE" : "🟦 Modo NORMAL";
    modeBtn.classList.toggle("active-strong", strongMode);
  }

  paintMode();

  if (modeBtn) {
    modeBtn.onclick = () => {
      strongMode = !strongMode;
      saveBool("strongMode", strongMode);
      paintMode();
    };
  }
})();

/* =========================
   🔊 Sonido toggle
========================= */
(function initSoundToggle() {
  soundEnabled = loadBool("soundEnabled", false);
  setBtnActive(soundBtn, soundEnabled);
  if (soundBtn) soundBtn.textContent = soundEnabled ? "🔊 Sonido ON" : "🔇 Sonido OFF";

  if (soundBtn) {
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
      } else {
        soundEnabled = false;
        saveBool("soundEnabled", false);

        setBtnActive(soundBtn, false);
        soundBtn.textContent = "🔇 Sonido OFF";
      }
    };
  }
})();

/* =========================
   📳 Vibración toggle
========================= */
(function initVibrationToggle() {
  vibrateEnabled = loadBool("vibrateEnabled", true);
  if (vibrateBtn) {
    setBtnActive(vibrateBtn, vibrateEnabled);
    vibrateBtn.textContent = vibrateEnabled ? "📳 Vibración ON" : "📳 Vibración OFF";

    vibrateBtn.onclick = () => {
      vibrateEnabled = !vibrateEnabled;
      saveBool("vibrateEnabled", vibrateEnabled);

      setBtnActive(vibrateBtn, vibrateEnabled);
      vibrateBtn.textContent = vibrateEnabled ? "📳 Vibración ON" : "📳 Vibración OFF";

      if (vibrateEnabled && "vibrate" in navigator) navigator.vibrate([80]);
    };
  }
})();

/* =========================
   Copiar feedback
========================= */
if (copyBtn) copyBtn.onclick = () => navigator.clipboard.writeText(feedbackEl.value || "");

/* =========================
   🧹 Vaciar historial
========================= */
function clearHistory() {
  history = [];
  saveHistory(history);
  signalCount = 0;
  updateCounter();
  if (signalsEl) signalsEl.innerHTML = "";
  if (feedbackEl) feedbackEl.value = "";
}

if (clearHistoryBtn) {
  clearHistoryBtn.onclick = () => {
    if (confirm("¿Seguro que querés borrar todas las señales guardadas?")) clearHistory();
  };
}

/* =========================
   ✅ Render historial
========================= */
function renderHistory() {
  if (!signalsEl) return;
  signalsEl.innerHTML = "";

  for (const it of history) {
    if (!it.mode) it.mode = "NORMAL";
  }
  saveHistory(history);

  signalCount = history.length;
  updateCounter();
  rebuildFeedbackFromHistory();

  // render newest first
  for (const it of [...history].reverse()) {
    const row = buildRow(it);
    signalsEl.appendChild(row);
  }
}

/* =========================
   🔔 Notificaciones
========================= */
if ("Notification" in window && Notification.permission === "default") {
  Notification.requestPermission().catch(() => {});
}

function showNotification(symbol, direction, modeLabel) {
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  const title = "📈 Deriv Signal";
  const body = `${symbol} – ${labelDir(direction)} – [${modeLabel || "NORMAL"}]`;
  const url = makeDerivTraderUrl(symbol);

  navigator.serviceWorker.getRegistration().then(reg => {
    if (!reg) return;

    reg.showNotification(title, {
      body,
      icon: "icon-192.png",
      badge: "icon-192.png",
      tag: "deriv-signal",
      renotify: true,
      requireInteraction: true,
      silent: false,
      vibrate: vibrateEnabled ? [200, 100, 200] : undefined,
      data: { url, symbol, direction }
    });
  });
}

/* =========================
   ✅ Modal gráfico
========================= */
function openChartModal(item) {
  if (!item.minuteComplete) return;

  modalCurrentItem = item;
  if (!chartModal) return;

  modalTitle.textContent = `${item.symbol} – ${labelDir(item.direction)} | [${item.mode || "NORMAL"}]`;
  modalSub.textContent = `${item.time} | ticks: ${(item.ticks || []).length}`;

  chartModal.classList.remove("hidden");
  chartModal.setAttribute("aria-hidden", "false");

  // doble RAF para esperar layout (evita “entrecortado”)
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      drawDerivLikeChart(minuteCanvas, item.ticks || []);
    });
  });
}

function closeChartModal() {
  if (!chartModal) return;
  chartModal.classList.add("hidden");
  chartModal.setAttribute("aria-hidden", "true");
  modalCurrentItem = null;
}

if (modalCloseBtn) modalCloseBtn.onclick = closeChartModal;
if (modalCloseBackdrop) modalCloseBackdrop.onclick = closeChartModal;

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeChartModal();
});

if (modalOpenDerivBtn) {
  modalOpenDerivBtn.onclick = () => {
    if (!modalCurrentItem) return;
    window.location.href = makeDerivTraderUrl(modalCurrentItem.symbol);
  };
}

window.addEventListener("resize", () => {
  if (!chartModal || chartModal.classList.contains("hidden")) return;
  if (!modalCurrentItem) return;
  drawDerivLikeChart(minuteCanvas, modalCurrentItem.ticks || []);
});

/* =========================
   ✅ Gráfico tipo Deriv (area + line)
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

  const last = pts[pts.length - 1];
  if (last.ms < 60000) pts.push({ ms: 60000, quote: last.quote });

  const quotes = pts.map(p => p.quote);
  let min = Math.min(...quotes);
  let max = Math.max(...quotes);

  let range = max - min;
  if (range < 1e-9) range = 1e-9;

  const pad = range * 0.08;
  min -= pad;
  max += pad;

  const xOf = (ms) => (ms / 60000) * (w - 20) + 10;
  const yOf = (q) => {
    const yNorm = (q - min) / (max - min);
    return (1 - yNorm) * (h - 30) + 10;
  };

  // grilla
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

  // marca 30s
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
  for (let i = 0; i < pts.length; i++) {
    ctx.lineTo(xOf(pts[i].ms), yOf(pts[i].quote));
  }
  ctx.lineTo(xOf(pts[pts.length - 1].ms), h - 20);
  ctx.closePath();

  ctx.globalAlpha = 0.18;
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.fill();
  ctx.globalAlpha = 1;

  // línea
  ctx.strokeStyle = "rgba(255,255,255,0.95)";
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  ctx.beginPath();
  for (let i = 0; i < pts.length; i++) {
    const x = xOf(pts[i].ms);
    const y = yOf(pts[i].quote);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // punto final
  const lx = xOf(pts[pts.length - 1].ms);
  const ly = yOf(pts[pts.length - 1].quote);

  ctx.globalAlpha = 0.9;
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.beginPath();
  ctx.arc(lx, ly, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  // labels
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.font = "12px system-ui, sans-serif";
  ctx.fillText("0s", 10, h - 10);
  ctx.fillText("60s", w - 34, h - 10);
  ctx.globalAlpha = 1;
}

/* =========================
   Botón gráfico lock
========================= */
const CHART_ICON_SVG = `
<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
  <path d="M4 18V6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  <path d="M4 18H20" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  <path d="M6 14l4-4 3 3 5-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="10" cy="10" r="1" fill="currentColor"/>
  <circle cx="13" cy="13" r="1" fill="currentColor"/>
  <circle cx="18" cy="6" r="1" fill="currentColor"/>
</svg>
`;

function updateRowChartBtn(item) {
  const row = document.querySelector(`.row[data-id="${cssEscape(item.id)}"]`);
  if (!row) return;

  const btn = row.querySelector(".chartBtn");
  if (!btn) return;

  const ready = !!item.minuteComplete;
  btn.disabled = !ready;

  if (ready) {
    btn.innerHTML = CHART_ICON_SVG;
    btn.title = "Ver gráfico del minuto (ticks 0–60)";
  } else {
    btn.innerHTML = `<span class="lockBadge" aria-hidden="true">🔒</span>`;
    btn.title = "Esperando cierre del minuto…";
  }
}

/* =========================
   Próxima vela: flecha
========================= */
function setNextOutcome(item, outcome) {
  item.nextOutcome = outcome;
  saveHistory(history);
  updateRowNextArrow(item);
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

/* =========================
   Fila
========================= */
function buildRow(item) {
  const row = document.createElement("div");
  row.className = "row";
  row.dataset.id = item.id;

  const derivUrl = makeDerivTraderUrl(item.symbol);
  const modeLabel = item.mode || "NORMAL";

  row.innerHTML = `
    <div class="row-main">
      <span class="row-text">${item.time} | ${item.symbol} | ${labelDir(item.direction)} | [${modeLabel}]</span>
      <button class="chartBtn" type="button"></button>
      <span class="nextArrow pending" title="Próxima vela: esperando…">⏳</span>
    </div>

    <div class="row-actions">
      <button data-v="like" type="button" ${item.vote ? "disabled" : ""}>👍</button>
      <button data-v="dislike" type="button" ${item.vote ? "disabled" : ""}>👎</button>
      <input class="row-comment" placeholder="comentario" value="${escapeHtml(item.comment || "")}">
    </div>
  `;

  // tocar texto -> abrir Deriv (misma pestaña)
  row.querySelector(".row-text").onclick = () => {
    window.location.href = derivUrl;
  };

  // botón gráfico
  const chartBtn = row.querySelector(".chartBtn");
  chartBtn.onclick = (e) => {
    e.stopPropagation();
    if (!item.minuteComplete) return;
    openChartModal(item);
  };

  updateRowChartBtn(item);

  // votos
  row.querySelectorAll('button[data-v]').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      if (item.vote) return;

      item.vote = btn.dataset.v;
      item.comment = row.querySelector(".row-comment").value || "";

      saveHistory(history);
      rebuildFeedbackFromHistory();

      row.querySelectorAll('button[data-v]').forEach(b => (b.disabled = true));
    };
  });

  // comentario
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
   Tick health + countdown
========================= */
function updateTickHealthUI() {
  if (!tickHealthEl) return;
  if (!lastTickEpochMs) {
    tickHealthEl.textContent = "Último tick: —";
    return;
  }
  const ageMs = Date.now() - lastTickEpochMs;
  const ageSec = Math.max(0, Math.floor(ageMs / 1000));
  tickHealthEl.textContent = `Último tick: hace ${ageSec}s`;
}

function updateCountdownUI() {
  if (!countdownEl) return;
  if (!currentMinuteStartMs) {
    countdownEl.textContent = "⏱️ 60";
    return;
  }
  const nowMs = Date.now();
  const msInMinute = (nowMs - currentMinuteStartMs) % 60000;
  const remaining = 60 - Math.max(0, Math.min(59, Math.floor(msInMinute / 1000)));
  countdownEl.textContent = `⏱️ ${remaining}`;
}

setInterval(() => {
  updateTickHealthUI();
  updateCountdownUI();
}, 1000);

/* =========================
   Finalizar minuto + habilitar gráficos + próxima vela
========================= */
function finalizeMinute(minute) {
  const oc = candleOC[minute];
  if (!oc) return;

  // outcome para señales del minuto anterior (minute-1)
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

  // marcar minuto completo (habilita botón gráfico)
  let changed = false;
  for (const it of history) {
    if (it.minute === minute && !it.minuteComplete) {
      it.minuteComplete = true;
      changed = true;
      updateRowChartBtn(it);
    }
  }
  if (changed) saveHistory(history);

  delete candleOC[minute - 3];
}

/* =========================
   Ticks + evaluación
========================= */
function onTick(tick) {
  const epochMs = Math.round(Number(tick.epoch) * 1000);
  const minuteStartMs = Math.floor(epochMs / 60000) * 60000;

  const minute = Math.floor(epochMs / 60000);
  const msInMinute = epochMs - minuteStartMs;
  const sec = Math.floor(msInMinute / 1000);
  const symbol = tick.symbol;

  lastTickEpochMs = epochMs;
  currentMinuteStartMs = minuteStartMs;

  // seed 0ms (precio minuto anterior)
  const prevLast = lastQuoteBySymbol[symbol];
  lastQuoteBySymbol[symbol] = tick.quote;

  if (lastMinuteSeenBySymbol[symbol] !== minute) {
    lastMinuteSeenBySymbol[symbol] = minute;

    if (!minuteData[minute]) minuteData[minute] = {};
    if (!minuteData[minute][symbol]) minuteData[minute][symbol] = [];

    if (minuteData[minute][symbol].length === 0 && prevLast != null) {
      minuteData[minute][symbol].push({ ms: 0, quote: prevLast });
    }
  }

  // detectar cambio de minuto global
  if (lastSeenMinute === null) lastSeenMinute = minute;
  if (minute > lastSeenMinute) {
    for (let m = lastSeenMinute; m < minute; m++) finalizeMinute(m);
    lastSeenMinute = minute;
  }

  // guardar tick
  if (!minuteData[minute]) minuteData[minute] = {};
  if (!minuteData[minute][symbol]) minuteData[minute][symbol] = [];
  minuteData[minute][symbol].push({ ms: msInMinute, quote: tick.quote });

  // open/close vela (para outcome)
  if (!candleOC[minute]) candleOC[minute] = {};
  if (!candleOC[minute][symbol]) candleOC[minute][symbol] = { open: tick.quote, close: tick.quote };
  else candleOC[minute][symbol].close = tick.quote;

  // evaluar en EVAL_SEC
  if (sec >= EVAL_SEC && lastEvaluatedMinute !== minute) {
    lastEvaluatedMinute = minute;
    const ok = evaluateMinute(minute);
    if (!ok) scheduleRetry(minute);
  }

  delete minuteData[minute - 2];
}

function scheduleRetry(minute) {
  if (evalRetryTimer) clearTimeout(evalRetryTimer);

  evalRetryTimer = setTimeout(() => {
    const nowMinute = Math.floor(Date.now() / 60000);
    if (nowMinute === minute) evaluateMinute(minute);
  }, RETRY_DELAY_MS);
}

/* =========================
   Evaluación NORMAL / FUERTE
========================= */
function evaluateMinute(minute) {
  const data = minuteData[minute];
  if (!data) return false;

  const candidates = [];
  let readySymbols = 0;

  for (const symbol of SYMBOLS) {
    const ticks = data[symbol] || [];
    if (ticks.length >= MIN_TICKS) readySymbols++;
    if (ticks.length < MIN_TICKS) continue;

    const prices = ticks.map(t => t.quote);
    const move = prices[prices.length - 1] - prices[0];
    const rawMove = Math.abs(move);

    // volatilidad promedio
    let vol = 0;
    for (let i = 1; i < prices.length; i++) vol += Math.abs(prices[i] - prices[i - 1]);
    vol = vol / Math.max(1, prices.length - 1);

    const score = rawMove / (vol || 1e-9);
    candidates.push({ symbol, move, score, ticks });
  }

  if (readySymbols < MIN_SYMBOLS_READY) return false;
  if (candidates.length === 0) return false;

  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];

  // umbral base (mantener señales)
  let threshold = 0.015;

  // ✅ FUERTE: un poco más estricto (sin matar)
  if (strongMode) threshold = 0.02;

  if (!best || best.score < threshold) return true;

  const direction = best.move > 0 ? "CALL" : "PUT";
  addSignal(minute, best.symbol, direction, best.ticks);
  return true;
}

/* =========================
   Guardar + mostrar señal
========================= */
function fmtTimeUTC(minute) {
  return new Date(minute * 60000).toISOString().substr(11, 8) + " UTC";
}

function addSignal(minute, symbol, direction, ticks) {
  const time = fmtTimeUTC(minute);
  const modeLabel = strongMode ? "FUERTE" : "NORMAL";

  const item = {
    id: `${minute}-${symbol}-${direction}-${modeLabel}`,
    minute,
    time,
    symbol,
    direction,
    mode: modeLabel,
    vote: "",
    comment: "",
    ticks: Array.isArray(ticks) ? ticks : [],
    nextOutcome: "",
    minuteComplete: false
  };

  if (history.some(x => x.id === item.id)) return;

  history.push(item);
  if (history.length > MAX_HISTORY) history = history.slice(-MAX_HISTORY);
  saveHistory(history);

  signalCount = history.length;
  updateCounter();

  const row = buildRow(item);
  if (signalsEl) signalsEl.prepend(row);

  updateRowChartBtn(item);

  // sonido
  if (soundEnabled) {
    sound.currentTime = 0;
    sound.play().catch(() => {});
  }

  // vibración local
  if (vibrateEnabled && "vibrate" in navigator) {
    navigator.vibrate([120]);
  }

  // notificación
  showNotification(symbol, direction, modeLabel);
}

/* =========================
   Wake Lock
========================= */
let wakeLock = null;

if (wakeBtn) {
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
}

/* =========================
   WebSocket
========================= */
function connect() {
  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    if (statusEl) statusEl.textContent = "Conectado – Analizando";
    SYMBOLS.forEach(sym => ws.send(JSON.stringify({ ticks: sym, subscribe: 1 })));
  };

  ws.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      if (data.tick) onTick(data.tick);
    } catch {}
  };

  ws.onerror = () => {
    if (statusEl) statusEl.textContent = "Error WS – reconectando…";
  };

  ws.onclose = () => {
    if (statusEl) statusEl.textContent = "Desconectado – reconectando…";
    setTimeout(connect, 1500);
  };
}

/* =========================
   Start
========================= */
renderHistory();
for (const it of history) {
  updateRowChartBtn(it);
  updateRowNextArrow(it);
}
updateTickHealthUI();
updateCountdownUI();
connect();