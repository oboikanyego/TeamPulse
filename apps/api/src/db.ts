import bcrypt from 'bcryptjs';
import pg from 'pg';

const { Pool } = pg;
const databaseUrl = process.env.DATABASE_URL || 'postgresql://teampulse:teampulse@localhost:5432/teampulse';

export const pool = new Pool({
  connectionString: databaseUrl,
  ssl: databaseUrl.includes('localhost') ? false : { rejectUnauthorized: false }
});

export async function bootstrapDatabase(): Promise<void> {
  await pool.query(`
    CREATE EXTENSION IF NOT EXISTS pgcrypto;

    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      avatar_url TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS workspaces (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS workspace_members (
      workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('admin','manager','member')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (workspace_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS projects (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'Planning',
      priority TEXT NOT NULL DEFAULT 'Medium',
      start_date DATE,
      target_date DATE,
      owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      type TEXT NOT NULL DEFAULT 'Task',
      status TEXT NOT NULL DEFAULT 'Backlog',
      priority TEXT NOT NULL DEFAULT 'Medium',
      assignee_id UUID REFERENCES users(id) ON DELETE SET NULL,
      reporter_id UUID REFERENCES users(id) ON DELETE SET NULL,
      story_points INTEGER,
      due_date DATE,
      labels TEXT[] NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS comments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS activities (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
      entity_type TEXT NOT NULL,
      entity_id UUID,
      action TEXT NOT NULL,
      metadata JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
      message TEXT NOT NULL,
      read_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_projects_workspace ON projects(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_id);
    CREATE INDEX IF NOT EXISTS idx_activity_workspace_created ON activities(workspace_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications(user_id, created_at DESC);
  `);

  if (process.env.SEED_DEMO !== 'false') {
    await seedDemo();
  }
}

async function seedDemo(): Promise<void> {
  const passwordHash = await bcrypt.hash('Demo123!', 10);
  const demoUsers = [
    ['TeamPulse Admin', 'admin@teampulse.demo'],
    ['Maya Manager', 'manager@teampulse.demo'],
    ['Devon Developer', 'developer@teampulse.demo']
  ] as const;

  for (const [name, email] of demoUsers) {
    await pool.query(
      `INSERT INTO users(name, email, password_hash)
       VALUES ($1, $2, $3)
       ON CONFLICT(email) DO NOTHING`,
      [name, email, passwordHash]
    );
  }

  const users = await pool.query(
    `SELECT id, email FROM users WHERE email = ANY($1::text[])`,
    [demoUsers.map(([, email]) => email)]
  );
  const byEmail = new Map(users.rows.map((row) => [row.email as string, row.id as string]));
  const adminId = byEmail.get('admin@teampulse.demo');
  const managerId = byEmail.get('manager@teampulse.demo');
  const developerId = byEmail.get('developer@teampulse.demo');
  if (!adminId || !managerId || !developerId) return;

  let workspace = await pool.query(
    `SELECT id FROM workspaces WHERE owner_id = $1 AND name = 'Demo Engineering' LIMIT 1`,
    [adminId]
  );
  if (!workspace.rowCount) {
    workspace = await pool.query(
      `INSERT INTO workspaces(name, description, owner_id)
       VALUES ('Demo Engineering', 'A seeded workspace showing TeamPulse with realistic delivery data.', $1)
       RETURNING id`,
      [adminId]
    );
  }
  const workspaceId = workspace.rows[0].id as string;

  for (const [userId, role] of [[adminId, 'admin'], [managerId, 'manager'], [developerId, 'member']] as const) {
    await pool.query(
      `INSERT INTO workspace_members(workspace_id, user_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT(workspace_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
      [workspaceId, userId, role]
    );
  }

  const projectCount = await pool.query(`SELECT count(*)::int AS count FROM projects WHERE workspace_id = $1`, [workspaceId]);
  if ((projectCount.rows[0]?.count ?? 0) > 0) return;

  const project = await pool.query(
    `INSERT INTO projects(workspace_id, name, description, status, priority, start_date, target_date, owner_id)
     VALUES ($1, 'Claims Platform', 'Modernise claims intake, communications and operational visibility.', 'Active', 'High', CURRENT_DATE - 14, CURRENT_DATE + 28, $2)
     RETURNING id`,
    [workspaceId, managerId]
  );
  const projectId = project.rows[0].id as string;

  const tasks = [
    ['Implement Graph notifications', 'Wire mailbox change notifications into the intake edge.', 'Feature', 'In Progress', 'High', developerId, 5, 5],
    ['Add delivery health dashboard', 'Expose project health and blocked work metrics.', 'Feature', 'Review', 'Medium', managerId, 3, 2],
    ['Fix duplicate activity events', 'Deduplicate repeated socket events after reconnect.', 'Bug', 'To Do', 'High', developerId, 2, 3],
    ['Document production runbook', 'Capture deployment, rollback and support steps.', 'Task', 'Backlog', 'Low', managerId, 2, 8],
    ['CI smoke tests', 'Run authenticated API smoke tests after deployment.', 'Improvement', 'Done', 'Medium', developerId, 3, -1],
    ['Redis dashboard cache', 'Cache workspace summary and invalidate on task updates.', 'Feature', 'Blocked', 'High', developerId, 5, 4]
  ] as const;

  for (const [title, description, type, status, priority, assigneeId, points, dueOffset] of tasks) {
    await pool.query(
      `INSERT INTO tasks(project_id, title, description, type, status, priority, assignee_id, reporter_id, story_points, due_date, labels)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,CURRENT_DATE + $10::int,ARRAY['demo'])`,
      [projectId, title, description, type, status, priority, assigneeId, adminId, points, dueOffset]
    );
  }

  await pool.query(
    `INSERT INTO activities(workspace_id, actor_id, entity_type, entity_id, action, metadata)
     VALUES ($1, $2, 'workspace', $1, 'seeded demo workspace', '{"source":"seed"}')`,
    [workspaceId, adminId]
  );
}
