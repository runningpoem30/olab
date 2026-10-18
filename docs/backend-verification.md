# Backend verification log

Verification performed on 2026-10-18. This records observed results only; blocked checks are not treated as passed.

## Passed

| Check | Result | Evidence |
| --- | --- | --- |
| TypeScript typecheck | Pass | `cd backend && npm run typecheck` |
| Unit tests | Pass: 9 tests | `cd backend && npm test` |
| Production build | Pass | `cd backend && npm run build` |
| Prisma schema validation | Pass | `DATABASE_URL=... npx prisma validate` |
| PostgreSQL migrations | Pass | Applied both committed migrations to isolated local databases and confirmed migration status. A legacy-schema fixture with `campaign:part:0` and `campaign:part:1` backfilled both emails to the exact request key `campaign:part`. No existing database was modified. |
| Redis rate-limit coordination | Pass: 2 integration tests | Temporary Redis at `127.0.0.1:16379`; verified idempotent reservation, quota overflow to next hour, and BullMQ delayed job state surviving queue close/reopen. The user's local Redis also responded to `PING`. |
| API health | Pass | Started rebuilt API with isolated PostgreSQL and Redis; `GET /api/health` returned 200 with both dependencies `ok`. |
| Auth route protection | Pass | `GET /auth/me` returned 401 without a session; `GET /api/emails` returned 401. |
| CSRF | Pass | `GET /auth/csrf` returned a session token; `POST /auth/logout` without its header returned 403. |
| Google OAuth configuration | Pass, redirect only | With configured credentials, `GET /auth/google` returned 302 to `accounts.google.com`, with the configured callback, `profile email` scopes, client ID present, and OAuth `state` present. Browser consent and callback completion still require user interaction. |
| Ethereal SMTP delivery | Pass | SMTP `verify()` succeeded and one labeled test message was accepted by Ethereal. The preview URL was provided in the local verification session. |
| Worker-to-Ethereal flow | Pass | Inserted a temporary due email into the isolated test database; the real BullMQ worker sent it and PostgreSQL recorded `SENT`. Elasticsearch index initialization failed as expected because Elasticsearch was unavailable. The disposable database was removed afterward. |

Run the real Redis tests locally with `REDIS_URL=redis://localhost:6379 npm run test:integration:redis` after starting Redis.

## Blocked / not verified in this environment

| Check | Reason |
| --- | --- |
| Elasticsearch index creation, scheduled/sent indexing, search endpoint | No Elasticsearch process reachable on configured/default local endpoint (9200). |
| Google OAuth end-to-end | Redirect configuration passed; user consent and callback completion have not yet been performed in a browser. |
| Slack OAuth + live webhook delivery | Requires completing Slack consent in the browser and then triggering a rate-limit event. |
| Full schedule-to-send and restart scenario through authenticated API | Requires real Google session plus SMTP and Elasticsearch configuration. PostgreSQL migrations and Redis delayed job recovery were independently checked. |
| Compose-based end-to-end run | Docker is not installed in this environment. PostgreSQL and Redis were tested using local services instead. |

## Environment findings

- Local PostgreSQL 14 was listening, but the configured `reachinbox` role/database were unavailable (Prisma returned P1010). Disposable verification databases were created with the current OS role, migrations/tests were run, and the databases were removed afterward.
- A temporary Redis instance on port `16379` was started for integration tests and shut down afterward. The user's existing Redis on port `6379` was left running and responded to `PING`.
- A local `backend/.env` contains configured credentials and remains ignored/untracked; no values were printed or committed.
- `npm audit` currently reports 3 high advisories in the Prisma CLI config dependency chain and 2 critical + 1 moderate advisories in Vitest's test-runner dependencies. Prisma's transitive config chain is also included by `npm audit --omit=dev`. Treat dependency security as an open production-readiness blocker. No forced major upgrade was applied during this verification run.

## Corrective change made during verification

Removed duplicate `/auth/csrf`, `/auth/me`, and `/auth/logout` route registrations discovered while inspecting the API route table. Rebuilt the API and verified there is a single canonical route registration for each.
