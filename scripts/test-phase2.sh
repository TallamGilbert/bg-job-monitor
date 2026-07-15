#!/bin/bash

echo "=== Phase 2 Manual Test ===="
echo ""

# Ensure Redis is running
if ! redis-cli ping > /dev/null 2>&1; then
    echo "Starting Redis..."
    redis-server --daemonize yes
    sleep 1
fi

echo "1. Clearing Redis..."
redis-cli FLUSHDB

echo ""
echo "2. Starting a worker..."
WORKER_ID=worker-1 STORE_TYPE=redis npm run start --workspace=@bg-jobs/worker &
WORKER_PID=$!
sleep 2

echo ""
echo "3. Enqueuing 5 email jobs..."
STORE_TYPE=redis npm run enqueue --workspace=@bg-jobs/producer -- --type email --count 5

sleep 5

echo ""
echo "4. Checking queue status..."
redis-cli keys "*"

echo ""
echo "5. Stopping worker..."
kill $WORKER_PID 2>/dev/null || true

echo ""
echo "=== Test Complete ==="
