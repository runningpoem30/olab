# Architecture and implementation decisions

This document tracks verified implementation decisions as code is added. It is not a claim that unfinished features are already live.

## Milestone 0 — repository foundation

- Backend is a TypeScript Express application, with separate API and BullMQ worker processes.
- PostgreSQL, Redis, and Elasticsearch are provisioned by Compose with persistent named volumes.
- Runtime secrets and integration credentials are read from environment configuration; `.env` is ignored by Git.
- No scheduling mechanism based on cron is used.

## Milestone 1 — API, persistence, and integrations

- PostgreSQL stores users, senders, email records, and a queue outbox. `Email.userId + idempotencyKey` is unique.
- Schedule creation writes request email rows and outbox records in a serializable transaction. API sends at most 10,000 distinct recipients per request.
- Outbox worker drains pending records in batches. BullMQ's stable email job ID makes retried enqueue calls idempotent.
- BullMQ delayed jobs persist schedule timing in Redis. Worker uses configurable concurrency, a conditional DB status claim, and a five-minute sending lease to recover stale work.
- Redis Lua reserves both per-sender pacing and per-hour quota atomically across concurrent worker instances. Repeated reservation for one email returns its existing slot.
- Queue jobs delayed by rate quotas remain durable. Notification claims are Redis NX keys, so one transition per sender/hour can send one Slack message.
- Database records are source of truth; Elasticsearch is rebuilt/reconciled from records with `searchIndexedAt = null`.
- Google OAuth session identity maps to a Postgres user. Slack incoming webhook connection is tenant-scoped and OAuth state is HMAC-signed and bound to the session user.

## At-least-once boundary

The outbox guarantees retryable delivery of queue publication; BullMQ guarantees persisted delayed job processing when Redis persistence is retained. SMTP and the relational database cannot participate in one distributed transaction. If SMTP accepts a message and the worker dies before updating Postgres, a retry could result in a duplicate. The worker conditionally claims status and uses stable message IDs but cannot promise exactly-once delivery with vanilla SMTP. That limitation is explicit in the README.

## Burst behavior

With 1,000 jobs at the same due time and a single sender, up to the configured worker concurrency reserve slots. Redis assigns each email an idempotent ordered slot, applying the configured sender delay and placing quota-overflow work into later UTC hourly windows. Jobs are not dropped; BullMQ holds delayed entries, while the outbox works in 100-row batches. Multiple senders get independent quota/pacing keys.

## Operational configuration

Defaults: concurrency `10`, inter-send spacing `2000 ms`, hourly quota `200 per sender`, outbox poll `1 s`, and index reconciliation poll `2 s`. All queue/quota defaults are adjustable through environment variables where intended; campaign-level delay/quota are persisted per email.
