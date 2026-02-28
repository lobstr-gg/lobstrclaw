// ═══════════════════════════════════════════════════════════════════
// Consensus Discord — Embed builders and reaction/vote watchers
// for the consensus channel
// ═══════════════════════════════════════════════════════════════════

// Lazy-load Discord client — requires openclaw with discord.js at runtime
function getOpenClawDiscord() {
  try {
    return require('openclaw') as {
      getDiscordClient: () => any;
      sendMessage: (channelId: string, content: any) => Promise<any>;
    };
  } catch {
    throw new Error('Discord integration requires openclaw package. Install it or run inside the monorepo.');
  }
}

function getDiscordClient() {
  return getOpenClawDiscord().getDiscordClient();
}

function sendMessage(channelId: string, content: any): Promise<any> {
  return getOpenClawDiscord().sendMessage(channelId, content);
}
import type { Proposal } from './memory-client';

// ── Color constants for embeds ───────────────────────────────────
const COLOR_PENDING  = 0xffc107; // yellow
const COLOR_APPROVED = 0x28a745; // green
const COLOR_DENIED   = 0xdc3545; // red
const COLOR_EXECUTED = 0x17a2b8; // teal
const COLOR_EXPIRED  = 0x6c757d; // gray
const COLOR_VERIFY   = 0x6f42c1; // purple

// ── Embed builders ───────────────────────────────────────────────

function buildProposalEmbed(proposal: Proposal & { description?: string }) {
  const votes = proposal.votes || {};
  const voteLines = Object.entries(votes)
    .map(([agent, vote]) => `  ${vote === 'approve' ? '\u2705' : '\u274c'} ${agent}`)
    .join('\n') || '  (none yet)';

  const argsDisplay = proposal.args
    ? proposal.args.length > 500 ? proposal.args.slice(0, 500) + '...' : proposal.args
    : '(none)';

  return {
    embeds: [{
      title: `\ud83d\udcdd Transaction Proposal`,
      color: COLOR_PENDING,
      fields: [
        { name: 'Target', value: `\`${proposal.tool}\``, inline: true },
        { name: 'Proposer', value: proposal.proposer, inline: true },
        { name: 'Status', value: proposal.status, inline: true },
        { name: 'Arguments', value: `\`\`\`\n${argsDisplay}\n\`\`\`` },
        ...(proposal.context ? [{ name: 'Context', value: proposal.context }] : []),
        { name: 'Votes', value: voteLines },
      ],
      footer: { text: `ID: ${proposal.id}` },
      timestamp: proposal.created_at,
    }],
  };
}

interface ExecutionResult {
  success: boolean;
  txHash?: string;
  gasUsed?: number;
  blockNumber?: number;
  error?: string;
}

function buildExecutionEmbed(proposal: Proposal, result: ExecutionResult) {
  const color = result.success ? COLOR_EXECUTED : COLOR_DENIED;
  const status = result.success ? '\u2705 Executed' : '\u274c Failed';

  const fields = [
    { name: 'Proposal', value: proposal.id, inline: true },
    { name: 'Status', value: status, inline: true },
    { name: 'Target', value: `\`${proposal.tool}\``, inline: true },
  ];

  if (result.txHash) {
    const basescanUrl = `https://basescan.org/tx/${result.txHash}`;
    fields.push({ name: 'Transaction', value: `[${result.txHash.slice(0, 18)}...](${basescanUrl})`, inline: false });
  }
  if (result.gasUsed) {
    fields.push({ name: 'Gas Used', value: result.gasUsed.toLocaleString(), inline: true });
  }
  if (result.blockNumber) {
    fields.push({ name: 'Block', value: result.blockNumber.toLocaleString(), inline: true });
  }
  if (result.error) {
    fields.push({ name: 'Error', value: `\`\`\`\n${result.error.slice(0, 500)}\n\`\`\``, inline: false });
  }

  return {
    embeds: [{
      title: `\u26a1 Transaction ${result.success ? 'Executed' : 'Failed'}`,
      color,
      fields,
      footer: { text: `Proposal: ${proposal.id}` },
      timestamp: new Date().toISOString(),
    }],
  };
}

interface VerificationCheck {
  label: string;
  expected: string;
  actual: string;
  passed: boolean;
}

function buildVerificationEmbed(proposalId: string, checks: VerificationCheck[]) {
  const allPassed = checks.every(c => c.passed);
  const lines = checks.map(c =>
    `${c.passed ? '\u2705' : '\u274c'} **${c.label}**: expected \`${c.expected}\`, got \`${c.actual}\``
  ).join('\n');

  return {
    embeds: [{
      title: `\ud83d\udd0d Post-Execution Verification`,
      color: allPassed ? COLOR_VERIFY : COLOR_DENIED,
      description: lines || 'No checks configured.',
      footer: { text: `Proposal: ${proposalId}` },
      timestamp: new Date().toISOString(),
    }],
  };
}

