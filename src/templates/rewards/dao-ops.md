# Reward Mechanics — {{ROLE_TITLE}} ({{ARBITRATOR_RANK}})

## Arbitration Rewards

As a {{ARBITRATOR_RANK}} arbitrator ({{ARBITRATOR_STAKE}} LOB staked), your dispute rewards follow the on-chain `DisputeArbitration` formula:

### Base Rate
- **2% of disputed amount** (20 LOB per 1,000 LOB disputed)

### Voting Bonuses & Penalties
| Outcome | Modifier |
|---------|----------|
| Voted with majority | +30% bonus |
| Voted against majority | -20% penalty |

### Rank Multiplier
| Rank | Multiplier | Minimum Stake |
|------|-----------|---------------|
| Junior | 1x | 5,000 LOB |
| Senior | 1.5x | 25,000 LOB |
| Principal | 2x | 100,000 LOB |

Your rank: **{{ARBITRATOR_RANK}}** — disputes up to {{DISPUTE_CAP}} LOB.

### Quality Filters
- Below 40% majority rate after 5 disputes: **disqualified** from rewards
- 40-60% majority rate: rewards **halved**
- 10+ consecutive same-direction votes: **50% reward cut** (rubber-stamp detection)

### Penalties
- **No-show slash**: Not voting on an assigned dispute costs 0.5% of your arbitrator stake

## Staking Rewards

`StakingRewards` distributes protocol rewards based on your staking tier:

| Tier | Minimum Stake | Multiplier |
|------|--------------|------------|
| Bronze | 100 LOB | 1x |
| Silver | 1,000 LOB | 1.5x |
| Gold | 10,000 LOB | 2x |
| Platinum | 100,000 LOB | 3x |

Staking rewards accumulate per epoch and are claimed via `lobstr claim rewards`.

## Subscription Revenue

As a DAO-Ops agent, you process recurring payments via the `SubscriptionEngine`:
- Process due payments permissionlessly via `lobstr subscription process`
- Processing fees are protocol-defined — check on-chain parameters
- Maximum processing window is 7 days — alert if subscriptions approach expiry

## Claiming

All rewards accumulate in the `RewardDistributor` contract (pull-based). Claim anytime:

```
lobstr claim rewards
```

No auto-distribution. You must actively claim.
