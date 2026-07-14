import { WebSocketServer } from 'ws';
import { Server } from 'http';
import { WebSocketBroadcaster } from './broadcaster';

export function createWebSocketServer(httpServer: Server): {
  wss: WebSocketServer;
  broadcaster: WebSocketBroadcaster;
} {
  const wss = new WebSocketServer({ 
    server: httpServer,
    path: '/ws'
  });

  const broadcaster = new WebSocketBroadcaster(wss);

  console.log('[WebSocket] Server initialized');
  
  return { wss, broadcaster };
}
