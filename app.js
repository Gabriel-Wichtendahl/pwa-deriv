/* app.js — Deriv PWA Base limpia V2 SNR
   Objetivo: base estable + modo SNR por cuerpos / cambio de rol / segundo toque.
*/
"use strict";

const VERSION = "BASE_LIMPIA_V2_SNR_SEGUNDO_TOQUE_20260510";
const WS_URL = "wss://ws.derivws.com/websockets/v3?app_id=1089";
const SYMBOLS = ["R_10", "R_25", "R_50", "R_75", "R_100"];
const MAX_TICKS_PER_SYMBOL = 180;
const MAX_HISTORY_ITEMS = 160;
const MAX_CANDLES_PER_SYMBOL = 180;
const MAX_SIGNALS = 80;
const SNR_RULES = {
  minBodyTouches: 2,
  clusterTolBodyMult: 1.10,
  breakTolMult: 0.55,
  zonePadTolMult: 0.20,
  touchTolMult: 1.05,
  minApproachRatio: 0.22,
  minRejectRatio: 0.12,
  minFirstTouchMs: 6000,
  minSecondTouchGapMs: 5000,
  maxSecondBreakTolMult: 0.90,
  minTicks: 7,
  minScore: 68
};
const RECONNECT_DELAY_MS = 2500;
const UI_INTERVAL_STANDARD_MS = 500;
const UI_INTERVAL_LOW_MS = 1200;

const KEYS = {
  theme: "derivBase.theme.v1",
  sound: "derivBase.sound.v1",
  vibrate: "derivBase.vibrate.v1",
  lowPower: "derivBase.lowPower.v1",
  paused: "derivBase.paused.v1",
  selectedSymbol: "derivBase.selectedSymbol.v1",
  history: "derivBase.tickHistory.v1",
  candles: "derivBase.snrCandles.v2",
  signals: "derivBase.snrSignals.v2"
};

const state = {
  ws: null,
  wsOpen: false,
  reconnectTimer: null,
  uiTimer: null,
  selectedSymbol: readString(KEYS.selectedSymbol, SYMBOLS[0]),
  paused: readBool(KEYS.paused, false),
  sound: readBool(KEYS.sound, false),
  vibrate: readBool(KEYS.vibrate, true),
  lowPower: readBool(KEYS.lowPower, false),
  theme: readString(KEYS.theme, "dark"),
  lastTickAt: 0,
  ticks: new Map(),
  lastQuotes: new Map(),
  history: loadHistory(),
  candles: loadCandles(),
  signals: loadSignals(),
  signalKeys: new Set(),
  wakeLock: null
};

const $ = (id) => document.getElementById(id);
const qsAll = (sel) => Array.from(document.querySelectorAll(sel));

const els = {
  body: document.body,
  status: $("status"),
  wsState: $("wsState"),
  tickState: $("tickState"),
  countdownText: $("countdownText"),
  symbolStrip: $("symbolStrip"),
  symbolCards: $("symbolCards"),
  selectedSymbolLabel: $("selectedSymbolLabel"),
  selectedQuote: $("selectedQuote"),
  liveCanvas: $("liveCanvas"),
  historyList: $("historyList"),
  signalsList: $("signalsList"),
  signalCount: $("signalCount"),
  snrState: $("snrState"),
  systemList: $("systemList"),
  settingsBtn: $("settingsBtn"),
  settingsModal: $("settingsModal"),
  settingsBackdrop: $("settingsBackdrop"),
  settingsCloseBtn: $("settingsCloseBtn"),
  pauseBtn: $("pauseBtn"),
  pauseBtn2: $("pauseBtn2"),
  reconnectBtn: $("reconnectBtn"),
  themeBtn: $("themeBtn"),
  soundBtn: $("soundBtn"),
  vibrateBtn: $("vibrateBtn"),
  wakeBtn: $("wakeBtn"),
  lowPowerBtn: $("lowPowerBtn"),
  exportBtn: $("exportBtn"),
  resetStorageBtn: $("resetStorageBtn"),
  resetSwBtn: $("resetSwBtn"),
  clearHistoryBtn: $("clearHistoryBtn"),
  symbolsText: $("symbolsText"),
  toast: $("toast"),
  soundEl: $("alertSound")
};

function readString(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value == null ? fallback : value;
  } catch {
    return fallback;
  }
}

function readBool(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value == null ? fallback : value === "1";
  } catch {
    return fallback;
  }
}

function writeString(key, value) {
  try { localStorage.setItem(key, String(value)); } catch {}
}

function writeBool(key, value) {
  try { localStorage.setItem(key, value ? "1" : "0"); } catch {}
}

function loadHistory() {
  try {
    const raw = localStorage.getItem(KEYS.history);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.slice(-MAX_HISTORY_ITEMS) : [];
  } catch {
    return [];
  }
}

function saveHistory() {
  try {
    state.history = state.history.slice(-MAX_HISTORY_ITEMS);
    localStorage.setItem(KEYS.history, JSON.stringify(state.history));
  } catch {}
}

