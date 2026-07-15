#!/bin/bash

echo "Running Phase 3 Tests..."
echo ""

# Ensure Redis is running
redis-cli ping > /dev/null 2>&1 || {
    echo "Starting Redis..."
    redis-server --daemonize yes
    sleep 2
}

# Clear Redis
echo "Clearing Redis..."
redis-cli FLUSHDB

# Run tests with force exit to prevent hanging
npx jest tests/integration/worker-health.test.ts \
  --verbose \
  --runInBand \
  --forceExit \
  --testTimeout 15000

echo ""
echo "Tests complete!"
