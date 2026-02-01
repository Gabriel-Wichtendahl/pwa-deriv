// ==============================
// CONFIG
// ==============================
const APP_ID = 1089;
const WS_URL = `wss://ws.derivws.com/websockets/v3?app_id=${APP_ID}`;
const SYMBOLS = ["R_10", "R_25", "R_50", "R_75"];

let socket;

// ==============================
// ESTADO
// ==============================
let minuteBuckets = {};      // ticks por símbolo y minuto
let bestCandidate = {};      // mejor señal por símbolo y minuto
let emitted = {};            // evitar duplicados

// ==============================
// CONEXIÓN
// ==============================
function connect() {
  socket = new WebSocket(WS_URL);

  socket.onopen = () => {
    setStatus("Conectado a Deriv - Analizando en vivo");
    SYMBOLS.forEach(subscribe);
  };

  socket.onmessage = (e) => {
    const data = JSON.parse(e.data);
    if (data.tick) handleTick(data.tick);
  };
}

// ==============================
// SUBSCRIBE
// ==============================
function subscribe(symbol) {
  socket.send(JSON.stringify({
    ticks: symbol,
    subscribe: 1
  }));
}

// ==============================
// TICKS
// ==============================
function handleTick(tick) {
  const symbol = tick.symbol;
  const price = tick.quote;
  const time = Math.floor(tick.epoch);
  const minuteKey = Math.floor(time / 60);
  const second = time % 60;

  const key = `${symbol}_${minuteKey}`;

  if (!minuteBuckets[key]) minuteBuckets[key] = [];
  minuteBuckets[key].push({ second, price });

  // SOLO ANALIZAMOS HASTA SEG 45
  if (second === 45) {
    analyzeMinute(symbol, minuteKey);
    emitIfExists(symbol, minuteKey);
  }
}

// ==============================
// ANALISIS
// ==============================
function analyzeMinute(symbol, minuteKey) {
  const key = `${symbol}_${minuteKey}`;
  const ticks = minuteBuckets[key];
  if (!ticks || ticks.length < 10) return;

  const window = ticks.filter(t => t.second <= 45);
  if (window.length < 10) return;

  const start = window[0].price;
  const end = window[window.length - 1].price;
  const dir = end > start ? "CALL" : end < start ? "PUT" : null;
  if (!dir) return;

  // SCORE DE FLUIR
  let advance = Math.abs(end - start);
  let retrace = 0;

  for (let i = 1; i < window.length; i++) {
    const delta = window[i].price - window[i - 1].price;
    if ((dir === "CALL" && delta < 0) || (dir === "PUT" && delta > 0)) {
      retrace += Math.abs(delta);
    }
  }

  const score = advance - retrace;

  if (!bestCandidate[key] || score > bestCandidate[key].score) {
    bestCandidate[key] = {
      symbol,
      minuteKey,
      direction: dir,
      score
    };
  }
}

// ==============================
// EMITIR SOLO UNA
// ==============================
function emitIfExists(symbol, minuteKey) {
  const key = `${symbol}_${minuteKey}`;
  if (emitted[key]) return;

  const best = bestCandidate[key];
  if (!best) return;

  emitted[key] = true;

  const d = new Date(minuteKey * 60000);
  const timeStr =
    String(d.getUTCHours()).padStart(2, "0") + ":" +
    String(d.getUTCMinutes()).padStart(2, "0") + ":00 UTC";

  addSignal({
    time: timeStr,
    symbol: best.symbol,
    direction: best.direction
  });

  playAlert();
}

// ==============================
// START
// ==============================
connect();
