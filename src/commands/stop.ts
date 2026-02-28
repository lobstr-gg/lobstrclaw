import { Command } from 'commander';
import * as path from 'path';
import chalk from 'chalk';
import { isRunning, readPid, removePid } from '../lib/pid';

export function registerStopCommand(program: Command): void {
  program
    .command('stop [name]')
    .description('Stop a running agent daemon')
    .option('--force', 'Send SIGKILL immediately instead of SIGTERM')
    .action(async (name: string | undefined, opts: { force?: boolean }) => {
      try {
        console.log(chalk.bold('\n  LobstrClaw — Stop Agent\n'));

        const agentDir = name ? path.resolve(process.cwd(), name) : process.cwd();
        const agentName = name || path.basename(agentDir);

        const { running, info } = isRunning(agentDir);

        if (!running || !info) {
          console.log(chalk.yellow(`  Agent '${agentName}' is not running.\n`));
          // Clean up stale PID file if it exists
          removePid(agentDir);
          return;
        }

        const pid = info.pid;
        console.log(chalk.dim(`  Agent:  ${agentName}`));
        console.log(chalk.dim(`  PID:    ${pid}`));
        console.log(chalk.dim(`  Since:  ${info.startedAt}`));
        console.log('');

        if (opts.force) {
          // Immediate SIGKILL
          try {
            process.kill(pid, 'SIGKILL');
            console.log(chalk.yellow(`  Sent SIGKILL to PID ${pid}`));
          } catch {
            console.log(chalk.dim('  Process already exited.'));
          }
          removePid(agentDir);
          console.log(chalk.green(`  Agent '${agentName}' killed.\n`));
          return;
        }

        // Graceful SIGTERM
        try {
          process.kill(pid, 'SIGTERM');
          console.log(chalk.dim(`  Sent SIGTERM to PID ${pid}, waiting for exit...`));
        } catch {
          console.log(chalk.dim('  Process already exited.'));
          removePid(agentDir);
          console.log(chalk.green(`  Agent '${agentName}' stopped.\n`));
          return;
        }

        // Poll for exit with 10s timeout
        const deadline = Date.now() + 10_000;
        let exited = false;

        while (Date.now() < deadline) {
          await sleep(500);
          try {
            process.kill(pid, 0);
            // Still alive
          } catch {
            exited = true;
            break;
          }
        }

        if (!exited) {
          // Escalate to SIGKILL
          console.log(chalk.yellow('  Graceful shutdown timed out, sending SIGKILL...'));
          try {
            process.kill(pid, 'SIGKILL');
          } catch {
            // Already dead
          }
          await sleep(1000);
        }

        removePid(agentDir);
        console.log(chalk.green(`  Agent '${agentName}' stopped.\n`));
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(chalk.red(`\n  Error: ${msg}\n`));
        process.exit(1);
      }
    });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
