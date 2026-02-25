// ═══════════════════════════════════════════════════════════════════
// Consensus CLI — `lobstrclaw consensus` subcommands
// ═══════════════════════════════════════════════════════════════════

import { Command } from 'commander';
import chalk from 'chalk';
import {
  proposeTx,
  handleVote,
  executeApproved,
  resolveStaleProposals,
  executeAllApproved,
  checkConsensus,
  buildConfigFromEnv,
} from '../lib/consensus';
import * as memory from '../lib/memory-client';
import { validateAddress } from '../lib/tx-executor';

export function registerConsensusCommand(program: Command): void {
  const consensus = program
    .command('consensus')
    .description('On-chain transaction consensus — propose, vote, execute');

  // ── propose ────────────────────────────────────────────────────
  consensus
    .command('propose')
    .description('Create a transaction proposal and post to #consensus')
    .requiredOption('--target <address>', 'Target contract address')
    .requiredOption('--function <sig>', 'Function signature (e.g. "grantRole(bytes32,address)")')
    .option('--args <args...>', 'Function arguments')
    .option('--description <text>', 'Human-readable description', 'Transaction proposal')
    .option('--context <text>', 'Additional context')
    .option('--value <wei>', 'ETH value in wei', '0')
    .option('--verify <json>', 'Post-execution verification specs (JSON array)')
    .action(async (opts) => {
      try {
        validateAddress(opts.target);
        const config = buildConfigFromEnv();

        let verifications;
        if (opts.verify) {
          try {
            verifications = JSON.parse(opts.verify);
          } catch {
            console.error(chalk.red('Invalid --verify JSON'));
            process.exit(1);
          }
        }

        const id = await proposeTx(config, {
          target: opts.target,
          functionSig: opts.function,
          args: opts.args || [],
          value: opts.value,
          description: opts.description,
          context: opts.context,
          verifications,
        });

        console.log(chalk.green(`Proposal created: ${id}`));
        console.log(chalk.dim('Waiting for 2/3 agent consensus or Cruz approval in #consensus'));
      } catch (err: any) {
        console.error(chalk.red(`Failed to create proposal: ${err.message}`));
        process.exit(1);
      }
    });

  // ── vote ───────────────────────────────────────────────────────
  consensus
    .command('vote')
    .description('Cast a vote on a proposal')
    .requiredOption('--id <proposalId>', 'Proposal ID')
    .requiredOption('--vote <approve|deny>', 'Vote: approve or deny')
    .action(async (opts) => {
      try {
        const vote = opts.vote.toLowerCase();
        if (vote !== 'approve' && vote !== 'deny') {
          console.error(chalk.red('Vote must be "approve" or "deny"'));
          process.exit(1);
        }

        const config = buildConfigFromEnv();
        const result = await handleVote(config, opts.id, config.agentName, vote);

        if (result.resolved) {
          console.log(chalk.green(`Proposal ${opts.id} resolved: ${result.status}`));
        } else {
          console.log(chalk.yellow(`Vote recorded. Proposal ${opts.id} still pending.`));
        }
      } catch (err: any) {
        console.error(chalk.red(`Failed to vote: ${err.message}`));
        process.exit(1);
      }
    });

  // ── status ─────────────────────────────────────────────────────
  consensus
    .command('status')
    .description('Show proposal status and votes')
    .option('--id <proposalId>', 'Specific proposal ID')
    .option('--format <format>', 'Output format: text or json', 'text')
    .action(async (opts) => {
      try {
        if (opts.id) {
          const proposal = await memory.getProposal(opts.id);
          if (!proposal) {
            console.error(chalk.red(`Proposal ${opts.id} not found`));
            process.exit(1);
          }

          if (opts.format === 'json') {
            console.log(JSON.stringify(proposal, null, 2));
            return;
          }

          printProposal(proposal);
        } else {
          const proposals = await memory.listProposals();
          if (opts.format === 'json') {
            console.log(JSON.stringify(proposals, null, 2));
            return;
          }

          if (proposals.length === 0) {
            console.log(chalk.dim('No proposals found'));
            return;
          }

          for (const p of proposals.slice(0, 10)) {
            printProposalSummary(p);
          }
        }
      } catch (err: any) {
        console.error(chalk.red(`Failed to get status: ${err.message}`));
        process.exit(1);
      }
    });

  // ── list ───────────────────────────────────────────────────────
  consensus
    .command('list')
    .description('List proposals')
    .option('--status <status>', 'Filter by status: pending, approved, executed, denied, expired, all')
    .option('--format <format>', 'Output format: text or json', 'text')
    .action(async (opts) => {
      try {
        const status = opts.status === 'all' ? undefined : opts.status;
        const proposals = await memory.listProposals(status);

        if (opts.format === 'json') {
          console.log(JSON.stringify(proposals, null, 2));
          return;
        }

        if (proposals.length === 0) {
          console.log(chalk.dim(`No ${status || ''} proposals found`));
          return;
        }

        console.log(chalk.bold(`${proposals.length} proposal(s)${status ? ` (${status})` : ''}:\n`));
        for (const p of proposals) {
          printProposalSummary(p);
        }
      } catch (err: any) {
        console.error(chalk.red(`Failed to list proposals: ${err.message}`));
        process.exit(1);
      }
    });

  // ── execute ────────────────────────────────────────────────────
  consensus
    .command('execute')
    .description('Execute an approved proposal')
    .requiredOption('--id <proposalId>', 'Proposal ID to execute')
    .action(async (opts) => {
      try {
        const config = buildConfigFromEnv();
        console.log(chalk.yellow(`Executing proposal ${opts.id}...`));

        const result = await executeApproved(config, opts.id);

        if (result.success) {
          console.log(chalk.green(`Transaction executed successfully`));
          if (result.txHash) console.log(`  TX: ${result.txHash}`);
          if (result.gasUsed) console.log(`  Gas: ${result.gasUsed.toLocaleString()}`);
          if (result.blockNumber) console.log(`  Block: ${result.blockNumber.toLocaleString()}`);
        } else {
          console.error(chalk.red(`Transaction failed: ${result.error}`));
          process.exit(1);
        }
      } catch (err: any) {
        console.error(chalk.red(`Failed to execute: ${err.message}`));
        process.exit(1);
      }
    });

  // ── resolve ────────────────────────────────────────────────────
  consensus
    .command('resolve')
    .description('Expire stale proposals and execute approved ones')
    .action(async () => {
      try {
        const config = buildConfigFromEnv();

        const expired = await resolveStaleProposals(config);
        if (expired > 0) {
          console.log(chalk.yellow(`Expired ${expired} stale proposal(s)`));
        }

        const { executed, failed } = await executeAllApproved(config);
        if (executed > 0) {
          console.log(chalk.green(`Executed ${executed} approved proposal(s)`));
        }
        if (failed > 0) {
          console.log(chalk.red(`Failed to execute ${failed} proposal(s)`));
        }
        if (expired === 0 && executed === 0 && failed === 0) {
          console.log(chalk.dim('Nothing to resolve'));
        }
      } catch (err: any) {
        console.error(chalk.red(`Failed to resolve: ${err.message}`));
        process.exit(1);
      }
    });
}

