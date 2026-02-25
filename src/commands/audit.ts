import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';

const ZERO = '0x0000000000000000000000000000000000000000';

// ── Minimal ABI fragments for universal queries ──────────────────────

const OWNABLE_ABI = [
  'function owner() view returns (address)',
] as const;

const PAUSABLE_ABI = [
  'function paused() view returns (bool)',
] as const;

const ACCESS_CONTROL_ABI = [
  'function hasRole(bytes32 role, address account) view returns (bool)',
  'function getRoleAdmin(bytes32 role) view returns (bytes32)',
  'function DEFAULT_ADMIN_ROLE() view returns (bytes32)',
] as const;

// keccak256 of common role names
const KNOWN_ROLES: Record<string, string> = {
  DEFAULT_ADMIN_ROLE: '0x0000000000000000000000000000000000000000000000000000000000000000',
  PAUSER_ROLE: '0x65d7a28e3265b37a6474929f336521b332c1681b933f6cb9f3376673440d862a',
  OPERATOR_ROLE: '0x97667070c54ef182b0f5858b034beac1b6f3089aa2d3188bb1e8929f4fa9b929',
  MINTER_ROLE: '0x9f2df0fed2c77648de5860a4cc508cd0818c85b8b8a1ab4ceeef8d981c8956a6',
  GOVERNOR_ROLE: '0x7935bd0ae54bc31f548c14dba4d37c5c64b3f8ca900cb468fb8abd54d5894f55',
  JUDGE_ROLE: '0x7f89ad73bc8d88d5bd4af60a2c0aa8a2d3a41be3e0fc8cd9e4cfd5a9e0dc9c0a',
  WATCHER_ROLE: '0xbfa93f6c3def34d19e47c040b58e31aa3c6d0d4bc42e3df8f5d5f76c70c6f89e',
};

interface ContractEntry {
  name: string;
  key: string;
  address: string;
  category: string;
}

function getDeployedContracts(config: any): ContractEntry[] {
  const contracts = config.contracts || {};
  const entries: ContractEntry[] = [];

  const CATEGORY_MAP: Record<string, string> = {
    lobToken: 'Token',
    reputationSystem: 'Identity',
    stakingManager: 'Staking',
    treasuryGovernor: 'Governance',
    rewardDistributor: 'Rewards',
    sybilGuard: 'Identity',
    serviceRegistry: 'Registry',
    disputeArbitration: 'Disputes',
    escrowEngine: 'Financial',
    loanEngine: 'Financial',
    x402CreditFacility: 'Financial',
    stakingRewards: 'Staking',
    liquidityMining: 'Staking',
    rewardScheduler: 'Rewards',
    lightningGovernor: 'Governance',
    airdropClaimV3: 'Distribution',
    airdropClaimV2: 'Distribution',
    teamVesting: 'Distribution',
    insurancePool: 'Insurance',
    subscriptionEngine: 'Financial',
    multiPartyEscrow: 'Financial',
    bondingEngine: 'Financial',
    directiveBoard: 'Governance',
    reviewRegistry: 'Disputes',
    x402EscrowBridge: 'Financial',
    rolePayroll: 'Payroll',
    uptimeVerifier: 'Verification',
    skillRegistry: 'Registry',
    pipelineRouter: 'Registry',
    affiliateManager: 'Rewards',
  };

  for (const [key, address] of Object.entries(contracts)) {
    if (typeof address !== 'string' || address === ZERO) continue;
    entries.push({
      name: key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase()).trim(),
      key,
      address: address as string,
      category: CATEGORY_MAP[key] || 'Other',
    });
  }

  return entries;
}

async function tryCall(client: any, address: string, abi: readonly string[], functionName: string, args?: any[]): Promise<any> {
  try {
    const { parseAbi } = require('viem');
    return await client.readContract({
      address: address as `0x${string}`,
      abi: parseAbi(abi),
      functionName,
      args: args || [],
    });
  } catch {
    return null;
  }
}

// ── Subcommands ──────────────────────────────────────────────────────

