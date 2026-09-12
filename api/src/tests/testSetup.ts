import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.ADMIN_API_KEY = 'test-admin-key';
const workerId = process.env.JEST_WORKER_ID ?? process.pid.toString();
const testDatabasePath = path.resolve(__dirname, `../../prisma/test-${workerId}.db`);
process.env.DATABASE_URL = `file:${testDatabasePath}`;

fs.rmSync(testDatabasePath, { force: true });

const schemaPath = path.resolve(__dirname, '../../prisma/schema.prisma');
const prismaCliPath = require.resolve('prisma');
execFileSync(process.execPath, [prismaCliPath, 'db', 'push', '--schema', schemaPath], {
  stdio: 'inherit',
  env: {
    ...process.env,
    DATABASE_URL: process.env.DATABASE_URL
  }
});
