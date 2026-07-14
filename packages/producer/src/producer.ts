import { RedisStore } from '@bg-jobs/store';
import { Job, JobType, Priority } from '@bg-jobs/shared';

export interface EnqueueOptions {
  type: JobType;
  payload: Record<string, unknown>;
  priority?: Priority;
}

export class Producer {
  private store: RedisStore;

  constructor(redisUrl: string) {
    this.store = new RedisStore(redisUrl);
  }

  async connect(): Promise<void> {
    await this.store.connect();
    console.log('Producer connected to Redis');
  }

  async disconnect(): Promise<void> {
    await this.store.disconnect();
    console.log('Producer disconnected');
  }

  async enqueueJob(options: EnqueueOptions): Promise<Job> {
    const job = await this.store.enqueueJob(
      options.type,
      options.payload,
      options.priority || 'normal'
    );
    
    console.log(`[Producer] Enqueued job: ${job.id}`);
    console.log(`  Type: ${job.type}`);
    console.log(`  Priority: ${job.priority}`);
    console.log(`  Payload: ${JSON.stringify(job.payload)}`);
    
    return job;
  }

  async enqueueBatch(options: EnqueueOptions[]): Promise<Job[]> {
    const jobs: Job[] = [];
    
    console.log(`[Producer] Enqueuing batch of ${options.length} jobs...`);
    
    for (const option of options) {
      const job = await this.enqueueJob(option);
      jobs.push(job);
      // Small delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    
    console.log(`[Producer] Batch complete. ${jobs.length} jobs enqueued.`);
    return jobs;
  }

  async generateTestBatch(count: number = 10): Promise<Job[]> {
    const types: JobType[] = ['email', 'export', 'resize'];
    const jobs: EnqueueOptions[] = [];

    for (let i = 0; i < count; i++) {
      const type = types[i % types.length];
      
      switch (type) {
        case 'email':
          jobs.push({
            type: 'email',
            payload: {
              to: `user${i}@example.com`,
              subject: `Test email ${i}`,
              body: `This is test email number ${i}`,
            },
            priority: i < 3 ? 'high' : 'normal', // First 3 are high priority
          });
          break;
        case 'export':
          jobs.push({
            type: 'export',
            payload: {
              format: i % 2 === 0 ? 'pdf' : 'csv',
              reportId: `report_${i}`,
              userId: `user_${Math.floor(i / 3)}`,
            },
          });
          break;
        case 'resize':
          jobs.push({
            type: 'resize',
            payload: {
              imageUrl: `https://example.com/images/photo_${i}.jpg`,
              width: 800,
              height: 600,
              quality: 80,
            },
          });
          break;
      }
    }

    return this.enqueueBatch(jobs);
  }

  async getQueueStatus(): Promise<void> {
    const depth = await this.store.getQueueDepth();
    const inFlight = await this.store.getInFlightJobs();
    const failed = await this.store.getFailedJobs();
    
    console.log('\n=== Queue Status ===');
    console.log('Queue Depth:', depth);
    console.log('In Flight:', inFlight.length);
    console.log('Failed:', failed.length);
    console.log('==================\n');
  }
}
