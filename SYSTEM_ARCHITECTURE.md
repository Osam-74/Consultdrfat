# ConsultDrFat — Full System Architecture

> **Purpose:** This document explains every moving part of the ConsultDrFat platform in enough
> detail that an external developer, AI agent, or new team member can understand how everything
> connects, why it was built this way, and how to maintain or extend it. Read this before
> touching any part of the codebase.

---

## 0. What this platform does (30-second version)

ConsultDrFat is a **single-practitioner telemedicine PWA** built for Nigeria. A patient:

1. Signs in with Google
2. Books a slot within the next 14 days and pays in Naira (Paystack)
3. Joins a private room at the scheduled time — voice (WebRTC), live chat, shared countdown
4. Can pay for more time mid-session if the doctor offers an extension

The practitioner has a separate portal to manage availability, view bookings, and run sessions.

---

## 1. High-level architecture diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│                         CLIENT BROWSER / PWA                         │
│   Next.js (App Router, TypeScript, static export)                    │
│                                                                       │
│  page.tsx (home)   book/page.tsx   admin-portal/page.tsx             │
│  session/page.tsx  privacy/page.tsx  terms/page.tsx                  │
│                                                                       │
│  Firebase SDK ──────────────────────────► Google Firebase            │
│  (Auth, Firestore listeners)            (Auth + Firestore DB)        │
│                                                                       │
│  Paystack Inline JS ────────────────────► Paystack API               │
│  (loaded dynamically, browser only)     (PCI-DSS card/bank/OPay)    │
│                                                                       │
│  WebRTC (P2P audio) ◄──────────────────► Other browser (P2P)        │
│  Firestore signaling ───────────────────► Firestore (calls/ docs)   │
│  TURN via Cloudflare ───────────────────► CF Realtime TURN relay     │
│                                                                       │
│  fetch /verify, /turn ──────────────────► Cloudflare Worker          │
└──────────────────────────────────────────────────────────────────────┘
         ▲ static files served from                    ▲
         │                                             │ webhook POST
┌────────┴───────────────┐              ┌──────────────┴──────────────┐
│   Cloudflare Pages     │              │   Paystack Webhooks         │
│   (hosts the PWA out/) │              │   → Cloudflare Worker       │
│   CDN + SSL globally   │              │   → Firestore REST API      │
└────────────────────────┘              └─────────────────────────────┘
         ▲ deploys from
┌────────┴───────────────┐
│   GitHub Repository    │
│   (Osam-74/Consultdrfat)│
│   main branch          │
│   CI/CD via Actions    │
└────────────────────────┘
                                ┌──────────────────────────────────────┐
                                │   Firebase "Trigger Email" Extension  │
                                │   Watches: mail/ collection           │
                                │   Sends via: Brevo SMTP (free tier)   │
                                │   → Patient confirmation & reminders  │
                                └──────────────────────────────────────┘
