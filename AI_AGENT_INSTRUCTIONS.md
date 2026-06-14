# AI Agent Build & Deploy Instructions

This document tells an AI coding agent (base44, Claude Code, Cursor, Codex, etc.) — or a
human — **everything** needed to finish, configure, deploy, and commit this project. The
codebase in this repository is a working scaffold: it builds, the booking/session/WebRTC
flows are implemented, and what remains is wiring credentials and a few server tasks marked
**[AGENT TASK]**.

> **About base44:** base44 is an AI app builder. Useful caveat — its GitHub export covers
> the **frontend only**; the backend stays on base44’s infrastructure. Because this project
> must use **Firebase + Cloudflare** for the backend, use base44 (or any agent) as the
> **code generator + Git committer**, and keep Firestore/Cloudflare as the real backend.
> Do **not** rely on base44 to host the backend. The base44/agent prompts are in §9.

---

## 0. Outcome / definition of done

A client can: install the PWA → sign in → book a slot within 14 days → pay in naira →
join a room with working voice + chat + shared countdown → accept a paid extension. The
practitioner can: manage availability/price → see bookings → run the room → offer/confirm
extensions with the queue guard. Code is committed and pushed to GitHub; the app is live on
Cloudflare Pages; the Worker is deployed; Firestore rules are published.

---

## 1. Prerequisites (create these accounts)

- **GitHub** account + empty repo (private recommended).
- **Firebase** project (Spark/free plan is fine to start).
- **Cloudflare** account (Pages + Workers + Realtime TURN).
- **Paystack** account (Nigerian business; start in test mode).
- **Brevo** account (free email, 300/day) — for notifications.
- Local tools: Node 18+, `npm`, `git`, and `npm i -g wrangler firebase-tools`.

---

## 2. Get the code building locally

```bash
git init && git add . && git commit -m "chore: import MindBridge scaffold"
npm install
cp .env.example .env.local
npm run build      # must succeed and produce ./out
```

---

## 3. Firebase setup

1. Firebase console → **Add project**.
2. **Build → Firestore Database → Create database** (production mode, region `eur3` or
   nearest).
3. **Build → Authentication → Get started → Sign-in method → Google → Enable.**
4. **Project settings → General →** register a Web app; copy the config values into
   `.env.local` (`NEXT_PUBLIC_FIREBASE_*`).
5. Deploy rules and indexes:
   ```bash
   firebase login
   firebase use --add            # pick your project, alias "default"
   firebase deploy --only firestore:rules,firestore:indexes
   ```
6. **Get the practitioner UID:** run the app (`npm run dev`), go to `/admin`, sign in with
   the **practitioner’s** Google account, then in Firebase console → Authentication copy
   that user’s **UID**. Put it in:
   - `.env.local` → `NEXT_PUBLIC_PRACTITIONER_UID`
   - `firestore.rules` → replace `REPLACE_WITH_PRACTITIONER_UID`, then re-deploy rules.
7. **[AGENT TASK] Seed settings:** in `/admin → Settings`, set price (₦), session length
   (30), buffer (10), window (14); add weekly availability under **Availability**.

---

## 4. Email notifications (free, via Firebase + Brevo)

1. Create a **Brevo** account → **SMTP & API → SMTP** → note host, port `587`, login, and
   SMTP key.
2. Firebase console → **Extensions → Trigger Email from Firestore → Install.**
   - SMTP connection URI: `smtps://<login>:<smtp-key>@smtp-relay.brevo.com:465`
   - Email documents collection: `mail`
   - Default FROM: your verified Brevo sender.
3. **[AGENT TASK]** Enqueue mail by writing to Firestore `mail/`:
   ```ts
   await addDoc(collection(db, "mail"), {
     to: booking.clientEmail,
     message: { subject: "Your session is confirmed", html: "<p>…</p>" },
   });
   ```
   Add this on booking-paid and (via the cron Worker, §7) for reminders.

> base44/Gmail OAuth email is an option **only if you host on base44**. Since this app is on
> Cloudflare + Firebase, use the Brevo + Trigger Email path above (fully free, serverless).

---

## 5. Cloudflare TURN (voice NAT traversal)

1. Cloudflare dashboard → **Realtime → TURN → Create** → copy the **TURN Key ID** and
   **API Token**.
2. These become Worker secrets in §6. STUN is free; TURN’s first 1,000 GB/month is free
   (audio uses a tiny fraction of that).

---

## 6. Deploy the Cloudflare Worker (payments + TURN creds)

```bash
cd workers/api
npm install
# set secrets (never commit these):
wrangler secret put PAYSTACK_SECRET_KEY     # sk_test_… then sk_live_…
wrangler secret put CF_TURN_KEY_ID
wrangler secret put CF_TURN_API_TOKEN
# set ALLOW_ORIGIN in wrangler.toml to your Pages URL, then:
wrangler deploy
```

Copy the deployed URL (e.g. `https://mindbridge-api.<sub>.workers.dev`) into the PWA env as
`NEXT_PUBLIC_API_BASE`.

