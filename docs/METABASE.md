# TeamPulse + Metabase Open Source

## Data source

Point Metabase at the TeamPulse managed PostgreSQL database with a read-only database user. The reporting model is intentionally limited to the `bi_*` tables/views.

Recommended starting dashboard cards:
1. Workspace delivery summary from `bi_workspace_summary`.
2. Tasks by status from `bi_tasks`.
3. Blocked/overdue work from `bi_tasks`.
4. Sprint delivery from `bi_sprints` joined to `bi_tasks`.
5. Logged time by member from `bi_time_entries` joined to `bi_members`.
6. Workload by assignee from `bi_tasks` joined to `bi_members`.

Every card/dashboard used in TeamPulse must expose a `workspace_id` filter. Configure that filter as **Locked** for guest embedding.

## Embed environment

TeamPulse API requires:
```
METABASE_URL=https://your-metabase-host
METABASE_SECRET_KEY=<guest-embed signing key>
METABASE_DASHBOARD_ID=<published dashboard id>
```

The API signs a 10-minute JWT for the configured dashboard and injects:
```json
{"params":{"workspace_id":["<current-workspace-id>"]}}
```

Never place `METABASE_SECRET_KEY` in Angular environment files.

## Production hosting

Metabase itself should use a separate production PostgreSQL database for its own application metadata. Do not use the embedded H2 database for production. TeamPulse PostgreSQL remains the analytics data source.


## OSS deployment resources

Repository assets:
- `metabase/Dockerfile` — official `metabase/metabase:latest` image.
- `metabase/docker-compose.yml` — local OSS + dedicated PostgreSQL application database.
- `metabase/render.yaml.example` — Render Blueprint example using a dedicated Metabase app database.

The Render example intentionally uses a compute class with more than the minimum 1 GB RAM requirement. Review Render pricing before creating that service.

On Metabase OSS, guest embeds are view-only and display Metabase branding. This is expected and does not affect workspace data isolation.
