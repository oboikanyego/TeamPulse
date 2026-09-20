# TeamPulse

Real-time team operations and delivery dashboard built with Angular, Node.js, PostgreSQL, Redis, and Socket.IO.

## Product scope

TeamPulse gives small engineering teams a production-style workspace for projects, task boards, workload visibility, activity, comments, and delivery health.

## Stack

- Angular 22 + TypeScript + Signals + RxJS
- Node.js + Express + TypeScript
- PostgreSQL
- Redis
- Socket.IO
- Swagger / OpenAPI
- GitHub Actions
- Render

## Demo accounts

Seeded automatically in non-production environments and when `SEED_DEMO=true`:

- `admin@teampulse.demo` / `Demo123!`
- `manager@teampulse.demo` / `Demo123!`
- `developer@teampulse.demo` / `Demo123!`

## Repository layout

- `apps/web` — Angular application
- `apps/api` — Node/Express API
- `.github/workflows` — CI
- `docs` — architecture and product documentation

## Production

- Web: https://teampulse-web-bk.onrender.com
- API: https://teampulse-api-bk.onrender.com
- Swagger: https://teampulse-api-bk.onrender.com/docs
- OpenAPI JSON: https://teampulse-api-bk.onrender.com/openapi.json

## Phase 2 — Sprint planning

TeamPulse now supports sprint creation, Planned/Active/Completed lifecycle states, backlog-to-sprint assignment, sprint goals and dates, point-based completion metrics, and sprint activity events.


## Phase 3 — Time tracking & sprint analytics

TeamPulse now supports task-level work logs, weekly member capacity settings, sprint velocity, planned-vs-delivered story points, active-sprint burndown indicators, logged-time summaries, cycle-time metrics and team utilisation reporting.


## Phase 4 — GitHub integration & engineering insights

TeamPulse can now connect GitHub repositories to a workspace, surface live pull requests, recent commits and GitHub Actions runs, calculate CI success and PR lead-time indicators, and link implementation pull requests directly to delivery tasks.

Public repositories work without a token. Set `GITHUB_TOKEN` in the API environment to increase GitHub API limits or access repositories the token is permitted to read.


## Phase 5 — Production persistence & platform hardening

The API now supports managed PostgreSQL-backed application-state persistence through `DATABASE_URL`, optional Redis caching through `REDIS_URL`, a dedicated `/ready` readiness probe, stable dependency-mode reporting, and no longer loads the embedded PGlite runtime.

Required production configuration:
- `DATABASE_URL`: Render managed PostgreSQL connection URL.
- `JWT_SECRET`: stable high-entropy secret so sessions survive restarts.
- `CORS_ORIGIN`: production web origin.
- `REDIS_URL`: optional Redis/Key Value connection URL. TeamPulse prefixes cache keys with `teampulse:`.

Without `DATABASE_URL`, the API remains available in the explicit `memory-fallback` mode and reports that mode from `/health`.


## Phase 6 — Notifications, Slack & automation

TeamPulse now supports workspace-level notification preferences, in-app notifications, Slack incoming-webhook delivery, task assignment/blocker/sprint alerts, hourly overdue and GitHub Actions failure checks, deduplicated automation history, manual automation runs for testing, and daily delivery digests.

Slack webhook URLs are write-only from the browser perspective: read APIs return only whether Slack is configured, whether delivery is enabled, the optional channel label, and the last update timestamp.

Runtime automation defaults:
- automation interval: 1 hour via `AUTOMATION_INTERVAL_MS` (minimum 1 hour)
- digest hour: 06:00 UTC via `AUTOMATION_DIGEST_HOUR_UTC`
- CI checks: latest completed non-success GitHub Actions run per connected repository
- deduplication: task status/version, due date, workflow-run ID, and digest date

The Render free service can sleep when idle, so interval-based automations are best-effort on the free tier. The manual automation endpoint remains available for deterministic testing.
