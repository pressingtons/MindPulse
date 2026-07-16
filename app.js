const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const HISTORY_KEY = "mindpulse-baby-history-v1";
const Q_TABLE_KEY = "mindpulse-baby-q-table-v1";
const SETTINGS_KEY = "mindpulse-baby-settings-v1";
const ACTIONS = ["noNoise", "whiteNoise", "pinkNoise", "softLullaby"];
const ACTION_NAMES = { noNoise: "No sound playing", whiteNoise: "Playing: White Noise", pinkNoise: "Playing: Pink Noise", softLullaby: "Playing: Soft Lullaby" };
const STATES = ["sleeping", "restless", "awake"];
const RESPONSE_DURATION = 5 * 60 * 1000;

const elements = {
  activity: $("#activity-value"), ambient: $("#ambient-value"), ambientToggle: $("#ambient-toggle"), canvas: $("#waveform"), chart: $("#trend-chart"), chartDays: $("#chart-days"), demo: $("#demo-button"), history: $("#history-list"), learning: $("#learning-label"), monitor: $("#monitor-button"), monitorDuration: $("#monitor-duration"), monitorLabel: $("#monitor-label"), pageTitle: $("#page-title"), responseDescription: $("#response-description"), responseMeter: $("#response-meter"), responseTitle: $("#response-title"), rustle: $("#rustle-value"), score: $("#sleep-score"), scoreRing: $("#score-ring"), sidebarCopy: $("#sidebar-copy"), sidebarProgress: $("#sidebar-progress"), sidebarScore: $("#sidebar-score"), signalDot: $("#signal-dot"), sleepDescription: $("#sleep-description"), sleepState: $("#sleep-state-title"), toast: $("#toast"), trendInsight: $("#trend-insight"), waveState: $("#wave-state"), recordingDot: $("#recording-dot")
};

const monitoring = { analyser: null, animationFrame: null, audioContext: null, dataArray: null, frequencyArray: null, isActive: false, samples: [], source: null, startedAt: null, stream: null };
const playback = { context: null, nodes: [], timer: null };
let settings = load(SETTINGS_KEY, { ambientEnabled: true });
let qTable = loadQTable();
let history = loadHistory();
let current = { action: "noNoise", features: { activitySpike: 0.04, ambientFloor: 0.03, rustleDensity: 0.08 }, score: 82, state: "sleeping" };

function load(key, fallback) { try { return { ...fallback, ...JSON.parse(localStorage.getItem(key) || "{}") }; } catch { return fallback; } }
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function average(values) { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0; }
function formatDate(date) { return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" }).format(date); }
function actionLabel(action) { return ACTION_NAMES[action] || ACTION_NAMES.noNoise; }

function loadQTable() {
  const stored = load(Q_TABLE_KEY, {});
  const starterScores = { sleeping: { noNoise: 1.5 }, restless: { pinkNoise: 1.5 }, awake: { whiteNoise: 1.5 } };
  return Object.fromEntries(STATES.map((state) => [state, Object.fromEntries(ACTIONS.map((action) => [action, Number(stored[state]?.[action]) || starterScores[state][action] || 0]))]));
}
function saveModel() { localStorage.setItem(Q_TABLE_KEY, JSON.stringify(qTable)); localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); }
function createSeedHistory() { return [74, 79, 70, 84, 76, 81, 82].map((score, index) => { const date = new Date(); date.setDate(date.getDate() - (6 - index)); return { date: date.toISOString(), score, state: score < 62 ? "awake" : score < 77 ? "restless" : "sleeping" }; }); }
function loadHistory() { try { const stored = JSON.parse(localStorage.getItem(HISTORY_KEY)); return Array.isArray(stored) && stored.length ? stored : createSeedHistory(); } catch { return createSeedHistory(); } }
function saveHistory() { localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(-21))); }
function showToast(message) { elements.toast.textContent = message; elements.toast.classList.add("is-visible"); clearTimeout(showToast.timer); showToast.timer = setTimeout(() => elements.toast.classList.remove("is-visible"), 3600); }