function loadCandles() {
  try {
    const raw = localStorage.getItem(KEYS.candles);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveCandles() {
  try { localStorage.setItem(KEYS.candles, JSON.stringify(state.candles)); } catch {}
}

function loadSignals() {
  try {
    const raw = localStorage.getItem(KEYS.signals);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.slice(-MAX_SIGNALS) : [];
  } catch {
    return [];
  }
}

function saveSignals() {
  try {
    state.signals = state.signals.slice(-MAX_SIGNALS);
    localStorage.setItem(KEYS.signals, JSON.stringify(state.signals));
  } catch {}
}

function toast(message, ms = 2200) {
  if (!els.toast) return;
  els.toast.textContent = message;
  els.toast.classList.remove("hidden");
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => els.toast.classList.add("hidden"), ms);
}

function setStatus(text) {
  if (els.status) els.status.textContent = text;
}

function labelSymbol(symbol) {
  return String(symbol || "").replace("R_", "Volatility ");
}

function formatQuote(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1000) return n.toFixed(3);
  if (abs >= 100) return n.toFixed(4);
  return n.toFixed(5);
}

function currentMinuteStartMs() {
  const now = Date.now();
  return now - (now % 60000);
}

function getSecondLeft() {
  return 60 - Math.floor((Date.now() % 60000) / 1000);
}

function currentMinuteNumber() {
  return Math.floor(Date.now() / 60000);
}

function minuteNumberFromEpoch(epoch) {
  const n = Number(epoch);
  if (Number.isFinite(n) && n > 0) return Math.floor(n / 60);
  return currentMinuteNumber();
}

function secondFromTickEpoch(epoch) {
  const n = Number(epoch);
  if (Number.isFinite(n) && n > 0) return Math.max(0, Math.min(60, n % 60));
  return Math.floor((Date.now() % 60000) / 1000);
}

function minuteMsFromEpoch(epochMs) {
  return Math.max(0, Math.min(60000, Number(epochMs || 0) - currentMinuteStartMs()));
}

function ensureSymbol(symbol) {
  if (!state.ticks.has(symbol)) state.ticks.set(symbol, []);
  return state.ticks.get(symbol);
}

function pushTick(symbol, quote, epoch) {
  const ms = minuteMsFromEpoch(Number(epoch) * 1000 || Date.now());
  const list = ensureSymbol(symbol);
  const prev = state.lastQuotes.get(symbol);
  const direction = Number.isFinite(prev) ? Math.sign(Number(quote) - prev) : 0;
  list.push({ ms, quote: Number(quote), epoch: Number(epoch || 0), at: Date.now(), direction });

  const minuteStart = currentMinuteStartMs();
  const filtered = list
    .filter((tick) => tick.at >= minuteStart - 2500)
    .slice(-MAX_TICKS_PER_SYMBOL);
  state.ticks.set(symbol, filtered);
  state.lastQuotes.set(symbol, Number(quote));
  state.lastTickAt = Date.now();

  upsertCandleFromTick(symbol, quote, epoch);
  evaluateSNROnTick(symbol);

  state.history.push({ symbol, quote: Number(quote), epoch: Number(epoch || 0), at: Date.now(), direction });
  if (state.history.length > MAX_HISTORY_ITEMS) state.history.splice(0, state.history.length - MAX_HISTORY_ITEMS);
  if (state.history.length % 10 === 0) saveHistory();
}

function upsertCandleFromTick(symbol, quote, epoch) {
  const minute = minuteNumberFromEpoch(epoch);
  const q = Number(quote);
  if (!Number.isFinite(q)) return;
  state.candles[symbol] ||= [];
  const arr = state.candles[symbol];
  let candle = arr.find((x) => Number(x.minute) === minute);
  if (!candle) {
    candle = { minute, symbol, open: q, high: q, low: q, close: q, firstEpoch: Number(epoch || 0), lastEpoch: Number(epoch || 0) };
    arr.push(candle);
  } else {
    candle.high = Math.max(Number(candle.high), q);
    candle.low = Math.min(Number(candle.low), q);
    candle.close = q;
    candle.lastEpoch = Number(epoch || 0);
  }
  arr.sort((a, b) => Number(a.minute) - Number(b.minute));
  state.candles[symbol] = arr.slice(-MAX_CANDLES_PER_SYMBOL);
  if (arr.length % 5 === 0) saveCandles();
}

function getCompletedCandles(symbol) {
  const current = currentMinuteNumber();
  return (state.candles[symbol] || [])
    .filter((c) => c && Number(c.minute) < current)
    .filter((c) => [c.open, c.high, c.low, c.close].every((v) => Number.isFinite(Number(v))))
    .slice(-120);
}

function estimateSNRTolerance(symbol, currentRange = 0) {
  const candles = getCompletedCandles(symbol).slice(-50);
  const bodies = candles
    .map((c) => Math.abs(Number(c.close) - Number(c.open)))
    .filter((x) => Number.isFinite(x) && x > 0);
  const ranges = candles
    .map((c) => Math.abs(Number(c.high) - Number(c.low)))
    .filter((x) => Number.isFinite(x) && x > 0);
  const avgBody = bodies.length ? bodies.reduce((a, b) => a + b, 0) / bodies.length : Math.abs(Number(currentRange || 0)) * 0.18;
  const avgRange = ranges.length ? ranges.reduce((a, b) => a + b, 0) / ranges.length : Math.abs(Number(currentRange || 0));
  return Math.max(avgBody * 0.65, avgRange * 0.035, Math.abs(Number(currentRange || 0)) * 0.04, 1e-9);
}

