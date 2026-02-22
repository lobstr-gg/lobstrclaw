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
      { script: 'mod-queue.sh', expression: '*/15 * * * *', priority: 'HIGH', description: 'Mod queue review' },
      { script: 'dispute-watcher.sh', expression: '*/30 * * * *', priority: 'MEDIUM', description: 'Dispute check' },
      { script: 'proposal-monitor.sh', expression: '20 * * * *', priority: 'MEDIUM', description: 'Proposal check' },
      { script: 'treasury-health.sh', expression: '45 */4 * * *', priority: 'LOW', description: 'Treasury + gas health' },
      { script: 'security-audit.sh', expression: '0 9 * * *', priority: 'LOW', description: 'Daily security audit' },
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
      { script: 'dispute-watcher.sh', expression: '*/10 * * * *', priority: 'HIGH', description: 'Dispute check' },
      { script: 'mod-queue.sh', expression: '*/30 * * * *', priority: 'MEDIUM', description: 'Mod queue review' },
      { script: 'proposal-monitor.sh', expression: '25 * * * *', priority: 'MEDIUM', description: 'Proposal check' },
      { script: 'treasury-health.sh', expression: '50 */6 * * *', priority: 'LOW', description: 'Treasury + stake health' },
      { script: 'security-audit.sh', expression: '0 9 * * *', priority: 'LOW', description: 'Daily security audit' },
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
      { script: 'proposal-monitor.sh', expression: '*/15 * * * *', priority: 'HIGH', description: 'Proposal check' },
      { script: 'mod-queue.sh', expression: '*/30 * * * *', priority: 'MEDIUM', description: 'Mod queue review' },
      { script: 'dispute-watcher.sh', expression: '35 * * * *', priority: 'LOW', description: 'Dispute check' },
      { script: 'stream-claimer.sh', expression: '10 */4 * * *', priority: 'HIGH', description: 'Stream claims' },
      { script: 'treasury-health.sh', expression: '55 */6 * * *', priority: 'HIGH', description: 'Treasury health' },
      { script: 'security-audit.sh', expression: '0 9 * * *', priority: 'LOW', description: 'Daily security audit' },
    ],
  },
};

export const ROLE_NAMES: RoleName[] = ['moderator', 'arbitrator', 'dao-ops'];
