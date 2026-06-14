# MindBridge *(placeholder name)* — Online Psychology Sessions PWA

A secure, installable **Progressive Web App** for a single psychology practitioner to
sell and run **paid online sessions** in Nigeria. Clients book a slot within a rolling
two-week window, pay in **naira** (Paystack), and join a private room with **voice + chat**
and a **shared countdown**. When more time is needed, the practitioner offers a **paid
extension**, the client pays, the practitioner confirms, and the timer extends — with a
**queue guard** that warns before overrunning the next client.

> **Name:** “MindBridge” is a placeholder used throughout. Replace it (and the icons) with
> your final brand when you decide.

---

## 1. What it does

**Client side**
- Browse open times for the next 14 days (the window rolls forward daily).
- Sign in with Google, pay per session in naira (card, bank transfer, OPay, PalmPay).
- Join a private room: voice (WebRTC), live chat, and a countdown both sides can see.
- Accept and pay for extra time if offered.

**Practitioner (admin) side**
- Set weekly availability, one-off days off / extra hours, price, session length, buffer,
  and the booking-window length.
- See all bookings; open the room for each.
- Run the session: start it, watch the shared timer, message, talk by voice.
- Offer paid extensions, see the queue-guard warning, confirm payment, and resume.

---

## 2. Architecture (per the chosen stack)

| Concern | Choice | Notes |
|---|---|---|
| App | **Next.js (App Router, TypeScript)**, static export | Installable PWA |
| Hosting | **Cloudflare Pages** | Static `out/` upload or Git integration |
| Realtime + data | **Firebase Firestore** | Single source of truth: sessions, bookings, chat, offers, availability |
| Auth | **Firebase Auth (Google)** | One practitioner UID = admin; everyone else = client |
| Voice | **WebRTC**, peer-to-peer | **Firestore is the signaling channel**; no signaling server |
| ICE (NAT traversal) | **Cloudflare STUN/TURN** | STUN free; TURN free for the first 1,000 GB/month |
| Payments | **Paystack Inline** (NGN) | Card + bank transfer (OPay/PalmPay under the bank channel) |
| Server logic | **Cloudflare Worker** | Paystack `/verify` + `/webhook`, and `/turn` credentials |
| Email/alerts | **Firebase “Trigger Email” extension + Brevo SMTP** (free) | Writes to a `mail/` collection → sent automatically |

**Why this shape:** Firestore’s realtime listeners keep the practitioner’s and client’s
timers, chat, and offer state perfectly in sync without a custom server. The only things
that genuinely need a server are Paystack secret-key calls and minting TURN credentials —
both small Cloudflare Worker endpoints.

```
Browser (PWA)  ──Firestore listeners──►  Firestore  ◄──Firestore listeners──  Browser (PWA)
     │                                                                              │
     │  WebRTC audio (P2P, encrypted)  ◄───────────────────────────────────────────┘
     │
     └─►  Cloudflare Worker  ──►  Paystack API (verify)        Cloudflare TURN (ICE creds)
```

---

## 3. Run it locally

**Prerequisites:** Node 18+, a Firebase project, a Paystack account (test keys), and
(optionally) a Cloudflare account for TURN + the Worker.

```bash
npm install
cp .env.example .env.local      # fill in the values (see §4)
npm run dev                     # http://localhost:3000
```

> Voice and data need real Firebase config. Without it the UI renders but booking,
> sessions, and chat won’t persist.

Build the static PWA:

```bash
npm run build                   # outputs ./out  (deploy this to Cloudflare Pages)
```

---

## 4. Configuration

Copy `.env.example` → `.env.local` and fill in:

```
NEXT_PUBLIC_FIREBASE_API_KEY=…
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=…
NEXT_PUBLIC_FIREBASE_PROJECT_ID=…
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=…
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=…
NEXT_PUBLIC_FIREBASE_APP_ID=…
NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY=pk_test_…
NEXT_PUBLIC_API_BASE=https://mindbridge-api.<subdomain>.workers.dev
NEXT_PUBLIC_PRACTITIONER_UID=<the practitioner's Firebase Auth UID>
```