```

---

## 2. Repository layout

```
Consultdrfat/                        ← root (Next.js project)
├── src/
│   ├── app/
│   │   ├── page.tsx                 ← Home / landing page
│   │   ├── layout.tsx               ← Root layout (AuthProvider, fonts, metadata)
│   │   ├── globals.css              ← Entire design system (one file, no Tailwind)
│   │   ├── book/page.tsx            ← Booking calendar + Paystack checkout
│   │   ├── admin-portal/page.tsx    ← PRACTITIONER ONLY portal (secret URL)
│   │   ├── admin/page.tsx           ← Legacy redirect (kept for compatibility)
│   │   ├── session/page.tsx         ← Session room shell (loads SessionRoom)
│   │   ├── privacy/page.tsx         ← Privacy Policy (NDPR-compliant, full page)
│   │   └── terms/page.tsx           ← Terms of Service (Nigerian law, full page)
│   ├── components/
│   │   ├── SessionRoom.tsx          ← Live consultation room (voice+chat+timer)
│   │   └── ServiceWorkerRegister.tsx← PWA service worker registration
│   └── lib/
│       ├── firebase.ts              ← Firebase app init (reads NEXT_PUBLIC_ env vars)
│       ├── auth.tsx                 ← Google Auth context (role detection)
│       ├── db.ts                    ← ALL Firestore reads/writes + email queue helpers
│       ├── types.ts                 ← Shared TypeScript types + DEFAULT_SETTINGS
│       ├── slots.ts                 ← 14-day slot generation algorithm
│       ├── webrtc.ts                ← WebRTC peer connection + Firestore signaling
│       ├── paystack.ts              ← Paystack Inline popup (browser-only, dynamic import)
│       └── fonts.ts                 ← next/font config (Plus Jakarta Sans + Lora)
├── workers/
│   └── api/
│       ├── src/index.ts             ← Cloudflare Worker (verify, webhook, turn, health)
│       ├── wrangler.toml            ← Worker config (name, routes, ALLOW_ORIGIN)
│       └── package.json
├── public/
│   ├── manifest.webmanifest         ← PWA manifest (name, icons, theme)
│   ├── sw.js                        ← Service worker (offline shell caching)
│   └── icons/                       ← icon-192.png, icon-512.png
├── .github/
│   └── workflows/
│       ├── deploy.yml               ← Push-to-Cloudflare-Pages CI/CD
│       ├── deploy-worker.yml        ← Push-to-Cloudflare-Worker CI/CD
│       └── deploy-github-pages.yml  ← Optional GitHub Pages deployment
├── firestore.rules                  ← Firestore security rules
├── firestore.indexes.json           ← Firestore composite indexes
├── .env.example                     ← Template for required env vars
├── next.config.mjs                  ← Next.js config (static export, basePath logic)
├── vercel.json                      ← Vercel deployment config (alternative to CF Pages)
├── AI_AGENT_INSTRUCTIONS.md         ← Step-by-step setup guide for agents/developers
├── LAYMAN_SUMMARY.md                ← Non-technical overview
└── SYSTEM_ARCHITECTURE.md          ← THIS FILE
```

---

## 3. Infrastructure services — what each does

### 3.1 GitHub (`github.com/Osam-74/Consultdrfat`)

- **Single source of truth** for all code.
- The `main` branch is the production branch.
- Two GitHub Actions workflows fire on push to `main`:
  - `deploy.yml` — builds the Next.js static export (`npm run build` → `out/`) and pushes it to Cloudflare Pages.
  - `deploy-worker.yml` — deploys `workers/api/src/index.ts` to Cloudflare Workers via `wrangler deploy`.
- **Secrets stored in GitHub repo settings** (Settings → Secrets → Actions):
  - `CLOUDFLARE_API_TOKEN` — for wrangler to deploy Pages and Workers
  - `CLOUDFLARE_ACCOUNT_ID` — your Cloudflare account ID
  - `NEXT_PUBLIC_FIREBASE_*` — all Firebase env vars (needed at build time)
  - `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY`
  - `NEXT_PUBLIC_API_BASE` — deployed Worker URL
  - `NEXT_PUBLIC_PRACTITIONER_UID`

### 3.2 Cloudflare Pages

- Hosts the static Next.js PWA (`out/` directory).
- Provides global CDN, automatic HTTPS, and custom domain support.
- Build command: `npm run build`
- Output directory: `out`
- Environment variables are also set here (duplicate of GitHub secrets) for the build process.
- **URL pattern:** `https://consultdrfat.pages.dev` (or custom domain).

### 3.3 Cloudflare Worker (`workers/api/src/index.ts`)

The Worker is a small server-side component that handles the three things that **cannot** be done safely in the browser:

| Endpoint | Method | What it does |
|---|---|---|
| `GET /verify?reference=…` | GET | Calls Paystack API with the secret key to confirm a payment succeeded |
| `POST /webhook` | POST | Receives Paystack webhook, verifies HMAC-SHA512 signature, marks booking paid in Firestore via Admin REST API |
| `GET /turn` | GET | Mints short-lived Cloudflare TURN ICE credentials for WebRTC |
| `GET /health` | GET | Health check — returns `{ok:true}` |

**Worker secrets** (set via `wrangler secret put <NAME>`):
```
PAYSTACK_SECRET_KEY    sk_live_…  (never in frontend)
CF_TURN_KEY_ID         Cloudflare Realtime TURN key ID
CF_TURN_API_TOKEN      Cloudflare Realtime TURN API token
FIREBASE_PROJECT_ID    e.g. consultdrfat
FIREBASE_SA_JSON       Full service-account JSON (for Admin REST API auth)
ALLOW_ORIGIN           https://consultdrfat.pages.dev (or custom domain)
```

