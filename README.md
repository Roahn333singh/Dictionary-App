# Retain

A simple, modern English vocabulary app for words you actually want to use when speaking.

## What it does

- **Private accounts** — Sign in with a name and password; every person gets their own separate dictionary
- **Saved permanently** — Words live in your Supabase database and sync across devices; works offline and syncs when back online
- **Smart capture** — Type a word; Gemini fills English meaning, accurate Hindi meaning, and two example sentences (free dictionaries are the fallback)
- **Review** — Spaced repetition (Again / Hard / Good / Easy)
- **Themes** — Switch between Ink, Forest, Ember, and Day
- **Installable PWA** — Add to your phone home screen for app-like use
- **Library** — Search, filter, edit, delete

## One-time setup (Supabase + Gemini)

### 1. Create the database

1. Create a free project at [supabase.com](https://supabase.com) (region **Mumbai** is fastest for India).
2. Open **SQL Editor → New query**, paste [`supabase/schema.sql`](supabase/schema.sql), and click **Run**.

Row-level security in that file guarantees each user can only read and write their own words.

### 2. Allow name + password accounts

Accounts are just a name and a password (no email needed). In Supabase:
**Authentication → Sign In / Providers → Email** → turn **off "Confirm email"** → Save.

Once everyone has created their account, you can optionally turn **off "Allow new users to sign up"** (Authentication → Sign In / Providers) so nobody else can create one.

### 3. Deploy the meaning lookup (Gemini)

Get a free API key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey), then:

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase secrets set GEMINI_API_KEY=<your-gemini-key>
npx supabase functions deploy enrich --no-verify-jwt
```

The function checks the signed-in user itself and caches every word, so repeat lookups are instant. Optional: `npx supabase secrets set GEMINI_MODEL=<model>` to pick a specific Gemini model.

### 4. Connect the app

From Supabase **Project Settings → API**, copy the Project URL and the anon (publishable) key.

- Local: copy `.env.example` to `.env.local` and fill both values.
- DigitalOcean: **App → Settings → your component → Environment Variables** → add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (scope: **Build Time**), then redeploy.

The anon key is safe in the browser; your data is protected by row-level security. Never put the Gemini key or the service-role key in the app.

## Run locally

```bash
npm install
npm run dev
```

Then open the URL Vite prints (usually `http://localhost:5173`).

## Words saved before accounts

Words saved in a browser before accounts existed are offered once after sign-in ("Found N words… Are they yours?"). Choose **Yes** to move them into your account, or **Not mine** on a shared device.

## Deploy on Google Cloud Run

Live: https://retain-986644135829.asia-south1.run.app

The app is built locally (so `.env.local` is baked in) and Cloud Run only serves the static files with nginx (`Dockerfile`, `nginx.conf`). `.gcloudignore` uploads just `dist/` plus those two files, which keeps builds to seconds.

```bash
npm run build
CLOUDSDK_ACTIVE_CONFIG_NAME=retain gcloud run deploy retain --source . \
  --region asia-south1 --allow-unauthenticated --port 8080 \
  --memory 128Mi --cpu 1 --min-instances 0 --max-instances 2 --quiet
```

`--min-instances 0` scales to zero when idle, so a few users stay within the free tier.

## Install on your phone (PWA)

1. Deploy or open the app over **HTTPS** (or `localhost` while developing).
2. On **Android Chrome**: menu → **Install app** / **Add to Home screen**.
3. On **iPhone Safari**: Share → **Add to Home Screen**.

## How to use it

1. Create your account (name + password) once, then you stay signed in on that device.
2. Open **Add**, type a word, hit **Look up**.
3. Tweak anything if you want, then save.
4. Open **Review** when words are due and rate yourself honestly.
5. Tap your initial (top right) to see save status or sign out.
