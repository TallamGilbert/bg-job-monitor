export class StoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StoreError';
  }
}

export class InvalidTransitionError extends StoreError {
  constructor(from: string, to: string) {
    super(`Invalid state transition: ${from} → ${to}`);
    this.name = 'InvalidTransitionError';
  }
}

export class JobNotFoundError extends StoreError {
  constructor(jobId: string) {
    super(`Job not found: ${jobId}`);
    this.name = 'JobNotFoundError';
  }
}

export class JobAlreadyClaimedError extends StoreError {
  constructor(jobId: string) {
    super(`Job already claimed: ${jobId}`);
    this.name = 'JobAlreadyClaimedError';
  }
}

export class WorkerNotFoundError extends StoreError {
  constructor(workerId: string) {
    super(`Worker not found: ${workerId}`);
    this.name = 'WorkerNotFoundError';
  }
}
