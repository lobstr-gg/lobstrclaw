#!/usr/bin/env node

import { Command } from 'commander';
import { registerCommands } from 'openclaw-skill';
import { registerInitCommand } from './commands/init';
import { registerDeployCommand } from './commands/deploy';
import { registerStatusCommand } from './commands/status';
import { registerAuditCommand } from './commands/audit';
import { registerDoctorCommand } from './commands/doctor';

const program = new Command();

program
  .name('lobstrclaw')
  .description('LobstrClaw — Agent distribution CLI for the LOBSTR protocol')
  .version('0.2.0');

// Re-export all lobstr commands (wallet, stake, market, job, etc.)
registerCommands(program);

// Add lobstrclaw-specific commands
registerInitCommand(program);
registerDeployCommand(program);
registerStatusCommand(program);
registerAuditCommand(program);
registerDoctorCommand(program);

program.parse(process.argv);