async function auditRoles(client: any, contracts: ContractEntry[], agentAddresses: string[]) {
  console.log(chalk.bold('\n  Audit: Access Control Roles\n'));

  for (const c of contracts) {
    const defaultAdmin = await tryCall(client, c.address, ACCESS_CONTROL_ABI as any, 'DEFAULT_ADMIN_ROLE');
    const owner = await tryCall(client, c.address, OWNABLE_ABI as any, 'owner');

    if (defaultAdmin === null && owner === null) {
      console.log(chalk.dim(`  [SKIP] ${c.name} — no AccessControl or Ownable`));
      continue;
    }

    console.log(chalk.cyan(`  ${c.name}`) + chalk.dim(` (${c.address.slice(0, 10)}...)`));

    if (owner !== null) {
      console.log(`    Owner: ${owner}`);
    }

    if (defaultAdmin !== null) {
      for (const [roleName, roleHash] of Object.entries(KNOWN_ROLES)) {
        for (const addr of agentAddresses) {
          const has = await tryCall(client, c.address, ACCESS_CONTROL_ABI as any, 'hasRole', [roleHash, addr]);
          if (has === true) {
            console.log(chalk.green(`    ${roleName}: ${addr.slice(0, 10)}... ✓`));
          }
        }
      }
    }
    console.log('');
  }
}

async function auditPermissions(client: any, contracts: ContractEntry[], checkAddresses: string[]) {
  console.log(chalk.bold('\n  Audit: Permission Matrix\n'));

  const header = ['Contract', 'Admin', 'Owner', 'Pauser'].map((h) => chalk.bold(h.padEnd(22))).join('');
  console.log('  ' + header);
  console.log('  ' + '─'.repeat(88));

  for (const c of contracts) {
    const owner = await tryCall(client, c.address, OWNABLE_ABI as any, 'owner');

    let adminAddr = '—';
    for (const addr of checkAddresses) {
      const has = await tryCall(client, c.address, ACCESS_CONTROL_ABI as any, 'hasRole', [KNOWN_ROLES.DEFAULT_ADMIN_ROLE, addr]);
      if (has === true) {
        adminAddr = addr.slice(0, 10) + '...';
        break;
      }
    }

    let pauserAddr = '—';
    for (const addr of checkAddresses) {
      const has = await tryCall(client, c.address, ACCESS_CONTROL_ABI as any, 'hasRole', [KNOWN_ROLES.PAUSER_ROLE, addr]);
      if (has === true) {
        pauserAddr = addr.slice(0, 10) + '...';
        break;
      }
    }

    const ownerStr = owner ? (owner as string).slice(0, 10) + '...' : '—';
    console.log(
      '  ' +
      c.name.padEnd(22) +
      adminAddr.padEnd(22) +
      ownerStr.padEnd(22) +
      pauserAddr.padEnd(22)
    );
  }
  console.log('');
}

async function auditBalances(client: any, contracts: ContractEntry[], lobTokenAddress: string) {
  console.log(chalk.bold('\n  Audit: Contract Balances\n'));

  const { parseAbi, formatEther, formatUnits } = require('viem');
  const lobAbi = parseAbi(['function balanceOf(address) view returns (uint256)'] as const);

  const header = ['Contract', 'Category', 'ETH Balance', 'LOB Balance'].map((h) => chalk.bold(h.padEnd(20))).join('');
  console.log('  ' + header);
  console.log('  ' + '─'.repeat(80));

  let totalEth = BigInt(0);
  let totalLob = BigInt(0);

  for (const c of contracts) {
    const ethBal = await client.getBalance({ address: c.address as `0x${string}` });
    let lobBal = BigInt(0);

    if (lobTokenAddress && lobTokenAddress !== ZERO) {
      try {
        lobBal = await client.readContract({
          address: lobTokenAddress as `0x${string}`,
          abi: lobAbi,
          functionName: 'balanceOf',
          args: [c.address as `0x${string}`],
        });
      } catch { /* token may not track this address */ }
    }

    totalEth += ethBal;
    totalLob += lobBal;

    const ethStr = Number(formatEther(ethBal)).toFixed(6);
    const lobStr = Number(formatUnits(lobBal, 18)).toFixed(0);

    const ethColor = ethBal === BigInt(0) ? chalk.dim : chalk.white;
    const lobColor = lobBal === BigInt(0) ? chalk.dim : chalk.green;

    console.log(
      '  ' +
      c.name.slice(0, 19).padEnd(20) +
      c.category.padEnd(20) +
      ethColor(ethStr.padEnd(20)) +
      lobColor(lobStr.padEnd(20))
    );
  }

  const { formatEther: fmtE, formatUnits: fmtU } = require('viem');
  console.log('  ' + '─'.repeat(80));
  console.log(
    '  ' +
    chalk.bold('TOTAL'.padEnd(40)) +
    chalk.bold(Number(fmtE(totalEth)).toFixed(6).padEnd(20)) +
    chalk.bold(Number(fmtU(totalLob, 18)).toFixed(0).padEnd(20))
  );
  console.log('');
}

