# Email Automation Tool

A compliant email-outreach tool with a management UI, built with **Next.js
(App Router) + TypeScript + Prisma**, sending over **SMTP** (Gmail, Outlook.com,
or any SMTP host) via nodemailer.

Two features:
1. **Sending** — send to all contacts in your list, designed to land in the
   **inbox** via proper authentication and sending hygiene.
2. **GitHub research** — collect **publicly-listed** emails from GitHub into a
   reviewable list. Nothing is auto-emailed.

## Why this lands in the inbox (and stays legal)

Inbox placement comes from sending hygiene, not tricks. This tool bakes the
requirements in and **blocks non-compliant sends**:

- **One-click unsubscribe** — `List-Unsubscribe` headers + a footer link on
  every email.
- **Physical postal address** — required by CAN-SPAM; sending is blocked if it's
  missing.
- **Suppression list** — unsubscribes and bounces are permanently blocked from
  future sends. With SMTP there are no delivery webhooks, so a hard recipient
  rejection (SMTP 5xx) is detected at send time and auto-suppressed.
- **Consent gate** — EU/Canada recipients require recorded consent (GDPR/CASL)
  or the send is blocked.
- **Throttling** — per-mailbox daily cap + inter-send delay to protect your
  account and reputation.

> **Two things you're responsible for:**
> 1. A public email address is not consent. You need a lawful basis to contact
>    anyone, especially in the EU/Canada.
> 2. **Gmail (~500/day) and Outlook.com (~300/day) cap volume and prohibit
>    unsolicited bulk email.** Cold-outreach volume through a personal mailbox
>    risks throttling and account suspension. For real cold-email scale, use a
>    dedicated sending domain with an ESP instead of a consumer mailbox.

## Quick start

```bash
npm install
cp .env.example .env      # then edit .env (see below)
docker run -d --name quinn-pg -e POSTGRES_PASSWORD=quinn -e POSTGRES_DB=quinn \
  -p 54329:5432 postgres:16-alpine   # local Postgres (matches .env.example)
npm run db:push           # create the tables
npm run db:seed           # optional: demo contacts + identity
npm run dev               # http://localhost:3000
```

Runs in **dry-run mode** until you configure SMTP — campaigns simulate sending
(no real email) so you can test the whole pipeline safely.

## SMTP setup (Gmail or Outlook.com)

Both require an **App Password** (regular account passwords won't work for SMTP).

**Gmail**
1. Turn on **2-Step Verification** on your Google account.
2. Create an **App Password**: Google Account → Security → App passwords.
3. In `.env`:
   ```
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=you@gmail.com
   SMTP_PASS=your-16-char-app-password
   ```

**Outlook.com**
1. Enable 2-Step Verification, then create an **App Password** (Microsoft account
   → Security). Note: Microsoft is phasing out basic-auth SMTP for some consumer
   accounts — if it won't connect, the account may require OAuth.
2. In `.env`:
   ```
   SMTP_HOST=smtp-mail.outlook.com
   SMTP_PORT=587
   SMTP_USER=you@outlook.com
   SMTP_PASS=your-app-password
   ```

Then set your sender identity (From, reply-to, **postal address**) under
**Settings**, and click **Test connection** to verify SMTP works. Restart after
editing `.env`.

To swap in a different sending backend later (e.g. a dedicated domain + ESP),
implement the `EmailProvider` interface in `lib/email/` — nothing else changes.

## GitHub research setup

Create a GitHub token (no scopes needed for public data) and set `GITHUB_TOKEN`.
A token is **required** to read publicly-listed emails and to get the
5,000 req/hr rate limit. The collector uses the **official REST API** only.

## Project layout

```
app/(dashboard)/   Management UI: contacts, campaigns, research, suppression, settings
app/api/           Backend API routes (contacts, campaigns, send, unsubscribe, smtp/test, research)
lib/compliance/    Send guard, unsubscribe tokens, footer, sender identity  ← safety core
lib/email/         SMTP provider (nodemailer), merge rendering, throttled send worker
lib/throttle/      Per-mailbox daily cap + delays
lib/github/        Public-email collector
prisma/            schema + seed
tests/             Unit tests for the compliance core
```

## Verification

```bash
npm test                  # 17 unit tests: guard, footer, tokens, rendering
npm run build             # type-check + production build
```

End-to-end (with the dev server running), the pipeline demonstrably:
- blocks EU/CA-without-consent and suppressed addresses at preview + send time,
- sends allowed recipients (dry-run) and decrements the daily budget,
- closes the unsubscribe → suppression → future-send-blocked loop,
- auto-suppresses hard SMTP bounces at send time,
- imports CSV contacts and GitHub leads (leads never auto-email).

To send a real test: configure SMTP (above), create a campaign to **your own**
address, send, and confirm it arrives with a working unsubscribe link + postal
address in the footer.

## Compliance boundaries (by design)

- No spam-filter evasion (no fake headers, identity rotation, or obfuscation).
- No auto-emailing scraped contacts — research → review → manual import → consent.
- GitHub collection stays within the API/ToS; only user-published emails, never
  hidden ones.

## Deploying to Vercel

Vercel's filesystem is read-only, so SQLite does not work there. Use hosted Postgres.

1. Create a Postgres database (Neon, Supabase or Vercel Postgres) and copy its URL.
2. Create the tables once: `DATABASE_URL="<url>" npx prisma db push`.
3. In Vercel → Settings → Environment Variables, set everything from `.env.example`,
   in particular `DATABASE_URL`, `AUTH_USER`, `AUTH_PASSWORD` (without them every
   request returns 503), `APP_BASE_URL=https://<your-domain>`, the `SMTP_*` and
   `SENDER_*` values, and a random `UNSUBSCRIBE_SECRET`.
4. Redeploy. Vercel does not run `db push`; re-run step 2 after schema changes.

Sending runs inside one request, so keep batches small enough to finish within
your plan's function time limit.
