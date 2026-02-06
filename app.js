// app.js — V6.1 (fix evaluación por reloj + gráfico 0–60 REAL usando ticks_history)
// + ✅ Badge visual cuando la flecha (próxima vela) coincide con la señal

const WS_URL = "wss://ws.derivws.com/websockets/v3?app_id=1089";
const SYMBOLS = ["R_10", "R_25", "R_50", "R_75"];

const DERIV_DTRADER_TEMPLATE =
  "https://app.deriv.com/dtrader?symbol=R_75&account=demo&lang=ES&chart_type=area&interval=1t&trade_type=rise_fall_equal";

const STORE_KEY = "derivSignalsHistory_v2";
const MAX_HISTORY = 200;

const MIN_TICKS = 3;
const MIN_SYMBOLS_READY = 2;
const RETRY_DELAY_MS = 5000;

/** ✅ ticks_history para completar minuto REAL */
const HISTORY_TIMEOUT_MS = 7000;
const HISTORY_COUNT_MAX = 5000;

const $ = (id) => document.getElementById(id);
const qsAll = (sel) => Array.from(document.querySelectorAll(sel));

const statusEl = $("status");
const signalsEl = $("signals");
const counterEl = $("counter");
const feedbackEl = $("feedback");
const tickHealthEl = $("tickHealth");
const countdownEl = $("countdown");
const sound = $("alertSound");

const soundBtn = $("soundBtn");
const vibrateBtn = $("vibrateBtn");
const wakeBtn = $("wakeBtn");
const themeBtn = $("themeBtn");
const clearHistoryBtn = $("clearHistoryBtn");
const copyBtn = $("copyFeedback");

const evalBtns = qsAll(".evalBtn");
const modeBtn = $("modeBtn");

const chartModal = $("chartModal");
const modalCloseBtn = $("modalCloseBtn");
const modalCloseBackdrop = $("modalCloseBackdrop");
const modalTitle = $("modalTitle");
const modalSub = $("modalSub");
const minuteCanvas = $("minuteCanvas");
const modalOpenDerivBtn = $("modalOpenDerivBtn");

let ws;
let soundEnabled = false;
let vibrateEnabled = true;

let EVAL_SEC = 45;       // 45/50/55
let strongMode = false;  // NORMAL/FUERTE

let history = loadHistory();
let signalCount = 0;

let minuteData = {};           // minute -> symbol -> [{ms, quote}, ...]
let lastEvaluatedMinute = null;
let evalRetryTimer = null;

let lastTickEpochMs = null;
let currentMinuteStartMs = null;

let lastSeenMinute = null;
let candleOC = {}; // minute -> symbol -> {open, close}

let lastQuoteBySymbol = {};
let lastMinuteSeenBySymbol = {};

let modalCurrentItem = null;

