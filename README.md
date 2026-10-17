# ReachInbox Email Scheduler

Backend-first implementation of the ReachInbox full-stack email scheduler assignment. The frontend is intentionally not included yet, pending the Figma screenshots.

## Status

The repository is being implemented in incremental, documented milestones. See `docs/` for architecture and feature notes.

## Prerequisites

- Node.js 22+
- Docker Compose (or local PostgreSQL 16+, Redis 7+, and Elasticsearch 8.x)
- Google OAuth credentials, Ethereal SMTP credentials, and Slack OAuth credentials for those integrations

## Start dependencies

```sh
docker compose up -d
cd backend
cp .env.example .env
npm install
npm run db:generate
npm run db:migrate:dev
```

Run the API and worker in separate terminals:

```sh
cd backend && npm run dev:api
cd backend && npm run dev:worker
```

Set integration credentials in `backend/.env` before using Google login, live Ethereal sends, or Slack notifications. Never commit `.env`.

## Architecture

- PostgreSQL is the source of truth for users, senders, email requests, and delivery state.
- BullMQ + persistent Redis delayed jobs perform scheduling and execution; no cron jobs are used.
- API/worker responsibilities and crash recovery are documented in `docs/architecture.md` as the milestones land.

## Implementation and verification

Feature mapping, operational limits, test commands, setup steps, and known trade-offs will be maintained in this README as features are completed. Demo video and GitHub collaborator access are submission steps that require the project owner's account.
