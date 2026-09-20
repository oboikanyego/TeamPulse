import assert from 'node:assert/strict';
import test from 'node:test';

test('database adapter is explicit when DATABASE_URL is unconfigured', async () => {
  delete process.env.DATABASE_URL;
  const { databaseMode, pool } = await import('./db.js');
  assert.equal(databaseMode, 'unconfigured');
  await assert.rejects(() => pool.query('SELECT 1'), /DATABASE_URL is required/);
});
