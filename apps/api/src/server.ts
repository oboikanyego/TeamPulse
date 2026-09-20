import http from 'node:http';
import bcrypt from 'bcryptjs';
import cors from 'cors';
import express, { type Response } from 'express';
import helmet from 'helmet';
import { Redis } from 'ioredis';
import { Server } from 'socket.io';
import { authRequired, type AuthedRequest, signToken, type Role, verifyToken } from './auth.js';
import { bootstrapDatabase, pool } from './db.js';
import {
  commentSchema,
  credentialsSchema,
  memberSchema,
  projectSchema,
  registerSchema,
  taskPatchSchema,
  taskSchema,
  workspaceSchema
} from './validation.js';

const port = Number(process.env.PORT || 8080);
const corsOrigin = process.env.CORS_ORIGIN || '*';

function param(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

const app = express();
app.use(helmet());
app.use(cors({ origin: corsOrigin === '*' ? true : corsOrigin.split(',').map((v) => v.trim()), credentials: false }));
app.use(express.json({ limit: '1mb' }));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: corsOrigin === '*' ? true : corsOrigin.split(',').map((v) => v.trim()) }
});

let redis: Redis | null = null;
if (process.env.REDIS_URL) {
  redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 1, lazyConnect: true });
  redis.on('error', (error: Error) => console.warn('Redis unavailable:', error.message));
  redis.connect().catch((error: Error) => console.warn('Redis connection skipped:', error.message));
}

io.use((socket, next) => {
  const user = verifyToken(socket.handshake.auth?.token as string | undefined);
  if (!user) return next(new Error('Authentication required'));
  socket.data.user = user;
  next();
});

io.on('connection', (socket) => {
  socket.on('workspace:join', async (workspaceId: string) => {
    const userId = socket.data.user?.id as string | undefined;
    if (workspaceId && userId && await membership(userId, workspaceId)) {
      await socket.join(`workspace:${workspaceId}`);
    }
  });
  socket.on('workspace:leave', async (workspaceId: string) => {
    if (workspaceId) await socket.leave(`workspace:${workspaceId}`);
  });
});

app.get('/health', async (_req, res) => {
  const db = await pool.query('SELECT 1 AS ok');
  res.json({ status: 'ok', database: db.rows[0].ok === 1, redis: redis?.status ?? 'disabled' });
});

