import path from 'node:path';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.DATABASE_URL = `file:${path.resolve(__dirname, '../../prisma/test.db')}`;
