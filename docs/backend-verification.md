# Backend verification log

Verification performed on 2026-10-19. This records observed results only; blocked checks are not treated as passed.

## Passed

| Check | Result | Evidence |
| --- | --- | --- |
| TypeScript typecheck | Pass | `cd backend && npm run typecheck` |
| Unit tests | Pass: 10 tests | `cd backend && npm test` |
| Production build | Pass | `cd backend && npm run build` |
| Prisma schema validation | Pass | `DATABASE_URL=... npx prisma validate` |
| PostgreSQL migrations | Pass | Created the project `reachinbox` database under the local PostgreSQL account, applied both committed migrations, and confirmed the database is up to date. Also verified legacy idempotency backfill from a separate fixture database. Existing `reachinbox_demo` was left untouched. |
| Redis rate-limit coordination | Pass: 2 integration tests | Verified against the user's local Redis at `localhost:6379`: idempotent reservation, quota overflow to next hour, and BullMQ delayed job state surviving queue close/reopen. |
| API health | Pass | Local API on port 3001 uses the project `reachinbox` database and Redis; `GET /api/health` returns 200 with both dependencies `ok`. |
| Auth route protection | Pass | `GET /auth/me` returned 401 without a session; `GET /api/emails` returned 401. The actual browser login callback is still pending. |
| CSRF | Pass | `GET /auth/csrf` returned a session token; `POST /auth/logout` without its header returned 403. |
| Google OAuth configuration | Pass, redirect only | With configured credentials, `GET /auth/google` returned 302 to `accounts.google.com`, with callback `http://localhost:3001/auth/google/callback`, `profile email` scopes, client ID present, and OAuth `state` present. Browser consent/callback remains unverified. |
| Ethereal SMTP delivery | Pass | SMTP `verify()` succeeded and one labeled test message was accepted by Ethereal. The preview URL was provided in the local verification session. |
| Worker-to-Ethereal flow | Pass | The real BullMQ worker sent due email through Ethereal and PostgreSQL recorded `SENT` during earlier demo verification. The new project `reachinbox` database is clean and ready for browser-driven schedules. |

Run the real Redis tests locally with `REDIS_URL=redis://localhost:6379 npm run test:integration:redis` after starting Redis.

## Blocked / not verified in this environment

| Check | Reason |
| --- | --- |
| Elasticsearch indexing | Pass | Started the project Compose Elasticsearch container. Health reached yellow. A temporary SENT row was indexed, `searchIndexedAt` was set, and the ES document was fetched with the expected tenant ID; both temporary records were removed. Authenticated UI search still awaits Google sign-in. |
| Google OAuth end-to-end | Redirect configuration passed; user consent and callback completion have not been confirmed in a browser. |
| Slack OAuth + live webhook delivery | Not verified: Slack browser consent and a rate-limit-triggered live message have not been confirmed. |
| Full schedule-to-send and restart scenario through authenticated UI | Worker delivery to Ethereal is verified using a direct database job. The authenticated browser schedule flow and full service restart demo still need verification; Redis delayed-job persistence was checked independently. |
| Compose-based full stack | Partial | Started only this project's `elasticsearch` Compose service. Docker Desktop was available via its bundled CLI; existing unrelated containers were left untouched. PostgreSQL and Redis use existing host services. |

## Environment findings

- Replaced the inaccessible `reachinbox` PostgreSQL role/password URL in ignored `backend/.env` with a local peer-authenticated URL owned by the current macOS PostgreSQL role. Created a fresh project database `reachinbox`; no password or secret was needed.
- Redis on port `6379` is provided by an existing unrelated `graph-h-falkordb-1` container; it was left running and used for integration tests. This Redis container's persistence policy is not the project's Compose AOF configuration.
- Elasticsearch runs in `outboxlabs-elasticsearch-1` on port `9200`, with the project's persistent named volume.
- A local `backend/.env` contains configured credentials and remains ignored/untracked; no values were printed or committed.
- A local `backend/.env` contains configured credentials and remains ignored/untracked; no values were printed or committed.
- `npm audit` reports 3 high advisories in the Prisma CLI config dependency chain and 2 critical + 1 moderate advisories in Vitest's test-runner dependencies. `npm audit --omit=dev` also reports the Prisma transitive chain. Resolve these before considering production readiness; no forced major upgrade has been applied.

## Corrective changes made during verification

- Removed duplicate `/auth/csrf`, `/auth/me`, and `/auth/logout` route registrations.
- Added retry-on-interval behavior for Elasticsearch index initialization, so the worker can recover if Elasticsearch starts after it.
- Verified a single canonical registration for auth routes after rebuilding the API.
- Started Elasticsearch using Docker Desktop's bundled CLI and a temporary per-project Docker client config; removed the temporary config afterward.
