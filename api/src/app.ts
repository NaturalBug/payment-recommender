import express from 'express';
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
app.use('/api/admin', adminRouter);
app.use('/api/recommendations', recommendationsRouter);

export default app;
