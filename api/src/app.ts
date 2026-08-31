import express from 'express';
import adminRouter from './routes/admin';
import recommendationsRouter from './routes/recommendations';

const app = express();
app.use(express.json());
app.use('/api/admin', adminRouter);
app.use('/api/recommendations', recommendationsRouter);

export default app;
