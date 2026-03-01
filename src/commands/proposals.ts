import { Command } from 'commander';
import chalk from 'chalk';

const PROPOSAL_STATUS: Record<number, string> = {
  0: 'Pending',
  1: 'Approved',
  2: 'Executed',
  3: 'Cancelled',
  4: 'Expired',
};

const LIGHTNING_PROPOSAL_STATUS: Record<number, string> = {
  0: 'Active',
  1: 'Approved',
  2: 'Executed',
  3: 'Cancelled',
  4: 'Expired',
};

interface ProposalSummary {
  source: string;
  id: string;
  status: string;
  description: string;
  approvals: string;
  created: string;
}

export function registerProposalsCommand(program: Command): void {
  program
    .command('proposals')
    .description('List all on-chain proposals across both governors (spending, admin, lightning)')
    .option('--format <fmt>', 'Output format: text, json', 'text')
    .action(async (opts: { format: string }) => {
      if (opts.format !== 'json') {
        console.log(chalk.bold('\n  LobstrClaw — All Proposals\n'));
      }

      let publicClient: any;
      let config: any;

      try {
        const { ensureWorkspace, createPublicClient: makeClient } = require('openclaw');
        const ws = ensureWorkspace();
        config = ws.config;
        publicClient = makeClient(ws.config);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (opts.format === 'json') {
          console.log(JSON.stringify({ error: msg }));
        } else {
          console.error(chalk.red(`  Error: ${msg}`));
        }
        process.exit(1);
      }

      const { getContractAddress, parseAbi, TREASURY_GOVERNOR_ABI, LIGHTNING_GOVERNOR_ABI } = require('openclaw');
      const govAbi = parseAbi(TREASURY_GOVERNOR_ABI as unknown as string[]);
      const lightningAbi = parseAbi(LIGHTNING_GOVERNOR_ABI as unknown as string[]);

      const all: ProposalSummary[] = [];

      // ── Treasury Spending Proposals ───────────────────────────
      try {
        const govAddr = getContractAddress(config, 'treasuryGovernor');
        for (let i = 1; i <= 100; i++) {
          try {
            const result = await publicClient.readContract({
              address: govAddr,
              abi: govAbi,
              functionName: 'getProposal',
              args: [BigInt(i)],
            }) as any;
            const id = result.id ?? result[0];
            if (id === 0n) break;
            const status = Number(result.status ?? result[6]);
            all.push({
              source: 'Treasury',
              id: id.toString(),
              status: PROPOSAL_STATUS[status] || 'Unknown',
              description: (result.description ?? result[5]) || '(spending proposal)',
              approvals: `${result.approvalCount ?? result[7]}/3`,
              created: new Date(Number(result.createdAt ?? result[8]) * 1000).toLocaleDateString(),
            });
          } catch {
            break;
          }
        }
      } catch {
        // treasuryGovernor not configured — skip
      }

      // ── Treasury Admin Proposals ──────────────────────────────
      try {
        const govAddr = getContractAddress(config, 'treasuryGovernor');
        for (let i = 1; i <= 100; i++) {
          try {
            const result = await publicClient.readContract({
              address: govAddr,
              abi: govAbi,
              functionName: 'getAdminProposal',
              args: [BigInt(i)],
            }) as any;
            const id = result.id ?? result[0];
            if (id === 0n) break;
            const status = Number(result.status ?? result[5]);
            all.push({
              source: 'Admin',
              id: id.toString(),
              status: PROPOSAL_STATUS[status] || 'Unknown',
              description: (result.description ?? result[4]) || '(admin proposal)',
              approvals: `${result.approvalCount ?? result[6]}/3`,
              created: new Date(Number(result.createdAt ?? result[7]) * 1000).toLocaleDateString(),
            });
          } catch {
            break;
          }
        }
      } catch {
        // treasuryGovernor not configured — skip
      }

      // ── Lightning Governor Proposals ──────────────────────────
      try {
        const govAddr = getContractAddress(config, 'lightningGovernor');
        const [count, quorum] = await Promise.all([
          publicClient.readContract({
            address: govAddr,
            abi: lightningAbi,
            functionName: 'proposalCount',
          }) as Promise<bigint>,
          publicClient.readContract({
            address: govAddr,
            abi: lightningAbi,
            functionName: 'quorum',
          }) as Promise<bigint>,
        ]);

        for (let i = 1n; i <= count; i++) {
          try {
            const result = await publicClient.readContract({
              address: govAddr,
              abi: lightningAbi,
              functionName: 'getProposal',
              args: [i],
            }) as any;

            const status = Number(result[5]);
            all.push({
              source: 'Lightning',
              id: result[0].toString(),
              status: LIGHTNING_PROPOSAL_STATUS[status] || 'Unknown',
              description: result[4] || '(governor proposal)',
              approvals: `${result[6]}/${quorum}`,
              created: new Date(Number(result[7]) * 1000).toLocaleDateString(),
            });
          } catch {
            break;
          }
        }
      } catch {
        // lightningGovernor not configured — skip
      }

      // ── Output ────────────────────────────────────────────────
      if (opts.format === 'json') {
        console.log(JSON.stringify(all));
        return;
      }

      if (all.length === 0) {
        console.log(chalk.dim('  No proposals found across any governor.\n'));
        return;
      }

      // Group by source
      for (const source of ['Treasury', 'Admin', 'Lightning']) {
        const group = all.filter((p) => p.source === source);
        if (group.length === 0) continue;

        console.log(chalk.bold(`  ${source} Proposals (${group.length})`));
        for (const p of group) {
          const statusColor = p.status === 'Approved' || p.status === 'Active'
            ? chalk.green
            : p.status === 'Pending'
              ? chalk.yellow
              : chalk.dim;
          const desc = p.description.length > 60
            ? p.description.slice(0, 57) + '...'
            : p.description;
          console.log(`    #${p.id}  ${statusColor(p.status.padEnd(10))}  ${p.approvals} approvals  ${chalk.dim(p.created)}  ${desc}`);
        }
        console.log('');
      }

      const actionable = all.filter((p) => ['Pending', 'Approved', 'Active'].includes(p.status));
      if (actionable.length > 0) {
        console.log(chalk.bold(`  ${actionable.length} actionable proposal(s)`));
        console.log('');
      }
    });
}
