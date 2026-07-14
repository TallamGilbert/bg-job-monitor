import React from 'react';

interface Props {
  data: Record<string, number>;
}

export default function QueueDepth({ data }: Props) {
  return (
    <div className="card">
      <h2>📈 Queue Depth</h2>
      <div className="queue-bars">
        {Object.entries(data).map(([type, count]) => (
          <div key={type} className="queue-bar">
            <span className="queue-label">{type}</span>
            <div className="bar-container">
              <div 
                className="bar-fill" 
                style={{ width: `${Math.min(count * 10, 100)}%` }}
              />
            </div>
            <span className="queue-count">{count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
