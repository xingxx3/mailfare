# Simple Operations Guide

Plain-English answers for: *does the app go down when my computer logs off?*,
*how is it deployed?*, and *what do I do if it breaks?*

---

## 1. Will the app turn off when my computer logs off?

**No.** Your computer is no longer part of the app. Everything runs on
Cloudflare's servers, in data centers around the world:

| Thing | Where it runs | Needs your PC? |
|---|---|---|
| The Mailflare app (website + APIs) | Cloudflare Workers (global edge) | ❌ No |
| The database (mail, users, settings) | Cloudflare D1 | ❌ No |
| Email attachments & raw messages | Cloudflare R2 bucket `mailflare-raw` | ❌ No |
| Incoming email processing | The Worker's `email()` handler + Queues | ❌ No |
| Real-time new-mail updates | Cloudflare Durable Object | ❌ No |
| Daily database backup (02:00 UTC) | Cloudflare cron → Workflow | ❌ No |

You can shut down, log off, or even unplug your computer for weeks —
the app at **https://mail.akamasocial.online** and
**https://mailfare.matovufaruq.workers.dev** stays up, and email keeps
arriving.

> Your PC is only needed if you ever want to run a **local development
> copy** (`npm run dev` on http://localhost:3000). That is optional.

---

## 2. How the app is deployed

The whole app is built into a single Cloudflare Worker and uploaded from
this repository with one command:

```
npm run deploy
```

What that does:

```
your repo (Next.js app)
        │  opennextjs-cloudflare build
        ▼
   .open-next/worker.js  +  static assets
        │  wrangler deploy  (via scripts/wrangler.mjs)
        ▼
┌────────────────────────────────────────────────┐
│ Cloudflare Worker "mailfare"                   │
│  • fetch()    → serves the app                 │
│  • email()    → receives inbound mail          │
│  • queue()    → processes in/outgoing mail     │
│  • scheduled() → nightly backup (02:00 UTC)    │
├────────────────────────────────────────────────┤
│ Bindings:                                      │
│  D1 "mailflare"   (database)                   │
│  R2 "mailflare-raw" (attachments, raw mail)    │
│  Queues: mailflare-inbound / -outbound         │
│  Durable Object "MailflareRealtimeHub"         │
│  Cron trigger "0 2 * * *"                      │
└────────────────────────────────────────────────┘
```

- Domains served: `mail.akamasocial.online` (custom) and
  `mailfare.matovufaruq.workers.dev` (workers.dev).
- Secrets (CF_TOKEN, MAILFARE_TX_KEY, etc.) are stored on the Worker in
  the Cloudflare dashboard — a local copy also lives in `.dev.vars`
  (never commit or share that file).

---

## 3. If it breaks — recovery guide

The Worker is "serverless": every request runs in its own isolated
sandbox, so a crash affects one request, not the whole site. The
realistic failure modes and fixes:

### A) A bad deploy broke the site
Roll back to the previous version instantly (takes seconds, no rebuild):

```
npx wrangler versions list      # see recent versions
npx wrangler rollback           # revert to the last good version
```

### B) You want to push a known-good version again
Rebuild and redeploy from the repo:

```
npm run deploy
```

If the deploy fails because of pending database changes, run:

```
npm run deploy:with-migrations
```

### C) Diagnosing what went wrong
Stream the live logs while reproducing the problem:

```
npx wrangler tail mailfare
```

You can also read past logs in the Cloudflare dashboard →
Workers & Pages → `mailfare` → Logs (observability is enabled).

### D) Database disaster (data lost/corrupted)
You have automatic **daily backups at 02:00 UTC** saved into the R2
bucket `mailflare-raw`. Restore:

- **Easy way:** log in as admin → **Backups** page in the app → download
  or restore a backup.
- **Manual way:** export from R2 and restore via the Backups admin API.

### E) Email stops arriving
Check the Cloudflare dashboard → the `akamasocial.online` zone →
**Email → Email Routing**. The routing rules send mail to the worker
named `mailfare` — as long as that worker is deployed, mail is
processed. Failed queue messages are retried 3 times automatically.

### F) Worst case: the worker was deleted by accident
Recreate it with `npm run deploy` (all bindings are declared in
`wrangler.jsonc`), then re-enter the secrets (Dashboard → worker →
Settings → Variables & Secrets). The secret values are in your local
`.dev.vars` file.

---

## 4. Quick reference

| Task | Command |
|---|---|
| Deploy the app | `npm run deploy` |
| Deploy + apply DB migrations | `npm run deploy:with-migrations` |
| See live logs | `npx wrangler tail mailfare` |
| Roll back a bad deploy | `npx wrangler rollback` |
| List deployed versions | `npx wrangler versions list` |
| Check site is up | visit https://mail.akamasocial.online |

**Bottom line:** your computer is now optional. The app, your mail, and
the backups all live on Cloudflare.
