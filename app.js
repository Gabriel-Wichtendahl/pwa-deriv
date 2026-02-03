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

let signalCount = 0;
let minuteData = {};
let lastEvaluatedMinute = null;

let evalRetryTimer = null;

const MIN_TICKS = 3;
const MIN_SYMBOLS_READY = 2;
const RETRY_DELAY_MS = 5000;

/* ✅ tick health + countdown */
let lastTickEpoch = null;
let currentMinuteEpochBase = null;

/* ✅ para calcular próxima vela */
let lastSeenMinute = null;
let candleOC = {}; // minute -> symbol -> {open, close}

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
    text += `${it.time} | ${it.symbol} | ${labelDir(it.direction)} | ${vote} | ${comment}\n`;
  }
  if (feedbackEl) feedbackEl.value = text;
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
   Copy feedback
========================= */
if (copyBtn) {
  copyBtn.onclick = () => navigator.clipboard.writeText(feedbackEl.value);
}

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

  signalCount = history.length;
  updateCounter();
  rebuildFeedbackFromHistory();

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

function showNotification(symbol, direction) {
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  const title = "📈 Deriv Signal";
  const body = `${symbol} – ${labelDir(direction)}`;
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
      data: { url, symbol, direction },
      actions: [{ action: "open", title: "Abrir Deriv" }]
    });
  });
}

/* =========================
   ✅ Modal gráfico (fix: dibujar después de mostrar)
========================= */
function openChartModal(item) {
  modalCurrentItem = item;
  if (!chartModal) return;

  modalTitle.textContent = `${item.symbol} – ${labelDir(item.direction)}`;
  modalSub.textContent = `${item.time} | ticks: ${(item.ticks || []).length}`;

  chartModal.classList.remove("hidden");

  // ✅ ahora que el modal es visible, el canvas ya tiene tamaño real
  requestAnimationFrame(() => {
    drawLineChart(minuteCanvas, item.ticks || []);
  });
}

