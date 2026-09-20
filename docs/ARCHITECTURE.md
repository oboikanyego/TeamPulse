# TeamPulse architecture

## Runtime

```text
Angular SPA
   | HTTPS / Socket.IO
   v
Node.js + Express API
   |             |
   v             v
PostgreSQL     Redis
```

## Design decisions

- PostgreSQL is the source of truth for users, workspaces, projects, tasks, comments, activity and notifications.
- JWT authentication keeps the public demo simple while API middleware enforces membership and role checks.
- Socket.IO publishes task and comment changes to workspace rooms.
- Redis is optional at runtime and used for dashboard caching. The API stays available if Redis is temporarily unavailable.
- Database schema creation and demo seed are idempotent so a fresh hosted database can bootstrap on first start.
- Angular uses standalone components, signals for local/auth state and RxJS for HTTP/search flows.

## V1 boundaries

Included: auth, RBAC, workspaces, members, projects, kanban tasks, sprint planning/lifecycle, task time tracking, delivery analytics, capacity reporting, GitHub repository integration, PR/task links, CI engineering insights, workspace notification preferences, Slack incoming-webhook delivery, automated blocker/overdue/CI checks, daily digests, comments, activity, in-app notifications, dashboard, realtime updates, Swagger/OpenAPI docs, demo seed, CI and deployment.

Deferred: billing, email delivery and AI features.


## API documentation

The OpenAPI 3.0 specification is versioned in `apps/api/src/openapi.ts`. The API serves the raw document at `/openapi.json` and interactive Swagger UI at `/docs`.


## GitHub integration

The API reads GitHub repository, pull request, commit and Actions data on demand. Public repositories work anonymously within GitHub's unauthenticated rate limits; `GITHUB_TOKEN` is optional and should only be provided through deployment environment variables. TeamPulse stores only workspace repository coordinates and task-to-PR references in the current data layer.


## Persistence and runtime hardening

Production persistence is provided through a managed PostgreSQL state store when `DATABASE_URL` is configured. The API initializes the state table at startup, restores application state before serving requests, batches persistence writes after mutations, and exposes `/ready` separately from `/health`.

Redis is optional and used as a cache adapter when `REDIS_URL` is configured. Keys are namespaced with `teampulse:` to avoid collisions when sharing a Redis instance. GitHub engineering insights use a short-lived cache to reduce external API calls.

The embedded PGlite runtime has been removed from the production API dependency graph to avoid memory pressure on the free Render service.


## Notifications and automation

Workspace preferences determine whether assignment, blocker, overdue, sprint, CI-failure and daily-digest events are delivered. In-app notifications are generated per recipient. Slack delivery uses an incoming webhook stored server-side and is never returned to the browser.

Automation executes on an hourly server interval and can also be invoked by an admin or manager through the API. Deduplication records prevent the same blocker state, overdue due-date, GitHub Actions run or daily digest from generating repeated alerts. CI checks reuse connected GitHub repositories and inspect recent workflow runs.

On infrastructure that sleeps when idle, interval execution is best-effort. A future production upgrade can move the same automation function behind a durable scheduler/worker without changing notification semantics.
