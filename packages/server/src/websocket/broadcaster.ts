import { WebSocketServer, WebSocket } from 'ws';
import { Job, Worker } from '@bg-jobs/shared';

export type WsEventType = 
  | 'job:enqueued' 
  | 'job:claimed' 
  | 'job:completed' 
  | 'job:failed' 
  | 'job:reclaimed'
  | 'worker:alive' 
  | 'worker:dead'
  | 'worker:heartbeat'
  | 'connected';

export interface WsMessage {
  type: WsEventType;
  timestamp: string;
  data: any;
}

export class WebSocketBroadcaster {
  private wss: WebSocketServer;
  private clients: Set<WebSocket> = new Set();

  constructor(wss: WebSocketServer) {
    this.wss = wss;
    this.setupConnectionHandler();
  }

  private setupConnectionHandler(): void {
    this.wss.on('connection', (ws: WebSocket) => {
      console.log('[WS] Client connected');
      this.clients.add(ws);
      
      // Send welcome message
      this.sendToClient(ws, {
        type: 'connected',
        timestamp: new Date().toISOString(),
        data: { message: 'Connected to job monitor', clients: this.clients.size }
      });

      ws.on('close', () => {
        console.log('[WS] Client disconnected');
        this.clients.delete(ws);
      });

      ws.on('error', (error) => {
        console.error('[WS] Client error:', error);
        this.clients.delete(ws);
      });
    });
  }

  broadcast(event: WsMessage): void {
    const message = JSON.stringify(event);
    
    this.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(message);
        } catch (error) {
          console.error('[WS] Failed to send to client:', error);
          this.clients.delete(client);
        }
      }
    });
  }

  private sendToClient(ws: WebSocket, event: WsMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(event));
    }
  }

  // Specific event helpers
  jobEnqueued(job: Job): void {
    this.broadcast({
      type: 'job:enqueued',
      timestamp: new Date().toISOString(),
      data: job
    });
  }

  jobClaimed(job: Job): void {
    this.broadcast({
      type: 'job:claimed',
      timestamp: new Date().toISOString(),
      data: job
    });
  }

  jobCompleted(job: Job): void {
    this.broadcast({
      type: 'job:completed',
      timestamp: new Date().toISOString(),
      data: job
    });
  }

  jobFailed(job: Job): void {
    this.broadcast({
      type: 'job:failed',
      timestamp: new Date().toISOString(),
      data: job
    });
  }

  jobReclaimed(job: Job): void {
    this.broadcast({
      type: 'job:reclaimed',
      timestamp: new Date().toISOString(),
      data: job
    });
  }

  workerStatusChanged(worker: Worker): void {
    this.broadcast({
      type: worker.status === 'alive' ? 'worker:alive' : 'worker:dead',
      timestamp: new Date().toISOString(),
      data: worker
    });
  }

  getClientCount(): number {
    return this.clients.size;
  }
}
