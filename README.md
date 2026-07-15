# MindPulse
CURRENT PERMALINK DIFFERENT IP ADDRESSES: https://ubiquitous-kataifi-830fc7.netlify.app/

MindPulse is a calm, adaptive routine companion. A user records a short voice check-in; the app measures simple on-device voice-rhythm signals—energy variation, pause space, and pace—to adapt the next block of their day.

It is designed for self-reflection and routine planning. **It does not diagnose stress, assess the autonomic nervous system, or provide medical advice.**

## Build Week fit

**Track:** Apps for Your Life

MindPulse turns an invisible daily decision—"should I push through or reset?"—into a transparent, humane interaction:

1. Record a 10-second voice check-in.
2. See an understandable, local signal instead of an opaque health claim.
3. Receive an adaptive work/rest plan with a small, concrete next step.
4. Optionally ask a GPT-5.6 coach for a short reflection built from the signal summary, never raw audio.

The project demonstrates a complete consumer-product loop rather than a disconnected model demo: browser microphone capture, signal processing, local persistence, responsive UI, recovery timers, and an optional OpenAI Responses API integration.

## Run locally

You do **not** need VS Code open for MindPulse to work. You can use any terminal in this folder.

1. Install [Node.js 20+](https://nodejs.org/), if it is not already installed.
2. In this project folder, run:

   ```powershell
   node server.mjs
   ```

3. Open [http://localhost:3000](http://localhost:3000) in a modern browser.
4. Select **Begin check-in** and allow microphone access, or use **Run demo** for the full judge-friendly experience without a microphone.

No package installation is required. The server uses only built-in Node.js modules.

## Optional GPT-5.6 coach

MindPulse works fully without an API key using a local reflection fallback. To enable the personalized AI coach, set these environment variables before starting the server:

```powershell
$env:OPENAI_API_KEY="your_api_key"
$env:OPENAI_MODEL="gpt-5.6"
node server.mjs
```

The `/api/coach` route sends only a short, non-identifying summary such as pace and pause labels plus the selected plan. Raw audio is never uploaded or stored by this app. The integration uses the OpenAI Responses API.

## How it works

### Voice-rhythm signal

The browser's Web Audio API samples the microphone waveform while recording. MindPulse derives three intentionally simple features:

- **Energy variation:** how much the short-window signal level changes.
- **Pause space:** the share of lower-energy windows relative to the speaker's own baseline.
- **Voice pace:** a coarse proxy based on waveform crossings.

Those features are mapped to a personal **capacity signal** with a transparent heuristic. They are not biomarkers, diagnostic outputs, or clinical measurements. The UI uses cautious language throughout and shows why a routine changed.

### Adaptive plans

When the signal is steadier, MindPulse suggests a focused work block with recovery cues. When the signal is more activated, it swaps the ambitious block for a somatic or visual reset and a lower-friction task.

### Data handling

- Raw recordings stay in browser memory and are discarded after the check-in.
- Check-in score history stays in `localStorage` on the current browser.
- The optional coach receives a short text summary only.

## Project layout

```text
index.html      Product UI and accessible dialogs
styles.css      Responsive visual system
app.js          Voice capture, signal heuristic, routines, local history
server.mjs      Static server + optional GPT-5.6 coach endpoint
```

## Demo script (under 3 minutes)

1. Open the dashboard and state the problem: people often schedule a day before they know what capacity they have.
2. Click **Run demo**. Point out the visible change from a focused work plan to **Restore, then re-enter**.
3. Open **See the signals** and explain the privacy and non-diagnostic boundary.
4. Visit **Patterns** to show the on-device history and **Reset room** to start a reset timer.
5. If `OPENAI_API_KEY` is configured, refresh the coach note and show that GPT-5.6 receives the concise summary—not voice audio.
6. Close by showing this repository and explaining how Codex and GPT-5.6 accelerated the build, refinement, and testing process.

## Codex and GPT-5.6 contribution

This project was developed with Codex and GPT-5.6 during OpenAI Build Week. The implementation work included product architecture, the responsive interaction design, Web Audio signal analysis, safe-language boundaries, the Node server, optional Responses API coach, and Build Week documentation. Preserve the Codex session ID used for the majority of core functionality and include it in the Devpost submission field.

## Important safety note

MindPulse is not medical software and does not make health, mental-health, cardiovascular, autonomic-nervous-system, or stress diagnoses. It should never be used to make treatment decisions. If someone feels persistently overwhelmed or unsafe, they should contact a trusted person, a qualified professional, or local emergency support.
