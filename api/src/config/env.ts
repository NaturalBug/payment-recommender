import path from 'node:path';
import dotenv from 'dotenv';

const apiEnvPath = path.resolve(__dirname, '../../.env');

export function loadEnvironment(envPath: string = apiEnvPath): void {
  dotenv.config({ path: envPath });
}

loadEnvironment();

export function getDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required; set it in api/.env or the process environment');
  }

  return databaseUrl;
}

export function getPort(): number {
  const port = Number(process.env.PORT ?? 4000);

  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }

  return port;
}
