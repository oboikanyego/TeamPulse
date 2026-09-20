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

Included: auth, RBAC, workspaces, members, projects, kanban tasks, comments, activity, notifications, dashboard, realtime updates, demo seed, CI and deployment.

Deferred: billing, email delivery, GitHub/Slack integrations, sprints, time tracking and AI features.
