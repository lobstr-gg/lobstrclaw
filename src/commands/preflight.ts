import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import chalk from 'chalk';
import {
  getActiveWorkspace,
  loadConfig,
  getWorkspacePath,
  walletExists,
  loadWallet,
} from '../lib/workspace';
import { setupWorkspaceAndWallet } from './setup';

interface CheckResult {
  label: string;
  status: 'ok' | 'warn' | 'fail' | 'skip';
  detail?: string;
}

function formatCheck(r: CheckResult): string {
  const icons: Record<string, string> = {
    ok: chalk.green('[OK]  '),
    warn: chalk.yellow('[WARN]'),
    fail: chalk.red('[FAIL]'),
    skip: chalk.dim('[SKIP]'),
  };
  const icon = icons[r.status];
  const detail = r.detail ? chalk.dim(` — ${r.detail}`) : '';
  return `  ${icon} ${r.label}${detail}`;
}

/**
 * Walk up from startDir looking for pnpm-workspace.yaml.
 * Returns the monorepo root path or null if not found.
 */
function findMonorepoRoot(startDir: string): string | null {
  let dir = startDir;
  while (true) {
    if (fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export interface PreflightResult {
  ok: number;
  warn: number;
  fail: number;
  skip: number;
  passed: boolean;
}

/**
 * Run all preflight checks. Returns structured results.
 * Used by both the `preflight` command and `start` (pre-launch gate).
 */
export async function runPreflight(opts: {
  agentName: string;
  agentDir: string;
  chain: string;
  importKey?: string;
}): Promise<PreflightResult> {
  const { agentName, agentDir, chain, importKey } = opts;
  const results: CheckResult[] = [];

  console.log(chalk.dim(`  Agent: ${agentName}`));
  console.log(chalk.dim(`  Dir:   ${agentDir}\n`));

  // ── Phase 1: Connect / Create Workspace ─────────────────────
  console.log(chalk.bold('  1. Workspace'));

  let workspaceConnected = false;
  try {
    const activeName = getActiveWorkspace();
    if (activeName) {
      const config = loadConfig(activeName);
      const wsPath = getWorkspacePath(activeName);

      if (walletExists(wsPath)) {
        const wallet = loadWallet(wsPath);
        const r: CheckResult = {
          label: 'Connected to workspace',
          status: 'ok',
          detail: `${activeName} (${config.chain}) — wallet ${wallet.address}`,
        };
        results.push(r);
        console.log(formatCheck(r));
        workspaceConnected = true;
      } else {
        const r: CheckResult = {
          label: 'Workspace found but no wallet',
          status: 'warn',
          detail: `${activeName} — running setup to create wallet`,
        };
        results.push(r);
        console.log(formatCheck(r));
      }
    }

    if (!workspaceConnected) {
      const r1: CheckResult = {
        label: 'No active workspace',
        status: 'warn',
        detail: 'creating via setup',
      };
      if (!results.some((r) => r.label.startsWith('Workspace found'))) {
        results.push(r1);
        console.log(formatCheck(r1));
      }

      const setupResult = await setupWorkspaceAndWallet(agentName, chain, importKey);

      if (setupResult.walletAddress) {
        const r2: CheckResult = {
          label: 'Workspace created',
          status: 'ok',
          detail: `${agentName} — wallet ${setupResult.walletAddress}`,
        };
        results.push(r2);
        console.log(formatCheck(r2));
        workspaceConnected = true;
      } else {
        const r2: CheckResult = {
          label: 'Workspace setup',
          status: 'fail',
          detail: 'wallet creation failed or skipped',
        };
        results.push(r2);
        console.log(formatCheck(r2));
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const r: CheckResult = { label: 'Workspace', status: 'fail', detail: msg };
    results.push(r);
    console.log(formatCheck(r));
  }
  console.log('');

  // ── Phase 2: Agent Files ────────────────────────────────────
  console.log(chalk.bold('  2. Agent Files'));

  const requiredFiles = ['SOUL.md', 'HEARTBEAT.md', 'crontab'];
  for (const f of requiredFiles) {
    if (fs.existsSync(path.join(agentDir, f))) {
      const r: CheckResult = { label: f, status: 'ok' };
      results.push(r);
      console.log(formatCheck(r));
    } else {
      const r: CheckResult = { label: f, status: 'fail', detail: 'missing (required)' };
      results.push(r);
      console.log(formatCheck(r));
    }
  }
  console.log('');

  // ── Phase 3: Workspace Integrity ────────────────────────────
  console.log(chalk.bold('  3. Workspace Integrity'));

  try {
    const activeName = getActiveWorkspace();
    if (activeName) {
      const wsPath = getWorkspacePath(activeName);
      const config = loadConfig(activeName);

      const r1: CheckResult = { label: 'Config', status: 'ok', detail: `chain=${config.chain}` };
      results.push(r1);
      console.log(formatCheck(r1));

      if (walletExists(wsPath)) {
        const wallet = loadWallet(wsPath);
        const r2: CheckResult = { label: 'Wallet', status: 'ok', detail: wallet.address };
        results.push(r2);
        console.log(formatCheck(r2));
      } else {
        const r2: CheckResult = { label: 'Wallet', status: 'fail', detail: 'wallet.json missing' };
        results.push(r2);
        console.log(formatCheck(r2));
      }

      const secPath = path.join(wsPath, 'security.json');
      if (fs.existsSync(secPath)) {
        const r3: CheckResult = { label: 'Security config', status: 'ok', detail: 'security.json present' };
        results.push(r3);
        console.log(formatCheck(r3));
      } else {
        const r3: CheckResult = { label: 'Security config', status: 'warn', detail: 'no security.json — using defaults' };
        results.push(r3);
        console.log(formatCheck(r3));
      }

      const deployed = Object.values(config.contracts || {}).filter(
        (a: unknown) => typeof a === 'string' && a !== '0x0000000000000000000000000000000000000000',
      ).length;
      const r4: CheckResult = { label: 'Contracts configured', status: 'ok', detail: `${deployed} deployed` };
      results.push(r4);
      console.log(formatCheck(r4));
    } else {
      const r: CheckResult = { label: 'Workspace integrity', status: 'skip', detail: 'no active workspace' };
      results.push(r);
      console.log(formatCheck(r));
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const r: CheckResult = { label: 'Workspace integrity', status: 'skip', detail: msg };
    results.push(r);
    console.log(formatCheck(r));
  }

  const isDangerousEnvKey = (key: string): boolean =>
    /^(LD_|DYLD_|SSLKEYLOGFILE|NODE_OPTIONS|BASH_ENV|BASH_FUNC_|PYTHONSTARTUP|PERL5OPT|RUBYOPT)/i.test(key);
  const dangerous = Object.keys(process.env).filter((k) => isDangerousEnvKey(k));
  if (dangerous.length > 0) {
    const r: CheckResult = { label: 'Env sanitization', status: 'warn', detail: `${dangerous.length} dangerous key(s): ${dangerous.join(', ')}` };
    results.push(r);
    console.log(formatCheck(r));
  } else {
    const r: CheckResult = { label: 'Env sanitization', status: 'ok', detail: 'no dangerous env keys' };
    results.push(r);
    console.log(formatCheck(r));
  }
  console.log('');

  // ── Phase 4: Network ────────────────────────────────────────
  console.log(chalk.bold('  4. Network'));

  try {
    const start = Date.now();
    execSync('curl -s -o /dev/null -w "" --connect-timeout 5 https://mainnet.base.org', { stdio: 'pipe' });
    const latency = Date.now() - start;
    const r: CheckResult = { label: 'Base RPC', status: latency < 3000 ? 'ok' : 'warn', detail: `${latency}ms` };
    results.push(r);
    console.log(formatCheck(r));
  } catch {
    const r: CheckResult = { label: 'Base RPC', status: 'fail', detail: 'unreachable' };
    results.push(r);
    console.log(formatCheck(r));
  }

  try {
    execSync('curl -s -o /dev/null -w "" --connect-timeout 5 https://basescan.org', { stdio: 'pipe' });
    const r: CheckResult = { label: 'Basescan', status: 'ok' };
    results.push(r);
    console.log(formatCheck(r));
  } catch {
    const r: CheckResult = { label: 'Basescan', status: 'warn', detail: 'unreachable' };
    results.push(r);
    console.log(formatCheck(r));
  }
  console.log('');

  // ── Phase 5: On-Chain Verification ──────────────────────────
  console.log(chalk.bold('  5. On-Chain Verification'));

  try {
    const { ensureWorkspace } = require('../lib/workspace');
    const { createPublicClient } = require('openclaw');
    const ws = ensureWorkspace();
    const client = createPublicClient(ws.config);

    const deployed = Object.entries(ws.config.contracts || {}).filter(
      ([, a]) => typeof a === 'string' && a !== '0x0000000000000000000000000000000000000000',
    );

    if (deployed.length === 0) {
      const r: CheckResult = { label: 'Contract bytecode', status: 'skip', detail: 'no contracts configured' };
      results.push(r);
      console.log(formatCheck(r));
    } else {
      let verified = 0;
      let failed = 0;
      for (const [contractName, address] of deployed) {
        const code = await client.getBytecode({ address: address as `0x${string}` });
        if (code && code !== '0x') {
          verified++;
        } else {
          const r: CheckResult = { label: `${contractName} bytecode`, status: 'fail', detail: `no code at ${(address as string).slice(0, 14)}...` };
          results.push(r);
          console.log(formatCheck(r));
          failed++;
        }
      }

      if (failed === 0) {
        const r: CheckResult = { label: 'Contract bytecode', status: 'ok', detail: `${verified}/${deployed.length} verified` };
        results.push(r);
        console.log(formatCheck(r));
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const r: CheckResult = { label: 'On-chain verification', status: 'skip', detail: msg };
    results.push(r);
    console.log(formatCheck(r));
  }
  console.log('');

  // ── Phase 6: Monorepo Wiring ────────────────────────────────
  console.log(chalk.bold('  6. Monorepo Wiring'));

  const monorepoRoot = findMonorepoRoot(process.cwd());
  if (!monorepoRoot) {
    const r: CheckResult = { label: 'Monorepo', status: 'skip', detail: 'not inside a pnpm monorepo' };
    results.push(r);
    console.log(formatCheck(r));
  } else {
    const wiringScript = path.join(monorepoRoot, 'scripts', 'check-address-wiring.mjs');
    if (fs.existsSync(wiringScript)) {
      try {
        execSync(`node ${wiringScript}`, { cwd: monorepoRoot, stdio: 'pipe' });
        const r: CheckResult = { label: 'Address wiring', status: 'ok', detail: 'no hardcoded addresses outside canonical file' };
        results.push(r);
        console.log(formatCheck(r));
      } catch (err: unknown) {
        const stderr = err instanceof Error && 'stderr' in err ? String((err as any).stderr) : '';
        const r: CheckResult = { label: 'Address wiring', status: 'fail', detail: stderr.trim().split('\n')[0] || 'check failed' };
        results.push(r);
        console.log(formatCheck(r));
      }
    } else {
      const r: CheckResult = { label: 'Address wiring', status: 'skip', detail: 'script not found' };
      results.push(r);
      console.log(formatCheck(r));
    }

    const plumbingScript = path.join(monorepoRoot, 'scripts', 'check-event-plumbing.mjs');
    if (fs.existsSync(plumbingScript)) {
      try {
        execSync(`node ${plumbingScript}`, { cwd: monorepoRoot, stdio: 'pipe' });
        const r: CheckResult = { label: 'Event plumbing', status: 'ok', detail: 'all events have handlers' };
        results.push(r);
        console.log(formatCheck(r));
      } catch (err: unknown) {
        const stderr = err instanceof Error && 'stderr' in err ? String((err as any).stderr) : '';
        const r: CheckResult = { label: 'Event plumbing', status: 'fail', detail: stderr.trim().split('\n')[0] || 'check failed' };
        results.push(r);
        console.log(formatCheck(r));
      }
    } else {
      const r: CheckResult = { label: 'Event plumbing', status: 'skip', detail: 'script not found' };
      results.push(r);
      console.log(formatCheck(r));
    }
  }
  console.log('');

  // ── Summary ────────────────────────────────────────────────
  const okCount = results.filter((r) => r.status === 'ok').length;
  const warnCount = results.filter((r) => r.status === 'warn').length;
  const failCount = results.filter((r) => r.status === 'fail').length;
  const skipCount = results.filter((r) => r.status === 'skip').length;

  console.log(chalk.bold('  ═══════════════════════════════'));
  console.log(`  ${chalk.green(String(okCount))} passed  ${chalk.yellow(String(warnCount))} warnings  ${chalk.red(String(failCount))} failed  ${chalk.dim(String(skipCount))} skipped`);

  if (failCount > 0) {
    console.log('');
    console.log(chalk.bold('  Failures:'));
    for (const r of results.filter((r) => r.status === 'fail')) {
      console.log(chalk.red(`    ${r.label}${r.detail ? ': ' + r.detail : ''}`));
    }
  }

  console.log('');

  return { ok: okCount, warn: warnCount, fail: failCount, skip: skipCount, passed: failCount === 0 };
}

export function registerPreflightCommand(program: Command): void {
  program
    .command('preflight [name]')
    .description('End-to-end preflight check: workspace, agent files, network, contracts, monorepo wiring')
    .option('--chain <chain>', 'Target chain (base, base-sepolia)', 'base')
    .option('--import-key <key>', 'Import existing private key (only used if creating new workspace)')
    .action(async (name: string | undefined, opts: { chain: string; importKey?: string }) => {
      console.log(chalk.bold('\n  LobstrClaw Preflight\n'));

      const agentDir = process.cwd();
      const agentName = name || path.basename(agentDir);

      const result = await runPreflight({
        agentName,
        agentDir,
        chain: opts.chain,
        importKey: opts.importKey,
      });

      if (!result.passed) {
        process.exit(1);
      }
    });
}
