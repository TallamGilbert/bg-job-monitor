export type WorkerStatus = 'alive' | 'dead';

export interface Worker {
  id: string;
  status: WorkerStatus;
  lastHeartbeatAt: string;
  currentJobId?: string;
  startedAt: string;
}

export function generateWorkerId(): string {
  const random = Math.random().toString(36).substring(2, 8);
  return `worker_${random}`;
}
