# ReachInbox Email Scheduler — Backend

A backend-first implementation of the ReachInbox scheduling assignment. The frontend is intentionally deferred until the requested Figma screenshots are available.

## Features implemented

### Backend

- TypeScript + Express API with per-user email, sender, and status data boundaries.
- Google OAuth login and session-based identity (`/auth/google`, `/auth/me`, `/auth/logout`).
- Transactional PostgreSQL scheduling records and queue outbox; request-level idempotency keys.
- BullMQ delayed jobs on Redis; stable job IDs and a DB outbox dispatcher recover queue publication after process restarts.
- Configurable worker concurrency (`WORKER_CONCURRENCY`, default `10`).
- Per-sender pacing (`MIN_SEND_INTERVAL_MS`, default `2000`; scheduling request can select a delay) and hourly rate limits backed by atomic Redis Lua reservations. The default is `MAX_EMAILS_PER_HOUR_PER_SENDER=200`; per-schedule `hourlyLimit` can impose a lower/alternative sender cap.
- At quota exhaustion, messages keep their Redis reservation and BullMQ job is delayed to the next available hourly window. Each sender/hour generates at most one Slack notification.
- Slack OAuth + `incoming-webhook` grant, secure signed session state, stored webhook per user, and live webhook notification when a sender cap is hit. Disconnect via `DELETE /auth/slack/connection`.
- Ethereal SMTP transport with file/URL access disabled and TLS certificate verification enabled.
- Elasticsearch indexing for scheduled and delivered/failed messages, with a DB-backed index reconciliation loop; search at `GET /api/emails/search?q=...`.
- Auth-protected Bull Board at `/admin/queues`; health checks at `GET /api/health`.
- Tests for request validation, BullMQ enqueue delay/idempotency configuration, and Redis limiter reservation semantics.

### Frontend

- Not implemented yet by request; will be built after Figma screenshots are supplied.

## Requirements

- Node.js 22+
- Docker Compose (or local PostgreSQL 16+, Redis 7+, Elasticsearch 8.x)
- Google OAuth web credentials, Slack OAuth app credentials, and Ethereal SMTP account for live integrations

## Run locally

```sh
docker compose up -d
cd backend
cp .env.example .env
# Fill in OAuth and Ethereal values in backend/.env
npm ci
npm run db:generate
npm run db:migrate
```

Run API and worker as separate processes:

```sh
# terminal 1
cd backend && npm run dev:api
# terminal 2
cd backend && npm run dev:worker
```

Health endpoint: `http://localhost:3001/api/health`. Queue dashboard: `http://localhost:3001/admin/queues` (Google-authenticated session required).

Generate an Ethereal test account at https://ethereal.email/create, then put its username and password in `ETHEREAL_USER` and `ETHEREAL_PASS`. Ethereal does not deliver messages to real recipients; inspect the Ethereal preview/link and mailbox for demo verification.

Configure Google OAuth redirect URI to `http://localhost:3001/auth/google/callback`. Configure Slack redirect URI to `http://localhost:3001/auth/slack/callback` and add the `incoming-webhook` OAuth scope. Use HTTPS/public URLs outside localhost. Ensure `SESSION_SECRET` and `SLACK_STATE_SECRET` are strong random secrets in deployment.

## Schedule API

`POST /api/emails` requires a logged-in user and JSON body:

```json
{
  "sender": "sales@example.com",
  "subject": "A relevant introduction",
  "body": "Hello ...",
  "recipients": ["lead@example.org"],
  "startAt": "2030-01-01T12:00:00.000Z",
  "delayBetweenEmailsMs": 2000,
  "hourlyLimit": 200,
  "idempotencyKey": "campaign-unique-client-key"
}
```

The API normalizes and de-duplicates recipients; a batch is capped at 10,000 recipients. Each recipient is a separate durable email row. `idempotencyKey` is required and repeated submission returns the existing IDs rather than inserting duplicates. `GET /api/emails?status=scheduled|sending|sent|failed&limit=50&cursor=...` lists the authenticated user's email records. Search is tenant-filtered by the authenticated user.

## Scheduling and reliability

Postgres is the source of truth. Schedule creation atomically writes email rows and one queue-outbox row per email. A worker-side outbox dispatcher retries enqueue publication; BullMQ gets the email ID as a deterministic job ID. If the API crashes after commit but before enqueue, the outbox recovers on worker startup. Redis persistence is configured with AOF and Postgres uses a named volume. BullMQ owns future delayed execution; there are no cron jobs.

The worker claims the transition from `SCHEDULED` to `SENDING` with a conditional database update and a five-minute lease; an expired lease is eligible for recovery after worker/process restarts. BullMQ retry attempts handle transient execution errors; permanent SMTP failures are recorded. SMTP itself is an external side effect: exactly-once delivery cannot be mathematically guaranteed across a crash after SMTP accepted a message but before Postgres recorded success. The worker includes a stable email ID header and database claim to make normal duplicate execution safe; robust production exactly-once semantics would additionally require a provider with idempotency support or reconciliation of ambiguous SMTP outcomes.

## Throughput / rate limits

- `WORKER_CONCURRENCY=10` permits parallel work, while all quota and sender-spacing decisions happen in an atomic Redis Lua script shared by every worker instance.
- `MIN_SEND_INTERVAL_MS=2000` is the default per-sender minimum pacing interval. A campaign may set `delayBetweenEmailsMs`; the worker applies the sender's larger reserved slot spacing.
- `MAX_EMAILS_PER_HOUR_PER_SENDER=200` is the configurable fallback hourly quota. A per-schedule `hourlyLimit` overrides it for that campaign's reservations; use consistent limits for concurrent campaigns from the same sender to avoid intentionally mixed policy.
- Under a burst of 1,000 jobs, BullMQ keeps jobs durable while concurrent workers reserve sequential sender slots. Once an hourly bucket fills, additional reservations go to future hour buckets and jobs are delayed, not dropped. Queue outbox dispatches in batches of 100; send work is bounded by concurrency and pacing.
- Redis reservation keys are idempotent by email ID, sender quotas are keyed by UTC epoch-hour, and the state is not process-local. A worker restart recovers the delayed jobs from Redis.
- Slack notifications are rate-limit transition notifications (one per sender/hour), not one per deferred email. Without a saved webhook, the worker does not fail; reconnecting saves a webhook that subsequent limit events use.

## Search

Elasticsearch is an index, not the source of truth. A worker reconciles rows where `searchIndexedAt` is null, indexing scheduled and terminal emails with stable IDs. This supports replay after a worker/index outage. The search endpoint requires at least two characters and only returns documents matching the authenticated user's `userId`.

## Migrations, tests, and build

```sh
cd backend
npm run db:migrate
npm run typecheck
npm test
npm run build
```

## Known trade-offs / follow-up

- Real Google, Slack, SMTP, and Elasticsearch calls require credentials and running services. Local integration/demo cannot be verified until these are configured.
- There is no frontend yet by explicit request. UI work follows design screenshots.
- The Bull Board middleware currently requires a valid session; deployment should additionally gate it by operator role/network policy.
- OAuth tokens/webhook URLs are stored in Postgres. Production deployment should encrypt integration secrets at rest and use a managed secret/KMS system.
- Job reservation is durable and job creation idempotent, but no SMTP provider supports exactly-once guarantees with plain SMTP; ambiguous delivery failures need operator reconciliation.
- Demo video, private GitHub repository configuration, and inviting `Mitrajit` / `Yadav036` require the owner's GitHub account and are not automated here.
