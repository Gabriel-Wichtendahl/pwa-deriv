const APP_ID = 1089;
const WS_URL = `wss://ws.derivws.com/websockets/v3?app_id=${APP_ID}`;
const SYMBOLS = ["R_10", "R_25", "R_50", "R_75"];

let socket;
let soundEnabled = false;
let lastSignalMinute = {}; // 1 señal por símbolo por minuto
let signalCount = 0;

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
  socket = new WebSocket(WS_URL);

  socket.onopen = () => {
    statusEl.textContent = "Conectado - Analizando en vivo";
    SYMBOLS.forEach(s => subscribe(s));
  };

  socket.onerror = () => {
    statusEl.textContent = "❌ Error de conexión";
  };

  socket.onmessage = e => {
    const data = JSON.parse(e.data);
    if (data.tick) processTick(data.tick);
  };
}

function subscribe(symbol) {
  socket.send(JSON.stringify({
    ticks: symbol,
    subscribe: 1
  }));
}

let buffer = {};

function processTick(tick) {
  const symbol = tick.symbol;
  const time = Math.floor(tick.epoch);
  const minute = Math.floor(time / 60);
  const sec = time % 60;

  if (!buffer[symbol]) buffer[symbol] = {};
  if (!buffer[symbol][minute]) buffer[symbol][minute] = [];

  buffer[symbol][minute].push({ sec, price: tick.quote });

  // ANALISIS EXACTO EN SEGUNDO 45
  if (sec === 45) analyze(symbol, minute);
}

function analyze(symbol, minute) {
  if (lastSignalMinute[symbol] === minute) return;

  const data = buffer[symbol][minute];
  if (!data || data.length < 10) return;

  const p0 = data[0].price;
  const p45 = data[data.length - 1].price;

  const move = p45 - p0;
  if (Math.abs(move) < 0.3) return; // sin tendencia clara

  const direction = move > 0 ? "CALL" : "PUT";

  lastSignalMinute[symbol] = minute;
  signalCount++;
  counterEl.textContent = `Señales: ${signalCount}`;

  showSignal(symbol, minute, direction);
}

function showSignal(symbol, minute, direction) {
  const d = new Date(minute * 60000);
  const time = d.toISOString().substr(11, 8) + " UTC";

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