The **practitioner UID** is how the app and the security rules know who the admin is. Sign
in once with the practitioner’s Google account, copy the UID from Firebase Auth, and set it
both here and in `firestore.rules`.

---

## 5. Data model (Firestore)

| Path | Purpose |
|---|---|
| `settings/practice` | price (₦), session length, buffer, booking window (14), name, timezone |
| `availabilityTemplates/{id}` | weekly hours: `{ weekday, start, end, active }` |
| `availabilityExceptions/{id}` | days off / extra hours: `{ date, type, start?, end? }` |
| `bookings/{id}` | `{ clientId, slotStart, slotEnd, status, topic, amountNGN, paystackRef }` |
| `sessions/{bookingId}` | `{ status, endAt, durationMin, offer, nextClientAt }` (authoritative timer) |
| `sessions/{bookingId}/messages/{id}` | chat `{ from, text, t }` |
| `calls/{bookingId}` + candidate subcollections | WebRTC signaling (offer/answer/ICE) |
| `mail/{id}` | outbound email queue for the Trigger Email extension |

Security rules are in `firestore.rules` (replace `REPLACE_WITH_PRACTITIONER_UID`).

---

## 6. Project structure

```
src/
  lib/
    firebase.ts     init + env
    types.ts        shared types & defaults
    slots.ts        14-day slot generation (the booking rule)
    db.ts           all Firestore reads/writes + realtime listeners
    webrtc.ts       voice: peer connection + Firestore signaling + Cloudflare ICE
    paystack.ts     Naira checkout (dynamic import, browser-only)
    auth.tsx        Google auth context + role
  app/
    page.tsx        landing
    book/page.tsx   booking calendar (Firestore + 14-day rule + Paystack)
    admin/page.tsx  availability, bookings, settings
    session/page.tsx + components/SessionRoom.tsx   the live room
  components/ServiceWorkerRegister.tsx
public/  manifest.webmanifest, sw.js, icons/
workers/api/  Cloudflare Worker (verify, webhook, turn) + wrangler.toml
firestore.rules, firestore.indexes.json
```

---

## 7. Deployment (summary)

1. **Firebase:** create project → enable Firestore + Google Auth → deploy `firestore.rules`
   and `firestore.indexes.json` → install the **Trigger Email** extension (Brevo SMTP).
2. **Cloudflare TURN:** create a Realtime TURN key → note the key id + token.
3. **Worker:** `cd workers/api`, set secrets (`PAYSTACK_SECRET_KEY`, `CF_TURN_KEY_ID`,
   `CF_TURN_API_TOKEN`), set `ALLOW_ORIGIN`, then `wrangler deploy`.
4. **Paystack:** add your public key to the PWA env; point the webhook to
   `https://<worker>/webhook`; enable the **Bank** channel (for OPay/PalmPay).
5. **Pages:** `npm run build` → deploy `out/` to Cloudflare Pages (set the same
   `NEXT_PUBLIC_*` env vars).

Full, click-by-click steps and the GitHub push commands are in
**`AI_AGENT_INSTRUCTIONS.md`**.

---

## 8. Known TODOs (intentionally left for finishing)

- **Webhook → Firestore:** the Worker verifies the signature; wire it to mark the booking
  paid via the Firebase Admin REST API (so payment is confirmed even if the client closes
  the tab).
- **Reminders:** a scheduled Cloudflare Cron Worker to send 24h / 1h email reminders.
- **Timezone:** slots use the browser’s local time (fine for Nigeria-only); switch to an
  explicit `Africa/Lagos` library if you ever serve other zones.
- **Compliance:** add a privacy policy + consent, and confirm NDPR (Nigeria Data Protection)
  obligations for health data before launch.

---

## 9. Security & privacy notes

- Card data never touches the app or the Worker — Paystack handles it (PCI-DSS).
- WebRTC media is encrypted end-to-end (DTLS); Cloudflare TURN only relays ciphertext.
- Firestore rules restrict each client to their own bookings/sessions; only the
  practitioner UID can manage availability and all bookings.
- The Paystack **secret** key lives only in the Worker, never in the PWA.

This is a development blueprint, not legal advice — validate health-data and licensing
obligations with a professional before going live.