async function auditParameters(client: any, contracts: ContractEntry[]) {
  console.log(chalk.bold('\n  Audit: Key Parameters\n'));

  const { parseAbi } = require('viem');

  // Contract-specific parameter reads
  const PARAM_CHECKS: Record<string, { abi: readonly string[]; calls: { fn: string; label: string }[] }> = {
    stakingManager: {
      abi: ['function tierThreshold(uint8) pure returns (uint256)'],
      calls: [
        { fn: 'tierThreshold:0', label: 'Bronze threshold' },
        { fn: 'tierThreshold:1', label: 'Silver threshold' },
        { fn: 'tierThreshold:2', label: 'Gold threshold' },
        { fn: 'tierThreshold:3', label: 'Platinum threshold' },
      ],
    },
    lightningGovernor: {
      abi: [
        'function quorum() view returns (uint256)',
        'function executionDelay() view returns (uint256)',
        'function votingWindow() view returns (uint256)',
        'function executionWindow() view returns (uint256)',
        'function proposalCount() view returns (uint256)',
      ],
      calls: [
        { fn: 'quorum', label: 'Quorum' },
        { fn: 'executionDelay', label: 'Execution delay (s)' },
        { fn: 'votingWindow', label: 'Voting window (s)' },
        { fn: 'executionWindow', label: 'Execution window (s)' },
        { fn: 'proposalCount', label: 'Proposal count' },
      ],
    },
    treasuryGovernor: {
      abi: [
        'function requiredApprovals() view returns (uint256)',
        'function signerCount() view returns (uint256)',
      ],
      calls: [
        { fn: 'requiredApprovals', label: 'Required approvals' },
        { fn: 'signerCount', label: 'Signer count' },
      ],
    },
    insurancePool: {
      abi: [
        'function premiumRateBps() view returns (uint256)',
        'function coverageCapBronze() view returns (uint256)',
        'function coverageCapSilver() view returns (uint256)',
        'function coverageCapGold() view returns (uint256)',
        'function coverageCapPlatinum() view returns (uint256)',
        'function paused() view returns (bool)',
      ],
      calls: [
        { fn: 'premiumRateBps', label: 'Premium rate (bps)' },
        { fn: 'coverageCapBronze', label: 'Coverage cap: Bronze' },
        { fn: 'coverageCapSilver', label: 'Coverage cap: Silver' },
        { fn: 'coverageCapGold', label: 'Coverage cap: Gold' },
        { fn: 'coverageCapPlatinum', label: 'Coverage cap: Platinum' },
      ],
    },
    sybilGuard: {
      abi: [
        'function totalBans() view returns (uint256)',
        'function totalSeized() view returns (uint256)',
        'function totalReports() view returns (uint256)',
      ],
      calls: [
        { fn: 'totalBans', label: 'Total bans' },
        { fn: 'totalSeized', label: 'Total seized (raw)' },
        { fn: 'totalReports', label: 'Total reports' },
      ],
    },
    bondingEngine: {
      abi: [
        'function marketCount() view returns (uint256)',
        'function bondCount() view returns (uint256)',
        'function totalOutstandingLOB() view returns (uint256)',
        'function availableLOB() view returns (uint256)',
      ],
      calls: [
        { fn: 'marketCount', label: 'Markets' },
        { fn: 'bondCount', label: 'Bonds' },
        { fn: 'totalOutstandingLOB', label: 'Outstanding LOB (raw)' },
        { fn: 'availableLOB', label: 'Available LOB (raw)' },
      ],
    },
    rewardDistributor: {
      abi: [
        'function totalDistributed() view returns (uint256)',
        'function totalDeposited() view returns (uint256)',
      ],
      calls: [
        { fn: 'totalDistributed', label: 'Total distributed (raw)' },
        { fn: 'totalDeposited', label: 'Total deposited (raw)' },
      ],
    },
    rolePayroll: {
      abi: [
        'function currentEpoch() view returns (uint256)',
        'function genesisEpoch() view returns (uint256)',
        'function accumulatedCertFees() view returns (uint256)',
      ],
      calls: [
        { fn: 'currentEpoch', label: 'Current epoch' },
        { fn: 'genesisEpoch', label: 'Genesis epoch' },
        { fn: 'accumulatedCertFees', label: 'Cert fees (raw)' },
      ],
    },
  };

  for (const c of contracts) {
    const checks = PARAM_CHECKS[c.key];
    if (!checks) continue;

    console.log(chalk.cyan(`  ${c.name}`));

    for (const call of checks.calls) {
      const parts = call.fn.split(':');
      const fnName = parts[0];
      const args = parts.length > 1 ? [parseInt(parts[1], 10)] : [];

      const result = await tryCall(client, c.address, checks.abi as any, fnName, args.length ? args : undefined);
      const display = result !== null ? result.toString() : chalk.red('CALL FAILED');
      console.log(`    ${call.label}: ${display}`);
    }
    console.log('');
  }
}

