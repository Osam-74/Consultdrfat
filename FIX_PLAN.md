# ConsultDrFat Fix Plan — June 2026

## FILES TO EDIT
- `src/components/SessionRoom.tsx` — session UI, chat, leave/end, voice icons
- `src/app/p-dfta/page.tsx` — practitioner dashboard: stats, bookings, settings, discount, waiting room, availability, tab scrolling
- `src/app/book/page.tsx` — booking flow: payment text, slot greying, post-booking guide button
- `src/app/page.tsx` — homepage: How It Works, Testimonials section, FAQ section
- `src/app/globals.css` — global styles across all
- `src/lib/db.ts` — createBooking double-booking guard
- `src/components/SignInForm.tsx` — Forgot password placement
- NEW: `src/app/session-guide/page.tsx` — Session Room Guide page

---

## PLAN (in order of files)

### 1. SessionRoom.tsx
- [ ] 1a. Leave button fix — client leave button is not working
- [ ] 1b. Chat alignment — mine=right, theirs=left (both sides)
- [ ] 1c. Chat bubble colours — mine teal-ish, theirs navy-ish, different shades
- [ ] 1d. Tagging/swipe — right-side (mine) swipe LEFT to tag, left-side (theirs) swipe RIGHT to tag
- [ ] 1e. "Client has Rejoined" on first entry — fix to show a neutral join message not "Rejoined"
- [ ] 1f. Remove headphone icon, remove "Connected" pulsing status
- [ ] 1g. Reposition Call + Video icons to RIGHT side (where pulsing icon was)
- [ ] 1h. Remove "Your Practitioner" / "Your Client" text; keep only avatar circle + online dot
- [ ] 1i. Reposition Leave/End Session button OUTSIDE the card, to the RIGHT of "Your Session" heading

### 2. p-dfta/page.tsx (Practitioner Dashboard)
- [ ] 2a. Stats grid: "Completed" → "Completed Sessions"
- [ ] 2b. Upcoming sessions count — future bookings only (slotStart > now), ignore past/missed
- [ ] 2c. Consultation hours — sum durationMin of all completed bookings ÷ 60 → show as hours
- [ ] 2d. Booking labels — status-based: Confirmed/Completed/No-Show/Cancelled/Rescheduled
- [ ] 2e. Client list arrow character `\u2192` — remove it
- [ ] 2f. Discount section — compacted layout, no "DRFAT" prefix, random 6-char alphanumeric, remove placeholder sample
- [ ] 2g. Discount options — 25%, 50%, 75%, 100% only (compact row)
- [ ] 2h. Tab bar (Availability, Bookings, etc.) — horizontal scrollable
- [ ] 2i. Waiting room icon — pulsing animation when someone is in waiting room
- [ ] 2j. Waiting room bell icon — dangling animation on ping, lasts 5 min
- [ ] 2k. Toast notification on ping — compact it
- [ ] 2l. Waiting room logic — show session 2hrs before slot start; ping keeps client in WR with "Ping" label
- [ ] 2m. Availability section instruction — replace "How scheduling works..." with one positive sentence
- [ ] 2n. Settings section — fix saving (changes not reflecting)
- [ ] 2o. Double booking — booked time slots must be greyed out so another client cannot book them

### 3. book/page.tsx
- [ ] 3a. Payment text — remove "OPay · PalmPay via Paystack", replace with "💳 Card · Bank Transfer · Secure · Auto fulfilment"
- [ ] 3b. Completed session booking preview — show total session duration
- [ ] 3c. Post-booking button — replace "Go to session room" with "Get Familiar with the Session Room" → leads to /session-guide

### 4. page.tsx (Homepage)
- [ ] 4a. "How It Works" — two-column layout: subtle number on left, content on right, left-aligned
- [ ] 4b. Testimonials section — before the CTA card, heading "Voices From The Consultation Room" (or similar), 6 teal-gradient cards with stars, quote, avatar, Nigerian names/locations, auto-sliding carousel with stretch capsule indicator
- [ ] 4c. FAQ section — subheading "FAQ" above "Questions, Answered", 6 Q&As, border only on hover/active

### 5. SignInForm.tsx
- [ ] 5a. Forgot Password — move directly under password field, left-aligned

### 6. NEW: session-guide/page.tsx
- [ ] 6a. Session Guide page — full instructions page linked from post-booking success

### 7. globals.css
- [ ] 7a. Chat bubble alignment styles (mine=right, theirs=left)
- [ ] 7b. Testimonial carousel styles
- [ ] 7c. FAQ accordion styles
- [ ] 7d. Tab scrollable bar styles
- [ ] 7e. Compact discount section styles

### 8. db.ts
- [ ] 8a. Double-booking guard in createBooking

### 9. Icons audit
- [ ] 9a. Replace all non-flat/3D emoji icons in dashboard stats, session room with flat SVG icons (exception: Bell, Calendar)

---

## SECRETS GUIDE (for user)
At the end: explain where to find Vercel env vars and add them to GitHub Secrets.
