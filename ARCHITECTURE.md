# MindPulse architecture

```mermaid
flowchart LR
  A["10-second voice check-in"] --> B["Web Audio API\nlocal waveform samples"]
  B --> C["Transparent rhythm heuristic\npace · pause space · energy variation"]
  C --> D{"Capacity signal"}
  D -->|"Steady"| E["Focused plan\nDeep work + recovery cues"]
  D -->|"More activated"| F["Gentler plan\nReset + low-friction task"]
  C --> G["localStorage\nprivate browser history"]
  D --> H["Optional GPT-5.6 coach\ntext summary only"]
```

## Boundaries by design

The signal processor intentionally avoids language and implementation that imply a medical claim. It is a personal routine signal, not a classifier for stress, mood, diagnosis, autonomic state, or health risk.

The optional AI route receives a short summary of the selected labels and plan. `server.mjs` instructs the model not to diagnose, infer medical conditions, claim autonomic measurement, or mention numerical scores.
