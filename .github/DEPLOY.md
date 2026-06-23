# Deployment Guide — ConsultDrFat

---

## 🌐 How the App is Deployed

| What | Where | How |
|---|---|---|
| **Frontend (Next.js app)** | Vercel | Auto-deploy on push to `main` via GitHub Actions |
| **API Worker** | Cloudflare Worker | Auto-deploy on push to `main` via GitHub Actions (manual trigger) |
| **File Storage** | Cloudflare R2 | Attached to the worker as `SESSION_FILES` binding |
| **Database** | Firebase Firestore | Always live — deploy rules/indexes with Firebase CLI |

---

## ✅ Vercel — Frontend Deployment

Vercel deploys automatically whenever you push to `main`.

**Build settings (already configured in `vercel.json`):**
- Framework: Next.js
- Build command: `npm run build`
- Install command: `npm install --legacy-peer-deps`

**Environment variables to add in Vercel Dashboard → Project → Settings → Environment Variables:**

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | From Firebase console → Project Settings → Web App |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | `consultdrfat.firebaseapp.com` |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | `consultdrfat` |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | `consultdrfat.firebasestorage.app` |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | `101708230797` |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | `1:101708230797:web:698b771ef26868be5f32c4` |
| `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY` | From Paystack Dashboard → Settings → API Keys → Public Key |
| `NEXT_PUBLIC_API_BASE` | `https://consultdrfat-api.ogmediainc.workers.dev` |
| `NEXT_PUBLIC_PRACTITIONER_UID` | Dr. Fat's Firebase UID (see Firebase → Authentication) |

---

## 🔐 GitHub Secrets — Where to Get Each Value and Where to Add Them

**Where to add:** GitHub → Your repo → Settings → Secrets and variables → Actions → New repository secret

### 1. `VERCEL_TOKEN`
**What it is:** A personal access token that lets GitHub Actions deploy to Vercel on your behalf.

**Where to get it:**
1. Go to [vercel.com/account/tokens](https://vercel.com/account/tokens)
2. Click **Create Token**
3. Give it a name (e.g. "ConsultDrFat GitHub Actions")
4. Copy the token — you won't see it again
5. Add to GitHub as `VERCEL_TOKEN`

### 2. `VERCEL_ORG_ID`
**What it is:** Your Vercel team/personal account ID.

**Where to get it:**
1. In your terminal (with Vercel CLI): run `vercel whoami` then `cat .vercel/project.json`
2. OR: Go to Vercel Dashboard → your project → Settings → scroll to bottom → **Project ID** section
3. The **orgId** is listed there alongside projectId
4. Add to GitHub as `VERCEL_ORG_ID`

### 3. `VERCEL_PROJECT_ID`
**What it is:** The unique ID of your specific Vercel project.

**Where to get it:**
1. Go to [vercel.com/dashboard](https://vercel.com/dashboard) → click your **Consultdrfat** project
2. Go to **Settings** tab (top nav inside the project)
3. Scroll to the very bottom — you'll see **Project ID** displayed there
4. Copy it (looks like `prj_xxxxxxxxxxxxxxxx`)
5. Add to GitHub as `VERCEL_PROJECT_ID`

### 4. `CLOUDFLARE_API_TOKEN` (for Worker deployment)
**What it is:** A Cloudflare API token to deploy the Worker from GitHub Actions.

**Where to get it:**
1. Go to [dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens)
2. Click **Create Token**
3. Use the **Edit Cloudflare Workers** template
4. Scope it to your account
5. Click Continue → Create Token → Copy
6. Add to GitHub as `CLOUDFLARE_API_TOKEN`

### 5. `CLOUDFLARE_ACCOUNT_ID` (for Worker deployment)
**What it is:** Your Cloudflare account ID.

**Where to get it:**
1. Go to [dash.cloudflare.com](https://dash.cloudflare.com)
2. Click any domain or go to the main dashboard
3. On the right sidebar → scroll down → **Account ID**
4. Copy it
5. Add to GitHub as `CLOUDFLARE_ACCOUNT_ID`

---

## ⚡ Cloudflare Worker — `consultdrfat-api`

The worker handles: Paystack payment verification, slot reservation/release, taken-slots check, file uploads to R2, and TURN server credentials.

**Deploy manually (from your machine):**
```bash
cd workers/api
npm install
wrangler deploy
```

**Deploy via GitHub Actions:**
Go to GitHub → Actions → "Deploy Cloudflare Worker (manual)" → Run workflow

**Required secrets on the Worker (set via Wrangler, NOT in wrangler.toml):**
```bash
cd workers/api
wrangler secret put PAYSTACK_SECRET_KEY    # sk_live_... from Paystack
wrangler secret put FIREBASE_SA_JSON       # Full service account JSON from Firebase
wrangler secret put R2_PUBLIC_BASE         # https://pub-xxxx.r2.dev (from R2 bucket public URL)
```

**Optional TURN server credentials:**
```bash
wrangler secret put CF_TURN_KEY_ID        # From Cloudflare Realtime dashboard
wrangler secret put CF_TURN_API_TOKEN     # From Cloudflare Realtime dashboard
```

### R2 Bucket binding
In Cloudflare Dashboard → Workers & Pages → `consultdrfat-api` → Settings → Bindings:
- Type: R2 Bucket
- Variable name: `SESSION_FILES`
- Bucket: `consultdrfat-session-files`

---

## 🗄️ Firebase — Rules & Indexes

Deploy updated Firestore rules and indexes:
```bash
firebase login
firebase use consultdrfat
firebase deploy --only firestore:rules,firestore:indexes
```

Run this whenever you change `firestore.rules` or `firestore.indexes.json`.

---

## ❌ What NOT to do with Cloudflare Pages

If you have a **Cloudflare Pages** project (separate from the Worker), **do not use it** for this app. This is a Next.js SSR app — it needs Vercel (or a proper Node.js host). Cloudflare Pages with OpenNext adds complexity with no benefit here since Vercel already works.

If Cloudflare is showing your Pages project trying to build the worker code (`npx esbuild src/index.ts`) it means the **Root directory** in Cloudflare Pages is accidentally set to `workers/api/`. Fix: set Root directory to blank (repo root) OR just disable the Cloudflare Pages project and use Vercel only.

---

## 🔁 Deployment Flow Summary

```
You push to main
    │
    ├── GitHub Actions: "Promote to Production (Vercel)"
    │       └── vercel build + deploy --prod  (needs VERCEL_TOKEN, VERCEL_ORG_ID, VERCEL_PROJECT_ID)
    │
    └── GitHub Actions: "Deploy Cloudflare Worker (manual)"  ← manual trigger only
            └── wrangler deploy  (needs CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID)
```
