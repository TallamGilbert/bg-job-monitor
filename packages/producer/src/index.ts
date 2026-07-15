#!/usr/bin/env node
import { Command } from 'commander';
import { createEnqueueCommand } from './commands/enqueue';
import { loadConfig } from '@bg-jobs/shared';

const program = new Command();

program
  .name('producer')
  .description('Background job producer - enqueues jobs for processing')
  .version('1.0.0');

// Add commands
program.addCommand(createEnqueueCommand());

// Parse command line arguments
program.parse(process.argv);

// Show help if no arguments provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
