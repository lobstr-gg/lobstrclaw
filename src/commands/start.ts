import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { fork } from 'child_process';
import chalk from 'chalk';
import { isRunning } from '../lib/pid';
import { ROLES, ROLE_NAMES, type RoleName } from '../lib/roles';
import { runPreflight } from './preflight';

export function registerStartCommand(program: Command): void {
  program
    .command('start [name]')
    .description('Start an agent daemon locally')
    .option('--foreground', 'Run in foreground (don\'t detach)')
    .option('--role <role>', 'Override role detection (moderator|arbitrator|dao-ops)')
    .option('--no-discord', 'Disable Discord bot supervisor')
    .option('--no-cron', 'Disable cron scheduler')
    .option('--skip-preflight', 'Skip preflight checks before starting')
    .action(async (name: string | undefined, opts: {
      foreground?: boolean;
      role?: string;
      discord: boolean;
      cron: boolean;
      skipPreflight?: boolean;
    }) => {
      try {
        console.log(chalk.bold('\n  LobstrClaw — Start Agent\n'));

        const agentDir = name ? path.resolve(process.cwd(), name) : process.cwd();
        const agentName = name || path.basename(agentDir);

        // Check not already running
        const { running, info } = isRunning(agentDir);
        if (running && info) {
          console.error(chalk.red(`  Agent '${agentName}' is already running (PID ${info.pid})`));
          console.error(chalk.dim(`  Use 'lobstrclaw stop ${agentName}' first.\n`));
          process.exit(1);
        }

        // Run preflight checks (workspace, agent files, network, contracts, monorepo wiring)
        if (!opts.skipPreflight) {
          console.log(chalk.bold('  Running preflight checks...\n'));
          const preflight = await runPreflight({ agentName, agentDir, chain: 'base' });
          if (!preflight.passed) {
            console.error(chalk.red('  Preflight failed — fix the issues above before starting.'));
            console.error(chalk.dim('  Use --skip-preflight to bypass.\n'));
            process.exit(1);
          }
          console.log(chalk.green('  Preflight passed.\n'));
        } else {
          // Minimal validation when preflight is skipped
          const requiredFiles = ['SOUL.md', 'HEARTBEAT.md', 'crontab'];
          const missing: string[] = [];
          for (const file of requiredFiles) {
            if (!fs.existsSync(path.join(agentDir, file))) {
              missing.push(file);
            }
          }
          if (missing.length > 0) {
            console.error(chalk.red(`  Missing required files: ${missing.join(', ')}`));
            console.error(chalk.dim(`  Run 'lobstrclaw init ${agentName}' first.\n`));
            process.exit(1);
          }
          validateWorkspace(agentName);
        }

        // Detect role
        const role = detectRole(agentDir, opts.role);
        if (!role) {
          console.error(chalk.red('  Could not detect agent role.'));
          console.error(chalk.dim('  Use --role <moderator|arbitrator|dao-ops> or add a role header to crontab.\n'));
          process.exit(1);
        }

        console.log(chalk.dim(`  Agent:  ${agentName}`));
        console.log(chalk.dim(`  Dir:    ${agentDir}`));
        console.log(chalk.dim(`  Role:   ${ROLES[role].title}`));
        console.log(chalk.dim(`  Cron:   ${opts.cron ? 'enabled' : 'disabled'}`));
        console.log(chalk.dim(`  Discord: ${opts.discord ? 'enabled' : 'disabled'}`));
        console.log('');

        // Load env from .env file in agent dir
        const env = loadEnv(agentDir);
        env.AGENT_NAME = agentName;
        env.__LOBSTRCLAW_AGENT_DIR = agentDir;

        // Merge process.env (lower priority than .env file)
        for (const [key, value] of Object.entries(process.env)) {
          if (value !== undefined && !(key in env)) {
            env[key] = value;
          }
        }

        const daemonConfig = {
          agentDir,
          agentName,
          role,
          env,
          enableCron: opts.cron,
          enableDiscord: opts.discord,
        };

        if (opts.foreground) {
          // Run daemon in foreground (blocking)
          console.log(chalk.yellow('  Running in foreground (Ctrl+C to stop)\n'));
          const { runDaemon } = require('../lib/daemon');
          runDaemon(daemonConfig);
        } else {
          // Fork detached daemon
          await forkDaemon(daemonConfig, agentName);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(chalk.red(`\n  Error: ${msg}\n`));
        process.exit(1);
      }
    });
}

function detectRole(agentDir: string, override?: string): RoleName | null {
  // Use explicit override first
  if (override) {
    if (ROLE_NAMES.includes(override as RoleName)) {
      return override as RoleName;
    }
    console.error(chalk.red(`  Invalid role '${override}'. Valid: ${ROLE_NAMES.join(', ')}`));
    return null;
  }

  // Try to detect from crontab header comment
  const crontabPath = path.join(agentDir, 'crontab');
  if (fs.existsSync(crontabPath)) {
    const content = fs.readFileSync(crontabPath, 'utf-8');
    const firstLines = content.split('\n').slice(0, 5).join('\n').toLowerCase();
    for (const roleName of ROLE_NAMES) {
      if (firstLines.includes(roleName)) {
        return roleName;
      }
    }
    // Also check for role title
    for (const roleName of ROLE_NAMES) {
      if (firstLines.includes(ROLES[roleName].title.toLowerCase())) {
        return roleName;
      }
    }
  }

  // Try to detect from SOUL.md
  const soulPath = path.join(agentDir, 'SOUL.md');
  if (fs.existsSync(soulPath)) {
    const content = fs.readFileSync(soulPath, 'utf-8').slice(0, 500).toLowerCase();
    for (const roleName of ROLE_NAMES) {
      if (content.includes(roleName)) {
        return roleName;
      }
    }
    for (const roleName of ROLE_NAMES) {
      if (content.includes(ROLES[roleName].title.toLowerCase())) {
        return roleName;
      }
    }
  }

  return null;
}

function loadEnv(agentDir: string): Record<string, string> {
  const envFile = path.join(agentDir, '.env');
  const env: Record<string, string> = {};

  if (!fs.existsSync(envFile)) return env;

  const content = fs.readFileSync(envFile, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    // Strip surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }

  return env;
}

function validateWorkspace(agentName: string): void {
  try {
    const { getWorkspacePath, walletExists } = require('../lib/workspace');
    const wsPath = getWorkspacePath(agentName);

    if (!fs.existsSync(path.join(wsPath, 'config.json'))) {
      console.error(chalk.red(`  No OpenClaw workspace found for '${agentName}'.`));
      console.error(chalk.dim(`  Run: lobstrclaw setup ${agentName}\n`));
      process.exit(1);
    }

    if (!walletExists(wsPath)) {
      console.error(chalk.red(`  No wallet found for '${agentName}'.`));
      console.error(chalk.dim(`  Run: lobstrclaw setup ${agentName}\n`));
      process.exit(1);
    }
  } catch {
    // openclaw not available — warn but don't block
    console.log(chalk.yellow('  Warning: Could not verify workspace (openclaw not available)'));
  }
}

function forkDaemon(
  config: {
    agentDir: string;
    agentName: string;
    role: RoleName;
    env: Record<string, string>;
    enableCron: boolean;
    enableDiscord: boolean;
  },
  agentName: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    // The daemon entry point — we fork this module with a special env flag
    const daemonEntry = path.resolve(__dirname, '..', 'lib', 'daemon-entry.js');

    const child = fork(daemonEntry, [], {
      detached: true,
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      env: {
        ...config.env,
        __LOBSTRCLAW_DAEMON_CONFIG: JSON.stringify(config),
      },
    });

    const timeout = setTimeout(() => {
      console.error(chalk.red('  Daemon failed to start within 10 seconds.\n'));
      try { child.kill(); } catch { /* noop */ }
      reject(new Error('Daemon start timeout'));
    }, 10_000);

    child.on('message', (msg: { type: string; pid: number }) => {
      if (msg.type === 'ready') {
        clearTimeout(timeout);
        child.disconnect();
        child.unref();

        console.log(chalk.green(`  Agent '${agentName}' started (PID ${msg.pid})`));
        console.log(chalk.dim(`  Logs:  lobstrclaw logs ${agentName}`));
        console.log(chalk.dim(`  Stop:  lobstrclaw stop ${agentName}\n`));
        resolve();
      }
    });

    child.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    child.on('exit', (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new Error(`Daemon exited with code ${code}`));
      }
    });
  });
}