function clusterSNRBodyLevels(rawLevels, tolerance) {
  const clusters = [];
  for (const type of ["resistance", "support"]) {
    const sorted = rawLevels
      .filter((x) => x.type === type && Number.isFinite(Number(x.price)))
      .map((x) => ({ ...x, price: Number(x.price), minute: Number(x.minute || 0) }))
      .sort((a, b) => a.price - b.price);
    for (const lvl of sorted) {
      const sameType = clusters.filter((x) => x.originalType === type);
      const last = sameType[sameType.length - 1];
      if (!last || Math.abs(lvl.price - last.price) > tolerance) {
        clusters.push({
          price: lvl.price,
          originalType: type,
          touches: 1,
          minutes: [lvl.minute],
          zoneLow: lvl.price,
          zoneHigh: lvl.price,
          firstMinute: lvl.minute,
          lastTouchMinute: lvl.minute
        });
      } else {
        const total = last.touches + 1;
        last.price = (last.price * last.touches + lvl.price) / total;
        last.touches = total;
        last.zoneLow = Math.min(last.zoneLow, lvl.price);
        last.zoneHigh = Math.max(last.zoneHigh, lvl.price);
        last.minutes.push(lvl.minute);
        last.firstMinute = Math.min(last.firstMinute, lvl.minute);
        last.lastTouchMinute = Math.max(last.lastTouchMinute, lvl.minute);
      }
    }
  }
  return clusters.sort((a, b) => a.price - b.price);
}

function findSNRRoleBreak(candles, cluster, tol) {
  const originalType = cluster.originalType === "support" ? "support" : "resistance";
  const startMinute = Number(cluster.lastTouchMinute || cluster.firstMinute || 0);
  const zoneLow = Number(cluster.zoneLow) - tol * SNR_RULES.zonePadTolMult;
  const zoneHigh = Number(cluster.zoneHigh) + tol * SNR_RULES.zonePadTolMult;
  const breakTol = tol * SNR_RULES.breakTolMult;
  let breakCandle = null;
  for (const c of candles) {
    const minute = Number(c.minute || 0);
    if (!Number.isFinite(minute) || minute <= startMinute) continue;
    const close = Number(c.close);
    if (!Number.isFinite(close)) continue;
    if (originalType === "support" && close < zoneLow - breakTol) breakCandle = c;
    if (originalType === "resistance" && close > zoneHigh + breakTol) breakCandle = c;
  }
  if (!breakCandle) return null;
  const currentRole = originalType === "support" ? "resistance" : "support";
  return {
    originalType,
    currentRole,
    direction: currentRole === "support" ? "CALL" : "PUT",
    brokenAt: Number(breakCandle.minute),
    breakClose: Number(breakCandle.close)
  };
}

function getSNRBodyCandidates(symbol, currentRange = 0) {
  const candles = getCompletedCandles(symbol);
  if (candles.length < 8) return [];
  const tol = estimateSNRTolerance(symbol, currentRange);
  const raw = [];
  for (const c of candles) {
    const open = Number(c.open);
    const close = Number(c.close);
    if (!Number.isFinite(open) || !Number.isFinite(close)) continue;
    raw.push({ price: Math.max(open, close), type: "resistance", minute: Number(c.minute) });
    raw.push({ price: Math.min(open, close), type: "support", minute: Number(c.minute) });
  }
  const clusters = clusterSNRBodyLevels(raw, tol * SNR_RULES.clusterTolBodyMult);
  return clusters
    .filter((cluster) => Number(cluster.touches) >= SNR_RULES.minBodyTouches)
    .map((cluster) => {
      const br = findSNRRoleBreak(candles, cluster, tol);
      if (!br) return null;
      return {
        ...cluster,
        ...br,
        level: Number(cluster.price),
        tolerance: tol,
        zoneLow: Number(cluster.zoneLow) - tol * SNR_RULES.zonePadTolMult,
        zoneHigh: Number(cluster.zoneHigh) + tol * SNR_RULES.zonePadTolMult
      };
    })
    .filter(Boolean)
    .sort((a, b) => Number(b.brokenAt || 0) - Number(a.brokenAt || 0));
}

function clusterTouchIndexes(indexes) {
  const src = indexes.slice().sort((a, b) => a - b);
  if (!src.length) return [];
  const clusters = [];
  let cur = [src[0]];
  for (let i = 1; i < src.length; i++) {
    if (src[i] - src[i - 1] <= 1) cur.push(src[i]);
    else { clusters.push(cur); cur = [src[i]]; }
  }
  if (cur.length) clusters.push(cur);
  return clusters;
}