const CHART_ICON_SVG = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
<path d="M4 18V6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
<path d="M4 18H20" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
<path d="M6 14l4-4 3 3 5-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
<circle cx="10" cy="10" r="1" fill="currentColor"/><circle cx="13" cy="13" r="1" fill="currentColor"/><circle cx="18" cy="6" r="1" fill="currentColor"/>
</svg>`;

function makeDerivTraderUrl(symbol) {
  const u = new URL(DERIV_DTRADER_TEMPLATE);
  u.searchParams.set("symbol", symbol);
  return u.toString();
}
const labelDir = (d) => (d === "CALL" ? "COMPRA" : "VENTA");

/* =========================
   ✅ Badge match helpers
========================= */
function isMatch(direction, outcome) {
  if (!direction || !outcome) return false;
  if (outcome === "up" && direction === "CALL") return true;
  if (outcome === "down" && direction === "PUT") return true;
  return false;
}
function updateRowHitBadge(item) {
  const row = document.querySelector(`.row[data-id="${cssEscape(item.id)}"]`);
  if (!row) return;
  const badge = row.querySelector(".hitBadge");
  if (!badge) return;

  const show = !!item.hit; // boolean
  badge.classList.toggle("hidden", !show);

  if (show) {
    badge.title = "La próxima vela coincidió con la señal ✅";
  } else {
    badge.title = "";
  }
}

/* =========================
   Persistencia
========================= */
function loadHistory() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}
function saveHistory(arr) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(arr.slice(-MAX_HISTORY)));
  } catch {}
}

/* =========================
   Helpers UI / estado
========================= */
function setBtnActive(btn, active) { btn && btn.classList.toggle("active", !!active); }
function loadBool(key, fallback) {
  const v = localStorage.getItem(key);
  return v === null ? fallback : v === "1";
}
function saveBool(key, value) { localStorage.setItem(key, value ? "1" : "0"); }

function updateCounter() {
  if (counterEl) counterEl.textContent = `Señales: ${signalCount}`;
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
function cssEscape(s) { return String(s).replace(/"/g, '\\"'); }

function rebuildFeedbackFromHistory() {
  if (!feedbackEl) return;
  let text = "";
  for (const it of history) {
    const vote = it.vote || "";
    const comment = it.comment || "";
    if (!vote && !comment) continue;
    const modeLabel = it.mode || "NORMAL";
    text += `${it.time} | ${it.symbol} | ${labelDir(it.direction)} | [${modeLabel}] | ${vote} | ${comment}\n`;
  }
  feedbackEl.value = text;
}

/* =========================
   Theme
========================= */
function applyTheme(theme) {
  const isLight = theme === "light";
  document.body.classList.toggle("light", isLight);
  if (themeBtn) themeBtn.textContent = isLight ? "☀️ Claro" : "🌙 Oscuro";
  localStorage.setItem("theme", theme);
}
(function initTheme() {
  applyTheme(localStorage.getItem("theme") || "dark");
  if (themeBtn) themeBtn.onclick = () => {
    const current = document.body.classList.contains("light") ? "light" : "dark";
    applyTheme(current === "light" ? "dark" : "light");
  };
})();

/* =========================
   Eval sec + strong mode
========================= */
(function initEvalMode() {
  const savedSec = parseInt(localStorage.getItem("evalSec") || "45", 10);
  EVAL_SEC = [45, 50, 55].includes(savedSec) ? savedSec : 45;

  const paintEval = () => evalBtns.forEach(b => {
    const sec = parseInt(b.dataset.sec || "0", 10);
    b.classList.toggle("active", sec === EVAL_SEC);
  });
  paintEval();

  evalBtns.forEach(b => b.onclick = () => {
    const v = parseInt(b.dataset.sec || "45", 10);
    EVAL_SEC = [45, 50, 55].includes(v) ? v : 45;
    localStorage.setItem("evalSec", String(EVAL_SEC));
    paintEval();
  });

  strongMode = loadBool("strongMode", false);
  const paintMode = () => {
    if (!modeBtn) return;
    modeBtn.textContent = strongMode ? "🟧 Modo FUERTE" : "🟦 Modo NORMAL";
    modeBtn.classList.toggle("active-strong", strongMode);
  };
  paintMode();

  if (modeBtn) modeBtn.onclick = () => {
    strongMode = !strongMode;
    saveBool("strongMode", strongMode);
    paintMode();
  };
})();

/* =========================
   Sonido
========================= */
(function initSoundToggle() {
  soundEnabled = loadBool("soundEnabled", false);
  setBtnActive(soundBtn, soundEnabled);
  if (soundBtn) soundBtn.textContent = soundEnabled ? "🔊 Sonido ON" : "🔇 Sonido OFF";
  if (!soundBtn || !sound) return;

  soundBtn.onclick = async () => {
    if (!soundEnabled) {
      try {
        sound.muted = false; sound.volume = 1; sound.currentTime = 0;
        await sound.play(); sound.pause();
        soundEnabled = true; saveBool("soundEnabled", true);
        setBtnActive(soundBtn, true); soundBtn.textContent = "🔊 Sonido ON";
      } catch {
        alert("⚠️ El navegador bloqueó el audio. Tocá nuevamente.");
      }
      return;
    }
    soundEnabled = false; saveBool("soundEnabled", false);
    setBtnActive(soundBtn, false); soundBtn.textContent = "🔇 Sonido OFF";
  };
})();

/* =========================
   Vibración
========================= */
(function initVibrationToggle() {
  vibrateEnabled = loadBool("vibrateEnabled", true);
  if (!vibrateBtn) return;
  setBtnActive(vibrateBtn, vibrateEnabled);
  vibrateBtn.textContent = vibrateEnabled ? "📳 Vibración ON" : "📳 Vibración OFF";

  vibrateBtn.onclick = () => {
    vibrateEnabled = !vibrateEnabled;
    saveBool("vibrateEnabled", vibrateEnabled);
    setBtnActive(vibrateBtn, vibrateEnabled);
    vibrateBtn.textContent = vibrateEnabled ? "📳 Vibración ON" : "📳 Vibración OFF";
    if (vibrateEnabled && "vibrate" in navigator) navigator.vibrate([80]);
  };
})();

/* =========================
   Copy feedback
========================= */
if (copyBtn && feedbackEl) copyBtn.onclick = () => navigator.clipboard.writeText(feedbackEl.value || "");

/* =========================
   Clear history
========================= */
function clearHistory() {
  history = [];
  saveHistory(history);
  signalCount = 0;
  updateCounter();
  if (signalsEl) signalsEl.innerHTML = "";
  if (feedbackEl) feedbackEl.value = "";
}
if (clearHistoryBtn) clearHistoryBtn.onclick = () => {
  if (confirm("¿Seguro que querés borrar todas las señales guardadas?")) clearHistory();
};

/* =========================
   Notifications
========================= */
if ("Notification" in window && Notification.permission === "default") {
  Notification.requestPermission().catch(() => {});
}
function showNotification(symbol, direction, modeLabel) {
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  navigator.serviceWorker.getRegistration().then(reg => {
    if (!reg) return;
    reg.showNotification("📈 Deriv Signal", {
      body: `${symbol} – ${labelDir(direction)} – [${modeLabel || "NORMAL"}]`,
      icon: "icon-192.png",
      badge: "icon-192.png",
      tag: "deriv-signal",
      renotify: true,
      requireInteraction: true,
      silent: false,
      vibrate: vibrateEnabled ? [200, 100, 200] : undefined,
      data: { url: makeDerivTraderUrl(symbol), symbol, direction }
    });
  });
}

/* =========================
   Modal
========================= */
function openChartModal(item) {
  if (!item.minuteComplete) return;
  modalCurrentItem = item;
  if (!chartModal || !modalTitle || !modalSub) return;

  modalTitle.textContent = `${item.symbol} – ${labelDir(item.direction)} | [${item.mode || "NORMAL"}]`;
  modalSub.textContent = `${item.time} | ticks: ${(item.ticks || []).length}`;
  chartModal.classList.remove("hidden");
  chartModal.setAttribute("aria-hidden", "false");

  requestAnimationFrame(() => requestAnimationFrame(() => {
    drawDerivLikeChart(minuteCanvas, item.ticks || []);
  }));
}
function closeChartModal() {
  if (!chartModal) return;
  chartModal.classList.add("hidden");
  chartModal.setAttribute("aria-hidden", "true");
  modalCurrentItem = null;
}
if (modalCloseBtn) modalCloseBtn.onclick = closeChartModal;
if (modalCloseBackdrop) modalCloseBackdrop.onclick = closeChartModal;
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeChartModal(); });
if (modalOpenDerivBtn) modalOpenDerivBtn.onclick = () => {
  if (modalCurrentItem) window.location.href = makeDerivTraderUrl(modalCurrentItem.symbol);
};
window.addEventListener("resize", () => {
  if (!chartModal || chartModal.classList.contains("hidden")) return;
  if (modalCurrentItem) drawDerivLikeChart(minuteCanvas, modalCurrentItem.ticks || []);
});

/* =========================
   Chart
========================= */
function drawDerivLikeChart(canvas, ticks) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const cssW = canvas.clientWidth || 1, cssH = canvas.clientHeight || 1;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(cssW * dpr);
  canvas.height = Math.floor(cssH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const w = cssW, h = cssH;
  ctx.clearRect(0, 0, w, h);
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  ctx.fillRect(0, 0, w, h);
  ctx.globalAlpha = 1;

  if (!ticks || ticks.length < 2) return;

  const pts = [...ticks].sort((a, b) => a.ms - b.ms);
  const last = pts[pts.length - 1];
  if (last.ms < 60000) pts.push({ ms: 60000, quote: last.quote });

  const quotes = pts.map(p => p.quote);
  let min = Math.min(...quotes), max = Math.max(...quotes);
  let range = max - min; if (range < 1e-9) range = 1e-9;
  const pad = range * 0.08; min -= pad; max += pad;

  const xOf = (ms) => (ms / 60000) * (w - 20) + 10;
  const yOf = (q) => (1 - ((q - min) / (max - min))) * (h - 30) + 10;

  ctx.globalAlpha = 0.22;
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.lineWidth = 1;
  for (let i = 1; i <= 4; i++) {
    const y = (h / 5) * i;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }
  ctx.globalAlpha = 1;

  const x30 = xOf(30000);
  ctx.globalAlpha = 0.55;
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x30, 10); ctx.lineTo(x30, h - 20); ctx.stroke();
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.font = "12px system-ui, sans-serif";
  ctx.fillText("30s", Math.min(w - 28, x30 + 6), 22);
  ctx.globalAlpha = 1;

  ctx.beginPath();
  ctx.moveTo(xOf(pts[0].ms), h - 20);
  for (const p of pts) ctx.lineTo(xOf(p.ms), yOf(p.quote));
  ctx.lineTo(xOf(pts[pts.length - 1].ms), h - 20);
  ctx.closePath();
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.strokeStyle = "rgba(255,255,255,0.95)";
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  pts.forEach((p, i) => {
    const x = xOf(p.ms), y = yOf(p.quote);
    if (!i) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.stroke();

  const lx = xOf(pts[pts.length - 1].ms), ly = yOf(pts[pts.length - 1].quote);
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.beginPath(); ctx.arc(lx, ly, 3.5, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.font = "12px system-ui, sans-serif";
  ctx.fillText("0s", 10, h - 10);
  ctx.fillText("60s", w - 34, h - 10);
  ctx.globalAlpha = 1;
}

/* =========================
   Row helpers
========================= */
function updateRowChartBtn(item) {
  const row = document.querySelector(`.row[data-id="${cssEscape(item.id)}"]`);
  if (!row) return;
  const btn = row.querySelector(".chartBtn");
  if (!btn) return;

  const ready = !!item.minuteComplete;
  btn.disabled = !ready;
  if (ready) {
    btn.innerHTML = CHART_ICON_SVG;
    btn.title = "Ver gráfico del minuto (ticks 0–60)";
  } else {
    btn.innerHTML = `<span class="lockBadge" aria-hidden="true">🔒</span>`;
    btn.title = "Esperando cierre del minuto…";
  }
}
function updateRowNextArrow(item) {
  const row = document.querySelector(`.row[data-id="${cssEscape(item.id)}"]`);
  if (!row) return;
  const el = row.querySelector(".nextArrow");
  if (!el) return;

  if (item.nextOutcome === "up") {
    el.textContent = "⬆️"; el.className = "nextArrow up"; el.title = "Próxima vela: alcista";
  } else if (item.nextOutcome === "down") {
    el.textContent = "⬇️"; el.className = "nextArrow down"; el.title = "Próxima vela: bajista";
  } else if (item.nextOutcome === "flat") {
    el.textContent = "➖"; el.className = "nextArrow flat"; el.title = "Próxima vela: plana";
  } else {
    el.textContent = "⏳"; el.className = "nextArrow pending"; el.title = "Próxima vela: esperando…";
  }
}

function setNextOutcome(item, outcome) {
  item.nextOutcome = outcome;

  // ✅ Badge: coincide con la señal
  item.hit = isMatch(item.direction, outcome);

  saveHistory(history);
  updateRowNextArrow(item);
  updateRowHitBadge(item);
}

/* =========================
   Build row
========================= */
function buildRow(item) {
  const row = document.createElement("div");
  row.className = "row";
  row.dataset.id = item.id;

  const derivUrl = makeDerivTraderUrl(item.symbol);
  const modeLabel = item.mode || "NORMAL";

  const badgeHidden = item.hit ? "" : "hidden";

  row.innerHTML = `
    <div class="row-main">
      <span class="row-text">${item.time} | ${item.symbol} | ${labelDir(item.direction)} | [${modeLabel}]</span>
      <span class="hitBadge ${badgeHidden}" title="La próxima vela coincidió con la señal ✅">🎯 ACERTÓ</span>
      <button class="chartBtn" type="button"></button>
      <span class="nextArrow pending" title="Próxima vela: esperando…">⏳</span>
    </div>
    <div class="row-actions">
      <button data-v="like" type="button" ${item.vote ? "disabled" : ""}>👍</button>
      <button data-v="dislike" type="button" ${item.vote ? "disabled" : ""}>👎</button>
      <input class="row-comment" placeholder="comentario" value="${escapeHtml(item.comment || "")}">
    </div>
  `;

  row.querySelector(".row-text").onclick = () => { window.location.href = derivUrl; };

  const chartBtn = row.querySelector(".chartBtn");
  chartBtn.onclick = (e) => { e.stopPropagation(); if (item.minuteComplete) openChartModal(item); };
  updateRowChartBtn(item);

  row.querySelectorAll('button[data-v]').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      if (item.vote) return;
      item.vote = btn.dataset.v;
      item.comment = row.querySelector(".row-comment").value || "";
      saveHistory(history);
      rebuildFeedbackFromHistory();
      row.querySelectorAll('button[data-v]').forEach(b => (b.disabled = true));
    };
  });

  const input = row.querySelector(".row-comment");
  input.addEventListener("blur", () => {
    item.comment = input.value || "";
    saveHistory(history);
    rebuildFeedbackFromHistory();
  });

  updateRowNextArrow(item);
  updateRowHitBadge(item);
  return row;
}

/* =========================
   Render
========================= */
function renderHistory() {
  if (!signalsEl) return;
  signalsEl.innerHTML = "";

  // ✅ Backfill: si ya hay nextOutcome guardado, calculamos hit
  let touched = false;
  for (const it of history) {
    if (!it.mode) { it.mode = "NORMAL"; touched = true; }
    if (it.nextOutcome && typeof it.hit !== "boolean") {
      it.hit = isMatch(it.direction, it.nextOutcome);
      touched = true;
    }
  }
  if (touched) saveHistory(history);

  signalCount = history.length;
  updateCounter();
  rebuildFeedbackFromHistory();

  for (const it of [...history].reverse()) signalsEl.appendChild(buildRow(it));
}

/* =========================
   Tick health + countdown
========================= */
function updateTickHealthUI() {
  if (!tickHealthEl) return;
  if (!lastTickEpochMs) { tickHealthEl.textContent = "Último tick: —"; return; }
  const ageSec = Math.max(0, Math.floor((Date.now() - lastTickEpochMs) / 1000));
  tickHealthEl.textContent = `Último tick: hace ${ageSec}s`;
}
function updateCountdownUI() {
  if (!countdownEl) return;
  if (!currentMinuteStartMs) { countdownEl.textContent = "⏱️ 60"; return; }
  const msInMinute = (Date.now() - currentMinuteStartMs) % 60000;
  const remaining = 60 - Math.max(0, Math.min(59, Math.floor(msInMinute / 1000)));
  countdownEl.textContent = `⏱️ ${remaining}`;
}
setInterval(() => { updateTickHealthUI(); updateCountdownUI(); }, 1000);

/* =========================
   ✅ FIX: Evaluación por reloj (NO depende del tick)
========================= */
setInterval(() => {
  const nowMinuteStart = Math.floor(Date.now() / 60000) * 60000;
  if (!currentMinuteStartMs) currentMinuteStartMs = nowMinuteStart;
  if (nowMinuteStart > currentMinuteStartMs) currentMinuteStartMs = nowMinuteStart;

  const minute = Math.floor(currentMinuteStartMs / 60000);
  const sec = Math.floor((Date.now() - currentMinuteStartMs) / 1000);

  if (sec >= EVAL_SEC && lastEvaluatedMinute !== minute) {
    lastEvaluatedMinute = minute;
    const ok = evaluateMinute(minute);
    if (!ok) scheduleRetry(minute);
  }
}, 250);

/* =========================
   ✅ ticks_history requests
========================= */
let reqSeq = 1;
const pending = new Map(); // req_id -> {resolve, reject, t}

function wsRequest(payload) {
  return new Promise((resolve, reject) => {
    if (!ws || ws.readyState !== 1) return reject(new Error("WS not open"));
    const req_id = reqSeq++;
    const t = setTimeout(() => {
      pending.delete(req_id);
      reject(new Error("timeout"));
    }, HISTORY_TIMEOUT_MS);
    pending.set(req_id, { resolve, reject, t });
    ws.send(JSON.stringify({ ...payload, req_id }));
  });
}

function minuteToEpochSec(minute) { return minute * 60; }

function normalizeTicksForMinute(minute, times, prices) {
  const startMs = minute * 60000;
  const out = [];
  for (let i = 0; i < Math.min(times.length, prices.length); i++) {
    const ms = (Number(times[i]) * 1000) - startMs;
    if (ms < 0 || ms > 60000) continue;
    out.push({ ms, quote: Number(prices[i]) });
  }
  out.sort((a, b) => a.ms - b.ms);

  if (out.length) {
    if (out[0].ms > 0) out.unshift({ ms: 0, quote: out[0].quote });
    const last = out[out.length - 1];
    if (last.ms < 60000) out.push({ ms: 60000, quote: last.quote });
  }
  return out;
}

async function fetchFullMinuteTicks(symbol, minute) {
  const start = minuteToEpochSec(minute);
  const end = minuteToEpochSec(minute + 1);

  const res = await wsRequest({
    ticks_history: symbol,
    start,
    end,
    style: "ticks",
    count: HISTORY_COUNT_MAX,
    adjust_start_time: 1
  });

  const h = res?.history;
  if (!h || !Array.isArray(h.times) || !Array.isArray(h.prices)) return null;
  return normalizeTicksForMinute(minute, h.times, h.prices);
}

async function hydrateSignalsFromDerivHistory(minute) {
  const items = history.filter(it => it.minute === minute);
  if (!items.length) return false;

  let any = false;
  const bySym = new Map();
  for (const it of items) {
    if (!bySym.has(it.symbol)) bySym.set(it.symbol, []);
    bySym.get(it.symbol).push(it);
  }

  for (const [symbol, its] of bySym.entries()) {
    try {
      const full = await fetchFullMinuteTicks(symbol, minute);
      if (!full || full.length < 2) continue;

      (minuteData[minute] ||= {});
      minuteData[minute][symbol] = full.slice();

      for (const it of its) {
        it.ticks = full.slice();
        any = true;
      }
    } catch {}
  }

  return any;
}

/* =========================
   Finalize minute: next candle + minuto completo + unlock
========================= */
function finalizeMinute(minute) {
  const oc = candleOC[minute];
  if (!oc) return;

  // outcome para señales del minuto anterior
  for (const symbol of Object.keys(oc)) {
    const { open, close } = oc[symbol];
    if (open == null || close == null) continue;

    let outcome = "flat";
    if (close > open) outcome = "up";
    else if (close < open) outcome = "down";

    const prevMinute = minute - 1;
    for (const it of history) {
      if (it.minute === prevMinute && it.symbol === symbol && !it.nextOutcome) {
        setNextOutcome(it, outcome);
      }
    }
  }

  (async () => {
    const ticksChanged = await hydrateSignalsFromDerivHistory(minute);

    let changed = ticksChanged;
    for (const it of history) {
      if (it.minute === minute && !it.minuteComplete) {
        it.minuteComplete = true;
        changed = true;
        updateRowChartBtn(it);
      }
    }
    if (changed) saveHistory(history);

    if (modalCurrentItem && modalCurrentItem.minute === minute && modalCurrentItem.minuteComplete) {
      drawDerivLikeChart(minuteCanvas, modalCurrentItem.ticks || []);
    }
  })();

  delete candleOC[minute - 3];
  delete minuteData[minute - 3];
}

/* =========================
   Tick flow
========================= */
function onTick(tick) {
  const epochMs = Math.round(Number(tick.epoch) * 1000);
  const minuteStartMs = Math.floor(epochMs / 60000) * 60000;

  const minute = Math.floor(epochMs / 60000);
  const msInMinute = epochMs - minuteStartMs;
  const sec = Math.floor(msInMinute / 1000);
  const symbol = tick.symbol;

  lastTickEpochMs = epochMs;
  currentMinuteStartMs = minuteStartMs;

  const prevLast = lastQuoteBySymbol[symbol];
  lastQuoteBySymbol[symbol] = tick.quote;

  if (lastMinuteSeenBySymbol[symbol] !== minute) {
    lastMinuteSeenBySymbol[symbol] = minute;
    (minuteData[minute] ||= {});
    (minuteData[minute][symbol] ||= []);
    if (minuteData[minute][symbol].length === 0 && prevLast != null) {
      minuteData[minute][symbol].push({ ms: 0, quote: prevLast });
    }
  }

  if (lastSeenMinute === null) lastSeenMinute = minute;
  if (minute > lastSeenMinute) {
    for (let m = lastSeenMinute; m < minute; m++) finalizeMinute(m);
    lastSeenMinute = minute;
  }

  (minuteData[minute] ||= {});
  (minuteData[minute][symbol] ||= []).push({ ms: msInMinute, quote: tick.quote });

  (candleOC[minute] ||= {});
  if (!candleOC[minute][symbol]) candleOC[minute][symbol] = { open: tick.quote, close: tick.quote };
  else candleOC[minute][symbol].close = tick.quote;

  if (sec >= EVAL_SEC && lastEvaluatedMinute !== minute) {
    lastEvaluatedMinute = minute;
    const ok = evaluateMinute(minute);
    if (!ok) scheduleRetry(minute);
  }
}
function scheduleRetry(minute) {
  if (evalRetryTimer) clearTimeout(evalRetryTimer);
  evalRetryTimer = setTimeout(() => {
    if (Math.floor(Date.now() / 60000) === minute) evaluateMinute(minute);
  }, RETRY_DELAY_MS);
}

/* =========================
   Evaluation
========================= */
function evaluateMinute(minute) {
  const data = minuteData[minute];
  if (!data) return false;

  const candidates = [];
  let readySymbols = 0;

  for (const sym of SYMBOLS) {
    const ticks = data[sym] || [];
    if (ticks.length >= MIN_TICKS) readySymbols++;
    if (ticks.length < MIN_TICKS) continue;

    const prices = ticks.map(t => t.quote);
    const move = prices[prices.length - 1] - prices[0];
    const rawMove = Math.abs(move);

    let vol = 0;
    for (let i = 1; i < prices.length; i++) vol += Math.abs(prices[i] - prices[i - 1]);
    vol = vol / Math.max(1, prices.length - 1);

    const score = rawMove / (vol || 1e-9);
    candidates.push({ symbol: sym, move, score, ticks });
  }

  if (readySymbols < MIN_SYMBOLS_READY || candidates.length === 0) return false;

  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];

  const threshold = strongMode ? 0.02 : 0.015;
  if (!best || best.score < threshold) return true;

  addSignal(minute, best.symbol, best.move > 0 ? "CALL" : "PUT", best.ticks);
  return true;
}

/* =========================
   Add signal
========================= */
function fmtTimeUTC(minute) {
  return new Date(minute * 60000).toISOString().substr(11, 8) + " UTC";
}
function addSignal(minute, symbol, direction, ticks) {
  const modeLabel = strongMode ? "FUERTE" : "NORMAL";
  const item = {
    id: `${minute}-${symbol}-${direction}-${modeLabel}`,
    minute,
    time: fmtTimeUTC(minute),
    symbol,
    direction,
    mode: modeLabel,
    vote: "",
    comment: "",
    ticks: Array.isArray(ticks) ? ticks.slice() : [],
    nextOutcome: "",
    minuteComplete: false,
    hit: false
  };

  if (history.some(x => x.id === item.id)) return;

  history.push(item);
  if (history.length > MAX_HISTORY) history = history.slice(-MAX_HISTORY);
  saveHistory(history);

  signalCount = history.length;
  updateCounter();

  if (signalsEl) signalsEl.prepend(buildRow(item));
  updateRowChartBtn(item);

  if (soundEnabled && sound) { sound.currentTime = 0; sound.play().catch(() => {}); }
  if (vibrateEnabled && "vibrate" in navigator) navigator.vibrate([120]);

  showNotification(symbol, direction, modeLabel);
}

/* =========================
   Wake lock
========================= */
let wakeLock = null;
if (wakeBtn) wakeBtn.onclick = async () => {
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
   WebSocket
========================= */
function connect() {
  try {
    ws = new WebSocket(WS_URL);
  } catch {
    if (statusEl) statusEl.textContent = "Error WS – no se pudo iniciar";
    return;
  }

  ws.onopen = () => {
    if (statusEl) statusEl.textContent = "Conectado – Analizando";
    SYMBOLS.forEach(sym => ws.send(JSON.stringify({ ticks: sym, subscribe: 1 })));
  };

  ws.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);

      if (data && data.req_id && pending.has(data.req_id) && data.msg_type === "history") {
        const p = pending.get(data.req_id);
        clearTimeout(p.t);
        pending.delete(data.req_id);
        p.resolve(data);
        return;
      }

      if (data.tick) onTick(data.tick);
    } catch {}
  };

  ws.onerror = () => { if (statusEl) statusEl.textContent = "Error WS – reconectando…"; };

  ws.onclose = () => {
    for (const [id, p] of pending.entries()) {
      clearTimeout(p.t);
      pending.delete(id);
      p.reject(new Error("closed"));
    }
    if (statusEl) statusEl.textContent = "Desconectado – reconectando…";
    setTimeout(connect, 1500);
  };
}

/* =========================
   Start
========================= */
renderHistory();
for (const it of history) {
  updateRowChartBtn(it);
  updateRowNextArrow(it);
  updateRowHitBadge(it);
}
updateTickHealthUI();
updateCountdownUI();
connect();