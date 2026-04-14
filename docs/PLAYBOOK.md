# m∀thl∃ss.lean — Operations Playbook

Target date: **Q3 or Q4 2026** (call it Sept–Nov). Today: **2026-04-14**. 5–7 months of runway — comfortable, but don't let it rot.

This is the punch list of everything between the current static landing page and a running conference. Ordered roughly by dependency, not by urgency.

---

## 0. Guiding constraints

- Light-touch ops, no sponsors, pay-what-you-can.
- Single organizer (Quinn). Every system must be runnable solo.
- Event lives in a Discord server; the website is marketing + forms + schedule.
- Curators gate submissions; curators are themselves an application.
- Keep infra cheap: Vercel + a managed Postgres (Neon via Marketplace) + Stripe + Discord bot. No custom servers.

---

## 1. Information architecture (pages/routes to add)

Current: one-page MDX at `/`. Add:

- `/` — landing (exists). Add CTA buttons → `/submit`, `/curate`, `/register`.
- `/tracks` — expanded descriptions of the five tracks (currently only in `content.mdx`).
- `/curators` — public list of accepted curators w/ bios + track affiliation. Renders from DB.
- `/curate` — application form for prospective curators.
- `/submit` — submission form for papers/repos/breakout sessions (gated: open only once ≥1 curator is seated per track).
- `/register` — pay-what-you-can checkout → Stripe → Discord invite.
- `/schedule` — published ~2 weeks before event. Static until then.
- `/coc` — code of conduct (required for any conference; reviewers & Discord members must accept).
- `/faq` — refunds, accessibility, recording policy, timezone.
- `/admin` — protected dashboard (auth-gated) for curator review queue, registrants, Discord invite status.

---

## 2. Data model (Neon Postgres via Vercel Marketplace)

Minimal schema. Use Drizzle or Prisma — pick one and don't re-litigate.

```
curators           (id, name, email, bio, track, affiliation, links_json, status, applied_at, decided_at)
curator_apps       (id, name, email, bio, tracks[], why, links_json, submitted_at, status, notes)
submissions        (id, kind[paper|repo|breakout], title, abstract, authors_json,
                    track, links_json, submitter_email, submitted_at, status,
                    decisions_json, scheduled_slot_id)
submission_reviews (id, submission_id, curator_id, score, comment, created_at)
registrants       (id, email, name, amount_paid_cents, stripe_session_id,
                    discord_invite_code, discord_invite_issued_at,
                    discord_joined_user_id, coc_accepted_at, created_at)
schedule_slots    (id, start_at, end_at, room, submission_id, notes)
audit_log         (id, actor, action, target, meta_json, at)
```

All tables: `created_at`, `updated_at`. Soft-delete via `deleted_at` only if needed.

---

## 3. Forms

### 3.1 Curator application (`/curate`)

Fields:
- Name, email (verify via magic link before submit? no — just reCAPTCHA/BotID).
- Short bio (≤500 chars).
- Relevant links (GitHub, Zulip handle, personal site, papers) — repeatable.
- Preferred track(s) — multi-select from the 5.
- "Why you?" (≤1000 chars).
- Availability: confirm ~4h total review time across May–June 2026.
- COC acknowledgement checkbox.

Backend:
- POST → server action → insert `curator_apps` row → email Quinn.
- Rate limit by IP (Vercel BotID + a simple per-IP counter in runtime cache).
- Admin page shows queue with accept/reject buttons.

### 3.2 Content submission (`/submit`)

Fields:
- Submitter name + email.
- Kind: paper / repo / breakout.
- Title + abstract (markdown, ≤3000 chars).
- Track (single select).
- Co-authors (repeatable: name, email, affiliation).
- Links: repo URL, paper URL, arXiv, video preview (optional).
- Desired format: 10-min lightning / 25-min talk / 45-min breakout.
- COC acknowledgement.
- Open/close window: enforce server-side (env var `SUBMISSIONS_OPEN_AT`, `SUBMISSIONS_CLOSE_AT`). Suggest: open 2026-04-28, close 2026-06-07.

Backend:
- Writes `submissions` row, emails submitter a confirmation with an edit link (signed token, expires at close date).
- Routes to curators by track. Each submission needs ≥2 curator reviews before decision.

