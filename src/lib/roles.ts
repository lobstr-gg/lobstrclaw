export type RoleName = 'moderator' | 'arbitrator' | 'dao-ops';

export interface CronInterval {
  script: string;
  expression: string;
  priority: string;
  description: string;
}

export interface RoleConfig {
  title: string;
  arbitratorRank: string;
  arbitratorStake: string;
  disputeCap: string;
  soulTemplate: string;
  heartbeatTemplate: string;
  identityTemplate: string;
  rewardsTemplate: string;
  cron: CronInterval[];
}

export interface TemplateVars {
  AGENT_NAME: string;
  AGENT_CODENAME: string;
  AGENT_NUMBER: string;
  ROLE_TITLE: string;
  ARBITRATOR_RANK: string;
  ARBITRATOR_STAKE: string;
  DISPUTE_CAP: string;
  VPS_DESCRIPTION: string;
}

export const ROLES: Record<RoleName, RoleConfig> = {
  moderator: {
    title: 'Moderator',
    arbitratorRank: 'Junior',
    arbitratorStake: '5,000',
    disputeCap: '500',
    soulTemplate: 'moderator.md',
    heartbeatTemplate: 'moderator.md',
    identityTemplate: 'moderator.md',
    rewardsTemplate: 'moderator.md',
    cron: [
      { script: 'heartbeat-check.sh', expression: '*/5 * * * *', priority: 'CRITICAL', description: 'Heartbeat check' },
      { script: 'action-runner.sh', expression: '* * * * *', priority: 'CRITICAL', description: 'Command dispatch' },
      { script: 'channel-monitor.sh', expression: '* * * * *', priority: 'HIGH', description: 'Channel monitor' },
      { script: 'mod-queue.sh', expression: '*/15 * * * *', priority: 'HIGH', description: 'Mod queue review' },
      { script: 'notification-poll.sh', expression: '*/5 * * * *', priority: 'HIGH', description: 'Notification poll' },
      { script: 'inbox-handler.sh', expression: '*/15 * * * *', priority: 'HIGH', description: 'DM inbox handler' },
      { script: 'forum-patrol.sh', expression: '*/20 * * * *', priority: 'HIGH', description: 'Forum moderation patrol' },
      { script: 'dispute-watcher.sh', expression: '*/30 * * * *', priority: 'MEDIUM', description: 'Dispute check' },
      { script: 'proposal-monitor.sh', expression: '20 * * * *', priority: 'MEDIUM', description: 'Proposal check' },
      { script: 'forum-engage.sh', expression: '*/45 * * * *', priority: 'MEDIUM', description: 'Forum engagement' },
      { script: 'forum-post.sh', expression: '0 */8 * * *', priority: 'MEDIUM', description: 'Autonomous forum post' },
      { script: 'team-meeting.sh', expression: '0 */6 * * *', priority: 'MEDIUM', description: 'Team status update' },
      { script: 'treasury-health.sh', expression: '45 */4 * * *', priority: 'LOW', description: 'Treasury + gas health' },
      { script: 'security-audit.sh', expression: '0 9 * * *', priority: 'LOW', description: 'Daily security audit' },
      { script: 'reward-claimer.sh', expression: '15 */4 * * *', priority: 'MEDIUM', description: 'Reward claim check' },
      { script: 'insurance-monitor.sh', expression: '30 */6 * * *', priority: 'LOW', description: 'Insurance pool health' },
      { script: 'moltbook-heartbeat.sh', expression: '*/30 * * * *', priority: 'LOW', description: 'Moltbook social engagement' },
      { script: 'daily-report.sh', expression: '0 23 * * *', priority: 'LOW', description: 'Daily report' },
    ],
  },
  arbitrator: {
    title: 'Arbitrator',
    arbitratorRank: 'Senior',
    arbitratorStake: '25,000',
    disputeCap: '5,000',
    soulTemplate: 'arbitrator.md',
    heartbeatTemplate: 'arbitrator.md',
    identityTemplate: 'arbitrator.md',
    rewardsTemplate: 'arbitrator.md',
    cron: [
      { script: 'heartbeat-check.sh', expression: '*/5 * * * *', priority: 'CRITICAL', description: 'Heartbeat check' },
      { script: 'action-runner.sh', expression: '* * * * *', priority: 'CRITICAL', description: 'Command dispatch' },
      { script: 'channel-monitor.sh', expression: '* * * * *', priority: 'HIGH', description: 'Channel monitor' },
      { script: 'dispute-watcher.sh', expression: '*/10 * * * *', priority: 'HIGH', description: 'Dispute check' },
      { script: 'notification-poll.sh', expression: '*/5 * * * *', priority: 'HIGH', description: 'Notification poll' },
      { script: 'inbox-handler.sh', expression: '*/15 * * * *', priority: 'HIGH', description: 'DM inbox handler' },
      { script: 'mod-queue.sh', expression: '*/30 * * * *', priority: 'MEDIUM', description: 'Mod queue review' },
      { script: 'proposal-monitor.sh', expression: '25 * * * *', priority: 'MEDIUM', description: 'Proposal check' },
      { script: 'forum-patrol.sh', expression: '*/30 * * * *', priority: 'MEDIUM', description: 'Forum moderation patrol' },
      { script: 'forum-engage.sh', expression: '15 * * * *', priority: 'MEDIUM', description: 'Forum engagement' },
      { script: 'forum-post.sh', expression: '30 */10 * * *', priority: 'MEDIUM', description: 'Autonomous forum post' },
      { script: 'team-meeting.sh', expression: '5 */6 * * *', priority: 'MEDIUM', description: 'Team status update' },
      { script: 'treasury-health.sh', expression: '50 */6 * * *', priority: 'LOW', description: 'Treasury + stake health' },
      { script: 'security-audit.sh', expression: '0 9 * * *', priority: 'LOW', description: 'Daily security audit' },
      { script: 'reward-claimer.sh', expression: '15 */4 * * *', priority: 'MEDIUM', description: 'Reward claim check' },
      { script: 'loan-monitor.sh', expression: '40 * * * *', priority: 'MEDIUM', description: 'Loan dispute monitor' },
      { script: 'moltbook-heartbeat.sh', expression: '10,40 * * * *', priority: 'LOW', description: 'Moltbook social engagement' },
      { script: 'daily-report.sh', expression: '10 23 * * *', priority: 'LOW', description: 'Daily report' },
    ],
  },
  'dao-ops': {
    title: 'DAO Operations',
    arbitratorRank: 'Junior',
    arbitratorStake: '5,000',
    disputeCap: '500',
    soulTemplate: 'dao-ops.md',
    heartbeatTemplate: 'dao-ops.md',
    identityTemplate: 'dao-ops.md',
    rewardsTemplate: 'dao-ops.md',
    cron: [
      { script: 'heartbeat-check.sh', expression: '*/5 * * * *', priority: 'CRITICAL', description: 'Heartbeat check' },
      { script: 'action-runner.sh', expression: '* * * * *', priority: 'CRITICAL', description: 'Command dispatch' },
      { script: 'channel-monitor.sh', expression: '* * * * *', priority: 'HIGH', description: 'Channel monitor' },
      { script: 'proposal-monitor.sh', expression: '*/15 * * * *', priority: 'HIGH', description: 'Proposal check' },
      { script: 'notification-poll.sh', expression: '*/5 * * * *', priority: 'HIGH', description: 'Notification poll' },
      { script: 'inbox-handler.sh', expression: '*/15 * * * *', priority: 'HIGH', description: 'DM inbox handler' },
      { script: 'dao-orchestrator.sh', expression: '*/15 * * * *', priority: 'HIGH', description: 'DAO orchestrator' },
      { script: 'mod-queue.sh', expression: '*/30 * * * *', priority: 'MEDIUM', description: 'Mod queue review' },
      { script: 'dispute-watcher.sh', expression: '35 * * * *', priority: 'LOW', description: 'Dispute check' },
      { script: 'stream-claimer.sh', expression: '10 */4 * * *', priority: 'HIGH', description: 'Stream claims' },
      { script: 'treasury-health.sh', expression: '55 */6 * * *', priority: 'HIGH', description: 'Treasury health' },
      { script: 'forum-patrol.sh', expression: '5,35 * * * *', priority: 'MEDIUM', description: 'Forum moderation patrol' },
      { script: 'forum-engage.sh', expression: '20 * * * *', priority: 'MEDIUM', description: 'Forum engagement' },
      { script: 'forum-post.sh', expression: '15 */8 * * *', priority: 'MEDIUM', description: 'Autonomous forum post' },
      { script: 'team-meeting.sh', expression: '10 */6 * * *', priority: 'MEDIUM', description: 'Team status update' },
      { script: 'security-audit.sh', expression: '0 9 * * *', priority: 'LOW', description: 'Daily security audit' },
      { script: 'reward-claimer.sh', expression: '15 */4 * * *', priority: 'MEDIUM', description: 'Reward claim check' },
      { script: 'loan-monitor.sh', expression: '0 */2 * * *', priority: 'HIGH', description: 'Loan deadline monitor' },
      { script: 'insurance-monitor.sh', expression: '20 */4 * * *', priority: 'MEDIUM', description: 'Insurance pool health' },
      { script: 'lightning-watcher.sh', expression: '*/15 * * * *', priority: 'HIGH', description: 'Lightning proposals' },
      { script: 'moltbook-heartbeat.sh', expression: '5,35 * * * *', priority: 'LOW', description: 'Moltbook social engagement' },
      { script: 'daily-report.sh', expression: '20 23 * * *', priority: 'LOW', description: 'Daily report' },
    ],
  },
};

export const ROLE_NAMES: RoleName[] = ['moderator', 'arbitrator', 'dao-ops'];
