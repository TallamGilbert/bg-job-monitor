import { 
  JobState, 
  isValidTransition, 
  VALID_TRANSITIONS,
  generateJobId 
} from '@bg-jobs/shared';

describe('Job Lifecycle', () => {
  describe('State Transitions', () => {
    it('should allow valid transitions', () => {
      expect(isValidTransition(JobState.QUEUED, JobState.IN_FLIGHT)).toBe(true);
      expect(isValidTransition(JobState.IN_FLIGHT, JobState.COMPLETED)).toBe(true);
      expect(isValidTransition(JobState.IN_FLIGHT, JobState.FAILED).tobe(true);
      expect(isValidTransition(JobState.FAILED, JobState.QUEUED)).toBe(true); // retry
    });

    it('should reject invalid transitions', () => {
      expect(isValidTransition(JobState.QUEUED, JobState.COMPLETED)).toBe(false);
      expect(isValidTransition(JobState.COMPLETED, JobState.FAILED)).toBe(false);
      expect(isValidTransition(JobState.COMPLETED, JobState.QUEUED)).toBe(false);
    });

    it('should not allow transitions from completed state', () => {
      const allowedFromCompleted = VALID_TRANSITIONS[JobState.COMPLETED];
      expect(allowedFromCompleted).toHaveLength(0);
    });

    it('should allow reclaim transition (in-flight back to queued)', () => {
      expect(isValidTransition(JobState.IN_FLIGHT, JobState.QUEUED)).toBe(true);
    });
  });

  describe('Job ID Generation', () => {
    it('should generate unique IDs', () => {
      const id1 = generateJobId();
      const id2 = generateJobId();
      expect(id1).not.toBe(id2);
    });

    it('should generate IDs with correct format', () => {
      const id = generateJobId();
      expect(id).toMatch(/^job_[a-z0-9]+_[a-z0-9]+$/);
    });
  });
});