### 3.3 Registration (`/register`)

Fields:
- Name, email, Discord username (for invite audit trail, optional).
- Pay-what-you-can amount (min $1 to ensure Stripe actually fires; suggest $10/$25/$50/custom).
- COC checkbox.
- → Stripe Checkout.

---

## 4. Stripe integration

Use **Stripe Checkout (hosted)** — do not build a card form. One-time payments only, no subscriptions.

Steps:
1. Create Stripe account, switch to test mode for dev.
2. Product: "m∀thl∃ss.lean ticket". Price: custom amount, min $1, currency USD.
3. `POST /api/checkout` server action:
   - Validate email + amount.
   - `stripe.checkout.sessions.create({ mode: 'payment', line_items: [...custom_amount...], success_url, cancel_url, customer_email, metadata: { registrant_intent_id } })`.
   - Pre-insert a `registrants` row in `pending` state with the session id.
4. `POST /api/stripe/webhook`:
   - Verify signature with `STRIPE_WEBHOOK_SECRET`.
   - On `checkout.session.completed`: mark registrant `paid`, enqueue Discord invite generation.
   - On `payment_intent.payment_failed`: mark `failed`.
   - Idempotent via `stripe_session_id` unique index.
5. Refund policy: manual-only via Stripe dashboard; document in `/faq`.

Env vars (all via `vercel env`):
- `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`.

---

## 5. Discord integration

### 5.1 Server setup (manual, do once)

- Create server `m∀thl∃ss.lean 2026`.
- Channels per track (`#track-adversarial-robustness`, etc.), plus `#lobby`, `#hallway`, `#announcements`, `#coc-reports`, `#curators` (private).
- Voice/stage channels: one per concurrent session (likely 2 parallel at peak).
- Roles: `@attendee`, `@curator`, `@speaker`, `@organizer`, `@bot`.
- Enable Community server (for stage channels + announcements).

### 5.2 Invite flow (automated)

Option A — **single-use invite links per registrant** (recommended, simpler):
1. On paid webhook, server calls Discord REST `POST /channels/{lobby}/invites` with `max_uses: 1, max_age: 0, unique: true`.
2. Store code on `registrants` row.
3. Email the registrant a receipt with their personal invite link.
4. Use a Discord bot's `GUILD_MEMBER_ADD` gateway event to match the joining user to the invite code (by diffing invite `uses` counts) and assign `@attendee` role.

Option B — bot-issued via `/claim` slash command (more work, skip).

### 5.3 The bot

Minimal responsibilities:
- Watch member joins; reconcile invite code → registrant → assign role.
- `/whois <user>` for organizer lookup.
- Post schedule reminders to `#announcements` (cron).
- Kick unregistered joiners after 10 min grace.

Hosting: deploy as a long-running worker. Vercel Functions are request-scoped, so use:
- **Preferred**: a tiny Fly.io or Railway service running the bot (Discord gateway needs a persistent WS).
- Alternative: Discord interactions HTTP endpoint on Vercel (works for slash commands but not gateway events — so you lose auto-role on join unless you poll invites via cron). **Pick Fly.io.**

Env vars: `DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID`, `DISCORD_LOBBY_CHANNEL_ID`, `DISCORD_ATTENDEE_ROLE_ID`.

### 5.4 Failure modes to handle

- Registrant never joins → keep invite valid indefinitely (`max_age: 0`), send reminder email 1 week before event.
- Registrant joins but didn't pay (somehow) → bot auto-kick after grace.
- User joins on a different account than the email on file → surface in `/admin` for manual reconciliation.

---

## 6. Curator review workflow

- Accepted curators get an `@curator` role in Discord + email with login link.
- `/admin/review` lists submissions on their track(s) with score (1–5) + comment form.
- A submission auto-transitions to `decided` when ≥2 reviews and average ≥ threshold (configurable, start at 3.5).
- Ties / borderline: Quinn breaks.
- Decisions emailed in a batch, not per-submission.

