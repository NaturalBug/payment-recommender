import express from 'express';
import recommendationsRouter from './routes/recommendations';

const app = express();
app.use(express.json());
app.use('/api/recommendations', recommendationsRouter);

export default app;
