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

/* =========================
   Labels
========================= */
function labelForDirection(direction) {
  return direction === "CALL" ? "COMPRA" : "VENTA";
}
function cssClassForDirection(direction) {
  return direction === "CALL" ? "call" : "put";
}

/* =========================
   Persistencia
========================= */
const STORE_KEY = "derivSignalsHistory_v3"; // nuevo por outcome
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

function saveHistory(history) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)));
  } catch {}
}

let history = loadHistory();

/* =========================
   Estado
========================= */
let ws;

let soundEnabled = false;
let vibrateEnabled = true;

let signalCount = 0;
let likeCount = 0;
let dislikeCount = 0;

let minuteData = {};
let lastEvaluatedMinute = null;
let lastSignalSymbol = null;

let evalRetryTimer = null;

const MIN_TICKS = 3;
const MIN_SYMBOLS_READY = 2;
const RETRY_DELAY_MS = 5000;

// umbrales
const THRESHOLD_NORMAL = 0.015;
const THRESHOLD_STRONG = 0.03;

// Normal (flexible)
const CONFIRM_LAST_DELTAS_NORMAL = 2;
const CONSISTENCY_MIN_NORMAL = 0.55;
const LATE_SECOND_CUTOFF_NORMAL = 59;

// Fuerte (estricto)
const CONFIRM_LAST_DELTAS_STRONG = 3;
const CONSISTENCY_MIN_STRONG = 0.65;
const LATE_SECOND_CUTOFF_STRONG = 58;

let evalSecond = 45;
let strongOnly = false;

// Salud + segundero
let lastTickEpoch = null;
let currentMinuteEpochBase = null;

/* =========================
   Ajuste NORMAL por tramos (SUAVE)
========================= */
const SEG_SPLIT_SEC = 30;
const PENALTY_LEVE = 0.85;
const PENALTY_FUERTE = 0.65;
const CONTRA_FUERTE_RATIO = 0.60;

function sign(x) {
  return x > 0 ? 1 : x < 0 ? -1 : 0;
}

function extractQuotes(ticks) {
  return ticks.map(t => t.quote);
}

function segmentTicks(ticks, fromSec, toSec) {
  return ticks.filter(t => t.sec >= fromSec && t.sec <= toSec);
}

function segmentMove(ticksSeg) {
  if (!ticksSeg || ticksSeg.length < 2) return null;
  return ticksSeg[ticksSeg.length - 1].quote - ticksSeg[0].quote;
}

function computeVolatilityFromQuotes(quotes) {
  if (!quotes || quotes.length < 2) return 0;
  let vol = 0;
  for (let i = 1; i < quotes.length; i++) vol += Math.abs(quotes[i] - quotes[i - 1]);
  return vol / Math.max(1, quotes.length - 1);
}

function normalPenaltyBySegments(ticksAll, evalSec) {
  const segA = segmentTicks(ticksAll, 0, SEG_SPLIT_SEC);
  const segB = segmentTicks(ticksAll, SEG_SPLIT_SEC, Math.min(evalSec, 59));

  const moveA = segmentMove(segA);
  const moveB = segmentMove(segB);

  if (moveA === null || moveB === null) return 1.0;

  const sA = sign(moveA);
  const sB = sign(moveB);

  if (sA === 0 || sB === 0) return 1.0;
  if (sA === sB) return 1.0;

  const absA = Math.abs(moveA);
  const absB = Math.abs(moveB);
  const ratio = absB / Math.max(1e-9, absA);

  if (ratio >= CONTRA_FUERTE_RATIO) return PENALTY_FUERTE;
  return PENALTY_LEVE;
}

/* =========================
   Snapshot ticks
========================= */
const SNAPSHOT_MAX_POINTS = 120;

function compressTicks(ticks, maxPoints = SNAPSHOT_MAX_POINTS) {
  if (!Array.isArray(ticks)) return [];
  if (ticks.length <= maxPoints) return ticks;

  const step = ticks.length / maxPoints;
  const out = [];
  for (let i = 0; i < maxPoints; i++) out.push(ticks[Math.floor(i * step)]);
  out[out.length - 1] = ticks[ticks.length - 1];
  return out;
}

