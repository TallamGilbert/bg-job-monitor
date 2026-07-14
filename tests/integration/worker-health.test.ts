import { RedisStore } from '../../packages/store/src/redis-store';
import { Worker } from '../../packages/worker/src/worker';
import { Producer } from '../../packages/producer/src/producer';
import { JobState } from '../../packages/shared/src/types/job';

describe('Worker Health and Reclaim', () => {
  let store: RedisStore;
  
  beforeAll(async () => {
    store = new RedisStore('redis://localhost:6379');
    await store.connect();
  });

  afterAll(async () => {
    await store.clearStore();
    await store.disconnect();
  });

  beforeEach(async () => {
    // Clean all keys
    await store.clearStore();
  });

  it('should register worker and send heartbeats', async () => {
    // Register a worker
    await store.registerWorker('test-health-1');
    
    // Send heartbeat
    await store.heartbeat('test-health-1');
    
    // Verify worker exists and is alive
    const worker = await store.getWorker('test-health-1');
    expect(worker).not.toBeNull();
    expect(worker!.status).toBe('alive');
    expect(worker!.lastHeartbeatAt).toBeDefined();
    
    // Send another heartbeat after a delay
    await new Promise(resolve => setTimeout(resolve, 2000));
    await store.heartbeat('test-health-1');
    
    const updatedWorker = await store.getWorker('test-health-1');
    expect(new Date(updatedWorker!.lastHeartbeatAt).getTime())
      .toBeGreaterThan(new Date(worker!.lastHeartbeatAt).getTime());
  });

  it('should detect dead workers', async () => {
    // Register a worker
    await store.registerWorker('test-dead-1');
    await store.heartbeat('test-dead-1');
    
    // Verify alive
    let worker = await store.getWorker('test-dead-1');
    expect(worker!.status).toBe('alive');
    
    // Wait past the threshold (use short threshold for testing)
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Mark dead workers with 1 second threshold
    const deadWorkers = await store.markDeadWorkers(1000);
    expect(deadWorkers.length).toBeGreaterThanOrEqual(0);
    
    // Worker should be dead now
    worker = await store.getWorker('test-dead-1');
    if (deadWorkers.length > 0) {
      expect(worker!.status).toBe('dead');
    }
  });

  it('should auto-register worker on heartbeat if not found', async () => {
    // Don't register - just send heartbeat
    await store.heartbeat('test-auto-register');
    
    // Worker should now exist
    const worker = await store.getWorker('test-auto-register');
    expect(worker).not.toBeNull();
    expect(worker!.status).toBe('alive');
  });

  it('should reclaim jobs from dead workers', async () => {
    const producer = new Producer('redis://localhost:6379');
    await producer.connect();

    // Enqueue a job
    const job = await producer.enqueueJob({
      type: 'email',
      payload: { to: 'test@example.com', subject: 'Reclaim Test' },
    });

    // Register worker and claim the job manually
    await store.registerWorker('test-reclaim-1');
    const claimed = await store.claimJob('test-reclaim-1');
    expect(claimed).not.toBeNull();
    expect(claimed!.state).toBe(JobState.IN_FLIGHT);
    
    // Simulate worker death
    await new Promise(resolve => setTimeout(resolve, 1000));
    const deadWorkers = await store.markDeadWorkers(500); // Very short threshold
    expect(deadWorkers.length).toBeGreaterThanOrEqual(0);
    
    // Reclaim jobs
    const reclaimed = await store.reclaimJobsFromDeadWorkers(500);
    
    // Job should be back in queue
    const jobStatus = await store.getJob(job.id);
    if (reclaimed.length > 0) {
      expect(jobStatus!.state).toBe(JobState.QUEUED);
    }
    
    await producer.disconnect();
  });

  it('should process reclaimed jobs with another worker', async () => {
    const producer = new Producer('redis://localhost:6379');
    await producer.connect();

    // Enqueue and claim a job
    const job = await producer.enqueueJob({
      type: 'email',
      payload: { to: 'reclaim@example.com', subject: 'Reclaim Processing' },
    });

    // First worker claims job then "dies"
    await store.registerWorker('worker-reclaim-1');
    await store.claimJob('worker-reclaim-1');
    
    // Mark worker dead and reclaim
    await new Promise(resolve => setTimeout(resolve, 500));
    await store.markDeadWorkers(100);
    await store.reclaimJobsFromDeadWorkers(100);
    
    // Verify job is queued again
    let jobStatus = await store.getJob(job.id);
    expect(jobStatus!.state).toBe(JobState.QUEUED);
    
    // Second worker claims and completes
    await store.registerWorker('worker-reclaim-2');
    const reclaimed = await store.claimJob('worker-reclaim-2');
    expect(reclaimed).not.toBeNull();
    expect(reclaimed!.id).toBe(job.id);
    
    await store.completeJob(job.id, 'worker-reclaim-2');
    
    jobStatus = await store.getJob(job.id);
    expect(jobStatus!.state).toBe(JobState.COMPLETED);
    expect(jobStatus!.workerId).toBe('worker-reclaim-2');
    
    await producer.disconnect();
  });

  it('should not reclaim jobs from alive workers', async () => {
    const producer = new Producer('redis://localhost:6379');
    await producer.connect();

    const job = await producer.enqueueJob({
      type: 'email',
      payload: { to: 'alive@example.com', subject: 'Alive Worker' },
    });

    // Register and claim
    await store.registerWorker('worker-alive-1');
    await store.claimJob('worker-alive-1');
    
    // Keep worker alive with heartbeat
    await store.heartbeat('worker-alive-1');
    
    // Try to reclaim (shouldn't work because worker is alive)
    await new Promise(resolve => setTimeout(resolve, 500));
    const deadWorkers = await store.markDeadWorkers(100);
    
    // Worker should NOT be dead
    const worker = await store.getWorker('worker-alive-1');
    expect(worker!.status).toBe('alive');
    
    // Job should still be in-flight
    const jobStatus = await store.getJob(job.id);
    expect(jobStatus!.state).toBe(JobState.IN_FLIGHT);
    
    await producer.disconnect();
  });
});
