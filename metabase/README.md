# TeamPulse Metabase OSS

This directory contains a self-hosted Metabase Open Source deployment for TeamPulse.

## Local start

```bash
cp metabase/.env.example metabase/.env
docker compose --env-file metabase/.env -f metabase/docker-compose.yml up -d
```

Open http://localhost:3000 and complete the Metabase setup wizard.

## Application database

Metabase uses its own PostgreSQL application database for dashboards, questions, users and metadata. Do not use H2 for production.

## TeamPulse analytics source

Add the TeamPulse PostgreSQL database separately under **Admin > Databases** and give Metabase a read-only database user.

Use only the TeamPulse reporting model:
- bi_projects
- bi_sprints
- bi_tasks
- bi_members
- bi_time_entries
- bi_workspace_summary

## Dashboard contract

Create an Executive Delivery dashboard and add a dashboard filter named `workspace_id`. Every card must map this filter to its `workspace_id` field.

Publish the dashboard using **Guest embedding** and make `workspace_id` a **Locked** parameter.

Then configure the TeamPulse API:

```text
METABASE_URL=https://your-metabase-host
METABASE_SECRET_KEY=<guest embedding secret>
METABASE_DASHBOARD_ID=<dashboard id>
```

TeamPulse generates the signed JWT server-side and never exposes the Metabase secret to Angular.

## Open Source limitations

The OSS guest embed is view-only and includes the "Powered by Metabase" branding. TeamPulse keeps its native reporting UI available as a fallback.
