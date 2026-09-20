import Redis from 'ioredis';

const redisUrl = process.env.REDIS_URL?.trim();
const redis = redisUrl ? new Redis(redisUrl, { lazyConnect:true, maxRetriesPerRequest:1 }) : null;
export const cacheMode = redis ? 'redis' : 'disabled';

async function client() {
  if (!redis) return null;
  if (redis.status === 'wait') {
    try { await redis.connect(); } catch { return null; }
  }
  return redis;
}

export async function cacheGet<T>(key:string):Promise<T|null>{
  const c=await client(); if(!c) return null;
  try { const raw=await c.get(`teampulse:${key}`); return raw ? JSON.parse(raw) as T : null; } catch { return null; }
}
export async function cacheSet(key:string,value:unknown,ttlSeconds=60):Promise<void>{
  const c=await client(); if(!c) return;
  try { await c.set(`teampulse:${key}`,JSON.stringify(value),'EX',ttlSeconds); } catch {}
}
export async function cacheDel(key:string):Promise<void>{
  const c=await client(); if(!c) return;
  try { await c.del(`teampulse:${key}`); } catch {}
}
export async function cacheReady():Promise<boolean>{
  const c=await client(); if(!c) return false;
  try { return (await c.ping()) === 'PONG'; } catch { return false; }
}
