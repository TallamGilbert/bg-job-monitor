#!/usr/bin/env node
import { Worker } from './worker';
import { loadConfig } from '@bg-jobs/shared';

async function main() {
  const config = loadConfig();
  const worker = new Worker({ workerId: config.worker.workerId });

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n[Worker] Received SIGINT signal');
    await worker.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\n[Worker] Received SIGTERM signal');
    await worker.stop();
    process.exit(0);
  });

  try {
    await worker.start();
    console.log(`[Worker] ${worker.getWorkerId()} started successfully`);
  } catch (error) {
    console.error('[Worker] Failed to start:', error);
    process.exit(1);
  }
}

// Run if this is the main module
if (require.main === module) {
  main().catch(console.error);
}

export { Worker, main };
