![](/public/icon-96.png)
# Mailflare

A self-hosted, AI-powered email inbox with custom domains, powered by Cloudflare

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/hieunc229/mailflare)

![](/screenshot.png)


### Roadmap

- [x] Domain onboarding through Cloudflare, including inbound Email Routing DNS and sending DNS setup.
- [x] Domain removal cleanup for linked Cloudflare routing rules and sending subdomain resources.
- [x] Mailbox creation with automatic Cloudflare Email Routing rules.
- [x] Mailbox management with a grid view, mailbox detail page, and editable display name.
- [x] Inbox, sent, drafts, spam, and trash folders backed by a shared mail list component.
- [x] Popup composer with autosaved drafts and draft resume from the drafts folder.
- [x] Outbound send API, API keys, message read status, spam/trash moves, and seeded demo data.
- [x] Inbound and outbound attachments stored in R2 with authenticated downloads.
- [x] Real-time new-email updates and in-app notifications over WebSockets.
- [x] Search, filtering, and richer mailbox/folder counts.
- [x] Attachment support and richer compose formatting.
- [ ] Advanced routing rules for catch-all addresses, forwarding, reject/block rules, and priorities.
- [ ] Webhook management UI and delivery retry visibility.

#### Email agent

- [ ] Message intelligence with summaries, intent classification, urgency scoring, and extracted entities.
- [ ] Agent task queue for proposed replies, follow-ups, triage actions, and missing-information requests.
- [ ] Human-approved actions for draft replies, folder moves, forwarding, contact creation, and webhook calls.
- [ ] Agent rules for learned post-receipt policies such as prioritization, auto-triage, and reply templates.
- [ ] Agent inbox view organized by action state, including needs reply, waiting on me, waiting on them, FYI, auto-handled, and needs approval.
- [ ] Thread and contact memory for prior summaries, user preferences, relationship notes, commitments, and open loops.
- [ ] Tool execution for trusted actions such as sending email, creating drafts, updating message status, calling webhooks, and creating contacts.

## Domain API

Domains are **not** dashboard-only. This app calls Cloudflare when you add/remove a domain:

| Action | Cloudflare API |
|--------|----------------|
| List DNS / status | `GET /zones/{zone_id}/email/routing/dns` |
| Enable inbound routing + MX/SPF/DKIM | `POST /zones/{zone_id}/email/routing/dns` |
| Disable routing | `DELETE /zones/{zone_id}/email/routing/dns` |
| Enable subdomain sending + DNS | `POST /zones/{zone_id}/email/sending/subdomains` |
| Remove subdomain sending | `DELETE /zones/{zone_id}/email/sending/subdomains/{tag}` |
| Subdomain sending DNS records | `GET .../subdomains/{tag}/dns` |

**Requirements:** Prefer `CF_TOKEN` with Zone Read + Email Routing Edit + Email Sending Edit + Email Routing Rules Write (or broader). If you use a legacy Global API Key instead, set `CF_API_KEY` and `CF_EMAIL`. The hostname must be the account's Cloudflare zone apex or a subdomain under that zone. Root-domain sending uses the Cloudflare Email Service binding, while subdomain sending can also provision the sending-subdomain DNS records. Mailbox creation creates a Cloudflare Email Routing rule that sends that address to `CF_EMAIL_WORKER_NAME`.

App routes:

- `GET/POST /api/domains` — list / add (calls Cloudflare)
- `GET/DELETE /api/domains/[id]` — get / remove (disables routing & sending on CF)
- `GET /api/domains/[id]/dns` — routing + sending DNS snapshot

## Setup

```bash
cp .dev.vars.example .dev.vars
# Add CF_TOKEN and optionally CF_AID.
# For a legacy Global API Key, use CF_API_KEY + CF_EMAIL instead.

npm install
npm run db:migrate:local
npm run dev
```

### Attachments

The dashboard composer accepts up to 10 attachments, with a 10 MB per-file limit and a 20 MB
combined limit. Attachment metadata is stored in D1 and file content is stored in the configured
`BUCKET` R2 binding. Apply migration `0008_add_message_attachments.sql` before using attachments.

`POST /api/v1/send` accepts optional JSON attachments:

```json
{
  "from": "support@example.com",
  "to": "user@example.net",
  "subject": "Report",
  "text": "Attached.",
  "attachments": [
    {
      "filename": "report.pdf",
      "type": "application/pdf",
      "contentBase64": "<base64 data>"
    }
  ]
}
```

Received MIME attachments are extracted automatically. Downloads require access to the mailbox
containing the message.

### Real-time email notifications

