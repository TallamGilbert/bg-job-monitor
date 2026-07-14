import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { RedisStore } from '@bg-jobs/store';
import { loadConfig, JobState } from '@bg-jobs/shared';

async function main() {
  const config = loadConfig();
  const store = new RedisStore(config.store.redisUrl || 'redis://localhost:6379');
  await store.connect();

  const app = express();
  const server = createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  app.use(cors());
  app.use(express.json());

  // Health
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Queue depth
  app.get('/api/jobs/queue-depth', async (_req, res) => {
    try {
      const depth = await store.getQueueDepth();
      res.json({ success: true, data: depth });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // In-flight jobs
  app.get('/api/jobs/in-flight', async (_req, res) => {
    try {
      const jobs = await store.getInFlightJobs();
      res.json({ success: true, data: jobs });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Completed jobs
  app.get('/api/jobs/completed', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const jobs = await store.getCompletedJobs(limit);
      res.json({ success: true, data: jobs });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Failed jobs
  app.get('/api/jobs/failed', async (_req, res) => {
    try {
      const jobs = await store.getFailedJobs();
      res.json({ success: true, data: jobs });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Workers
  app.get('/api/workers', async (_req, res) => {
    try {
      const workers = await store.getWorkers();
      res.json({ success: true, data: workers });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Retry
  app.post('/api/retry/:jobId', async (req, res) => {
    try {
      const { jobId } = req.params;
      const job = await store.getJob(jobId);
      if (!job) return res.status(404).json({ error: 'Job not found' });
      if (job.state !== JobState.FAILED) {
        return res.status(400).json({ error: `Cannot retry job in ${job.state} state` });
      }
      const retried = await store.retryJob(jobId);
      res.json({ success: true, data: retried });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // WebSocket
  wss.on('connection', (ws) => {
    console.log('[WS] Client connected');
    ws.send(JSON.stringify({ type: 'connected', timestamp: new Date().toISOString() }));
    ws.on('close', () => console.log('[WS] Client disconnected'));
  });

  const port = 3001;
  server.listen(port, () => {
    console.log(`\n========================================`);
    console.log(`  Server: http://localhost:${port}`);
    console.log(`  Health: http://localhost:${port}/api/health`);
    console.log(`========================================\n`);
  });

  process.on('SIGINT', async () => {
    await store.disconnect();
    server.close();
    process.exit(0);
  });
}

main().catch(console.error);