// ── Status color map ─────────────────────────────────────────────
const STATUS_COLORS: Record<string, number> = {
  pending: COLOR_PENDING,
  approved: COLOR_APPROVED,
  denied: COLOR_DENIED,
  executed: COLOR_EXECUTED,
  expired: COLOR_EXPIRED,
  failed: COLOR_DENIED,
};

// ── Send functions ───────────────────────────────────────────────

export async function postProposalEmbed(
  channelId: string,
  proposal: Proposal & { description?: string },
): Promise<string> {
  const client = getDiscordClient();
  const channel = await client.channels.fetch(channelId);
  if (!channel || !('send' in channel)) {
    throw new Error('Consensus channel not found or not text-based');
  }

  const embed = buildProposalEmbed(proposal);
  const msg = await (channel as any).send(embed);

  // Add convenience reactions
  await msg.react('\u2705').catch(() => {});
  await msg.react('\u274c').catch(() => {});

  return msg.id;
}

export async function postExecutionEmbed(
  channelId: string,
  proposal: Proposal,
  result: ExecutionResult,
): Promise<void> {
  const client = getDiscordClient();
  const channel = await client.channels.fetch(channelId);
  if (!channel || !('send' in channel)) return;

  const embed = buildExecutionEmbed(proposal, result);
  await (channel as any).send(embed);
}

export async function postVerificationEmbed(
  channelId: string,
  proposalId: string,
  checks: VerificationCheck[],
): Promise<void> {
  const client = getDiscordClient();
  const channel = await client.channels.fetch(channelId);
  if (!channel || !('send' in channel)) return;

  const embed = buildVerificationEmbed(proposalId, checks);
  await (channel as any).send(embed);
}

export async function updateProposalEmbed(
  channelId: string,
  messageId: string,
  newStatus: string,
): Promise<void> {
  try {
    const client = getDiscordClient();
    const channel = await client.channels.fetch(channelId);
    if (!channel || !('messages' in channel)) return;

    const msg = await (channel as any).messages.fetch(messageId);
    if (!msg || !msg.embeds?.[0]) return;

    const oldEmbed = msg.embeds[0].toJSON();
    oldEmbed.color = STATUS_COLORS[newStatus] ?? COLOR_PENDING;

    // Update status field
    const statusField = oldEmbed.fields?.find((f: any) => f.name === 'Status');
    if (statusField) statusField.value = newStatus;

    await msg.edit({ embeds: [oldEmbed] });
  } catch {
    // Non-critical — embed update failure shouldn't break the pipeline
  }
}

// ── Reaction watcher — admin fast-track approval ─────────────────

export function setupReactionWatcher(
  channelId: string,
  adminUserId: string,
  onApproval: (proposalId: string) => void,
  onDenial: (proposalId: string) => void,
): void {
  const client = getDiscordClient();

  client.on('messageReactionAdd', async (reaction: any, user: any) => {
    // Ensure full data
    if (reaction.partial) {
      try { await reaction.fetch(); } catch { return; }
    }
    if (user.partial) {
      try { await user.fetch(); } catch { return; }
    }

    // Only watch the consensus channel
    if (reaction.message.channelId !== channelId) return;

    // Only admin's reactions count for fast-track
    if (user.id !== adminUserId) return;

    // Extract proposal ID from embed footer
    const embed = reaction.message.embeds?.[0];
    if (!embed?.footer?.text) return;

    const match = embed.footer.text.match(/^ID:\s*(.+)$/);
    if (!match) return;

    const proposalId = match[1];

    if (reaction.emoji.name === '\u2705') {
      onApproval(proposalId);
    } else if (reaction.emoji.name === '\u274c') {
      onDenial(proposalId);
    }
  });
}

// ── Agent vote watcher — "APPROVE <id>" / "DENY <id>" messages ───

export function setupAgentVoteWatcher(
  channelId: string,
  agentBotIds: Set<string>,
  onVote: (proposalId: string, voter: string, vote: 'approve' | 'deny') => void,
): void {
  const client = getDiscordClient();

  client.on('messageCreate', (message: any) => {
    if (message.channelId !== channelId) return;
    if (!message.author.bot) return;
    if (!agentBotIds.has(message.author.id)) return;

    const content = message.content.trim();

    const approveMatch = content.match(/^APPROVE\s+(\S+)/i);
    if (approveMatch) {
      // Derive agent name from bot user (fallback to bot username)
      const voter = message.author.username.toLowerCase().replace(/[^a-z]/g, '');
      onVote(approveMatch[1], voter, 'approve');
      return;
    }

    const denyMatch = content.match(/^DENY\s+(\S+)/i);
    if (denyMatch) {
      const voter = message.author.username.toLowerCase().replace(/[^a-z]/g, '');
      onVote(denyMatch[1], voter, 'deny');
    }
  });
}

export type { ExecutionResult, VerificationCheck };
