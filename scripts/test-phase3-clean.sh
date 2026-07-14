#!/bin/bash

echo "Running Phase 3 Tests (Clean)..."
echo ""

# Ensure Redis is running
redis-cli ping > /dev/null 2>&1 || {
    echo "Starting Redis..."
    redis-server --daemonize yes
    sleep 2
}

# Clear Redis completely before tests
echo "Clearing Redis..."
redis-cli FLUSHDB

# Run tests with longer timeout
echo ""
echo "Running tests..."
npx jest tests/integration/worker-health.test.ts --verbose --runInBand --testTimeout 30000

# Cleanup after tests
echo ""
echo "Cleaning up..."
redis-cli FLUSHDB
