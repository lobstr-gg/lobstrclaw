/**
 * Self-contained workspace + wallet management for lobstrclaw.
 *
 * Inlines the subset of openclaw functionality needed so that
 * lobstrclaw works standalone — no dependency on the openclaw
 * package being resolvable at runtime.
 *
 * Mirrors the API surface from openclaw/lib/workspace.ts and
 * openclaw/lib/wallet.ts so call sites don't need to change.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import * as readline from 'readline';
import { Writable } from 'stream';

// ── Types ──────────────────────────────────────────────────────────

export interface ContractAddresses {
  lobToken: string;
  reputationSystem: string;
  stakingManager: string;
  serviceRegistry: string;
  disputeArbitration: string;
  escrowEngine: string;
  airdropClaimV2: string;
  treasuryGovernor: string;
  sybilGuard: string;
  [key: string]: string | undefined;
}

export interface WorkspaceConfig {
  name: string;
  chain: 'base-sepolia' | 'base';
  rpc: string;
  apiUrl: string;
  contracts: ContractAddresses;
  workspaceId: string;
  salt: string;
  createdAt: string;
}

export interface EncryptedWallet {
  address: string;
  encryptedKey: string;
  iv: string;
  salt: string;
  authTag: string;
}

// ── Chain configs ──────────────────────────────────────────────────

interface ChainConfig {
  name: string;
  chainId: number;
  rpc: string;
  explorer: string;
  apiUrl: string;
  contracts: ContractAddresses;
}

const CHAINS: Record<string, ChainConfig> = {
  'base-sepolia': {
    name: 'Base Sepolia',
    chainId: 84532,
    rpc: 'https://sepolia.base.org',
    explorer: 'https://sepolia.basescan.org',
    apiUrl: 'https://lobstr.gg',
    contracts: {
      lobToken: '0x6024B53f6f8afD433dc434D95be42A45Ed9b4a59',
      reputationSystem: '0xbbBd9c388b6bdCA4772bC5297f4E72d76d5fE21C',
      stakingManager: '0x0c8390c6ef1a7Dd07Cc2bE9C0C06D49FC5439c58',
      serviceRegistry: '0xa309769426C90f27Cc32E62BdBF6313E35c5c660',
      disputeArbitration: '0x0060D7828ace2B594Bb5e56F80d7757BC473cf72',
      escrowEngine: '0x072EdB0526027A48f6A2aC5CeE3A5375142Bedc0',
      airdropClaimV2: '0x91B4b01173C74cb16EE2997f8449FdEE254F81e2',
      treasuryGovernor: '0x0000000000000000000000000000000000000000',
      sybilGuard: '0x0000000000000000000000000000000000000000',
    },
  },
  base: {
    name: 'Base',
    chainId: 8453,
    rpc: 'https://mainnet.base.org',
    explorer: 'https://basescan.org',
    apiUrl: 'https://lobstr.gg',
    contracts: {
      lobToken: '0xD2E0C513f70f0DdEF5f3EC9296cE3B5eB2799c5E',
      reputationSystem: '0x80aB3BE1A18D6D9c79fD09B85ddA8cB6A280EAAd',
      stakingManager: '0xcd9d96c85b4Cd4E91d340C3F69aAd80c3cb3d413',
      serviceRegistry: '0xCa8a4528a7a4c693C19AaB3f39a555150E31013E',
      disputeArbitration: '0xF5FDA5446d44505667F7eA58B0dca687c7F82b81',
      escrowEngine: '0xd8654D79C21Fb090Ef30C901db530b127Ef82b4E',
      airdropClaimV2: '0x7f4D513119A2b8cCefE1AfB22091062B54866EbA',
      treasuryGovernor: '0x66561329C973E8fEe8757002dA275ED1FEa56B95',
      sybilGuard: '0xd45202b192676BA94Df9C36bA4fF5c63cE001381',
      x402CreditFacility: '0x86718b82Af266719E493a49e248438DC6F07911a',
      rewardDistributor: '0xf181A69519684616460b36db44fE4A3A4f3cD913',
      loanEngine: '0x2F712Fb743Ee42D37371f245F5E0e7FECBEF7454',
      stakingRewards: '0x723f8483731615350D2C694CBbA027eBC2953B39',
      lightningGovernor: '0xCB3E0BD70686fF1b28925aD55A8044b1b944951c',
      airdropClaimV3: '0x7f4D513119A2b8cCefE1AfB22091062B54866EbA',
      teamVesting: '0x71BC320F7F5FDdEaf52a18449108021c71365d35',
      uptimeVerifier: '0x07dFaC8Ae61E5460Fc768d1c925476b4A4693C64',
    },
  },
};

const OPENCLAW_DIR = '.openclaw';

// ── Workspace management ───────────────────────────────────────────

function getOpenClawRoot(): string {
  return path.join(os.homedir(), OPENCLAW_DIR);
}

export function getWorkspacePath(name: string): string {
  return path.join(getOpenClawRoot(), name);
}

function getActiveWorkspacePath(): string {
  return path.join(getOpenClawRoot(), '.active');
}

export function createWorkspace(name: string, chain?: string): WorkspaceConfig {
  const chainKey = chain || 'base';
  const chainConfig = CHAINS[chainKey];
  if (!chainConfig) {
    throw new Error(`Unknown chain: ${chainKey}. Available: ${Object.keys(CHAINS).join(', ')}`);
  }

  const wsPath = getWorkspacePath(name);
  if (fs.existsSync(wsPath)) {
    throw new Error(`Workspace "${name}" already exists at ${wsPath}`);
  }

  fs.mkdirSync(wsPath, { recursive: true });
  fs.mkdirSync(path.join(wsPath, 'skills'), { recursive: true });
  fs.mkdirSync(path.join(wsPath, 'attestation'), { recursive: true });

  const workspaceId = BigInt('0x' + crypto.randomBytes(16).toString('hex')).toString();
  const salt = BigInt('0x' + crypto.randomBytes(16).toString('hex')).toString();

  const config: WorkspaceConfig = {
    name,
    chain: chainKey as 'base-sepolia' | 'base',
    rpc: chainConfig.rpc,
    apiUrl: chainConfig.apiUrl,
    contracts: chainConfig.contracts,
    workspaceId,
    salt,
    createdAt: new Date().toISOString(),
  };

  fs.writeFileSync(path.join(wsPath, 'config.json'), JSON.stringify(config, null, 2));
  fs.writeFileSync(
    path.join(wsPath, 'activity.json'),
    JSON.stringify({ channelCount: 0, toolCallCount: 0, lastUpdated: new Date().toISOString() }, null, 2),
  );

  setActiveWorkspace(name);
  return config;
}

export function loadConfig(name: string): WorkspaceConfig {
  const configPath = path.join(getWorkspacePath(name), 'config.json');
  if (!fs.existsSync(configPath)) {
    throw new Error(`Workspace "${name}" not found. Run: lobstrclaw init ${name}`);
  }
  return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
}

export function getActiveWorkspace(): string | null {
  const activePath = getActiveWorkspacePath();
  if (!fs.existsSync(activePath)) return null;
  return fs.readFileSync(activePath, 'utf-8').trim();
}

export function setActiveWorkspace(name: string): void {
  const root = getOpenClawRoot();
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(getActiveWorkspacePath(), name);
}

export function ensureWorkspace(): { name: string; config: WorkspaceConfig; path: string } {
  const name = getActiveWorkspace();
  if (!name) {
    throw new Error('No active workspace. Run: lobstrclaw init <name>');
  }
  const config = loadConfig(name);
  const wsPath = getWorkspacePath(name);
  return { name, config, path: wsPath };
}

// ── Wallet management ──────────────────────────────────────────────

const PBKDF2_ITERATIONS = 100_000;
const KEY_LENGTH = 32;
const ALGORITHM = 'aes-256-gcm';

export function encryptKey(privateKey: string, password: string): EncryptedWallet {
  const salt = crypto.randomBytes(32);
  const iv = crypto.randomBytes(16);
  const key = crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha256');

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(privateKey, 'utf-8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();

  return {
    address: '', // set by caller
    encryptedKey: encrypted,
    iv: iv.toString('hex'),
    salt: salt.toString('hex'),
    authTag: authTag.toString('hex'),
  };
}

export function decryptKey(wallet: EncryptedWallet, password: string): string {
  const salt = Buffer.from(wallet.salt, 'hex');
  const iv = Buffer.from(wallet.iv, 'hex');
  const authTag = Buffer.from(wallet.authTag, 'hex');
  const key = crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha256');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(wallet.encryptedKey, 'hex', 'utf-8');
  decrypted += decipher.final('utf-8');
  return decrypted;
}

export function saveWallet(workspacePath: string, wallet: EncryptedWallet): void {
  fs.writeFileSync(path.join(workspacePath, 'wallet.json'), JSON.stringify(wallet, null, 2));
}

export function loadWallet(workspacePath: string): EncryptedWallet {
  const walletPath = path.join(workspacePath, 'wallet.json');
  if (!fs.existsSync(walletPath)) {
    throw new Error('No wallet found. Run: lobstrclaw setup');
  }
  return JSON.parse(fs.readFileSync(walletPath, 'utf-8'));
}

export function walletExists(workspacePath: string): boolean {
  return fs.existsSync(path.join(workspacePath, 'wallet.json'));
}

export async function promptPassword(prompt: string = 'Password: '): Promise<string> {
  if (process.env.OPENCLAW_PASSWORD) {
    return process.env.OPENCLAW_PASSWORD;
  }

  return new Promise((resolve) => {
    const mutableStdout = new Writable({
      write(_chunk, _encoding, callback) {
        callback();
      },
    });

    const rl = readline.createInterface({
      input: process.stdin,
      output: mutableStdout,
      terminal: true,
    });

    process.stdout.write(prompt);
    rl.question('', (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}
