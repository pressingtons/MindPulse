const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const MAX_RECORDING_SECONDS = 10;
const HISTORY_KEY = "mindpulse-checkin-history-v1";

const elements = {
  canvas: $("#waveform"),
  checkinCard: $("#checkin-card"),
  coachMessage: $("#coach-message"),
  coachSource: $("#coach-source"),
  demoButton: $("#demo-button"),
  energyValue: $("#energy-value"),
  historyList: $("#history-list"),
  paceValue: $("#pace-value"),
  pageTitle: $("#page-title"),
  pauseValue: $("#pause-value"),
  planIntro: $("#plan-intro"),
  planList: $("#plan-list"),
  planTitle: $("#plan-title"),
  pulseDescription: $("#pulse-description"),
  pulseScore: $("#pulse-score"),
  pulseTitle: $("#pulse-title"),
  recordButton: $("#record-button"),
  recordLabel: $("#record-label"),
  recordingDot: $("#recording-dot"),
  recordTimer: $("#record-timer"),
  scoreRing: $("#score-ring"),
  sidebarCopy: $("#sidebar-copy"),
  sidebarProgress: $("#sidebar-progress"),
  sidebarScore: $("#sidebar-score"),
  signalDot: $("#signal-dot"),
  signalList: $("#signal-list"),
  timerDialog: $("#timer-dialog"),
  timerInstruction: $("#timer-instruction"),
  timerName: $("#timer-name"),
  timerTitle: $("#timer-title"),
  timerToggle: $("#timer-toggle"),
  todayDate: $("#today-date"),
  toast: $("#toast"),
  trendChart: $("#trend-chart"),
  trendDays: $("#chart-days"),
  trendInsight: $("#trend-insight"),
  voicePrompt: $("#voice-prompt"),
  waveState: $("#wave-state"),
};

const audioState = {
  analyser: null,
  animationFrame: null,
  audioContext: null,
  dataArray: null,
  interval: null,
  isRecording: false,
  mediaRecorder: null,
  remaining: MAX_RECORDING_SECONDS,
  samples: [],
  source: null,
  stream: null,
};

const resetState = {
  interval: null,
  remainingSeconds: 0,
  running: false,
};

const prompts = [
  "“What would make today feel a little lighter?”",
  "“What is taking up the most space in your mind?”",
  "“What pace would feel kind to you today?”",
];

const plans = {
  activated: [
    {
      intro: "Your signal suggests a gentler start. Reduce the load, then rebuild momentum.",
      title: "Restore, then re-enter",
      steps: [
        ["Somatic reset", "4 min · Jaw, shoulders, and a longer exhale"],
        ["One low-friction task", "20 min · Choose the clearest next move"],
        ["Protected pause", "8 min · No input, no catching up"],
      ],
    },
    {
      intro: "Today can still move forward, just with a smaller first promise.",
      title: "Settle the system",
      steps: [
        ["Visual distance", "5 min · Find the horizon or a far corner"],
        ["Gentle admin sprint", "25 min · Close one open loop"],
        ["Warm transition", "6 min · Water, movement, no scrolling"],
      ],
    },
  ],
  steady: [
    {
      intro: "One focused block, protected by two small recovery cues.",
      title: "Build, then breathe",
      steps: [
        ["Deep work sprint", "45 min · Your hardest useful task"],
        ["Visual distance", "5 min · Window, walk, or far focus"],
        ["Light close-out", "15 min · Clear one small loop"],
      ],
    },
    {
      intro: "Your capacity has room for momentum—keep it intentional.",
      title: "Focus with space",
      steps: [
        ["Priority block", "50 min · Build the important thing"],
        ["Body check", "3 min · Stand, stretch, drink water"],
        ["Creative finish", "20 min · An energizing smaller task"],
      ],
    },
  ],
};

let currentCheckIn = {
  energyLabel: "Balanced",
  paceLabel: "Centered",
  pauseLabel: "Present",
  planIndex: 0,
  score: 74,
  state: "steady",
  summary: "A balanced voice-rhythm check-in.",
};

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function average(values) {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function standardDeviation(values, mean) {
  return Math.sqrt(average(values.map((value) => (value - mean) ** 2)));
}

function formatDate(date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(date);
}

function shortDate(date) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date);
}

