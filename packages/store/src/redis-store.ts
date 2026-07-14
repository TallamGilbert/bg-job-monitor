import Redis from 'ioredis';
import { 
  IStore, 
  Job, 
  JobState, 
  JobType, 
  Worker, 
  WorkerStatus,
  generateJobId,
  isValidTransition,
  InvalidTransitionError,
  JobNotFoundError,
  WorkerNotFoundError 
} from '@bg-jobs/shared';

// Lua script for atomic job claiming
const CLAIM_JOB_SCRIPT = `
  -- Try high priority queue first
  local jobId = redis.call('ZPOPMIN', 'queue:high')
  
  -- If no high priority, try each job type queue
  if not jobId or #jobId == 0 then
    local types = {'email', 'export', 'resize'}
    for _, type in ipairs(types) do
      local queueKey = 'queue:' .. type
      local result = redis.call('ZPOPMIN', queueKey)
      if result and #result > 0 then
        jobId = result
        break
      end
    end
  end
  
  -- If no jobs available
  if not jobId or #jobId == 0 then
    return nil
  end
  
  local id = jobId[1]
  local jobKey = 'job:' .. id
  
  -- Check if job exists and is in queued state
  local state = redis.call('HGET', jobKey, 'state')
  if state ~= 'queued' then
    -- Put it back if not queued
    redis.call('ZADD', 'queue:rejected', ARGV[1], id)
    return nil
  end
  
  -- Mark as in-flight
  local now = ARGV[2]
  local workerId = ARGV[3]
  
  redis.call('HMSET', jobKey,
    'state', 'in-flight',
    'workerId', workerId,
    'startedAt', now,
    'updatedAt', now
  )
  
  -- Add to in-flight set
  redis.call('SADD', 'jobs:in-flight', id)
  
  -- Set worker's current job
  redis.call('HSET', 'worker:' .. workerId, 'currentJobId', id)
  
  return id
`;

export class RedisStore implements IStore {
  private client: Redis;
  private connected: boolean = false;

  constructor(redisUrl: string) {
    this.client = new Redis(redisUrl);
  }

  async connect(): Promise<void> {
    if (this.connected) return;
    await this.client.ping();
    this.connected = true;
    console.log('Connected to Redis');
  }

  async disconnect(): Promise<void> {
    await this.client.quit();
    this.connected = false;
    console.log('Disconnected from Redis');
  }

  async clearStore(): Promise<void> {
    await this.client.flushdb();
    console.log('Store cleared');
  }

  async enqueueJob(
    type: JobType, 
    payload: Record<string, unknown>, 
    priority: 'high' | 'normal' = 'normal'
  ): Promise<Job> {
    const now = new Date().toISOString();
    const job: Job = {
      id: generateJobId(),
      type,
      payload,
      state: JobState.QUEUED,
      priority,
      createdAt: now,
      updatedAt: now,
      enqueuedAt: now,
      attempt: 0,
      maxAttempts: 3,
    };

    // Store job hash
    await this.client.hset(
      `job:${job.id}`,
      this.serializeJob(job)
    );

    // Add state history
    await this.addStateHistory(job.id, JobState.QUEUED, now);

    // Add to appropriate queue based on priority
    const score = Date.now();
    if (priority === 'high') {
      await this.client.zadd('queue:high', score.toString(), job.id);
    } else {
      await this.client.zadd(`queue:${type}`, score.toString(), job.id);
    }

    return job;
  }

  async claimJob(workerId: string): Promise<Job | null> {
    const now = Date.now().toString();
    const isoNow = new Date().toISOString();
    
    const jobId = await this.client.eval(
      CLAIM_JOB_SCRIPT,
      0,
      now,
      isoNow,
      workerId
    ) as string | null;

    if (!jobId) return null;

    const job = await this.getJob(jobId);
    if (job) {
      await this.addStateHistory(jobId, JobState.IN_FLIGHT, isoNow);
    }
    return job;
  }

  async completeJob(jobId: string, workerId: string): Promise<Job> {
    const job = await this.getJob(jobId);
    if (!job) throw new JobNotFoundError(jobId);
    
    if (!isValidTransition(job.state, JobState.COMPLETED)) {
      throw new InvalidTransitionError(job.state, JobState.COMPLETED);
    }

    const now = new Date().toISOString();
    
    // Update only the fields that change
    await this.client.hset(`job:${jobId}`, {
      state: JobState.COMPLETED,
      completedAt: now,
      updatedAt: now,
    });
    
    await this.client.srem('jobs:in-flight', jobId);
    await this.client.lpush('completed:recent', jobId);
    await this.client.ltrim('completed:recent', 0, 99);
    
    // Clear worker's current job
    await this.client.hdel(`worker:${workerId}`, 'currentJobId');
    
    // Add history
    await this.addStateHistory(jobId, JobState.COMPLETED, now);

    const updatedJob = await this.getJob(jobId);
    if (!updatedJob) throw new JobNotFoundError(jobId);
    
    return updatedJob;
  }

