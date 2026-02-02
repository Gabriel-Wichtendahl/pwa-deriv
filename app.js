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

/* 🔊 AUDIO CONTEXT (FIX DEFINITIVO) */
let audioCtx = null;
let audioUnlocked = false;

let minuteData = {};
let lastEvaluatedMinute = null;

const statusEl = document.getElementById("status");
const signalsEl = document.getElementById("signals");
const counterEl = document.getElementById("counter");
const feedbackEl = document.getElementById("feedback");
const sound = document.getElementById("alertSound"); // queda, pero ya no es crítico

/* =====================
   UI
===================== */

/* 🔊 BOTÓN DE SONIDO (desbloquea AudioContext) */
document.getElementById("soundBtn").onclick = async () => {
  if (audioUnlocked) return;

  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    await audioCtx.resume();

    audioUnlocked = true;
    soundEnabled = true;

    alert("🔊 Alertas sonoras activadas");
  } catch (e) {
    alert("No se pudo activar el audio");
  }
};

document.getElementById("copyFeedback").onclick = () => {
  navigator.clipboard.writeText(feedbackEl.value);
};

/* =====================
   WebSocket
===================== */

function connect() {
  statusEl.textContent = "