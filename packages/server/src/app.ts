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

  // Create WebSocket server
  const { broadcaster } = createWebSocketServer(server);

  // Middleware
  app.use(cors());
  app.use(express.json());

  // REST Routes
  app.use('/api/jobs', createJobRoutes(store, broadcaster));
  app.use('/api/workers', createWorkerRoutes(store));
  app.use('/api', createRetryRoutes(store, broadcaster));

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      wsClients: broadcaster.getClientCount()
    });
  });

  // Start server
  const port = config.server.wsPort || 3001;
  
  server.listen(port, () => {
    console.log(`\n╔══════════════════════════════════════════╗`);
    console.log(`║   Background Job Monitor Server          ║`);
    console.log(`╠══════════════════════════════════════════╣`);
    console.log(`║  REST API: http://localhost:${port}/api     ║`);
    console.log(`║  WebSocket: ws://localhost:${port}/ws      ║`);
    console.log(`╚══════════════════════════════════════════╝\n`);
  });

  // Graceful shutdown
  const shutdown = async () => {
    console.log('\n[Server] Shutting down...');
    await store.disconnect();
    server.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  return { app, server, broadcaster, store };
}

// Start if main module
if (require.main === module) {
  startServer().catch(console.error);
}
