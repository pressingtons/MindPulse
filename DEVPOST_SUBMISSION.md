# MindPulse — Devpost submission draft

## Tagline

Your voice rhythm, translated into a kinder plan for the day.

## Category

Apps for Your Life

## Project description

MindPulse is a privacy-first routine companion for the moment before a schedule becomes another demand. Instead of asking someone to choose a generic mood emoji, MindPulse invites a 10-second voice check-in. The app reads transparent, on-device voice-rhythm signals—coarse pace, pause space, and energy variation—and turns them into a personal capacity signal.

That signal changes what happens next. A steadier check-in unlocks a focused work block with recovery cues. A more activated check-in replaces the ambitious start with a short somatic or visual reset, a lower-friction task, and a protected pause. The point is not to label someone; it is to meet them with a plan that fits.

MindPulse is deliberately not a medical device. It does not diagnose stress, assess the autonomic nervous system, or make mental-health claims. It is a gentle reflection and routine-planning tool. Raw recordings remain in the browser and are discarded after analysis. A user can optionally enable a GPT-5.6 coach, which receives only a short text summary of the signal and plan—not raw audio—to generate one concise, non-diagnostic reflection.

## What it does

- Captures a 10-second browser voice check-in with the Web Audio API.
- Extracts local voice-rhythm proxies: energy variation, relative pause space, and coarse waveform-crossing pace.
- Shows the signals in human language rather than hiding them behind a black-box score.
- Adapts the routine between focused work and a recovery-first plan.
- Stores check-in history in local browser storage and visualizes personal patterns.
- Includes a reset room with usable timers for a somatic reset, visual distance, and physiological sigh.
- Uses the OpenAI Responses API with GPT-5.6 for an optional privacy-conscious coach reflection, with a no-key local fallback so anyone can demo the project.

## How we built it

The product is a dependency-free web application:

- `app.js`: microphone capture, waveform rendering, local signal heuristic, adaptive plan, local history, and reset timers.
- `server.mjs`: a zero-install Node server and optional GPT-5.6 Responses API route.
- `index.html` and `styles.css`: responsive consumer-product experience for desktop and mobile.

Codex with GPT-5.6 accelerated the architecture, UI implementation, voice-signal workflow, safe product language, testing, and Build Week documentation. The app is intentionally runnable without an API key or a microphone through its demo mode, so judges can test the full product loop immediately.

## Challenges we ran into

The original idea involved biomedical language around stress markers. We refined the product to avoid overstating what a short browser recording can establish. The result is stronger: instead of presenting a questionable health claim, MindPulse makes its simple signal transparent and useful for a real daily decision.

We also designed for a credible demo environment. Raw microphone input is great in person but can be unreliable for a judge. The deterministic demo mode visibly switches the plan from focus-first to recovery-first with no account, microphone, API key, or installation required.

## Accomplishments that we’re proud of

- A complete experience rather than a model call with a dashboard attached.
- Voice-first interaction that is concrete, private by default, and easy to understand.
- An adaptive plan that visibly changes based on the check-in.
- Guardrails in the copy, data flow, and GPT-5.6 instructions to keep the product non-diagnostic.
- A polished responsive interface, local history, and usable reset timers.

## What we learned

The best health-adjacent consumer experiences earn trust by being clear about what they can and cannot know. A small, explainable signal paired with a practical next step can be more meaningful than a sweeping score with clinical-sounding language.

## What’s next for MindPulse

- Personal calibration after opt-in check-ins, so the signal is compared to a user’s own baseline.
- Optional speech transcription and journaling themes, with explicit consent.
- Evidence-informed routine templates and accessibility preferences.
- Encrypted account sync for users who choose it.
- Research partnerships before making any biometric or health-oriented claims.

## Built with

Codex, GPT-5.6, OpenAI Responses API, Node.js, Web Audio API, MediaRecorder API, HTML, CSS, JavaScript, localStorage.

## Judge instructions

1. Run `node server.mjs` and open `http://localhost:3000`.
2. Click **Run demo** to see the adaptive routine change with no microphone or API key.
3. Click **Begin check-in** to try a real, local microphone workflow.
4. To enable GPT-5.6 reflections, set `OPENAI_API_KEY` and optionally `OPENAI_MODEL=gpt-5.6` before starting the server.
5. Open **Patterns** and **Reset room** to test history and reset timers.

## Submission checklist

- [ ] Add the public repository URL: `https://github.com/pressingtons/MindPulse`
- [ ] Host the app or add the local judge instructions above to the private judge field.
- [ ] Upload a public YouTube demo under three minutes with spoken explanation of Codex and GPT-5.6 use.
- [ ] Enter the Codex `/feedback` session ID from the session where the core project was built.
- [ ] Select **Apps for Your Life**.
- [ ] Confirm the Devpost team members and country field.