  async failJob(jobId: string, workerId: string, error: Error): Promise<Job> {
    const job = await this.getJob(jobId);
    if (!job) throw new JobNotFoundError(jobId);
    
    if (!isValidTransition(job.state, JobState.FAILED)) {
      throw new InvalidTransitionError(job.state, JobState.FAILED);
    }

    const now = new Date().toISOString();
    
    await this.client.hset(`job:${jobId}`, {
      state: JobState.FAILED,
      error: error.message,
      stackTrace: error.stack || '',
      failedAt: now,
      updatedAt: now,
    });
    
    await this.client.srem('jobs:in-flight', jobId);
    await this.client.sadd('jobs:failed', jobId);
    
    await this.client.hdel(`worker:${workerId}`, 'currentJobId');
    
    await this.addStateHistory(jobId, JobState.FAILED, now);

    const updatedJob = await this.getJob(jobId);
    if (!updatedJob) throw new JobNotFoundError(jobId);
    
    return updatedJob;
  }

  async getJob(jobId: string): Promise<Job | null> {
    const data = await this.client.hgetall(`job:${jobId}`);
    if (!data || Object.keys(data).length === 0) return null;
    return this.deserializeJob(data);
  }

  async getJobHistory(jobId: string): Promise<string[]> {
    return this.client.lrange(`job:${jobId}:history`, 0, -1);
  }

  async getJobsByState(state: JobState): Promise<Job[]> {
    let ids: string[] = [];
    
    switch (state) {
      case JobState.QUEUED:
        const allQueues = ['queue:high', 'queue:email', 'queue:export', 'queue:resize'];
        for (const queue of allQueues) {
          const queueIds = await this.client.zrange(queue, 0, -1);
          ids.push(...queueIds);
        }
        break;
      case JobState.IN_FLIGHT:
        ids = await this.client.smembers('jobs:in-flight');
        break;
      case JobState.FAILED:
        ids = await this.client.smembers('jobs:failed');
        break;
      case JobState.COMPLETED:
        ids = await this.client.lrange('completed:recent', 0, -1);
        break;
    }

    const jobs: Job[] = [];
    for (const id of ids) {
      const job = await this.getJob(id);
      if (job) jobs.push(job);
    }
    
    return jobs;
  }

  async getQueueDepth(): Promise<Record<string, number>> {
    const types: JobType[] = ['email', 'export', 'resize'];
    const depth: Record<string, number> = {};
    
    for (const type of types) {
      depth[type] = await this.client.zcard(`queue:${type}`);
    }
    depth['high'] = await this.client.zcard('queue:high');
    
    return depth;
  }

  async getInFlightJobs(): Promise<Job[]> {
    return this.getJobsByState(JobState.IN_FLIGHT);
  }

  async getCompletedJobs(limit: number = 100): Promise<Job[]> {
    const ids = await this.client.lrange('completed:recent', 0, limit - 1);
    const jobs: Job[] = [];
    
    for (const id of ids) {
      const job = await this.getJob(id);
      if (job) jobs.push(job);
    }
    
    return jobs;
  }

  async getFailedJobs(): Promise<Job[]> {
    return this.getJobsByState(JobState.FAILED);
  }

  async retryJob(jobId: string): Promise<Job> {
    const job = await this.getJob(jobId);
    if (!job) throw new JobNotFoundError(jobId);
    
    if (job.state !== JobState.FAILED) {
      throw new InvalidTransitionError(job.state, JobState.QUEUED);
    }

    const now = new Date().toISOString();
    const newAttempt = job.attempt + 1;
    
    await this.client.hset(`job:${jobId}`, {
      state: JobState.QUEUED,
      attempt: newAttempt.toString(),
      updatedAt: now,
      enqueuedAt: now,
      error: '',
      stackTrace: '',
      workerId: '',
      startedAt: '',
      completedAt: '',
      failedAt: '',
    });
    
    await this.client.srem('jobs:failed', jobId);
    await this.client.zadd(`queue:${job.type}`, Date.now().toString(), jobId);
    
    await this.addStateHistory(jobId, JobState.QUEUED, now, 'retry');

    const updatedJob = await this.getJob(jobId);
    if (!updatedJob) throw new JobNotFoundError(jobId);
    
    return updatedJob;
  }

  async registerWorker(workerId: string): Promise<Worker> {
    const now = new Date().toISOString();
    const worker: Worker = {
      id: workerId,
      status: 'alive',
      lastHeartbeatAt: now,
      startedAt: now,
    };

    await this.client.hset(`worker:${workerId}`, this.serializeWorker(worker));
    await this.client.sadd('workers:active', workerId);
    
    return worker;
  }

