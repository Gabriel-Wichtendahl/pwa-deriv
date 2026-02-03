const WS_URL = "wss://ws.derivws.com/websockets/v3?app_id=1089";
const SYMBOLS = ["R_10", "R_25", "R_50", "R_75"];

/* =========================
   Config Deriv Deep Link (DEMO + Rise/Fall)
========================= */
const DERIV_DTRADER_TEMPLATE =
  "https://app.deriv.com/dtrader?symbol=R_75&account=demo&lang=ES&chart_type=area&interval=1t&trade_type=rise_fall_equal";

function makeDerivTraderUrl(symbol) {
  const u = new URL(DERIV_DTRADER_TEMPLATE);
  u.searchParams.set("symbol", symbol);
  return u.toString();
}

/* =========================
   Labels (CALL/PUT -> COMPRA/VENTA)
========================= */
function labelForDirection(direction) {
  return direction === "CALL" ? "COMPRA" : "VENTA";
}

function cssClassForDirection(direction) {
  return direction === "CALL" ? "call" : "put";
}

/* =========================
   Estado
========================= */
let ws;

let soundEnabled = false;
let vibrateEnabled = true;

let signalCount = 0;
let likeCount = 0;
let dislikeCount = 0;

let minuteData = {};
let lastEvaluatedMinute = null;
let lastSignalSymbol = null;

let evalRetryTimer = null;

const MIN_TICKS = 3;
const MIN_SYMBOLS_READY = 2;
const RETRY_DELAY_MS = 5000;

// umbrales
const THRESHOLD_NORMAL = 0.015;
const THRESHOLD_STRONG = 0.03;

let evalSecond = 45;        // 45 / 50 / 55
let strongOnly = false;     // filtro señales fuertes

/* =========================
   UI
========================= */
const statusEl = document.getElementById("status");
const signalsEl = document.getElementById("signals");
const counterEl = document.getElementById("counter");
const feedbackEl = document.getElementById("feedback");

const likeCountEl = document.getElementById("likeCount");
const dislikeCountEl = document.getElementById("dislikeCount");

const sound = document.getElementById("alertSound");

const soundBtn = document.getElementById("soundBtn");
const wakeBtn = document.getElementById("wakeBtn");
const themeBtn = document.getElementById("themeBtn");
const vibrateBtn = document.getElementById("vibrateBtn");

const evalSelect = document.getElementById("evalSelect");
const strongToggle = document.getElementById("strongToggle");

/* =========================
   Helpers
========================= */
function setBtnActive(btn, active) {
  if (!btn) return;
  btn.classList.toggle("active", !!active);
}

function loadBool(key, fallback) {
  const v = localStorage.getItem(key);
  if (v === null) return fallback;
  return v === "1";
}

function saveBool(key, value) {
  localStorage.setItem(key, value ? "1" : "0");
}

