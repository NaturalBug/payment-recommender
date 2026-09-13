import express from 'express';
import prisma from './lib/prisma';
import { requireAdminApiKey } from './middleware/adminAuth';
import adminRouter from './routes/admin';
import merchantsRouter from './routes/merchants';
import recommendationsRouter from './routes/recommendations';

const app = express();

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, X-Admin-API-Key');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  return next();
});

app.use(express.json());

app.get('/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return res.status(200).json({
      status: 'ok',
      database: 'ok'
    });
  } catch {
    return res.status(503).json({
      status: 'error',
      database: 'unavailable'
    });
  }
});

app.use('/api/merchants', merchantsRouter);
app.use('/api/admin', requireAdminApiKey, adminRouter);
app.use('/api/recommendations', recommendationsRouter);

export default app;
