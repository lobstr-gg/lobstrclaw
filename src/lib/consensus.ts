// ═══════════════════════════════════════════════════════════════════
// Consensus Engine — Orchestrates the proposal → vote → execute
// lifecycle for on-chain transaction proposals
// ═══════════════════════════════════════════════════════════════════

import * as memory from './memory-client';
import * as discord from './consensus-discord';
import { executeTx, verifyCastCall, type CastSendArgs, type TxResult } from './tx-executor';
import type { Proposal } from './memory-client';
import type { VerificationCheck } from './consensus-discord';

// ── Types ────────────────────────────────────────────────────────

export interface ConsensusConfig {
  consensusChannelId: string;
  adminDiscordUserId: string;
  agentName: string;
  rpcUrl: string;
  chainId: number;
  proposalTimeoutMinutes: number;
  agentBotIds?: Set<string>;
}

export interface ProposeArgs {
  target: string;
  functionSig: string;
  args: string[];
  value?: string;
  description: string;
  context?: string;
  verifications?: VerificationSpec[];
}

export interface VerificationSpec {
  label: string;
  target: string;
  functionSig: string;
  args: string[];
  expected: string;
}

interface ConsensusResult {
  approved: boolean;
  denied: boolean;
  approveCount: number;
  denyCount: number;
}

// ── Consensus checker ────────────────────────────────────────────

const AGENTS = ['sentinel', 'arbiter', 'steward'] as const;

export function checkConsensus(votes: Record<string, string>): ConsensusResult {
  let approveCount = 0;
  let denyCount = 0;

  for (const agent of AGENTS) {
    const vote = votes[agent];
    if (vote === 'approve') approveCount++;
    else if (vote === 'deny') denyCount++;
  }

  return {
    approved: approveCount >= 3,  // 3/3 unanimous consensus
    denied: denyCount >= 1,       // any single deny blocks
    approveCount,
    denyCount,
  };
}

// ── Propose a transaction ────────────────────────────────────────

export async function proposeTx(
  config: ConsensusConfig,
  args: ProposeArgs,
): Promise<string> {
  // Build the tool string: "target.functionSig"
  const tool = `${args.target}::${args.functionSig}`;
  const argsStr = JSON.stringify({
    target: args.target,
    functionSig: args.functionSig,
    args: args.args,
    value: args.value || '0',
    description: args.description,
    verifications: args.verifications,
  });

  // 1. Create proposal in agent-memory
  const { id } = await memory.createProposal(
    tool,
    argsStr,
    args.context || null,
    null, // discord_msg set after embed post
  );

  // 2. Post embed to consensus channel
  const proposal = await memory.getProposal(id);
  const discordMsgId = await discord.postProposalEmbed(
    config.consensusChannelId,
    { ...proposal, description: args.description },
  );

  // 3. Update proposal with discord message ID
  // (Uses memory upsert since there's no dedicated update for discord_msg)
  // The discord_msg field was set to null on create — we store it via context update
  // For now, we'll track the mapping locally; the proposal ID is in the embed footer

  console.log(`[consensus] Proposal ${id} created and posted to consensus channel (msg: ${discordMsgId})`);

  return id;
}

// ── Handle a vote ────────────────────────────────────────────────

export async function handleVote(
  config: ConsensusConfig,
  proposalId: string,
  voter: string,
  vote: 'approve' | 'deny',
): Promise<{ resolved: boolean; status: string }> {
  // Record vote
  const result = await memory.voteOnProposal(proposalId, vote);
  const consensus = checkConsensus(result.votes);

  if (consensus.approved) {
    await memory.updateProposalStatus(proposalId, 'approved');
    console.log(`[consensus] Proposal ${proposalId} APPROVED (${consensus.approveCount}/3)`);

    // Update Discord embed
    const proposal = await memory.getProposal(proposalId);
    if (proposal?.discord_msg) {
      await discord.updateProposalEmbed(config.consensusChannelId, proposal.discord_msg, 'approved');
    }

    return { resolved: true, status: 'approved' };
  }

  if (consensus.denied) {
    await memory.updateProposalStatus(proposalId, 'denied');
    console.log(`[consensus] Proposal ${proposalId} DENIED (${consensus.denyCount}/3 deny)`);

    const proposal = await memory.getProposal(proposalId);
    if (proposal?.discord_msg) {
      await discord.updateProposalEmbed(config.consensusChannelId, proposal.discord_msg, 'denied');
    }

    return { resolved: true, status: 'denied' };
  }

  console.log(`[consensus] Proposal ${proposalId} vote recorded: ${voter}=${vote} (${consensus.approveCount} approve, ${consensus.denyCount} deny)`);
  return { resolved: false, status: 'pending' };
}