  async heartbeat(workerId: string): Promise<void> {
    // Auto-register worker if not found (self-healing)
    const worker = await this.getWorker(workerId);
    
    if (!worker) {
      // Worker doesn't exist, register it
      await this.registerWorker(workerId);
      console.log(`[Store] Auto-registered worker: ${workerId}`);
      return; // Registration already sets the heartbeat
    }

    const now = new Date().toISOString();
    await this.client.hset(`worker:${workerId}`, {
      lastHeartbeatAt: now,
      status: 'alive',
    });
  }

  async getWorker(workerId: string): Promise<Worker | null> {
    const data = await this.client.hgetall(`worker:${workerId}`);
    if (!data || Object.keys(data).length === 0) return null;
    return this.deserializeWorker(data);
  }

  async getWorkers(): Promise<Worker[]> {
    const ids = await this.client.smembers('workers:active');
    const workers: Worker[] = [];
    
    for (const id of ids) {
      const worker = await this.getWorker(id);
      if (worker) workers.push(worker);
    }
    
    return workers;
  }

  async markDeadWorkers(threshold: number): Promise<Worker[]> {
    const workers = await this.getWorkers();
    const now = Date.now();
    const deadWorkers: Worker[] = [];

    for (const worker of workers) {
      const lastBeat = new Date(worker.lastHeartbeatAt).getTime();
      if (now - lastBeat > threshold && worker.status === 'alive') {
        await this.client.hset(`worker:${worker.id}`, { status: 'dead' });
        worker.status = 'dead';
        deadWorkers.push(worker);
      }
    }

    return deadWorkers;
  }

  async reclaimJobsFromDeadWorkers(threshold: number): Promise<Job[]> {
    const deadWorkers = await this.markDeadWorkers(threshold);
    const reclaimedJobs: Job[] = [];

    for (const worker of deadWorkers) {
      if (worker.currentJobId) {
        const job = await this.getJob(worker.currentJobId);
        if (job && job.state === JobState.IN_FLIGHT) {
          const now = new Date().toISOString();
          
          await this.client.hset(`job:${job.id}`, {
            state: JobState.QUEUED,
            workerId: '',
            startedAt: '',
            updatedAt: now,
          });
          
          await this.client.srem('jobs:in-flight', job.id);
          
          if (job.priority === 'high') {
            await this.client.zadd('queue:high', Date.now().toString(), job.id);
          } else {
            await this.client.zadd(`queue:${job.type}`, Date.now().toString(), job.id);
          }
          
          await this.addStateHistory(job.id, JobState.QUEUED, now, 'reclaimed');
          
          const updatedJob = await this.getJob(job.id);
          if (updatedJob) {
            reclaimedJobs.push(updatedJob);
          }
        }
      }
    }

    return reclaimedJobs;
  }

  private async addStateHistory(
    jobId: string, 
    state: JobState, 
    timestamp: string, 
    reason?: string
  ): Promise<void> {
    const entry = `${timestamp}: ${state}${reason ? ` (${reason})` : ''}`;
    await this.client.lpush(`job:${jobId}:history`, entry);
    await this.client.ltrim(`job:${jobId}:history`, 0, 99);
  }

  private serializeJob(job: Job): Record<string, string> {
    return {
      id: job.id,
      type: job.type,
      payload: JSON.stringify(job.payload),
      state: job.state,
      priority: job.priority,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      enqueuedAt: job.enqueuedAt,
      startedAt: job.startedAt || '',
      completedAt: job.completedAt || '',
      failedAt: job.failedAt || '',
      workerId: job.workerId || '',
      error: job.error || '',
      stackTrace: job.stackTrace || '',
      attempt: job.attempt.toString(),
      maxAttempts: job.maxAttempts.toString(),
    };
  }

  private deserializeJob(data: Record<string, string>): Job {
    return {
      id: data.id,
      type: data.type as JobType,
      payload: JSON.parse(data.payload || '{}'),
      state: data.state as JobState,
      priority: (data.priority as 'high' | 'normal') || 'normal',
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
      enqueuedAt: data.enqueuedAt,
      startedAt: data.startedAt || undefined,
      completedAt: data.completedAt || undefined,
      failedAt: data.failedAt || undefined,
      workerId: data.workerId || undefined,
      error: data.error || undefined,
      stackTrace: data.stackTrace || undefined,
      attempt: parseInt(data.attempt || '0', 10),
      maxAttempts: parseInt(data.maxAttempts || '3', 10),
    };
  }

  private serializeWorker(worker: Worker): Record<string, string> {
    return {
      id: worker.id,
      status: worker.status,
      lastHeartbeatAt: worker.lastHeartbeatAt,
      currentJobId: worker.currentJobId || '',
      startedAt: worker.startedAt,
    };
  }

  private deserializeWorker(data: Record<string, string>): Worker {
    return {
      id: data.id,
      status: data.status as WorkerStatus,
      lastHeartbeatAt: data.lastHeartbeatAt,
      currentJobId: data.currentJobId || undefined,
      startedAt: data.startedAt,
    };
  }
}
