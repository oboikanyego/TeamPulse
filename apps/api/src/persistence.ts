import pg from 'pg';

const { Pool } = pg;
const databaseUrl = process.env.DATABASE_URL?.trim();
const pool = databaseUrl
  ? new Pool({ connectionString: databaseUrl, ssl: databaseUrl.includes('localhost') ? false : { rejectUnauthorized: false } })
  : null;

export const persistenceMode = pool ? 'managed-postgres' : 'memory-fallback';

export async function initPersistence(): Promise<void> {
  if (!pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_state (
      id TEXT PRIMARY KEY,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

export async function loadState<T>(): Promise<T | null> {
  if (!pool) return null;
  const result = await pool.query('SELECT payload FROM app_state WHERE id = $1 LIMIT 1', ['primary']);
  return (result.rows[0]?.payload as T | undefined) ?? null;
}

export async function saveState(payload: unknown): Promise<void> {
  if (!pool) return;
  await pool.query(
    `INSERT INTO app_state(id,payload,updated_at)
     VALUES('primary',$1::jsonb,now())
     ON CONFLICT(id) DO UPDATE SET payload=EXCLUDED.payload,updated_at=now()`,
    [JSON.stringify(payload)]
  );
}

export async function persistenceReady(): Promise<boolean> {
  if (!pool) return false;
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}
