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

The production URLs will be added after the first successful deployment.
