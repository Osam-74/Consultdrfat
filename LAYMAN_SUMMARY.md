# MindBridge — In Plain Words

*A simple explanation of what the app is and how it works, for anyone — no tech background needed. (“MindBridge” is a placeholder name; the real name will be chosen later.)*

---

## What is it?

MindBridge is a small, private online clinic that lives on your phone or computer. A single
therapist (the **practitioner**) offers paid one-to-one sessions. A person who needs to talk
(the **client**) books a time, pays, and meets the therapist online — by **voice** and
**typed chat** — in a private room with a **clock both people can see**.

Think of it like booking a video-less, calm phone appointment, but everything (booking,
paying, talking, and timing) happens neatly in one app. It can be **installed** like a normal
app, even though it’s a website.

---

## The client’s journey (the person seeking help)

1. **Open the app and tap “Book a session.”** They sign in quickly with their Google
   account so everything stays private and tied to them.
2. **Pick a time.** They see only the therapist’s open times for the **next two weeks**.
   Nothing further ahead is shown — this keeps the therapist’s diary manageable.
3. **Pay in naira.** They pay for the session using whatever they’re comfortable with —
   **bank card, bank transfer, OPay, or PalmPay** — through Paystack, a trusted Nigerian
   payment service. Card details are handled by Paystack, never stored by the app.
4. **Join the room at the appointed time.** They tap to join, allow their microphone, and
   they’re in a private space with the therapist. They can **talk**, **type**, and **see the
   countdown** ticking down.
5. **If they need more time.** Near the end, the therapist may offer extra minutes. The
   client sees a clear message — “15 more minutes for ₦X?” — and can **accept and pay**. Once
   the therapist confirms, the clock simply continues. If they’d rather stop, they just
   decline.

**What the client can expect:** a calm, uncluttered screen; clear prices before paying; a
shared timer so no one feels rushed unexpectedly; and privacy — sessions are **not recorded**.

---

## The practitioner’s journey (the therapist / admin)

1. **Set up the diary once.** In a private admin area, the therapist sets their weekly hours
   (e.g. “Tuesdays and Thursdays, 9am–1pm”), marks any days off, and sets the **price** and
   **session length** (e.g. 30 minutes). The app turns this into bookable slots automatically.
2. **Stay in the background.** Clients book and pay on their own. The therapist just sees the
   bookings appear in a tidy list.
3. **Run the session.** At the appointed time, the therapist opens the room, lets the client
   in, and they talk. The same countdown shows on both screens.
4. **Offer more time — safely.** If the conversation needs longer, the therapist offers extra
   minutes. Before sending the offer, the app **warns them if another client is waiting**
   soon, so no one gets bumped by accident. The client pays, the therapist confirms, and the
   session continues.
5. **End and move on.** When finished, the therapist closes the room. The next appointment is
   already waiting in the diary.

**What the practitioner can expect:** full control of their time, no double-bookings, money
collected up front, and a gentle “next client is waiting” safeguard built in.

---

## How the “magic” works (briefly, in everyday terms)

- **The shared clock.** Instead of each phone running its own timer (which would drift apart),
  there’s **one official clock kept centrally**. Both screens read from it, so they always
  agree — even if someone’s connection hiccups. Adding paid time just pushes that one clock
  forward.
- **The voice call.** The two phones talk **directly to each other**, with the audio
  scrambled so no one in between can listen. A reliable “relay” service (Cloudflare) helps the
  call connect smoothly even on mobile networks.
- **Booking only two weeks out.** This is a deliberate rule: the calendar only ever shows the
  next 14 days, rolling forward each day. It keeps the therapist’s schedule from filling up
  months ahead.
- **Payments.** Handled by **Paystack** in naira. The app never sees card numbers. Every
  payment is double-checked on a secure server before access is granted.
- **Notifications.** Booking confirmations and reminders are emailed automatically, for free.

---

## What it costs to run

The pieces were chosen to be **free or near-free** at this scale: the database and sign-in
(Firebase), the hosting and call-relay (Cloudflare), and the emails (Brevo) all have generous
free tiers. The only money that moves is **clients paying the therapist** through Paystack,
which takes a small standard fee per transaction.

---

## A note on privacy and trust

Because this involves people’s mental health, privacy matters a great deal. Sessions aren’t
recorded; conversations are encrypted; each client can only ever see their own bookings; and
only the therapist can manage the diary. Before going fully live, the practice should confirm
it meets Nigeria’s data-protection rules for health information — a normal step for any
clinic, online or not.

---

*In one sentence: **MindBridge lets a therapist quietly sell and run private, timed online
sessions — booked and paid for in naira — while a shared clock and a paid “need more time?”
option keep both people relaxed and in control.***
