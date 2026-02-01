const APP_ID = 1089;
const WS_URL = `wss://ws.derivws.com/websockets/v3?app_id=${APP_ID}`;
const SYMBOLS = ["R_10", "R_25", "R_50", "R_75"];

let ws;
let soundEnabled = false;
let signalCount = 0;

let buffer = {};
let fired = {};
let lastMinuteSignal = {};

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

  ws.onerror = () => {
    statusEl.textContent = "❌ Error de conexión";
  };
}

function subscribe(symbol) {
  ws.send(JSON.stringify({
    ticks: symbol,
    subscribe: 1
  }));
}

function processTick(tick) {
  const symbol = tick.symbol;
  const t = Math.floor(tick.epoch);
  const minute = Math.floor(t / 60);
  const sec = t % 60;

  if (!buffer[symbol]) buffer[symbol] = {};
  if (!buffer[symbol][minute]) buffer[symbol][minute] = [];

  buffer[symbol][minute].push(tick.quote);

  const key = symbol + "_" + minute;

  if (sec >= 45 && sec <= 46 && !fired[key]) {
    fired[key] = true;
    analyze(symbol, minute);
  }
}

function analyze(symbol, minute) {
  if (lastMinuteSignal[symbol] === minute) return;

  const prices = buffer[symbol][minute];
  if (!prices || prices.length < 5) return;

  const move = prices[prices.length - 1] - prices[0];
  if (Math.abs(move) < 0.12) return;

  const direction = move > 0 ? "CALL" : "PUT";
  lastMinuteSignal[symbol] = minute;

  signalCount++;
  counterEl.textContent = `Señales: ${signalCount}`;

  showSignal(symbol, minute, direction);
}

function showSignal(symbol, minute, direction) {
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
      btn.disabled = true;
      const c = row.querySelector("input").value || "";
      feedbackEl.value += `${time} | ${symbol} | ${direction} | ${btn.dataset.v} | ${c}\n`;
    };
  });

  signalsEl.prepend(row);

  if (soundEnabled) {
    sound.currentTime = 0;
    sound.play();
  }
}

connect();