async function auditPausability(client: any, contracts: ContractEntry[]) {
  console.log(chalk.bold('\n  Audit: Pausability Status\n'));

  let pausedCount = 0;
  let unpausedCount = 0;
  let noPauseCount = 0;

  for (const c of contracts) {
    const paused = await tryCall(client, c.address, PAUSABLE_ABI as any, 'paused');

    if (paused === null) {
      console.log(chalk.dim(`  [N/A]  ${c.name} — not Pausable`));
      noPauseCount++;
    } else if (paused === true) {
      console.log(chalk.red(`  [PAUSED] ${c.name}`));
      pausedCount++;
    } else {
      console.log(chalk.green(`  [ACTIVE] ${c.name}`));
      unpausedCount++;
    }
  }

  console.log('');
  console.log(chalk.dim(`  Summary: ${unpausedCount} active, ${pausedCount} paused, ${noPauseCount} non-pausable`));
  if (pausedCount > 0) {
    console.log(chalk.yellow(`  WARNING: ${pausedCount} contract(s) are paused!`));
  }
  console.log('');
}

async function auditEvents(client: any, contracts: ContractEntry[], blockCount: number) {
  console.log(chalk.bold(`\n  Audit: Recent Events (last ${blockCount} blocks)\n`));

  const latestBlock = await client.getBlockNumber();
  const fromBlock = latestBlock - BigInt(blockCount);

  for (const c of contracts) {
    try {
      const logs = await client.getLogs({
        address: c.address as `0x${string}`,
        fromBlock,
        toBlock: latestBlock,
      });

      if (logs.length > 0) {
        console.log(chalk.cyan(`  ${c.name}`) + ` — ${logs.length} event(s)`);
        for (const log of logs.slice(0, 5)) {
          const topic0 = log.topics[0] ? log.topics[0].slice(0, 10) + '...' : 'unknown';
          console.log(chalk.dim(`    Block ${log.blockNumber} | ${topic0} | tx ${(log.transactionHash as string).slice(0, 14)}...`));
        }
        if (logs.length > 5) {
          console.log(chalk.dim(`    ... and ${logs.length - 5} more`));
        }
      } else {
        console.log(chalk.dim(`  [QUIET] ${c.name} — no events`));
      }
    } catch {
      console.log(chalk.dim(`  [ERROR] ${c.name} — could not fetch logs`));
    }
  }
  console.log('');
}

