const WS_URL = "wss://ws.derivws.com/websockets/v3?app_id=1089";
const SYMBOLS = ["R_10", "R_25", "R_50", "R_75"];

let ws;
let soundEnabled = false;
let signalCount = 0;

let minuteData = {};
let lastEvaluatedMinute = null;

let lastSignalSymbol = null; // anti-monopolio suave

/* UI */
const statusEl = document.getElementById("status");
const signalsEl = document.getElementById("signals");
const counterEl = document.getElementById("counter");
const feedbackEl = document.getElementById("feedback");
const sound = document.getElementById("alertSound");
const wakeBtn = document.getElementById("wakeBtn");

/* 🔊 Sonido (PWA Android friendly) */
document.getElementById("soundBtn").onclick = async () => {
  try {
    sound.muted = false;
    sound.volume = 1;
    sound.currentTime = 0;

    // desbloqueo real
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

  ws.onerror = () => {
    statusEl.textContent = "Error WS – reconectando...";
  };

  ws.onclose = () => {
    statusEl.textContent = "Desconectado – reconectando...";
    setTimeout(connect, 1500);
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

  // ✅ evaluar una sola vez por minuto desde seg 45
  if (sec >= 45 && lastEvaluatedMinute !== minute) {
    lastEvaluatedMinute = minute;
    evaluateMinute(minute);
  }

  // limpieza (mantener solo últimos 2 minutos)
  const oldMinute = minute - 2;
  if (minuteData[oldMinute]) delete minuteData[oldMinute];
}

/* Evaluación */
function evaluateMinute(minute) {
  const data = minuteData[minute];
  if (!data) return;

  const candidates = [];

  for (const symbol of SYMBOLS) {
    const prices = data[symbol] || [];
    if (prices.length < 3) continue;

    const move = prices[prices.length - 1] - prices[0];
    const rawMove = Math.abs(move);

    // ✅ volatilidad: promedio de |delta| por tick
    let vol = 0;
    for (let i = 1; i < prices.length; i++) {
      vol += Math.abs(prices[i] - prices[i - 1]);
    }
    vol = vol / Math.max(1, prices.length - 1);

    // ✅ score: tendencia relativa al ruido
    const score = rawMove / (vol || 1e-9);

    candidates.push({ symbol, move, score });
  }

  if (candidates.length === 0) return;

  // ordenar por mejor score
  candidates.sort((a, b) => b.score - a.score);
  let best = candidates[0];

  // ✅ anti-monopolio suave:
  // si el mismo símbolo vuelve a ganar y el 2° está muy cerca (<=10%),
  // alternamos para evitar monopolio cuando están parejos.
  const second = candidates[1];
  if (
    second &&
    best.symbol === lastSignalSymbol &&
    second.score >= best.score * 0.90
  ) {
    best = second;
  }

  // umbral bajo para no matar señales
  if (!best || best.score < 0.015) return;

  lastSignalSymbol = best.symbol;

  const direction = best.move > 0 ? "CALL" : "PUT";
  showSignal(minute, best.symbol, direction);
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

/* 🔒 Wake Lock */
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

document.addEventListener("visibilitychange", () => {
  // si querés re-adquirir al volver visible, lo podemos hacer luego (opcional)
});

connect();