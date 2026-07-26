# Retain

A simple, modern English vocabulary app for words you actually want to use when speaking.

## What it does

- **Smart capture** — Type a word; Retain fills English meaning, Hindi meaning, and two example sentences
- **Review** — Spaced repetition (Again / Hard / Good / Easy)
- **Themes** — Switch between Ink, Forest, Ember, and Day
- **Installable PWA** — Add to your phone home screen for app-like use
- **Library** — Search, filter, edit, delete

Everything is stored locally in your browser — no account required.

Vocab data lives in **browser localStorage**. It does not sync across origins (localhost ≠ production) or devices; each browser/device has its own data.

## Run locally

```bash
npm install
npm run dev
```

Then open the URL Vite prints (usually `http://localhost:5173`).

## Deploy on DigitalOcean App Platform

Prefer a **Static Site** (not a Web Service). Settings:

| Setting | Value |
| --- | --- |
| Build command | `npm run build` |
| Output directory | `dist` |
| Catchall Document | `index.html` |

The Catchall Document is required so client-side routes (`/review`, `/add`, `/library`) serve `index.html` on refresh or direct paste instead of a DigitalOcean 404. In the control panel: **Settings → your static site → Custom Pages → Catchall → `index.html`**.

Repo config lives in [`.do/app.yaml`](.do/app.yaml) with `catchall_document: index.html`.

### If the app is already a Web Service

Either convert the component to a **Static Site** (recommended), or keep it as a Web Service and set:

- **Build command:** `npm run build`
- **Run command:** `npm start` (serves `dist` with SPA fallback via `serve -s`)

## Install on your phone (PWA)

1. Deploy or open the app over **HTTPS** (or `localhost` while developing).
2. On **Android Chrome**: menu → **Install app** / **Add to Home screen**.
3. On **iPhone Safari**: Share → **Add to Home Screen**.

## How to use it

1. Open **Add**, type a word, hit **Look up**.
2. Tweak anything if you want, then save.
3. Open **Review** when words are due and rate yourself honestly.
4. Tap **Theme** in the header anytime you want a new look.
