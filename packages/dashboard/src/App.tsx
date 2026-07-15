import React, { useState, useEffect, useCallback } from 'react';
import QueueDepth from './components/QueueDepth';
import InFlightJobs from './components/InFlightJobs';
import CompletedJobs from './components/CompletedJobs';
import FailedJobs from './components/FailedJobs';
import WorkerStatus from './components/WorkerStatus';
import { useWebSocket } from './hooks/useWebSocket';

const API_URL = 'http://localhost:3001/api';
const WS_URL = 'ws://localhost:3001/ws';

export default function App() {
  const [data, setData] = useState({
    queueDepth: {} as Record<string, number>,
    inFlight: [] as any[],
    completed: [] as any[],
    failed: [] as any[],
    workers: [] as any[],
  });
  const [connected, setConnected] = useState(false);

  const { lastMessage } = useWebSocket(WS_URL);

  const loadData = useCallback(async () => {
    try {
      const [depth, inFlight, completed, failed, workers] = await Promise.all([
        fetch(`${API_URL}/jobs/queue-depth`).then(r => r.json()),
        fetch(`${API_URL}/jobs/in-flight`).then(r => r.json()),
        fetch(`${API_URL}/jobs/completed`).then(r => r.json()),
        fetch(`${API_URL}/jobs/failed`).then(r => r.json()),
        fetch(`${API_URL}/workers`).then(r => r.json()),
      ]);
      setData({
        queueDepth: depth.data || {},
        inFlight: inFlight.data || [],
        completed: completed.data || [],
        failed: failed.data || [],
        workers: workers.data || [],
      });
    } catch (err) {
      console.error('Load error:', err);
    }
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 3000);
    return () => clearInterval(interval);
  }, [loadData]);

  useEffect(() => {
    if (!lastMessage) return;
    try {
      const event = JSON.parse(lastMessage.data);
      if (event.type === 'connected') setConnected(true);
    } catch (err) {}
  }, [lastMessage]);

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>📊 Background Job Monitor</h1>
        <div className="connection-status">
          <span className={`status-dot ${connected ? 'connected' : ''}`} />
          {connected ? 'Live' : 'Polling'}
        </div>
      </header>
      <div className="dashboard-grid">
        <QueueDepth data={data.queueDepth} />
        <WorkerStatus workers={data.workers} />
        <InFlightJobs jobs={data.inFlight} />
        <CompletedJobs jobs={data.completed} />
        <FailedJobs jobs={data.failed} apiUrl={API_URL} />
      </div>
    </div>
  );
}
