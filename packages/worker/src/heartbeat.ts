import { RedisStore } from '@bg-jobs/store';

export class HeartbeatManager {
  private store: RedisStore;
  private workerId: string;
  private interval: number;
  private timer: NodeJS.Timeout | null = null;
  private consecutiveFailures: number = 0;
  private maxFailures: number = 5;

  constructor(store: RedisStore, workerId: string, intervalMs: number = 10000) {
    this.store = store;
    this.workerId = workerId;
    this.interval = intervalMs;
  }

  async start(): Promise<void> {
    // Register worker first to ensure it exists
    try {
      await this.store.registerWorker(this.workerId);
      console.log(`[Heartbeat] Worker ${this.workerId} registered`);
    } catch (error) {
      console.error(`[Heartbeat] Failed to register worker:`, error);
    }

    // Send initial heartbeat
    await this.sendHeartbeat();
    
    // Start periodic heartbeats
    this.timer = setInterval(async () => {
      try {
        await this.sendHeartbeat();
      } catch (error) {
        console.error(`[Heartbeat] Failed to send heartbeat for ${this.workerId}:`, error);
      }
    }, this.interval);
    
    console.log(`[Heartbeat] Started for worker ${this.workerId} (every ${this.interval}ms)`);
  }

  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      console.log(`[Heartbeat] Stopped for worker ${this.workerId}`);
    }
  }

  private async sendHeartbeat(): Promise<void> {
    try {
      await this.store.heartbeat(this.workerId);
      this.consecutiveFailures = 0; // Reset failure count on success
      console.log(`[Heartbeat] ${this.workerId} sent heartbeat at ${new Date().toISOString()}`);
    } catch (error: any) {
      this.consecutiveFailures++;
      
      // If worker not found, try to re-register
      if (error?.name === 'WorkerNotFoundError' || error?.message?.includes('not found')) {
        console.log(`[Heartbeat] Worker ${this.workerId} not found, re-registering...`);
        try {
          await this.store.registerWorker(this.workerId);
          console.log(`[Heartbeat] Worker ${this.workerId} re-registered`);
          // Try heartbeat again
          await this.store.heartbeat(this.workerId);
          this.consecutiveFailures = 0;
        } catch (regError) {
          console.error(`[Heartbeat] Failed to re-register worker:`, regError);
        }
      } else if (this.consecutiveFailures >= this.maxFailures) {
        console.error(`[Heartbeat] Too many consecutive failures (${this.consecutiveFailures}). Stopping heartbeat.`);
        await this.stop();
      } else {
        console.error(`[Heartbeat] Heartbeat failed (attempt ${this.consecutiveFailures}/${this.maxFailures}):`, error?.message);
      }
    }
  }
}
