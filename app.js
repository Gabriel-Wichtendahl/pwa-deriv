const WS_URL = "wss://ws.derivws.com/websockets/v3?app_id=1089";
const SYMBOLS = ["R_10", "R_25", "R_50", "R_75"];

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
const themeBtn = document.getElementById("themeBtn");

/* ✅ TEMA OSCURO/CLARO */
function applyTheme(theme) {
  const isLight = theme === "light";
  document.body.classList.toggle("light", isLight);
  themeBtn.textContent = isLight ? "☀️ Claro" : "🌙 Oscuro";
  localStorage.setItem("theme", theme);
}
applyTheme(localStorage.getItem("theme") || "dark");

themeBtn.onclick = () => {
  const current = document.body.classList.contains("light") ? "light" : "dark";
  applyTheme(current === "light" ? "dark" : "light");
};

/* 🔊 Sonido (PWA Android OK) */
document.getElementById("soundBtn").onclick = async () => {
  try {
    sound.muted = false;
    sound.volume = 1;
    sound.currentTime = 0;

    await sound.play();   // desbloquea
    sound.pause();

    soundEnabled = true;
    alert("🔊 Sonido activado");
  } catch (e) {
    alert("⚠️ Tocá nuevamente para habilitar sonido");
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

  if (sec >= 50 && lastEvaluatedMinute !== minute) {
    lastEvaluatedMinute = minute;
    evaluateMinute(minute);
  }

  delete minuteData[minute - 2];
}

function evaluateMinute(minute) {
  const data = minuteData[minute];
  if (!data) return;

  let best = null;

  for (const symbol of SYMBOLS) {
    const prices = data[symbol] || [];
    if (prices.length < 3) continue;

    const move = prices[prices.length - 1] - prices[0];
    const score = Math.abs(move);

    if (!best || score > best.score) best = { symbol, move, score };
  }

  if (!best || best.score < 0.01) return;

  const direction = best.move > 0 ? "CALL" : "PUT";
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

connect();