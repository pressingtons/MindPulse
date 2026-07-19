# MindPulse
CURRENT PERMALINK: https://mindpulsee.netlify.app/

MindPulse is a private, local-first baby sleep companion. It analyzes room sound patterns in browser memory, can optionally play a low-volume synthesized response, and never records or uploads raw audio.

It is not a medical device, certified baby monitor, or emergency detection service. Keep the device plugged in, screen-on, and in the foreground when using browser monitoring; check the room directly whenever you are concerned.

## Run the local-first app

```powershell
npm run dev
node server.mjs
```

Open `http://localhost:3000`, allow microphone access, or use **Run demo**. No package installation is required for local-first mode.

## Optional accounts and durable progress

The FastAPI service persists only derived session summaries and batched sleep events—not raw audio. Accounts are optional: the local room listener, sound responses, and local history work without one.

```powershell
docker compose up --build
```

The frontend runs on port 3000 and the API on port 8000. For production, set `DATABASE_URL` and a strong `JWT_SECRET`, then run `alembic upgrade head` from `backend`.

## Privacy and safety

- Raw microphone audio stays in browser memory and is discarded immediately.
- The API receives batched, derived sleep events only; there is no audio endpoint or blob storage.
- White, pink, brown noise, and lullaby sounds are synthesized locally with the Web Audio API.
- Sound output is capped at a low level. Follow AAP guidance to keep sound machines under 50 dB and at least 7 feet from the crib.
- “Help improve detection” is off by default. When enabled with an account, it sends only derived feature vectors. Model training is deliberately a future offline task.

## Project layout

```text
index.html          Product UI and accessible dialogs
styles.css          Night-mode responsive visual system
app.js              Local audio analysis, sound DSP, optional event sync
server.mjs          Static frontend server
backend/            FastAPI + SQLAlchemy API and Alembic initial schema
docker-compose.yml  Local Postgres + API services
```

## Demo script

1. Open the dashboard and state the local-first privacy boundary.
2. Click **Run demo** to show a derived state and optional local sound response.
3. Open the guide: no audio is recorded, stored, or uploaded.
4. Visit **Progress** to show the account-gated durable analytics path.
5. Visit **Settings** to show the low-volume guardrail and explicit opt-in derived-feature contribution.

## Important safety note

MindPulse does not detect breathing, apnea, emergencies, or health conditions and must not be used to make health or safety decisions. If a baby needs attention or you are concerned, check the room directly and seek appropriate help.
