export enum JobState {
  QUEUED = 'queued',
  IN_FLIGHT = 'in-flight',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export type JobType = 'email' | 'export' | 'resize';
export type Priority = 'high' | 'normal';

export interface Job {
  id: string;
  type: JobType;
  payload: Record<string, unknown>;
  state: JobState;
  priority: Priority;
  createdAt: string;
  updatedAt: string;
  // State transition timestamps
  enqueuedAt: string;
  startedAt?: string;
  completedAt?: string;
  failedAt?: string;
  // Worker tracking
  workerId?: string;
  // Failure details
  error?: string;
  stackTrace?: string;
  // Retry tracking
  attempt: number;
  maxAttempts: number;
}

// Valid state transitions map
export const VALID_TRANSITIONS: Record<JobState, JobState[]> = {
  [JobState.QUEUED]: [JobState.IN_FLIGHT],
  [JobState.IN_FLIGHT]: [JobState.COMPLETED, JobState.FAILED, JobState.QUEUED], // QUEUED is for reclaim
  [JobState.COMPLETED]: [],
  [JobState.FAILED]: [JobState.QUEUED], // Retry
};

export function isValidTransition(from: JobState, to: JobState): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export function generateJobId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `job_${timestamp}_${random}`;
}
