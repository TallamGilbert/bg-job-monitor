export interface AppConfig {
  store: {
    type: 'redis' | 'postgres';
    redisUrl?: string;
    postgresUrl?: string;
  };
  server: {
    apiPort: number;
    wsPort: number;
  };
  worker: {
    workerId: string;
    heartbeatInterval: number;
    deadThreshold: number;
    reclaimTimeout: number;
  };
}

export function loadConfig(): AppConfig {
  const storeType = process.env.STORE_TYPE || 'redis';
  
  return {
    store: {
      type: storeType as 'redis' | 'postgres',
      redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
      postgresUrl: process.env.POSTGRES_URL,
    },
    server: {
      apiPort: parseInt(process.env.API_PORT || '3000', 10),
      wsPort: parseInt(process.env.WS_PORT || '3001', 10),
    },
    worker: {
      workerId: process.env.WORKER_ID || 'worker-unknown',
      heartbeatInterval: parseInt(process.env.HEARTBEAT_INTERVAL || '10000', 10),
      deadThreshold: parseInt(process.env.DEAD_THRESHOLD || '30000', 10),
      reclaimTimeout: parseInt(process.env.RECLAIM_TIMEOUT || '35000', 10),
    },
  };
}
