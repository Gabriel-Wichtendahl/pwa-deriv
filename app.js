const APP_ID = 1089;
const WS_URL = `wss://ws.derivws.com/websockets/v3?app_id=${APP_ID}`;
const SYMBOLS = ["R_10", "R_25", "R_50", "R_75"];

let ws;
let soundEnabled = false;
let signalCount = 0;

let buffer = {};
let evaluatedMinute = null;

const statusEl = document.getElementById("status");
const signalsEl = document.getElementById("signals");
const counterEl = document.getElementById("counter");
const feedbackEl = document.getElementById("feedback");
const sound = document.getElementById("alertSound");

document.getElementById("soundBtn").onclick = () => {
  sound.play().then(() => {
    soundEnabled = true;
    alert("🔊 Sonido activado");
  });
};

document.getElementById("copyFeedback").onclick = () => {
  navigator.clipboard.writeText(feedbackEl.value);
};

function connect() {
  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    ws.send(JSON.stringify({ authorize: "anonymous" }));
  };

  ws.onmessage = e => {
    const data = JSON.parse(e.data);

    if (data.msg_type === "authorize") {
      statusEl.textContent = "Conectado – Analizando en vivo";
      SYMBOLS.forEach(subscribe);
    }

    if (data.tick) processTick(data.tick);
  };
}

function subscribe(symbol) {
  ws.send(JSON.stringify({ ticks: symbol, subscribe: 1 }));
}

function processTick(tick) {
  const symbol = tick.symbol;
  const epoch = Math.floor(tick.epoch);
  const minute = Math.floor(epoch / 60);
  const sec = epoch % 60;

  if (!buffer[minute]) buffer[minute] = {};
  if (!buffer[minute][symbol]) buffer[minute][symbol] = [];

  buffer[minute][symbol].push(tick.quote);

  // 🔥 Evaluamos SOLO una vez por minuto en seg 45
  if (sec === 45 && evaluatedMinute !== minute) {
    evaluatedMinute = minute;
    evaluateMinute(minute);
  }
}

function evaluateMinute(minute) {
  const data = buffer[minute];
  if (!data) return;

  let best = null;

  for (const symbol of Object.keys(data)) {
    const prices = data[symbol];
    if (prices.length < 5) continue;

    const move = prices[prices.length - 1] - prices[0];
    const score = Math.abs(move);

    if (!best || score > best.score) {
      best = {
        symbol,
        move,
        score
      };
    }
  }

  if (!best || best.score < 0.12) return;

  const direction = best.move > 0 ? "CALL" : "PUT";
  showSignal(minute, best.symbol, direction);
}

function showSignal(minute, symbol, direction) {
  signalCount++;
  counterEl.textContent = `Señales: ${signalCount}`;

  const time = new Date(minute * 60000)
    .toISOString()
    .substr(11, 8) + " UTC";

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
      btn.disabled = true;
      const comment = row.querySelector("input").value || "";
      feedbackEl.value += `${time} | ${symbol} | ${direction} | ${btn.dataset.v} | ${comment}\n`;
    };
  });

  signalsEl.prepend(row);

  if (soundEnabled) {
    sound.currentTime = 0;
    sound.play();
  }
}

connect();

