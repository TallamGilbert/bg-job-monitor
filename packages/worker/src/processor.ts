import { Job, JobType } from '@bg-jobs/shared';

export type JobHandler = (job: Job) => Promise<void>;

export class JobProcessor {
  private handlers: Map<JobType, JobHandler>;

  constructor() {
    this.handlers = new Map();
    this.registerDefaultHandlers();
  }

  private registerDefaultHandlers(): void {
    // Email handler - simulates sending email
    this.handlers.set('email', async (job: Job) => {
      console.log(`[Email] Sending email to ${job.payload.to}...`);
      console.log(`  Subject: ${job.payload.subject}`);
      
      // Simulate email sending time (1-3 seconds)
      const delay = 1000 + Math.random() * 2000;
      await new Promise(resolve => setTimeout(resolve, delay));
      
      // Simulate occasional failures (10% chance)
      if (Math.random() < 0.1) {
        throw new Error(`SMTP connection timeout while sending to ${job.payload.to}`);
      }
      
      console.log(`[Email] Successfully sent to ${job.payload.to}`);
    });

    // Export handler - simulates generating reports
    this.handlers.set('export', async (job: Job) => {
      console.log(`[Export] Generating ${job.payload.format} report ${job.payload.reportId}...`);
      
      // Simulate export time (2-5 seconds)
      const delay = 2000 + Math.random() * 3000;
      await new Promise(resolve => setTimeout(resolve, delay));
      
      // Simulate occasional failures (15% chance)
      if (Math.random() < 0.15) {
        throw new Error(`Export failed: insufficient disk space for ${job.payload.reportId}`);
      }
      
      console.log(`[Export] Report ${job.payload.reportId} generated successfully`);
    });

    // Resize handler - simulates image processing
    this.handlers.set('resize', async (job: Job) => {
      console.log(`[Resize] Processing image ${job.payload.imageUrl}...`);
      console.log(`  Dimensions: ${job.payload.width}x${job.payload.height}`);
      
      // Simulate processing time (0.5-2 seconds)
      const delay = 500 + Math.random() * 1500;
      await new Promise(resolve => setTimeout(resolve, delay));
      
      // Simulate occasional failures (5% chance)
      if (Math.random() < 0.05) {
        throw new Error(`Image processing failed: corrupt file ${job.payload.imageUrl}`);
      }
      
      console.log(`[Resize] Image processed: ${job.payload.imageUrl}`);
    });
  }

  registerHandler(type: JobType, handler: JobHandler): void {
    this.handlers.set(type, handler);
    console.log(`[Processor] Registered handler for job type: ${type}`);
  }

  async process(job: Job): Promise<void> {
    const handler = this.handlers.get(job.type);
    
    if (!handler) {
      throw new Error(`No handler registered for job type: ${job.type}`);
    }

    console.log(`[Processor] Starting job ${job.id} (${job.type})`);
    const startTime = Date.now();
    
    try {
      await handler(job);
      const duration = Date.now() - startTime;
      console.log(`[Processor] Completed job ${job.id} in ${duration}ms`);
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[Processor] Failed job ${job.id} after ${duration}ms`);
      throw error; // Re-throw to be caught by worker
    }
  }
}
