import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import chalk from 'chalk';
import { isRunning } from '../lib/pid';

export function registerStatusCommand(program: Command): void {
  program
    .command('status [name]')
    .description('Check agent health (workspace, wallet, heartbeat, Docker)')
    .action(async (name: string | undefined) => {
      try {
        console.log(chalk.bold('\n  LobstrClaw — Agent Status\n'));

        const agentDir = name ? path.resolve(process.cwd(), name) : process.cwd();
        const agentName = name || path.basename(agentDir);

        console.log(chalk.dim(`  Agent: ${agentName}`));
        console.log(chalk.dim(`  Dir:   ${agentDir}`));
        console.log('');

        let issues = 0;

        // Check SOUL.md
        if (fs.existsSync(path.join(agentDir, 'SOUL.md'))) {
          console.log(chalk.green('  [OK]  ') + 'SOUL.md exists');
        } else {
          console.log(chalk.red('  [FAIL]') + ' SOUL.md missing');
          issues++;
        }

        // Check HEARTBEAT.md
        if (fs.existsSync(path.join(agentDir, 'HEARTBEAT.md'))) {
          console.log(chalk.green('  [OK]  ') + 'HEARTBEAT.md exists');
        } else {
          console.log(chalk.red('  [FAIL]') + ' HEARTBEAT.md missing');
          issues++;
        }

        // Check IDENTITY.md
        if (fs.existsSync(path.join(agentDir, 'IDENTITY.md'))) {
          console.log(chalk.green('  [OK]  ') + 'IDENTITY.md exists');
        } else {
          console.log(chalk.yellow('  [WARN]') + ' IDENTITY.md missing');
        }

        // Check RULES.md
        if (fs.existsSync(path.join(agentDir, 'RULES.md'))) {
          console.log(chalk.green('  [OK]  ') + 'RULES.md exists');
        } else {
          console.log(chalk.yellow('  [WARN]') + ' RULES.md missing');
        }

        // Check REWARDS.md
        if (fs.existsSync(path.join(agentDir, 'REWARDS.md'))) {
          console.log(chalk.green('  [OK]  ') + 'REWARDS.md exists');
        } else {
          console.log(chalk.yellow('  [WARN]') + ' REWARDS.md missing');
        }

        // Check crontab
        if (fs.existsSync(path.join(agentDir, 'crontab'))) {
          console.log(chalk.green('  [OK]  ') + 'crontab exists');
        } else {
          console.log(chalk.red('  [FAIL]') + ' crontab missing');
          issues++;
        }

        // Check docker-compose.yml
        if (fs.existsSync(path.join(agentDir, 'docker-compose.yml'))) {
          console.log(chalk.green('  [OK]  ') + 'docker-compose.yml exists');
        } else {
          console.log(chalk.yellow('  [WARN]') + ' docker-compose.yml missing (--no-docker?)');
        }

        // Check OpenClaw workspace
        try {
          const { getWorkspacePath } = require('../lib/workspace');
          const wsPath = getWorkspacePath(agentName);
          if (fs.existsSync(path.join(wsPath, 'config.json'))) {
            console.log(chalk.green('  [OK]  ') + `Workspace: ${wsPath}`);

            // Check wallet
            if (fs.existsSync(path.join(wsPath, 'wallet.json'))) {
              console.log(chalk.green('  [OK]  ') + 'Wallet file exists');
            } else {
              console.log(chalk.yellow('  [WARN]') + ' No wallet.json in workspace');
            }

            // Check heartbeat freshness
            const hbFile = path.join(wsPath, 'heartbeats.jsonl');
            if (fs.existsSync(hbFile)) {
              const stat = fs.statSync(hbFile);
              const ageSeconds = Math.round((Date.now() - stat.mtimeMs) / 1000);
              if (ageSeconds < 900) {
                console.log(chalk.green('  [OK]  ') + `Heartbeat fresh (${ageSeconds}s ago)`);
              } else {
                console.log(chalk.red('  [FAIL]') + ` Heartbeat stale (${ageSeconds}s ago, >900s)`);
                issues++;
              }
            } else {
              console.log(chalk.yellow('  [WARN]') + ' No heartbeats.jsonl (agent not running?)');
            }
          } else {
            console.log(chalk.yellow('  [WARN]') + ' OpenClaw workspace not initialized');
          }
        } catch {
          console.log(chalk.dim('  [SKIP]') + ' OpenClaw not available for workspace check');
        }

        // Check local daemon
        const { running: daemonRunning, info: daemonInfo } = isRunning(agentDir);
        if (daemonRunning && daemonInfo) {
          const uptime = Math.round((Date.now() - new Date(daemonInfo.startedAt).getTime()) / 1000);
          const uptimeStr = uptime > 3600
            ? `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`
            : uptime > 60
              ? `${Math.floor(uptime / 60)}m ${uptime % 60}s`
              : `${uptime}s`;
          console.log(chalk.green('  [OK]  ') + `Local daemon running (PID ${daemonInfo.pid}, up ${uptimeStr}, role: ${daemonInfo.role})`);
        } else {
          console.log(chalk.dim('  [SKIP]') + ' Local daemon not running');
        }

        // Check Docker container (if Docker is available)
        try {
          const containerName = `lobstr-${agentName}`;
          const result = execSync(
            `docker inspect --format '{{.State.Status}}' ${containerName} 2>/dev/null`,
            { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] },
          ).trim();

          if (result === 'running') {
            console.log(chalk.green('  [OK]  ') + `Docker container running: ${containerName}`);
          } else {
            console.log(chalk.yellow('  [WARN]') + ` Docker container status: ${result}`);
          }
        } catch {
          console.log(chalk.dim('  [SKIP]') + ' Docker not available or container not found');
        }

        // Summary
        console.log('');
        if (issues === 0) {
          console.log(chalk.green('  All checks passed.'));
        } else {
          console.log(chalk.red(`  ${issues} issue(s) found.`));
        }
        console.log('');
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(chalk.red(`\n  Error: ${msg}\n`));
        process.exit(1);
      }
    });
}
