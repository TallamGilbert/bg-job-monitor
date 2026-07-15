import { RedisStore } from '../../packages/store/src/redis-store';
import { JobState } from '../../packages/shared/src/types/job';

describe('Worker Health and Reclaim', () => {
  let store: RedisStore;
  
  beforeAll(async () => {
    store = new RedisStore('redis://localhost:6379');
    await store.connect();
  });

  afterAll(async () => {
    try {
      await store.clearStore();
      await store.disconnect();
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  beforeEach(async () => {
    await store.clearStore();
  });

  it('should register worker and send heartbeats', async () => {
    await store.registerWorker('test-health-1');
    
    const worker1 = await store.getWorker('test-health-1');
    expect(worker1).not.toBeNull();
    expect(worker1!.status).toBe('alive');
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    await store.heartbeat('test-health-1');
    
    const worker2 = await store.getWorker('test-health-1');
    expect(new Date(worker2!.lastHeartbeatAt).getTime())
      .toBeGreaterThan(new Date(worker1!.lastHeartbeatAt).getTime());
  });

  it('should detect dead workers', async () => {
    await store.registerWorker('test-dead-1');
    await store.heartbeat('test-dead-1');
    
    let worker = await store.getWorker('test-dead-1');
    expect(worker!.status).toBe('alive');
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // markDeadWorkers finds and marks dead workers
    const dead = await store.markDeadWorkers(1000);
    expect(dead.length).toBeGreaterThan(0);
    
    worker = await store.getWorker('test-dead-1');
    expect(worker!.status).toBe('dead');
  });

  it('should auto-register worker on heartbeat if not found', async () => {
    await store.heartbeat('test-auto-register');
    
    const worker = await store.getWorker('test-auto-register');
    expect(worker).not.toBeNull();
    expect(worker!.status).toBe('alive');
  });

  it('should reclaim jobs from dead workers', async () => {
    // Create and claim a job
    const job = await store.enqueueJob('email', { 
      to: 'test@example.com', 
      subject: 'Reclaim Test' 
    });

    await store.registerWorker('worker-reclaim-1');
    await store.claimJob('worker-reclaim-1');
    
    // Verify job is in-flight
    let jobStatus = await store.getJob(job.id);
    expect(jobStatus!.state).toBe(JobState.IN_FLIGHT);
    expect(jobStatus!.workerId).toBe('worker-reclaim-1');
    
    // Wait for worker to be considered dead
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // reclaimJobsFromDeadWorkers handles both marking dead AND reclaiming
    const reclaimed = await store.reclaimJobsFromDeadWorkers(1000);
    expect(reclaimed.length).toBe(1);
    expect(reclaimed[0].id).toBe(job.id);
    
    // Job should be back in queue
    jobStatus = await store.getJob(job.id);
    expect(jobStatus!.state).toBe(JobState.QUEUED);
    expect(jobStatus!.workerId).toBeFalsy();
  });

  it('should process reclaimed jobs with another worker', async () => {
    const job = await store.enqueueJob('email', { 
      to: 'reclaim@example.com', 
      subject: 'Reclaim Processing' 
    });

    // Worker 1 claims
    await store.registerWorker('worker-1');
    await store.claimJob('worker-1');
    
    // Simulate death and reclaim in one call
    await new Promise(resolve => setTimeout(resolve, 2000));
    const reclaimed = await store.reclaimJobsFromDeadWorkers(1000);
    expect(reclaimed.length).toBe(1);
    
    // Job should be queued
    let jobStatus = await store.getJob(job.id);
    expect(jobStatus!.state).toBe(JobState.QUEUED);
    
    // Worker 2 claims and completes
    await store.registerWorker('worker-2');
    const claimed = await store.claimJob('worker-2');
    expect(claimed).not.toBeNull();
    expect(claimed!.id).toBe(job.id);
    
    await store.completeJob(job.id, 'worker-2');
    
    jobStatus = await store.getJob(job.id);
    expect(jobStatus!.state).toBe(JobState.COMPLETED);
    expect(jobStatus!.workerId).toBe('worker-2');
  });

  it('should not reclaim jobs from alive workers', async () => {
    const job = await store.enqueueJob('email', { 
      to: 'alive@example.com', 
      subject: 'Alive Worker' 
    });
    
    await store.registerWorker('worker-alive');
    await store.claimJob('worker-alive');
    
    // Keep worker alive with frequent heartbeats
    await store.heartbeat('worker-alive');
    await new Promise(resolve => setTimeout(resolve, 500));
    await store.heartbeat('worker-alive');
    
    // Try to reclaim - should find no dead workers
    const reclaimed = await store.reclaimJobsFromDeadWorkers(1000);
    expect(reclaimed.length).toBe(0);
    
    // Worker should still be alive
    const worker = await store.getWorker('worker-alive');
    expect(worker!.status).toBe('alive');
    
    // Job should still be in-flight
    const jobStatus = await store.getJob(job.id);
    expect(jobStatus!.state).toBe(JobState.IN_FLIGHT);
  });
});
