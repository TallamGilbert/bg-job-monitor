import React from 'react';

interface Job {
  id: string;
  type: string;
  completedAt: string;
  workerId: string;
}

interface Props {
  jobs: Job[];
}

export default function CompletedJobs({ jobs }: Props) {
  return (
    <div className="card">
      <h2>✅ Completed ({jobs.length})</h2>
      <div className="job-list compact">
        {jobs.slice(0, 10).map(job => (
          <div key={job.id} className="job-item completed">
            <span className="job-type">{job.type}</span>
            <span className="job-id">{job.id.slice(-8)}</span>
            <span className="job-time">
              {new Date(job.completedAt).toLocaleTimeString()}
            </span>
          </div>
        ))}
        {jobs.length === 0 && (
          <p className="empty">No completed jobs</p>
        )}
      </div>
    </div>
  );
}
