import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { RedisStore } from '@bg-jobs/store';
import { loadConfig } from '@bg-jobs/shared';
import { createJobRoutes } from './routes/jobs';
import { createWorkerRoutes } from './routes/workers';
import { createRetryRoutes } from './routes/retry';
import { createWebSocketServer } from './websocket/server';

export async function startServer() {
  const config = loadConfig();
  const store = new RedisStore(config.store.redisUrl || 'redis://localhost:6379');
  await store.connect();

  const app = express();
  const server = createServer(app);

  const { broadcaster } = createWebSocketServer(server);

  app.use(cors());
  app.use(express.json());

  app.use('/api/jobs', createJobRoutes(store, broadcaster));
  app.use('/api/workers', createWorkerRoutes(store));
  app.use('/api', createRetryRoutes(store, broadcaster));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  const port = config.server.wsPort || 3001;
  
  server.listen(port, () => {
    console.log(`\n========================================`);
    console.log(`  Server running on http://localhost:${port}`);
    console.log(`  API: http://localhost:${port}/api/health`);
    console.log(`========================================\n`);
  });

  process.on('SIGINT', async () => {
    console.log('\nShutting down...');
    await store.disconnect();
    server.close();
    process.exit(0);
  });

  return { app, server, broadcaster, store };
}

if (require.main === module) {
  startServer().catch(console.error);
}