/* =========================
   ✅ Outcome del minuto siguiente (⬆️/⬇️/⏺)
========================= */
function computeNextMinuteOutcome(ticksNextMinute) {
  if (!ticksNextMinute || ticksNextMinute.length < 2) return null;

  const open = ticksNextMinute[0].quote;
  const close = ticksNextMinute[ticksNextMinute.length - 1].quote;
  const diff = close - open;

  const EPS = 1e-9;
  if (diff > EPS) return "up";
  if (diff < -EPS) return "down";
  return "flat";
}

function updateOutcomeIconInRow(signalId, outcome) {
  const row = document.querySelector(`.row[data-id="${signalId}"]`);
  if (!row) return;

  const icon = row.querySelector(".outcomeIcon");
  if (!icon) return;

  icon.classList.remove("pending", "up", "down", "flat");
  icon.classList.add(outcome);

  icon.textContent =
    outcome === "up" ? "⬆️" :
    outcome === "down" ? "⬇️" :
    outcome === "flat" ? "⏺" : "⏳";
}

function tryResolveOutcomesForMinute(currentMinute, secNow) {
  // resolvemos hacia el final del minuto actual
  if (typeof secNow !== "number" || secNow < 58) return;

  const prevMinute = currentMinute - 1;
  if (prevMinute < 0) return;

  for (const it of history) {
    if (it.minute !== prevMinute) continue;
    if (it.outcome && it.outcome !== "pending") continue;

    const ticksNext = minuteData[currentMinute]?.[it.symbol];
    if (!ticksNext || ticksNext.length < 2) continue;

    const outcome = computeNextMinuteOutcome(ticksNext);
    if (!outcome) continue;

    it.outcome = outcome;
    saveHistory(history);
    updateOutcomeIconInRow(it.id, outcome);
  }
}

/* =========================
   UI
========================= */
const statusEl = document.getElementById("status");
const tickHealthEl = document.getElementById("tickHealth");
const countdownEl = document.getElementById("countdown");

const signalsEl = document.getElementById("signals");
const counterEl = document.getElementById("counter");
const feedbackEl = document.getElementById("feedback");

const likeCountEl = document.getElementById("likeCount");
const dislikeCountEl = document.getElementById("dislikeCount");

const lastSignalEl = document.getElementById("lastSignal");
const lastSignalTextEl = document.getElementById("lastSignalText");
const lastSignalMetaEl = document.getElementById("lastSignalMeta");

const sound = document.getElementById("alertSound");
const soundBtn = document.getElementById("soundBtn");
const wakeBtn = document.getElementById("wakeBtn");
const themeBtn = document.getElementById("themeBtn");
const vibrateBtn = document.getElementById("vibrateBtn");

const evalSelect = document.getElementById("evalSelect");
const strongToggle = document.getElementById("strongToggle");
const clearHistoryBtn = document.getElementById("clearHistoryBtn");

/* Modal */
const chartModal = document.getElementById("chartModal");
const modalCloseBtn = document.getElementById("modalCloseBtn");
const modalCloseBackdrop = document.getElementById("modalCloseBackdrop");
const modalTitle = document.getElementById("modalTitle");
const modalSub = document.getElementById("modalSub");
const minuteCanvas = document.getElementById("minuteCanvas");
const modalOpenDerivBtn = document.getElementById("modalOpenDerivBtn");

