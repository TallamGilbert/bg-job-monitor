import { RedisStore } from '@bg-jobs/store';
import { Job, loadConfig } from '@bg-jobs/shared';
import { JobProcessor } from './processor';
import { HeartbeatManager } from './heartbeat';

export class Worker {
  private store: RedisStore;
  private processor: JobProcessor;
  private heartbeatManager: HeartbeatManager;
  private workerId: string;
  private pollInterval: number;
  private running: boolean = false;
  private currentJob: Job | null = null;

  constructor(options?: { workerId?: string }) {
    const config = loadConfig();
    
    this.workerId = options?.workerId || config.worker.workerId || `worker_${Math.random().toString(36).substring(2, 8)}`;
    this.pollInterval = config.worker.heartbeatInterval / 2 || 5000; // Poll twice per heartbeat
    
    const redisUrl = config.store.redisUrl || 'redis://localhost:6379';
    this.store = new RedisStore(redisUrl);
    this.processor = new JobProcessor();
    this.heartbeatManager = new HeartbeatManager(
      this.store, 
      this.workerId, 
      config.worker.heartbeatInterval || 10000
    );
  }

  async start(): Promise<void> {
    console.log(`[Worker] Starting worker: ${this.workerId}`);
    
    // Connect to store
    await this.store.connect();
    
    // Register worker
    await this.store.registerWorker(this.workerId);
    
    // Start heartbeat
    await this.heartbeatManager.start();
    
    // Start processing loop
    this.running = true;
    this.processLoop();
    
    console.log(`[Worker] Worker ${this.workerId} is ready`);
  }

  async stop(): Promise<void> {
    console.log(`[Worker] Stopping worker: ${this.workerId}`);
    
    this.running = false;
    
    // Stop heartbeat
    await this.heartbeatManager.stop();
    
    // If currently processing a job, mark it as failed
    if (this.currentJob) {
      try {
        await this.store.failJob(
          this.currentJob.id, 
          this.workerId, 
          new Error('Worker shutdown during processing')
        );
      } catch (error) {
        console.error(`[Worker] Failed to mark job as failed during shutdown:`, error);
      }
    }
    
    await this.store.disconnect();
    console.log(`[Worker] Worker ${this.workerId} stopped`);
  }

  private async processLoop(): Promise<void> {
    while (this.running) {
      try {
        // Try to claim a job
        const job = await this.store.claimJob(this.workerId);
        
        if (job) {
          this.currentJob = job;
          
          try {
            // Process the job
            await this.processor.process(job);
            
            // Mark as completed
            await this.store.completeJob(job.id, this.workerId);
            console.log(`[Worker] Job ${job.id} completed successfully`);
          } catch (error) {
            // Mark as failed
            const err = error instanceof Error ? error : new Error(String(error));
            await this.store.failJob(job.id, this.workerId, err);
            console.error(`[Worker] Job ${job.id} failed:`, err.message);
          } finally {
            this.currentJob = null;
          }
        } else {
          // No jobs available, wait before polling again
          await this.delay(this.pollInterval);
        }
      } catch (error) {
        console.error(`[Worker] Error in process loop:`, error);
        await this.delay(this.pollInterval);
      }
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getWorkerId(): string {
    return this.workerId;
  }

  getCurrentJob(): Job | null {
    return this.currentJob;
  }
}