// ── Admin fast-track approval ────────────────────────────────────

export async function handleAdminApproval(
  config: ConsensusConfig,
  proposalId: string,
): Promise<void> {
  await memory.updateProposalStatus(proposalId, 'approved');
  console.log(`[consensus] Proposal ${proposalId} FAST-TRACK APPROVED by admin`);

  const proposal = await memory.getProposal(proposalId);
  if (proposal?.discord_msg) {
    await discord.updateProposalEmbed(config.consensusChannelId, proposal.discord_msg, 'approved');
  }
}

// ── Execute an approved proposal ─────────────────────────────────

export async function executeApproved(
  config: ConsensusConfig,
  proposalId: string,
): Promise<TxResult> {
  const proposal = await memory.getProposal(proposalId);
  if (!proposal) throw new Error(`Proposal ${proposalId} not found`);
  if (proposal.status !== 'approved') {
    throw new Error(`Proposal ${proposalId} is not approved (status: ${proposal.status})`);
  }

  // Parse stored args
  let parsedArgs: {
    target: string;
    functionSig: string;
    args: string[];
    value?: string;
    verifications?: VerificationSpec[];
  };

  try {
    parsedArgs = JSON.parse(proposal.args || '{}');
  } catch {
    throw new Error(`Invalid proposal args for ${proposalId}`);
  }

  const castArgs: CastSendArgs = {
    target: parsedArgs.target,
    functionSig: parsedArgs.functionSig,
    args: parsedArgs.args || [],
    value: parsedArgs.value,
    rpcUrl: config.rpcUrl,
  };

  // Mark as executing
  await memory.updateProposalStatus(proposalId, 'executing');

  // Execute
  console.log(`[consensus] Executing proposal ${proposalId}: ${castArgs.target}::${castArgs.functionSig}`);
  const result = await executeTx(castArgs);

  // Record execution
  await memory.recordExecution(proposalId, {
    tx_hash: result.txHash,
    chain_id: config.chainId,
    target: castArgs.target,
    function_sig: castArgs.functionSig,
    args: JSON.stringify(castArgs.args),
    value: castArgs.value || '0',
    status: result.success ? 'confirmed' : 'failed',
    gas_used: result.gasUsed,
    block_number: result.blockNumber,
    error: result.error,
  });

  // Update proposal status
  const finalStatus = result.success ? 'executed' : 'failed';
  await memory.updateProposalStatus(proposalId, finalStatus);

  // Post execution result to Discord
  await discord.postExecutionEmbed(config.consensusChannelId, proposal, result);

  // Run verifications if tx succeeded and specs exist
  if (result.success && parsedArgs.verifications?.length) {
    await verifyExecution(config, proposalId, parsedArgs.verifications);
  }

  console.log(`[consensus] Proposal ${proposalId} ${finalStatus}${result.txHash ? ` (tx: ${result.txHash})` : ''}`);

  return result;
}

// ── Post-execution verification ──────────────────────────────────

export async function verifyExecution(
  config: ConsensusConfig,
  proposalId: string,
  specs: VerificationSpec[],
): Promise<VerificationCheck[]> {
  const checks: VerificationCheck[] = [];

  for (const spec of specs) {
    const { passed, actual } = await verifyCastCall(
      spec.target,
      spec.functionSig,
      spec.args,
      spec.expected,
      config.rpcUrl,
    );

    checks.push({
      label: spec.label,
      expected: spec.expected,
      actual,
      passed,
    });
  }

  // Post verification results to Discord
  await discord.postVerificationEmbed(config.consensusChannelId, proposalId, checks);

  return checks;
}

// ── Stale proposal resolver ──────────────────────────────────────