let modalCurrentSymbol = null;

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
function loadNumber(key, fallback) {
  const v = localStorage.getItem(key);
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function saveNumber(key, value) {
  localStorage.setItem(key, String(value));
}

function updateStatsUI() {
  counterEl.textContent = `Señales: ${signalCount}`;
  if (likeCountEl) likeCountEl.textContent = `👍 ${likeCount}`;
  if (dislikeCountEl) dislikeCountEl.textContent = `👎 ${dislikeCount}`;
}

function fmtTimeUTC(minute) {
  return new Date(minute * 60000).toISOString().substr(11, 8) + " UTC";
}

/* =========================
   Tema
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
   Config
========================= */
(function initConfig() {
  evalSecond = loadNumber("evalSecond", 45);
  if (![45, 50, 55].includes(evalSecond)) evalSecond = 45;

  strongOnly = loadBool("strongOnly", false);

  if (evalSelect) {
    evalSelect.value = String(evalSecond);
    evalSelect.onchange = () => {
      evalSecond = Number(evalSelect.value) || 45;
      saveNumber("evalSecond", evalSecond);
    };
  }

  if (strongToggle) {
    strongToggle.checked = strongOnly;
    strongToggle.onchange = () => {
      strongOnly = !!strongToggle.checked;
      saveBool("strongOnly", strongOnly);
    };
  }
})();

/* =========================
   Vibración toggle
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
   Sonido toggle
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
          alert("🔊 Sonido activado correctamente");
        } catch (e) {
          alert("⚠️ El navegador bloqueó el audio. Tocá nuevamente.");
          console.error(e);
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
   Feedback
========================= */
document.getElementById("copyFeedback").onclick = () => {
  navigator.clipboard.writeText(feedbackEl.value);
};

/* =========================
   Última señal
========================= */
function setLastSignalUI({ symbol, direction, time }) {
  const label = labelForDirection(direction);

  if (lastSignalEl) lastSignalEl.classList.remove("hidden");
  if (lastSignalTextEl) lastSignalTextEl.textContent = `${symbol} – ${label}`;
  if (lastSignalMetaEl) lastSignalMetaEl.textContent = `Hora: ${time}`;
}

/* =========================
   Salud ticks + segundero
========================= */
function updateTickHealthUI() {
  if (!tickHealthEl) return;

  if (!lastTickEpoch) {
    tickHealthEl.textContent = "Ticks: —";
    return;
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const age = nowSec - lastTickEpoch;
  tickHealthEl.textContent = `Último tick: hace ${age}s`;
}

function updateCountdownUI() {
  if (!countdownEl) return;
  if (!currentMinuteEpochBase) {
    countdownEl.textContent = "⏱️ 60";
    return;
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const secInMinute = (nowSec - currentMinuteEpochBase) % 60;
  const remaining = 60 - Math.max(0, Math.min(59, secInMinute));
  countdownEl.textContent = `⏱️ ${remaining}`;
}

setInterval(() => {
  updateTickHealthUI();
  updateCountdownUI();
}, 1000);

/* =========================
   Feedback desde historial
========================= */
function rebuildFeedbackFromHistory() {
  let text = "";
  for (const it of history) {
    if (!it.vote && !it.comment) continue;
    const label = labelForDirection(it.direction);
    const vote = it.vote || "";
    const comment = it.comment || "";
    text += `${it.time} | ${it.symbol} | ${label} | ${vote} | ${comment}\n`;
  }
  feedbackEl.value = text;
}

/* =========================
   Sparkline
========================= */
function drawSparkline(canvas, ticks) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);

  if (!ticks || ticks.length < 2) {
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    ctx.moveTo(2, h / 2);
    ctx.lineTo(w - 2, h / 2);
    ctx.strokeStyle = "rgba(255,255,255,0.65)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.globalAlpha = 1;
    return;
  }

  const quotes = ticks.map(t => t.quote);
  let min = Math.min(...quotes);
  let max = Math.max(...quotes);
  if (max - min < 1e-9) max = min + 1e-9;

  ctx.globalAlpha = 0.9;
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(255,255,255,0.85)";

  ctx.beginPath();
  for (let i = 0; i < ticks.length; i++) {
    const x = (i / (ticks.length - 1)) * (w - 4) + 2;
    const yNorm = (quotes[i] - min) / (max - min);
    const y = (1 - yNorm) * (h - 4) + 2;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/* =========================
   Modal
========================= */
function openModalForSignal(item) {
  if (!chartModal || !minuteCanvas) return;

  modalCurrentSymbol = item.symbol;

  const label = labelForDirection(item.direction);
  modalTitle.textContent = `${item.symbol} – ${label}`;
  modalSub.textContent = `${item.time} | minuto capturado (${(item.ticks || []).length} pts)`;

  drawMinuteChart(minuteCanvas, item.ticks || [], item.direction);

  chartModal.classList.remove("hidden");
}

function closeModal() {
  if (!chartModal) return;
  chartModal.classList.add("hidden");
}

function drawMinuteChart(canvas, ticks, direction) {
  const ctx = canvas.getContext("2d");

  const cssW = canvas.clientWidth;
  const cssH = canvas.clientHeight;
  const dpr = window.devicePixelRatio || 1;

  canvas.width = Math.floor(cssW * dpr);
  canvas.height = Math.floor(cssH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const w = cssW;
  const h = cssH;

  ctx.clearRect(0, 0, w, h);

  ctx.globalAlpha = 0.35;
  ctx.fillStyle = "rgba(255,255,255,0.05)";
  ctx.fillRect(0, 0, w, h);
  ctx.globalAlpha = 1;

  ctx.globalAlpha = 0.35;
  ctx.strokeStyle = "rgba(255,255,255,0.20)";
  ctx.lineWidth = 1;

  for (let i = 1; i <= 5; i++) {
    const y = (h / 6) * i;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  for (let i = 1; i <= 5; i++) {
    const x = (w / 6) * i;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  if (!ticks || ticks.length < 2) return;

  const quotes = ticks.map(t => t.quote);
  const secs = ticks.map(t => t.sec);

  let min = Math.min(...quotes);
  let max = Math.max(...quotes);
  if (max - min < 1e-9) max = min + 1e-9;

  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(255,255,255,0.92)";

  ctx.beginPath();
  for (let i = 0; i < ticks.length; i++) {
    const x = ((secs[i] - 0) / 60) * (w - 20) + 10;
    const yNorm = (quotes[i] - min) / (max - min);
    const y = (1 - yNorm) * (h - 20) + 10;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  const start = quotes[0];
  const end = quotes[quotes.length - 1];

  ctx.globalAlpha = 0.9;
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = "12px system-ui, sans-serif";
  ctx.fillText(`inicio: ${start.toFixed(3)}`, 10, 16);
  ctx.fillText(`fin: ${end.toFixed(3)}`, 10, 32);
  ctx.fillText(`rango: ${(max - min).toFixed(3)}`, 10, 48);
  ctx.fillText(`dir: ${labelForDirection(direction)}`, 10, 64);
  ctx.globalAlpha = 1;
}

if (modalCloseBtn) modalCloseBtn.onclick = closeModal;
if (modalCloseBackdrop) modalCloseBackdrop.onclick = closeModal;
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeModal();
});

if (modalOpenDerivBtn) {
  modalOpenDerivBtn.onclick = () => {
    if (!modalCurrentSymbol) return;
    window.location.href = makeDerivTraderUrl(modalCurrentSymbol);
  };
}

/* =========================
   Render historial
========================= */
function renderHistory() {
  signalsEl.innerHTML = "";
  signalCount = history.length;

  likeCount = history.filter(x => x.vote === "like").length;
  dislikeCount = history.filter(x => x.vote === "dislike").length;
  updateStatsUI();

  for (const it of [...history].reverse()) {
    const row = buildRowFromItem(it);
    signalsEl.appendChild(row);
  }

  rebuildFeedbackFromHistory();

  if (history.length) {
    const last = history[history.length - 1];
    setLastSignalUI({ symbol: last.symbol, direction: last.direction, time: last.time });
  }
}

function buildRowFromItem(it) {
  const row = document.createElement("div");
  row.className = `row ${cssClassForDirection(it.direction)}`;
  row.dataset.id = it.id;

  const label = labelForDirection(it.direction);
  const derivUrl = makeDerivTraderUrl(it.symbol);

  const outcome = it.outcome || "pending";
  const outcomeEmoji =
    outcome === "up" ? "⬆️" :
    outcome === "down" ? "⬇️" :
    outcome === "flat" ? "⏺" : "⏳";

  row.innerHTML = `
    <div class="topline" title="Tocar para abrir Deriv">
      <div>${it.time} | ${it.symbol}</div>

      <button type="button" class="sparkBtn" aria-label="Ver gráfico del minuto" title="Ver gráfico del minuto">
        <canvas width="84" height="40"></canvas>
      </button>

      <span class="outcomeIcon ${outcome}" title="Resultado del minuto siguiente">
        ${outcomeEmoji}
      </span>

      <div class="badge">${label}</div>
    </div>

    <div class="actions">
      <button type="button" data-v="like">👍</button>
      <button type="button" data-v="dislike">👎</button>
      <input placeholder="comentario">
    </div>
  `;

  const topLine = row.querySelector(".topline");
  const sparkBtn = row.querySelector(".sparkBtn");
  const sparkCanvas = sparkBtn.querySelector("canvas");

  const likeBtn = row.querySelector('button[data-v="like"]');
  const dislikeBtn = row.querySelector('button[data-v="dislike"]');
  const commentInput = row.querySelector("input");

  topLine.addEventListener("click", () => {
    window.location.href = derivUrl;
  });

  function stop(e) { e.stopPropagation(); }

  sparkBtn.addEventListener("pointerdown", stop);
  sparkBtn.addEventListener("click", (e) => {
    stop(e);
    openModalForSignal(it);
  });

  [likeBtn, dislikeBtn].forEach(btn => {
    btn.addEventListener("pointerdown", stop);
    btn.addEventListener("click", stop);
  });

  commentInput.addEventListener("pointerdown", stop);
  commentInput.addEventListener("click", stop);
  commentInput.addEventListener("keydown", stop);

  drawSparkline(sparkCanvas, it.ticks || []);

  if (it.comment) commentInput.value = it.comment;

  function lockVotes() {
    likeBtn.disabled = true;
    dislikeBtn.disabled = true;
  }

  if (it.vote === "like" || it.vote === "dislike") lockVotes();

  commentInput.addEventListener("blur", () => {
    it.comment = commentInput.value || "";
    saveHistory(history);
    rebuildFeedbackFromHistory();
  });

  likeBtn.onclick = () => {
    if (it.vote) return;
    it.vote = "like";
    likeCount++;
    updateStatsUI();
    lockVotes();
    saveHistory(history);
    rebuildFeedbackFromHistory();
  };

  dislikeBtn.onclick = () => {
    if (it.vote) return;
    it.vote = "dislike";
    dislikeCount++;
    updateStatsUI();
    lockVotes();
    saveHistory(history);
    rebuildFeedbackFromHistory();
  };

  return row;
}

/* =========================
   Limpiar historial
========================= */
function clearHistory() {
  history = [];
  saveHistory(history);

  signalsEl.innerHTML = "";
  feedbackEl.value = "";

  signalCount = 0;
  likeCount = 0;
  dislikeCount = 0;
  updateStatsUI();

  if (lastSignalEl) lastSignalEl.classList.add("hidden");
}

if (clearHistoryBtn) {
  clearHistoryBtn.onclick = () => {
    const ok = confirm("¿Seguro que querés borrar todas las señales guardadas?");
    if (!ok) return;
    clearHistory();
  };
}

/* =========================
   Notificaciones
========================= */
function vibratePatternForDirection(direction) {
  return direction === "CALL" ? [120] : [180, 80, 180];
}

function showNotification(symbol, direction) {
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  const title = "📈 Deriv Signal";
  const body = `${symbol} – ${labelForDirection(direction)}`;
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
      vibrate: vibrateEnabled ? vibratePatternForDirection(direction) : undefined,
      data: { url, symbol, direction },
      actions: [{ action: "open", title: "Abrir Deriv" }]
    });
  });
}

/* =========================
   WebSocket
========================= */
function connect() {
  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    statusEl.textContent = "Conectado – Analizando";
    SYMBOLS.forEach(sym => ws.send(JSON.stringify({ ticks: sym, subscribe: 1 })));
  };

  ws.onmessage = e => {
    const data = JSON.parse(e.data);
    if (data.tick) onTick(data.tick);
  };

  ws.onclose = () => {
    statusEl.textContent = "Desconectado – reconectando...";
    setTimeout(connect, 1500);
  };
}

