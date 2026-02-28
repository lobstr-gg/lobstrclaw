#!/usr/bin/env node

import { Command } from 'commander';
import * as path from 'path';
import { registerInitCommand } from './commands/init';
import { registerDeployCommand } from './commands/deploy';
import { registerStatusCommand } from './commands/status';
import { registerSetupCommand } from './commands/setup';
import { registerStartCommand } from './commands/start';
import { registerStopCommand } from './commands/stop';
import { registerLogsCommand } from './commands/logs';
import { registerAuditCommand } from './commands/audit';
import { registerDoctorCommand } from './commands/doctor';
import { registerConsensusCommand } from './commands/consensus';

const program = new Command();

program
  .name('lobstrclaw')
  .description('LobstrClaw — Agent distribution CLI for the LOBSTR protocol')
  .version('0.2.0');

// Re-export all lobstr commands (wallet, stake, market, job, etc.)
// Resolve openclaw-skill from multiple locations for standalone deployments
loadSkillCommands(program);

// Add lobstrclaw-specific commands
registerInitCommand(program);
registerDeployCommand(program);
registerStatusCommand(program);
registerSetupCommand(program);
registerStartCommand(program);
registerStopCommand(program);
registerLogsCommand(program);
registerAuditCommand(program);
registerDoctorCommand(program);
registerConsensusCommand(program);

program.parse(process.argv);

/**
 * Try to load openclaw-skill commands from multiple locations:
 * 1. Standard require (works in pnpm monorepo)
 * 2. Sibling package in agents deployment (../openclaw-skill)
 * 3. Global node_modules
 *
 * If none found, lobstrclaw still works for init/setup/start/stop/logs/status
 * but wallet/stake/market commands won't be available.
 */
function loadSkillCommands(prog: Command): void {
  const candidates = [
    // Standard resolution (pnpm workspace, node_modules)
    'openclaw-skill',
    // Sibling in agents deployment bundle
    path.resolve(__dirname, '..', '..', 'openclaw-skill', 'dist', 'index.js'),
    path.resolve(__dirname, '..', '..', 'openclaw-skill', 'index.js'),
    // Relative from shared/packages in Docker agents
    path.resolve(__dirname, '..', '..', '..', 'shared', 'packages', 'openclaw-skill', 'dist', 'index.js'),
  ];

  for (const candidate of candidates) {
    try {
      const mod = require(candidate);
      if (typeof mod.registerCommands === 'function') {
        mod.registerCommands(prog);
        return;
      }
    } catch {
      // Try next candidate
    }
  }

  // Not found — lobstrclaw core commands still work
  console.error(
    'Warning: openclaw-skill not found. Protocol commands (wallet, stake, etc.) are unavailable.\n' +
    'Core commands (init, setup, start, stop, logs, status) work normally.\n',
  );
}
