# Deployment Guide — ConsultDrFat

## Option A: Cloudflare Pages (Recommended)

### Step 1: Create a Cloudflare API Token with correct permissions
Go to: https://dash.cloudflare.com/profile/api-tokens → Create Token → Custom Token

Required permissions:
- **Account** → Cloudflare Pages → Edit
- **Account** → Workers Scripts → Edit  
- **Account** → Account Settings → Read (to resolve account ID)

### Step 2: Get your Cloudflare Account ID
Dashboard → Right sidebar when logged in. Looks like: `a1b2c3d4e5f6...`

### Step 3: Add GitHub Secrets
Go to your repo → Settings → Secrets and variables → Actions → New secret:

| Secret Name | Value |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Your new Cloudflare token (with Pages + Workers permissions) |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Firebase API key |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | `consultdrfat.firebaseapp.com` |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | `consultdrfat` |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | `consultdrfat.firebasestorage.app` |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | `101708230797` |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | `1:101708230797:web:698b771ef26868be5f32c4` |
| `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY` | Your Paystack public key (`pk_live_...`) |
| `NEXT_PUBLIC_API_BASE` | `https://consultdrfat-api.<sub>.workers.dev` |
| `NEXT_PUBLIC_PRACTITIONER_UID` | Dr. Fat's Firebase Auth UID |

### Step 4: Push to trigger deploy
```bash
git push origin main
```
The `.github/workflows/deploy.yml` will build and deploy to Cloudflare Pages automatically.

---

## Option B: Cloudflare Pages — Git Integration (no token needed)

1. Go to https://dash.cloudflare.com → Workers & Pages → Create → Pages → Connect to Git
2. Connect to `Osam-74/Consultdrfat`
3. Build command: `npm run build`
4. Output directory: `out`
5. Add all `NEXT_PUBLIC_*` environment variables in the Pages project settings
6. Deploy!

This is the EASIEST option — Cloudflare handles everything.

---

## Option C: GitHub Pages (immediate, free)

1. Go to your repo → Settings → Pages
2. Source: **GitHub Actions**
3. Add the secrets listed above (except `CLOUDFLARE_*`) to GitHub Secrets
4. Push to `main` — the `deploy-github-pages.yml` workflow handles the rest
5. Your site will be at: `https://osam-74.github.io/Consultdrfat/`

---

## Worker Deployment (for Paystack verify + TURN)

```bash
cd workers/api
npm install

# Set secrets:
wrangler secret put PAYSTACK_SECRET_KEY
wrangler secret put CF_TURN_KEY_ID  
wrangler secret put CF_TURN_API_TOKEN

# Deploy:
wrangler deploy
```

Use a token with: Account → Workers Scripts → Edit
