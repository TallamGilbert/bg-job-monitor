import { Job, JobState, JobType } from '../types/job';
import { Worker } from '../types/worker';

export interface IStore {
  // Connection lifecycle
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  clearStore?(): Promise<void>; // For testing

  // Job operations
  enqueueJob(type: JobType, payload: Record<string, unknown>, priority?: 'high' | 'normal'): Promise<Job>;
  claimJob(workerId: string): Promise<Job | null>;
  completeJob(jobId: string, workerId: string): Promise<Job>;
  failJob(jobId: string, workerId: string, error: Error): Promise<Job>;
  
  // Query operations
  getJob(jobId: string): Promise<Job | null>;
  getJobsByState(state: JobState): Promise<Job[]>;
  getQueueDepth(): Promise<Record<string, number>>;
  getInFlightJobs(): Promise<Job[]>;
  getCompletedJobs(limit?: number): Promise<Job[]>;
  getFailedJobs(): Promise<Job[]>;
  retryJob(jobId: string): Promise<Job>;
  
  // Worker operations
  registerWorker(workerId: string): Promise<Worker>;
  heartbeat(workerId: string): Promise<void>;
  getWorker(workerId: string): Promise<Worker | null>;
  getWorkers(): Promise<Worker[]>;
  markDeadWorkers(threshold: number): Promise<Worker[]>;
  
  // Reclaim
  reclaimJobsFromDeadWorkers(threshold: number): Promise<Job[]>;
}
