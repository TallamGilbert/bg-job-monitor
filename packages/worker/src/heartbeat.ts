import { RedisStore } from '@bg-jobs/store';

export class HeartbeatManager {
  private store: RedisStore;
  private workerId: string;
  private interval: number;
  private timer: NodeJS.Timeout | null = null;

  constructor(store: RedisStore, workerId: string, intervalMs: number = 10000) {
    this.store = store;
    this.workerId = workerId;
    this.interval = intervalMs;
  }

  async start(): Promise<void> {
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
    await this.store.heartbeat(this.workerId);
    console.log(`[Heartbeat] ${this.workerId} sent heartbeat at ${new Date().toISOString()}`);
  }
}