function classify(features) {
  if (features.activitySpike > 0.22 || (features.rustleDensity > 0.6 && features.activitySpike > 0.12)) return "awake";
  if (features.activitySpike > 0.08 || features.rustleDensity > 0.27) return "restless";
  return "sleeping";
}
function sleepScore(features, state) {
  const base = 100 - features.activitySpike * 155 - features.rustleDensity * 35 - features.ambientFloor * 18;
  return Math.round(clamp(base - (state === "awake" ? 20 : state === "restless" ? 7 : 0), 20, 98));
}
function chooseAction(state) {
  if (!settings.ambientEnabled) return "noNoise";
  if (Math.random() < 0.16) return ACTIONS[Math.floor(Math.random() * ACTIONS.length)];
  return ACTIONS.reduce((best, action) => qTable[state][action] > qTable[state][best] ? action : best, ACTIONS[0]);
}
function updateQ(previousState, action, nextState) {
  const reward = nextState === "sleeping" ? 10 : nextState === "awake" ? -10 : -2;
  const bestNext = Math.max(...ACTIONS.map((candidate) => qTable[nextState][candidate]));
  qTable[previousState][action] += 0.28 * (reward + 0.72 * bestNext - qTable[previousState][action]);
  saveModel();
  return reward;
}
function describeState(state) { return state === "sleeping" ? ["Deep sleep", "Low activity and a steady room baseline."] : state === "restless" ? ["Restless", "A few low-to-mid sound shifts suggest the room may be unsettled."] : ["Active disturbance", "A larger activity spike was detected. Please check the room directly if you are concerned."]; }
function level(value, low, high, labels) { return value > high ? labels[2] : value > low ? labels[1] : labels[0]; }

