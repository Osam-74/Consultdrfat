# Deployment Guide — ConsultDrFat

## Option A: Cloudflare Pages (Recommended — Git Integration, no token needed)

1. Go to https://dash.cloudflare.com → Workers & Pages → Create → Pages → Connect to Git
2. Connect to `Osam-74/Consultdrfat`
3. Build command: `npm run build`
4. Output directory: `out`
5. Add all `NEXT_PUBLIC_*` environment variables (see table below) in Pages project settings
6. Deploy → your site is live at `https://consultdrfat.pages.dev` (or a custom domain)

---

## Option B: Cloudflare Pages via GitHub Actions

### Step 1: Create a Cloudflare API Token
Go to: https://dash.cloudflare.com/profile/api-tokens → Create Token → Custom Token

Required permissions:
- **Account** → Cloudflare Pages → Edit
- **Account** → Workers Scripts → Edit
- **Account** → Account Settings → Read

### Step 2: Add GitHub Secrets (repo → Settings → Secrets → Actions → New secret)

| Secret Name | Value |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Your Cloudflare API token |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID (right sidebar of dash.cloudflare.com) |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Firebase API key |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | `consultdrfat.firebaseapp.com` |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | `consultdrfat` |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | `consultdrfat.firebasestorage.app` |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | `101708230797` |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | `1:101708230797:web:698b771ef26868be5f32c4` |
| `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY` | Your Paystack public key (`pk_live_...`) |
| `NEXT_PUBLIC_API_BASE` | `https://consultdrfat-api.<sub>.workers.dev` |
| `NEXT_PUBLIC_PRACTITIONER_UID` | Dr. Fat's Firebase Auth UID |

### Step 3: Push to trigger deploy
```bash
git push origin main
```

---

## Option C: GitHub Pages (free, instant)

1. Go to your repo → Settings → Pages → Source: **GitHub Actions**
2. Add the `NEXT_PUBLIC_*` secrets above (no `CLOUDFLARE_*` needed)
3. Push to `main` — the `deploy-github-pages.yml` workflow handles the rest
4. Site at: `https://osam-74.github.io/Consultdrfat/`

---

## Worker Deployment (Paystack verify + webhook → Firestore + TURN)

This is the Cloudflare Worker that:
- Verifies Paystack payments server-side (`/verify`)
- Receives Paystack webhooks and marks bookings paid in Firestore (`/webhook`)
- Returns Cloudflare TURN credentials for WebRTC voice (`/turn`)

### Steps

```bash
cd workers/api
npm install

# Set all required secrets:
wrangler secret put PAYSTACK_SECRET_KEY
# → paste your Paystack secret key (sk_live_... or sk_test_...)

wrangler secret put CF_TURN_KEY_ID
# → from Cloudflare Realtime dashboard (optional but recommended for voice)

wrangler secret put CF_TURN_API_TOKEN
# → from Cloudflare Realtime dashboard

wrangler secret put FIREBASE_SA_JSON
# → paste the FULL contents of the service account JSON file
#   (Firebase console → Project Settings → Service Accounts → Generate new private key)

# Edit wrangler.toml if your Pages URL differs from consultdrfat.pages.dev
# Then deploy:
wrangler deploy
```

Copy the deployed Worker URL (e.g. `https://consultdrfat-api.<sub>.workers.dev`) and set it as:
- `NEXT_PUBLIC_API_BASE` in your Pages environment variables
- `NEXT_PUBLIC_API_BASE` in `.env.local` for local dev

### Set webhook in Paystack
Paystack dashboard → Settings → API Keys & Webhooks → Webhook URL:
```
https://consultdrfat-api.<sub>.workers.dev/webhook
```

---

## Firebase Setup

1. Create project at https://console.firebase.google.com
2. Firestore Database → Create (production mode, region `eur3` or nearest)
3. Authentication → Sign-in method → Google → Enable
4. Project Settings → General → Register Web App → copy config values
5. Deploy rules & indexes:
   ```bash
   firebase login
   firebase use --add    # pick project, alias "default"
   firebase deploy --only firestore:rules,firestore:indexes
   ```
6. Get practitioner UID: run `npm run dev`, go to `/admin`, sign in with the practitioner Google account, copy their UID from Firebase console → Authentication → Users

---

## Environment Variables Reference

| Variable | Where to find it |
|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Firebase console → Project Settings → General |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | `<project-id>.firebaseapp.com` |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Firebase console → Project Settings |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | `<project-id>.firebasestorage.app` |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Firebase console → Project Settings |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Firebase console → Project Settings |
| `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY` | Paystack dashboard → Settings → API Keys |
| `NEXT_PUBLIC_API_BASE` | Your deployed Worker URL |
| `NEXT_PUBLIC_PRACTITIONER_UID` | Firebase console → Authentication → Users |

