#!/usr/bin/env node

import { Command } from 'commander';
import { registerCommands } from 'openclaw-skill';
import { registerInitCommand } from './commands/init';
import { registerDeployCommand } from './commands/deploy';
import { registerStatusCommand } from './commands/status';

const program = new Command();

program
  .name('lobstrclaw')
  .description('LobstrClaw — Agent distribution CLI for the LOBSTR protocol')
  .version('0.1.0');

// Re-export all lobstr commands (wallet, stake, market, job, etc.)
registerCommands(program);

// Add lobstrclaw-specific commands
registerInitCommand(program);
registerDeployCommand(program);
registerStatusCommand(program);

program.parse(process.argv);
