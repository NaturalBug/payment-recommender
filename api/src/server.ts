import app from './app';
import { getPort } from './config/env';

const port = getPort();
app.listen(port, '0.0.0.0', () => {
  console.log(`API listening on ${port}`);
});
