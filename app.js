/*
  Reducción Visual 25s — versión limpia
  Motor único. Sin SNR, sin IA local, sin modos viejos, sin niveles en vivo.
*/
(() => {
  "use strict";

  const VERSION = "v106.9-clean-reduccion-visual-25s";
  const APP_ID = "1089";
  const WS_URL = `wss://ws.derivws.com/websockets/v3?app_id=${APP_ID}`;
  const SYMBOLS = ["R_10", "R_25", "R_50", "R_75", "R_100"];
  const ANALYSIS_MS = 25000;
  const EVAL_MIN_MS = 25000;
  const EVAL_MAX_MS = 28000;
  const MAX_SIGNALS = 250;
  const SIGNALS_KEY = "reduccion_visual_clean_signals_v1";
  const FEEDBACK_KEY = "reduccion_visual_clean_feedback_v1";
  const OVERLAY_KEY = "reduccion_visual_overlay_on_v1";

  const $ = (id) => document.getElementById(id);
  const state = {
    ws: null,
    connected: false,
    reconnectTimer: null,
    serverOffsetMs: 0,
    lastTickAt: 0,
    currentSecond: 0,
    buffers: {},
    evaluatedMinutes: new Set(),
    signals: loadJson(SIGNALS_KEY, []),
    feedback: loadJson(FEEDBACK_KEY, {}),
    selectedSignalId: null,
    overlayOn: loadJson(OVERLAY_KEY, true),
    rafPending: false
  };

  const reasons = [
    ["size_wrong", "G/M/P mal"],
    ["break_wrong", "Quiebre mal"],
    ["missing_contrary", "Faltó contrario"],
    ["symmetry", "Era simetría"],
    ["continuity", "Era continuidad"],
    ["double_floor_roof", "Doble suelo/techo"],
    ["direction_wrong", "Dirección incorrecta"],
    ["too_early_late", "Tiempo mal"]
  ];

  function loadJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch { return fallback; }
  }
  function saveJson(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  }
  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
  function fmtTime(epochSec) {
    try { return new Date(epochSec * 1000).toISOString().slice(11, 19) + " UTC"; } catch { return "--:--:--"; }
  }
  function nowServerMs() { return Date.now() + state.serverOffsetMs; }
  function minuteIdFromEpoch(epochSec) { return Math.floor(epochSec / 60); }
  function msInMinute(epochSec) { return Math.round((epochSec - Math.floor(epochSec / 60) * 60) * 1000); }
  function sideName(side) { return side === "BUY" ? "comprador" : "vendedor"; }
  function sideShort(side) { return side === "BUY" ? "C" : "V"; }
  function opposite(side) { return side === "BUY" ? "SELL" : "BUY"; }
  function directionFromReducedSide(side) { return side === "BUY" ? "PUT" : "CALL"; }
  function directionLabel(direction) { return direction === "PUT" ? "VENTA / PUT" : "COMPRA / CALL"; }

  function init() {
    SYMBOLS.forEach((symbol) => {
      state.buffers[symbol] = { symbol, minute: null, ticks: [], lastQuote: null, lastEpoch: null, lastSignal: null };
    });

    buildChartCards();
    bindUi();
    renderSignals();
    connect();
    tickClock();
    requestAnimationFrame(drawAllLiveCharts);

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    }

    console.log(`[${VERSION}] listo`);
  }

  function buildChartCards() {
    const grid = $("chartGrid");
    grid.innerHTML = SYMBOLS.map((symbol) => `
      <article class="chartCard" data-symbol="${symbol}">
        <div class="chartCardHead">
          <strong>${symbol}</strong>
          <span class="miniStatus" id="status_${symbol}">esperando</span>
        </div>
        <canvas id="canvas_${symbol}" width="520" height="230"></canvas>
        <div class="chartFooter">
          <span id="open_${symbol}">open -</span>
          <span id="last_${symbol}">último -</span>
        </div>
      </article>
    `).join("");
  }

  function bindUi() {
    $("clearBtn").addEventListener("click", () => {
      if (!confirm("¿Borrar todas las señales de Reducción visual?")) return;
      state.signals = [];
      state.feedback = {};
      saveJson(SIGNALS_KEY, state.signals);
      saveJson(FEEDBACK_KEY, state.feedback);
      renderSignals();
      closeModal();
    });

    $("exportBtn").addEventListener("click", exportData);
    $("modalClose").addEventListener("click", closeModal);
    document.querySelector(".modalBackdrop")?.addEventListener("click", closeModal);
    $("overlayToggle").addEventListener("click", () => {
      state.overlayOn = !state.overlayOn;
      saveJson(OVERLAY_KEY, state.overlayOn);
      renderModal();
    });
    $("goodReadBtn").addEventListener("click", () => setReadVerdict("good"));
    $("badReadBtn").addEventListener("click", () => setReadVerdict("bad"));
    $("saveCommentBtn").addEventListener("click", saveComment);

    const reasonWrap = $("reasonButtons");
    reasonWrap.innerHTML = reasons.map(([key, label]) => `<button class="btn reasonBtn" data-reason="${key}">${label}</button>`).join("");
    reasonWrap.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-reason]");
      if (!btn) return;
      toggleReason(btn.dataset.reason);
    });
  }

  function connect() {
    clearTimeout(state.reconnectTimer);
    setConnection(false, "Conectando...");

    try { state.ws?.close(); } catch {}
    const ws = new WebSocket(WS_URL);
    state.ws = ws;

    ws.onopen = () => {
      setConnection(true, "Conectado");
      SYMBOLS.forEach((symbol, idx) => {
        send({ ticks: symbol, subscribe: 1, req_id: 1000 + idx });
      });
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.error) {
          console.warn("WS error", msg.error);
          return;
        }
        if (msg.msg_type === "tick" && msg.tick) handleTick(msg.tick);
      } catch (err) {
        console.error("Parse WS", err);
        setConnection(false, "Parse WS: " + err.message);
      }
    };

    ws.onerror = () => setConnection(false, "Error WS");
    ws.onclose = () => {
      setConnection(false, "Reconectando...");
      state.reconnectTimer = setTimeout(connect, 1500);
    };
  }

  function send(payload) {
    if (!state.ws || state.ws.readyState !== WebSocket.OPEN) return false;
    state.ws.send(JSON.stringify(payload));
    return true;
  }

  function setConnection(ok, text) {
    state.connected = ok;
    const dot = $("connDot");
    dot.classList.toggle("ok", ok);
    dot.classList.toggle("bad", !ok && !String(text).includes("Conectando"));
    $("connText").textContent = text;
  }

  function handleTick(tick) {
    const symbol = tick.symbol;
    const quote = Number(tick.quote);
    const epoch = Number(tick.epoch);
    if (!state.buffers[symbol] || !Number.isFinite(quote) || !Number.isFinite(epoch)) return;

    state.lastTickAt = Date.now();
    state.serverOffsetMs = epoch * 1000 - Date.now();

    const minute = minuteIdFromEpoch(epoch);
    const ms = msInMinute(epoch);
    const b = state.buffers[symbol];

    if (b.minute !== minute) {
      b.minute = minute;
      b.ticks = [];
      b.lastSignal = null;
    }

    b.lastQuote = quote;
    b.lastEpoch = epoch;
    b.ticks.push({ ms, quote, epoch });
    b.ticks = b.ticks.filter((x) => x.ms >= 0 && x.ms <= 60000).slice(-80);

    $(`status_${symbol}`).textContent = `s${String(Math.floor(ms / 1000)).padStart(2, "0")}`;
    $(`last_${symbol}`).textContent = `último ${quote}`;
    if (b.ticks[0]) $(`open_${symbol}`).textContent = `open ${b.ticks[0].quote}`;

    maybeEvaluate(symbol, b, ms, epoch);
    scheduleDraw();
  }

  function maybeEvaluate(symbol, buffer, ms, epoch) {
    if (ms < EVAL_MIN_MS || ms > EVAL_MAX_MS) return;
    const evalKey = `${symbol}:${buffer.minute}`;
    if (state.evaluatedMinutes.has(evalKey)) return;
    state.evaluatedMinutes.add(evalKey);

    const result = evaluateReductionVisual25s(buffer.ticks, { symbol, minute: buffer.minute, epoch });
    if (!result.ok) {
      buffer.lastSignal = { rejected: true, reason: result.reason, detail: result };
      return;
    }

    const signal = buildSignal(symbol, buffer.minute, epoch, buffer.ticks, result);
    buffer.lastSignal = signal;
    addSignal(signal);
  }

  function evaluateReductionVisual25s(rawTicks, meta = {}) {
    const ticks = rawTicks.filter((t) => t.ms >= 0 && t.ms <= ANALYSIS_MS).sort((a, b) => a.ms - b.ms);
    if (ticks.length < 6) return reject("pocos_ticks", { ticks: ticks.length });

    const prices = ticks.map((t) => t.quote);
    const range = Math.max(...prices) - Math.min(...prices);
    if (!Number.isFinite(range) || range <= 0) return reject("sin_rango");

    const segments = extractVisualSegments(ticks, range);
    if (segments.length < 3) return reject("pocos_tramos", { segments });

    const buyRead = readSide("BUY", segments, range);
    const sellRead = readSide("SELL", segments, range);
    const putCandidate = scoreCandidate("BUY", buyRead, sellRead, segments, range);
    const callCandidate = scoreCandidate("SELL", sellRead, buyRead, segments, range);
    const candidates = [putCandidate, callCandidate].filter((c) => c.ok);
    if (!candidates.length) {
      return reject("sin_patron_visual", { segments, buyRead, sellRead, putCandidate, callCandidate });
    }

    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0];
    const second = candidates[1];
    if (second && best.score - second.score < 1.7 && !best.hasContraryPG) {
      return reject("ambiguo", { segments, buyRead, sellRead, best, second });
    }

    const quality = best.score >= 10 || (best.score >= 8.4 && best.hasContraryPG) ? "A" : "B";
    if (best.score < 6.6) return reject("calidad_c", { segments, best });

    const visualRead = {
      version: VERSION,
      mode: "REDUCCION_VISUAL_25S_CLEAN",
      windowMs: [0, ANALYSIS_MS],
      symbol: meta.symbol || "",
      direction: best.signalDirection,
      quality,
      subtype: best.hasContraryPG ? "cambio_de_presion" : "reduccion_limpia",
      score: Number(best.score.toFixed(2)),
      reducedSide: best.reducedSide,
      reducedSideLabel: sideName(best.reducedSide),
      contrarySide: opposite(best.reducedSide),
      reducedPattern: best.reducedPattern,
      contraryPattern: best.contraryPattern,
      buyerPattern: buyRead.pattern,
      sellerPattern: sellRead.pattern,
      reason: best.reasons.join(" · "),
      segments,
      buyRead,
      sellRead,
      candidates: { put: putCandidate, call: callCandidate }
    };

    return { ok: true, visualRead, segments, best, quality };

    function reject(reason, extra = {}) { return { ok: false, reason, ...extra }; }
  }

  function extractVisualSegments(ticks, range) {
    const minMove = Math.max(range * 0.055, medianTickMove(ticks) * 1.35);
    const raw = [];
    let start = ticks[0];
    let prev = ticks[0];
    let dir = 0;

    for (let i = 1; i < ticks.length; i++) {
      const cur = ticks[i];
      const delta = cur.quote - prev.quote;
      const ndir = Math.abs(delta) < minMove * 0.25 ? 0 : Math.sign(delta);
      if (dir === 0 && ndir !== 0) dir = ndir;
      if (dir !== 0 && ndir !== 0 && ndir !== dir) {
        raw.push(makeSegment(start, prev, dir));
        start = prev;
        dir = ndir;
      }
      prev = cur;
    }
    if (dir !== 0) raw.push(makeSegment(start, prev, dir));

    const merged = [];
    for (const seg of raw) {
      if (seg.mag < minMove) {
        const last = merged[merged.length - 1];
        if (last && last.side === seg.side) {
          last.toMs = seg.toMs; last.toQuote = seg.toQuote; last.delta += seg.delta; last.mag = Math.abs(last.delta);
        }
        continue;
      }
      const last = merged[merged.length - 1];
      if (last && last.side === seg.side) {
        last.toMs = seg.toMs;
        last.toQuote = seg.toQuote;
        last.delta = last.toQuote - last.fromQuote;
        last.mag = Math.abs(last.delta);
      } else {
        merged.push({ ...seg });
      }
    }

    const maxMag = Math.max(...merged.map((s) => s.mag), minMove);
    return merged.map((s, idx) => ({
      ...s,
      idx,
      side: s.delta > 0 ? "BUY" : "SELL",
      label: classifySize(s.mag, maxMag),
      ratio: s.mag / maxMag,
      durationMs: s.toMs - s.fromMs
    })).filter((s) => s.mag >= minMove * 0.75);
  }

  function makeSegment(a, b, dir) {
    const delta = b.quote - a.quote;
    return {
      fromMs: a.ms,
      toMs: b.ms,
      fromQuote: a.quote,
      toQuote: b.quote,
      delta,
      mag: Math.abs(delta),
      side: dir > 0 ? "BUY" : "SELL"
    };
  }

  function medianTickMove(ticks) {
    const moves = [];
    for (let i = 1; i < ticks.length; i++) moves.push(Math.abs(ticks[i].quote - ticks[i - 1].quote));
    moves.sort((a, b) => a - b);
    return moves.length ? moves[Math.floor(moves.length / 2)] || 0 : 0;
  }

  function classifySize(mag, maxMag) {
    const r = maxMag > 0 ? mag / maxMag : 0;
    if (r >= 0.62) return "G";
    if (r >= 0.34) return "M";
    return "P";
  }

  function readSide(side, segments, range) {
    const list = segments.filter((s) => s.side === side);
    if (!list.length) return { side, sideLabel: sideName(side), pattern: "sin fuerza", impulses: [], score: 0, reduces: false, increases: false };

    const impulses = list.map((s) => ({ ...s }));
    const pattern = impulses.map((s) => s.label).join("→");
    let score = 0;
    const first = impulses[0];
    const last = impulses[impulses.length - 1];
    const maxLater = Math.max(...impulses.slice(1).map((s) => s.mag), 0);
    const minLater = Math.min(...impulses.slice(1).map((s) => s.mag), Infinity);
    const firstIsBig = first.label === "G" || (first.label === "M" && first.ratio >= 0.48);
    const reductionRatio = maxLater > 0 ? maxLater / first.mag : 1;
    const lastReductionRatio = impulses.length > 1 ? last.mag / first.mag : 1;
    const reduces = impulses.length >= 2 && firstIsBig && (reductionRatio <= 0.72 || lastReductionRatio <= 0.66 || /G.*P/.test(pattern));
    const cleanGMP = /^G→M→P/.test(pattern) || /^G→P/.test(pattern) || /^M→P/.test(pattern);
    const returnsAndReduces = /^G→P→G→P/.test(pattern) || /^G→M→P→G→P/.test(pattern) || (impulses.length >= 4 && last.label === "P" && first.label === "G");
    const increases = impulses.length >= 2 && last.mag > first.mag * 1.22;

    if (firstIsBig) score += 2.5;
    if (reduces) score += 3.0;
    if (cleanGMP) score += 2.0;
    if (returnsAndReduces) score += 1.7;
    if (impulses.length >= 3 && last.label === "P") score += 1.0;
    if (increases) score -= 2.5;

    return {
      side,
      sideLabel: sideName(side),
      pattern,
      impulses,
      firstIsBig,
      reduces,
      increases,
      cleanGMP,
      returnsAndReduces,
      reductionRatio: Number(reductionRatio.toFixed(3)),
      lastReductionRatio: Number(lastReductionRatio.toFixed(3)),
      score: Number(score.toFixed(2))
    };
  }

  function scoreCandidate(reducedSide, reducedRead, contraryRead, segments) {
    const reasons = [];
    if (!reducedRead.reduces) return { ok: false, reducedSide, reason: "el grupo no reduce", score: reducedRead.score || 0 };

    let score = reducedRead.score;
    reasons.push(`${sideName(reducedSide)} ${reducedRead.pattern} reduce`);

    const contraryPG = detectsPG(contraryRead.impulses || []);
    const contraryStrong = (contraryRead.impulses || []).some((s) => s.label === "G");
    if (contraryPG) {
      score += 3.4;
      reasons.push(`${sideName(opposite(reducedSide))} P→G aumenta`);
    } else if (contraryStrong) {
      score += 1.3;
      reasons.push(`entra ${sideName(opposite(reducedSide))}`);
    } else {
      reasons.push("sin toma fuerte del contrario");
    }

    if (reducedRead.increases && !reducedRead.returnsAndReduces) {
      score -= 3.0;
      reasons.push("advertencia: el grupo reducido vuelve fuerte");
    }

    const symmetryPenalty = symmetryLike(reducedRead, contraryRead);
    if (symmetryPenalty) {
      score -= 2.2;
      reasons.push("penaliza simetría");
    }

    return {
      ok: score >= 6.2,
      reducedSide,
      score,
      signalDirection: directionFromReducedSide(reducedSide),
      reducedPattern: reducedRead.pattern,
      contraryPattern: contraryRead.pattern,
      hasContraryPG: contraryPG,
      contraryStrong,
      reasons,
      reducedRead,
      contraryRead
    };
  }

  function detectsPG(impulses) {
    for (let i = 1; i < impulses.length; i++) {
      const a = impulses[i - 1];
      const b = impulses[i];
      if ((a.label === "P" || a.ratio < 0.42) && (b.label === "G" || b.mag >= a.mag * 1.45)) return true;
    }
    return false;
  }

  function symmetryLike(a, b) {
    const ai = a.impulses || [];
    const bi = b.impulses || [];
    if (!ai.length || !bi.length) return false;
    const amag = ai.reduce((s, x) => s + x.mag, 0) / ai.length;
    const bmag = bi.reduce((s, x) => s + x.mag, 0) / bi.length;
    const rel = Math.min(amag, bmag) / Math.max(amag, bmag);
    return rel > 0.82 && Math.abs((a.score || 0) - (b.score || 0)) < 1.2;
  }

  function buildSignal(symbol, minute, epoch, allTicks, result) {
    const ticks = allTicks.map((t) => ({ ms: t.ms, quote: t.quote, epoch: t.epoch }));
    const visualRead = result.visualRead;
    const id = `${minute}-${symbol}-${visualRead.direction}-REDUCCION_VISUAL_25S`;
    return {
      id,
      createdAt: Date.now(),
      minute,
      time: fmtTime(minute * 60),
      symbol,
      direction: visualRead.direction,
      mode: "REDUCCIÓN VISUAL 25S",
      mode_version: VERSION,
      quality: visualRead.quality,
      subtype: visualRead.subtype,
      status: `🎯 Reducción visual ${visualRead.quality} · ${directionLabel(visualRead.direction)}`,
      logic: visualRead.reason,
      ticks,
      visualRead,
      feedback: state.feedback[id] || null
    };
  }

  function addSignal(signal) {
    if (state.signals.some((s) => s.id === signal.id)) return;
    state.signals.unshift(signal);
    state.signals = state.signals.slice(0, MAX_SIGNALS);
    saveJson(SIGNALS_KEY, state.signals);
    renderSignals();
  }

  function renderSignals() {
    const list = $("signalsList");
    $("signalCount").textContent = `${state.signals.length} señal${state.signals.length === 1 ? "" : "es"}`;
    if (!state.signals.length) {
      list.className = "signalsList empty";
      list.textContent = "Todavía no hay señales.";
      return;
    }
    list.className = "signalsList";
    list.innerHTML = state.signals.map((s) => {
      const dirClass = s.direction === "PUT" ? "put" : "call";
      const dirIcon = s.direction === "PUT" ? "↓" : "↑";
      const fb = state.feedback[s.id];
      return `
        <article class="signalCard" data-id="${s.id}">
          <div class="signalTop">
            <div>
              <strong>${s.symbol} · ${s.time}</strong>
              <div class="signalMeta">${s.mode} · ventana 0–25s · ${s.subtype || "reducción"}</div>
            </div>
            <div class="signalBadges">
              <span class="badge ${dirClass}">${dirIcon} ${s.direction === "PUT" ? "VENTA" : "COMPRA"}</span>
              <span class="badge ${String(s.quality).toLowerCase()}">Calidad ${s.quality}</span>
            </div>
          </div>
          <div class="signalPattern">
            <div>Comprador: <b>${s.visualRead?.buyerPattern || "-"}</b></div>
            <div>Vendedor: <b>${s.visualRead?.sellerPattern || "-"}</b></div>
            <div>${escapeHtml(s.logic || "")}</div>
          </div>
          <div class="signalFeedback">
            <button class="btn small ok" data-vote="good">✅ Bien</button>
            <button class="btn small danger" data-vote="bad">❌ Mal</button>
            ${fb ? `<span class="badge">Feedback: ${fb.verdict === "good" ? "bien" : "mal"}</span>` : ""}
          </div>
        </article>`;
    }).join("");

    list.querySelectorAll(".signalCard").forEach((card) => {
      card.addEventListener("click", (e) => {
        const btn = e.target.closest("button[data-vote]");
        if (btn) {
          e.stopPropagation();
          quickVote(card.dataset.id, btn.dataset.vote);
          return;
        }
        openModal(card.dataset.id);
      });
    });
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>'"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[ch]));
  }

  function quickVote(id, verdict) {
    state.feedback[id] = { ...(state.feedback[id] || {}), verdict, at: Date.now(), reasons: state.feedback[id]?.reasons || [], comment: state.feedback[id]?.comment || "" };
    applyFeedbackToSignal(id);
    saveJson(FEEDBACK_KEY, state.feedback);
    saveJson(SIGNALS_KEY, state.signals);
    renderSignals();
  }

  function openModal(id) {
    state.selectedSignalId = id;
    $("signalModal").classList.remove("hidden");
    $("signalModal").setAttribute("aria-hidden", "false");
    renderModal();
  }

  function closeModal() {
    state.selectedSignalId = null;
    $("signalModal").classList.add("hidden");
    $("signalModal").setAttribute("aria-hidden", "true");
  }

  function getSelectedSignal() { return state.signals.find((s) => s.id === state.selectedSignalId); }

  function renderModal() {
    const s = getSelectedSignal();
    if (!s) return;
    const vr = s.visualRead || {};
    $("modalTitle").textContent = `${s.symbol} · ${directionLabel(s.direction)}`;
    $("modalSub").textContent = `${s.time} · Calidad ${s.quality} · ${s.subtype || "reducción visual"}`;
    $("overlayToggle").textContent = state.overlayOn ? "👁️ Lectura ON" : "👁️ Lectura OFF";

    $("readSummary").innerHTML = `
      <div class="readRow"><span>Dirección</span><b>${directionLabel(s.direction)}</b></div>
      <div class="readRow"><span>Calidad</span><b>${s.quality}</b></div>
      <div class="readRow"><span>Comprador</span><b>${vr.buyerPattern || "-"}</b></div>
      <div class="readRow"><span>Vendedor</span><b>${vr.sellerPattern || "-"}</b></div>
      <div class="readRow"><span>Tipo</span><b>${vr.subtype || "-"}</b></div>
      <div class="readRow"><span>Motivo</span><b>${escapeHtml(vr.reason || s.logic || "-")}</b></div>
      <div class="readRow"><span>Ventana</span><b>0–25 segundos</b></div>
    `;

    const fb = state.feedback[s.id] || {};
    $("commentBox").value = fb.comment || "";
    document.querySelectorAll(".reasonBtn").forEach((btn) => btn.classList.toggle("active", (fb.reasons || []).includes(btn.dataset.reason)));
    drawSignalCanvas(s);
  }

  function setReadVerdict(verdict) {
    const s = getSelectedSignal();
    if (!s) return;
    state.feedback[s.id] = { ...(state.feedback[s.id] || {}), verdict, at: Date.now(), reasons: state.feedback[s.id]?.reasons || [], comment: $("commentBox").value || "" };
    applyFeedbackToSignal(s.id);
    saveJson(FEEDBACK_KEY, state.feedback);
    saveJson(SIGNALS_KEY, state.signals);
    renderSignals();
    renderModal();
  }

  function toggleReason(reason) {
    const s = getSelectedSignal();
    if (!s) return;
    const fb = state.feedback[s.id] || { verdict: "bad", reasons: [], comment: "" };
    const set = new Set(fb.reasons || []);
    if (set.has(reason)) set.delete(reason); else set.add(reason);
    state.feedback[s.id] = { ...fb, verdict: fb.verdict || "bad", reasons: [...set], at: Date.now(), comment: $("commentBox").value || fb.comment || "" };
    applyFeedbackToSignal(s.id);
    saveJson(FEEDBACK_KEY, state.feedback);
    saveJson(SIGNALS_KEY, state.signals);
    renderModal();
    renderSignals();
  }

  function saveComment() {
    const s = getSelectedSignal();
    if (!s) return;
    state.feedback[s.id] = { ...(state.feedback[s.id] || {}), at: Date.now(), reasons: state.feedback[s.id]?.reasons || [], comment: $("commentBox").value || "" };
    applyFeedbackToSignal(s.id);
    saveJson(FEEDBACK_KEY, state.feedback);
    saveJson(SIGNALS_KEY, state.signals);
    renderSignals();
  }

  function applyFeedbackToSignal(id) {
    const sig = state.signals.find((x) => x.id === id);
    if (sig) sig.feedback = state.feedback[id] || null;
  }

  function exportData() {
    const data = {
      exported_at: new Date().toISOString(),
      app_version: VERSION,
      mode: "REDUCCION_VISUAL_25S_CLEAN",
      count_signals: state.signals.length,
      count_feedback: Object.keys(state.feedback).length,
      description: "Export limpio: solo señales, ticks, lectura visual G/M/P y correcciones de Reducción visual 25s.",
      signals: state.signals,
      feedback: state.feedback
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `reduccion_visual_25s_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  function tickClock() {
    const d = new Date(nowServerMs());
    $("clockText").textContent = d.toLocaleTimeString();
    const sec = Math.floor((nowServerMs() / 1000) % 60);
    state.currentSecond = sec;
    $("secondText").textContent = `s${String(sec).padStart(2, "0")}`;
    setTimeout(tickClock, 250);
  }

  function scheduleDraw() {
    if (state.rafPending) return;
    state.rafPending = true;
    requestAnimationFrame(() => {
      state.rafPending = false;
      drawAllLiveCharts();
    });
  }

  function drawAllLiveCharts() {
    SYMBOLS.forEach((symbol) => drawLiveChart(symbol));
    requestAnimationFrame(() => {});
  }

  function drawLiveChart(symbol) {
    const canvas = $(`canvas_${symbol}`);
    const b = state.buffers[symbol];
    if (!canvas || !b) return;
    drawChart(canvas, b.ticks, { overlay: false, title: symbol });
  }

  function drawSignalCanvas(signal) {
    const canvas = $("modalCanvas");
    drawChart(canvas, signal.ticks, { overlay: state.overlayOn, visualRead: signal.visualRead, modal: true });
  }

  function drawChart(canvas, ticks, opts = {}) {
    const ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#020617";
    ctx.fillRect(0, 0, w, h);

    const pad = opts.modal ? 34 : 18;
    const plot = { x: pad, y: pad, w: w - pad * 2, h: h - pad * 2 };
    drawGrid(ctx, plot);

    if (!ticks || ticks.length < 2) {
      ctx.fillStyle = "#94a3b8";
      ctx.font = "14px system-ui";
      ctx.fillText("Esperando ticks...", plot.x + 8, plot.y + 24);
      return;
    }

    const xs = ticks.map((t) => t.ms);
    const ys = ticks.map((t) => t.quote);
    const minMs = 0;
    const maxMs = opts.modal ? 60000 : 60000;
    let minY = Math.min(...ys), maxY = Math.max(...ys);
    if (maxY === minY) { maxY += 1; minY -= 1; }
    const margin = (maxY - minY) * 0.12;
    minY -= margin; maxY += margin;

    const xOf = (ms) => plot.x + (clamp(ms, minMs, maxMs) - minMs) / (maxMs - minMs) * plot.w;
    const yOf = (q) => plot.y + plot.h - (q - minY) / (maxY - minY) * plot.h;

    // ventana 0-25s
    ctx.fillStyle = opts.modal ? "rgba(168,85,247,.17)" : "rgba(168,85,247,.08)";
    ctx.fillRect(xOf(0), plot.y, xOf(ANALYSIS_MS) - xOf(0), plot.h);
    ctx.strokeStyle = "rgba(168,85,247,.78)";
    ctx.setLineDash([6, 5]);
    ctx.beginPath(); ctx.moveTo(xOf(ANALYSIS_MS), plot.y); ctx.lineTo(xOf(ANALYSIS_MS), plot.y + plot.h); ctx.stroke();
    ctx.setLineDash([]);

    const open = ticks[0].quote;
    ctx.strokeStyle = "rgba(34,211,238,.38)";
    ctx.setLineDash([5, 5]);
    ctx.beginPath(); ctx.moveTo(plot.x, yOf(open)); ctx.lineTo(plot.x + plot.w, yOf(open)); ctx.stroke();
    ctx.setLineDash([]);

    ctx.strokeStyle = "rgba(226,232,240,.9)";
    ctx.lineWidth = opts.modal ? 3 : 2;
    ctx.beginPath();
    ticks.forEach((t, i) => {
      const x = xOf(t.ms), y = yOf(t.quote);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();

    if (opts.overlay && opts.visualRead) {
      drawVisualOverlay(ctx, opts.visualRead, xOf, yOf, plot);
    }

    ctx.fillStyle = "rgba(226,232,240,.75)";
    ctx.font = opts.modal ? "13px system-ui" : "11px system-ui";
    ctx.fillText("0s", plot.x, plot.y + plot.h + 20);
    ctx.fillText("25s", xOf(ANALYSIS_MS) - 12, plot.y + 16);
    ctx.fillText("60s", plot.x + plot.w - 25, plot.y + plot.h + 20);
  }

  function drawGrid(ctx, plot) {
    ctx.strokeStyle = "rgba(148,163,184,.12)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = plot.y + (plot.h / 4) * i;
      ctx.beginPath(); ctx.moveTo(plot.x, y); ctx.lineTo(plot.x + plot.w, y); ctx.stroke();
    }
    for (let i = 0; i <= 4; i++) {
      const x = plot.x + (plot.w / 4) * i;
      ctx.beginPath(); ctx.moveTo(x, plot.y); ctx.lineTo(x, plot.y + plot.h); ctx.stroke();
    }
  }

  function drawVisualOverlay(ctx, visualRead, xOf, yOf, plot) {
    const segments = visualRead.segments || [];
    segments.forEach((seg) => {
      const color = seg.side === "BUY" ? "#60a5fa" : "#ef4444";
      const x1 = xOf(seg.fromMs), y1 = yOf(seg.fromQuote);
      const x2 = xOf(seg.toMs), y2 = yOf(seg.toQuote);
      ctx.strokeStyle = color;
      ctx.lineWidth = 5;
      ctx.globalAlpha = 0.92;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      ctx.globalAlpha = 1;

      const lx = (x1 + x2) / 2;
      const ly = (y1 + y2) / 2 - 12;
      const label = `${sideShort(seg.side)} ${seg.label}`;
      ctx.font = "bold 15px system-ui";
      const tw = ctx.measureText(label).width + 16;
      ctx.fillStyle = seg.side === "BUY" ? "rgba(37,99,235,.88)" : "rgba(127,29,29,.88)";
      roundRect(ctx, lx - tw / 2, ly - 17, tw, 26, 7);
      ctx.fill();
      ctx.strokeStyle = seg.side === "BUY" ? "#93c5fd" : "#fca5a5";
      ctx.stroke();
      ctx.fillStyle = "#fff";
      ctx.fillText(label, lx - tw / 2 + 8, ly + 2);
    });

    ctx.fillStyle = "rgba(196,181,253,.95)";
    ctx.font = "bold 14px system-ui";
    ctx.fillText("Ventana 0–25s", plot.x + 12, plot.y + plot.h - 16);
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  init();
})();
