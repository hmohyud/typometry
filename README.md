# Typometry

**Your typing, measured.**

Typometry is a minimalist typing analysis tool that captures the rhythm and patterns of your keystrokes. Unlike traditional typing tests focused purely on speed, Typometry treats your typing as biometric data — revealing hesitation patterns, finger transitions, and the subtle signature of how *you* type.

## What it does

- **Keystroke timing analysis** — Measures the time between each keypress, not just overall WPM
- **Pattern recognition** — Identifies which character combinations slow you down
- **Category-based prompts** — Practice with code snippets, prose, numbers, or tongue-twisters to see how your typing changes across contexts
- **Local-first** — All data stays in your browser. No accounts, no tracking.

## Why it exists

Every person types differently. The pause before a capital letter, the rhythm of familiar words, the stumble on uncommon bigrams — these form a kind of fingerprint. Typometry makes that fingerprint visible.

Built by [Hyder Mohyuddin](https://hmohyud.github.io/hyder) as an experiment in treating interaction data as something worth looking at.

## Tech

React + Vite, no backend required. Keystroke data stored in localStorage.

## Run locally

```bash
npm install
npm run dev
```

## License

MIT