async function auditSecurity(client: any, contracts: ContractEntry[], lobTokenAddress: string, agentAddresses: string[]) {
  console.log(chalk.bold('\n  Audit: Full Security Posture\n'));

  let issues = 0;
  let warnings = 0;

  // 1. Check for zero-address contracts in config
  console.log(chalk.bold('  1. Contract Deployment Status'));
  for (const c of contracts) {
    if (c.address === ZERO) {
      console.log(chalk.yellow(`    [WARN] ${c.name} — not deployed (zero address)`));
      warnings++;
    } else {
      const code = await client.getBytecode({ address: c.address as `0x${string}` });
      if (!code || code === '0x') {
        console.log(chalk.red(`    [FAIL] ${c.name} — no bytecode at ${c.address.slice(0, 14)}...`));
        issues++;
      } else {
        console.log(chalk.green(`    [OK]   ${c.name} — bytecode verified`));
      }
    }
  }
  console.log('');

  // 2. Check pause status
  console.log(chalk.bold('  2. Pause Status'));
  for (const c of contracts) {
    const paused = await tryCall(client, c.address, PAUSABLE_ABI as any, 'paused');
    if (paused === true) {
      console.log(chalk.red(`    [ALERT] ${c.name} is PAUSED`));
      issues++;
    }
  }
  console.log(chalk.green('    Pause check complete'));
  console.log('');

  // 3. ETH balance check (contracts with zero ETH that may need gas)
  console.log(chalk.bold('  3. Gas Balance'));
  for (const c of contracts) {
    if (['Governance', 'Payroll'].includes(c.category)) {
      const bal = await client.getBalance({ address: c.address as `0x${string}` });
      const { formatEther } = require('viem');
      const eth = Number(formatEther(bal));
      if (eth < 0.001) {
        console.log(chalk.dim(`    [INFO] ${c.name} — ${eth.toFixed(6)} ETH`));
      }
    }
  }
  console.log('');

  // 4. Admin role concentration
  console.log(chalk.bold('  4. Admin Role Concentration'));
  const adminCounts: Record<string, number> = {};
  for (const c of contracts) {
    for (const addr of agentAddresses) {
      const has = await tryCall(client, c.address, ACCESS_CONTROL_ABI as any, 'hasRole', [KNOWN_ROLES.DEFAULT_ADMIN_ROLE, addr]);
      if (has === true) {
        adminCounts[addr] = (adminCounts[addr] || 0) + 1;
      }
    }
  }
  for (const [addr, count] of Object.entries(adminCounts)) {
    if (count > contracts.length * 0.5) {
      console.log(chalk.yellow(`    [WARN] ${addr.slice(0, 14)}... is admin on ${count}/${contracts.length} contracts`));
      warnings++;
    } else {
      console.log(chalk.dim(`    ${addr.slice(0, 14)}... — admin on ${count} contract(s)`));
    }
  }
  console.log('');

  // Summary
  console.log(chalk.bold('  ═══════════════════════════════'));
  if (issues === 0 && warnings === 0) {
    console.log(chalk.green('  Security posture: CLEAN'));
  } else if (issues === 0) {
    console.log(chalk.yellow(`  Security posture: ${warnings} warning(s), 0 critical`));
  } else {
    console.log(chalk.red(`  Security posture: ${issues} issue(s), ${warnings} warning(s)`));
  }
  console.log('');
}

async function auditFull(client: any, contracts: ContractEntry[], lobTokenAddress: string, agentAddresses: string[], blockCount: number, jsonOutput: boolean) {
  if (jsonOutput) {
    const report: any = {
      timestamp: new Date().toISOString(),
      contractCount: contracts.length,
      contracts: contracts.map((c) => ({ name: c.name, address: c.address, category: c.category })),
      checks: {},
    };

    // Bytecode verification
    report.checks.bytecode = {};
    for (const c of contracts) {
      const code = await client.getBytecode({ address: c.address as `0x${string}` });
      report.checks.bytecode[c.key] = !!(code && code !== '0x');
    }

    // Pause status
    report.checks.paused = {};
    for (const c of contracts) {
      const paused = await tryCall(client, c.address, PAUSABLE_ABI as any, 'paused');
      if (paused !== null) report.checks.paused[c.key] = paused;
    }

    // Balances
    report.checks.balances = {};
    const { parseAbi: pAbi, formatEther, formatUnits } = require('viem');
    const lobAbi = pAbi(['function balanceOf(address) view returns (uint256)'] as const);
    for (const c of contracts) {
      const ethBal = await client.getBalance({ address: c.address as `0x${string}` });
      let lobBal = BigInt(0);
      if (lobTokenAddress && lobTokenAddress !== ZERO) {
        try {
          lobBal = await client.readContract({
            address: lobTokenAddress as `0x${string}`,
            abi: lobAbi,
            functionName: 'balanceOf',
            args: [c.address as `0x${string}`],
          });
        } catch { /* skip */ }
      }
      report.checks.balances[c.key] = {
        eth: formatEther(ethBal),
        lob: formatUnits(lobBal, 18),
      };
    }

    console.log(JSON.stringify(report, null, 2));
    return;
  }

  // Human-readable full audit
  await auditSecurity(client, contracts, lobTokenAddress, agentAddresses);
  await auditPausability(client, contracts);
  await auditBalances(client, contracts, lobTokenAddress);
  await auditParameters(client, contracts);
  await auditEvents(client, contracts, blockCount);
}