/* =========================
   Ticks
========================= */
function onTick(tick) {
  const epoch = Math.floor(tick.epoch);
  const minute = Math.floor(epoch / 60);
  const sec = epoch % 60;
  const symbol = tick.symbol;

  lastTickEpoch = epoch;
  currentMinuteEpochBase = minute * 60;

  if (!minuteData[minute]) minuteData[minute] = {};
  if (!minuteData[minute][symbol]) minuteData[minute][symbol] = [];

  minuteData[minute][symbol].push({ sec, quote: tick.quote });

  // ✅ resolver outcomes de señales del minuto anterior
  tryResolveOutcomesForMinute(minute, sec);

  if (sec >= evalSecond && lastEvaluatedMinute !== minute) {
    lastEvaluatedMinute = minute;
    const ok = evaluateMinute(minute, sec);
    if (!ok) scheduleRetry(minute);
  }

  delete minuteData[minute - 2];
}

function scheduleRetry(minute) {
  if (evalRetryTimer) clearTimeout(evalRetryTimer);

  evalRetryTimer = setTimeout(() => {
    const now = Math.floor(Date.now() / 1000);
    const nowMinute = Math.floor(now / 60);
    const nowSec = now % 60;

    if (nowMinute === minute) evaluateMinute(minute, nowSec);
  }, RETRY_DELAY_MS);
}

