import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
const testDatabasePath = path.resolve(__dirname, '../../prisma/test.db');
process.env.DATABASE_URL = `file:${testDatabasePath}`;

fs.rmSync(testDatabasePath, { force: true });

const schemaPath = path.resolve(__dirname, '../../prisma/schema.prisma');
execSync(`npx prisma db push --schema ${schemaPath}`, {
  stdio: 'inherit',
  env: {
    ...process.env,
    DATABASE_URL: process.env.DATABASE_URL
  }
});
