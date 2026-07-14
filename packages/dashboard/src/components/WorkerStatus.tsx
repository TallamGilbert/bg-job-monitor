import React from 'react';

interface Worker {
  id: string;
  status: string;
  lastHeartbeatAt: string;
  currentJobId?: string;
}

interface Props {
  workers: Worker[];
}

export default function WorkerStatus({ workers }: Props) {
  return (
    <div className="card">
      <h2>👷 Workers ({workers.length})</h2>
      <div className="worker-list">
        {workers.map(worker => (
          <div key={worker.id} className={`worker-item ${worker.status}`}>
            <span className={`status-indicator ${worker.status}`} />
            <div className="worker-info">
              <strong>{worker.id}</strong>
              <span className="worker-status">{worker.status}</span>
              {worker.currentJobId && (
                <span className="worker-job">📋 {worker.currentJobId.slice(-8)}</span>
              )}
            </div>
          </div>
        ))}
        {workers.length === 0 && (
          <p className="empty">No workers connected</p>
        )}
      </div>
    </div>
  );
}
