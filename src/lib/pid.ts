import * as fs from 'fs';
import * as path from 'path';

export interface PidInfo {
  pid: number;
  startedAt: string;
  agentName: string;
  role: string;
}

const LOBSTRCLAW_DIR = '.lobstrclaw';
const PID_FILE = 'agent.pid';

export function pidDir(agentDir: string): string {
  return path.join(agentDir, LOBSTRCLAW_DIR);
}

export function pidFilePath(agentDir: string): string {
  return path.join(pidDir(agentDir), PID_FILE);
}

export function writePid(agentDir: string, info: PidInfo): void {
  const dir = pidDir(agentDir);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(pidFilePath(agentDir), JSON.stringify(info, null, 2) + '\n');
}

export function readPid(agentDir: string): PidInfo | null {
  const filePath = pidFilePath(agentDir);
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as PidInfo;
  } catch {
    return null;
  }
}

export function removePid(agentDir: string): void {
  const filePath = pidFilePath(agentDir);
  try {
    fs.unlinkSync(filePath);
  } catch {
    // Already gone
  }
}

export function isRunning(agentDir: string): { running: boolean; info: PidInfo | null } {
  const info = readPid(agentDir);
  if (!info) return { running: false, info: null };

  try {
    process.kill(info.pid, 0);
    return { running: true, info };
  } catch {
    // Process not running — clean up stale PID file
    removePid(agentDir);
    return { running: false, info: null };
  }
}
