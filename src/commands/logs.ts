import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
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
          // Show last N lines first, then follow
          printLastLines(logFile, numLines);

          // Watch for changes using fs.watch (cross-platform)
          followFile(logFile);
        } else {
          // Show last N lines
          printLastLines(logFile, numLines);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(chalk.red(`\n  Error: ${msg}\n`));
        process.exit(1);
      }
    });
}

/**
 * Print the last N lines of a file.
 */
function printLastLines(filePath: string, numLines: number): void {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const start = Math.max(0, lines.length - numLines - 1);
  const output = lines.slice(start).join('\n').trimEnd();

  if (output) {
    console.log(output);
  } else {
    console.log(chalk.dim('  (log file is empty)'));
  }
}

/**
 * Follow a file for new content (cross-platform, pure Node.js).
 * Uses fs.watch + polling to detect appended data.
 */
function followFile(filePath: string): void {
  let position = fs.statSync(filePath).size;

  const readNew = () => {
    let currentSize: number;
    try {
      currentSize = fs.statSync(filePath).size;
    } catch {
      return; // File may have been deleted
    }

    if (currentSize > position) {
      const fd = fs.openSync(filePath, 'r');
      const buf = Buffer.alloc(currentSize - position);
      fs.readSync(fd, buf, 0, buf.length, position);
      fs.closeSync(fd);
      process.stdout.write(buf.toString('utf-8'));
      position = currentSize;
    } else if (currentSize < position) {
      // File was truncated — reset
      position = 0;
    }
  };

  // Use fs.watch for instant notification + interval as fallback
  // fs.watch is cross-platform but can be unreliable on some systems
  try {
    fs.watch(filePath, () => readNew());
  } catch {
    // Fall back to polling only
  }

  // Polling fallback (catches anything fs.watch misses)
  const interval = setInterval(readNew, 1000);

  // Clean exit on Ctrl+C
  process.on('SIGINT', () => {
    clearInterval(interval);
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    clearInterval(interval);
    process.exit(0);
  });
}