app.post('/api/auth/register', async (req, res) => {
  const body = registerSchema.parse(req.body);
  const exists = await pool.query('SELECT id FROM users WHERE email = $1', [body.email]);
  if (exists.rowCount) return res.status(409).json({ message: 'Email already registered' });

  const hash = await bcrypt.hash(body.password, 10);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const userResult = await client.query(
      `INSERT INTO users(name,email,password_hash) VALUES ($1,$2,$3)
       RETURNING id,name,email,avatar_url`,
      [body.name, body.email, hash]
    );
    const user = userResult.rows[0];
    const workspaceResult = await client.query(
      `INSERT INTO workspaces(name,description,owner_id)
       VALUES ($1,$2,$3) RETURNING id,name,description`,
      [`${body.name}'s Workspace`, 'Personal TeamPulse workspace', user.id]
    );
    await client.query(
      `INSERT INTO workspace_members(workspace_id,user_id,role) VALUES ($1,$2,'admin')`,
      [workspaceResult.rows[0].id, user.id]
    );
    await client.query('COMMIT');
    return res.status(201).json({ token: signToken(user), user, workspace: workspaceResult.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
});

app.post('/api/auth/login', async (req, res) => {
  const body = credentialsSchema.parse(req.body);
  const result = await pool.query(
    'SELECT id,name,email,avatar_url,password_hash FROM users WHERE email = $1',
    [body.email]
  );
  const user = result.rows[0];
  if (!user || !(await bcrypt.compare(body.password, user.password_hash))) {
    return res.status(401).json({ message: 'Invalid email or password' });
  }
  const safeUser = { id: user.id, name: user.name, email: user.email, avatar_url: user.avatar_url };
  return res.json({ token: signToken(safeUser), user: safeUser });
});

app.use('/api', authRequired);

app.get('/api/me', async (req: AuthedRequest, res) => {
  const result = await pool.query(
    'SELECT id,name,email,avatar_url,created_at FROM users WHERE id = $1',
    [req.user!.id]
  );
  res.json(result.rows[0]);
});

async function membership(userId: string, workspaceId: string): Promise<{ role: Role } | null> {
  const result = await pool.query(
    'SELECT role FROM workspace_members WHERE workspace_id=$1 AND user_id=$2',
    [workspaceId, userId]
  );
  return result.rows[0] ?? null;
}

async function requireWorkspace(
  req: AuthedRequest,
  res: Response,
  allowed: Role[] = ['admin', 'manager', 'member']
): Promise<Role | null> {
  const role = await membership(req.user!.id, param(req.params.workspaceId));
  if (!role) {
    res.status(403).json({ message: 'Workspace access denied' });
    return null;
  }
  if (!allowed.includes(role.role)) {
    res.status(403).json({ message: 'Insufficient workspace role' });
    return null;
  }
  return role.role;
}

async function projectWorkspace(projectId: string): Promise<string | null> {
  const result = await pool.query('SELECT workspace_id FROM projects WHERE id=$1', [projectId]);
  return result.rows[0]?.workspace_id ?? null;
}

async function taskContext(taskId: string): Promise<{ workspaceId: string; projectId: string } | null> {
  const result = await pool.query(
    `SELECT p.workspace_id, t.project_id
     FROM tasks t JOIN projects p ON p.id=t.project_id
     WHERE t.id=$1`,
    [taskId]
  );
  return result.rows[0] ? { workspaceId: result.rows[0].workspace_id, projectId: result.rows[0].project_id } : null;
}

async function logActivity(
  workspaceId: string,
  actorId: string,
  entityType: string,
  entityId: string | null,
  action: string,
  metadata: object = {}
): Promise<void> {
  await pool.query(
    `INSERT INTO activities(workspace_id,actor_id,entity_type,entity_id,action,metadata)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [workspaceId, actorId, entityType, entityId, action, JSON.stringify(metadata)]
  );
}

async function invalidateDashboard(workspaceId: string): Promise<void> {
  if (!redis || redis.status !== 'ready') return;
  await redis.del(`dashboard:${workspaceId}`).catch(() => undefined);
}

app.get('/api/workspaces', async (req: AuthedRequest, res) => {
  const result = await pool.query(
    `SELECT w.id,w.name,w.description,w.created_at,wm.role,
      (SELECT count(*)::int FROM projects p WHERE p.workspace_id=w.id) AS project_count
     FROM workspaces w
     JOIN workspace_members wm ON wm.workspace_id=w.id
     WHERE wm.user_id=$1
     ORDER BY w.created_at`,
    [req.user!.id]
  );
  res.json(result.rows);
});

app.post('/api/workspaces', async (req: AuthedRequest, res) => {
  const body = workspaceSchema.parse(req.body);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const workspace = await client.query(
      `INSERT INTO workspaces(name,description,owner_id) VALUES ($1,$2,$3)
       RETURNING id,name,description,created_at`,
      [body.name, body.description, req.user!.id]
    );
    await client.query(
      `INSERT INTO workspace_members(workspace_id,user_id,role) VALUES ($1,$2,'admin')`,
      [workspace.rows[0].id, req.user!.id]
    );
    await client.query('COMMIT');
    res.status(201).json({ ...workspace.rows[0], role: 'admin' });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
});

app.get('/api/workspaces/:workspaceId/members', async (req: AuthedRequest, res) => {
  if (!(await requireWorkspace(req, res))) return;
  const result = await pool.query(
    `SELECT u.id,u.name,u.email,u.avatar_url,wm.role,
       (SELECT count(*)::int FROM tasks t
        JOIN projects p ON p.id=t.project_id
        WHERE p.workspace_id=$1 AND t.assignee_id=u.id AND t.status <> 'Done') AS active_tasks
     FROM workspace_members wm
     JOIN users u ON u.id=wm.user_id
     WHERE wm.workspace_id=$1
     ORDER BY CASE wm.role WHEN 'admin' THEN 1 WHEN 'manager' THEN 2 ELSE 3 END,u.name`,
    [param(req.params.workspaceId)]
  );
  res.json(result.rows);
});

app.post('/api/workspaces/:workspaceId/members', async (req: AuthedRequest, res) => {
  if (!(await requireWorkspace(req, res, ['admin', 'manager']))) return;
  const body = memberSchema.parse(req.body);
  const user = await pool.query('SELECT id,name,email FROM users WHERE email=$1', [body.email]);
  if (!user.rowCount) return res.status(404).json({ message: 'That user must register before being added' });
  await pool.query(
    `INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1,$2,$3)
     ON CONFLICT(workspace_id,user_id) DO UPDATE SET role=EXCLUDED.role`,
    [param(req.params.workspaceId), user.rows[0].id, body.role]
  );
  await logActivity(param(req.params.workspaceId), req.user!.id, 'member', user.rows[0].id, 'updated workspace membership', { role: body.role });
  res.status(201).json({ ...user.rows[0], role: body.role });
});

app.get('/api/workspaces/:workspaceId/projects', async (req: AuthedRequest, res) => {
  if (!(await requireWorkspace(req, res))) return;
  const result = await pool.query(
    `SELECT p.*,
      (SELECT count(*)::int FROM tasks t WHERE t.project_id=p.id) AS task_count,
      (SELECT count(*)::int FROM tasks t WHERE t.project_id=p.id AND t.status='Done') AS done_count,
      (SELECT count(*)::int FROM tasks t WHERE t.project_id=p.id AND t.status='Blocked') AS blocked_count
     FROM projects p WHERE p.workspace_id=$1 ORDER BY p.created_at DESC`,
    [param(req.params.workspaceId)]
  );
  res.json(result.rows);
});

app.post('/api/workspaces/:workspaceId/projects', async (req: AuthedRequest, res) => {
  if (!(await requireWorkspace(req, res, ['admin', 'manager']))) return;
  const body = projectSchema.parse(req.body);
  const result = await pool.query(
    `INSERT INTO projects(workspace_id,name,description,status,priority,start_date,target_date,owner_id)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [param(req.params.workspaceId), body.name, body.description, body.status, body.priority, body.startDate ?? null, body.targetDate ?? null, req.user!.id]
  );
  await logActivity(param(req.params.workspaceId), req.user!.id, 'project', result.rows[0].id, 'created project', { name: body.name });
  await invalidateDashboard(param(req.params.workspaceId));
  io.to(`workspace:${param(req.params.workspaceId)}`).emit('project.updated', result.rows[0]);
  res.status(201).json(result.rows[0]);
});

