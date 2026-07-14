import { Job } from './job';
import { Worker } from './worker';

export type EventType =
  | 'job:enqueued'
  | 'job:claimed'
  | 'job:completed'
  | 'job:failed'
  | 'job:reclaimed'
  | 'worker:alive'
  | 'worker:dead';

export interface WsEvent {
  type: EventType;
  timestamp: string;
  data: Job | Worker;
}

export interface JobEvent extends WsEvent {
  type: 'job:enqueued' | 'job:claimed' | 'job:completed' | 'job:failed' | 'job:reclaimed';
  data: Job;
}

export interface WorkerEvent extends WsEvent {
  type: 'worker:alive' | 'worker:dead';
  data: Worker;
}