**[AGENT TASK] — finish the webhook → Firestore link.** In `workers/api/src/index.ts` the
`/webhook` route verifies the Paystack HMAC signature but does not yet write to Firestore.
Implement: on `charge.success`, read `event.data.reference` and
`event.data.metadata.bookingId`, then mark the booking/extension paid using the **Firebase
Admin REST API** (mint a Google OAuth token from a service-account JWT inside the Worker, or
call a small Firebase Cloud Function). This guarantees payment is recorded even if the
client closes the tab.

---

## 7. Paystack configuration

1. Paystack dashboard → **Settings → API Keys & Webhooks**: copy the **public** key into
   the PWA env; the **secret** key is already a Worker secret.
2. **Webhook URL:** `https://<worker>/webhook`.
3. **Settings → Preferences → Payment channels:** enable **Bank** (this is what shows
   *Pay with OPay* / PalmPay / Kuda) and **Card** and **Bank transfer**.
4. Amounts are sent in **kobo** (the code already multiplies ₦ × 100).

**[AGENT TASK] — reminders cron (optional but recommended).** Add a scheduled Cloudflare
Worker (`[triggers] crons = ["*/15 * * * *"]`) that queries upcoming bookings and enqueues
24h / 1h reminder emails into the `mail/` collection.

---

## 8. Deploy the PWA to Cloudflare Pages

**Option A — Git integration (recommended):**
1. Push to GitHub (§10).
2. Cloudflare → **Workers & Pages → Create → Pages → Connect to Git** → pick the repo.
3. Build command `npm run build`; output directory `out`.
4. Add all `NEXT_PUBLIC_*` env vars in the Pages project settings.

**Option B — Direct upload:** `npm run build` then `wrangler pages deploy out`.

**Verify the PWA:** open the site in Chrome → DevTools → Application → it should show the
manifest and a registered service worker, and offer **Install**. Generate proper icons if
you rebrand (replace `public/icons/icon-192.png` / `icon-512.png`).

---

## 9. Acceptance checklist

- [ ] `npm run build` succeeds; `out/` deploys to Pages.
- [ ] Manifest + service worker detected; app is installable.
- [ ] Google sign-in works; practitioner UID resolves to the admin.
- [ ] Admin can set availability, price, and see bookings.
- [ ] Booking shows only the next 14 days; day 15+ is locked.
- [ ] Paystack test payment (card + bank/OPay) completes; booking marked paid.
- [ ] Two devices join a session: timer is identical, chat syncs, **voice connects**.
- [ ] Extension flow: offer → client pays → practitioner confirms → timer extends.
- [ ] Queue-guard warning shows when a next client is set.
- [ ] Confirmation/reminder emails arrive (Brevo).
- [ ] Webhook marks payments paid server-side.

---

## 10. Commit & push to GitHub

```bash
git add -A
git commit -m "feat: complete MindBridge MVP (booking, sessions, WebRTC, Paystack, PWA)"
git branch -M main
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

For subsequent work, commit in small steps:
```bash
git add -A && git commit -m "feat(webhook): mark booking paid via Admin REST" && git push
```

---

## 11. Prompts for the AI agent (base44 / Claude Code / Cursor)

Paste these in order. Each is self-contained; wait for the agent to finish and verify
before the next. (If using base44 specifically, first run `npx skills add base44/skills`.)

**Prompt 1 — Orient & build**
```
You are completing a Next.js (App Router, TypeScript) static-export PWA for paid online
psychology sessions in Nigeria. Backend is Firebase Firestore + Cloudflare Workers; payments
are Paystack (NGN); voice is WebRTC with Firestore signaling and Cloudflare TURN. Read
README.md and AI_AGENT_INSTRUCTIONS.md fully. Run `npm install` and `npm run build`, and
report that the build passes and what env vars are still missing. Do not change the
architecture.
```

**Prompt 2 — Finish the Paystack webhook → Firestore**
```
Implement the [AGENT TASK] in workers/api/src/index.ts: on a verified `charge.success`
webhook, mark the matching booking (metadata.bookingId) or extension as paid in Firestore
using the Firebase Admin REST API. Mint a Google access token inside the Worker from a
service-account JWT stored as the secret FIREBASE_SA_JSON. Add the secret name to the docs.
Keep signature verification intact. Build and show me the diff.
```

**Prompt 3 — Email confirmations & reminders**
```
Wire booking-paid confirmation emails by writing to the Firestore `mail/` collection
(Firebase Trigger Email extension is installed). Then add a scheduled Cloudflare Worker
(cron every 15 min) that enqueues 24h and 1h reminder emails for upcoming paid bookings.
Use clear, warm copy. Build and show diffs.
```

**Prompt 4 — Harden & polish**
```
Add: loading/empty/error states across book, admin, and session pages; an explicit
Africa/Lagos timezone for slot generation; a privacy-policy page and a booking consent
checkbox; and basic Playwright tests for the booking flow and the session timer/extension.
Keep the visual design unchanged. Build must stay green.
```

**Prompt 5 — Commit & push**
```
Stage all changes, write conventional-commit messages grouped by feature, commit, set the
remote to <REPO_URL>, push to main, and confirm the push succeeded. Then summarize
everything still requiring my manual action (keys, Firebase extension install, Cloudflare
TURN key, Paystack webhook URL, Pages env vars).
```

> Replace `<REPO_URL>` with your GitHub repository URL. Provide the agent with your env
> values via its secret store, never in plain prompts or committed files.
