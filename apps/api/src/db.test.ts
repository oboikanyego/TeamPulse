import assert from 'node:assert/strict';
import test from 'node:test';

test('embedded Postgres bootstraps schema and demo data', async () => {
  process.env.PGLITE_DATA_DIR = 'memory://';
  process.env.SEED_DEMO = 'true';
  delete process.env.DATABASE_URL;

  const { bootstrapDatabase, databaseMode, pool } = await import('./db.js');
  await bootstrapDatabase();

  assert.equal(databaseMode, 'embedded-postgres');

  const users = await pool.query(
    "SELECT email FROM users WHERE email = 'admin@teampulse.demo'"
  );
  assert.equal(users.rowCount, 1);

  const workspaces = await pool.query(
    "SELECT name FROM workspaces WHERE name = 'Demo Engineering'"
  );
  assert.equal(workspaces.rows[0]?.name, 'Demo Engineering');

  const tasks = await pool.query(
    "SELECT count(*)::int AS count FROM tasks"
  );
  assert.ok(Number(tasks.rows[0]?.count) >= 6);
});
