import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import chalk from 'chalk';
import { pidDir } from '../lib/pid';

export function registerLogsCommand(program: Command): void {
  program
    .command('logs [name]')
    .description('View agent daemon logs')
    .option('-f, --follow', 'Follow log output (like tail -f)')
    .option('-n, --lines <number>', 'Number of lines to show', '50')
    .option('--cron <script>', 'Show logs for a specific cron script (e.g., heartbeat-check)')
    .action(async (name: string | undefined, opts: {
      follow?: boolean;
      lines: string;
      cron?: string;
    }) => {
      try {
        const agentDir = name ? path.resolve(process.cwd(), name) : process.cwd();
        const agentName = name || path.basename(agentDir);
        const dotDir = pidDir(agentDir);

        // Determine which log file to show
        let logFile: string;

        if (opts.cron) {
          // Specific cron script log
          const scriptName = opts.cron.replace(/\.sh$/, '');
          logFile = path.join(dotDir, 'logs', `${scriptName}.log`);
        } else {
          // Main agent log
          logFile = path.join(dotDir, 'agent.log');
        }

        if (!fs.existsSync(logFile)) {
          console.error(chalk.yellow(`\n  No logs found at: ${logFile}`));

          // List available log files
          const logsDir = path.join(dotDir, 'logs');
          if (fs.existsSync(logsDir)) {
            const available = fs.readdirSync(logsDir)
              .filter(f => f.endsWith('.log'))
              .map(f => f.replace('.log', ''));
            if (available.length > 0) {
              console.error(chalk.dim(`\n  Available cron logs: ${available.join(', ')}`));
              console.error(chalk.dim(`  Usage: lobstrclaw logs ${agentName} --cron <name>\n`));
            }
          }

          if (!opts.cron) {
            console.error(chalk.dim(`  Agent '${agentName}' may not have been started yet.\n`));
          }
          process.exit(1);
        }

        const numLines = parseInt(opts.lines, 10) || 50;

        if (opts.follow) {
          // Stream with tail -f
          const child = spawn('tail', ['-n', String(numLines), '-f', logFile], {
            stdio: 'inherit',
          });

          // Pass through Ctrl+C
          process.on('SIGINT', () => {
            child.kill('SIGTERM');
            process.exit(0);
          });

          child.on('exit', (code) => {
            process.exit(code || 0);
          });
        } else {
          // Show last N lines
          const content = fs.readFileSync(logFile, 'utf-8');
          const lines = content.split('\n');
          const start = Math.max(0, lines.length - numLines - 1);
          const output = lines.slice(start).join('\n').trimEnd();

          if (output) {
            console.log(output);
          } else {
            console.log(chalk.dim('  (log file is empty)'));
          }
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(chalk.red(`\n  Error: ${msg}\n`));
        process.exit(1);
      }
    });
}
