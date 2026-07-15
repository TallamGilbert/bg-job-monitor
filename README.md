# Background Job Monitor Dashboard

A full-stack job monitoring system with real-time dashboard, worker health tracking, and automatic job recovery. Built from scratch without external job queue libraries.

## What This System Does

This system processes background jobs (emails, exports, image resizing) using a producer-worker pattern with a shared Redis store. A live React dashboard shows the entire system state in real-time via WebSockets, including queue depths, in-flight jobs with elapsed time, worker health, and failed jobs with retry capability.

**Key Features:**

- Producer enqueues jobs with type, payload, and priority
- Workers claim and process jobs with exactly-one semantics
- Worker heartbeats every 10 seconds
- Dead worker detection after 30 seconds of silence
- Automatic job reclamation from dead workers
- Live dashboard with WebSocket updates
- Retry failed jobs from the dashboard
- Full stack trace capture for failures

---

## Architecture

```
┌──────────────┐     ┌──────────────┐     ┌──────────────────┐
│   Producer   │────▶│    Redis     │◀────│   Worker Pool    │
│  (enqueues)  │     │   (store)    │     │   (processes)    │
└──────────────┘     └──────┬───────┘     └──────────────────┘
                            │
                     ┌──────▼───────┐
                     │  API Server  │
                     │ (REST + WS)  │
                     └──────┬───────┘
                            │
                     ┌──────▼───────┐
                     │    React     │
                     │  Dashboard   │
                     └──────────────┘
```

**Data Flow:**

1. **Producer → Redis** — enqueues job records with type, payload, priority via atomic Lua scripts
2. **Worker ↔ Redis** — claims oldest job atomically, processes it, updates state, sends heartbeats
3. **API Server → Redis** — reads job/worker data for REST endpoints
4. **API Server → Dashboard** — pushes state changes via WebSocket
5. **Dashboard → API Server** — retry requests via REST

### Redis Data Structures

| Key                | Type       | Purpose                        |
| ------------------ | ---------- | ------------------------------ |
| `job:{id}`         | Hash       | Job data and state             |
| `job:{id}:history` | List       | State transition history       |
| `queue:email`      | Sorted Set | Email job queue                |
| `queue:export`     | Sorted Set | Export job queue               |
| `queue:resize`     | Sorted Set | Resize job queue               |
| `queue:high`       | Sorted Set | High priority queue            |
| `jobs:in-flight`   | Set        | Jobs currently being processed |
| `jobs:failed`      | Set        | Failed job IDs                 |
| `completed:recent` | List       | Last 100 completed job IDs     |
| `worker:{id}`      | Hash       | Worker data and status         |
| `workers:active`   | Set        | Active worker IDs              |

---

## Setup & Configuration

### Prerequisites

- Node.js 18+
- Redis 6+

### Installation

```bash
npm install
cp .env.example .env
# Edit .env with your configuration
```

### Environment Variables

| Variable             | Default                  | Description                |
| -------------------- | ------------------------ | -------------------------- |
| `STORE_TYPE`         | `redis`                  | Storage backend            |
| `REDIS_URL`          | `redis://localhost:6379` | Redis connection           |
| `API_PORT`           | `3000`                   | REST API port              |
| `WS_PORT`            | `3001`                   | WebSocket port             |
| `WORKER_ID`          | `worker-unknown`         | Unique worker identifier   |
| `HEARTBEAT_INTERVAL` | `10000`                  | Heartbeat interval (ms)    |
| `DEAD_THRESHOLD`     | `30000`                  | Dead worker threshold (ms) |
| `RECLAIM_TIMEOUT`    | `35000`                  | Job reclaim timeout (ms)   |

---

## Running the System

### 1. Start Redis

```bash
redis-server --daemonize yes
```

### 2. Start the API & WebSocket Server

```bash
npm run start --workspace=@bg-jobs/server
# Server: http://localhost:3001
# WebSocket: ws://localhost:3001/ws
```

### 3. Start the Dashboard

```bash
npm run dev --workspace=@bg-jobs/dashboard
# Dashboard: http://localhost:5173
```

### 4. Run the Producer

```bash
# Single job
npm run enqueue --workspace=@bg-jobs/producer -- --type email --count 1

# Test batch of 20 mixed jobs
npm run test-batch --workspace=@bg-jobs/producer

# High priority jobs
npm run enqueue --workspace=@bg-jobs/producer -- --type email --count 5 --priority high
```