function analyzeSNRSecondTouch(symbol, ticks) {
  const arr = (ticks || [])
    .map((t, idx) => ({ idx, ms: Number(t.ms || 0), q: Number(t.quote) }))
    .filter((t) => Number.isFinite(t.ms) && Number.isFinite(t.q))
    .sort((a, b) => a.ms - b.ms);
  if (arr.length < SNR_RULES.minTicks) return null;
  const quotes = arr.map((x) => x.q);
  const high = Math.max(...quotes);
  const low = Math.min(...quotes);
  const range = Math.max(high - low, 1e-9);
  const candidates = getSNRBodyCandidates(symbol, range);
  if (!candidates.length) return null;

  let best = null;
  for (const snr of candidates.slice(0, 18)) {
    const isSupportNow = snr.currentRole === "support";
    const touchTol = Number(snr.tolerance) * SNR_RULES.touchTolMult;
    const touchIdx = [];
    for (let i = 0; i < arr.length; i++) {
      const q = arr[i].q;
      const touches = isSupportNow ? q <= snr.zoneHigh + touchTol : q >= snr.zoneLow - touchTol;
      if (touches) touchIdx.push(i);
    }
    const clusters = clusterTouchIndexes(touchIdx);
    if (clusters.length < 2) continue;

    for (let a = 0; a < clusters.length - 1; a++) {
      const c1 = clusters[a];
      const c2 = clusters[a + 1];
      const firstStart = c1[0];
      const firstEnd = c1[c1.length - 1];
      const secondStart = c2[0];
      if (arr[firstStart].ms < SNR_RULES.minFirstTouchMs) continue;
      if (arr[secondStart].ms - arr[firstEnd].ms < SNR_RULES.minSecondTouchGapMs) continue;

      const firstExtreme = isSupportNow
        ? Math.min(...c1.map((i) => arr[i].q))
        : Math.max(...c1.map((i) => arr[i].q));
      const approach = isSupportNow ? arr[0].q - firstExtreme : firstExtreme - arr[0].q;
      if (approach < Math.max(range * SNR_RULES.minApproachRatio, Number(snr.tolerance) * 1.1)) continue;

      const between = arr.slice(firstEnd + 1, secondStart);
      if (between.length < 2) continue;
      const rejectMove = isSupportNow
        ? Math.max(...between.map((p) => p.q)) - firstExtreme
        : firstExtreme - Math.min(...between.map((p) => p.q));
      if (rejectMove < Math.max(range * SNR_RULES.minRejectRatio, Number(snr.tolerance) * 0.65)) continue;

      const secondExtreme = isSupportNow
        ? Math.min(...c2.map((i) => arr[i].q))
        : Math.max(...c2.map((i) => arr[i].q));
      const secondBreak = isSupportNow ? firstExtreme - secondExtreme : secondExtreme - firstExtreme;
      if (secondBreak > Number(snr.tolerance) * SNR_RULES.maxSecondBreakTolMult) continue;

      const retestWeakness = Math.max(0, 1 - Math.max(0, secondBreak) / Math.max(Number(snr.tolerance), 1e-9));
      const score =
        34 +
        Math.min(22, approach / Math.max(range, 1e-9) * 35) +
        Math.min(24, rejectMove / Math.max(range, 1e-9) * 45) +
        Math.min(12, Number(snr.touches || 0) * 3) +
        retestWeakness * 12;
      if (score < SNR_RULES.minScore) continue;

      const match = {
        symbol,
        direction: snr.direction,
        score: Math.round(score),
        createdMs: arr[secondStart].ms,
        snr: {
          type: "SNR_SEGUNDO_TOQUE",
          role: snr.currentRole,
          originalRole: snr.originalType,
          level: snr.level,
          zoneLow: snr.zoneLow,
          zoneHigh: snr.zoneHigh,
          touches: snr.touches,
          brokenAt: snr.brokenAt,
          firstTouchMs: arr[firstStart].ms,
          secondTouchMs: arr[secondStart].ms,
          approach,
          rejection: rejectMove,
          secondBreak,
          tolerance: snr.tolerance,
          rulesVersion: VERSION
        }
      };
      if (!best || match.score > best.score) best = match;
    }
  }
  return best;
}

function addSNRSignal(match) {
  if (!match) return;
  const minute = currentMinuteNumber();
  const levelKey = Number(match.snr?.level || 0).toFixed(6);
  const key = `${minute}:${match.symbol}:${match.direction}:${levelKey}`;
  if (state.signalKeys.has(key) || state.signals.some((s) => s.key === key)) return;
  state.signalKeys.add(key);
  const item = {
    key,
    id: `SNR2::${minute}::${match.symbol}::${match.direction}::${Date.now()}`,
    minute,
    savedAt: Date.now(),
    time: new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    symbol: match.symbol,
    direction: match.direction,
    score: match.score,
    snr: match.snr
  };
  state.signals.push(item);
  state.signals = state.signals.slice(-MAX_SIGNALS);
  saveSignals();
  if (state.sound) { try { els.soundEl?.play?.().catch(() => {}); } catch {} }
  if (state.vibrate && "vibrate" in navigator) navigator.vibrate([70, 35, 70]);
  toast(`${match.direction} ${labelSymbol(match.symbol)} · SNR segundo toque`);
}

function evaluateSNROnTick(symbol) {
  const ticks = state.ticks.get(symbol) || [];
  const match = analyzeSNRSecondTouch(symbol, ticks);
  if (match) addSNRSignal(match);
}

