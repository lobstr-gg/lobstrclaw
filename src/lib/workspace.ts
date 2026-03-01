/**
 * Re-exports from openclaw — single source of truth for workspace + wallet management.
 *
 * lobstrclaw previously inlined 277 lines duplicated from openclaw.
 * Now that both packages live in the same pnpm monorepo and lobstrclaw
 * declares "openclaw": "workspace:*", we import directly to avoid
 * contract-address drift and duplicated bug fixes.
 */

// Types
export type { ContractAddresses, WorkspaceConfig, EncryptedWallet } from 'openclaw';

// Workspace management
export {
  getWorkspacePath,
  createWorkspace,
  loadConfig,
  getActiveWorkspace,
  setActiveWorkspace,
  ensureWorkspace,
} from 'openclaw';

// Wallet management
export {
  encryptKey,
  decryptKey,
  saveWallet,
  loadWallet,
  walletExists,
  promptPassword,
} from 'openclaw';