Mailflare uses a Cloudflare Durable Object WebSocket hub to notify connected users immediately after
an inbound message is stored. The inbox and unread counts refresh without waiting for polling, and
an in-app popup links directly to the new message. Mailbox owners, the domain admin, and delegated
users receive events for mailboxes they can access.

The `REALTIME` Durable Object binding and its initial migration are declared in `wrangler.jsonc`.
Deploy with Wrangler or the Cloudflare Git integration so the Durable Object class is provisioned.
When the socket is temporarily unavailable, the client retries automatically and uses a slower
fallback refresh until the connection recovers.

Complete first-run configuration at `/setup`, or seed dev data. The first setup step checks the
required Cloudflare runtime configuration and initializes the schema when the bound D1 database is
empty. Existing databases are never migrated by the setup page; apply later migrations with the
normal Wrangler migration command.

```bash
curl -X POST http://localhost:3000/api/seed
```

## Deploy

### One-click Cloudflare deploy


[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/hieunc229/mailflare)

Publish this repository to GitHub, then replace `hieunc229/mailflare` in the button at the top of this README with the public repository path.

The deploy flow reads `wrangler.jsonc`, provisions the Worker bindings, prompts for values from `.dev.vars.example`, runs D1 migrations, builds the OpenNext Worker, and deploys it.

Keep `wrangler.jsonc` committed. Cloudflare's deploy button uses it to detect the Worker entrypoint and required bindings. Do not commit `.dev.vars`; deploy-time secrets should be entered through Cloudflare's setup flow or set locally in `.dev.vars`.

Required setup values:

- `CF_TOKEN` — runtime scoped Cloudflare API token with Zone Read, Email Routing Edit, Email Sending Edit, and Email Routing Rules Write. This is separate from Cloudflare's deploy/build token; Cloudflare does not automatically expose the deploy token to this app.
- `CF_AID` — optional unless your token can access multiple accounts.
- `CF_EMAIL_WORKER_NAME` — must match the deployed Worker name. If the one-click deploy flow asks for a different Worker name, enter that same value here.

Activate a purchased Pro or Team key from **Admin → Licenses**. Mailflare sends the key directly to
Paymug and stores only a one-way key hash with the activation state. Without an active license,
Mailflare uses the original app name, icon, and favicon and custom branding remains unavailable.
Apply all D1 migrations before activating a license.

### Database backup workflow binding

Manual and scheduled database backups require the `DATABASE_BACKUP_WORKFLOW` binding declared in
`wrangler.jsonc`. If the backup page reports that the binding is missing, deploy the complete Worker
with `npm run deploy`; `next dev` and source-only updates may not provision new Cloudflare bindings.
The backup also requires `CF_AID` and `D1_DATABASE_ID` at runtime. It uses `D1_BACKUP_TOKEN` when
configured, otherwise it reuses `CF_TOKEN`; whichever token is used must be allowed to export the D1
database.

### Dashboard updates

The admin overview includes an **Update Mailflare** button. `POST /api/admin/update` dispatches
`.github/workflows/update.yml` in the installation repository. The workflow fetches the latest
changes from the default branch of `hieunc229/mailflare`, merges them into the installation
branch, applies pending D1 migrations, and pushes the updated source. It does not build or deploy
the Worker.

The dashboard first calls `GET /api/admin/update` and compares the running app's `package.json`
version with the target repository's version. The update button is enabled only when the target
version is newer. Checking never starts a workflow; deployment occurs only after an admin clicks
the button.

Configure these Worker runtime secrets/variables once:

- `GITHUB_UPDATE_TOKEN` — fine-grained GitHub token scoped to the installation repository with
  **Actions: write** permission.
- `GITHUB_UPDATE_REF` — optional update branch; the repository default branch is used when omitted.

Configure these GitHub Actions repository secrets:

- `CLOUDFLARE_API_TOKEN` — Cloudflare token allowed to read and migrate D1.
- `CLOUDFLARE_ACCOUNT_ID` — Cloudflare account ID.
- `MAILFLARE_UPSTREAM_TOKEN` — required only when the upstream source repository is private.
  Store this under the installation repository's **Settings → Secrets and variables → Actions → Repository secrets**.
  For a classic PAT, enable the `repo` scope and ensure the token owner has accepted collaborator
  access to the upstream repository.

If an installation already contains an older failing updater, manually copy the latest
`.github/workflows/update.yml` into that installation repository once. The updater cannot update
its own workflow until it can successfully read the upstream repository.

Optional GitHub Actions repository variables:

- `MAILFLARE_UPSTREAM_REPOSITORY` — upstream source in `owner/repository` format. Defaults to
  `hieunc229/mailflare`.
