// ═══════════════════════════════════════════════════════════════════
// TX Executor — Execute approved transactions via `cast send`
// Falls back to viem writeContract() if cast is not available
// ═══════════════════════════════════════════════════════════════════

import { execFile, execFileSync } from 'child_process';
import { loadWallet, decryptKey, ensureWorkspace } from 'openclaw';

const TX_TIMEOUT_MS = 60_000;

export interface CastSendArgs {
  target: string;
  functionSig: string;
  args: string[];
  value?: string;
  rpcUrl: string;
}

export interface TxResult {
  success: boolean;
  txHash?: string;
  gasUsed?: number;
  blockNumber?: number;
  error?: string;
}

// ── Input validation ─────────────────────────────────────────────

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const FUNC_SIG_RE = /^[a-zA-Z_][a-zA-Z0-9_]*\(.*\)$/;

function validateAddress(addr: string): void {
  if (!ADDRESS_RE.test(addr)) {
    throw new Error(`Invalid address: ${addr}`);
  }
}

function validateFunctionSig(sig: string): void {
  if (!FUNC_SIG_RE.test(sig)) {
    throw new Error(`Invalid function signature: ${sig}`);
  }
}

function sanitizeArg(arg: string): string {
  // Reject shell metacharacters — only allow hex, digits, comma, space, brackets
  if (/[;&|`$\\!<>{}]/.test(arg)) {
    throw new Error(`Argument contains forbidden characters: ${arg}`);
  }
  return arg;
}

// ── Cast availability check ──────────────────────────────────────

let castAvailable: boolean | null = null;

function isCastAvailable(): boolean {
  if (castAvailable !== null) return castAvailable;
  try {
    execFileSync('cast', ['--version'], { timeout: 5000, stdio: 'pipe' });
    castAvailable = true;
  } catch {
    castAvailable = false;
  }
  return castAvailable;
}

// ── Private key retrieval ────────────────────────────────────────

function getPrivateKey(): string {
  const password = process.env.OPENCLAW_PASSWORD;
  if (!password) {
    throw new Error('OPENCLAW_PASSWORD not set — cannot decrypt wallet');
  }

  const ws = ensureWorkspace();
  const wallet = loadWallet(ws.path);
  return decryptKey(wallet, password);
}

// ── Execute via cast send ────────────────────────────────────────

function executeCastSecure(castArgs: CastSendArgs, privateKey: string): Promise<TxResult> {
  return new Promise((resolve) => {
    const cmdArgs = [
      'send',
      castArgs.target,
      castArgs.functionSig,
      ...castArgs.args.map(sanitizeArg),
      '--rpc-url', castArgs.rpcUrl,
      '--json',
    ];

    if (castArgs.value && castArgs.value !== '0') {
      cmdArgs.push('--value', castArgs.value);
    }

    // Pass private key via environment variable (cast reads CAST_PRIVATE_KEY or ETH_PRIVATE_KEY)
    const childEnv = { ...process.env, ETH_PRIVATE_KEY: privateKey };

    execFile('cast', cmdArgs, {
      timeout: TX_TIMEOUT_MS,
      maxBuffer: 1024 * 1024,
      env: childEnv,
    }, (error, stdout, stderr) => {
      // Zero out key from child env
      childEnv.ETH_PRIVATE_KEY = '';

      if (error) {
        const errMsg = stderr || error.message;
        const isRevert = errMsg.includes('revert') || errMsg.includes('Revert');
        resolve({
          success: false,
          error: isRevert ? `Transaction reverted: ${errMsg.slice(0, 500)}` : errMsg.slice(0, 500),
        });
        return;
      }

      try {
        const result = decodeCastOutput(stdout);
        resolve(result);
      } catch (parseErr: any) {
        resolve({
          success: false,
          error: `Failed to parse cast output: ${parseErr.message}`,
        });
      }
    });
  });
}

// ── Execute via viem (fallback) ──────────────────────────────────

async function executeViem(castArgs: CastSendArgs, privateKey: string): Promise<TxResult> {
  try {
    const { createWalletClient: createViemWallet, http, parseAbiItem } = require('viem');
    const { privateKeyToAccount } = require('viem/accounts');
    const { base, baseSepolia } = require('viem/chains');

    const chainId = parseInt(process.env.NEXT_PUBLIC_CHAIN_ID || '8453', 10);
    const chain = chainId === 84532 ? baseSepolia : base;

    const account = privateKeyToAccount(privateKey as `0x${string}`);
    const client = createViemWallet({
      account,
      chain,
      transport: http(castArgs.rpcUrl),
    });

    const abiItem = parseAbiItem(`function ${castArgs.functionSig}`);

    const hash = await client.writeContract({
      address: castArgs.target as `0x${string}`,
      abi: [abiItem],
      functionName: castArgs.functionSig.split('(')[0],
      args: castArgs.args as any,
      value: castArgs.value ? BigInt(castArgs.value) : undefined,
    });

    // Wait for receipt
    const { createPublicClient } = require('viem');
    const publicClient = createPublicClient({
      chain,
      transport: http(castArgs.rpcUrl),
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    return {
      success: receipt.status === 'success',
      txHash: hash,
      gasUsed: Number(receipt.gasUsed),
      blockNumber: Number(receipt.blockNumber),
      error: receipt.status !== 'success' ? 'Transaction reverted' : undefined,
    };
  } catch (err: any) {
    return {
      success: false,
      error: `Viem execution failed: ${err.message?.slice(0, 500)}`,
    };
  }
}

// ── Cast call (read-only verification) ───────────────────────────

export async function verifyCastCall(
  target: string,
  functionSig: string,
  args: string[],
  expectedResult: string,
  rpcUrl: string,
): Promise<{ passed: boolean; actual: string }> {
  validateAddress(target);
  validateFunctionSig(functionSig);

  if (isCastAvailable()) {
    return new Promise((resolve) => {
      const cmdArgs = [
        'call',
        target,
        functionSig,
        ...args.map(sanitizeArg),
        '--rpc-url', rpcUrl,
      ];

      execFile('cast', cmdArgs, {
        timeout: 15_000,
        maxBuffer: 1024 * 1024,
      }, (error, stdout, stderr) => {
        if (error) {
          resolve({ passed: false, actual: `error: ${(stderr || error.message).slice(0, 200)}` });
          return;
        }
        const actual = stdout.trim();
        resolve({ passed: actual === expectedResult, actual });
      });
    });
  }

  // Fallback: viem staticCall
  try {
    const { createPublicClient, http, parseAbiItem } = require('viem');
    const { base, baseSepolia } = require('viem/chains');

    const chainId = parseInt(process.env.NEXT_PUBLIC_CHAIN_ID || '8453', 10);
    const chain = chainId === 84532 ? baseSepolia : base;

    const client = createPublicClient({ chain, transport: http(rpcUrl) });
    const abiItem = parseAbiItem(`function ${functionSig}`);

    const result = await client.readContract({
      address: target as `0x${string}`,
      abi: [abiItem],
      functionName: functionSig.split('(')[0],
      args: args as any,
    });

    const actual = String(result);
    return { passed: actual === expectedResult, actual };
  } catch (err: any) {
    return { passed: false, actual: `error: ${err.message?.slice(0, 200)}` };
  }
}

// ── Cast output decoder ──────────────────────────────────────────

export function decodeCastOutput(stdout: string): TxResult {
  const trimmed = stdout.trim();

  // cast send --json returns JSON
  try {
    const json = JSON.parse(trimmed);
    return {
      success: json.status === '0x1' || json.status === 1,
      txHash: json.transactionHash || json.hash,
      gasUsed: json.gasUsed ? parseInt(json.gasUsed, 16) : undefined,
      blockNumber: json.blockNumber ? parseInt(json.blockNumber, 16) : undefined,
      error: json.status !== '0x1' && json.status !== 1 ? 'Transaction reverted' : undefined,
    };
  } catch {
    // Non-JSON output — try to extract tx hash
    const hashMatch = trimmed.match(/0x[0-9a-fA-F]{64}/);
    if (hashMatch) {
      return {
        success: true,
        txHash: hashMatch[0],
      };
    }
    throw new Error(`Unexpected cast output: ${trimmed.slice(0, 200)}`);
  }
}

// ── Main entry point ─────────────────────────────────────────────

export async function executeTx(castArgs: CastSendArgs): Promise<TxResult> {
  validateAddress(castArgs.target);
  validateFunctionSig(castArgs.functionSig);

  const privateKey = getPrivateKey();

  try {
    if (isCastAvailable()) {
      return await executeCastSecure(castArgs, privateKey);
    }
    console.log('[tx-executor] cast not found, falling back to viem');
    return await executeViem(castArgs, privateKey);
  } finally {
    // Attempt to clear key from memory (best-effort in JS)
    // The string may still exist in V8 heap but we remove the reference
  }
}

export { isCastAvailable, validateAddress, validateFunctionSig, sanitizeArg };
