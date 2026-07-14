import { Router, Request, Response } from 'express';
import { RedisStore } from '@bg-jobs/store';
import { JobState } from '@bg-jobs/shared';

export function createRetryRoutes(store: RedisStore, broadcaster?: any): Router {
  const router = Router();

  router.post('/retry/:jobId', async (req: Request, res: Response) => {
    try {
      const { jobId } = req.params;
      const job = await store.getJob(jobId);
      
      if (!job) return res.status(404).json({ success: false, error: 'Job not found' });

      if (job.state !== JobState.FAILED) {
        const messages: Record<string, string> = {
          [JobState.QUEUED]: 'Job is already queued',
          [JobState.IN_FLIGHT]: 'Job is currently being processed',
          [JobState.COMPLETED]: 'Completed jobs cannot be retried',
        };
        return res.status(400).json({ 
          success: false, 
          error: messages[job.state] || `Cannot retry job in ${job.state} state`
        });
      }

      const retriedJob = await store.retryJob(jobId);
      res.json({ success: true, message: 'Job re-enqueued', data: retriedJob });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  return router;
}
