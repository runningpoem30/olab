# Backend verification log

Verification performed on 2026-10-18. This records observed results only; blocked checks are not treated as passed.

## Passed

| Check | Result | Evidence |
| --- | --- | --- |
| TypeScript typecheck | Pass | `cd backend && npm run typecheck` |
| Unit tests | Pass: 10 tests | `cd backend && npm test` |
| Production build | Pass | `cd backend && npm run build` |
| Prisma schema validation | Pass | `DATABASE_URL=... npx prisma validate` |
| PostgreSQL migrations | Pass | Applied both committed migrations to isolated local databases and confirmed migration status. A legacy-schema fixture with `campaign:part:0` and `campaign:part:1` backfilled both emails to the exact request key `campaign:part`. No existing database was modified. |
| Redis rate-limit coordination | Pass: 2 integration tests | Verified against the user's local Redis at `localhost:6379`: idempotent reservation, quota overflow to next hour, and BullMQ delayed job state surviving queue close/reopen. |
| API health | Pass | Current local API on port 3001 uses the separate `reachinbox_demo` database and Redis; `GET /api/health` returns 200 with both dependencies `ok`. |
| Auth route protection | Pass | `GET /auth/me` returned 401 without a session; `GET /api/emails` returned 401. The actual browser login callback is still pending. |
| CSRF | Pass | `GET /auth/csrf` returned a session token; `POST /auth/logout` without its header returned 403. |
| Google OAuth configuration | Pass, redirect only | With configured credentials, `GET /auth/google` returned 302 to `accounts.google.com`, with callback `http://localhost:3001/auth/google/callback`, `profile email` scopes, client ID present, and OAuth `state` present. Browser consent/callback remains unverified. |
| Ethereal SMTP delivery | Pass | SMTP `verify()` succeeded and one labeled test message was accepted by Ethereal. The preview URL was provided in the local verification session. |
| Worker-to-Ethereal flow | Pass | The real BullMQ worker sent a due email through Ethereal and PostgreSQL recorded `SENT`. The current disposable `reachinbox_demo` database contains two `SENT` records and zero unpublished outbox rows. Elasticsearch was unavailable during delivery. |

Run the real Redis tests locally with `REDIS_URL=redis://localhost:6379 npm run test:integration:redis` after starting Redis.

## Blocked / not verified in this environment

| Check | Reason |
| --- | --- |
| Elasticsearch index creation, scheduled/sent indexing, search endpoint | No Elasticsearch process reachable on configured/default local endpoint (9200). Indexer retry after startup failure is covered by a unit test, but real indexing/search is not verified. |
| Google OAuth end-to-end | Redirect configuration passed; user consent and callback completion have not been confirmed in a browser. |
| Slack OAuth + live webhook delivery | Not verified: Slack browser consent and a rate-limit-triggered live message have not been confirmed. |
| Full schedule-to-send and restart scenario through authenticated UI | Worker delivery to Ethereal is verified using a direct database job. The authenticated browser schedule flow and full service restart demo still need verification; Redis delayed-job persistence was checked independently. |
| Compose-based end-to-end run | Docker is not installed in this environment. PostgreSQL and Redis were tested using local services instead. |

## Environment findings

- The `DATABASE_URL` in `backend/.env` still fails with Prisma P1010. Local testing is currently using a separate `reachinbox_demo` database under the current OS role; the configured database URL has not been changed.
- The user's Redis on port `6379` was used for the latest integration tests and responded to `PING`. Earlier isolated tests used a temporary Redis process on port `16379`, which was shut down.
- A local `backend/.env` contains configured credentials and remains ignored/untracked; no values were printed or committed.
- `npm audit` reports 3 high advisories in the Prisma CLI config dependency chain and 2 critical + 1 moderate advisories in Vitest's test-runner dependencies. `npm audit --omit=dev` also reports the Prisma transitive chain. Resolve these before considering production readiness; no forced major upgrade has been applied.

## Corrective changes made during verification

- Removed duplicate `/auth/csrf`, `/auth/me`, and `/auth/logout` route registrations.
- Added retry-on-interval behavior for Elasticsearch index initialization, so the worker can recover if Elasticsearch starts after it.
- Verified a single canonical registration for auth routes after rebuilding the API.