Timeline target (anchored to a **Saturday 2026-10-17** event — shift uniformly if you pick a different date in Q3/Q4):
- Curator apps open: 2026-06-01.
- Curator apps close: 2026-07-06.
- Submissions open: 2026-07-01.
- Submissions close: 2026-09-07.
- Reviews due: 2026-09-21.
- Decisions sent: 2026-09-24.
- Schedule published: 2026-10-01.
- Conference: 2026-10-17 (pick exact weekend).

Work backwards: reviews need ~3 weeks, submissions need ~2 months open, curators need to be in place before submissions open.

---

## 7. Auth

- Public site: no auth.
- Curator review + admin: magic-link email via **Clerk** (Vercel Marketplace) or **Resend-backed custom magic links**. Clerk is faster — use it.
- Admin is Quinn only, gated by email allowlist env var.

---

## 8. Email

- Transactional only. Use **Resend** (Marketplace) or Postmark.
- Templates: submission confirmation, curator decision, curator welcome, submission decision, payment receipt + Discord invite, pre-event reminder, post-event survey.
- From: `hello@mathless.lean` (need to register this domain or use `mathless-lean.com` / reuse current). DNS: SPF, DKIM, DMARC.

---

## 9. Infra + env

- Vercel project (exists implicitly — this is a Next.js app).
- Neon Postgres via Vercel Marketplace → auto-provisions `DATABASE_URL`.
- Stripe, Discord, Resend, Clerk keys via `vercel env add`.
- Local: `vercel env pull .env.local`.
- CI: default Vercel builds + preview deploys per branch.
- Monitoring: Vercel Observability + a Sentry project for the bot.

---

## 10. Legal / policy

- Code of Conduct: adapt the Berlin CoC or Recurse Center's. Needs a contact email (not Quinn's personal) — set up `coc@...`.
- Privacy policy: we store email, name, payment metadata (Stripe holds card data). Link from footer.
- Refund policy: full refund if requested ≥7 days before event, none after.
- Recording policy: state clearly on `/submit` — recordings default to public, speakers may opt out.
- Accessibility: captions on recordings (use Whisper post-event), quiet room channel.

---

## 11. Marketing

- Announce on Lean Zulip (#general, #new members), Twitter/Bluesky, LessWrong, r/ProgrammingLanguages.
- Soft-ask 3–5 well-known Lean community members to be inaugural curators; their names anchor credibility.
- Keep a changelog on `/` or `/news` so returning visitors see motion.

---

## 12. Build order (concrete)

Assumes event on 2026-10-17. Slide earlier/later if you pick Q4.

1. **April** (now): playbook, domain/email setup, Neon hookup, schema + migrations, `/coc` + `/faq` static. No rush — this is the foundation month.
2. **May**: Stripe integration + `/register` + webhook + Discord invite stub. Dry-run with test-mode Stripe. Build `/curate` form + admin queue + Clerk auth.
3. **Late May**: Discord bot on Fly.io, invite reconciliation plumbing. Soft-ask 3–5 anchor curators.
4. **June 1**: open curator applications. Build `/submit` form in parallel.
5. **July 1**: open submissions. `/curators` page live.
6. **July–Aug**: marketing push. Zulip, Bluesky, LessWrong. Registration stays open the whole time.
7. **Early Sept**: submissions close 2026-09-07. Curator review UI should already be battle-tested.
8. **Mid Sept**: reviews due 2026-09-21, decisions sent 2026-09-24.
9. **Late Sept**: schedule builder, dry run full flow with a fake registrant + submission + curator.
10. **Early Oct**: feature freeze, only fixes. Pre-event reminder email goes out T-7 days.
11. **Event week**: babysit Discord, post recordings, send survey.

Danger zone: the gap between "playbook written" (now) and "first real user action" (curator apps open June 1) is 7 weeks of nobody-is-waiting-on-me. That's where projects die. Ship `/curate` in April even if it feels early.

---

## 13. Things easy to forget

- Timezone: pick one canonical (UTC or US-Pacific) and state it everywhere.
- Tax: Stripe handles sales tax only if configured. For a conference ticket at this scale, probably below thresholds — confirm with an accountant before opening registration.
- 1099/income reporting: keep Stripe export.
- Backups: Neon has PITR — confirm enabled.
- Secrets rotation: none needed pre-event; rotate all keys after.
- Post-mortem: write one. Publish the hourly-rate number you promised yourself.
