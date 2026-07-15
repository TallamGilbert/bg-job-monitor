#!/bin/bash

echo "╔══════════════════════════════════════════╗"
echo "║   Phase 2: Producer-Worker Demo          ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# Ensure Redis is running
if ! redis-cli ping > /dev/null 2>&1; then
    echo "❌ Redis is not running. Starting Redis..."
    redis-server --daemonize yes
    sleep 2
fi

echo "✅ Redis is running"
echo ""

# Clear Redis
echo "🧹 Clearing Redis..."
redis-cli FLUSHDB
echo ""

# Start a worker with max 5 jobs and 30 second idle timeout
echo "🚀 Starting worker (max 5 jobs, 30s idle timeout)..."
WORKER_ID=demo-worker-1 npm run start --workspace=@bg-jobs/worker -- --max-jobs 5 --idle-timeout 30000 &
WORKER_PID=$!

# Wait for worker to initialize
sleep 3

# Enqueue some jobs
echo ""
echo "📦 Enqueuing 3 email jobs..."
npm run enqueue --workspace=@bg-jobs/producer -- --type email --count 3

# Wait for processing
sleep 10

echo ""
echo "📦 Enqueuing 4 export jobs..."
npm run enqueue --workspace=@bg-jobs/producer -- --type export --count 4

# Wait for worker to finish or timeout
echo ""
echo "⏳ Waiting for worker to complete..."
wait $WORKER_PID 2>/dev/null

echo ""
echo "✅ Demo complete!"
echo ""
echo "Check Redis for results:"
echo "  redis-cli keys '*'"
echo "  redis-cli HGETALL job:<job-id>"