function closeChartModal() {
  if (!chartModal) return;
  chartModal.classList.add("hidden");
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

// ✅ redibujar si gira pantalla o cambia tamaño
window.addEventListener("resize", () => {
  if (!chartModal || chartModal.classList.contains("hidden")) return;
  if (!modalCurrentItem) return;
  drawLineChart(minuteCanvas, modalCurrentItem.ticks || []);
});

function drawLineChart(canvas, ticks) {
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

  // fondo
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  ctx.fillRect(0, 0, w, h);
  ctx.globalAlpha = 1;

  // ejes X (0..60)
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.font = "12px system-ui, sans-serif";
  ctx.fillText("0s", 10, h - 10);
  ctx.fillText("60s", w - 34, h - 10);
  ctx.globalAlpha = 1;

  // línea vertical 30s
  const x30 = (30 / 60) * (w - 20) + 10;
  ctx.globalAlpha = 0.55;
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x30, 10);
  ctx.lineTo(x30, h - 20);
  ctx.stroke();

  ctx.globalAlpha = 0.9;
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.fillText("30s", Math.min(w - 28, x30 + 6), 22);
  ctx.globalAlpha = 1;

  if (!ticks || ticks.length < 2) return;

  // ✅ asegurar minuto completo: agrego puntos en 0s y 60s
  const pts = ticks.map(t => ({ sec: t.sec, quote: t.quote })).sort((a,b)=>a.sec-b.sec);
  const first = pts[0];
  const last = pts[pts.length - 1];

  if (first.sec > 0) pts.unshift({ sec: 0, quote: first.quote });
  if (last.sec < 60) pts.push({ sec: 60, quote: last.quote });

  const quotes = pts.map(p => p.quote);
  let min = Math.min(...quotes);
  let max = Math.max(...quotes);
  if (max - min < 1e-9) max = min + 1e-9;

  // grilla
  ctx.globalAlpha = 0.25;
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

  // línea
  ctx.strokeStyle = "rgba(255,255,255,0.92)";
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  ctx.beginPath();
  for (let i = 0; i < pts.length; i++) {
    const x = (pts[i].sec / 60) * (w - 20) + 10;
    const yNorm = (pts[i].quote - min) / (max - min);
    const y = (1 - yNorm) * (h - 30) + 10;

    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

/* =========================
   ✅ Flecha próxima vela
========================= */
function setNextOutcome(item, outcome) {
  item.nextOutcome = outcome; // "up" | "down" | "flat"
  saveHistory(history);
  updateRowNextArrow(item);
}

function updateRowNextArrow(item) {
  const row = document.querySelector(`.row[data-id="${cssEscape(item.id)}"]`);
  if (!row) return;

  const el = row.querySelector(".nextArrow");
  if (!el) return;

  el.classList.remove("pending", "up", "down", "flat");

  if (item.nextOutcome === "up") {
    el.classList.add("up");
    el.textContent = "⬆️";
    el.title = "Próxima vela: alcista";
  } else if (item.nextOutcome === "down") {
    el.classList.add("down");
    el.textContent = "⬇️";
    el.title = "Próxima vela: bajista";
  } else if (item.nextOutcome === "flat") {
    el.classList.add("flat");
    el.textContent = "➖";
    el.title = "Próxima vela: plana";
  } else {
    el.classList.add("pending");
    el.textContent = "⏳";
    el.title = "Próxima vela: esperando…";
  }
}

// escape para selector
function cssEscape(s) {
  return String(s).replace(/"/g, '\\"');
}

/* =========================
   ✅ Construir fila
========================= */
function buildRow(item) {
  const row = document.createElement("div");
  row.className = "row";
  row.dataset.id = item.id;

  const derivUrl = makeDerivTraderUrl(item.symbol);

  row.innerHTML = `
    <div class="row-main">
      <span class="row-text">${item.time} | ${item.symbol} | ${labelDir(item.direction)}</span>

      <button class="chartBtn" type="button" title="Ver gráfico del minuto" aria-label="Ver gráfico del minuto">
        <svg viewBox="0 0 24 24" fill="none">
          <path d="M4 18V6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          <path d="M4 18H20" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          <path d="M6 14l4-4 3 3 5-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <circle cx="10" cy="10" r="1" fill="currentColor"/>
          <circle cx="13" cy="13" r="1" fill="currentColor"/>
          <circle cx="18" cy="6" r="1" fill="currentColor"/>
        </svg>
      </button>

      <span class="nextArrow pending" title="Próxima vela: esperando…">⏳</span>
    </div>

    <div class="row-actions">
      <button data-v="like" type="button" ${item.vote ? "disabled" : ""}>👍</button>
      <button data-v="dislike" type="button" ${item.vote ? "disabled" : ""}>👎</button>
      <input class="row-comment" placeholder="comentario" value="${escapeHtml(item.comment || "")}">
    </div>
  `;

  // texto abre Deriv (misma pestaña)
  row.querySelector(".row-text").onclick = () => {
    window.location.href = derivUrl;
  };

  // botón gráfico abre modal
  row.querySelector(".chartBtn").onclick = (e) => {
    e.stopPropagation();
    openChartModal(item);
  };

  // like/dislike
  row.querySelectorAll('button[data-v]').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      if (item.vote) return;

      item.vote = btn.dataset.v;
      const comment = row.querySelector(".row-comment").value || "";
      item.comment = comment;

      saveHistory(history);
      rebuildFeedbackFromHistory();

      row.querySelectorAll('button[data-v]').forEach(b => (b.disabled = true));
    };
  });

  // comentario blur
  const input = row.querySelector(".row-comment");
  input.addEventListener("blur", () => {
    item.comment = input.value || "";
    saveHistory(history);
    rebuildFeedbackFromHistory();
  });

  // ✅ aplicar estado de flecha si ya existe
  updateRowNextArrow(item);

  return row;
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
   Tick health + countdown UI
========================= */
function updateTickHealthUI() {
  if (!tickHealthEl) return;
  if (!lastTickEpoch) {
    tickHealthEl.textContent = "Último tick: —";
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
   ✅ Finalizar vela (para flecha próxima)
========================= */
function finalizeMinute(minute) {
  const oc = candleOC[minute];
  if (!oc) return;

  // para cada símbolo: vela de minute => afecta señales del minute-1
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

  // limpiar para no crecer infinito
  delete candleOC[minute - 3];
}

/* =========================
   Ticks + evaluación
========================= */
function onTick(tick) {
  const epoch = Math.floor(tick.epoch);
  const minute = Math.floor(epoch / 60);
  const sec = epoch % 60;
  const symbol = tick.symbol;

  // tick health / countdown
  lastTickEpoch = epoch;
  currentMinuteEpochBase = minute * 60;

  // ✅ detectar cambio de minuto para finalizar velas
  if (lastSeenMinute === null) lastSeenMinute = minute;
  if (minute > lastSeenMinute) {
    for (let m = lastSeenMinute; m < minute; m++) finalizeMinute(m);
    lastSeenMinute = minute;
  }

  // almacenar ticks del minuto
  if (!minuteData[minute]) minuteData[minute] = {};
  if (!minuteData[minute][symbol]) minuteData[minute][symbol] = [];
  minuteData[minute][symbol].push({ sec, quote: tick.quote });

  // ✅ open/close de la vela del minuto (para outcome)
  if (!candleOC[minute]) candleOC[minute] = {};
  if (!candleOC[minute][symbol]) {
    candleOC[minute][symbol] = { open: tick.quote, close: tick.quote };
  } else {
    candleOC[minute][symbol].close = tick.quote;
  }

  // evaluar a los 45s
  if (sec >= 45 && lastEvaluatedMinute !== minute) {
    lastEvaluatedMinute = minute;
    const ok = evaluateMinute(minute);
    if (!ok) scheduleRetry(minute);
  }

  delete minuteData[minute - 2];
}

function scheduleRetry(minute) {
  if (evalRetryTimer) clearTimeout(evalRetryTimer);

  evalRetryTimer = setTimeout(() => {
    const nowMinute = Math.floor(Date.now() / 1000 / 60);
    if (nowMinute === minute) evaluateMinute(minute);
  }, RETRY_DELAY_MS);
}

/* =========================
   Evaluación (la que venías usando)
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

  if (!best || best.score < 0.015) return true;

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

  const item = {
    id: `${minute}-${symbol}-${direction}`,
    minute,
    time,
    symbol,
    direction,
    vote: "",
    comment: "",
    ticks: Array.isArray(ticks) ? ticks : [],
    nextOutcome: "" // se completa cuando cierre el minuto siguiente
  };

  if (history.some(x => x.id === item.id)) return;

  history.push(item);
  if (history.length > MAX_HISTORY) history = history.slice(-MAX_HISTORY);
  saveHistory(history);

  signalCount = history.length;
  updateCounter();

  const row = buildRow(item);
  signalsEl.prepend(row);

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
renderHistory();
updateTickHealthUI();
updateCountdownUI();
connect();
