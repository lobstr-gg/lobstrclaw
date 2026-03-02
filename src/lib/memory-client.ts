// ═══════════════════════════════════════════════════════════════════
// Memory Client — HTTP wrapper for the LOBSTR Agent Memory API
// ═══════════════════════════════════════════════════════════════════

export interface MemoryClientConfig {
  baseUrl: string;
  apiKey: string;
  agentName: string;
}

export interface Proposal {
  id: string;
  proposer: string;
  tool: string;
  args: string | null;
  context: string | null;
  status: string;
  votes: Record<string, string>;
  discord_msg: string | null;
  created_at: string;
  resolved_at: string | null;
}

export interface TxExecution {
  id: number;
  proposal_id: string;
  tx_hash: string | null;
  chain_id: number;
  target: string;
  function_sig: string | null;
  args: string | null;
  value: string;
  status: string;
  gas_used: number | null;
  block_number: number | null;
  error: string | null;
  verified: boolean;
  verification_data: unknown;
  created_at: string;
  confirmed_at: string | null;
}

function getConfig(): MemoryClientConfig {
  const baseUrl = process.env.LOBSTR_MEMORY_URL;
  const apiKey = process.env.AGENT_API_KEY;
  const agentName = process.env.AGENT_NAME;

  if (!baseUrl) throw new Error('LOBSTR_MEMORY_URL not set');
  if (!apiKey) throw new Error('AGENT_API_KEY not set');
  if (!agentName) throw new Error('AGENT_NAME not set');

  return { baseUrl: baseUrl.replace(/\/$/, ''), apiKey, agentName };
}

// ── Retry configuration ─────────────────────────────────────────

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;
const RETRYABLE_STATUS_CODES = new Set([502, 503, 504, 429]);

function isRetryable(err: unknown): boolean {
  if (err instanceof Error) {
    const msg = err.message;
    // Network errors
    if (/ECONNRESET|ECONNREFUSED|ETIMEDOUT|EPIPE|fetch failed/i.test(msg)) return true;
    // HTTP status codes we retry
    for (const code of RETRYABLE_STATUS_CODES) {
      if (msg.includes(`(${code})`)) return true;
    }
  }
  return false;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  config?: MemoryClientConfig,
): Promise<T> {
  const cfg = config ?? getConfig();
  const url = `${cfg.baseUrl}${path}`;

  const headers: Record<string, string> = {
    'Authorization': `Bearer ${cfg.apiKey}`,
    'Content-Type': 'application/json',
    'X-Agent-Name': cfg.agentName,
  };

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => res.statusText);
        const err = new Error(`Memory API ${method} ${path} failed (${res.status}): ${text}`);

        // Retry on transient server errors
        if (RETRYABLE_STATUS_CODES.has(res.status) && attempt < MAX_RETRIES) {
          lastError = err;
          const delay = BASE_DELAY_MS * Math.pow(2, attempt);
          console.error(`[memory-client] ${method} ${path} returned ${res.status}, retrying in ${delay}ms (${attempt + 1}/${MAX_RETRIES})`);
          await sleep(delay);
          continue;
        }

        throw err;
      }

      return res.json() as Promise<T>;
    } catch (err: unknown) {
      lastError = err instanceof Error ? err : new Error(String(err));

      // Retry on network errors
      if (attempt < MAX_RETRIES && isRetryable(err)) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt);
        console.error(`[memory-client] ${method} ${path} failed (${lastError.message.slice(0, 100)}), retrying in ${delay}ms (${attempt + 1}/${MAX_RETRIES})`);
        await sleep(delay);
        continue;
      }

      throw lastError;
    }
  }

  throw lastError || new Error(`Memory API ${method} ${path} failed after ${MAX_RETRIES} retries`);
}

// ── Proposal CRUD ────────────────────────────────────────────────

export async function createProposal(
  tool: string,
  args: string | null,
  context: string | null,
  discordMsg: string | null,
  config?: MemoryClientConfig,
): Promise<{ id: string; created_at: string }> {
  return request('POST', '/proposals', {
    tool,
    args,
    context,
    discord_msg: discordMsg,
  }, config);
}

export async function voteOnProposal(
  id: string,
  vote: 'approve' | 'deny',
  config?: MemoryClientConfig,
): Promise<{ id: string; votes: Record<string, string>; status: string }> {
  return request('PATCH', `/proposals/${encodeURIComponent(id)}/vote`, { vote }, config);
}

export async function getProposal(
  id: string,
  config?: MemoryClientConfig,
): Promise<Proposal> {
  return request('GET', `/proposals/${encodeURIComponent(id)}`, undefined, config);
}

export async function listProposals(
  status?: string,
  config?: MemoryClientConfig,
): Promise<Proposal[]> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : '';
  return request('GET', `/proposals${qs}`, undefined, config);
}

export async function updateProposalStatus(
  id: string,
  status: string,
  config?: MemoryClientConfig,
): Promise<{ id: string; status: string }> {
  return request('PATCH', `/proposals/${encodeURIComponent(id)}/status`, { status }, config);
}

// ── Transaction Execution Records ────────────────────────────────

export async function recordExecution(
  proposalId: string,
  data: {
    tx_hash?: string;
    chain_id: number;
    target: string;
    function_sig?: string;
    args?: string;
    value?: string;
    status: string;
    gas_used?: number;
    block_number?: number;
    error?: string;
  },
  config?: MemoryClientConfig,
): Promise<TxExecution> {
  return request('POST', '/executions', {
    proposal_id: proposalId,
    ...data,
  }, config);
}

export async function getExecution(
  proposalId: string,
  config?: MemoryClientConfig,
): Promise<TxExecution | null> {
  return request('GET', `/executions/${encodeURIComponent(proposalId)}`, undefined, config);
}
