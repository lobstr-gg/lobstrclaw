import * as fs from 'fs';
import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';
import * as cron from 'node-cron';
import { writePid, removePid, pidDir } from './pid';
import { ROLES, type RoleName, type CronInterval } from './roles';

export interface DaemonConfig {
  agentDir: string;
  agentName: string;
  role: RoleName;
  env: Record<string, string>;
  enableCron: boolean;
  enableDiscord: boolean;
}

const HEARTBEAT_INTERVAL_MS = 300_000; // 5 minutes
const MAX_BOT_FAILURES = 5;

let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let cronTasks: cron.ScheduledTask[] = [];
let botProcess: ChildProcess | null = null;
let botFailures = 0;
let shuttingDown = false;

export function runDaemon(config: DaemonConfig): void {
  const { agentDir, agentName, role, env, enableCron, enableDiscord } = config;
  const dotDir = pidDir(agentDir);
  const logFile = path.join(dotDir, 'agent.log');
  const logsDir = path.join(dotDir, 'logs');

  // Ensure directories exist
  fs.mkdirSync(dotDir, { recursive: true });
  fs.mkdirSync(logsDir, { recursive: true });

  // Redirect stdout/stderr to log file
  const logStream = fs.createWriteStream(logFile, { flags: 'a' });
  const origStdout = process.stdout.write;
  const origStderr = process.stderr.write;

  process.stdout.write = function (chunk: any, ...args: any[]): boolean {
    logStream.write(chunk);
    return origStdout.apply(process.stdout, [chunk, ...args] as any);
  } as any;
  process.stderr.write = function (chunk: any, ...args: any[]): boolean {
    logStream.write(chunk);
    return origStderr.apply(process.stderr, [chunk, ...args] as any);
  } as any;

  log(`Daemon starting: agent=${agentName} role=${role} dir=${agentDir}`);

  // Write PID file
  writePid(agentDir, {
    pid: process.pid,
    startedAt: new Date().toISOString(),
    agentName,
    role,
  });

  // Write /tmp/agent-env for cron scripts (mirrors Docker entrypoint behavior)
  writeAgentEnv(env);

  // Preprocess cron scripts
  const cronDir = preprocessCronScripts(agentDir, config);

  // Start heartbeat loop
  startHeartbeat(agentDir, agentName);

  // Start cron scheduler
  if (enableCron) {
    const roleConfig = ROLES[role];
    if (roleConfig) {
      startCronScheduler(roleConfig.cron, cronDir, agentDir, env);
    } else {
      log(`WARNING: No role config found for '${role}', cron disabled`);
    }
  } else {
    log('Cron scheduling disabled (--no-cron)');
  }

  // Start Discord bot supervisor
  if (enableDiscord && env.DISCORD_TOKEN) {
    startBotSupervisor(agentDir, env);
  } else if (enableDiscord && !env.DISCORD_TOKEN) {
    log('Discord bot skipped (no DISCORD_TOKEN in env)');
  } else {
    log('Discord bot disabled (--no-discord)');
  }

  // Signal handlers
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  log('Daemon ready');

  // Send IPC ready message to parent if we were forked
  if (process.send) {
    process.send({ type: 'ready', pid: process.pid });
  }
}

function log(msg: string): void {
  const ts = new Date().toISOString();
  console.log(`[${ts}] [daemon] ${msg}`);
}

function writeAgentEnv(env: Record<string, string>): void {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(env)) {
    // Exclude secrets from env file (mirrors Docker entrypoint)
    if (/PASSWORD|SECRET|PRIVATE_KEY/i.test(key)) continue;
    if (/^(OPENCLAW_|LOBSTR_|AGENT_|WORKSPACE_|PATH$)/.test(key)) {
      lines.push(`${key}=${value}`);
    }
  }
  try {
    fs.writeFileSync('/tmp/agent-env', lines.join('\n') + '\n');
    log('Wrote /tmp/agent-env');
  } catch {
    log('WARNING: Could not write /tmp/agent-env (non-fatal)');
  }
}

