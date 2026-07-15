import { Command } from 'commander';
import { Producer } from '../producer';
import { loadConfig } from '@bg-jobs/shared';
import { JobType } from '@bg-jobs/shared';

export function createEnqueueCommand(): Command {
  const command = new Command('enqueue');

  command
    .description('Enqueue jobs to the background job queue')
    .option('-t, --type <type>', 'Job type (email, export, resize)', 'email')
    .option('-c, --count <count>', 'Number of jobs to enqueue', '1')
    .option('-p, --payload <json>', 'JSON payload for the job', '{}')
    .option('--priority <priority>', 'Job priority (high or normal)', 'normal')
    .option('--batch', 'Generate a test batch of mixed jobs')
    .action(async (options) => {
      const config = loadConfig();
      const producer = new Producer(config.store.redisUrl || 'redis://localhost:6379');

      try {
        await producer.connect();

        if (options.batch) {
          const count = parseInt(options.count, 10);
          await producer.generateTestBatch(count);
        } else {
          const count = parseInt(options.count, 10);
          const type = options.type as JobType;
          const payload = JSON.parse(options.payload);
          const priority = options.priority as 'high' | 'normal';

          for (let i = 0; i < count; i++) {
            await producer.enqueueJob({
              type,
              payload: { ...payload, index: i },
              priority,
            });
          }
        }

        await producer.getQueueStatus();
      } catch (error) {
        console.error('Error enqueuing jobs:', error);
        process.exit(1);
      } finally {
        await producer.disconnect();
      }
    });

  return command;
}
