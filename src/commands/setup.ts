import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import {
  createWorkspace,
  getWorkspacePath,
  loadConfig,
  encryptKey,
  saveWallet,
  walletExists,
  loadWallet,
  promptPassword,
} from '../lib/workspace';

/**
 * lobstrclaw setup [name]
 *
 * Creates the full OpenClaw workspace + wallet pipeline for an agent.
 * Bridges the gap between `lobstrclaw init` (scaffolds files) and
 * `lobstrclaw start` (needs workspace + wallet to run).
 *
 * Works non-interactively when OPENCLAW_PASSWORD is set.
 */
export function registerSetupCommand(program: Command): void {
  program
    .command('setup [name]')
    .description('Set up OpenClaw workspace and wallet for an agent')
    .option('--chain <chain>', 'Target chain (base, base-sepolia)', 'base')
    .option('--import-key <key>', 'Import existing private key instead of generating')
    .action(async (name: string | undefined, opts: {
      chain: string;
      importKey?: string;
    }) => {
      try {
        console.log(chalk.bold('\n  LobstrClaw — Agent Setup\n'));

        const agentDir = name ? path.resolve(process.cwd(), name) : process.cwd();
        const agentName = name || path.basename(agentDir);

        // Verify this is an agent directory
        if (!fs.existsSync(path.join(agentDir, 'SOUL.md'))) {
          console.error(chalk.red('  Not an agent directory (no SOUL.md).'));
          console.error(chalk.dim(`  Run 'lobstrclaw init ${agentName}' first.\n`));
          process.exit(1);
        }

        console.log(chalk.dim(`  Agent: ${agentName}`));
        console.log(chalk.dim(`  Dir:   ${agentDir}`));
        console.log(chalk.dim(`  Chain: ${opts.chain}`));
        console.log('');

        const result = await setupWorkspaceAndWallet(agentName, opts.chain, opts.importKey);

        if (result.walletAddress) {
          console.log('');
          console.log(chalk.bold('  Setup complete:'));
          console.log(chalk.dim(`  Workspace: ${result.workspacePath}`));
          console.log(chalk.dim(`  Wallet:    ${result.walletAddress}`));
          console.log('');
          console.log(chalk.bold('  Next steps:'));
          console.log(chalk.dim(`  1. Fund ${result.walletAddress} with ETH (gas) + LOB (staking)`));
          console.log(chalk.dim(`  2. Copy .env.example to .env and fill in secrets`));
          console.log(chalk.dim(`  3. Run: lobstrclaw start ${agentName}`));
          console.log('');
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(chalk.red(`\n  Error: ${msg}\n`));
        process.exit(1);
      }
    });
}

export interface SetupResult {
  workspacePath: string;
  walletAddress: string | null;
  workspaceCreated: boolean;
  walletCreated: boolean;
}

/**
 * Core setup logic — reusable by both `setup` and `init` commands.
 * Creates OpenClaw workspace + wallet for the given agent.
 *
 * Non-interactive when OPENCLAW_PASSWORD env var is set.
 */
export async function setupWorkspaceAndWallet(
  agentName: string,
  chain: string,
  importKey?: string,
): Promise<SetupResult> {
  const result: SetupResult = {
    workspacePath: '',
    walletAddress: null,
    workspaceCreated: false,
    walletCreated: false,
  };

  // ── Step 1: Create or verify workspace ──────────────────────────
  const wsPath = getWorkspacePath(agentName);
  result.workspacePath = wsPath;

  const configExists = fs.existsSync(path.join(wsPath, 'config.json'));

  if (configExists) {
    const spinner = ora('Workspace already exists, verifying...').start();
    try {
      loadConfig(agentName);
      spinner.succeed(`Workspace verified: ${wsPath}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      spinner.fail(`Workspace corrupt: ${msg}`);
      process.exit(1);
    }
  } else {
    const spinner = ora(`Creating workspace '${agentName}' (chain: ${chain})...`).start();
    try {
      createWorkspace(agentName, chain);
      result.workspaceCreated = true;
      spinner.succeed(`Workspace created: ${wsPath}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      spinner.fail(`Workspace creation failed: ${msg}`);
      process.exit(1);
    }
  }

  // ── Step 2: Create or verify wallet ─────────────────────────────
  if (walletExists(wsPath)) {
    const spinner = ora('Wallet already exists, verifying...').start();
    try {
      const w = loadWallet(wsPath);
      result.walletAddress = w.address;
      spinner.succeed(`Wallet verified: ${w.address}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      spinner.fail(`Wallet corrupt: ${msg}`);
      process.exit(1);
    }
  } else {
    // Need to create wallet — get password
    const password = await getWalletPassword();
    if (!password) {
      console.log(chalk.yellow('  Wallet creation skipped (no password provided).'));
      console.log(chalk.dim('  Run later: lobstrclaw setup ' + agentName + '\n'));
      return result;
    }

    const spinner = ora('Creating wallet...').start();
    try {
      let privateKey: string;
      let address: string;

      if (importKey) {
        // Import existing key
        if (!importKey.startsWith('0x') || importKey.length !== 66) {
          spinner.fail('Invalid private key format (expected 0x + 64 hex chars)');
          process.exit(1);
        }
        const { privateKeyToAccount } = require('viem/accounts');
        const account = privateKeyToAccount(importKey as `0x${string}`);
        privateKey = importKey;
        address = account.address;
      } else {
        // Generate new key using Node.js crypto (no viem dependency needed)
        const { createKeyPair } = await import('../lib/keygen');
        const kp = createKeyPair();
        privateKey = kp.privateKey;
        address = kp.address;
      }

      const encrypted = encryptKey(privateKey, password);
      encrypted.address = address;
      saveWallet(wsPath, encrypted);

      result.walletAddress = address;
      result.walletCreated = true;
      spinner.succeed(`Wallet created: ${address}`);

      if (!importKey) {
        console.log(chalk.yellow('  Back up your password — it cannot be recovered'));
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      spinner.fail(`Wallet creation failed: ${msg}`);
      process.exit(1);
    }
  }

  return result;
}

/**
 * Get wallet password — from env var (non-interactive) or prompt.
 * Returns null if no password available (e.g., piped input, no tty).
 */
async function getWalletPassword(): Promise<string | null> {
  // Non-interactive: use env var
  if (process.env.OPENCLAW_PASSWORD) {
    const pw = process.env.OPENCLAW_PASSWORD;
    if (pw.length < 8) {
      console.error(chalk.red('  OPENCLAW_PASSWORD must be at least 8 characters.'));
      process.exit(1);
    }
    return pw;
  }

  // Interactive: prompt for password
  if (!process.stdin.isTTY) {
    return null;
  }

  try {
    const password = await promptPassword('Create wallet password: ');
    if (password.length < 8) {
      console.error(chalk.red('  Password must be at least 8 characters.'));
      process.exit(1);
    }
    const confirm = await promptPassword('Confirm password: ');
    if (password !== confirm) {
      console.error(chalk.red('  Passwords do not match.'));
      process.exit(1);
    }
    return password;
  } catch {
    return null;
  }
}