function preprocessCronScripts(agentDir: string, config: DaemonConfig): string {
  const dotDir = pidDir(agentDir);
  const cronDir = path.join(dotDir, 'cron');
  fs.mkdirSync(cronDir, { recursive: true });

  // Find template cron scripts — check both src/templates and dist/templates
  const templateCronDir = resolveTemplateDir('cron');
  const templateScriptsDir = resolveTemplateDir('scripts');

  if (!templateCronDir) {
    log('WARNING: Template cron directory not found — cron scripts will use originals');
    return cronDir;
  }

  // Also copy shared scripts to .lobstrclaw/scripts/
  const localScriptsDir = path.join(dotDir, 'scripts');
  fs.mkdirSync(localScriptsDir, { recursive: true });

  if (templateScriptsDir) {
    for (const file of fs.readdirSync(templateScriptsDir)) {
      if (!file.endsWith('.sh')) continue;
      const src = fs.readFileSync(path.join(templateScriptsDir, file), 'utf-8');
      const dest = path.join(localScriptsDir, file);
      fs.writeFileSync(dest, src, { mode: 0o755 });
    }
    log(`Copied shared scripts to ${localScriptsDir}`);
  }

  // Workspace directory — use OpenClaw workspace if available, else agent dir
  let workspaceDir = agentDir;
  try {
    const { getWorkspacePath } = require('openclaw');
    const wsPath = getWorkspacePath(config.agentName);
    if (fs.existsSync(path.join(wsPath, 'config.json'))) {
      workspaceDir = wsPath;
    }
  } catch {
    // openclaw not available
  }

  const logsDir = path.join(dotDir, 'logs');

  // Copy and rewrite each cron script
  for (const file of fs.readdirSync(templateCronDir)) {
    if (!file.endsWith('.sh')) continue;
    let content = fs.readFileSync(path.join(templateCronDir, file), 'utf-8');

    // Rewrite Docker paths to local equivalents
    content = content.replace(/\/opt\/scripts\//g, localScriptsDir + '/');
    content = content.replace(/\/opt\/cron\//g, cronDir + '/');
    content = content.replace(/\/var\/log\/agent\//g, logsDir + '/');
    content = content.replace(/\/data\/workspace/g, workspaceDir);

    const dest = path.join(cronDir, file);
    fs.writeFileSync(dest, content, { mode: 0o755 });
  }

  log(`Preprocessed cron scripts in ${cronDir}`);
  return cronDir;
}

function resolveTemplateDir(subdir: string): string | null {
  // Try dist/templates first (built), then src/templates (dev)
  const candidates = [
    path.resolve(__dirname, '..', 'templates', subdir),
    path.resolve(__dirname, '..', '..', 'templates', subdir),
    path.resolve(__dirname, '..', '..', 'src', 'templates', subdir),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir;
  }
  return null;
}

function startHeartbeat(agentDir: string, agentName: string): void {
  const dotDir = pidDir(agentDir);
  const heartbeatFile = path.join(dotDir, 'heartbeats.jsonl');

  // Also try to write to workspace heartbeats.jsonl for status command compatibility
  let workspaceHeartbeat: string | null = null;
  try {
    const { getWorkspacePath } = require('openclaw');
    const wsPath = getWorkspacePath(agentName);
    if (fs.existsSync(path.join(wsPath, 'config.json'))) {
      workspaceHeartbeat = path.join(wsPath, 'heartbeats.jsonl');
    }
  } catch {
    // openclaw not available
  }

  const beat = () => {
    const entry = JSON.stringify({
      timestamp: Math.floor(Date.now() / 1000),
      agent: agentName,
      status: 'alive',
      pid: process.pid,
    });
    try {
      fs.appendFileSync(heartbeatFile, entry + '\n');
      if (workspaceHeartbeat) {
        fs.appendFileSync(workspaceHeartbeat, entry + '\n');
      }
    } catch (err) {
      log(`Heartbeat write error: ${err}`);
    }
  };

  // Immediate first beat
  beat();
  heartbeatTimer = setInterval(beat, HEARTBEAT_INTERVAL_MS);
  log(`Heartbeat started (every ${HEARTBEAT_INTERVAL_MS / 1000}s)`);
}

function startCronScheduler(
  cronJobs: CronInterval[],
  cronDir: string,
  agentDir: string,
  env: Record<string, string>,
): void {
  const logsDir = path.join(pidDir(agentDir), 'logs');

  for (const job of cronJobs) {
    const scriptPath = path.join(cronDir, job.script);

    if (!fs.existsSync(scriptPath)) {
      log(`WARNING: Cron script not found: ${scriptPath} — skipping ${job.description}`);
      continue;
    }

    const task = cron.schedule(job.expression, () => {
      if (shuttingDown) return;

      const logPath = path.join(logsDir, `${path.basename(job.script, '.sh')}.log`);
      const logFd = fs.openSync(logPath, 'a');

      const ts = new Date().toISOString();
      fs.writeSync(logFd, `\n--- [${ts}] Running ${job.script} ---\n`);

      const child = spawn('bash', [scriptPath], {
        cwd: agentDir,
        env: { ...process.env, ...env },
        stdio: ['ignore', logFd, logFd],
      });

      child.on('error', (err) => {
        log(`Cron ${job.script} spawn error: ${err.message}`);
        try { fs.closeSync(logFd); } catch { /* noop */ }
      });

      child.on('close', (code) => {
        if (code !== 0) {
          log(`Cron ${job.script} exited with code ${code}`);
        }
        try { fs.closeSync(logFd); } catch { /* noop */ }
      });
    });

    cronTasks.push(task);
    log(`Scheduled: ${job.script} [${job.expression}] (${job.priority}) — ${job.description}`);
  }

  log(`${cronTasks.length} cron jobs scheduled`);
}

function startBotSupervisor(agentDir: string, env: Record<string, string>): void {
  const logsDir = path.join(pidDir(agentDir), 'logs');
  const botLogPath = path.join(logsDir, 'discord-bot.log');

  const launchBot = () => {
    if (shuttingDown) return;

    const botScript = path.join(agentDir, 'bot.mjs');
    if (!fs.existsSync(botScript)) {
      log('Discord bot script (bot.mjs) not found — skipping');
      return;
    }

    log(`Starting Discord bot (attempt ${botFailures + 1}/${MAX_BOT_FAILURES + 1})`);

    const botLogFd = fs.openSync(botLogPath, 'a');

    botProcess = spawn('node', [botScript], {
      cwd: agentDir,
      env: { ...process.env, ...env },
      stdio: ['ignore', botLogFd, botLogFd],
    });

    botProcess.on('error', (err) => {
      log(`Discord bot spawn error: ${err.message}`);
      try { fs.closeSync(botLogFd); } catch { /* noop */ }
    });

    botProcess.on('close', (code) => {
      try { fs.closeSync(botLogFd); } catch { /* noop */ }
      botProcess = null;

      if (shuttingDown) return;

      botFailures++;
      if (botFailures > MAX_BOT_FAILURES) {
        log(`Discord bot exceeded max failures (${MAX_BOT_FAILURES}) — giving up`);
        return;
      }

      log(`Discord bot exited (code ${code}), restarting in 5s...`);
      setTimeout(launchBot, 5000);
    });
  };

  launchBot();
}

function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;

  log(`Received ${signal}, shutting down...`);

  // Stop heartbeat
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }

  // Stop cron tasks
  for (const task of cronTasks) {
    task.stop();
  }
  cronTasks = [];

  // Kill bot process
  if (botProcess) {
    try {
      botProcess.kill('SIGTERM');
    } catch {
      // Already dead
    }
    botProcess = null;
  }

  // Remove PID file — derive agentDir from PID file location
  // The PID file was written by the caller, we just need to find it
  // Since we can't easily recover agentDir here, we rely on the stop command
  // to clean it up, or use process.env
  const agentDir = process.env.__LOBSTRCLAW_AGENT_DIR;
  if (agentDir) {
    removePid(agentDir);
  }

  log('Shutdown complete');
  process.exit(0);
}
