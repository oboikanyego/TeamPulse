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

Included: auth, RBAC, workspaces, members, projects, kanban tasks, sprint planning/lifecycle, task time tracking, delivery analytics, capacity reporting, GitHub repository integration, PR/task links, CI engineering insights, comments, activity, notifications, dashboard, realtime updates, Swagger/OpenAPI docs, demo seed, CI and deployment.

Deferred: billing, email delivery, Slack integration and AI features.


## API documentation

The OpenAPI 3.0 specification is versioned in `apps/api/src/openapi.ts`. The API serves the raw document at `/openapi.json` and interactive Swagger UI at `/docs`.


## GitHub integration

The API reads GitHub repository, pull request, commit and Actions data on demand. Public repositories work anonymously within GitHub's unauthenticated rate limits; `GITHUB_TOKEN` is optional and should only be provided through deployment environment variables. TeamPulse stores only workspace repository coordinates and task-to-PR references in the current data layer.
