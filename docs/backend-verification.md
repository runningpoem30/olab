# Backend verification log

Verification performed on 2026-10-18. This records observed results only; blocked checks are not treated as passed.

## Passed

| Check | Result | Evidence |
| --- | --- | --- |
| TypeScript typecheck | Pass | `cd backend && npm run typecheck` |
| Unit tests | Pass: 9 tests | `cd backend && npm test` |
| Production build | Pass | `cd backend && npm run build` |
| Prisma schema validation | Pass | `DATABASE_URL=... npx prisma validate` |
| PostgreSQL migrations | Pass | Applied both committed migrations to isolated local `reachinbox_verify` database via `npm run db:migrate`; migration status reported up-to-date. Also applied migration SQL to a disposable legacy-schema DB and asserted `campaign:part:0`/`campaign:part:1` both backfilled to request key `campaign:part`. No existing database was modified. |
| Redis rate-limit coordination | Pass: 2 integration tests | Temporary Redis at `127.0.0.1:16379`; verified idempotent reservation, quota overflow to next hour, and BullMQ delayed job state surviving queue close/reopen. |
| API health | Pass | Started rebuilt API with isolated PostgreSQL and Redis; `GET /api/health` returned 200 with both dependencies `ok`. |
| Auth route protection | Pass | `GET /auth/me` returned 401 without a session; `GET /api/emails` returned 401. |
| CSRF | Pass | `GET /auth/csrf` returned a session token; `POST /auth/logout` without its header returned 403. |
| Missing OAuth configuration handling | Pass | `GET /auth/google` returned explicit 503 when credentials were unset. |

Run the real Redis tests locally with `REDIS_URL=redis://localhost:6379 npm run test:integration:redis` after starting Redis.

## Blocked / not verified in this environment

| Check | Reason |
| --- | --- |
| Elasticsearch index creation, scheduled/sent indexing, search endpoint | No Elasticsearch process reachable on configured/default local endpoint (9200). |
| Google OAuth end-to-end | OAuth client ID/secret and registered callback configuration not available. |
| Slack OAuth + live webhook delivery | Slack client credentials/workspace access not available. |
| Ethereal SMTP delivery | Ethereal account credentials not available. |
| Full schedule-to-send and restart scenario through authenticated API | Requires real Google session plus SMTP and Elasticsearch configuration. PostgreSQL migrations and Redis delayed job recovery were independently checked. |
| Compose-based end-to-end run | Docker is not installed in this environment. PostgreSQL and Redis were tested using local services instead. |

## Environment findings

- Local PostgreSQL 14 was listening, but the assignment's Compose role/database (`reachinbox`) were not installed. A separate `reachinbox_verify` test database was created using the current local OS role, migrations were applied and checked, then it was removed after verification.
- Redis was started temporarily on port `16379` for tests and shut down after the run.
- No `backend/.env` file was present; no credentials were created or checked into Git.
- `npm audit` currently reports 3 high advisories in the Prisma CLI config dependency chain and 2 critical + 1 moderate advisories in Vitest's test-runner dependencies. Prisma's transitive config chain is also included by `npm audit --omit=dev`. Treat dependency security as an open production-readiness blocker. No forced major upgrade was applied during this verification run.

## Corrective change made during verification

Removed duplicate `/auth/csrf`, `/auth/me`, and `/auth/logout` route registrations discovered while inspecting the API route table. Rebuilt the API and verified there is a single canonical route registration for each.