/* =========================
   Evaluación
========================= */
function evaluateMinute(minute, secNow) {
  const data = minuteData[minute];
  if (!data) return false;

  const threshold = strongOnly ? THRESHOLD_STRONG : THRESHOLD_NORMAL;
  const confirmN = strongOnly ? CONFIRM_LAST_DELTAS_STRONG : CONFIRM_LAST_DELTAS_NORMAL;
  const consistencyMin = strongOnly ? CONSISTENCY_MIN_STRONG : CONSISTENCY_MIN_NORMAL;
  const lateCutoff = strongOnly ? LATE_SECOND_CUTOFF_STRONG : LATE_SECOND_CUTOFF_NORMAL;

  if (typeof secNow === "number" && secNow >= lateCutoff) return true;

  const candidates = [];
  let readySymbols = 0;

  for (const symbol of SYMBOLS) {
    const ticksAll = data[symbol] || [];
    if (ticksAll.length >= MIN_TICKS) readySymbols++;
    if (ticksAll.length < MIN_TICKS) continue;

    const quotesAll = extractQuotes(ticksAll);

    const move = quotesAll[quotesAll.length - 1] - quotesAll[0];
    const rawMove = Math.abs(move);

    const vol = computeVolatilityFromQuotes(quotesAll);
    const baseScore = rawMove / (vol || 1e-9);

    let rankScore = baseScore;

    if (!strongOnly) {
      const penalty = normalPenaltyBySegments(ticksAll, evalSecond);
      rankScore = baseScore * penalty;
    }

    candidates.push({
      symbol,
      move,
      baseScore,
      rankScore,
      prices: quotesAll
    });
  }

  if (readySymbols < MIN_SYMBOLS_READY) return false;
  if (candidates.length === 0) return false;

  candidates.sort((a, b) => b.rankScore - a.rankScore);
  let best = candidates[0];

  const second = candidates[1];
  if (second && best.symbol === lastSignalSymbol && second.rankScore >= best.rankScore * 0.90) {
    best = second;
  }

  if (!best || best.baseScore < threshold) return true;

  const direction = best.move > 0 ? "CALL" : "PUT";
  const dirSign = best.move > 0 ? 1 : -1;

  const prices = best.prices;
  const deltas = [];
  for (let i = 1; i < prices.length; i++) {
    const d = prices[i] - prices[i - 1];
    if (d !== 0) deltas.push(d);
  }

  if (deltas.length >= confirmN) {
    const last = deltas.slice(-confirmN);
    const okConfirm = last.every(d => Math.sign(d) === dirSign);
    if (!okConfirm) return true;
  }

  if (deltas.length >= 3) {
    const favor = deltas.filter(d => Math.sign(d) === dirSign).length;
    const ratio = favor / deltas.length;
    if (ratio < consistencyMin) return true;
  }

  const ticksSnapshotRaw = minuteData[minute]?.[best.symbol] || [];
  const ticksSnapshot = compressTicks(ticksSnapshotRaw, SNAPSHOT_MAX_POINTS);

  lastSignalSymbol = best.symbol;
  addSignalToHistory(minute, best.symbol, direction, ticksSnapshot);
  return true;
}