**Worker environment variables** (in `wrangler.toml`):
```toml
[vars]
ALLOW_ORIGIN = "https://consultdrfat.pages.dev"
FIREBASE_PROJECT_ID = "consultdrfat"
```

### 3.4 Firebase (Google)

Firebase is the **real-time database and authentication backbone**.

#### 3.4.1 Firebase Authentication

- Provider: **Google Sign-In only** (no email/password, no other providers).
- How role detection works:
  - Every user who signs in gets a Firebase UID.
  - If `user.uid === NEXT_PUBLIC_PRACTITIONER_UID` → role = `"practitioner"`.
  - All other authenticated users → role = `"client"`.
  - The practitioner UID is set once (after the practitioner signs in for the first time) and stored in the env var and in Firestore rules.
- **There is no separate sign-up flow.** Anyone with a Google account can sign in. The role is determined purely by UID match, not by a different button or registration step.

#### 3.4.2 Firestore Database

All application state lives here. Collections:

```
settings/practice          PracticeSettings: priceNGN, sessionMin, bufferMin, windowDays, name
availabilityTemplates/{id} Weekly recurring hours: {weekday:0-6, start:"09:00", end:"17:00", active:true}
availabilityExceptions/{id} One-off: {date:"2026-06-20", type:"block"|"extra", start?, end?}
bookings/{id}              Booking: {clientId, clientEmail, clientName, slotStart, slotEnd,
                                     status:"held"|"paid"|"cancelled", topic, amountNGN, paystackRef}
sessions/{bookingId}       Live session state: {status:"idle"|"live"|"complete",
                                     endAt:Timestamp|null, durationMin, offer:Offer|null,
                                     nextClientAt:string|null, updatedAt}
sessions/{bookingId}/
  messages/{id}            Chat: {from:"client"|"practitioner"|"system", text, t:number}
calls/{bookingId}          WebRTC signaling: {offer:RTCSessionDescription, answer:RTCSessionDescription}
calls/{bookingId}/
  offerCandidates/{id}     ICE candidates from caller
  answerCandidates/{id}    ICE candidates from callee
mail/{id}                  Email queue for Trigger Email extension:
                           {to, message:{subject, html}}
```

#### 3.4.3 Firestore Security Rules (`firestore.rules`)

Critical rules summary:
- **`settings/`, `availabilityTemplates/`, `availabilityExceptions/`** — read by anyone authenticated, write by practitioner only.
- **`bookings/`** — clients can read/create their own; practitioner can read/write all.
- **`sessions/` and `calls/`** — clients access only their own session (matched by bookingId → their clientId); practitioner accesses all.
- **`mail/`** — write-only from authenticated users (the extension reads it with admin privileges).
- Replace `REPLACE_WITH_PRACTITIONER_UID` in `firestore.rules` with the actual UID before deploying.

#### 3.4.4 Firebase "Trigger Email" Extension

- Installed from Firebase Extensions marketplace.
- Watches the `mail/` Firestore collection.
- When a document is added, it sends the email via the configured SMTP server.
- **SMTP:** Brevo (free, 300 emails/day). Configure URI: `smtps://<login>:<key>@smtp-relay.brevo.com:465`
- Emails sent: booking confirmation (on payment), 24h reminder, 1h reminder.
- Reminders are enqueued by the Cloudflare Worker cron job (see §3.3).

### 3.5 Vercel (alternative deployment)

`vercel.json` is included as an alternative to Cloudflare Pages. The build output (`out/`) can be deployed to Vercel instead. Both work; Cloudflare Pages is the primary target. Choose one.

---

## 4. Key data flows — step by step

### 4.1 Patient booking flow

