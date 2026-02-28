import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import chalk from 'chalk';

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

export function registerDoctorCommand(program: Command): void {
  program
    .command('doctor')
    .description('Diagnose agent health: workspace, security, Docker, network, contracts')
    .option('--deep', 'Run deep checks including on-chain contract verification')
    .option('--name <name>', 'Agent name (defaults to cwd basename)')
    .action(async (opts: { deep?: boolean; name?: string }) => {
      console.log(chalk.bold('\n  LobstrClaw Doctor\n'));

      const results: CheckResult[] = [];

      const agentDir = process.cwd();
      const agentName = opts.name || path.basename(agentDir);
      console.log(chalk.dim(`  Agent: ${agentName}`));
      console.log(chalk.dim(`  Dir:   ${agentDir}\n`));

      // ── 1. Agent Files ─────────────────────────────────────────
      console.log(chalk.bold('  1. Agent Files'));

      const requiredFiles = ['SOUL.md', 'HEARTBEAT.md', 'crontab'];
      const optionalFiles = ['IDENTITY.md', 'RULES.md', 'REWARDS.md', 'GOVERNANCE.md', 'docker-compose.yml', '.env'];

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

      for (const f of optionalFiles) {
        if (fs.existsSync(path.join(agentDir, f))) {
          const r: CheckResult = { label: f, status: 'ok' };
          results.push(r);
          console.log(formatCheck(r));
        } else {
          const r: CheckResult = { label: f, status: 'warn', detail: 'missing (optional)' };
          results.push(r);
          console.log(formatCheck(r));
        }
      }
      console.log('');

      // ── 2. OpenClaw Workspace ──────────────────────────────────
      console.log(chalk.bold('  2. OpenClaw Workspace'));

      try {
        const { getWorkspacePath, loadConfig, getActiveWorkspace } = require('../lib/workspace');
        const activeName = getActiveWorkspace();
        if (!activeName) {
          const r: CheckResult = { label: 'Active workspace', status: 'fail', detail: 'no active workspace set' };
          results.push(r);
          console.log(formatCheck(r));
        } else {
          const r1: CheckResult = { label: 'Active workspace', status: 'ok', detail: activeName };
          results.push(r1);
          console.log(formatCheck(r1));

          const wsPath = getWorkspacePath(activeName);
          const config = loadConfig(activeName);

          const r2: CheckResult = { label: 'Chain', status: 'ok', detail: config.chain };
          results.push(r2);
          console.log(formatCheck(r2));

          // Wallet check
          const walletPath = path.join(wsPath, 'wallet.json');
          if (fs.existsSync(walletPath)) {
            const wallet = JSON.parse(fs.readFileSync(walletPath, 'utf-8'));
            const r3: CheckResult = { label: 'Wallet', status: 'ok', detail: wallet.address };
            results.push(r3);
            console.log(formatCheck(r3));
          } else {
            const r3: CheckResult = { label: 'Wallet', status: 'fail', detail: 'wallet.json missing' };
            results.push(r3);
            console.log(formatCheck(r3));
          }

          // Security config
          const secPath = path.join(wsPath, 'security.json');
          if (fs.existsSync(secPath)) {
            const r4: CheckResult = { label: 'Security config', status: 'ok', detail: 'security.json present' };
            results.push(r4);
            console.log(formatCheck(r4));
          } else {
            const r4: CheckResult = { label: 'Security config', status: 'warn', detail: 'no security.json — using defaults' };
            results.push(r4);
            console.log(formatCheck(r4));
          }

          // Heartbeat freshness
          const hbPath = path.join(wsPath, 'heartbeats.jsonl');
          if (fs.existsSync(hbPath)) {
            const stat = fs.statSync(hbPath);
            const ageSeconds = Math.round((Date.now() - stat.mtimeMs) / 1000);
            if (ageSeconds < 900) {
              const r5: CheckResult = { label: 'Heartbeat', status: 'ok', detail: `${ageSeconds}s ago` };
              results.push(r5);
              console.log(formatCheck(r5));
            } else {
              const r5: CheckResult = { label: 'Heartbeat', status: 'fail', detail: `stale (${ageSeconds}s ago, max 900s)` };
              results.push(r5);
              console.log(formatCheck(r5));
            }
          } else {
            const r5: CheckResult = { label: 'Heartbeat', status: 'warn', detail: 'no heartbeats.jsonl' };
            results.push(r5);
            console.log(formatCheck(r5));
          }

          // Contract count
          const deployed = Object.values(config.contracts || {}).filter(
            (a: unknown) => typeof a === 'string' && a !== '0x0000000000000000000000000000000000000000',
          ).length;
          const r6: CheckResult = { label: 'Contracts configured', status: 'ok', detail: `${deployed} deployed` };
          results.push(r6);
          console.log(formatCheck(r6));
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        const r: CheckResult = { label: 'OpenClaw', status: 'skip', detail: msg };
        results.push(r);
        console.log(formatCheck(r));
      }
      console.log('');

      // ── 3. Environment Security ────────────────────────────────
      console.log(chalk.bold('  3. Environment Security'));

      // Check for dangerous env vars
      try {
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
      } catch {
        const r: CheckResult = { label: 'Env sanitization', status: 'skip', detail: 'security module not available' };
        results.push(r);
        console.log(formatCheck(r));
      }

      // Check secrets exposure
      const secretPatterns = ['PRIVATE_KEY', 'SECRET', 'PASSWORD', 'TOKEN', 'API_KEY'];
      const exposedSecrets = Object.keys(process.env).filter((k) =>
        secretPatterns.some((p) => k.toUpperCase().includes(p)) && !k.startsWith('npm_'),
      );
      if (exposedSecrets.length > 0) {
        const r: CheckResult = { label: 'Secret exposure', status: 'warn', detail: `${exposedSecrets.length} potential secret(s) in env: ${exposedSecrets.slice(0, 3).join(', ')}${exposedSecrets.length > 3 ? '...' : ''}` };
        results.push(r);
        console.log(formatCheck(r));
      } else {
        const r: CheckResult = { label: 'Secret exposure', status: 'ok', detail: 'no secrets in env' };
        results.push(r);
        console.log(formatCheck(r));
      }

      // Check PATH safety
      const pathDirs = (process.env.PATH || '').split(path.delimiter);
      const writableDirs = pathDirs.filter((d) => {
        try {
          const stat = fs.statSync(d);
          return !!(stat.mode & 0o022);
        } catch {
          return false;
        }
      });
      if (writableDirs.length > 0) {
        const r: CheckResult = { label: 'PATH safety', status: 'warn', detail: `${writableDirs.length} group/world-writable dir(s)` };
        results.push(r);
        console.log(formatCheck(r));
      } else {
        const r: CheckResult = { label: 'PATH safety', status: 'ok' };
        results.push(r);
        console.log(formatCheck(r));
      }
      console.log('');

      // ── 4. Docker ──────────────────────────────────────────────
      console.log(chalk.bold('  4. Docker'));

      let dockerAvailable = false;
      try {
        const version = execSync('docker --version 2>/dev/null', { encoding: 'utf-8' }).trim();
        const r1: CheckResult = { label: 'Docker', status: 'ok', detail: version.replace('Docker version ', '') };
        results.push(r1);
        console.log(formatCheck(r1));
        dockerAvailable = true;
      } catch {
        const r1: CheckResult = { label: 'Docker', status: 'warn', detail: 'not available — sandbox mode requires Docker' };
        results.push(r1);
        console.log(formatCheck(r1));
      }

      if (dockerAvailable) {
        const containerName = `lobstr-${agentName}`;
        try {
          const status = execSync(
            `docker inspect --format '{{.State.Status}}' ${containerName} 2>/dev/null`,
            { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] },
          ).trim();

          if (status === 'running') {
            const r: CheckResult = { label: `Container ${containerName}`, status: 'ok', detail: 'running' };
            results.push(r);
            console.log(formatCheck(r));

            // Check container security
            try {
              const inspect = JSON.parse(
                execSync(`docker inspect ${containerName} 2>/dev/null`, { encoding: 'utf-8' }),
              )[0];

              const hostConfig = inspect.HostConfig || {};

              const readOnly = hostConfig.ReadonlyRootfs === true;
              const r2: CheckResult = { label: 'Read-only FS', status: readOnly ? 'ok' : 'warn', detail: readOnly ? 'enabled' : 'disabled' };
              results.push(r2);
              console.log(formatCheck(r2));

              const noNewPrivs = (hostConfig.SecurityOpt || []).includes('no-new-privileges:true');
              const r3: CheckResult = { label: 'No new privileges', status: noNewPrivs ? 'ok' : 'warn' };
              results.push(r3);
              console.log(formatCheck(r3));

              const capDrop = hostConfig.CapDrop || [];
              const allDropped = capDrop.includes('ALL');
              const r4: CheckResult = { label: 'Capabilities dropped', status: allDropped ? 'ok' : 'warn', detail: allDropped ? 'ALL' : capDrop.join(', ') || 'none' };
              results.push(r4);
              console.log(formatCheck(r4));

              const pidsLimit = hostConfig.PidsLimit;
              const r5: CheckResult = { label: 'PID limit', status: pidsLimit && pidsLimit <= 200 ? 'ok' : 'warn', detail: pidsLimit ? String(pidsLimit) : 'unlimited' };
              results.push(r5);
              console.log(formatCheck(r5));

              const user = inspect.Config?.User || 'root';
              const r6: CheckResult = { label: 'Container user', status: user !== 'root' && user !== '' ? 'ok' : 'warn', detail: user || 'root' };
              results.push(r6);
              console.log(formatCheck(r6));

              // Network isolation check
              const networkMode = hostConfig.NetworkMode || 'default';
              const ports = inspect.NetworkSettings?.Ports || {};
              const exposedPorts = Object.keys(ports).filter((p) => ports[p] && ports[p].length > 0);
              if (exposedPorts.length === 0) {
                const r7: CheckResult = { label: 'Network', status: 'ok', detail: `${networkMode}, zero inbound ports` };
                results.push(r7);
                console.log(formatCheck(r7));
              } else {
                const r7: CheckResult = { label: 'Network', status: 'warn', detail: `${exposedPorts.length} exposed port(s)` };
                results.push(r7);
                console.log(formatCheck(r7));
              }
            } catch {
              const r: CheckResult = { label: 'Container security', status: 'skip', detail: 'could not inspect' };
              results.push(r);
              console.log(formatCheck(r));
            }
          } else {
            const r: CheckResult = { label: `Container ${containerName}`, status: 'warn', detail: status };
            results.push(r);
            console.log(formatCheck(r));
          }
        } catch {
          const r: CheckResult = { label: `Container ${containerName}`, status: 'skip', detail: 'not found' };
          results.push(r);
          console.log(formatCheck(r));
        }
      }
      console.log('');

      // ── 5. Network ─────────────────────────────────────────────
      console.log(chalk.bold('  5. Network'));

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

      // ── 6. Deep checks (on-chain) ─────────────────────────────
      if (opts.deep) {
        console.log(chalk.bold('  6. On-Chain Verification'));

        try {
          const { ensureWorkspace } = require('../lib/workspace');
          const { createPublicClient } = require('openclaw');
          const ws = ensureWorkspace();
          const client = createPublicClient(ws.config);

          const deployed = Object.entries(ws.config.contracts || {}).filter(
            ([, a]) => typeof a === 'string' && a !== '0x0000000000000000000000000000000000000000',
          );

          let verified = 0;
          let failed = 0;
          for (const [name, address] of deployed) {
            const code = await client.getBytecode({ address: address as `0x${string}` });
            if (code && code !== '0x') {
              verified++;
            } else {
              const r: CheckResult = { label: `${name} bytecode`, status: 'fail', detail: `no code at ${(address as string).slice(0, 14)}...` };
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

          // Check block number
          const blockNumber = await client.getBlockNumber();
          const r: CheckResult = { label: 'Latest block', status: 'ok', detail: `#${blockNumber}` };
          results.push(r);
          console.log(formatCheck(r));
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          const r: CheckResult = { label: 'On-chain verification', status: 'fail', detail: msg };
          results.push(r);
          console.log(formatCheck(r));
        }
        console.log('');
      }

      // ── Summary ────────────────────────────────────────────────
      const okCount = results.filter((r) => r.status === 'ok').length;
      const warnCount = results.filter((r) => r.status === 'warn').length;
      const failCount = results.filter((r) => r.status === 'fail').length;
      const skipCount = results.filter((r) => r.status === 'skip').length;

      console.log(chalk.bold('  ═══════════════════════════════'));
      console.log(`  ${chalk.green(String(okCount))} passed  ${chalk.yellow(String(warnCount))} warnings  ${chalk.red(String(failCount))} failed  ${chalk.dim(String(skipCount))} skipped`);

      if (failCount > 0) {
        console.log('');
        console.log(chalk.bold('  Remediation:'));
        for (const r of results.filter((r) => r.status === 'fail')) {
          if (r.label.includes('SOUL') || r.label.includes('HEARTBEAT') || r.label.includes('crontab')) {
            console.log(chalk.dim(`    ${r.label}: Run "lobstrclaw init" to scaffold agent files`));
          } else if (r.label.includes('Wallet')) {
            console.log(chalk.dim(`    ${r.label}: Run "openclaw init <name>" to create workspace with wallet`));
          } else if (r.label.includes('Heartbeat') && r.label !== 'Heartbeat') {
            console.log(chalk.dim(`    ${r.label}: Run "openclaw heartbeat start" to restart daemon`));
          } else if (r.label.includes('RPC')) {
            console.log(chalk.dim(`    ${r.label}: Check OPENCLAW_RPC_URL env or network connectivity`));
          } else if (r.label.includes('bytecode')) {
            console.log(chalk.dim(`    ${r.label}: Verify contract deployment on basescan.org`));
          }
        }
      }

      if (warnCount > 0 && !opts.deep) {
        console.log('');
        console.log(chalk.dim('  Run "lobstrclaw doctor --deep" for on-chain contract verification'));
      }
      console.log('');
    });
}
