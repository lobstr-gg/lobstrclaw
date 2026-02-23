import * as fs from 'fs';
import * as path from 'path';
import { type RoleName, type TemplateVars, ROLES } from './roles';
import { loadTemplate, getTemplatesDir, substitute } from './template';

export interface GenerateOptions {
  name: string;
  role: RoleName;
  codename: string;
  chain: string;
  agentNumber: string;
  vpsDescription: string;
  outputDir: string;
  docker: boolean;
}

/**
 * Build the template vars object from generate options.
 */
function buildVars(opts: GenerateOptions): TemplateVars {
  const roleConfig = ROLES[opts.role];
  return {
    AGENT_NAME: opts.codename,
    AGENT_CODENAME: opts.name,
    AGENT_NUMBER: opts.agentNumber,
    ROLE_TITLE: roleConfig.title,
    ARBITRATOR_RANK: roleConfig.arbitratorRank,
    ARBITRATOR_STAKE: roleConfig.arbitratorStake,
    DISPUTE_CAP: roleConfig.disputeCap,
    VPS_DESCRIPTION: opts.vpsDescription,
  };
}

/**
 * Generate a crontab file from role-specific interval definitions.
 */
function generateCrontab(role: RoleName, codename: string): string {
  const roleConfig = ROLES[role];
  const lines: string[] = [
    `# ${codename} Crontab — ${roleConfig.title} Agent`,
    '# All times in UTC',
    '',
  ];

  for (const job of roleConfig.cron) {
    lines.push(`# ${job.description} (${job.priority})`);
    lines.push(`${job.expression} /opt/cron/${job.script} >> /var/log/agent/${job.script.replace('.sh', '.log')} 2>&1`);
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Generate all agent files in the output directory.
 */
export function generateAgentFiles(opts: GenerateOptions): string[] {
  const vars = buildVars(opts);
  const varsRecord: Record<string, string> = { ...vars };
  const created: string[] = [];

  // Ensure output directory exists
  fs.mkdirSync(opts.outputDir, { recursive: true });

  // 1. SOUL.md
  const roleConfig = ROLES[opts.role];
  const soul = loadTemplate('soul', roleConfig.soulTemplate, varsRecord);
  const soulPath = path.join(opts.outputDir, 'SOUL.md');
  fs.writeFileSync(soulPath, soul);
  created.push('SOUL.md');

  // 2. HEARTBEAT.md
  const heartbeat = loadTemplate('heartbeat', roleConfig.heartbeatTemplate, varsRecord);
  const heartbeatPath = path.join(opts.outputDir, 'HEARTBEAT.md');
  fs.writeFileSync(heartbeatPath, heartbeat);
  created.push('HEARTBEAT.md');

  // 3. IDENTITY.md
  const identity = loadTemplate('identity', roleConfig.identityTemplate, varsRecord);
  const identityPath = path.join(opts.outputDir, 'IDENTITY.md');
  fs.writeFileSync(identityPath, identity);
  created.push('IDENTITY.md');

  // 4. RULES.md (shared across roles)
  const rules = loadTemplate('rules', 'rules.md', varsRecord);
  const rulesPath = path.join(opts.outputDir, 'RULES.md');
  fs.writeFileSync(rulesPath, rules);
  created.push('RULES.md');

  // 5. REWARDS.md
  const rewards = loadTemplate('rewards', roleConfig.rewardsTemplate, varsRecord);
  const rewardsPath = path.join(opts.outputDir, 'REWARDS.md');
  fs.writeFileSync(rewardsPath, rewards);
  created.push('REWARDS.md');

  // 6. GOVERNANCE.md (shared across roles)
  const governance = loadTemplate('governance', 'governance.md', varsRecord);
  const governancePath = path.join(opts.outputDir, 'GOVERNANCE.md');
  fs.writeFileSync(governancePath, governance);
  created.push('GOVERNANCE.md');

  // 7. Crontab
  const crontab = generateCrontab(opts.role, opts.codename);
  const crontabPath = path.join(opts.outputDir, 'crontab');
  fs.writeFileSync(crontabPath, crontab);
  created.push('crontab');

  // 8. Docker files (unless --no-docker)
  if (opts.docker) {
    const templatesDir = getTemplatesDir();

    // docker-compose.yml from template
    const composeTpl = fs.readFileSync(
      path.join(templatesDir, 'docker', 'docker-compose.yml.tpl'),
      'utf-8',
    );
    const compose = substitute(composeTpl, varsRecord);
    fs.writeFileSync(path.join(opts.outputDir, 'docker-compose.yml'), compose);
    created.push('docker-compose.yml');

    // .env.example
    const envExample = fs.readFileSync(
      path.join(templatesDir, 'docker', 'env.example'),
      'utf-8',
    );
    fs.writeFileSync(path.join(opts.outputDir, '.env.example'), envExample);
    created.push('.env.example');
  }

  return created;
}

/**
 * Stage a complete deployment bundle directory (for tar.gz).
 * Returns the staging directory path.
 */
export function stageDeployBundle(agentDir: string, name: string, stagingDir: string): string[] {
  const staged: string[] = [];
  const templatesDir = getTemplatesDir();

  fs.mkdirSync(stagingDir, { recursive: true });

  // Copy agent-specific files
  const agentFiles = ['SOUL.md', 'HEARTBEAT.md', 'IDENTITY.md', 'RULES.md', 'REWARDS.md', 'GOVERNANCE.md', 'crontab', 'docker-compose.yml'];
  for (const file of agentFiles) {
    const src = path.join(agentDir, file);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(stagingDir, file));
      staged.push(file);
    }
  }

  // Copy shared Docker infra
  const sharedDir = path.join(stagingDir, 'shared');
  fs.mkdirSync(sharedDir, { recursive: true });

  const dockerFiles = ['Dockerfile', 'docker-entrypoint.sh', '.dockerignore'];
  for (const file of dockerFiles) {
    const src = path.join(templatesDir, 'docker', file);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(sharedDir, file));
      staged.push(`shared/${file}`);
    }
  }

  // Copy scripts
  const scriptsDir = path.join(sharedDir, 'scripts');
  fs.mkdirSync(scriptsDir, { recursive: true });
  const scriptsSrcDir = path.join(templatesDir, 'scripts');
  if (fs.existsSync(scriptsSrcDir)) {
    for (const file of fs.readdirSync(scriptsSrcDir)) {
      fs.copyFileSync(path.join(scriptsSrcDir, file), path.join(scriptsDir, file));
      staged.push(`shared/scripts/${file}`);
    }
  }

  // Copy cron scripts
  const cronDir = path.join(sharedDir, 'cron');
  fs.mkdirSync(cronDir, { recursive: true });
  const cronSrcDir = path.join(templatesDir, 'cron');
  if (fs.existsSync(cronSrcDir)) {
    for (const file of fs.readdirSync(cronSrcDir)) {
      fs.copyFileSync(path.join(cronSrcDir, file), path.join(cronDir, file));
      staged.push(`shared/cron/${file}`);
    }
  }

  // Copy .env.example
  const envSrc = path.join(templatesDir, 'docker', 'env.example');
  if (fs.existsSync(envSrc)) {
    fs.copyFileSync(envSrc, path.join(stagingDir, '.env.example'));
    staged.push('.env.example');
  }

  return staged;
}