```
1. Patient visits /book/
2. App fetches settings/practice from Firestore (price, window, session length)
3. App fetches availabilityTemplates + availabilityExceptions from Firestore
4. slots.ts generates available 30-min slots for the next 14 days
5. App fetches active bookings to exclude already-booked slots
6. Patient picks a date → picks a time slot → enters topic
7. Patient signs in with Google (if not already signed in)
8. Patient ticks consent checkbox
9. Patient clicks "Book & Pay"
10. db.ts createBooking() → writes bookings/{id} with status:"held"
11. paystack.ts opens Paystack popup (card/bank/OPay)
    - metadata includes {bookingId, kind:"session"}
12a. If payment succeeds in popup:
     → Paystack calls /verify?reference=… on the Worker
     → Worker confirms with Paystack API
     → db.ts markBookingPaid() updates booking status:"paid"
     → db.ts sendBookingConfirmationEmail() queues email in mail/
12b. Paystack also fires a webhook to /webhook on the Worker:
     → Worker verifies HMAC signature
     → Worker calls Firebase Admin REST API to mark booking paid
     → This is the reliable server-side confirmation (even if client tab closed)
13. Patient sees confirmation screen
14. Confirmation email arrives (via Brevo + Trigger Email extension)
```

### 4.2 Session flow (live consultation)

```
1. Patient navigates to /session/?id={bookingId}
2. SessionRoom.tsx loads
3. db.ts ensureSession() creates sessions/{bookingId} if it doesn't exist
4. Both client and practitioner open WebRTC voice connection:
   a. webrtc.ts fetchIceServers() → GET /turn on Worker → Cloudflare TURN creds
   b. Caller creates RTCPeerConnection, generates offer
   c. Offer written to calls/{bookingId} in Firestore
   d. Callee picks up offer via Firestore listener, creates answer
   e. Answer written back to Firestore; ICE candidates exchanged
   f. WebRTC P2P connection established (direct audio, or via TURN relay if NAT blocks P2P)
5. Practitioner clicks "Start Session":
   db.ts startSession() → sets sessions/{bookingId}.status="live", endAt=now+30min
6. Both sides watch sessions/{bookingId} via onSnapshot → timer counts down in sync
7. Chat: sendMessage() → addDoc to sessions/{bookingId}/messages → both sides update live
8. Timer reaches zero → overlay shown
9. Practitioner can offer extension:
   db.ts setOffer() → sessions/{bookingId}.offer = {minutes, amountNGN, status:"pending"}
   Client sees offer overlay → pays via Paystack
   → /verify confirms → confirmExtension() extends endAt
   → Webhook also confirms server-side
10. Practitioner clicks "End Session":
    db.ts completeSession() → status:"complete"
    Both sides see "session ended" overlay
```

### 4.3 Practitioner portal access

```
1. Practitioner navigates to /admin-portal/  ← SECRET URL (not linked in nav)
2. If not signed in → shown sign-in page with Google button
3. Signs in with Google → Firebase Auth → user.uid is checked
4. If uid === NEXT_PUBLIC_PRACTITIONER_UID → role = "practitioner" → full portal shown
5. If uid !== NEXT_PUBLIC_PRACTITIONER_UID → "Access Restricted" screen shown
   → redirected to /book/ for clients
6. Firestore rules independently enforce this server-side
   (even if someone bypasses the UI, Firestore rules block writes)
```

### 4.4 Email notification flow

```
1. Booking confirmed → db.ts sendBookingConfirmationEmail() →
   addDoc(mail/) → Firebase Trigger Email extension →
   Brevo SMTP → patient inbox

2. Cron Worker (every 15 min) → queries bookings where slotStart
   is within next 24h or 1h → calls sendReminderEmail() via
   Firestore Admin REST API → adds to mail/ → Brevo SMTP → patient inbox
```

---

## 5. Role separation — how practitioner vs client is differentiated

This is the most important security concept in the system:

```
                    Google Sign-In (same button, same flow)
                              │
                    Firebase Auth gives every user a UID
                              │
                    ┌─────────▼──────────┐
                    │   uid === PRACTITIONER_UID?   │
                    └─────────┬──────────┘
                   YES ◄──────┴──────► NO
                    │                   │
             role = "practitioner"  role = "client"
                    │                   │
            /admin-portal/          /book/, /session/
            (full admin UI)         (booking + sessions only)
```

**Three layers of protection:**

1. **URL obscurity:** The practitioner portal lives at `/admin-portal/` — this URL is not linked anywhere in the public-facing site (footer, nav). Clients would have to guess it.

2. **Frontend role check:** `auth.tsx` computes the role and `admin-portal/page.tsx` checks it. Non-practitioners see an "Access Restricted" screen immediately.

3. **Firestore Security Rules (backend enforcement):** Even if someone bypasses the frontend, the Firestore rules independently reject all write operations from non-practitioner UIDs on protected collections. This is the real security layer.