/* =========================
   Añadir señal
========================= */
function addSignalToHistory(minute, symbol, direction, ticksSnapshot) {
  const time = fmtTimeUTC(minute);

  const item = {
    id: `${minute}-${symbol}-${direction}`,
    minute,
    time,
    symbol,
    direction,
    vote: "",
    comment: "",
    ticks: Array.isArray(ticksSnapshot) ? ticksSnapshot : [],
    outcome: "pending"
  };

  if (history.some(x => x.id === item.id)) return;

  history.push(item);
  if (history.length > MAX_HISTORY) history = history.slice(-MAX_HISTORY);
  saveHistory(history);

  signalCount = history.length;
  updateStatsUI();

  setLastSignalUI({ symbol, direction, time });

  const row = buildRowFromItem(item);
  row.classList.add("flash");
  signalsEl.prepend(row);

  if (soundEnabled) {
    sound.currentTime = 0;
    sound.play().catch(() => {});
  }

  if (vibrateEnabled && "vibrate" in navigator) {
    navigator.vibrate(vibratePatternForDirection(direction));
  }

  showNotification(symbol, direction);
}

/* =========================
   Wake Lock
========================= */
let wakeLock = null;

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
   Start
========================= */
updateStatsUI();
updateTickHealthUI();
updateCountdownUI();
renderHistory();
connect();
