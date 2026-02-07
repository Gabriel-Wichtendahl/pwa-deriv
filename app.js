/*
 * Versión mejorada de la lógica de señales para la PWA Deriv.
 *
 * Esta modificación cambia la evaluación de la dirección de la señal
 * para intentar que coincida con la dirección del próximo minuto.
 * En lugar de basarse en el movimiento dentro del mismo minuto,
 * compara el último precio de cada símbolo en el minuto actual con el
 * último precio del minuto anterior. La dirección de la señal se
 * determina según este movimiento inter-minutos, y se escoge el
 * símbolo con el mayor movimiento normalizado. De esta manera, se
 * pretende capturar la tendencia que probablemente continúe en el
 * siguiente minuto.
 */

const WS_URL = "wss://ws.derivws.com/websockets/v3?app_id=1089";
const SYMBOLS = ["R_10", "R_25", "R_50", "R_75"];

// Valores de normalización por símbolo. Un valor mayor reduce la
// influencia de los movimientos de símbolos volátiles.
const NORMALIZATION = {
  R_10: 1,
  R_25: 2,
  R_50: 3,
  R_75: 4
};

let ws;
let soundEnabled = false;
let signalCount = 0;

// Guarda los ticks por minuto y símbolo
let minuteData = {};
// Guarda el último precio de cada símbolo por minuto
let lastPrices = {};
let lastEvaluatedMinute = null;

// Referencias a elementos de la UI
const statusEl = document.getElementById("status");
const signalsEl = document.getElementById("signals");
const counterEl = document.getElementById("counter");
const feedbackEl = document.getElementById("feedback");
const sound = document.getElementById("alertSound");

/* =====================
   UI
===================== */

document.getElementById("soundBtn").onclick = () => {
  sound.play().then(() => {
    soundEnabled = true;
    alert(" Sonido activado");
  }).catch(() => {
    alert("Tocá la pantalla primero para habilitar sonido");
  });
};

document.getElementById("copyFeedback").onclick = () => {
  navigator.clipboard.writeText(feedbackEl.value);
};

/* =====================
   WebSocket
===================== */

function connect() {
  statusEl.textContent = "Conectando…";

  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    statusEl.textContent = "Conectado – Analizando";
    SYMBOLS.forEach(sym => {
      ws.send(JSON.stringify({ ticks: sym, subscribe: 1 }));
    });
  };

  ws.onmessage = e => {
    let data;
    try {
      data = JSON.parse(e.data);
    } catch {
      return;
    }

    if (data.tick) {
      onTick(data.tick);
    }
  };

  ws.onerror = () => {
    statusEl.textContent = "Error de conexión";
  };

  ws.onclose = () => {
    statusEl.textContent = "Desconectado – Reintentando…";
    setTimeout(connect, 2000);
  };
}

/* =====================
   Ticks
===================== */

function onTick(tick) {
  if (!tick || !tick.epoch || !tick.symbol) return;

  const epoch = Math.floor(tick.epoch);
  const minute = Math.floor(epoch / 60);
  const sec = epoch % 60;
  const symbol = tick.symbol;

  if (!minuteData[minute]) minuteData[minute] = {};
  if (!minuteData[minute][symbol]) minuteData[minute][symbol] = [];

  minuteData[minute][symbol].push(tick.quote);

  // Evaluar una sola vez por minuto a partir del segundo 45
  if (sec >= 45 && lastEvaluatedMinute !== minute) {
    lastEvaluatedMinute = minute;
    evaluateMinute(minute);
  }
}

/* =====================
   Evaluación
===================== */

function evaluateMinute(minute) {
  const data = minuteData[minute];
  if (!data) return;

  // Solo evaluamos si existe un minuto previo con precios
  const prevMinute = minute - 1;
  const prevPrices = lastPrices[prevMinute];
  if (!prevPrices) {
    // Actualizar lastPrices con los últimos precios del minuto actual
    lastPrices[minute] = {};
    for (const s in data) {
      const prices = data[s];
      if (prices && prices.length > 0) {
        lastPrices[minute][s] = prices[prices.length - 1];
      }
    }
    return;
  }

  let best = null;

  for (const symbol in data) {
    const prices = data[symbol];
    if (!prices || prices.length < 5) continue;
    const prevLast = prevPrices[symbol];
    if (prevLast === undefined) continue;
    const currentLast = prices[prices.length - 1];
    // Movimiento entre el cierre del minuto anterior y el cierre del minuto actual
    const move = currentLast - prevLast;
    const rawScore = Math.abs(move);
    const normScore = rawScore / (NORMALIZATION[symbol] || 1);
    if (!best || normScore > best.score) {
      best = { symbol, move, score: normScore };
    }
  }

  // Umbral de corte para evitar señales con movimientos insignificantes
  if (!best || best.score < 0.015) {
    // Actualizar los últimos precios del minuto actual antes de salir
    lastPrices[minute] = {};
    for (const s in data) {
      const prices = data[s];
      if (prices && prices.length > 0) {
        lastPrices[minute][s] = prices[prices.length - 1];
      }
    }
    return;
  }

  const direction = best.move > 0 ? "CALL" : "PUT";
  showSignal(minute, best.symbol, direction);

  // Actualizar los últimos precios del minuto actual para la siguiente evaluación
  lastPrices[minute] = {};
  for (const s in data) {
    const prices = data[s];
    if (prices && prices.length > 0) {
      lastPrices[minute][s] = prices[prices.length - 1];
    }
  }
}

/* =====================
   Señales
===================== */

function showSignal(minute, symbol, direction) {
  signalCount++;
  counterEl.textContent = `Señales: ${signalCount}`;

  const time =
    new Date(minute * 60000).toISOString().substr(11, 8) + " UTC";

  const row = document.createElement("div");
  row.className = "row";
  row.innerHTML = `
    ${time} | ${symbol} | ${direction}
    <button data-v="like"></button>
    <button data-v="dislike"></button>
    <input placeholder="comentario">
  `;

  row.querySelectorAll("button").forEach(btn => {
    btn.onclick = () => {
      const comment = row.querySelector("input").value || "";
      feedbackEl.value +=
        \`${time} | ${symbol} | ${direction} | ${btn.dataset.v} | \\n${comment}\\n\`;
      btn.disabled = true;
    };
  });

  signalsEl.prepend(row);

  if (soundEnabled) {
    sound.currentTime = 0;
    sound.play().catch(() => {});
  }
}

/* =====================
   Iniciar
===================== */

connect();