> **To change the practitioner account:** Sign in with the new Google account, copy its UID from Firebase console → Authentication, update `NEXT_PUBLIC_PRACTITIONER_UID` in all env vars, update `firestore.rules`, and redeploy.

---

## 6. Environment variables — complete reference

### Frontend (Next.js — all prefixed `NEXT_PUBLIC_`, safe to expose)

| Variable | Example | Description |
|---|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | `AIzaSy…` | Firebase web API key |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | `consultdrfat.firebaseapp.com` | Auth domain |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | `consultdrfat` | Firestore project ID |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | `consultdrfat.appspot.com` | Storage bucket |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | `123456789` | FCM sender ID |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | `1:123…:web:abc…` | Firebase app ID |
| `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY` | `pk_live_…` | Paystack public key (safe in frontend) |
| `NEXT_PUBLIC_API_BASE` | `https://…workers.dev` | Cloudflare Worker base URL |
| `NEXT_PUBLIC_PRACTITIONER_UID` | `abc123xyz` | Firebase UID of the practitioner |

### Worker (Cloudflare — set via `wrangler secret put`, never committed)

| Secret | Description |
|---|---|
| `PAYSTACK_SECRET_KEY` | Paystack secret key (`sk_live_…`) |
| `CF_TURN_KEY_ID` | Cloudflare Realtime TURN key ID |
| `CF_TURN_API_TOKEN` | Cloudflare Realtime TURN API token |
| `FIREBASE_PROJECT_ID` | Firebase project ID (also safe as wrangler.toml var) |
| `FIREBASE_SA_JSON` | Full Firebase service account JSON (for Admin REST API) |

### GitHub Actions (stored in repo Secrets)

All `NEXT_PUBLIC_*` frontend vars + `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`.

---

## 7. Paystack integration — complete guide

### How to connect Paystack

