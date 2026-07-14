import React, { useState } from 'react';

interface Job {
  id: string;
  type: string;
  error: string;
  stackTrace: string;
  failedAt: string;
  attempt: number;
  maxAttempts: number;
}

interface Props {
  jobs: Job[];
  apiUrl: string;
}

export default function FailedJobs({ jobs, apiUrl }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);

  const handleRetry = async (jobId: string) => {
    setRetrying(jobId);
    try {
      const res = await fetch(`${apiUrl}/retry/${jobId}`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        console.log('Job retried:', jobId);
      }
    } catch (error) {
      console.error('Retry failed:', error);
    }
    setRetrying(null);
  };

  return (
    <div className="card">
      <h2>❌ Failed ({jobs.length})</h2>
      <div className="job-list">
        {jobs.map(job => (
          <div key={job.id} className="job-item failed">
            <div className="job-header" onClick={() => setExpanded(expanded === job.id ? null : job.id)}>
              <span className="job-type">{job.type}</span>
              <span className="job-error">{job.error}</span>
              <span className="job-attempts">
                Attempt {job.attempt}/{job.maxAttempts}
              </span>
            </div>
            
            {expanded === job.id && (
              <div className="job-expanded">
                <pre className="stack-trace">{job.stackTrace}</pre>
                <button 
                  className="retry-btn"
                  onClick={() => handleRetry(job.id)}
                  disabled={retrying === job.id}
                >
                  {retrying === job.id ? '⏳ Retrying...' : '🔄 Retry'}
                </button>
              </div>
            )}
          </div>
        ))}
        {jobs.length === 0 && (
          <p className="empty">No failed jobs</p>
        )}
      </div>
    </div>
  );
}