// ── Display helpers ──────────────────────────────────────────────

const STATUS_ICONS: Record<string, string> = {
  pending: '\u23f3',
  approved: '\u2705',
  denied: '\u274c',
  executed: '\u26a1',
  executing: '\u23f3',
  expired: '\u23f0',
  failed: '\ud83d\udca5',
};

function printProposal(p: any): void {
  const icon = STATUS_ICONS[p.status] || '\u2753';
  console.log(`${icon} ${chalk.bold(p.id)}`);
  console.log(`  Status:   ${p.status}`);
  console.log(`  Proposer: ${p.proposer}`);
  console.log(`  Tool:     ${p.tool}`);
  if (p.args) {
    try {
      const parsed = JSON.parse(p.args);
      console.log(`  Target:   ${parsed.target}`);
      console.log(`  Function: ${parsed.functionSig}`);
      if (parsed.args?.length) console.log(`  Args:     ${parsed.args.join(', ')}`);
      if (parsed.description) console.log(`  Desc:     ${parsed.description}`);
    } catch {
      console.log(`  Args:     ${p.args}`);
    }
  }
  if (p.context) console.log(`  Context:  ${p.context}`);
  if (p.votes) {
    const votes = typeof p.votes === 'string' ? JSON.parse(p.votes) : p.votes;
    const consensus = checkConsensus(votes);
    console.log(`  Votes:    ${consensus.approveCount} approve, ${consensus.denyCount} deny`);
    for (const [agent, vote] of Object.entries(votes)) {
      console.log(`            ${vote === 'approve' ? '\u2705' : '\u274c'} ${agent}`);
    }
  }
  console.log(`  Created:  ${p.created_at}`);
  if (p.resolved_at) console.log(`  Resolved: ${p.resolved_at}`);
}

function printProposalSummary(p: any): void {
  const icon = STATUS_ICONS[p.status] || '\u2753';
  const votes = typeof p.votes === 'string' ? JSON.parse(p.votes) : (p.votes || {});
  const consensus = checkConsensus(votes);
  const age = timeSince(p.created_at);

  console.log(`  ${icon} ${chalk.bold(p.id)} [${p.status}] ${consensus.approveCount}/${3} approve — ${age} ago`);
  console.log(`    ${chalk.dim(p.tool)}`);
}

function timeSince(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}
