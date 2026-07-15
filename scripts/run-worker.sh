#!/bin/bash

echo "=== Worker Control Script ==="

# Parse arguments
MAX_JOBS=""
IDLE_TIMEOUT=""
WORKER_ID="worker-1"

while [[ $# -gt 0 ]]; do
  case $1 in
    --max-jobs)
      MAX_JOBS="--max-jobs $2"
      shift 2
      ;;
    --idle-timeout)
      IDLE_TIMEOUT="--idle-timeout $2"
      shift 2
      ;;
    --worker-id)
      WORKER_ID="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1"
      echo "Usage: $0 [--max-jobs N] [--idle-timeout MS] [--worker-id ID]"
      exit 1
      ;;
  esac
done

echo "Starting worker: $WORKER_ID"
echo "Max jobs: ${MAX_JOBS:-none}"
echo "Idle timeout: ${IDLE_TIMEOUT:-none}"
echo ""
echo "Press Ctrl+C to stop manually"
echo ""

WORKER_ID=$WORKER_ID npm run start --workspace=@bg-jobs/worker -- $MAX_JOBS $IDLE_TIMEOUT
