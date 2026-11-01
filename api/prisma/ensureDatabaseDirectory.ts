import fs from 'node:fs';
import path from 'node:path';

// Prisma resolves relative SQLite paths against the schema directory; the file is created on
// demand but its parent directory is not, which breaks fresh checkouts and worktrees.
export function ensureDatabaseDirectory(databaseUrl: string): void {
  if (!databaseUrl.startsWith('file:')) {
    return;
  }

  const filePath = databaseUrl.slice('file:'.length).split('?')[0];
  if (!filePath) {
    return;
  }

  fs.mkdirSync(path.dirname(path.resolve(__dirname, filePath)), { recursive: true });
}
