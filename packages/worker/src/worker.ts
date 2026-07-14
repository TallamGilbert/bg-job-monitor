import { RedisStore } from '@bg-jobs/store';
import { Job, loadConfig } from '@bg-jobs/shared';
import { JobProcessor } from './processor';
import { HeartbeatManager } from './heartbeat';

export interface WorkerOptions {
  workerId?: string;
  maxJobs?: number; // Process N jobs then stop (0 = infinite)
  idleTimeout?: number; // Stop after N ms of no jobs (0 = never)
}

export class Worker {
  private store: RedisStore;
  private processor: JobProcessor;
  private heartbeatManager: HeartbeatManager;
  private workerId: string;
  private pollInterval: number;
  private running: boolean = false;
  private currentJob: Job | null = null;
  private maxJobs: number;
  private idleTimeout: number;
  private jobsProcessed: number = 0;
  private lastJobTime: number = Date.now();
  private idleTimer: NodeJS.Timeout | null = null;

  constructor(options?: WorkerOptions) {
    const config = loadConfig();
    
    this.workerId = options?.workerId || config.worker.workerId || `worker_${Math.random().toString(36).substring(2, 8)}`;
    this.pollInterval = 2000; // Poll every 2 seconds
    this.maxJobs = options?.maxJobs || 0; // 0 = infinite
    this.idleTimeout = options?.idleTimeout || 0; // 0 = never timeout
    
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
    console.log(`[Worker] Configuration:`);
    console.log(`  - Max jobs: ${this.maxJobs || 'infinite'}`);
    console.log(`  - Idle timeout: ${this.idleTimeout ? `${this.idleTimeout}ms` : 'none'}`);
    console.log(`  - Poll interval: ${this.pollInterval}ms`);
    
    // Connect to store
    await this.store.connect();
    
    // Register worker
    await this.store.registerWorker(this.workerId);
    
    // Start heartbeat
    await this.heartbeatManager.start();
    
    // Start idle timeout if configured
    if (this.idleTimeout > 0) {
      this.startIdleTimer();
    }
    
    // Start processing loop
    this.running = true;
    await this.processLoop();
  }

  async stop(): Promise<void> {
    if (!this.running) return;
    
    console.log(`\n[Worker] Stopping worker: ${this.workerId}`);
    console.log(`[Worker] Jobs processed: ${this.jobsProcessed}`);
    
    this.running = false;
    
    // Clear idle timer
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    
    // Stop heartbeat
    await this.heartbeatManager.stop();
    
    // If currently processing a job, mark it as failed
    if (this.currentJob) {
      try {
        console.log(`[Worker] Failing current job ${this.currentJob.id} due to shutdown`);
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
    console.log(`[Worker] Worker ${this.workerId} stopped successfully`);
  }

  private startIdleTimer(): void {
    this.idleTimer = setTimeout(async () => {
      console.log(`\n[Worker] Idle timeout reached (${this.idleTimeout}ms). Stopping...`);
      await this.stop();
      process.exit(0);
    }, this.idleTimeout);
  }

  private resetIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.startIdleTimer();
    }
  }

  private async processLoop(): Promise<void> {
    while (this.running) {
      try {
        // Check if we've reached max jobs
        if (this.maxJobs > 0 && this.jobsProcessed >= this.maxJobs) {
          console.log(`\n[Worker] Maximum jobs reached (${this.maxJobs}). Stopping...`);
          await this.stop();
          process.exit(0);
        }

        // Try to claim a job
        const job = await this.store.claimJob(this.workerId);
        
        if (job) {
          this.currentJob = job;
          this.lastJobTime = Date.now();
          this.resetIdleTimer();
          
          console.log(`\n[Worker] Claimed job: ${job.id} (${job.type})`);
          console.log(`[Worker] Payload:`, JSON.stringify(job.payload));
          
          try {
            // Process the job
            const startTime = Date.now();
            await this.processor.process(job);
            const duration = Date.now() - startTime;
            
            // Mark as completed
            await this.store.completeJob(job.id, this.workerId);
            this.jobsProcessed++;
            
            console.log(`[Worker] ✅ Job ${job.id} completed in ${duration}ms`);
            console.log(`[Worker] Total jobs processed: ${this.jobsProcessed}`);
          } catch (error) {
            // Mark as failed
            const err = error instanceof Error ? error : new Error(String(error));
            await this.store.failJob(job.id, this.workerId, err);
            this.jobsProcessed++;
            
            console.error(`[Worker] ❌ Job ${job.id} failed:`, err.message);
            if (err.stack) {
              console.error(`[Worker] Stack trace saved to store`);
            }
          } finally {
            this.currentJob = null;
          }
        } else {
          // No jobs available
          const idleTime = Date.now() - this.lastJobTime;
          process.stdout.write(`\r[Worker] No jobs available. Idle for ${Math.round(idleTime/1000)}s...`);
          await this.delay(this.pollInterval);
        }
      } catch (error) {
        console.error(`\n[Worker] Error in process loop:`, error);
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

  getJobsProcessed(): number {
    return this.jobsProcessed;
  }
}
