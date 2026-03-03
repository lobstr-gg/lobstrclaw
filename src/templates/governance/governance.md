# LOBSTR Governance

## DAO Structure
- **TreasuryGovernor**: 3-of-4 multisig at `0x66561329C973E8fEe8757002dA275ED1FEa56B95` (Base mainnet)
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

## Deployed Contracts — V5 (Base Mainnet, block ~42732313, UUPS proxies)

### Core
| Contract | Address |
|----------|---------|
| LOBToken | `0xD2E0C513f70f0DdEF5f3EC9296cE3B5eB2799c5E` |
| Groth16VerifierV4 | `0x07dFaC8Ae61E5460Fc768d1c925476b4A4693C64` |

### Financial
| Contract | Address |
|----------|---------|
| EscrowEngine | `0xd8654D79C21Fb090Ef30C901db530b127Ef82b4E` |
| LoanEngine | `0x2F712Fb743Ee42D37371f245F5E0e7FECBEF7454` |
| X402CreditFacility | `0x86718b82Af266719E493a49e248438DC6F07911a` |
| ProductMarketplace | `0x8823cC5d252EdF868424C50796358413f3e4c076` |

### Governance
| Contract | Address |
|----------|---------|
| TreasuryGovernor | `0x66561329C973E8fEe8757002dA275ED1FEa56B95` |
| LightningGovernor | `0xCB3E0BD70686fF1b28925aD55A8044b1b944951c` |

### Staking & Rewards
| Contract | Address |
|----------|---------|
| StakingManager | `0xcd9d96c85b4Cd4E91d340C3F69aAd80c3cb3d413` |
| StakingRewards | `0x723f8483731615350D2C694CBbA027eBC2953B39` |
| RewardDistributor | `0xf181A69519684616460b36db44fE4A3A4f3cD913` |

### Identity & Reputation
| Contract | Address |
|----------|---------|
| SybilGuard | `0xd45202b192676BA94Df9C36bA4fF5c63cE001381` |
| ReputationSystem | `0x80aB3BE1A18D6D9c79fD09B85ddA8cB6A280EAAd` |
| ServiceRegistry | `0xCa8a4528a7a4c693C19AaB3f39a555150E31013E` |

### Disputes & Reviews
| Contract | Address |
|----------|---------|
| DisputeArbitration | `0xF5FDA5446d44505667F7eA58B0dca687c7F82b81` |

### Insurance
| Contract | Address |
|----------|---------|
| InsurancePool | `0x10555bd849769583755281Ea75e409268A055Ba6` |

### Distribution & Vesting
| Contract | Address |
|----------|---------|
| AirdropClaimV3 | `0x7f4D513119A2b8cCefE1AfB22091062B54866EbA` |
| TeamVesting | `0x71BC320F7F5FDdEaf52a18449108021c71365d35` |

### Not Yet Deployed
| Contract | Status |
|----------|--------|
| LiquidityMining | Deferred until DEX LP pool |
| RewardScheduler | Deferred until LiquidityMining |
| SkillRegistry | Deploy later |
| PipelineRouter | Deploy later |
| SubscriptionEngine | Deploy later |
| BondingEngine | Deploy later |
| MultiPartyEscrow | Deploy later |
| DirectiveBoard | Deploy later |
| ReviewRegistry | Deploy later |
| X402EscrowBridge | Superseded by X402CreditFacility |
| RolePayroll | Deploy later |

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
- `lobstr product list` — list your products
- `lobstr product view <id>` — view product details
- `lobstr product create` — create a product listing
- `lobstr product buy <id>` — buy a product
- `lobstr product ship <jobId>` — add shipping tracking
- `lobstrclaw audit full` — complete contract audit
- `lobstrclaw audit security` — security posture check
- `lobstrclaw doctor --deep` — full agent diagnostics