### 5. Run Workers

```bash
# Process 10 jobs then stop
WORKER_ID=worker-1 npm run start --workspace=@bg-jobs/worker -- --max-jobs 10

# Process indefinitely (Ctrl+C to stop)
WORKER_ID=worker-2 npm run start --workspace=@bg-jobs/worker

# Stop after 30s of no jobs
WORKER_ID=worker-3 npm run start --workspace=@bg-jobs/worker -- --idle-timeout 30000
```

---

## The Job Lifecycle

Every job moves through these states:

```
QUEUED → IN-FLIGHT → COMPLETED
                  ↘ FAILED → QUEUED (retry)
```

| Transition              | Trigger                           |
| ----------------------- | --------------------------------- |
| `QUEUED → IN-FLIGHT`    | Worker claims the job             |
| `IN-FLIGHT → COMPLETED` | Job processed successfully        |
| `IN-FLIGHT → FAILED`    | Processing threw an error         |
| `FAILED → QUEUED`       | Retry button clicked in dashboard |
| `IN-FLIGHT → QUEUED`    | Reclaimed from dead worker        |

Each transition is timestamped. Invalid transitions (e.g., completing a queued job) are rejected.

---

## Worker Heartbeats & Dead Detection

- Workers send a heartbeat every 10 seconds
- A worker silent for more than 30 seconds is marked dead
- A dead worker that resumes heartbeating is automatically marked alive again
- The 30-second threshold (3× the heartbeat interval) prevents false positives from temporary network issues or GC pauses

### Job Reclaim

When a worker dies mid-processing:

1. System detects worker death (30s threshold)
2. After 35-second reclaim timeout, the in-flight job returns to `QUEUED`
3. Another healthy worker claims and processes it
4. The job is never lost

> **Slow vs Dead Worker:** A slow job on a healthy worker is NOT reclaimed because the worker continues heartbeating. Only workers that stop heartbeating entirely trigger reclaim.

---

## Retrying Failed Jobs

From the dashboard, click **Retry** on any failed job:

- Failed jobs return to `QUEUED` state
- Retry counter increments
- Stack trace is preserved for debugging
- Queued, in-flight, or completed jobs cannot be retried (returns error)

---

## Running Tests

```bash
# All tests
npm test

# Phase-specific
npm run test:unit          # Job lifecycle and store tests
npm run test:integration   # Producer-worker integration tests
npm run test:phase3        # Worker health and reclaim tests

# Single test file
npx jest tests/integration/rest-api.test.ts --verbose
```

---

## Usage Examples

### Enqueue a Batch and Process

```bash
# Terminal 1: Start server
npm run start --workspace=@bg-jobs/server

# Terminal 2: Start dashboard
npm run dev --workspace=@bg-jobs/dashboard

# Terminal 3: Enqueue jobs
npm run test-batch --workspace=@bg-jobs/producer

# Terminal 4: Start worker
WORKER_ID=worker-1 npm run start --workspace=@bg-jobs/worker -- --max-jobs 10
```

Watch the dashboard at `http://localhost:5173` update in real-time.

### Kill a Worker and Watch Reclaim

```bash
# Start a worker processing a batch
WORKER_ID=worker-1 npm run start --workspace=@bg-jobs/worker -- --max-jobs 5

# While it's processing, kill it (Ctrl+C or kill -9)
# Wait 35 seconds and watch the dashboard
# The job returns to QUEUED and gets picked up by another worker
```

### Retry a Failed Job

1. Find a failed job on the dashboard
2. Click the failed job to expand it
3. View the stack trace
4. Click **Retry**
5. Watch it get processed again

---

## Known Limitations

- Redis is the only supported store backend
- No persistent storage beyond Redis (data lost on `FLUSHDB`)
- No authentication or authorization
- Workers must be started manually
- No job scheduling or delayed execution
- Dashboard requires manual refresh if WebSocket disconnects
- No horizontal scaling beyond Redis capacity

---

## Tech Stack

| Layer     | Technology                           |
| --------- | ------------------------------------ |
| Backend   | Node.js, TypeScript, Express, `ws`   |
| Frontend  | React, TypeScript, Vite              |
| Store     | Redis with ioredis                   |
| Testing   | Jest                                 |
| Job Queue | Custom-built (no Bull/BullMQ/Agenda) |
