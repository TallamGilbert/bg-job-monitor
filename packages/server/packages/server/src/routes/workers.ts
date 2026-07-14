import { Router, Request, Response } from 'express';
import { RedisStore } from '@bg-jobs/store';

export function createWorkerRoutes(store: RedisStore): Router {
  const router = Router();

  router.get('/', async (req: Request, res: Response) => {
    try {
      const workers = await store.getWorkers();
      const now = Date.now();
      const workersWithStatus = workers.map(worker => ({
        id: worker.id,
        status: worker.status,
        lastHeartbeatAt: worker.lastHeartbeatAt,
        currentJobId: worker.currentJobId || null,
        startedAt: worker.startedAt,
        uptime: now - new Date(worker.startedAt).getTime(),
        timeSinceLastBeat: now - new Date(worker.lastHeartbeatAt).getTime(),
      }));
      res.json({ 
        success: true, data: workersWithStatus,
        count: workersWithStatus.length,
        alive: workersWithStatus.filter(w => w.status === 'alive').length,
        dead: workersWithStatus.filter(w => w.status === 'dead').length,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  router.get('/:id', async (req: Request, res: Response) => {
    try {
      const worker = await store.getWorker(req.params.id);
      if (!worker) return res.status(404).json({ success: false, error: 'Worker not found' });
      const now = Date.now();
      res.json({ 
        success: true, 
        data: {
          ...worker,
          timeSinceLastBeat: now - new Date(worker.lastHeartbeatAt).getTime(),
          uptime: now - new Date(worker.startedAt).getTime(),
        }
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  return router;
}