1. **Create account:** [paystack.com](https://paystack.com) → sign up as a Nigerian business.
2. **Get keys:** Dashboard → Settings → API Keys & Webhooks.
   - **Public key** (`pk_test_…` / `pk_live_…`) → `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY`
   - **Secret key** (`sk_test_…` / `sk_live_…`) → Cloudflare Worker secret `PAYSTACK_SECRET_KEY`
3. **Set webhook URL:** Settings → API Keys & Webhooks → Webhook URL:
   `https://<your-worker>.workers.dev/webhook`
4. **Enable payment channels:** Settings → Preferences → Payment channels:
   - ✅ Card
   - ✅ Bank (enables OPay, PalmPay, Kuda, bank transfer)
   - ✅ Bank Transfer
5. **Test mode:** Use `pk_test_…` / `sk_test_…` until you're ready to go live.
   Test card: `4084 0840 8408 4081`, expiry any future date, CVV `408`.
6. **Go live:** Switch to `pk_live_…` / `sk_live_…`. Paystack requires KYC for live mode.

### How amounts work in code

```typescript
// src/lib/paystack.ts
// Paystack requires amounts in KOBO (1 NGN = 100 kobo)
amount: settings.priceNGN * 100   // e.g. ₦5,000 → 500000 kobo
```

### Metadata passed to Paystack (used by webhook)

```typescript
metadata: {
  bookingId: booking.id,
  kind: "session",     // or "extension"
  minutes: extensionMin  // for extensions only
}
```

---

## 8. Email notifications — setup guide

### Option A: Firebase Trigger Email Extension + Brevo (recommended, free)

1. **Create Brevo account:** [brevo.com](https://brevo.com) → free plan (300 emails/day).
2. **Get SMTP credentials:** Brevo dashboard → SMTP & API → SMTP → copy Host, Login, SMTP Key.
3. **Install Firebase Extension:**
   - Firebase console → Extensions → Find "Trigger Email from Firestore" → Install
   - SMTP connection URI: `smtps://<login>:<smtp-key>@smtp-relay.brevo.com:465`
   - Email documents collection: `mail`
   - Default FROM address: `ConsultDrFat <noreply@consultdrfat.com>` (must be verified in Brevo)
4. **Verify sender in Brevo:** Senders & IPs → Add a sender → verify the email address.
5. **That's it.** Every time code writes to Firestore `mail/`, the extension sends the email automatically.

The email helper functions in `src/lib/db.ts` (`sendBookingConfirmationEmail`, `sendReminderEmail`) already write to `mail/` in the correct format.

### Option B: Gmail via Base44 OAuth (future option)

The AI_AGENT_INSTRUCTIONS.md notes this as an option if the app were hosted on Base44. Since this app runs on Cloudflare + Firebase, **use Option A (Brevo)**. Gmail OAuth via Base44 would create a dependency on a third platform unnecessarily.

### SMS notifications (future)

To add SMS (e.g. for booking confirmation):
- **Termii** ([termii.com](https://termii.com)) — Nigerian SMS provider, affordable.
- Add a `sendSMS()` function to the Cloudflare Worker using Termii's REST API.
- Trigger it from the `/webhook` endpoint after marking a booking paid.
- You will need the client's phone number — add a phone field to the booking form.

---

## 9. WebRTC voice — how it works

WebRTC is peer-to-peer audio. No audio goes through our servers (except via TURN relay as a last resort).

### Signaling (connection setup)

```
Client A (caller)                 Firestore                 Client B (callee)
     │                               │                            │
     │── create RTCPeerConnection ──►│                            │
     │── generate offer ────────────►│ calls/{id}.offer           │
     │                               │◄─── onSnapshot ────────────│
     │                               │                  generate answer
     │                               │◄── calls/{id}.answer ──────│
     │◄── onSnapshot ────────────────│                            │
     │                               │                            │
     │◄──── ICE candidates ──────────►────── ICE candidates ──────│
     │                               │ (offerCandidates/           │
     │                               │  answerCandidates/)         │
     │                                                             │
     └─────────────── P2P audio (DTLS-SRTP encrypted) ────────────┘
```

### ICE / TURN (NAT traversal)

- **STUN:** Free, provided by Cloudflare (`stun:stun.cloudflare.com:3478`). Resolves public IP for direct P2P.
- **TURN:** Paid relay (Cloudflare Realtime). Used only when direct P2P fails (e.g. symmetric NAT). Cloudflare TURN relays 1,000 GB/month free — audio uses ~1–2 MB/minute, so this is effectively free at this scale.
- Credentials fetched from the Worker `/turn` endpoint (short-lived tokens, not committed to code).

---

## 10. Deployment workflows (GitHub Actions)

### `deploy.yml` — deploys the PWA to Cloudflare Pages

Triggered on: push to `main`

Steps:
1. Checkout code
2. `npm install --legacy-peer-deps`
3. `npm run build` (Next.js static export → `out/`)
4. Deploy `out/` to Cloudflare Pages using `cloudflare/pages-action`

Required GitHub secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, all `NEXT_PUBLIC_*` vars.

### `deploy-worker.yml` — deploys the Cloudflare Worker

Triggered on: push to `main` (or manually)

Steps:
1. Checkout code
2. `cd workers/api && npm install`
3. `wrangler deploy` using the Cloudflare API token

> **Note:** Worker secrets (`PAYSTACK_SECRET_KEY`, etc.) are NOT deployed by CI. Set them manually once via `wrangler secret put <NAME>` or in the Cloudflare dashboard → Workers → your worker → Settings → Variables.

### `deploy-github-pages.yml` — optional GitHub Pages deployment

Only used as a demo/staging environment. Uses `basePath=/Consultdrfat` (repo name). Not the production deployment.

---

## 11. Progressive Web App (PWA) details

### What makes it a PWA

- **`public/manifest.webmanifest`** — defines app name, icons, theme color, display mode (`standalone`).
- **`public/sw.js`** — service worker for offline support (caches the app shell).
- **`ServiceWorkerRegister.tsx`** — registers the service worker in the browser.
- **`layout.tsx`** — sets viewport meta, theme color, apple-web-app-capable meta.

### Installing

On Chrome/Edge (desktop or Android): Address bar → install icon → Add to home screen.
On iOS Safari: Share → Add to Home Screen.

### PWA checklist

- [ ] Replace `public/icons/icon-192.png` and `icon-512.png` with real branded icons.
- [ ] Update `public/manifest.webmanifest` with the correct `name`, `short_name`, and `background_color`.
- [ ] Verify the service worker is registered in DevTools → Application → Service Workers.

---

## 12. Outstanding TODOs (what still needs completing)

### Must-do before launch

| # | Task | Where | How |
|---|---|---|---|
| 1 | **Fill in Firebase env vars** | `.env.local` + GitHub secrets + Cloudflare Pages env | Firebase console → Project settings → Web app config |
| 2 | **Set practitioner UID** | `NEXT_PUBLIC_PRACTITIONER_UID` + `firestore.rules` | Sign in once with practitioner Google account → copy UID from Firebase Auth console |
| 3 | **Deploy Firestore rules + indexes** | `firestore.rules`, `firestore.indexes.json` | `firebase deploy --only firestore:rules,firestore:indexes` |
| 4 | **Add Paystack keys** | Worker secret + frontend env | Paystack dashboard → API Keys |
| 5 | **Deploy Cloudflare Worker** | `workers/api/` | `cd workers/api && wrangler deploy` + set secrets |
| 6 | **Set Worker ALLOW_ORIGIN** | `wrangler.toml` | Change to your actual Pages URL |
| 7 | **Install Firebase Trigger Email** | Firebase console | Extensions → Trigger Email + Brevo SMTP |
| 8 | **Set NEXT_PUBLIC_API_BASE** | env vars | Set to deployed Worker URL |
| 9 | **Replace placeholder icons** | `public/icons/` | Generate 192×192 and 512×512 PNG |
| 10 | **Update Dr. Fat's real info** | `src/app/page.tsx` → Meet the Doctor section | Replace dummy bio/credentials |

### Nice-to-have before launch

| # | Task | Notes |
|---|---|---|
| 11 | **Add Cloudflare TURN keys** | CF dashboard → Realtime → TURN → Create key |
| 12 | **Set up reminder cron Worker** | Add `[triggers] crons = ["*/15 * * * *"]` to wrangler.toml; query bookings and queue reminder emails |
| 13 | **Seed practice settings** | Visit `/admin-portal/` → Settings tab → set price, session length, availability |
| 14 | **Add Firebase SA JSON to Worker** | Needed for webhook → Firestore write; generate from Firebase console → Project settings → Service Accounts |
| 15 | **SMS notifications via Termii** | Add phone number field to booking, call Termii API from Worker |
| 16 | **Go live with Paystack** | Complete KYC on Paystack dashboard → switch to live keys |

---

## 13. Security model summary

| Threat | Mitigation |
|---|---|
| Unauthorised practitioner access | UID check in frontend + Firestore rules enforce it server-side |
| Practitioner portal discoverability | `/admin-portal/` not linked in public nav/footer |
| Payment fraud | Paystack handles card data (PCI-DSS L1); secret key only in Worker; HMAC webhook verification |
| Data leakage between clients | Firestore rules scope client access to their own bookings/sessions only |
| Voice eavesdropping | WebRTC DTLS-SRTP encryption; TURN relay only sees ciphertext |
| Secrets in codebase | All secrets in env vars / wrangler secrets / GitHub secrets; `.gitignore` covers `.env.local` |
| NDPR health data compliance | Health info scoped per-user; not shared with analytics/ads; retention limits in Privacy Policy |

---

## 14. Local development setup

```bash
# 1. Clone
git clone https://github.com/Osam-74/Consultdrfat.git
cd Consultdrfat

# 2. Install
npm install --legacy-peer-deps

# 3. Configure
cp .env.example .env.local
# Fill in all NEXT_PUBLIC_* values from Firebase console + Paystack + Worker URL

# 4. Run dev server
npm run dev
# → http://localhost:3000

# 5. Build (test static export)
npm run build
# → ./out/ directory

# 6. Deploy Worker locally (optional)
cd workers/api
npm install
wrangler dev  # local Worker at http://localhost:8787
```

---

## 15. Contact & ownership

- **GitHub:** [github.com/Osam-74/Consultdrfat](https://github.com/Osam-74/Consultdrfat)
- **Platform:** Cloudflare Pages + Workers + Firebase + Paystack
- **Stack:** Next.js 14 · TypeScript · Firebase 10 · Cloudflare Workers (Deno-compatible TS)
- **Nigeria-specific:** Paystack (NGN payments) · Brevo or Termii for comms · MDCN/NDPR compliance

---

*Last updated: June 2026. Keep this document current as the system evolves.*