function getLatestSignalForSymbol(symbol) {
  return state.signals.slice().reverse().find((s) => s.symbol === symbol) || null;
}

function connectWS() {
  clearTimeout(state.reconnectTimer);
  if (state.ws) {
    try { state.ws.close(); } catch {}
  }

  if (state.paused) {
    setStatus("Live pausado");
    updateUi();
    return;
  }

  setStatus("Conectando a Deriv…");
  state.wsOpen = false;

  const ws = new WebSocket(WS_URL);
  state.ws = ws;

  ws.addEventListener("open", () => {
    state.wsOpen = true;
    setStatus("Conectado · recibiendo ticks");
    for (const symbol of SYMBOLS) {
      ws.send(JSON.stringify({ ticks: symbol, subscribe: 1 }));
    }
    updateUi();
  });

  ws.addEventListener("message", (event) => {
    let data = null;
    try { data = JSON.parse(event.data); } catch { return; }
    if (data?.error) {
      setStatus(`WS error: ${data.error.message || data.error.code || "desconocido"}`);
      return;
    }
    if (data?.tick?.symbol && Number.isFinite(Number(data.tick.quote))) {
      pushTick(data.tick.symbol, data.tick.quote, data.tick.epoch);
    }
  });

  ws.addEventListener("close", () => {
    state.wsOpen = false;
    updateUi();
    if (!state.paused) {
      setStatus("WS cerrado · reconectando…");
      state.reconnectTimer = setTimeout(connectWS, RECONNECT_DELAY_MS);
    }
  });

  ws.addEventListener("error", () => {
    state.wsOpen = false;
    setStatus("WS error · reconectando…");
    try { ws.close(); } catch {}
  });
}

function disconnectWS() {
  clearTimeout(state.reconnectTimer);
  if (state.ws) {
    try { state.ws.close(); } catch {}
  }
  state.ws = null;
  state.wsOpen = false;
}

function setPaused(paused) {
  state.paused = !!paused;
  writeBool(KEYS.paused, state.paused);
  if (state.paused) {
    disconnectWS();
    setStatus("Live pausado");
  } else {
    connectWS();
  }
  updateButtons();
}

function selectSymbol(symbol) {
  if (!SYMBOLS.includes(symbol)) return;
  state.selectedSymbol = symbol;
  writeString(KEYS.selectedSymbol, symbol);
  updateUi();
}

function buildSymbolUi() {
  if (els.symbolStrip) {
    els.symbolStrip.innerHTML = SYMBOLS.map((symbol) => `
      <button class="symbolChip" type="button" data-symbol="${symbol}">${labelSymbol(symbol)}</button>
    `).join("");
    els.symbolStrip.querySelectorAll(".symbolChip").forEach((btn) => {
      btn.addEventListener("click", () => selectSymbol(btn.dataset.symbol));
    });
  }

  if (els.symbolCards) {
    els.symbolCards.innerHTML = SYMBOLS.map((symbol) => `
      <article class="symbolCard" data-symbol-card="${symbol}">
        <div class="sym">${labelSymbol(symbol)}</div>
        <div class="price">—</div>
        <div class="meta">Esperando tick…</div>
      </article>
    `).join("");
  }

  if (els.symbolsText) els.symbolsText.textContent = SYMBOLS.join(" · ");
}

function updateSymbolCards() {
  if (!els.symbolCards) return;
  for (const symbol of SYMBOLS) {
    const card = els.symbolCards.querySelector(`[data-symbol-card="${symbol}"]`);
    if (!card) continue;
    const quote = state.lastQuotes.get(symbol);
    const ticks = state.ticks.get(symbol) || [];
    const last = ticks[ticks.length - 1];
    const priceEl = card.querySelector(".price");
    const metaEl = card.querySelector(".meta");
    const cls = last?.direction > 0 ? "up" : last?.direction < 0 ? "down" : "flat";
    if (priceEl) {
      priceEl.className = `price ${cls}`;
      priceEl.textContent = formatQuote(quote);
    }
    if (metaEl) {
      const age = last?.at ? Math.max(0, Math.round((Date.now() - last.at) / 1000)) : null;
      metaEl.textContent = age == null ? "Esperando tick…" : `hace ${age}s · ${ticks.length} ticks`;
    }
  }
}

function updateSymbolStrip() {
  if (!els.symbolStrip) return;
  els.symbolStrip.querySelectorAll(".symbolChip").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.symbol === state.selectedSymbol);
  });
}