function renderCurrent() {
  const [title, description] = describeState(current.state);
  elements.sleepState.textContent = title; elements.sleepDescription.textContent = description; elements.score.textContent = current.score; elements.sidebarScore.textContent = current.score;
  elements.scoreRing.style.setProperty("--score", current.score); elements.sidebarProgress.style.width = `${current.score}%`;
  elements.sidebarCopy.textContent = current.state === "sleeping" ? "A calm baseline so far." : current.state === "restless" ? "Watching for a calmer window." : "A room check may be useful.";
  elements.activity.textContent = level(current.features.activitySpike, 0.08, 0.22, ["Low", "Rising", "High"]);
  elements.rustle.textContent = level(current.features.rustleDensity, 0.27, 0.6, ["Low", "Moderate", "Frequent"]);
  elements.ambient.textContent = level(current.features.ambientFloor, 0.06, 0.16, ["Quiet", "Present", "Elevated"]);
  elements.signalDot.classList.toggle("is-alert", current.state === "awake"); elements.signalDot.classList.toggle("is-restless", current.state === "restless");
  elements.responseTitle.textContent = actionLabel(current.action); elements.responseDescription.textContent = settings.ambientEnabled ? `Local model selected this response for a ${title.toLowerCase()} state.` : "Ambient responses are paused by a parent control.";
  elements.responseMeter.style.width = `${Math.round(Math.max(...ACTIONS.map((action) => qTable[current.state][action])) * 4 + 15)}%`;
  const learned = Object.values(qTable).flat().some((score) => score !== 0); elements.learning.textContent = learned ? "Local learning: adapting to this room" : "Local learning: starting fresh";
}
function addHistory() { const entryDate = new Date(); const entry = { date: entryDate.toISOString(), score: current.score, state: current.state }; const last = history.at(-1); const sameHour = last && new Date(last.date).getFullYear() === entryDate.getFullYear() && new Date(last.date).getMonth() === entryDate.getMonth() && new Date(last.date).getDate() === entryDate.getDate() && new Date(last.date).getHours() === entryDate.getHours(); if (sameHour) history[history.length - 1] = entry; else history.push(entry); history = history.slice(-21); saveHistory(); }
function renderHistory() { elements.history.innerHTML = history.slice(-4).reverse().map((entry) => `<article class="history-item"><time>${new Date(entry.date).toDateString() === new Date().toDateString() ? "Tonight" : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(entry.date))}</time><strong>${entry.score}<small>/100</small></strong><p>${entry.state === "sleeping" ? "Settled window" : entry.state === "restless" ? "Restless window" : "Active window"}</p><div class="history-meter"><span style="width:${entry.score}%"></span></div></article>`).join(""); }
function renderChart() {
  const entries = history.slice(-7), scores = entries.map((entry) => entry.score), w = 700, h = 245, pad = 15;
  const points = scores.map((score, i) => [pad + ((w - pad * 2) / Math.max(scores.length - 1, 1)) * i, pad + ((98 - score) / 78) * (h - pad * 2)]);
  const path = points.map((p) => p.join(",")).join(" "); const area = `${pad},${h} ${path} ${w - pad},${h}`;
  elements.chart.innerHTML = `<defs><linearGradient id="area-gradient" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#8b7df0" stop-opacity=".24"/><stop offset="100%" stop-color="#8b7df0" stop-opacity="0"/></linearGradient></defs><line x1="${pad}" x2="${w - pad}" y1="110" y2="110" stroke="#e9e6f1" stroke-dasharray="5 7"/><polygon points="${area}" fill="url(#area-gradient)"/><polyline points="${path}" fill="none" stroke="#6b5ce7" stroke-linecap="round" stroke-linejoin="round" stroke-width="4"/>${points.map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="${i === points.length - 1 ? 6 : 4}" fill="#fff" stroke="#6b5ce7" stroke-width="${i === points.length - 1 ? 4 : 2}"/>`).join("")}`;
  elements.chartDays.innerHTML = entries.map((entry) => `<span>${new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(new Date(entry.date))}</span>`).join("");
  const averageScore = Math.round(average(scores)); elements.trendInsight.textContent = averageScore >= 78 ? "The room has had mostly settled windows. Keep using the response that feels appropriate to you." : "The room has had more movement recently. MindPulse will keep its local response scores transparent and adaptable.";
}

function canvasContext() { const c = elements.canvas.getContext("2d"), w = elements.canvas.clientWidth || 740, h = elements.canvas.clientHeight || 176, d = devicePixelRatio || 1; if (elements.canvas.width !== w * d || elements.canvas.height !== h * d) { elements.canvas.width = w * d; elements.canvas.height = h * d; } c.setTransform(d, 0, 0, d, 0, 0); return { c, w, h }; }
function drawWave(data, phase = 0) { const { c, w, h } = canvasContext(); c.clearRect(0, 0, w, h); c.strokeStyle = "rgba(107, 92, 231, .13)"; c.beginPath(); c.moveTo(0, h / 2); c.lineTo(w, h / 2); c.stroke(); const grad = c.createLinearGradient(0, 0, w, 0); grad.addColorStop(0, "rgba(107,92,231,.3)"); grad.addColorStop(.45, "rgba(107,92,231,.95)"); grad.addColorStop(1, "rgba(245,123,112,.44)"); c.strokeStyle = grad; c.lineWidth = 2.1; c.beginPath(); for (let i = 0; i < 150; i += 1) { const x = i / 149 * w, raw = data ? (data[Math.floor(i / 149 * (data.length - 1))] - 128) / 128 : Math.sin(i * .2 + phase) * .08 + Math.sin(i * .08 - phase) * .04, y = h / 2 + raw * h * (data ? .39 : 1); i ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke(); }
function drawIdle(timestamp = 0) { if (monitoring.isActive) return; drawWave(null, timestamp / 1000); monitoring.animationFrame = requestAnimationFrame(drawIdle); }
function setWaveState(message, live = false) { elements.waveState.textContent = message; elements.waveState.classList.toggle("is-live", live); elements.recordingDot.classList.toggle("is-live", live); }

function getFeatures() {
  monitoring.analyser.getByteTimeDomainData(monitoring.dataArray); monitoring.analyser.getByteFrequencyData(monitoring.frequencyArray);
  const time = [...monitoring.dataArray].map((value) => (value - 128) / 128); const rms = Math.sqrt(average(time.map((value) => value * value)));
  const freq = monitoring.frequencyArray, lowEnd = Math.max(2, Math.floor(freq.length * .1)), midEnd = Math.max(lowEnd + 1, Math.floor(freq.length * .38));
  const lowEnergy = average([...freq.slice(1, lowEnd)]) / 255, midEnergy = average([...freq.slice(lowEnd, midEnd)]) / 255;
  const ambientFloor = clamp(lowEnergy * .6 + rms * .4, 0, 1); const previous = monitoring.samples.at(-1)?.rms || rms;
  const features = { activitySpike: clamp(Math.max(0, rms - ambientFloor * .55) * 4 + Math.max(0, rms - previous) * 5, 0, 1), ambientFloor, rustleDensity: clamp(midEnergy * 1.5 + Math.abs(rms - previous) * 5, 0, 1) };
  monitoring.samples.push({ ...features, rms }); if (monitoring.samples.length > 100) monitoring.samples.shift(); return features;
}
function processFeatures(features) { const previousState = current.state, previousAction = current.action, nextState = classify(features); if (monitoring.samples.length > 8) updateQ(previousState, previousAction, nextState); const nextAction = chooseAction(nextState); current = { action: nextAction, features, score: sleepScore(features, nextState), state: nextState }; renderCurrent(); addHistory(); renderHistory(); renderChart(); if (settings.ambientEnabled && nextAction !== previousAction) playAction(nextAction); }
function monitorLoop() { if (!monitoring.isActive) return; const features = getFeatures(); drawWave(monitoring.dataArray); if (monitoring.samples.length % 30 === 0) processFeatures(features); elements.monitorDuration.textContent = `${Math.floor((Date.now() - monitoring.startedAt) / 60000)} min listening`; monitoring.animationFrame = requestAnimationFrame(monitorLoop); }

function noiseBuffer(context, pink = false) { const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate), data = buffer.getChannelData(0); let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0; for (let i = 0; i < data.length; i += 1) { const white = Math.random() * 2 - 1; if (pink) { b0 = .99886 * b0 + white * .0555179; b1 = .99332 * b1 + white * .0750759; b2 = .969 * b2 + white * .153852; b3 = .8665 * b3 + white * .3104856; b4 = .55 * b4 + white * .5329522; b5 = -.7616 * b5 - white * .016898; data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * .5362) * .11; b6 = white * .115926; } else data[i] = white * .12; } return buffer; }
function stopSound() { playback.nodes.forEach((node) => { try { node.stop?.(); node.disconnect?.(); } catch {} }); playback.nodes = []; clearTimeout(playback.timer); }
function playAction(action, duration = RESPONSE_DURATION) {
  stopSound(); if (action === "noNoise") return; const Context = window.AudioContext || window.webkitAudioContext; if (!Context) return; const context = playback.context || new Context(); playback.context = context; context.resume(); const gain = context.createGain(); gain.gain.value = .16; gain.connect(context.destination); playback.nodes.push(gain);
  if (action === "softLullaby") { [261.63, 329.63, 392, 329.63].forEach((frequency, index) => { const oscillator = context.createOscillator(), noteGain = context.createGain(); oscillator.type = "sine"; oscillator.frequency.value = frequency; noteGain.gain.setValueAtTime(0, context.currentTime + index * 1.4); noteGain.gain.linearRampToValueAtTime(.035, context.currentTime + index * 1.4 + .25); noteGain.gain.linearRampToValueAtTime(0, context.currentTime + index * 1.4 + 1.25); oscillator.connect(noteGain).connect(gain); oscillator.start(); oscillator.stop(context.currentTime + 5.8); playback.nodes.push(oscillator, noteGain); }); }
  else { const source = context.createBufferSource(); source.buffer = noiseBuffer(context, action === "pinkNoise"); source.loop = true; source.connect(gain); source.start(); playback.nodes.push(source); }
  playback.timer = setTimeout(() => { stopSound(); if (current.action !== "noNoise") { current.action = "noNoise"; renderCurrent(); } }, duration);
}
async function startMonitoring() { if (!navigator.mediaDevices?.getUserMedia) return showToast("Room monitoring needs a modern browser with microphone access."); try { const stream = await navigator.mediaDevices.getUserMedia({ audio: { autoGainControl: false, echoCancellation: false, noiseSuppression: false } }); const Context = window.AudioContext || window.webkitAudioContext, context = new Context(); await context.resume(); const analyser = context.createAnalyser(); analyser.fftSize = 2048; analyser.smoothingTimeConstant = .75; const source = context.createMediaStreamSource(stream); source.connect(analyser); Object.assign(monitoring, { analyser, audioContext: context, dataArray: new Uint8Array(analyser.fftSize), frequencyArray: new Uint8Array(analyser.frequencyBinCount), isActive: true, samples: [], source, startedAt: Date.now(), stream }); elements.monitor.classList.add("is-monitoring"); elements.monitorLabel.textContent = "Stop room monitoring"; setWaveState("Listening only in this browser", true); monitorLoop(); } catch { showToast("Microphone access was not granted. You can still try the demo."); } }
async function stopMonitoring() { monitoring.isActive = false; cancelAnimationFrame(monitoring.animationFrame); monitoring.stream?.getTracks().forEach((track) => track.stop()); monitoring.source?.disconnect(); await monitoring.audioContext?.close(); Object.assign(monitoring, { analyser: null, audioContext: null, source: null, stream: null }); elements.monitor.classList.remove("is-monitoring"); elements.monitorLabel.textContent = "Start room monitoring"; elements.monitorDuration.textContent = "Paused"; setWaveState("Room monitoring paused"); drawIdle(); stopSound(); }
function runDemo() { const features = { activitySpike: .29, ambientFloor: .09, rustleDensity: .67 }; const previous = current.state, state = classify(features), action = chooseAction(state); updateQ(previous, current.action, state); current = { action, features, score: sleepScore(features, state), state }; renderCurrent(); addHistory(); renderHistory(); renderChart(); playAction(action); setWaveState("Demo disturbance analyzed"); showToast(`${actionLabel(action)} selected locally for this demo.`); }
function showView(name) { $$('[data-view]').forEach((view) => view.classList.toggle('is-visible', view.dataset.view === name)); $$('[data-view-target]').forEach((button) => button.classList.toggle('is-active', button.dataset.viewTarget === name)); elements.pageTitle.textContent = name === "dashboard" ? "Baby’s Room Status" : name === "analytics" ? "Night Analytics" : "Manual Intervention Overrides"; $('.sidebar').classList.remove('is-open'); scrollTo({ top: 0, behavior: 'smooth' }); }
function openDialog() { const dialog = $('#info-dialog'); dialog.showModal ? dialog.showModal() : dialog.setAttribute('open', ''); }

function initialize() {
  $('#today-date').textContent = formatDate(new Date()); renderCurrent(); renderHistory(); renderChart(); drawIdle();
  elements.monitor.addEventListener('click', () => monitoring.isActive ? stopMonitoring() : startMonitoring()); elements.demo.addEventListener('click', runDemo); $('#next-response').addEventListener('click', () => { current.action = ACTIONS[(ACTIONS.indexOf(current.action) + 1) % ACTIONS.length]; playAction(current.action); renderCurrent(); showToast(`${actionLabel(current.action)} selected manually.`); });
  $('#white-noise-button').addEventListener('click', () => { current.action = 'whiteNoise'; playAction('whiteNoise'); renderCurrent(); showToast('White noise will stop automatically in 5 minutes.'); }); elements.ambientToggle.addEventListener('click', () => { settings.ambientEnabled = !settings.ambientEnabled; saveModel(); elements.ambientToggle.innerHTML = `Ambient response: ${settings.ambientEnabled ? 'on' : 'off'} <span>→</span>`; if (!settings.ambientEnabled) stopSound(); renderCurrent(); }); elements.ambientToggle.innerHTML = `Ambient response: ${settings.ambientEnabled ? 'on' : 'off'} <span>→</span>`;
  $('#reset-learning').addEventListener('click', () => { qTable = loadQTable(); localStorage.removeItem(Q_TABLE_KEY); qTable = loadQTable(); renderCurrent(); showToast('Local learned responses were reset.'); });
  $$('.nav-item, [data-view-target]').forEach((button) => button.addEventListener('click', () => showView(button.dataset.viewTarget))); $('#open-guide').addEventListener('click', openDialog); $('#privacy-button').addEventListener('click', openDialog); $('#view-learning').addEventListener('click', openDialog); $('#jump-to-monitor').addEventListener('click', () => $('#monitor-card').scrollIntoView({ behavior: 'smooth', block: 'center' })); $('#mobile-menu').addEventListener('click', () => $('.sidebar').classList.toggle('is-open')); $('.dialog-close').addEventListener('click', () => $('#info-dialog').close()); addEventListener('resize', () => drawWave());
}
initialize();
