import { RedisStore } from '@bg-jobs/store';
import { 
  JobState,
  InvalidTransitionError,
  JobNotFoundError,
} from '@bg-jobs/shared';

describe('RedisStore - Edge Cases', () => {
  let store: RedisStore;

  beforeAll(async () => {
    store = new RedisStore('redis://localhost:6379');
    await store.connect();
  });

  afterAll(async () => {
    await store.disconnect();
  });

  beforeEach(async () => {
    await store.clearStore();
  });

  describe('State Transition Edge Cases', () => {
    it('should reject completing a job that was never claimed', async () => {
      const job = await store.enqueueJob('email', { to: 'test@test.com' });
      
      await expect(
        store.completeJob(job.id, 'worker-1')
      ).rejects.toThrow(InvalidTransitionError);
    });

    it('should reject failing a job that was never claimed', async () => {
      const job = await store.enqueueJob('email', { to: 'test@test.com' });
      
      await expect(
        store.failJob(job.id, 'worker-1', new Error('test'))
      ).rejects.toThrow(InvalidTransitionError);
    });

    it('should reject completing an already completed job', async () => {
      await store.registerWorker('worker-1');
      const job = await store.enqueueJob('email', { to: 'test@test.com' });
      await store.claimJob('worker-1');
      await store.completeJob(job.id, 'worker-1');
      
      // Try to complete again
      await expect(
        store.completeJob(job.id, 'worker-1')
      ).rejects.toThrow(InvalidTransitionError);
    });

    it('should reject retrying a job that is not failed', async () => {
      const job = await store.enqueueJob('email', { to: 'test@test.com' });
      
      await expect(
        store.retryJob(job.id)
      ).rejects.toThrow(InvalidTransitionError);
    });
  });

  describe('Concurrent Claim Edge Cases', () => {
    it('should handle rapid claiming from multiple workers', async () => {
      await store.registerWorker('worker-1');
      await store.registerWorker('worker-2');
      await store.registerWorker('worker-3');
      
      // Enqueue multiple jobs
      for (let i = 0; i < 10; i++) {
        await store.enqueueJob('email', { index: i });
      }
      
      // Claim jobs rapidly
      const claims = await Promise.all([
        store.claimJob('worker-1'),
        store.claimJob('worker-2'),
        store.claimJob('worker-3'),
        store.claimJob('worker-1'),
        store.claimJob('worker-2'),
        store.claimJob('worker-3'),
      ]);
      
      // All claims should be unique jobs
      const claimedIds = claims.filter(c => c !== null).map(c => c!.id);
      const uniqueIds = new Set(claimedIds);
      expect(uniqueIds.size).toBe(claimedIds.length);
      
      // No job should be claimed twice
      expect(uniqueIds.size).toBeLessThanOrEqual(10);
    });
  });

  describe('Data Integrity', () => {
    it('should preserve job payload through lifecycle', async () => {
      const complexPayload = {
        nested: { data: [1, 2, 3] },
        string: 'test',
        number: 42,
        boolean: true,
      };
      
      const job = await store.enqueueJob('email', complexPayload);
      const retrieved = await store.getJob(job.id);
      
      expect(retrieved!.payload).toEqual(complexPayload);
    });

    it('should handle special characters in payload', async () => {
      const specialPayload = {
        emoji: '🚀',
        html: '<div>test</div>',
        unicode: 'café',
        quotes: 'he said "hello"',
      };
      
      const job = await store.enqueueJob('email', specialPayload);
      const retrieved = await store.getJob(job.id);
      
      expect(retrieved!.payload).toEqual(specialPayload);
    });
  });
});