function drawChart() {
  const canvas = els.liveCanvas;
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const cssW = canvas.clientWidth || 1;
  const cssH = canvas.clientHeight || 1;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(cssW * dpr));
  canvas.height = Math.max(1, Math.floor(cssH * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const w = cssW;
  const h = cssH;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "rgba(2,6,23,.34)";
  ctx.fillRect(0, 0, w, h);

  const ticks = (state.ticks.get(state.selectedSymbol) || []).slice();
  const pad = { l: 38, r: 16, t: 18, b: 28 };
  const x0 = pad.l;
  const y0 = pad.t;
  const x1 = w - pad.r;
  const y1 = h - pad.b;

  ctx.strokeStyle = "rgba(148,163,184,.18)";
  ctx.lineWidth = 1;
  for (let i = 1; i <= 4; i++) {
    const y = y0 + (y1 - y0) * i / 5;
    ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
  }
  for (let s = 0; s <= 60; s += 15) {
    const x = x0 + (x1 - x0) * s / 60;
    ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke();
    ctx.fillStyle = "rgba(203,213,225,.70)";
    ctx.font = "12px system-ui";
    ctx.fillText(`${s}s`, x - 8, h - 8);
  }

  if (ticks.length < 2) {
    ctx.fillStyle = "rgba(229,238,251,.72)";
    ctx.font = "700 15px system-ui";
    ctx.fillText("Esperando datos…", x0, y0 + 28);
    return;
  }

  const quotes = ticks.map((t) => t.quote);
  let min = Math.min(...quotes);
  let max = Math.max(...quotes);
  let range = max - min;
  if (!Number.isFinite(range) || range <= 0) range = 1;
  min -= range * 0.08;
  max += range * 0.08;

  const xOf = (ms) => x0 + (x1 - x0) * Math.max(0, Math.min(60000, ms)) / 60000;
  const yOf = (quote) => y1 - (quote - min) / (max - min) * (y1 - y0);

  const lastSignal = getLatestSignalForSymbol(state.selectedSymbol);
  if (lastSignal?.snr && Date.now() - Number(lastSignal.savedAt || 0) < 180000) {
    const zoneLow = Number(lastSignal.snr.zoneLow);
    const zoneHigh = Number(lastSignal.snr.zoneHigh);
    if (Number.isFinite(zoneLow) && Number.isFinite(zoneHigh)) {
      const yA = yOf(zoneHigh);
      const yB = yOf(zoneLow);
      const top = Math.min(yA, yB);
      const height = Math.max(4, Math.abs(yB - yA));
      const color = lastSignal.direction === "CALL" ? "34,197,94" : "239,68,68";
      ctx.fillStyle = `rgba(${color},.13)`;
      ctx.fillRect(x0, top, x1 - x0, height);
      ctx.setLineDash([7, 5]);
      ctx.strokeStyle = `rgba(${color},.86)`;
      ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.moveTo(x0, yOf(Number(lastSignal.snr.level))); ctx.lineTo(x1, yOf(Number(lastSignal.snr.level))); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = `rgba(${color},.95)`;
      ctx.font = "800 12px system-ui";
      const role = lastSignal.snr.role === "support" ? "SNR SOP" : "SNR RES";
      ctx.fillText(`${role} · ${lastSignal.direction}`, x0 + 8, Math.max(y0 + 16, top - 6));
    }
  }

  const grad = ctx.createLinearGradient(0, y0, 0, y1);
  grad.addColorStop(0, "rgba(34,211,238,.22)");
  grad.addColorStop(1, "rgba(34,211,238,0)");

  ctx.beginPath();
  ticks.forEach((tick, i) => {
    const x = xOf(tick.ms);
    const y = yOf(tick.quote);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.lineTo(xOf(ticks[ticks.length - 1].ms), y1);
  ctx.lineTo(xOf(ticks[0].ms), y1);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.beginPath();
  ticks.forEach((tick, i) => {
    const x = xOf(tick.ms);
    const y = yOf(tick.quote);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = "rgba(229,238,251,.96)";
  ctx.lineWidth = 2.6;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.stroke();

  const last = ticks[ticks.length - 1];
  ctx.fillStyle = last.direction > 0 ? "#22c55e" : last.direction < 0 ? "#ef4444" : "#94a3b8";
  ctx.beginPath();
  ctx.arc(xOf(last.ms), yOf(last.quote), 5, 0, Math.PI * 2);
  ctx.fill();
}

function renderHistory() {
  if (!els.historyList) return;
  const items = state.history.slice(-40).reverse();
  if (!items.length) {
    els.historyList.innerHTML = `<div class="historyItem"><span class="muted">Sin historial todavía.</span></div>`;
    return;
  }
  els.historyList.innerHTML = items.map((item) => {
    const time = new Date(item.at || Date.now()).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const cls = item.direction > 0 ? "up" : item.direction < 0 ? "down" : "flat";
    const arrow = item.direction > 0 ? "⬆️" : item.direction < 0 ? "⬇️" : "➖";
    return `<div class="historyItem"><span><code>${item.symbol}</code> ${time}</span><strong class="${cls}">${arrow} ${formatQuote(item.quote)}</strong></div>`;
  }).join("");
}

function renderSignals() {
  if (els.signalCount) els.signalCount.textContent = `${state.signals.length} señales`;
  if (els.snrState) {
    const candleCount = Object.values(state.candles).reduce((acc, arr) => acc + (Array.isArray(arr) ? arr.length : 0), 0);
    els.snrState.textContent = `SNR activo · ${candleCount} velas base · cuerpos/open-close · segundo toque`;
  }
  if (!els.signalsList) return;
  const items = state.signals.slice().reverse();
  if (!items.length) {
    els.signalsList.innerHTML = `<div class="signalItem"><span class="muted">Sin señales SNR todavía. Necesita acumular velas previas para detectar cambio de rol.</span></div>`;
    return;
  }
  els.signalsList.innerHTML = items.map((item) => {
    const cls = item.direction === "CALL" ? "call" : "put";
    const role = item.snr?.role === "support" ? "RES→SOP" : "SOP→RES";
    const zoneLow = Number(item.snr?.zoneLow);
    const zoneHigh = Number(item.snr?.zoneHigh);
    const zone = Number.isFinite(zoneLow) && Number.isFinite(zoneHigh) ? `${zoneLow.toFixed(6)} - ${zoneHigh.toFixed(6)}` : "—";
    return `
      <article class="signalItem ${cls}">
        <div>
          <strong>${item.direction} · ${labelSymbol(item.symbol)}</strong>
          <p class="muted small">${item.time} · SNR ${role} · zona ${zone}</p>
          <p class="muted small">1º toque ${Math.round(Number(item.snr?.firstTouchMs || 0) / 1000)}s · 2º toque ${Math.round(Number(item.snr?.secondTouchMs || 0) / 1000)}s · rechazo ${formatQuote(item.snr?.rejection)}</p>
        </div>
        <span class="signalBadge">${item.score}</span>
      </article>
    `;
  }).join("");
}

function renderSystem() {
  if (!els.systemList) return;
  const data = [
    ["Versión", VERSION],
    ["WebSocket", state.wsOpen ? "conectado" : "desconectado"],
    ["Pausado", state.paused ? "sí" : "no"],
    ["Bajo consumo", state.lowPower ? "sí" : "no"],
    ["Símbolos", SYMBOLS.join(", ")],
    ["Modo SNR", "activo: cuerpos + cambio de rol + segundo toque"],
    ["Señales", String(state.signals.length)],
    ["Velas por símbolo", SYMBOLS.map((s) => `${s}:${(state.candles[s] || []).length}`).join(" · ")],
    ["Acciones externas", "desactivadas"],
    ["Consultas de compra", "no se realizan"]
  ];
  els.systemList.innerHTML = data.map(([k, v]) => `<div class="systemItem"><span>${k}</span><code>${v}</code></div>`).join("");
}

function updateButtons() {
  const pauseText = state.paused ? "▶️ Reanudar" : "⏸️ Live";
  const pauseText2 = state.paused ? "▶️ Reanudar live" : "⏸️ Pausar live";
  if (els.pauseBtn) {
    els.pauseBtn.textContent = pauseText;
    els.pauseBtn.classList.toggle("active", !state.paused);
  }
  if (els.pauseBtn2) {
    els.pauseBtn2.textContent = pauseText2;
    els.pauseBtn2.classList.toggle("active", !state.paused);
  }
  if (els.themeBtn) els.themeBtn.textContent = state.theme === "light" ? "☀️ Tema claro" : "🌙 Tema oscuro";
  if (els.soundBtn) els.soundBtn.textContent = state.sound ? "🔊 Sonido ON" : "🔇 Sonido OFF";
  if (els.vibrateBtn) els.vibrateBtn.textContent = state.vibrate ? "📳 Vibración ON" : "📴 Vibración OFF";
  if (els.lowPowerBtn) els.lowPowerBtn.textContent = state.lowPower ? "🪫 Bajo consumo ON" : "🪫 Bajo consumo OFF";
  if (els.wakeBtn) els.wakeBtn.textContent = state.wakeLock ? "🔒 Pantalla activa ON" : "🔓 Pantalla activa";
}

function updateUi() {
  if (els.wsState) els.wsState.textContent = state.paused ? "pausado" : state.wsOpen ? "online" : "offline";
  if (els.countdownText) els.countdownText.textContent = `${getSecondLeft()}s`;
  if (els.tickState) {
    if (!state.lastTickAt) els.tickState.textContent = "—";
    else els.tickState.textContent = `hace ${Math.max(0, Math.round((Date.now() - state.lastTickAt) / 1000))}s`;
  }
  if (els.selectedSymbolLabel) els.selectedSymbolLabel.textContent = labelSymbol(state.selectedSymbol);
  if (els.selectedQuote) els.selectedQuote.textContent = formatQuote(state.lastQuotes.get(state.selectedSymbol));
  updateSymbolStrip();
  updateSymbolCards();
  drawChart();
  renderHistory();
  renderSignals();
  renderSystem();
  updateButtons();
}

function restartUiTimer() {
  clearInterval(state.uiTimer);
  const delay = state.lowPower ? UI_INTERVAL_LOW_MS : UI_INTERVAL_STANDARD_MS;
  state.uiTimer = setInterval(updateUi, delay);
}

function applyTheme() {
  document.body.classList.toggle("theme-light", state.theme === "light");
  document.body.classList.toggle("theme-dark", state.theme !== "light");
  const color = state.theme === "light" ? "#eef4ff" : "#020617";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", color);
}

async function toggleWakeLock() {
  try {
    if (state.wakeLock) {
      await state.wakeLock.release();
      state.wakeLock = null;
      toast("Pantalla activa OFF");
      updateButtons();
      return;
    }
    if (!("wakeLock" in navigator)) throw new Error("Wake Lock no soportado");
    state.wakeLock = await navigator.wakeLock.request("screen");
    state.wakeLock.addEventListener("release", () => {
      state.wakeLock = null;
      updateButtons();
    });
    toast("Pantalla activa ON");
  } catch {
    toast("No se pudo activar pantalla");
  }
  updateButtons();
}

function exportDiagnostics() {
  const payload = {
    exported_at: new Date().toISOString(),
    version: VERSION,
    clean_base: true,
    analysis_engines_removed: true,
    external_actions_disabled: true,
    symbols: SYMBOLS,
    selected_symbol: state.selectedSymbol,
    ws_online: state.wsOpen,
    paused: state.paused,
    low_power: state.lowPower,
    history_count: state.history.length,
    snr_rules: SNR_RULES,
    signals: state.signals,
    candle_counts: Object.fromEntries(SYMBOLS.map((symbol) => [symbol, (state.candles[symbol] || []).length])),
    last_quotes: Object.fromEntries([...state.lastQuotes.entries()].map(([symbol, quote]) => [symbol, quote]))
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `deriv_pwa_base_diagnostico_${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1200);
  toast("Diagnóstico exportado");
}

async function resetServiceWorkerAndCache() {
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((reg) => reg.unregister()));
    }
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
    toast("Cache/SW reiniciado. Recargá la PWA.", 3500);
  } catch {
    toast("No se pudo resetear Cache/SW");
  }
}

function resetBaseStorage() {
  for (const key of Object.values(KEYS)) {
    try { localStorage.removeItem(key); } catch {}
  }
  state.history = [];
  state.signals = [];
  state.signalKeys.clear();
  state.candles = {};
  state.ticks.clear();
  state.lastQuotes.clear();
  state.selectedSymbol = SYMBOLS[0];
  writeString(KEYS.selectedSymbol, state.selectedSymbol);
  toast("Datos base borrados");
  updateUi();
}

function bindEvents() {
  qsAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      const view = tab.dataset.view;
      qsAll(".tab").forEach((x) => x.classList.toggle("active", x === tab));
      qsAll(".view").forEach((section) => section.classList.remove("active"));
      $(`${view}View`)?.classList.add("active");
      updateUi();
    });
  });

  els.settingsBtn?.addEventListener("click", () => els.settingsModal?.classList.remove("hidden"));
  els.settingsBackdrop?.addEventListener("click", () => els.settingsModal?.classList.add("hidden"));
  els.settingsCloseBtn?.addEventListener("click", () => els.settingsModal?.classList.add("hidden"));
  els.pauseBtn?.addEventListener("click", () => setPaused(!state.paused));
  els.pauseBtn2?.addEventListener("click", () => setPaused(!state.paused));
  els.reconnectBtn?.addEventListener("click", () => {
    setPaused(false);
    connectWS();
    toast("Reconectando…");
  });
  els.themeBtn?.addEventListener("click", () => {
    state.theme = state.theme === "light" ? "dark" : "light";
    writeString(KEYS.theme, state.theme);
    applyTheme();
    updateButtons();
  });
  els.soundBtn?.addEventListener("click", () => {
    state.sound = !state.sound;
    writeBool(KEYS.sound, state.sound);
    if (state.sound) {
      try { els.soundEl?.play?.().catch(() => {}); } catch {}
    }
    updateButtons();
  });
  els.vibrateBtn?.addEventListener("click", () => {
    state.vibrate = !state.vibrate;
    writeBool(KEYS.vibrate, state.vibrate);
    if (state.vibrate && "vibrate" in navigator) navigator.vibrate(60);
    updateButtons();
  });
  els.lowPowerBtn?.addEventListener("click", () => {
    state.lowPower = !state.lowPower;
    writeBool(KEYS.lowPower, state.lowPower);
    restartUiTimer();
    updateButtons();
  });
  els.wakeBtn?.addEventListener("click", toggleWakeLock);
  els.exportBtn?.addEventListener("click", exportDiagnostics);
  els.resetSwBtn?.addEventListener("click", resetServiceWorkerAndCache);
  els.resetStorageBtn?.addEventListener("click", resetBaseStorage);
  els.clearHistoryBtn?.addEventListener("click", () => {
    state.history = [];
    saveHistory();
    renderHistory();
    toast("Historial limpio");
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && !state.paused && !state.wsOpen) connectWS();
  });

  window.addEventListener("online", () => !state.paused && connectWS());
  window.addEventListener("offline", () => setStatus("Sin conexión del dispositivo"));
  window.addEventListener("resize", () => drawChart());
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  try {
    await navigator.serviceWorker.register("sw.js");
  } catch {
    toast("No se pudo registrar SW");
  }
}

function init() {
  if (!SYMBOLS.includes(state.selectedSymbol)) state.selectedSymbol = SYMBOLS[0];
  state.signals.forEach((signal) => signal?.key && state.signalKeys.add(signal.key));
  applyTheme();
  buildSymbolUi();
  bindEvents();
  restartUiTimer();
  updateUi();
  registerServiceWorker();
  if (!state.paused) connectWS();
  else setStatus("Live pausado");
}

init();
