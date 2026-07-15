import { RedisStore } from '../../packages/store/src/redis-store';
import { Producer } from '../../packages/producer/src/producer';
import { Worker } from '../../packages/worker/src/worker';
import { JobState } from '../../packages/shared/src/types/job';

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
    
    // Create worker and process one job
    const worker = new Worker({ 
      workerId: 'test-worker-1',
      maxJobs: 1,
    });
    
    await worker.start();
    
    // Wait for processing (worker stops after 1 job)
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Check job completed
    const completedJob = await store.getJob(job.id);
    expect(completedJob).not.toBeNull();
    expect(completedJob!.state).toBe(JobState.COMPLETED);
    expect(completedJob!.completedAt).toBeTruthy();
    
    await worker.stop();
    await producer.disconnect();
  }, 15000);

  it('should handle job failures with stack traces', async () => {
    const producer = new Producer('redis://localhost:6379');
    await producer.connect();
    
    // Enqueue multiple jobs (some will fail randomly)
    const jobs = [];
    for (let i = 0; i < 5; i++) {
      const job = await producer.enqueueJob({
        type: 'email',
        payload: { to: `test${i}@example.com`, subject: `Test ${i}` }
      });
      jobs.push(job);
    }
    
    const worker = new Worker({ 
      workerId: 'test-worker-2',
      maxJobs: 5,
      idleTimeout: 10000,
    });
    
    await worker.start();
    
    // Wait for all jobs to process
    await new Promise(resolve => setTimeout(resolve, 15000));
    
    // Check results
    let completed = 0;
    let failed = 0;
    
    for (const job of jobs) {
      const finalJob = await store.getJob(job.id);
      if (finalJob!.state === JobState.COMPLETED) {
        completed++;
      } else if (finalJob!.state === JobState.FAILED) {
        failed++;
        // Verify stack trace saved
        expect(finalJob!.error).toBeTruthy();
        expect(finalJob!.stackTrace).toBeTruthy();
      }
    }
    
    console.log(`Completed: ${completed}, Failed: ${failed}`);
    expect(completed + failed).toBe(5); // All jobs processed
    
    await worker.stop();
    await producer.disconnect();
  }, 25000);

  it('should handle multiple workers without conflicts', async () => {
    const producer = new Producer('redis://localhost:6379');
    await producer.connect();
    
    // Enqueue 10 jobs
    await producer.generateTestBatch(10);
    
    // Start 3 workers
    const workers = [
      new Worker({ workerId: 'multi-1', maxJobs: 4, idleTimeout: 15000 }),
      new Worker({ workerId: 'multi-2', maxJobs: 4, idleTimeout: 15000 }),
      new Worker({ workerId: 'multi-3', maxJobs: 4, idleTimeout: 15000 }),
    ];
    
    // Start all workers
    await Promise.all(workers.map(w => w.start()));
    
    // Wait for processing
    await new Promise(resolve => setTimeout(resolve, 20000));
    
    // Verify no job was processed twice
    const completed = await store.getCompletedJobs(100);
    const failed = await store.getFailedJobs();
    const inFlight = await store.getInFlightJobs();
    
    const allProcessed = [...completed, ...failed, ...inFlight];
    const jobIds = allProcessed.map(j => j.id);
    const uniqueIds = new Set(jobIds);
    
    // All processed jobs should be unique
    expect(uniqueIds.size).toBe(jobIds.length);
    
    // Stop all workers
    await Promise.all(workers.map(w => w.stop()));
    await producer.disconnect();
  }, 30000);
});
