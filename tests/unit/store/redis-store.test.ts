import { RedisStore } from '@bg-jobs/store';
import { 
  JobState, 
  JobType,
  InvalidTransitionError,
  JobNotFoundError,
} from '@bg-jobs/shared';
import Redis from 'ioredis';

describe('RedisStore - Phase 1 Tests', () => {
  let store: RedisStore;
  let redis: Redis;
  let testRunId: string;

  beforeAll(async () => {
    store = new RedisStore('redis://localhost:6379');
    redis = new Redis('redis://localhost:6379');
    await store.connect();
    testRunId = `test_${Date.now()}`;
  });

  afterAll(async () => {
    await store.clearStore();
    await store.disconnect();
    await redis.quit();
  });

  beforeEach(async () => {
    // Clear ALL data between tests to prevent cross-contamination
    await redis.flushdb();
  });

  describe('REQ-001: Job System Skeleton', () => {
    it('should connect to Redis successfully', async () => {
      const pong = await redis.ping();
      expect(pong).toBe('PONG');
    });

    it('should clear the store between tests', async () => {
      await store.enqueueJob('email', { to: 'test@test.com' });
      await store.clearStore();
      const depth = await store.getQueueDepth();
      expect(depth.email).toBe(0);
    });
  });

  describe('REQ-002: Job Lifecycle', () => {
    it('should create a job in QUEUED state', async () => {
      const job = await store.enqueueJob('email', { to: 'user@example.com' });
      
      expect(job.state).toBe(JobState.QUEUED);
      expect(job.type).toBe('email');
      expect(job.payload).toEqual({ to: 'user@example.com' });
      expect(job.enqueuedAt).toBeDefined();
      expect(job.createdAt).toBeDefined();
    });

    it('should record all lifecycle timestamps', async () => {
      const job = await store.enqueueJob('email', { to: 'test@test.com' });
      
      expect(job.enqueuedAt).toBeTruthy();
      expect(job.createdAt).toBeTruthy();
      
      // Initially, processing timestamps should not exist
      expect(job.startedAt).toBeUndefined();
      expect(job.completedAt).toBeUndefined();
      expect(job.failedAt).toBeUndefined();
    });

    it('should support multiple job types', async () => {
      await store.enqueueJob('email', { to: 'a@b.com' });
      await store.enqueueJob('export', { format: 'pdf' });
      await store.enqueueJob('resize', { width: 100 });
      
      const depth = await store.getQueueDepth();
      expect(depth.email).toBe(1);
      expect(depth.export).toBe(1);
      expect(depth.resize).toBe(1);
    });

    it('should track job state history', async () => {
      const job = await store.enqueueJob('email', { to: 'test@test.com' });
      const history = await store.getJobHistory(job.id);
      
      expect(history.length).toBeGreaterThan(0);
      expect(history[0]).toContain(JobState.QUEUED);
    });

    it('should reject invalid state transitions', async () => {
      const job = await store.enqueueJob('email', { to: 'test@test.com' });
      
      // Trying to complete a queued job should fail
      await expect(
        store.completeJob(job.id, 'worker-1')
      ).rejects.toThrow(InvalidTransitionError);
      
      // Trying to fail a queued job should fail
      await expect(
        store.failJob(job.id, 'worker-1', new Error('test'))
      ).rejects.toThrow(InvalidTransitionError);
    });

    it('should allow valid state transitions', async () => {
      // Register worker first
      await store.registerWorker('worker-1');
      
      // Create and claim job
      const job = await store.enqueueJob('email', { to: 'test@test.com' });
      const claimedJob = await store.claimJob('worker-1');
      
      expect(claimedJob).not.toBeNull();
      expect(claimedJob!.state).toBe(JobState.IN_FLIGHT);
      expect(claimedJob!.startedAt).toBeTruthy();
      expect(claimedJob!.workerId).toBe('worker-1');
      
      // Complete the claimed job
      const completedJob = await store.completeJob(claimedJob!.id, 'worker-1');
      expect(completedJob.state).toBe(JobState.COMPLETED);
      expect(completedJob.completedAt).toBeTruthy();
    });

    it('should track failure with stack traces', async () => {
      const job = await store.enqueueJob('email', { to: 'test@test.com' });
      await store.registerWorker('worker-1');
      const claimedJob = await store.claimJob('worker-1');
      
      const error = new Error('SMTP connection failed');
      const failed = await store.failJob(claimedJob!.id, 'worker-1', error);
      
      expect(failed.state).toBe(JobState.FAILED);
      expect(failed.error).toBe('SMTP connection failed');
      expect(failed.stackTrace).toBeDefined();
      expect(failed.stackTrace).toContain('SMTP connection failed');
      expect(failed.failedAt).toBeTruthy();
    });

    it('should handle non-existent jobs gracefully', async () => {
      await expect(
        store.getJob('nonexistent-id')
      ).resolves.toBeNull();
    });
  });

  describe('Job Claiming Mechanism', () => {
    it('should claim the oldest job first (FIFO order)', async () => {
      await store.registerWorker('worker-1');
      
      // Clear any existing data
      await redis.flushdb();
      await store.registerWorker('worker-1');
      
      // Enqueue jobs with different timestamps
      const job1 = await store.enqueueJob('email', { order: 1 });
      await new Promise(resolve => setTimeout(resolve, 100));
      const job2 = await store.enqueueJob('email', { order: 2 });
      await new Promise(resolve => setTimeout(resolve, 100));
      const job3 = await store.enqueueJob('email', { order: 3 });
      
      // Claim all jobs
      const claimed1 = await store.claimJob('worker-1');
      const claimed2 = await store.claimJob('worker-1');
      const claimed3 = await store.claimJob('worker-1');
      
      expect(claimed1).not.toBeNull();
      expect(claimed2).not.toBeNull();
      expect(claimed3).not.toBeNull();
      
      // Verify FIFO order by checking payloads
      expect(claimed1!.payload).toEqual({ order: 1 });
      expect(claimed2!.payload).toEqual({ order: 2 });
      expect(claimed3!.payload).toEqual({ order: 3 });
    });

    it('should not claim a job already in-flight', async () => {
      await store.registerWorker('worker-1');
      await store.registerWorker('worker-2');
      
      await store.enqueueJob('email', { test: true });
      
      // Worker 1 claims the job
      const claimed = await store.claimJob('worker-1');
      expect(claimed).not.toBeNull();
      
      // Worker 2 tries to claim (queue is empty)
      const failedClaim = await store.claimJob('worker-2');
      expect(failedClaim).toBeNull();
    });

    it('should handle empty queue gracefully', async () => {
      await store.registerWorker('worker-1');
      const claimed = await store.claimJob('worker-1');
      expect(claimed).toBeNull();
    });
  });

  describe('Queue Depth Tracking', () => {
    it('should accurately track queue depth per type', async () => {
      await store.enqueueJob('email', { to: '1@test.com' });
      await store.enqueueJob('email', { to: '2@test.com' });
      await store.enqueueJob('email', { to: '3@test.com' });
      await store.enqueueJob('export', { format: 'csv' });
      
      const depth = await store.getQueueDepth();
      expect(depth.email).toBe(3);
      expect(depth.export).toBe(1);
      expect(depth.resize).toBe(0);
    });

    it('should decrease queue depth when jobs are claimed', async () => {
      await store.registerWorker('worker-1');
      await store.enqueueJob('email', { to: 'test@test.com' });
      
      let depth = await store.getQueueDepth();
      expect(depth.email).toBe(1);
      
      await store.claimJob('worker-1');
      
      depth = await store.getQueueDepth();
      expect(depth.email).toBe(0);
    });
  });

  describe('Job Retrieval', () => {
    it('should retrieve in-flight jobs', async () => {
      await store.registerWorker('worker-1');
      await store.enqueueJob('email', { to: 'test@test.com' });
      await store.claimJob('worker-1');
      
      const inFlight = await store.getInFlightJobs();
      expect(inFlight.length).toBe(1);
      expect(inFlight[0].workerId).toBe('worker-1');
    });

    it('should retrieve failed jobs with stack traces', async () => {
      await store.registerWorker('worker-1');
      const job = await store.enqueueJob('email', { to: 'test@test.com' });
      const claimedJob = await store.claimJob('worker-1');
      await store.failJob(claimedJob!.id, 'worker-1', new Error('Test error'));
      
      const failed = await store.getFailedJobs();
      expect(failed.length).toBe(1);
      expect(failed[0].stackTrace).toBeDefined();
    });

    it('should limit completed jobs to last 100', async () => {
      await store.registerWorker('worker-1');
      
      // Create 150 jobs and complete them
      for (let i = 0; i < 150; i++) {
        const job = await store.enqueueJob('email', { index: i });
        const claimedJob = await store.claimJob('worker-1');
        await store.completeJob(claimedJob!.id, 'worker-1');
      }
      
      const completed = await store.getCompletedJobs();
      expect(completed.length).toBeLessThanOrEqual(100);
    });
  });
});
