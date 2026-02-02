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

/* UI */
const statusEl = document.getElementById("status");
const signalsEl = document.getElementById("signals");
const counterEl = document.getElementById("counter");
const feedbackEl = document.getElementById("feedback");
const sound = document.getElementById("alertSound");
const wakeBtn = document.getElementById("wakeBtn");

/* Sonido */
document.getElementById("soundBtn").onclick = () => {
  sound.play().then(() => {
    soundEnabled = true;
    alert("🔊 Sonido activado");
  });
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

  if (sec >= 45 && lastEvaluatedMinute !== minute) {
    lastEvaluatedMinute = minute;
    evaluateMinute(minute);
  }
}

/* Evaluación */
function evaluateMinute(minute) {
  const data = minuteData[minute];
  if (!data) return;

  let best = null;

  for (const symbol in data) {
    const prices = data[symbol];
    if (prices.length < 5) continue;

    const move = prices[prices.length - 1] - prices[0];
    const score = Math.abs(move) / (NORMALIZATION[symbol] || 1);

    if (!best || score > best.score) {
      best = { symbol, move, score };
    }
  }

  if (!best || best.score < 0.015) return;

  showSignal(minute, best.symbol, best.move > 0 ? "CALL" : "PUT");
}

/* Mostrar señal */
function showSignal(minute, symbol, direction) {
  signalCount++;
  counterEl.textContent = `Señales: ${signalCount}`;

  const time =
    new Date(minute * 60000).toISOString().substr(11, 8) + " UTC";

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
      feedbackEl.value +=
        `${time} | ${symbol} | ${direction} | ${btn.dataset.v} | ${comment}\n`;
      btn.disabled = true;
    };
  });

  signalsEl.prepend(row);

  if (soundEnabled) {
    sound.currentTime = 0;
    sound.play();
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