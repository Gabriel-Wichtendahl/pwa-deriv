const WS_URL = "wss://ws.derivws.com/websockets/v3?app_id=1089";
const SYMBOLS = ["R_10", "R_25", "R_50", "R_75"];

let ws;
let soundEnabled = false;
let signalCount = 0;

let minuteData = {};
let lastEvaluatedMinute = null;

// ✅ NUEVO: para debug visual y control de evaluación
let evalTimers = {};                 // minute -> timeoutId
let lastSignalSymbol = null;         // para anti-monopolio suave
const MIN_TICKS_PER_SYMBOL = 2;      // para que no excluya a otros por frecuencia

/* UI */
const statusEl = document.getElementById("status");
const signalsEl = document.getElementById("signals");
const counterEl = document.getElementById("counter");
const feedbackEl = document.getElementById("feedback");
const sound = document.getElementById("alertSound");
const wakeBtn = document.getElementById("wakeBtn");

// ✅ NUEVO: panel de ticks (se crea solo)
let tickStatusEl = document.getElementById("tickStatus");
if (!tickStatusEl) {
  tickStatusEl = document.createElement("div");
  tickStatusEl.id = "tickStatus";
  tickStatusEl.style.fontSize = "12px";
  tickStatusEl.style.opacity = "0.8";
  tickStatusEl.style.margin = "6px 0";
  tickStatusEl.style.padding = "6px";
  tickStatusEl.style.border = "1px solid #334155";
  tickStatusEl.style.borderRadius = "8px";
  tickStatusEl.textContent = "Ticks este minuto: —";
  // lo ponemos debajo del status
  statusEl.insertAdjacentElement("afterend", tickStatusEl);
}

/* Sonido (PWA Android friendly) */
document.getElementById("soundBtn").onclick = async () => {
  try {
    sound.muted = false;
    sound.volume = 1;
    sound.currentTime = 0;
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

/* WebSocket */
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

  ws.onerror = () => {
    statusEl.textContent = "Error WS – reconectando...";
  };

  ws.onclose = () => {
    statusEl.textContent = "Desconectado – reconectando...";
    setTimeout(connect, 1500);
  };
}

function onTick(tick) {
  const epoch = Math.floor(tick.epoch);
  const minute = Math.floor(epoch / 60);
  const sec = epoch % 60;
  const symbol = tick.symbol;

  if (!minuteData[minute]) minuteData[minute] = {};
  if (!minuteData[minute][symbol]) minuteData[minute][symbol] = [];
  minuteData[minute][symbol].push(tick.quote);

  // ✅ Debug visual: mostrar cuántos ticks lleva cada símbolo este minuto
  updateTickPanel(minute);

  // ✅ Evaluación: se arma desde seg 45, pero ejecuta cerca de seg 55
  // para que los otros símbolos alcancen ticks mínimos
  if (sec >= 45 && lastEvaluatedMinute !== minute) {
    lastEvaluatedMinute = minute;
    scheduleEvaluate(minute, sec);
  }

  // limpieza simple (no afecta lógica)
  const oldMinute = minute - 3;
  if (minuteData[oldMinute]) delete minuteData[oldMinute];
  if (evalTimers[oldMinute]) {
    clearTimeout(evalTimers[oldMinute]);
    delete evalTimers[oldMinute];
  }
}

function updateTickPanel(minute) {
  const data = minuteData[minute] || {};
  const parts = SYMBOLS.map(sym => `${sym}=${(data[sym] || []).length}`);
  tickStatusEl.textContent = `Ticks este minuto: ${parts.join(" | ")}`;
}

function scheduleEvaluate(minute, currentSec) {
  if (evalTimers[minute]) return;

  // Queremos ejecutar aprox en segundo 55.
  // Si llegamos al 45, esperamos ~10s; si llegamos al 52, esperamos ~3s, etc.
  const targetSec = 55;
  const delayMs = Math.max(0, (targetSec - currentSec) * 1000);

  evalTimers[minute] = setTimeout(() => {
    delete evalTimers[minute];
    evaluateMinute(minute);
  }, delayMs);
}

function evaluateMinute(minute) {
  const data = minuteData[minute];
  if (!data) return;

  // Solo consideramos símbolos con un mínimo de ticks
  const candidates = [];
  for (const symbol of SYMBOLS) {
    const prices = data[symbol] || [];
    if (prices.length < MIN_TICKS_PER_SYMBOL) continue;

    const move = prices[prices.length - 1] - prices[0];
    const rawMove = Math.abs(move);

    // Normalización dinámica por volatilidad (promedio de |delta|)
    let vol = 0;
    for (let i = 1; i < prices.length; i++) vol += Math.abs(prices[i] - prices[i - 1]);
    vol = vol / Math.max(1, (prices.length - 1));

    const score = rawMove / (vol || 1e-9);
    candidates.push({ symbol, move, score });
  }

  if (candidates.length === 0) return;

  candidates.sort((a, b) => b.score - a.score);
  let best = candidates[0];

  // ✅ Anti-monopolio suave:
  // Si vuelve a ganar el mismo símbolo, y el 2° está a <=10% de diferencia,
  // elegimos el 2° para diversificar (sin forzar cuando hay un claro ganador).
  const second = candidates[1];
  if (
    second &&
    best.symbol === lastSignalSymbol &&
    second.score >= best.score * 0.90
  ) {
    best = second;
  }

  // Umbral muy bajo (mantener señales)
  if (!best || best.score < 0.015) return;

  const direction = best.move > 0 ? "CALL" : "PUT";
  lastSignalSymbol = best.symbol;
  showSignal(minute, best.symbol, direction);
}

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

  if (soundEnabled) {
    sound.currentTime = 0;
    sound.play().catch(() => {});
  }
}

/* Pantalla siempre activa */
let wakeLock = null;
let wakeEnabled = false;

async function enableWakeLock() {
  try {
    wakeLock = await navigator.wakeLock.request("screen");
    wakeEnabled = true;
    wakeBtn.classList.add("active");
    wakeBtn.textContent = "🔒 Pantalla activa";

    wakeLock.addEventListener("release", () => {
      wakeEnabled = false;
      wakeBtn.classList.remove("active");
      wakeBtn.textContent = "🔓 Pantalla activa";
    });
  } catch (e) {
    alert("No se pudo mantener la pantalla activa");
  }
}

wakeBtn.onclick = () => {
  wakeEnabled ? wakeLock.release() : enableWakeLock();
};

document.addEventListener("visibilitychange", () => {
  if (wakeEnabled && document.visibilityState === "visible") {
    enableWakeLock();
  }
});

connect();