// ── Command Registration ─────────────────────────────────────────────

export function registerAuditCommand(program: Command): void {
  const audit = program
    .command('audit')
    .description('Contract capability audit suite for all deployed V4 contracts');

  audit
    .command('roles')
    .description('Check AccessControl role assignments across all contracts')
    .option('--address <addresses...>', 'Addresses to check for roles')
    .action(async (opts: { address?: string[] }) => {
      const { client, contracts, agentAddresses } = await setup(opts.address);
      await auditRoles(client, contracts, agentAddresses);
    });

  audit
    .command('permissions')
    .description('Verify admin/owner/pauser permission matrix')
    .option('--address <addresses...>', 'Addresses to check')
    .action(async (opts: { address?: string[] }) => {
      const { client, contracts, agentAddresses } = await setup(opts.address);
      await auditPermissions(client, contracts, agentAddresses);
    });

  audit
    .command('balances')
    .description('Check ETH + LOB balances for all contracts')
    .action(async () => {
      const { client, contracts, lobTokenAddress } = await setup();
      await auditBalances(client, contracts, lobTokenAddress);
    });

  audit
    .command('parameters')
    .description('Read and display key configurable parameters')
    .action(async () => {
      const { client, contracts } = await setup();
      await auditParameters(client, contracts);
    });

  audit
    .command('pausability')
    .description('Check pause state across all pausable contracts')
    .action(async () => {
      const { client, contracts } = await setup();
      await auditPausability(client, contracts);
    });

  audit
    .command('events')
    .description('Show recent events from all contracts')
    .option('--blocks <n>', 'Number of blocks to scan', '1000')
    .action(async (opts: { blocks: string }) => {
      const { client, contracts } = await setup();
      await auditEvents(client, contracts, parseInt(opts.blocks, 10));
    });

  audit
    .command('security')
    .description('Full security posture check')
    .option('--address <addresses...>', 'Addresses to check for admin roles')
    .action(async (opts: { address?: string[] }) => {
      const { client, contracts, lobTokenAddress, agentAddresses } = await setup(opts.address);
      await auditSecurity(client, contracts, lobTokenAddress, agentAddresses);
    });

  audit
    .command('full')
    .description('Complete audit suite — all checks with report output')
    .option('--json', 'Output machine-readable JSON report')
    .option('--blocks <n>', 'Number of blocks for event scan', '1000')
    .option('--address <addresses...>', 'Addresses to check for roles')
    .action(async (opts: { json?: boolean; blocks: string; address?: string[] }) => {
      const { client, contracts, lobTokenAddress, agentAddresses } = await setup(opts.address);
      const spin = ora('Running full audit...').start();
      try {
        spin.stop();
        await auditFull(
          client, contracts, lobTokenAddress, agentAddresses,
          parseInt(opts.blocks, 10),
          !!opts.json,
        );
      } catch (err: unknown) {
        spin.fail('Audit failed');
        throw err;
      }
    });
}

// ── Setup helper ─────────────────────────────────────────────────────

async function setup(extraAddresses?: string[]) {
  const { ensureWorkspace, createPublicClient } = require('openclaw');
  const ws = ensureWorkspace();
  const client = createPublicClient(ws.config);

  const contracts = getDeployedContracts(ws.config);
  const lobTokenAddress = ws.config.contracts.lobToken || ZERO;

  // Gather addresses to check: agent wallet + any provided
  let agentAddresses: string[] = extraAddresses || [];
  try {
    const { loadWallet } = require('openclaw');
    const wallet = loadWallet(ws.path);
    if (wallet.address && !agentAddresses.includes(wallet.address)) {
      agentAddresses.unshift(wallet.address);
    }
  } catch { /* no wallet */ }

  console.log(chalk.bold('\n  LobstrClaw — Contract Audit'));
  console.log(chalk.dim(`  Workspace: ${ws.name}`));
  console.log(chalk.dim(`  Chain: ${ws.config.chain}`));
  console.log(chalk.dim(`  Contracts: ${contracts.length} deployed`));
  if (agentAddresses.length > 0) {
    console.log(chalk.dim(`  Checking: ${agentAddresses.map((a) => a.slice(0, 10) + '...').join(', ')}`));
  }

  return { client, contracts, lobTokenAddress, agentAddresses };
}