function loadNumber(key, fallback) {
  const v = localStorage.getItem(key);
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function saveNumber(key, value) {
  localStorage.setItem(key, String(value));
}

function updateStatsUI() {
  counterEl.textContent = `Señales: ${signalCount}`;
  if (likeCountEl) likeCountEl.textContent = `👍 ${likeCount}`;
  if (dislikeCountEl) dislikeCountEl.textContent = `👎 ${dislikeCount}`;
}

/* =========================
   🌙 Tema oscuro/claro
========================= */
function applyTheme(theme) {
  const isLight = theme === "light";
  document.body.classList.toggle("light", isLight);
  if (themeBtn) themeBtn.textContent = isLight ? "☀️ Claro" : "🌙 Oscuro";
  localStorage.setItem("theme", theme);
}

(function initTheme() {
  const saved = localStorage.getItem("theme") || "dark";
  applyTheme(saved);

  if (themeBtn) {
    themeBtn.onclick = () => {
      const current = document.body.classList.contains("light") ? "light" : "dark";
      applyTheme(current === "light" ? "dark" : "light");
    };
  }
})();

/* =========================
   ⚙️ Config (45/50/55 + fuertes)
========================= */
(function initConfig() {
  evalSecond = loadNumber("evalSecond", 45);
  if (![45, 50, 55].includes(evalSecond)) evalSecond = 45;

  strongOnly = loadBool("strongOnly", false);

  if (evalSelect) {
    evalSelect.value = String(evalSecond);
    evalSelect.onchange = () => {
      evalSecond = Number(evalSelect.value) || 45;
      saveNumber("evalSecond", evalSecond);
    };
  }

  if (strongToggle) {
    strongToggle.checked = strongOnly;
    strongToggle.onchange = () => {
      strongOnly = !!strongToggle.checked;
      saveBool("strongOnly", strongOnly);
    };
  }
})();

/* =========================
   🔔 Notificaciones
========================= */
if ("Notification" in window && Notification.permission === "default") {
  Notification.requestPermission().catch(() => {});
}

function vibratePatternForDirection(direction) {
  // CALL (COMPRA) = corto, PUT (VENTA) = más largo
  return direction === "CALL" ? [120] : [180, 80, 180];
}

function showNotification(symbol, direction) {
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  const title = "📈 Deriv Signal";
  const body = `${symbol} – ${labelForDirection(direction)}`;
  const url = makeDerivTraderUrl(symbol);

  navigator.serviceWorker.getRegistration().then(reg => {
    if (!reg) return;

    reg.showNotification(title, {
      body,
      icon: "icon-192.png",
      badge: "icon-192.png",
      tag: "deriv-signal",
      renotify: true,
      requireInteraction: true,
      silent: false,

      vibrate: vibrateEnabled ? vibratePatternForDirection(direction) : undefined,

      // click abre Deriv demo/rise-fall con símbolo
      data: { url, symbol, direction },

      actions: [{ action: "open", title: "Abrir Deriv" }]
    });
  });
}

/* =========================
   📳 Vibración (toggle)
========================= */
(function initVibrationToggle() {
  vibrateEnabled = loadBool("vibrateEnabled", true);

  if (vibrateBtn) {
    setBtnActive(vibrateBtn, vibrateEnabled);
    vibrateBtn.textContent = vibrateEnabled ? "📳 Vibración ON" : "📳 Vibración OFF";

    vibrateBtn.onclick = () => {
      vibrateEnabled = !vibrateEnabled;
      saveBool("vibrateEnabled", vibrateEnabled);

      setBtnActive(vibrateBtn, vibrateEnabled);
      vibrateBtn.textContent = vibrateEnabled ? "📳 Vibración ON" : "📳 Vibración OFF";

      if (vibrateEnabled && "vibrate" in navigator) navigator.vibrate([80]);
    };
  }
})();

/* =========================
   🔊 Sonido (toggle + color)
========================= */
(function initSoundToggle() {
  soundEnabled = loadBool("soundEnabled", false);

  setBtnActive(soundBtn, soundEnabled);
  if (soundBtn) soundBtn.textContent = soundEnabled ? "🔊 Sonido ON" : "🔇 Sonido OFF";

  if (soundBtn) {
    soundBtn.onclick = async () => {
      if (!soundEnabled) {
        try {
          sound.muted = false;
          sound.volume = 1;
          sound.currentTime = 0;

          await sound.play();
          sound.pause();

          soundEnabled = true;
          saveBool("soundEnabled", true);

          setBtnActive(soundBtn, true);
          soundBtn.textContent = "🔊 Sonido ON";
          alert("🔊 Sonido activado correctamente");
        } catch (e) {
          alert("⚠️ El navegador bloqueó el audio. Tocá nuevamente.");
          console.error(e);
        }
      } else {
        soundEnabled = false;
        saveBool("soundEnabled", false);

        setBtnActive(soundBtn, false);
        soundBtn.textContent = "🔇 Sonido OFF";
      }
    };
  }
})();

/* =========================
   Feedback
========================= */
document.getElementById("copyFeedback").onclick = () => {
  navigator.clipboard.writeText(feedbackEl.value);
};

/* =========================
   WebSocket
========================= */
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

/* =========================
   Ticks
========================= */
function onTick(tick) {
  const epoch = Math.floor(tick.epoch);
  const minute = Math.floor(epoch / 60);
  const sec = epoch % 60;
  const symbol = tick.symbol;

  if (!minuteData[minute]) minuteData[minute] = {};
  if (!minuteData[minute][symbol]) minuteData[minute][symbol] = [];
  minuteData[minute][symbol].push(tick.quote);

  // primer intento en segundo configurable (45/50/55)
  if (sec >= evalSecond && lastEvaluatedMinute !== minute) {
    lastEvaluatedMinute = minute;
    const ok = evaluateMinute(minute);
    if (!ok) scheduleRetry(minute);
  }

  // limpieza simple
  delete minuteData[minute - 2];
}

function scheduleRetry(minute) {
  if (evalRetryTimer) clearTimeout(evalRetryTimer);

  evalRetryTimer = setTimeout(() => {
    const nowMinute = Math.floor(Date.now() / 1000 / 60);
    if (nowMinute === minute) evaluateMinute(minute);
  }, RETRY_DELAY_MS);
}

/* =========================
   Evaluación
========================= */
function evaluateMinute(minute) {
  const data = minuteData[minute];
  if (!data) return false;

  const candidates = [];
  let readySymbols = 0;

  for (const symbol of SYMBOLS) {
    const prices = data[symbol] || [];
    if (prices.length >= MIN_TICKS) readySymbols++;
    if (prices.length < MIN_TICKS) continue;

    const move = prices[prices.length - 1] - prices[0];
    const rawMove = Math.abs(move);

    // volatilidad promedio
    let vol = 0;
    for (let i = 1; i < prices.length; i++) vol += Math.abs(prices[i] - prices[i - 1]);
    vol = vol / Math.max(1, prices.length - 1);

    const score = rawMove / (vol || 1e-9);
    candidates.push({ symbol, move, score });
  }

  if (readySymbols < MIN_SYMBOLS_READY) return false;
  if (candidates.length === 0) return false;

  candidates.sort((a, b) => b.score - a.score);
  let best = candidates[0];

  // anti-monopolio suave
  const second = candidates[1];
  if (second && best.symbol === lastSignalSymbol && second.score >= best.score * 0.90) {
    best = second;
  }

  const threshold = strongOnly ? THRESHOLD_STRONG : THRESHOLD_NORMAL;
  if (!best || best.score < threshold) return true;

  lastSignalSymbol = best.symbol;
  const direction = best.move > 0 ? "CALL" : "PUT";
  showSignal(minute, best.symbol, direction);

  return true;
}

/* =========================
   Mostrar señal (tap abre Deriv)
========================= */
function showSignal(minute, symbol, direction) {
  signalCount++;
  updateStatsUI();

  const time = new Date(minute * 60000).toISOString().substr(11, 8) + " UTC";
  const label = labelForDirection(direction);
  const derivUrl = makeDerivTraderUrl(symbol);

  const row = document.createElement("div");
  row.className = `row ${cssClassForDirection(direction)} flash`;
  row.setAttribute("role", "button");
  row.setAttribute("aria-label", `Abrir Deriv: ${symbol} ${label}`);
  row.title = "Tocar para abrir Deriv";

  row.innerHTML = `
    <div class="topline">
      <div>${time} | ${symbol}</div>
      <div class="badge">${label}</div>
    </div>

    <div class="actions">
      <button type="button" data-v="like">👍</button>
      <button type="button" data-v="dislike">👎</button>
      <input placeholder="comentario">
    </div>
  `;

  // ✅ Tap en el row abre Deriv (pero NO si tocás botones/input)
  row.addEventListener("click", (e) => {
    const target = e.target;
    if (target?.closest("button") || target?.closest("input")) return;
    window.open(derivUrl, "_blank", "noopener,noreferrer");
  });

  const likeBtn = row.querySelector('button[data-v="like"]');
  const dislikeBtn = row.querySelector('button[data-v="dislike"]');
  const commentInput = row.querySelector("input");

  function lockVotes() {
    likeBtn.disabled = true;
    dislikeBtn.disabled = true;
  }

  likeBtn.onclick = (e) => {
    e.stopPropagation();
    likeCount++;
    updateStatsUI();

    const comment = commentInput.value || "";
    feedbackEl.value += `${time} | ${symbol} | ${label} | like | ${comment}\n`;
    lockVotes();
  };

  dislikeBtn.onclick = (e) => {
    e.stopPropagation();
    dislikeCount++;
    updateStatsUI();

    const comment = commentInput.value || "";
    feedbackEl.value += `${time} | ${symbol} | ${label} | dislike | ${comment}\n`;
    lockVotes();
  };

  commentInput.addEventListener("click", (e) => e.stopPropagation());
  commentInput.addEventListener("keydown", (e) => e.stopPropagation());

  signalsEl.prepend(row);

  setTimeout(() => row.classList.remove("flash"), 2200);

  // 🔊 sonido
  if (soundEnabled) {
    sound.currentTime = 0;
    sound.play().catch(() => {});
  }

  // 📳 vibración local
  if (vibrateEnabled && "vibrate" in navigator) {
    navigator.vibrate(vibratePatternForDirection(direction));
  }

  // 🔔 notificación
  showNotification(symbol, direction);
}

/* =========================
   🔒 Wake Lock
========================= */
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
  } catch {
    alert("No se pudo mantener la pantalla activa");
  }
};

/* =========================
   Start
========================= */
updateStatsUI();
connect();