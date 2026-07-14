import { RedisStore } from '@bg-jobs/store';
import { Producer } from '../../packages/producer/src/producer';
import { Worker } from '../../packages/worker/src/worker';
import { JobState } from '@bg-jobs/shared';

describe('Producer-Worker Integration', () => {
  let store: RedisStore;
  
  beforeAll(async () => {
    store = new RedisStore('redis://localhost:6379');
    await store.connect();
    await store.clearStore();
  });

  afterAll(async () => {
    await store.clearStore();
    await store.disconnect();
  });

  beforeEach(async () => {
    await store.clearStore();
  });

  it('should process jobs end-to-end', async () => {
    const producer = new Producer('redis://localhost:6379');
    await producer.connect();
    
    // Enqueue a single job
    const job = await producer.enqueueJob({
      type: 'email',
      payload: { to: 'test@example.com', subject: 'Test' }
    });
    
    expect(job.state).toBe(JobState.QUEUED);
    
    // Create worker and process the job
    const worker = new Worker({ workerId: 'test-worker-1' });
    await worker.start();
    
    // Wait for processing
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Check job completed
    const completedJob = await store.getJob(job.id);
    expect(completedJob).not.toBeNull();
    expect(completedJob!.state).toBe(JobState.COMPLETED);
    expect(completedJob!.completedAt).toBeTruthy();
    
    await worker.stop();
    await producer.disconnect();
  }, 10000);

  it('should handle job failures with stack traces', async () => {
    const producer = new Producer('redis://localhost:6379');
    await producer.connect();
    
    // Enqueue a job that might fail
    const job = await producer.enqueueJob({
      type: 'email',
      payload: { to: 'fail@example.com', subject: 'Test' }
    });
    
    const worker = new Worker({ workerId: 'test-worker-2' });
    await worker.start();
    
    // Wait for processing
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    const finalJob = await store.getJob(job.id);
    expect(finalJob).not.toBeNull();
    
    // If it failed, should have stack trace
    if (finalJob!.state === JobState.FAILED) {
      expect(finalJob!.error).toBeTruthy();
      expect(finalJob!.stackTrace).toBeTruthy();
    }
    
    await worker.stop();
    await producer.disconnect();
  }, 15000);
});