- `MAILFLARE_UPSTREAM_BRANCH` — upstream branch to merge. Defaults to `main`.

The workflow resolves the `mailflare` D1 database ID at runtime and applies migrations before
pushing the updated source. If migration fails, the source is not pushed. A connected Cloudflare
Git integration may build and deploy after the successful push.

If you rename the Worker, also update related literal resource names in `wrangler.jsonc`: `name`, `services[].service` for `WORKER_SELF_REFERENCE`, `CF_EMAIL_WORKER_NAME`, and any D1/R2/Queue names you want renamed. Cloudflare service bindings require the target Worker name to exist exactly; they cannot currently reference `name` dynamically.

### Worker name and Email Routing

`CF_EMAIL_WORKER_NAME` is the Worker script name that Mailflare sends to Cloudflare's Email Routing API when creating mailbox routing rules. It must match the deployed Worker name exactly. The app now fails with a clear setup error if this variable is missing instead of silently defaulting to `mailflare`.

Cloudflare service bindings also require a literal Worker name in `wrangler.jsonc` (`services[].service`). Cloudflare's service binding configuration uses `service: "<WORKER_NAME>"`, so `WORKER_SELF_REFERENCE` cannot automatically inherit the top-level `name` field. If you rename the Worker during one-click deployment, make sure the deployed Worker name, `CF_EMAIL_WORKER_NAME`, and `services[].service` agree.

After deployment, route inbound mail to the Worker in Cloudflare Email Routing.

## Troubleshooting

### Cloudflare API 403 ... code 9109: Invalid access token

**Resolution:** The Deploy to Cloudflare flow can authenticate and deploy the Worker, but it does not create a runtime `CF_TOKEN` for Mailflare's onboarding API calls. Create `CF_TOKEN` manually from Cloudflare dashboard user API tokens and enter it as a deploy secret/variable.

Verify the token:

```bash
curl "https://api.cloudflare.com/client/v4/user/tokens/verify" \
  -H "Authorization: Bearer <CF_TOKEN>"
```

The response should include `"success": true` and `"status": "active"`. In `.dev.vars` or deploy settings, set `CF_TOKEN` to the token secret value only. Do not include the word `Bearer`, do not use the token ID, and do not put a Global API Key in `CF_TOKEN`. For a Global API Key, set both `CF_EMAIL` and `CF_API_KEY` instead.

Also check whether the token has an expiration, a `not_before` time, or client IP restrictions. If you changed deploy variables in Cloudflare, redeploy so the Worker receives the new values.

#### Cloudflare API 403 on /zones/{zone_id}/email/routing/dns: code 10000

This error indicate API Key is missing some permissions. Update `CF_TOKEN` minimum permissiongs

For Account: Email Sending:Edit, DNS Settings:Edit, Email Routing Addresses:Edit
For Zone: DNS Settings:Edit, Email Routing Rules:Edit, Zone Settings:Edit, DNS:Edit

### Manual deploy

```bash
npm run deploy
```

`npm run deploy` builds and deploys the Worker. Cloudflare's deploy button can auto-provision the D1 database, R2 bucket, and queues declared in `wrangler.jsonc`; for manual deployments, create or update those bindings in Cloudflare if they do not already exist.

The deploy script intentionally builds with OpenNext and uploads with Wrangler. Do not replace the
Wrangler step with `opennextjs-cloudflare deploy`: Mailflare's `worker.ts` wrapper exports the
`RealtimeHub` Durable Object and handles email and queue events in addition to the generated Next.js
worker.

For an existing remote D1 database with a committed `database_id`, use:

```bash
npm run deploy:with-migrations
```

### Cloudflare D1 7404: database could not be found

If automatic deployment fails with:

```text
The database <uuid> could not be found [code: 7404]
```

remove any committed `database_id` from `wrangler.jsonc`. D1 database IDs are account-specific; committing one from another account makes Wrangler look up a database that does not exist in the deploying account. This project declares the `DB` binding with `database_name` only so Wrangler/Cloudflare can provision the D1 database for the target account.

Remote migration commands need a concrete D1 `database_id` in local config. With one-click deploy, Cloudflare provisions the database during deploy, and that generated ID is available in the Cloudflare dashboard, not automatically written back to the repository. After the first successful one-click deploy:

1. Go to Cloudflare dashboard → Workers & Pages → your Worker → Settings → Bindings.
2. Open the `DB` D1 binding and copy the database ID.
3. Add that ID to `wrangler.jsonc` only for your deployment/account if you want to run `npm run db:migrate:remote` or `npm run deploy:with-migrations`.

Do not commit an account-specific D1 ID to a reusable public template.
