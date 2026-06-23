# Deployment Guide — ConsultDrFat

## ⚡ The Problem This Fixes

The old config used `output: "export"` (static HTML) and `next: 14`.
Cloudflare Pages now auto-runs `npx wrangler deploy` which triggers **OpenNext**,
and OpenNext requires **Next.js 15+**. This repo is now on Next.js 15 + OpenNext,
which is the correct modern setup.

---

## ✅ Cloudflare Pages — Git Integration (Recommended, no token needed)

### Build settings to use in the Cloudflare Pages dashboard:

| Setting | Value |
|---|---|
| **Framework preset** | None (custom) |
| **Root directory** | *(leave blank — repo root)* |
| **Build command** | `npm run build` |
| **Output directory** | `.next` |
| **Node.js version** | 22 |

> ⚠️ **Common mistake:** If Cloudflare is running `npx esbuild src/index.ts ...` it means
> the **Root directory** is accidentally set to `workers/api/`. Clear it so it points at
> the repo root, and set Build command to `npm run build`.

Go to: https://dash.cloudflare.com → Workers & Pages → your project → Settings → Builds & deployments

### Environment variables to add in the Pages project settings:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Your Firebase API key |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | `consultdrfat.firebaseapp.com` |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | `consultdrfat` |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | `consultdrfat.firebasestorage.app` |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | `101708230797` |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | `1:101708230797:web:698b771ef26868be5f32c4` |
| `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY` | `pk_live_...` (from Paystack dashboard) |
| `NEXT_PUBLIC_API_BASE` | `https://consultdrfat-api.<sub>.workers.dev` |
| `NEXT_PUBLIC_PRACTITIONER_UID` | Dr. Fat's Firebase UID |

Push to `main` and Cloudflare will build + deploy automatically.

---

## Worker Deployment (Paystack verify + webhook → Firestore + TURN)

```bash
cd workers/api
npm install

# Set required secrets:
wrangler secret put PAYSTACK_SECRET_KEY
# → paste sk_live_... or sk_test_...

wrangler secret put CF_TURN_KEY_ID
# → from Cloudflare Realtime dashboard

wrangler secret put CF_TURN_API_TOKEN
# → from Cloudflare Realtime dashboard

wrangler secret put FIREBASE_SA_JSON
# → paste the full JSON contents of your Firebase service account key
#   Firebase console → Project Settings → Service Accounts → Generate new private key

# Deploy:
wrangler deploy
```

Copy the Worker URL (e.g. `https://consultdrfat-api.<sub>.workers.dev`) and set it as `NEXT_PUBLIC_API_BASE` in Cloudflare Pages.

Set the webhook in Paystack:
Paystack dashboard → Settings → API Keys & Webhooks → Webhook URL:
`https://consultdrfat-api.<sub>.workers.dev/webhook`

---

## Firebase Setup

1. Firebase console → Create project → Firestore → Create (production mode)
2. Authentication → Sign-in method → Google → Enable
3. Project Settings → General → Register Web App → copy config
4. Deploy rules & indexes:
```bash
firebase login
firebase use --add
firebase deploy --only firestore:rules,firestore:indexes
```
5. Get practitioner UID: run the app, go to `/admin`, sign in with Dr. Fat's Google account, copy UID from Firebase console → Authentication

---

## What changed from the old setup

| Before | After |
|---|---|
| Next.js 14 | ✅ Next.js 15 |
| `output: "export"` (static HTML) | ✅ OpenNext (Cloudflare Workers SSR) |
| Deploy command: `npx wrangler deploy` | ✅ Build: `npm run deploy` |
| Output dir: `out` | ✅ Output dir: `.open-next` |
