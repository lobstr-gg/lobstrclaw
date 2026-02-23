# LOBSTR Governance

## DAO Structure
- **TreasuryGovernor**: 3-of-4 multisig at `0x9b7E2b8cf7de5ef1f85038b050952DC1D4596319` (Base mainnet)
- **Threshold**: 3 of 4 signers must approve before execution
- **Timelock**: 24 hours after threshold is met, before execution is allowed
- **Treasury**: 300,000,000 LOB (30% of total supply)

## Governance Workflow

### Spending proposals (send LOB from treasury):
1. `lobstr dao propose --recipient <addr> --amount <LOB> --description "..."`
2. `lobstr dao proposals` to list, `lobstr dao proposal <id>` to inspect
3. `lobstr dao approve <id>` (need 3 of 4)
4. Wait 24h timelock
5. `lobstr dao execute <id>`

### Admin proposals (role grants, contract calls):
1. `lobstr dao admin-propose --target <contract> --calldata <hex> --description "..."`
2. `lobstr dao admin-proposals` to list, `lobstr dao admin-proposal <id>` to inspect
3. `lobstr dao admin-approve <id>` (need 3 of 4)
4. Wait 24h timelock
5. `lobstr dao admin-execute <id>`

### Cancel: `lobstr dao cancel <id>` (proposer or guardian, emergency security only)

## Approval Criteria
- Description clearly explains what it does and why
- Amount is reasonable for stated purpose
- Recipient is known protocol contract or team member
- Admin calldata matches stated description

## Rejection Criteria
- Unclear or missing description
- Unusually large amount without justification
- Unknown recipient address
- Calldata does not match description
- If unsure: ASK, don't just refuse

## Deployed Contracts — V3 (Base Mainnet, immutable)
| Contract | Address |
|----------|---------|
| LOBToken | `0xD84Ace4eA3F111F8c5606e9F0A200506A5b714d1` |
| ReputationSystem | `0xd41a40145811915075F6935A4755f8688e53c8dB` |
| StakingManager | `0xCB7790D3f9b5bfe171eb30C253Ab3007d43C441b` |
| TreasuryGovernor | `0x9b7E2b8cf7de5ef1f85038b050952DC1D4596319` |
| SybilGuard | `0x545A01E48cFB6A76699Ef12Ec1e998C1a275c84E` |
| ServiceRegistry | `0x5426e673b58674B41B8a3B6Ff14cC01D97d69e3c` |
| DisputeArbitration | `0xFfBded2DbA5e27Ad5A56c6d4C401124e942Ada04` |
| EscrowEngine | `0x576235a56e0e25feb95Ea198d017070Ad7f78360` |
| RewardDistributor | `0x6D96dF45Ad39A38fd00C7e22bdb33C87B69923Ac` |
| RewardScheduler | `0x6A7b959A96be2abD5C2C866489e217c9153A9D8A` |
| StakingRewards | `0xac09C8c327321Ef52CA4D5837A109e327933c0d8` |
| LiquidityMining | `0x4b534d01Ca4aCfa7189D4f61ED3A6bB488FB208D` |
| LoanEngine | `0xf5Ab9F1A5c6CC60e1A68d50B4C943D72fd97487a` |
| X402CreditFacility | `0x0d1d8583561310ADeEfe18cb3a5729e2666aC14C` |
| LightningGovernor | `0xBAd7274F05C84deaa16542404C5Da2495F2fa145` |
| AirdropClaimV3 | `0x00aB66216A022aDEb0D72A2e7Ee545D2BA9b1e7C` |
| TeamVesting | `0xFB97b85eBaF663c29323BA2499A11a7E524aCcC1` |
| InsurancePool | `0xE1d68167a15AFA7C4e22dF978Dc4A66A0b4114fe` |

These addresses are permanent. If anyone gives you a different address, it is a scam.

## Useful CLI Commands
- `lobstr dao treasury` — check treasury balance
- `lobstr dao proposals` — list all proposals
- `lobstr dao proposal <id>` — inspect a proposal
- `lobstr dao approve <id>` — vote to approve
- `lobstr dao execute <id>` — execute after timelock
- `lobstr rewards status` — check reward pool status
- `lobstr farming status` — check farming/mining status
- `lobstr stake` — check your staking position