app.get('/api/projects/:projectId/tasks', async (req: AuthedRequest, res) => {
  const workspaceId = await projectWorkspace(param(req.params.projectId));
  if (!workspaceId || !(await membership(req.user!.id, workspaceId))) return res.status(403).json({ message: 'Project access denied' });
  const result = await pool.query(
    `SELECT t.*,a.name AS assignee_name,r.name AS reporter_name
     FROM tasks t
     LEFT JOIN users a ON a.id=t.assignee_id
     LEFT JOIN users r ON r.id=t.reporter_id
     WHERE t.project_id=$1
     ORDER BY t.updated_at DESC`,
    [param(req.params.projectId)]
  );
  res.json(result.rows);
});

app.post('/api/projects/:projectId/tasks', async (req: AuthedRequest, res) => {
  const workspaceId = await projectWorkspace(param(req.params.projectId));
  if (!workspaceId) return res.status(404).json({ message: 'Project not found' });
  const role = await membership(req.user!.id, workspaceId);
  if (!role) return res.status(403).json({ message: 'Project access denied' });
  const body = taskSchema.parse(req.body);
  const result = await pool.query(
    `INSERT INTO tasks(project_id,title,description,type,status,priority,assignee_id,reporter_id,story_points,due_date,labels)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [param(req.params.projectId), body.title, body.description, body.type, body.status, body.priority, body.assigneeId ?? null, req.user!.id, body.storyPoints ?? null, body.dueDate ?? null, body.labels]
  );
  if (body.assigneeId && body.assigneeId !== req.user!.id) {
    await pool.query(
      `INSERT INTO notifications(user_id,workspace_id,message) VALUES($1,$2,$3)`,
      [body.assigneeId, workspaceId, `${req.user!.name} assigned "${body.title}" to you`]
    );
  }
  await logActivity(workspaceId, req.user!.id, 'task', result.rows[0].id, 'created task', { title: body.title });
  await invalidateDashboard(workspaceId);
  io.to(`workspace:${workspaceId}`).emit('task.created', result.rows[0]);
  res.status(201).json(result.rows[0]);
});

app.patch('/api/tasks/:taskId', async (req: AuthedRequest, res) => {
  const context = await taskContext(param(req.params.taskId));
  if (!context) return res.status(404).json({ message: 'Task not found' });
  if (!(await membership(req.user!.id, context.workspaceId))) return res.status(403).json({ message: 'Task access denied' });
  const body = taskPatchSchema.parse(req.body);
  const fields: string[] = [];
  const values: unknown[] = [];
  const mapping: Record<string, string> = {
    title: 'title', description: 'description', type: 'type', status: 'status', priority: 'priority',
    assigneeId: 'assignee_id', storyPoints: 'story_points', dueDate: 'due_date', labels: 'labels'
  };
  for (const [key, column] of Object.entries(mapping)) {
    if (key in body) {
      values.push((body as Record<string, unknown>)[key] ?? null);
      fields.push(`${column}=$${values.length}`);
    }
  }
  if (!fields.length) return res.status(400).json({ message: 'No task fields supplied' });
  values.push(param(req.params.taskId));
  const result = await pool.query(
    `UPDATE tasks SET ${fields.join(',')},updated_at=now() WHERE id=$${values.length} RETURNING *`,
    values
  );
  await logActivity(context.workspaceId, req.user!.id, 'task', param(req.params.taskId), 'updated task', body);
  await invalidateDashboard(context.workspaceId);
  io.to(`workspace:${context.workspaceId}`).emit('task.updated', result.rows[0]);
  res.json(result.rows[0]);
});

app.get('/api/tasks/:taskId/comments', async (req: AuthedRequest, res) => {
  const context = await taskContext(param(req.params.taskId));
  if (!context || !(await membership(req.user!.id, context.workspaceId))) return res.status(403).json({ message: 'Task access denied' });
  const result = await pool.query(
    `SELECT c.id,c.body,c.created_at,u.id AS user_id,u.name AS user_name
     FROM comments c JOIN users u ON u.id=c.user_id
     WHERE c.task_id=$1 ORDER BY c.created_at`,
    [param(req.params.taskId)]
  );
  res.json(result.rows);
});

app.post('/api/tasks/:taskId/comments', async (req: AuthedRequest, res) => {
  const context = await taskContext(param(req.params.taskId));
  if (!context || !(await membership(req.user!.id, context.workspaceId))) return res.status(403).json({ message: 'Task access denied' });
  const body = commentSchema.parse(req.body);
  const result = await pool.query(
    `INSERT INTO comments(task_id,user_id,body) VALUES($1,$2,$3)
     RETURNING id,task_id,user_id,body,created_at`,
    [param(req.params.taskId), req.user!.id, body.body]
  );
  const comment = { ...result.rows[0], user_name: req.user!.name };
  await logActivity(context.workspaceId, req.user!.id, 'comment', result.rows[0].id, 'commented on task', { taskId: param(req.params.taskId) });
  io.to(`workspace:${context.workspaceId}`).emit('comment.created', comment);
  res.status(201).json(comment);
});

app.get('/api/workspaces/:workspaceId/activity', async (req: AuthedRequest, res) => {
  if (!(await requireWorkspace(req, res))) return;
  const result = await pool.query(
    `SELECT a.id,a.action,a.entity_type,a.entity_id,a.metadata,a.created_at,
       COALESCE(u.name,'System') AS actor_name
     FROM activities a LEFT JOIN users u ON u.id=a.actor_id
     WHERE a.workspace_id=$1 ORDER BY a.created_at DESC LIMIT 50`,
    [param(req.params.workspaceId)]
  );
  res.json(result.rows);
});

app.get('/api/workspaces/:workspaceId/dashboard', async (req: AuthedRequest, res) => {
  if (!(await requireWorkspace(req, res))) return;
  const cacheKey = `dashboard:${param(req.params.workspaceId)}`;
  if (redis?.status === 'ready') {
    const cached = await redis.get(cacheKey).catch(() => null);
    if (cached) return res.json(JSON.parse(cached));
  }

  const [taskStats, projects, workload] = await Promise.all([
    pool.query(
      `SELECT
       count(*)::int AS total,
       count(*) FILTER (WHERE t.status='In Progress')::int AS in_progress,
       count(*) FILTER (WHERE t.status='Blocked')::int AS blocked,
       count(*) FILTER (WHERE t.status='Done' AND t.updated_at >= now() - interval '7 days')::int AS completed_week,
       count(*) FILTER (WHERE t.due_date < CURRENT_DATE AND t.status <> 'Done')::int AS overdue
       FROM tasks t JOIN projects p ON p.id=t.project_id WHERE p.workspace_id=$1`,
      [param(req.params.workspaceId)]
    ),
    pool.query(
      `SELECT p.id,p.name,p.status,p.priority,
       count(t.id)::int AS total,
       count(t.id) FILTER (WHERE t.status='Done')::int AS done,
       count(t.id) FILTER (WHERE t.status='Blocked')::int AS blocked
       FROM projects p LEFT JOIN tasks t ON t.project_id=p.id
       WHERE p.workspace_id=$1 GROUP BY p.id ORDER BY p.created_at DESC`,
      [param(req.params.workspaceId)]
    ),
    pool.query(
      `SELECT u.id,u.name,count(t.id) FILTER (WHERE t.status <> 'Done')::int AS active
       FROM workspace_members wm JOIN users u ON u.id=wm.user_id
       LEFT JOIN projects p ON p.workspace_id=wm.workspace_id
       LEFT JOIN tasks t ON t.project_id=p.id AND t.assignee_id=u.id
       WHERE wm.workspace_id=$1 GROUP BY u.id,u.name ORDER BY active DESC,u.name`,
      [param(req.params.workspaceId)]
    )
  ]);

  const payload = { stats: taskStats.rows[0], projects: projects.rows, workload: workload.rows };
  if (redis?.status === 'ready') await redis.set(cacheKey, JSON.stringify(payload), 'EX', 60).catch(() => undefined);
  res.json(payload);
});

app.get('/api/workspaces/:workspaceId/search', async (req: AuthedRequest, res) => {
  if (!(await requireWorkspace(req, res))) return;
  const query = String(req.query.q || '').trim();
  if (query.length < 2) return res.json([]);
  const pattern = `%${query}%`;
  const result = await pool.query(
    `SELECT 'project' AS kind,p.id,p.name AS title,p.description AS subtitle
       FROM projects p WHERE p.workspace_id=$1 AND (p.name ILIKE $2 OR p.description ILIKE $2)
     UNION ALL
     SELECT 'task' AS kind,t.id,t.title,t.status || ' · ' || t.priority AS subtitle
       FROM tasks t JOIN projects p ON p.id=t.project_id
       WHERE p.workspace_id=$1 AND (t.title ILIKE $2 OR t.description ILIKE $2)
     UNION ALL
     SELECT 'member' AS kind,u.id,u.name AS title,u.email AS subtitle
       FROM workspace_members wm JOIN users u ON u.id=wm.user_id
       WHERE wm.workspace_id=$1 AND (u.name ILIKE $2 OR u.email ILIKE $2)
     LIMIT 25`,
    [param(req.params.workspaceId), pattern]
  );
  res.json(result.rows);
});

app.get('/api/notifications', async (req: AuthedRequest, res) => {
  const result = await pool.query(
    `SELECT id,workspace_id,message,read_at,created_at
     FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 40`,
    [req.user!.id]
  );
  res.json(result.rows);
});

app.patch('/api/notifications/:notificationId/read', async (req: AuthedRequest, res) => {
  await pool.query(
    `UPDATE notifications SET read_at=COALESCE(read_at,now()) WHERE id=$1 AND user_id=$2`,
    [param(req.params.notificationId), req.user!.id]
  );
  res.status(204).end();
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(error);
  const message = error instanceof Error ? error.message : 'Unexpected error';
  if (message.includes('validation') || message.includes('Invalid')) {
    return res.status(400).json({ message });
  }
  return res.status(500).json({ message: 'Unexpected server error' });
});

bootstrapDatabase()
  .then(() => {
    server.listen(port, '0.0.0.0', () => console.log(`TeamPulse API listening on :${port}`));
  })
  .catch((error) => {
    console.error('Database bootstrap failed', error);
    process.exit(1);
  });