function formatDuration(seconds) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const remainingSeconds = Math.max(0, seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remainingSeconds}`;
}

function getPlan(checkIn = currentCheckIn) {
  const variants = plans[checkIn.state] || plans.steady;
  return variants[checkIn.planIndex % variants.length];
}

function createSeedHistory() {
  const baseScores = [63, 69, 58, 76, 72, 66, 74];
  return baseScores.map((score, historyIndex) => {
    const date = new Date();
    date.setDate(date.getDate() - (baseScores.length - historyIndex - 1));
    return {
      date: date.toISOString(),
      score,
      state: score < 62 ? "activated" : "steady",
      title: score < 62 ? "Restore, then re-enter" : "Build, then breathe",
    };
  });
}

function loadHistory() {
  try {
    const stored = JSON.parse(localStorage.getItem(HISTORY_KEY));
    return Array.isArray(stored) && stored.length ? stored : createSeedHistory();
  } catch {
    return createSeedHistory();
  }
}

let history = loadHistory();

function saveHistory() {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(-14)));
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("is-visible");
  window.clearTimeout(showToast.timeoutId);
  showToast.timeoutId = window.setTimeout(() => elements.toast.classList.remove("is-visible"), 3600);
}

function updateTimerLabel() {
  elements.recordTimer.textContent = `00:${String(audioState.remaining).padStart(2, "0")}`;
}

function setWaveState(message, isLive = false) {
  elements.waveState.textContent = message;
  elements.waveState.classList.toggle("is-live", isLive);
  elements.recordingDot.classList.toggle("is-live", isLive);
}

function canvasContext() {
  const context = elements.canvas.getContext("2d");
  const displayWidth = elements.canvas.clientWidth || 740;
  const displayHeight = elements.canvas.clientHeight || 176;
  const pixelRatio = window.devicePixelRatio || 1;

  if (elements.canvas.width !== displayWidth * pixelRatio || elements.canvas.height !== displayHeight * pixelRatio) {
    elements.canvas.width = displayWidth * pixelRatio;
    elements.canvas.height = displayHeight * pixelRatio;
  }

  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  return { context, displayHeight, displayWidth };
}

function drawWave(data = null, phase = 0) {
  const { context, displayHeight, displayWidth } = canvasContext();
  const midline = displayHeight / 2;

  context.clearRect(0, 0, displayWidth, displayHeight);
  context.lineWidth = 1;
  context.strokeStyle = "rgba(107, 92, 231, .13)";
  context.beginPath();
  context.moveTo(0, midline);
  context.lineTo(displayWidth, midline);
  context.stroke();

  const gradient = context.createLinearGradient(0, 0, displayWidth, 0);
  gradient.addColorStop(0, "rgba(107, 92, 231, .3)");
  gradient.addColorStop(.45, "rgba(107, 92, 231, .95)");
  gradient.addColorStop(1, "rgba(245, 123, 112, .44)");

  context.lineWidth = 2.1;
  context.strokeStyle = gradient;
  context.beginPath();

  const pointCount = 150;
  for (let pointIndex = 0; pointIndex < pointCount; pointIndex += 1) {
    const xPosition = (pointIndex / (pointCount - 1)) * displayWidth;
    const dataIndex = data ? Math.floor((pointIndex / (pointCount - 1)) * (data.length - 1)) : 0;
    const rawValue = data ? (data[dataIndex] - 128) / 128 : Math.sin(pointIndex * .2 + phase) * .08 + Math.sin(pointIndex * .08 - phase) * .04;
    const yPosition = midline + rawValue * displayHeight * (data ? .39 : 1);

    if (pointIndex === 0) context.moveTo(xPosition, yPosition);
    else context.lineTo(xPosition, yPosition);
  }
  context.stroke();
}

function drawIdleWave(timestamp = 0) {
  if (audioState.isRecording) return;
  drawWave(null, timestamp / 1000);
  audioState.animationFrame = window.requestAnimationFrame(drawIdleWave);
}

function summarizeLiveAudio() {
  if (!audioState.analyser || !audioState.dataArray) return;

  audioState.analyser.getByteTimeDomainData(audioState.dataArray);
  const values = [...audioState.dataArray].map((value) => (value - 128) / 128);
  const rms = Math.sqrt(average(values.map((value) => value ** 2)));
  const zeroCrossings = values.reduce((crossingCount, value, sampleIndex) => {
    if (sampleIndex === 0) return crossingCount;
    return crossingCount + (Math.sign(value) !== Math.sign(values[sampleIndex - 1]) ? 1 : 0);
  }, 0);

  audioState.samples.push({ rms, zeroCrossings: zeroCrossings / values.length });
  drawWave(audioState.dataArray);
}

function startWaveLoop() {
  const loop = () => {
    if (!audioState.isRecording) return;
    summarizeLiveAudio();
    audioState.animationFrame = window.requestAnimationFrame(loop);
  };
  audioState.animationFrame = window.requestAnimationFrame(loop);
}

async function cleanUpAudio() {
  window.clearInterval(audioState.interval);
  window.cancelAnimationFrame(audioState.animationFrame);

  if (audioState.stream) {
    audioState.stream.getTracks().forEach((track) => track.stop());
  }
  if (audioState.source) {
    audioState.source.disconnect();
  }
  if (audioState.audioContext && audioState.audioContext.state !== "closed") {
    await audioState.audioContext.close();
  }

  Object.assign(audioState, {
    analyser: null,
    audioContext: null,
    dataArray: null,
    interval: null,
    mediaRecorder: null,
    source: null,
    stream: null,
  });
}

function analyzeSamples(samples) {
  const rmsValues = samples.map((sample) => sample.rms).filter((value) => value > 0);
  const crossingValues = samples.map((sample) => sample.zeroCrossings).filter((value) => value > 0);

  if (rmsValues.length < 5) {
    return createDemoCheckIn(false);
  }

  const meanRms = average(rmsValues);
  const variation = standardDeviation(rmsValues, meanRms) / Math.max(meanRms, .003);
  const pauseRatio = rmsValues.filter((value) => value < meanRms * .44).length / rmsValues.length;
  const meanCrossings = crossingValues.length ? average(crossingValues) : .04;
  const variationScore = clamp(Math.round(variation * 38), 8, 81);
  const pauseScore = Math.round(pauseRatio * 100);
  const score = Math.round(clamp(83 - pauseRatio * 31 - variationScore * .4 + (meanRms > .025 && meanRms < .17 ? 4 : 0), 44, 90));
  const isActivated = score < 62 || (pauseScore > 50 && variationScore > 34);
  const paceMetric = clamp(Math.round(105 + meanCrossings * 2250), 85, 218);
  const paceLabel = paceMetric > 174 ? "Quick" : paceMetric < 118 ? "Unhurried" : "Centered";
  const energyLabel = variationScore > 42 ? "Variable" : variationScore < 20 ? "Even" : "Balanced";
  const pauseLabel = pauseScore > 46 ? "Frequent" : pauseScore < 20 ? "Light" : "Present";
  const state = isActivated ? "activated" : "steady";

  return {
    energyLabel,
    paceLabel,
    pauseLabel,
    planIndex: 0,
    score,
    state,
    summary: `Voice pace was ${paceLabel.toLowerCase()}, energy variation was ${energyLabel.toLowerCase()}, and pause space was ${pauseLabel.toLowerCase()}.`,
  };
}

function createDemoCheckIn(activated = true) {
  if (activated) {
    return {
      energyLabel: "Variable",
      paceLabel: "Quick",
      pauseLabel: "Frequent",
      planIndex: 0,
      score: 51,
      state: "activated",
      summary: "A demo check-in with quicker pacing, more energy variation, and frequent pause space.",
    };
  }

  return {
    energyLabel: "Balanced",
    paceLabel: "Centered",
    pauseLabel: "Present",
    planIndex: 0,
    score: 73,
    state: "steady",
    summary: "A demo check-in with a centered pace, balanced energy variation, and present pause space.",
  };
}

function renderPlan() {
  const plan = getPlan();
  elements.planTitle.textContent = plan.title;
  elements.planIntro.textContent = plan.intro;
  elements.planList.innerHTML = plan.steps.map(([title, detail], stepIndex) => `
    <li>
      <span>${String(stepIndex + 1).padStart(2, "0")}</span>
      <div><strong>${title}</strong><small>${detail}</small></div>
    </li>
  `).join("");
}

function updateCheckInUI() {
  const plan = getPlan();
  const isActivated = currentCheckIn.state === "activated";
  const title = isActivated ? "Your system asks for space" : "Steady, with a soft edge";
  const description = isActivated
    ? "A lighter first step can keep today from asking more than you have."
    : "A good day for meaningful work with intentional breathing room.";

  elements.pulseTitle.textContent = title;
  elements.pulseDescription.textContent = description;
  elements.pulseScore.textContent = currentCheckIn.score;
  elements.sidebarScore.textContent = currentCheckIn.score;
  elements.scoreRing.style.setProperty("--score", currentCheckIn.score);
  elements.sidebarProgress.style.width = `${currentCheckIn.score}%`;
  elements.sidebarCopy.textContent = isActivated ? "Make the next step smaller." : "A steady place to begin.";
  elements.paceValue.textContent = currentCheckIn.paceLabel;
  elements.energyValue.textContent = currentCheckIn.energyLabel;
  elements.pauseValue.textContent = currentCheckIn.pauseLabel;
  elements.signalDot.classList.toggle("is-activated", isActivated);
  elements.signalList.setAttribute("aria-label", currentCheckIn.summary);
  renderPlan();
}

function addHistoryEntry() {
  const plan = getPlan();
  const entry = {
    date: new Date().toISOString(),
    score: currentCheckIn.score,
    state: currentCheckIn.state,
    title: plan.title,
  };

  const previousEntry = history.at(-1);
  const isSameDay = previousEntry && new Date(previousEntry.date).toDateString() === new Date(entry.date).toDateString();
  if (isSameDay) history[history.length - 1] = entry;
  else history.push(entry);
  history = history.slice(-14);
  saveHistory();
}

function renderHistory() {
  const recentEntries = [...history].slice(-4).reverse();
  elements.historyList.innerHTML = recentEntries.map((entry) => {
    const entryDate = new Date(entry.date);
    const label = entryDate.toDateString() === new Date().toDateString() ? "Today" : shortDate(entryDate);
    const stateLabel = entry.state === "activated" ? "Gentler plan" : "Focused plan";
    return `
      <article class="history-item">
        <time>${label}</time>
        <strong>${entry.score}<small>/100</small></strong>
        <p>${stateLabel}</p>
        <div class="history-meter"><span style="width:${entry.score}%"></span></div>
      </article>
    `;
  }).join("");
}

function renderTrendChart() {
  const chartEntries = history.slice(-7);
  const scores = chartEntries.map((entry) => entry.score);
  const maximum = 92;
  const minimum = 38;
  const chartWidth = 700;
  const chartHeight = 245;
  const horizontalPadding = 15;
  const verticalPadding = 18;
  const usableWidth = chartWidth - horizontalPadding * 2;
  const usableHeight = chartHeight - verticalPadding * 2;
  const points = scores.map((score, pointIndex) => {
    const xPosition = horizontalPadding + (usableWidth / Math.max(scores.length - 1, 1)) * pointIndex;
    const yPosition = verticalPadding + ((maximum - score) / (maximum - minimum)) * usableHeight;
    return [xPosition, yPosition];
  });
  const pointString = points.map(([xPosition, yPosition]) => `${xPosition},${yPosition}`).join(" ");
  const areaString = `${horizontalPadding},${chartHeight} ${pointString} ${chartWidth - horizontalPadding},${chartHeight}`;
  const referenceLines = [60, 75].map((value) => {
    const yPosition = verticalPadding + ((maximum - value) / (maximum - minimum)) * usableHeight;
    return `<line x1="${horizontalPadding}" x2="${chartWidth - horizontalPadding}" y1="${yPosition}" y2="${yPosition}" stroke="#e9e6f1" stroke-dasharray="5 7" />`;
  }).join("");
  const circles = points.map(([xPosition, yPosition], pointIndex) => `<circle cx="${xPosition}" cy="${yPosition}" r="${pointIndex === points.length - 1 ? 6 : 4}" fill="#ffffff" stroke="#6b5ce7" stroke-width="${pointIndex === points.length - 1 ? 4 : 2}" />`).join("");

  elements.trendChart.innerHTML = `
    <defs>
      <linearGradient id="area-gradient" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stop-color="#8b7df0" stop-opacity=".24" />
        <stop offset="100%" stop-color="#8b7df0" stop-opacity="0" />
      </linearGradient>
    </defs>
    ${referenceLines}
    <polygon points="${areaString}" fill="url(#area-gradient)" />
    <polyline points="${pointString}" fill="none" stroke="#6b5ce7" stroke-linecap="round" stroke-linejoin="round" stroke-width="4" />
    ${circles}
  `;
  elements.trendDays.innerHTML = chartEntries.map((entry) => `<span>${new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(new Date(entry.date))}</span>`).join("");

  const averageScore = Math.round(average(scores));
  elements.trendInsight.textContent = averageScore >= 68
    ? "Your baseline has enough room for focused work when you protect a real pause after the hard part."
    : "Your recent rhythm makes small, deliberate starts more useful than pushing for a big first block.";
}

async function getCoachReflection() {
  const plan = getPlan();
  elements.coachSource.textContent = "Finding the right words…";

  try {
    const response = await fetch("/api/coach", {
      body: JSON.stringify({
        planTitle: plan.title,
        state: currentCheckIn.state,
        summary: currentCheckIn.summary,
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const payload = await response.json();
    if (!response.ok || !payload.message) throw new Error("No coach reflection available");
    elements.coachMessage.textContent = payload.message;
    elements.coachSource.textContent = payload.source === "openai" ? "GPT‑5.6 reflection" : "Local reflection";
  } catch {
    elements.coachMessage.textContent = currentCheckIn.state === "activated"
      ? "You do not need to force a full-speed day. Choose the smallest true next step, then let the reset do some of the work."
      : "You don’t need to earn a calm start. Begin with what matters, then protect the space around it.";
    elements.coachSource.textContent = "Local reflection";
  }
}

function applyCheckIn(checkIn, options = {}) {
  currentCheckIn = { ...checkIn };
  updateCheckInUI();
  addHistoryEntry();
  renderHistory();
  renderTrendChart();
  getCoachReflection();

  if (options.toastMessage) showToast(options.toastMessage);
}

async function stopRecording() {
  if (!audioState.isRecording) return;
  audioState.isRecording = false;
  elements.recordButton.classList.remove("is-recording");
  elements.recordLabel.textContent = "Begin check-in";
  elements.recordButton.disabled = true;
  setWaveState("Reading your voice rhythm…");

  if (audioState.mediaRecorder?.state === "recording") audioState.mediaRecorder.stop();
  const checkIn = analyzeSamples(audioState.samples);
  await cleanUpAudio();
  drawWave();
  elements.recordButton.disabled = false;
  elements.recordTimer.textContent = "00:10";
  setWaveState("Check-in complete");
  applyCheckIn(checkIn, { toastMessage: "Your plan now matches this moment." });
}

async function startRecording() {
  if (!navigator.mediaDevices?.getUserMedia) {
    showToast("Voice check-ins need a modern browser with microphone access. Try Run demo here.");
    return;
  }

  window.cancelAnimationFrame(audioState.animationFrame);
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { autoGainControl: false, echoCancellation: true, noiseSuppression: true },
    });
    const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
    const audioContext = new AudioContextConstructor();
    await audioContext.resume();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 1024;
    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);

    audioState.analyser = analyser;
    audioState.audioContext = audioContext;
    audioState.dataArray = new Uint8Array(analyser.fftSize);
    audioState.isRecording = true;
    audioState.remaining = MAX_RECORDING_SECONDS;
    audioState.samples = [];
    audioState.source = source;
    audioState.stream = stream;

    if (window.MediaRecorder) {
      audioState.mediaRecorder = new MediaRecorder(stream);
      audioState.mediaRecorder.start();
    }

    elements.recordButton.classList.add("is-recording");
    elements.recordLabel.textContent = "Finish early";
    setWaveState("Listening on this device", true);
    updateTimerLabel();
    startWaveLoop();

    audioState.interval = window.setInterval(() => {
      audioState.remaining -= 1;
      updateTimerLabel();
      if (audioState.remaining <= 0) stopRecording();
    }, 1000);
  } catch (error) {
    console.warn("Microphone unavailable:", error);
    await cleanUpAudio();
    drawIdleWave();
    setWaveState("Microphone access was not granted");
    showToast("No problem—use Run demo to explore the full experience.");
  }
}

function handleRecordButton() {
  if (audioState.isRecording) stopRecording();
  else startRecording();
}

function showView(viewName) {
  $$("[data-view]").forEach((view) => view.classList.toggle("is-visible", view.dataset.view === viewName));
  $$("[data-view-target]").forEach((button) => button.classList.toggle("is-active", button.dataset.viewTarget === viewName));
  elements.pageTitle.textContent = viewName === "dashboard" ? "Good morning, Alex." : viewName === "trends" ? "Your rhythm, with context." : "Pick a softer next move.";
  $(".sidebar").classList.remove("is-open");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function openDialog(dialog) {
  if (dialog.showModal) dialog.showModal();
  else dialog.setAttribute("open", "");
}

function closeDialog(dialog) {
  if (dialog.close) dialog.close();
  else dialog.removeAttribute("open");
}

function startReset(name, minutes) {
  resetState.remainingSeconds = minutes * 60;
  resetState.running = true;
  elements.timerName.textContent = `${minutes} minute reset`;
  elements.timerTitle.textContent = name;
  elements.timerInstruction.textContent = name === "Somatic reset"
    ? "Relax your jaw. Let your shoulders move down. Stand and take one easy, longer exhale."
    : name === "Visual distance"
      ? "Look farther away than your screen. Find three gentle details and let your eyes soften."
      : "Take two easy inhales through the nose, then let one long exhale empty the breath without forcing it.";
  updateResetTimer();
  openDialog(elements.timerDialog);
  window.clearInterval(resetState.interval);
  resetState.interval = window.setInterval(tickReset, 1000);
}

function updateResetTimer() {
  $("#reset-timer").textContent = formatDuration(resetState.remainingSeconds);
  elements.timerToggle.textContent = resetState.running ? "Pause reset" : "Continue reset";
}

function tickReset() {
  if (!resetState.running) return;
  resetState.remainingSeconds -= 1;
  updateResetTimer();
  if (resetState.remainingSeconds <= 0) {
    resetState.running = false;
    window.clearInterval(resetState.interval);
    elements.timerToggle.textContent = "Reset complete";
    showToast("Nice work. Notice what changed, even a little.");
  }
}

function initializeEvents() {
  elements.recordButton.addEventListener("click", handleRecordButton);
  elements.demoButton.addEventListener("click", () => {
    if (audioState.isRecording) stopRecording();
    setWaveState("Demo rhythm loaded");
    applyCheckIn(createDemoCheckIn(true), { toastMessage: "Demo mode: your plan shifted toward recovery." });
  });

  $("#refresh-plan").addEventListener("click", () => {
    currentCheckIn.planIndex += 1;
    renderPlan();
    getCoachReflection();
    showToast("A fresh version of today’s plan is ready.");
  });
  $("#refresh-coach").addEventListener("click", getCoachReflection);
  $("#start-plan").addEventListener("click", () => {
    const [firstStep] = getPlan().steps;
    showToast(`Starting: ${firstStep[0]}. Keep it small and real.`);
  });
  $("#view-signals").addEventListener("click", () => openDialog($("#info-dialog")));
  $("#open-guide").addEventListener("click", () => openDialog($("#info-dialog")));
  $("#privacy-button").addEventListener("click", () => openDialog($("#info-dialog")));
  $("#jump-to-checkin").addEventListener("click", () => elements.checkinCard.scrollIntoView({ behavior: "smooth", block: "center" }));
  $("#mobile-menu").addEventListener("click", () => $(".sidebar").classList.toggle("is-open"));

  $$("[data-view-target]").forEach((button) => button.addEventListener("click", () => showView(button.dataset.viewTarget)));
  $$(".dialog-close").forEach((button) => button.addEventListener("click", () => closeDialog(button.closest("dialog"))));
  $$(".reset-start").forEach((button) => button.addEventListener("click", () => startReset(button.dataset.reset, Number(button.dataset.minutes))));
  elements.timerToggle.addEventListener("click", () => {
    if (resetState.remainingSeconds <= 0) return;
    resetState.running = !resetState.running;
    updateResetTimer();
  });
  elements.timerDialog.addEventListener("close", () => {
    window.clearInterval(resetState.interval);
    resetState.running = false;
  });
  window.addEventListener("resize", () => drawWave());
}

function initialize() {
  const date = new Date();
  elements.todayDate.textContent = formatDate(date);
  elements.voicePrompt.textContent = prompts[Math.floor(date.getDate() % prompts.length)];
  updateCheckInUI();
  renderHistory();
  renderTrendChart();
  initializeEvents();
  drawIdleWave();
}

initialize();
