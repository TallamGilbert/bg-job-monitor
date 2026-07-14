import { WebSocketServer, WebSocket } from 'ws';

export type WsEventType = 
  | 'job:enqueued' 
  | 'job:claimed' 
  | 'job:completed' 
  | 'job:failed' 
  | 'job:reclaimed'
  | 'worker:alive' 
  | 'worker:dead'
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
        console.error('[WS] Client error:', error.message);
        this.clients.delete(ws);
      });
    });
  }

  broadcast(event: WsMessage): void {
    const message = JSON.stringify(event);
    this.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }

  private sendToClient(ws: WebSocket, event: WsMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(event));
    }
  }

  jobEnqueued(job: any): void {
    this.broadcast({ type: 'job:enqueued', timestamp: new Date().toISOString(), data: job });
  }

  jobCompleted(job: any): void {
    this.broadcast({ type: 'job:completed', timestamp: new Date().toISOString(), data: job });
  }

  jobFailed(job: any): void {
    this.broadcast({ type: 'job:failed', timestamp: new Date().toISOString(), data: job });
  }

  getClientCount(): number {
    return this.clients.size;
  }
}
