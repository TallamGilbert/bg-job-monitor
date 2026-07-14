import React from 'react';
import { useElapsedTime } from '../hooks/useElapsedTime';

interface Job {
  id: string;
  type: string;
  workerId: string;
  startedAt: string;
  payload: any;
}

interface Props {
  jobs: Job[];
}

function InFlightJob({ job }: { job: Job }) {
  const elapsed = useElapsedTime(job.startedAt);

  return (
    <div className="job-item in-flight">
      <div className="job-header">
        <span className="job-type">{job.type}</span>
        <span className="job-elapsed">⏱ {elapsed}</span>
      </div>
      <div className="job-details">
        <span>Worker: {job.workerId}</span>
        <span>ID: {job.id.slice(-8)}</span>
      </div>
    </div>
  );
}

export default function InFlightJobs({ jobs }: Props) {
  return (
    <div className="card">
      <h2>✈️ In Flight ({jobs.length})</h2>
      <div className="job-list">
        {jobs.map(job => (
          <InFlightJob key={job.id} job={job} />
        ))}
        {jobs.length === 0 && (
          <p className="empty">No jobs in flight</p>
        )}
      </div>
    </div>
  );
}
