import { mkdirSync, writeFileSync } from 'node:fs';

const apiUrl = process.env.API_URL || 'http://localhost:8080/api';
const socketUrl = process.env.SOCKET_URL || apiUrl.replace(/\/api\/?$/, '');

mkdirSync('src/environments', { recursive: true });
writeFileSync(
  'src/environments/environment.ts',
  `export const environment = ${JSON.stringify({ apiUrl, socketUrl })} as const;\n`
);
