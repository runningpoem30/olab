# Architecture and implementation decisions

This document tracks verified implementation decisions as code is added. It is not a claim that unfinished features are already live.

## Milestone 0 — repository foundation

- Backend is a TypeScript Express application, with separate API and BullMQ worker processes.
- PostgreSQL, Redis, and Elasticsearch are provisioned by Compose with persistent named volumes.
- Runtime secrets and integration credentials are read from environment configuration; `.env` is ignored by Git.
- No scheduling mechanism based on cron is planned or permitted by the assignment.

## Planned system boundaries

1. HTTP API validates user requests and persists canonical email records.
2. A transactional outbox dispatcher hands durable work to BullMQ.
3. BullMQ worker enforces sender-specific pacing and hourly quota using Redis-backed coordination before attempting SMTP delivery.
4. SMTP outcomes are persisted and indexed for search.
5. OAuth-backed Google identity and Slack connection belong to a tenant/user, not a global process setting.

Each section will be updated when its implementation and tests are present.
