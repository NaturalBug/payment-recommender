import path from 'node:path';

test('uses a worker-specific SQLite test database path', () => {
  const workerId = process.env.JEST_WORKER_ID ?? process.pid.toString();
  const expectedPath = path.resolve(__dirname, `../../prisma/test-${workerId}.db`);

  expect(process.env.DATABASE_URL).toBe(`file:${expectedPath}`);
});
