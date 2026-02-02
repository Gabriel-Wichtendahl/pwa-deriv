const WS_URL = "wss://ws.derivws.com/websockets/v3?app_id=1089";
const SYMBOLS = ["R_10", "R_25", "R_50", "R_75"];

const NORMALIZATION = {
  R_10: 1,
  R_25: 2,
  R_50: 3,
  R_75: 4
};

let ws;
let soundEnabled = false;
let signalCount = 0;

let minuteData = {};
let lastEvaluatedMinute = null;

// ✅ NUEVO: control de evaluación diferida
const MIN_TICKS_PER_SYMBOL = 3;          // antes era 5 (esto ayudaba a sesgo)
const pendingEval = {};                  // minute -> timeoutId

/* UI */
const statusEl = document.getElementById("status");
const signalsEl = document.getElementById("signals");
const counterEl = document.getElementById("counter");
const feedbackEl = document.getElementById("feedback");
const sound = document.getElementById("alertSound");
const wakeBtn = document.getElementById("wakeBtn");

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
    SYMBOLS.forEach(sym => {
      ws.send(JSON.stringify({ ticks: sym, subscribe: 1 }));
    });
  };

  ws.onmessage = e => {
    const data = JSON.parse(e.data);
    if (data.tick) onTick(data.tick);
  };
}

/* Ticks */
function onTick(tick) {
  const epoch = Math.floor(tick.epoch);
  const minute = Math.floor(epoch / 60);
  const sec = epoch % 60;
  const symbol = tick.symbol;

  if (!minuteData[minute]) minuteData[minute] = {};
  if (!minuteData[minute][symbol]) minuteData[minute][symbol] = [];

  minuteData[minute][symbol].push(tick.quote);

  // ✅ Evaluar una sola vez por minuto desde seg 45, pero con "espera inteligente"
  if (sec >= 45 && lastEvaluatedMinute !== minute) {
    lastEvaluatedMinute = minute;
    scheduleEvaluate(minute);
  }

  // ✅ limpieza simple: borrar minutos viejos (no afecta nada)
  const oldMinute = minute - 3;
  if (minuteData[oldMinute]) delete minuteData[oldMinute];
  if (pendingEval[oldMinute]) {
    clearTimeout(pendingEval[oldMinute]);
    delete pendingEval[oldMinute];
  }
}

/* ✅ NUEVO: espera a que haya ticks suficientes en varios símbolos */
function scheduleEvaluate(minute) {
  // Evitar múltiples timeouts para el mismo minuto
  if (pendingEval[minute]) return;

  const tryEval = () => {
    // si cambió el minuto, abortar
    const nowEpoch = Math.floor(Date.now() / 1000);
    const nowMinute = Math.floor(nowEpoch / 60);
    const nowSec = nowEpoch % 60;

    if (nowMinute !== minute) {
      pendingEval[minute] = null;
      delete pendingEval[minute];
      return;
    }

    // si ya estamos muy tarde en el minuto, evaluamos con lo que haya
    // (para no quedarnos sin señal)
    const late = nowSec >= 58;

    const data = minuteData[minute] || {};
    const readySymbols = SYMBOLS.filter(sym => (data[sym] || []).length >= MIN_TICKS_PER_SYMBOL);

    // condición ideal: al menos 2 símbolos con data suficiente (reduce monopolio)
    if (readySymbols.length >= 2 || late) {
      pendingEval[minute] = null;
      delete pendingEval[minute];
      evaluateMinute(minute);
      return;
    }

    // reintentar en 1s
    pendingEval[minute] = setTimeout(tryEval, 1000);
  };

  // primer intento inmediato
  pendingEval[minute] = setTimeout(tryEval, 0);
}

/* Evaluación */
function evaluateMinute(minute) {
  const data = minuteData[minute];
  if (!data) return;

  let best = null;

  for (const symbol in data) {
    const prices = data[symbol];

    // ✅ antes: <5 (sesgaba fuerte a R_75). Ahora usamos MIN_TICKS_PER_SYMBOL
    if (prices.length < MIN_TICKS_PER_SYMBOL) continue;

    const move = prices[prices.length - 1] - prices[0];
    const rawMove = Math.abs(move);

    // Normalización dinámica por volatilidad (promedio |delta|)
    let vol = 0;
    for (let i = 1; i < prices.length; i++) {
      vol += Math.abs(prices[i] - prices[i - 1]);
    }
    vol = vol / (prices.length - 1);

    const score = rawMove / (vol || 1e-9);

    if (!best || score > best.score) {
      best = { symbol, move, score };
    }
  }

  // umbral bajo (mantenido)
  if (!best || best.score < 0.015) return;

  showSignal(minute, best.symbol, best.move > 0 ? "CALL" : "PUT");
}

/* Mostrar señal */
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

/* Start */
connect();