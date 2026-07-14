import { Router, Request, Response } from 'express';
import { RedisStore } from '@bg-jobs/store';

export function createWorkerRoutes(store: RedisStore): Router {
  const router = Router();

  router.get('/', async (req: Request, res: Response) => {
    try {
      const workers = await store.getWorkers();
      res.json({ success: true, data: workers });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  router.get('/:id', async (req: Request, res: Response) => {
    try {
      const worker = await store.getWorker(req.params.id);
      if (!worker) {
        return res.status(404).json({ success: false, error: 'Worker not found' });
      }
      res.json({ success: true, data: worker });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  return router;
}
