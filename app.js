// ================= CONFIG =================
const APP_ID = 1089;
const WS_URL = `wss://ws.derivws.com/websockets/v3?app_id=${APP_ID}`;
const SYMBOLS = ["R_10", "R_25", "R_50", "R_75"];
const SOUND_URL = "https://actions.google.com/sounds/v1/alarms/beep_short.ogg";

// ================= STATE =================
let socket;
let lastMinute = {};
let signalCount = 0;
let soundEnabled = false;

// ================= UI =================
const statusEl = document.getElementById("status");
const signalsEl = document.getElementById("signals");
const counterEl = document.getElementById("counter");
const soundBtn = document.getElementById("enableSound");

function setStatus(t) {
  statusEl.textContent = t;
}

// ================= AUDIO ENABLE =================
soundBtn.addEventListener("click", async () => {
  try {
    const a = new Audio(SOUND_URL);
    await a.play();
    a.pause();
    soundEnabled = true;
    soundBtn.textContent = "🔔 Alertas activas";
    keepAwake();
  } catch (e) {
    alert("Tocá el botón nuevamente");
  }
});

// ================= WAKE LOCK =================
let wakeLock = null;
async function keepAwake() {
  try {
    wakeLock = await navigator.wakeLock.request("screen");
  } catch {}
}

// ================= WS =================
function connect() {
  socket = new WebSocket(WS_URL);

  socket.onopen = () => {
    setStatus("Conectado – Analizando en vivo");
    SYMBOLS.forEach(s => {
      socket.send(JSON.stringify({ ticks: s, subscribe: 1 }));
    });
  };

  socket.onmessage = e => {
    const d = JSON.parse(e.data);
    if (d.tick) processTick(d.tick);
  };
}

function processTick(tick) {
  const s = tick.symbol;
  const p = tick.quote;
  const t = Math.floor(tick.epoch);
  const mKey = Math.floor(t / 60);

  if (!lastMinute[s]) lastMinute[s] = { key: mKey, prices: [] };

  if (lastMinute[s].key !== mKey) {
    analyzeMinute(s, lastMinute[s].prices, lastMinute[s].key);
    lastMinute[s] = { key: mKey, prices: [] };
  }

  lastMinute[s].prices.push({ t, p });
}

function analyzeMinute(symbol, prices, minuteKey) {
  if (prices.length < 10) return;

  const first30 = prices.filter(x => x.t % 60 <= 29);
  const sec45 = prices.find(x => x.t % 60 >= 45);
  if (!sec45 || first30.length < 5) return;

  const start = first30[0].p;
  const end30 = first30[first30.length - 1].p;

  let dir = null;
  if (end30 > start) dir = "CALL";
  if (end30 < start) dir = "PUT";
  if (!dir) return;

  if (dir === "CALL" && sec45.p <= end30) return;
  if (dir === "PUT" && sec45.p >= end30) return;

  fireSignal(symbol, dir, minuteKey);
}

function fireSignal(symbol, dir, minuteKey) {
  const d = new Date(minuteKey * 60000);
  const time =
    String(d.getUTCHours()).padStart(2, "0") + ":" +
    String(d.getUTCMinutes()).padStart(2, "0") + ":00 UTC";

  const row = document.createElement("div");
  row.className = `signal ${dir}`;
  row.textContent = `${time} | ${symbol} | ${dir}`;
  signalsEl.prepend(row);

  signalCount++;
  counterEl.textContent = "Señales: " + signalCount;

  if (soundEnabled) {
    new Audio(SOUND_URL).play();
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
  }
}

// ================= START =================
connect();

