import pg from 'pg';

const { Pool } = pg;
function normalizeDatabaseUrl(raw?: string): string | undefined {
  const value = raw?.trim();
  if (!value) return undefined;
  try {
    const url = new URL(value);
    const region = process.env.DATABASE_REGION?.trim();
    if (/^dpg-[a-z0-9-]+$/i.test(url.hostname) && region) {
      url.hostname = `${url.hostname}.${region}-postgres.render.com`;
      url.searchParams.set('uselibpqcompat','true');
      url.searchParams.set('sslmode','require');
      url.searchParams.set('sslnegotiation','direct');
      return url.toString();
    }
    return value;
  } catch {
    return value;
  }
}

const databaseUrl = normalizeDatabaseUrl(process.env.DATABASE_URL);
const pool = databaseUrl
  ? new Pool({
      connectionString: databaseUrl,
      connectionTimeoutMillis: 10000,
      keepAlive: true,
    })
  : null;

let persistenceAvailable = !!pool;
export let persistenceMode: 'managed-postgres' | 'memory-fallback' = pool ? 'managed-postgres' : 'memory-fallback';

export async function initPersistence(): Promise<void> {
  if (!pool || !persistenceAvailable) return;
  try {
    await pool.query(`
    CREATE TABLE IF NOT EXISTS app_state (
      id TEXT PRIMARY KEY,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS bi_projects (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, name TEXT NOT NULL, status TEXT NOT NULL, priority TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS bi_projects_workspace_idx ON bi_projects(workspace_id);

    CREATE TABLE IF NOT EXISTS bi_sprints (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, name TEXT NOT NULL, status TEXT NOT NULL,
      start_date DATE NULL, end_date DATE NULL
    );
    CREATE INDEX IF NOT EXISTS bi_sprints_workspace_idx ON bi_sprints(workspace_id);

    CREATE TABLE IF NOT EXISTS bi_tasks (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, project_id TEXT NOT NULL, sprint_id TEXT NULL,
      title TEXT NOT NULL, status TEXT NOT NULL, priority TEXT NOT NULL, assignee_id TEXT NULL,
      story_points INTEGER NULL, due_date DATE NULL, updated_at TIMESTAMPTZ NOT NULL
    );
    CREATE INDEX IF NOT EXISTS bi_tasks_workspace_idx ON bi_tasks(workspace_id);
    CREATE INDEX IF NOT EXISTS bi_tasks_status_idx ON bi_tasks(workspace_id,status);

    CREATE TABLE IF NOT EXISTS bi_members (
      workspace_id TEXT NOT NULL, user_id TEXT NOT NULL, name TEXT NOT NULL, email TEXT NOT NULL, role TEXT NOT NULL,
      PRIMARY KEY(workspace_id,user_id)
    );

    CREATE TABLE IF NOT EXISTS bi_time_entries (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, task_id TEXT NOT NULL, user_id TEXT NOT NULL,
      minutes INTEGER NOT NULL, spent_at DATE NOT NULL, created_at TIMESTAMPTZ NOT NULL
    );
    CREATE INDEX IF NOT EXISTS bi_time_workspace_idx ON bi_time_entries(workspace_id);

    CREATE OR REPLACE VIEW bi_workspace_summary AS
    SELECT
      p.workspace_id,
      COUNT(t.id)::int AS total_tasks,
      COUNT(t.id) FILTER (WHERE t.status='Done')::int AS completed_tasks,
      COUNT(t.id) FILTER (WHERE t.status='Blocked')::int AS blocked_tasks,
      COUNT(t.id) FILTER (WHERE t.due_date < CURRENT_DATE AND t.status <> 'Done')::int AS overdue_tasks,
      COALESCE(SUM(t.story_points),0)::int AS planned_points,
      COALESCE(SUM(t.story_points) FILTER (WHERE t.status='Done'),0)::int AS delivered_points
    FROM bi_projects p
    LEFT JOIN bi_tasks t ON t.project_id=p.id
    GROUP BY p.workspace_id;
  `);
    persistenceAvailable = true;
    persistenceMode = 'managed-postgres';
  } catch (error) {
    persistenceAvailable = false;
    persistenceMode = 'memory-fallback';
    console.error('Postgres unavailable; continuing with memory fallback:', error instanceof Error ? error.message : error);
  }
}

export async function loadState<T>(): Promise<T | null> {
  if (!pool || !persistenceAvailable) return null;
  const result = await pool.query('SELECT payload FROM app_state WHERE id = $1 LIMIT 1', ['primary']);
  return (result.rows[0]?.payload as T | undefined) ?? null;
}

export async function saveState(payload: unknown): Promise<void> {
  if (!pool || !persistenceAvailable) return;
  const state = payload as any;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO app_state(id,payload,updated_at)
       VALUES('primary',$1::jsonb,now())
       ON CONFLICT(id) DO UPDATE SET payload=EXCLUDED.payload,updated_at=now()`,
      [JSON.stringify(payload)]
    );

    await client.query('TRUNCATE bi_time_entries, bi_tasks, bi_sprints, bi_projects, bi_members');

    for (const project of state.projects ?? []) {
      await client.query(
        'INSERT INTO bi_projects(id,workspace_id,name,status,priority) VALUES($1,$2,$3,$4,$5)',
        [project.id,project.workspace_id,project.name,project.status,project.priority]
      );
    }
    for (const sprint of state.sprints ?? []) {
      await client.query(
        'INSERT INTO bi_sprints(id,workspace_id,name,status,start_date,end_date) VALUES($1,$2,$3,$4,$5,$6)',
        [sprint.id,sprint.workspace_id,sprint.name,sprint.status,sprint.start_date,sprint.end_date]
      );
    }

    const projectWorkspace = new Map((state.projects ?? []).map((p:any)=>[p.id,p.workspace_id]));
    for (const task of state.tasks ?? []) {
      const workspaceId = projectWorkspace.get(task.project_id);
      if (!workspaceId) continue;
      await client.query(
        'INSERT INTO bi_tasks(id,workspace_id,project_id,sprint_id,title,status,priority,assignee_id,story_points,due_date,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
        [task.id,workspaceId,task.project_id,task.sprint_id,task.title,task.status,task.priority,task.assignee_id,task.story_points,task.due_date,task.updated_at]
      );
    }

    const userMap = new Map((state.users ?? []).map((u:any)=>[u.id,u]));
    for (const membership of state.memberships ?? []) {
      const user:any = userMap.get(membership.user_id);
      if (!user) continue;
      await client.query(
        'INSERT INTO bi_members(workspace_id,user_id,name,email,role) VALUES($1,$2,$3,$4,$5)',
        [membership.workspace_id,membership.user_id,user.name,user.email,membership.role]
      );
    }

    const taskWorkspace = new Map((state.tasks ?? []).map((t:any)=>[t.id,projectWorkspace.get(t.project_id)]));
    for (const entry of state.timeEntries ?? []) {
      const workspaceId = taskWorkspace.get(entry.task_id);
      if (!workspaceId) continue;
      await client.query(
        'INSERT INTO bi_time_entries(id,workspace_id,task_id,user_id,minutes,spent_at,created_at) VALUES($1,$2,$3,$4,$5,$6,$7)',
        [entry.id,workspaceId,entry.task_id,entry.user_id,entry.minutes,entry.spent_at,entry.created_at]
      );
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function persistenceReady(): Promise<boolean> {
  if (!pool || !persistenceAvailable) return false;
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}
