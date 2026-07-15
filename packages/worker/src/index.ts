#!/usr/bin/env node
import { Worker } from './worker';
import { loadConfig } from '@bg-jobs/shared';

async function main() {
  const config = loadConfig();
  
  // Parse command line arguments for optional limits
  const args = process.argv.slice(2);
  const options: { maxJobs?: number; idleTimeout?: number } = {};
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--max-jobs' && args[i + 1]) {
      options.maxJobs = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--idle-timeout' && args[i + 1]) {
      options.idleTimeout = parseInt(args[i + 1], 10);
      i++;
    }
  }
  
  const worker = new Worker({ 
    workerId: config.worker.workerId,
    ...options 
  });

  // Handle graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`\n[Worker] Received ${signal} signal`);
    await worker.stop();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  try {
    await worker.start();
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
