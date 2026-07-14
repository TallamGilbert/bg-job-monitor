import { Router, Request, Response } from 'express';
import { RedisStore } from '@bg-jobs/store';

export function createJobRoutes(store: RedisStore, broadcaster?: any): Router {
  const router = Router();

  router.get('/queue-depth', async (req: Request, res: Response) => {
    try {
      const depth = await store.getQueueDepth();
      res.json({ success: true, data: depth });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  router.get('/in-flight', async (req: Request, res: Response) => {
    try {
      const jobs = await store.getInFlightJobs();
      res.json({ success: true, data: jobs, count: jobs.length });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  router.get('/completed', async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const jobs = await store.getCompletedJobs(limit);
      res.json({ success: true, data: jobs, count: jobs.length });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  router.get('/failed', async (req: Request, res: Response) => {
    try {
      const jobs = await store.getFailedJobs();
      res.json({ 
        success: true, 
        data: jobs.map(job => ({
          id: job.id, type: job.type, state: job.state,
          error: job.error, stackTrace: job.stackTrace,
          failedAt: job.failedAt, attempt: job.attempt,
          maxAttempts: job.maxAttempts, payload: job.payload,
        })),
        count: jobs.length 
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  router.get('/:id', async (req: Request, res: Response) => {
    try {
      const job = await store.getJob(req.params.id);
      if (!job) return res.status(404).json({ success: false, error: 'Job not found' });
      const history = await store.getJobHistory(req.params.id);
      res.json({ success: true, data: { ...job, history } });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  return router;
}
