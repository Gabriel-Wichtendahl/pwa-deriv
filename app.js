const WS_URL = "wss://ws.derivws.com/websockets/v3?app_id=1089";
const SYMBOLS = ["R_10", "R_25", "R_50", "R_75"];

let ws;
let soundEnabled = false;
let signalCount = 0;

let minuteData = {};
let lastEvaluatedMinute = null;

let lastSignalSymbol = null;

// retry dentro del minuto (para que no monopolice R_75 por falta de ticks)
let evalRetryTimer = null;

const MIN_TICKS = 3;
const MIN_SYMBOLS_READY = 2;
const RETRY_DELAY_MS = 5000;

/* UI */
const statusEl = document.getElementById("status");
const signalsEl = document.getElementById("signals");
const counterEl = document.getElementById("counter");
const feedbackEl = document.getElementById("feedback");
const sound = document.getElementById("alertSound");
const wakeBtn = document.getElementById("wakeBtn");

/* =========================
   🔔 NOTIFICACIONES
========================= */

// Pedir permiso 1 vez (no molesta si ya está concedido/denegado)
(function requestNotificationPermissionOnce() {
  if (!("Notification" in window)) return;
  if (Notification.permission === "default") {
    Notification.requestPermission().catch(() => {});
  }
})();

function showNotification(symbol, direction) {
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  const title = "📈 Deriv Signal";
  const body = `${symbol} – ${direction}`;

  // Usa el Service Worker para mostrar notificación del sistema
  navigator.serviceWorker.getRegistration().then(reg => {
    if (!reg) return;

    reg.showNotification(title, {
      body,
      icon: "icon-192.png",
      badge: "icon-192.png",
      vibrate: [200, 100, 200],
      tag: "deriv-signal",
      renotify: true
    });
  });
}

/* =========================
   🔊 SONIDO
========================= */
document.getElementById("soundBtn").onclick = async () => {
  try {
    sound.muted = false;
    sound.volume = 1;
    sound.currentTime = 0;

    // desbloqueo real (PWA Android)
    await sound.play();
    sound.pause();

    soundEnabled = true;
    alert("🔊 Sonido activado correctamente");
  } catch (e) {
    alert("⚠️ El navegador bloqueó el audio. Tocá nuevamente.");
    console.error(e);
  }
};

document.getElementById("copyFeedback").onclick = () => {
  navigator.clipboard.writeText(feedbackEl.value);
};

/* =========================
   WebSocket
========================= */
function connect() {
  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    statusEl.textContent = "Conectado – Analizando";
    SYMBOLS.forEach(sym => {
      ws.send(JSON.stringify({ ticks: sym, subscribe: 1 }));
    });
  };

  ws.onmessage = e => {
    const data = JSON.parse(e.data);
    if (data.tick) onTick(data.tick);
  };

  ws.onerror = () => {
    statusEl.textContent = "Error WS – reconectando...";
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

  if (!minuteData[minute]) minuteData[minute] = {};
  if (!minuteData[minute][symbol]) minuteData[minute][symbol] = [];
  minuteData[minute][symbol].push(tick.quote);

  // Evaluar una sola vez por minuto desde seg 45
  if (sec >= 45 && lastEvaluatedMinute !== minute) {
    lastEvaluatedMinute = minute;

    const ok = evaluateMinute(minute);
    if (!ok) scheduleRetry(minute);
  }

  // limpieza para no crecer en memoria
  const oldMinute = minute - 2;
  if (minuteData[oldMinute]) delete minuteData[oldMinute];
}

function scheduleRetry(minute) {
  if (evalRetryTimer) clearTimeout(evalRetryTimer);

  evalRetryTimer = setTimeout(() => {
    const nowMinute = Math.floor(Date.now() / 1000 / 60);
    if (nowMinute === minute) {
      evaluateMinute(minute);
    }
  }, RETRY_DELAY_MS);
}

/* =========================
   Evaluación
   - score = |move| / vol
   - anti-monopolio suave
========================= */
function evaluateMinute(minute) {
  const data = minuteData[minute];
  if (!data) return false;

  const candidates = [];
  let readySymbols = 0;

  for (const symbol of SYMBOLS) {
    const prices = data[symbol] || [];
    if (prices.length >= MIN_TICKS) readySymbols++;
    if (prices.length < MIN_TICKS) continue;

    const move = prices[prices.length - 1] - prices[0];
    const rawMove = Math.abs(move);

    // volatilidad promedio por tick
    let vol = 0;
    for (let i = 1; i < prices.length; i++) {
      vol += Math.abs(prices[i] - prices[i - 1]);
    }
    vol = vol / Math.max(1, prices.length - 1);

    const score = rawMove / (vol || 1e-9);
    candidates.push({ symbol, move, score });
  }

  // Si hay muy pocos símbolos listos, conviene reintentar
  if (readySymbols < MIN_SYMBOLS_READY) return false;
  if (candidates.length === 0) return false;

  candidates.sort((a, b) => b.score - a.score);
  let best = candidates[0];

  // anti-monopolio suave
  const second = candidates[1];
  if (
    second &&
    best.symbol === lastSignalSymbol &&
    second.score >= best.score * 0.90
  ) {
    best = second;
  }

  // umbral bajo
  if (!best || best.score < 0.015) return true;

  lastSignalSymbol = best.symbol;

  const direction = best.move > 0 ? "CALL" : "PUT";
  showSignal(minute, best.symbol, direction);

  return true;
}

/* =========================
   Mostrar señal
========================= */
function showSignal(minute, symbol, direction) {
  signalCount++;
  counterEl.textContent = `Señales: ${signalCount}`;

  const time = new Date(minute * 60000).toISOString().substr(11, 8) + " UTC";

  const row = document.createElement("div");
  row.className = "row";
  row.innerHTML = `
    ${time} | ${symbol} | ${direction}
    <button data-v="like">👍</button>
    <button data-v="dislike">👎</button>
    <input placeholder="comentario">
  `;

  row.querySelectorAll("button").forEach(btn => {
    btn.onclick = () => {
      const comment = row.querySelector("input").value || "";
      feedbackEl.value += `${time} | ${symbol} | ${direction} | ${btn.dataset.v} | ${comment}\n`;
      btn.disabled = true;
    };
  });

  signalsEl.prepend(row);

  // 🔊 sonido
  if (soundEnabled) {
    sound.currentTime = 0;
    sound.play().catch(() => {});
  }

  // 📳 notificación del sistema
  showNotification(symbol, direction);
}

/* =========================
   🔒 Wake Lock
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
  } catch (e) {
    alert("No se pudo mantener la pantalla activa");
  }
};

connect();