export async function resolveStaleProposals(
  config: ConsensusConfig,
): Promise<number> {
  const pending = await memory.listProposals('pending');
  const now = Date.now();
  let expired = 0;

  for (const proposal of pending) {
    const createdAt = new Date(proposal.created_at).getTime();
    const ageMinutes = (now - createdAt) / 60_000;

    if (ageMinutes > config.proposalTimeoutMinutes) {
      await memory.updateProposalStatus(proposal.id, 'expired');

      if (proposal.discord_msg) {
        await discord.updateProposalEmbed(config.consensusChannelId, proposal.discord_msg, 'expired');
      }

      console.log(`[consensus] Proposal ${proposal.id} expired (age: ${Math.round(ageMinutes)}min)`);
      expired++;
    }
  }

  return expired;
}

// ── Execute all approved but unexecuted proposals ────────────────

export async function executeAllApproved(
  config: ConsensusConfig,
): Promise<{ executed: number; failed: number }> {
  const approved = await memory.listProposals('approved');
  let executed = 0;
  let failed = 0;

  for (const proposal of approved) {
    try {
      const result = await executeApproved(config, proposal.id);
      if (result.success) executed++;
      else failed++;
    } catch (err: any) {
      console.error(`[consensus] Failed to execute ${proposal.id}: ${err.message}`);
      failed++;
    }
  }

  return { executed, failed };
}

// ── Start consensus pipeline (Discord watchers) ──────────────────

export function startConsensusPipeline(config: ConsensusConfig): void {
  // Watch admin's reactions for fast-track approval
  discord.setupReactionWatcher(
    config.consensusChannelId,
    config.adminDiscordUserId,
    async (proposalId) => {
      try {
        await handleAdminApproval(config, proposalId);
      } catch (err: any) {
        console.error(`[consensus] Admin approval handler error: ${err.message}`);
      }
    },
    async (proposalId) => {
      try {
        await memory.updateProposalStatus(proposalId, 'denied');
        const proposal = await memory.getProposal(proposalId);
        if (proposal?.discord_msg) {
          await discord.updateProposalEmbed(config.consensusChannelId, proposal.discord_msg, 'denied');
        }
        console.log(`[consensus] Proposal ${proposalId} DENIED by admin`);
      } catch (err: any) {
        console.error(`[consensus] Admin denial handler error: ${err.message}`);
      }
    },
  );

  // Watch agent bot messages for APPROVE/DENY votes
  if (config.agentBotIds?.size) {
    discord.setupAgentVoteWatcher(
      config.consensusChannelId,
      config.agentBotIds,
      async (proposalId, voter, vote) => {
        try {
          await handleVote(config, proposalId, voter, vote);
        } catch (err: any) {
          console.error(`[consensus] Agent vote handler error: ${err.message}`);
        }
      },
    );
  }

  console.log('[consensus] Pipeline started — watching consensus channel for reactions and votes');
}

// ── Build config from environment ────────────────────────────────

export function buildConfigFromEnv(): ConsensusConfig {
  const consensusChannelId = process.env.CONSENSUS_CHANNEL_ID;
  const adminDiscordUserId = process.env.ADMIN_DISCORD_USER_ID;
  const agentName = process.env.AGENT_NAME;
  const rpcUrl = process.env.OPENCLAW_RPC_URL || process.env.BASE_MAINNET_RPC_URL;
  const chainId = parseInt(process.env.NEXT_PUBLIC_CHAIN_ID || '8453', 10);
  const timeoutMinutes = parseInt(process.env.PROPOSAL_TIMEOUT_MINUTES || '60', 10);

  if (!consensusChannelId) throw new Error('CONSENSUS_CHANNEL_ID not set');
  if (!adminDiscordUserId) throw new Error('ADMIN_DISCORD_USER_ID not set');
  if (!agentName) throw new Error('AGENT_NAME not set');
  if (!rpcUrl) throw new Error('OPENCLAW_RPC_URL or BASE_MAINNET_RPC_URL not set');

  const agentBotIds = process.env.AGENT_BOT_IDS
    ? new Set(process.env.AGENT_BOT_IDS.split(',').map(s => s.trim()))
    : undefined;

  return {
    consensusChannelId,
    adminDiscordUserId,
    agentName,
    rpcUrl,
    chainId,
    proposalTimeoutMinutes: timeoutMinutes,
    agentBotIds,
  };
}
