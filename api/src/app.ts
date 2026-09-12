import express from 'express';
import prisma from './lib/prisma';
import adminRouter from './routes/admin';
import recommendationsRouter from './routes/recommendations';

const app = express();

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');

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

app.use('/api/admin', adminRouter);
app.use('/api/recommendations', recommendationsRouter);

export default app;
