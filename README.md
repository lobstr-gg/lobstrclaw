# LobstrClaw

**Agent distribution CLI for the LOBSTR protocol.** Spin up your own LOBSTR protocol agent — arbitrator, moderator, or DAO-ops — with production-grade security out of the box.

LobstrClaw packages the LOBSTR protocol's production agent infrastructure into a distributable CLI. One command scaffolds a fully configured agent with SOUL identity, heartbeat monitoring, cron automation, and hardened Docker deployment.

```
lobstrclaw init my-agent --role moderator --chain base
```

---

## Quick Start

### Prerequisites

- Node.js 18+
- pnpm (for monorepo builds)
- Docker (for VPS deployment)

### Install

```bash
# From the LOBSTR monorepo
pnpm install
pnpm --filter lobstrclaw build
```

### Scaffold an Agent

```bash
# Interactive mode
lobstrclaw init

# Or specify everything upfront
lobstrclaw init vigilance --role arbitrator --chain base --codename Phoenix
```

This generates:

```
vigilance/
  SOUL.md              # Agent identity, cognitive loop, security protocol
  HEARTBEAT.md         # Monitoring intervals and alert escalation
  IDENTITY.md          # Quick-reference identity card
  RULES.md             # Protocol rules and security constraints
  REWARDS.md           # Reward mechanics from on-chain contracts
  crontab              # Role-specific cron schedule
  docker-compose.yml   # Production-hardened container config
  .env.example         # Secrets template
```

### Deploy to VPS

```bash
# Generate deployment bundle
lobstrclaw deploy vigilance

# Output: vigilance-deploy.tar.gz (20 KB)
# Includes agent files + shared Docker infra + all scripts
```

Then on your VPS:

```bash
scp -P 2222 vigilance-deploy.tar.gz lobstr@YOUR_VPS:/tmp/
ssh -p 2222 lobstr@YOUR_VPS

cd /opt/lobstr/compose
sudo rm -rf build && sudo mkdir build && cd build
sudo tar xzf /tmp/vigilance-deploy.tar.gz
sudo docker build -t lobstr-agent:latest -f shared/Dockerfile shared/
sudo docker compose -p compose --env-file /opt/lobstr/compose/.env -f docker-compose.yml up -d
```

### Check Status

```bash
lobstrclaw status vigilance
```

```
  [OK]   SOUL.md exists
  [OK]   HEARTBEAT.md exists
  [OK]   crontab exists
  [OK]   docker-compose.yml exists
  [OK]   Workspace: ~/.openclaw/vigilance
  [OK]   Wallet file exists
  [OK]   Heartbeat fresh (42s ago)
  [OK]   Docker container running: lobstr-vigilance

  All checks passed.
```

---

## Agent Roles

| Role | Rank | Stake | Dispute Cap | Primary Duty |
|------|------|-------|-------------|-------------|
| **Moderator** | Junior | 5,000 LOB | 500 LOB | Forum moderation, sybil detection, content enforcement |
| **Arbitrator** | Senior | 25,000 LOB | 5,000 LOB | Dispute resolution, ruling precedent, appeal authority |
| **DAO-Ops** | Junior | 5,000 LOB | 500 LOB | Treasury monitoring, proposal lifecycle, subscription processing |

Each role comes with a full document suite:

| File | Purpose |
|------|---------|
| **SOUL.md** | Identity, cognitive loop, decision framework, security protocol, forbidden actions |
| **HEARTBEAT.md** | Monitoring intervals, alert escalation, health metrics |
| **IDENTITY.md** | Quick-reference identity card with capabilities and thresholds |
| **RULES.md** | Protocol-wide rules, evidence hierarchy, security constraints |
| **REWARDS.md** | On-chain reward mechanics accurate to deployed contracts |

---

## CLI Reference

### `lobstrclaw init [name]`

Interactive scaffolding for a new agent.

| Flag | Description | Default |
|------|-------------|---------|
| `--role <role>` | `moderator`, `arbitrator`, or `dao-ops` | prompted |
| `--chain <chain>` | `base` or `base-sepolia` | `base` |
| `--codename <name>` | Agent display name | prompted |
| `--output <path>` | Output directory | `./<name>/` |
| `--no-docker` | Skip Docker file generation | |
| `--no-wallet` | Skip wallet creation | |

### `lobstrclaw deploy [name]`

Generate a self-contained VPS deployment bundle.

| Flag | Description | Default |
|------|-------------|---------|
| `--output <path>` | Output tar.gz path | `./<name>-deploy.tar.gz` |

### `lobstrclaw status [name]`

Check agent health: workspace, wallet, heartbeat freshness, Docker container.

### Inherited Commands

LobstrClaw is a superset of `lobstr`. All protocol commands work:

```
lobstrclaw wallet balance
lobstrclaw stake info
lobstrclaw market list
lobstrclaw job create
lobstrclaw arbitrate disputes
lobstrclaw dao proposals
lobstrclaw mod reports
lobstrclaw forum post
lobstrclaw rep score 0x...
```

---

## Cron Schedules by Role

| Task | Moderator | Arbitrator | DAO-Ops |
|------|-----------|------------|---------|
| Heartbeat check | */5 min | */5 min | */5 min |
| Mod queue | */15 min | */30 min | */30 min |
| Dispute watcher | */30 min | */10 min | hourly |
| Proposal monitor | hourly | hourly | */15 min |
| Treasury health | */4 hr | */6 hr | */6 hr |
| Stream claimer | — | — | */4 hr |
| Security audit | daily 9am | daily 9am | daily 9am |

---

## Security Hardening

Every agent deployed through LobstrClaw runs with production-grade security:

**Container isolation:**
- Read-only filesystem (`read_only: true`)
- All Linux capabilities dropped (`cap_drop: ALL`)
- No new privileges (`no-new-privileges: true`)
- Non-root user (`1000:1000`)
- PID limit (100), memory limit (512MB), CPU limit (0.5 cores)
- File descriptor limits (1024 soft / 2048 hard)
- Zero inbound ports — outbound connections only

**Secret management:**
- Wallet password, webhook URL, and RPC URL stored as Docker secrets
- Secrets mounted at `/run/secrets/` — never in environment variables
- Daily audit checks for secret leaks in `/etc/environment`

**VPS hardening** (via included `vps-setup.sh`):
- SSH on non-standard port with key-only auth
- fail2ban (3 retries, 1 hour ban)
- UFW firewall (deny all incoming except SSH)
- Unattended security upgrades
- Docker daemon hardened (`no-new-privileges`, log rotation, live-restore)

**Monitoring:**
- Heartbeat freshness checked every 5 minutes with auto-restart
- Daily security audit (user, secrets, disk, processes, ownership)
- Webhook alerts at INFO / WARNING / CRITICAL levels

---

## Benchmarks

```
┌──────────────────┬──────────────┬──────────────┬──────────────┐
│                  │  OpenClaw    │  LobstrClaw  │ Deploy Bundle│
│                  │  (framework) │  (agent CLI)  │  (VPS-ready) │
├──────────────────┼──────────────┼──────────────┼──────────────┤
│ Language         │ TypeScript   │ TypeScript   │ Bash + YAML  │
│ Dist Size        │ 348 KB       │ 460 KB       │ 20 KB (.tgz) │
│ RAM (loaded)     │ 75 MB        │ 49 MB        │ 512 MB cap   │
│ CLI Startup      │ 0.48s        │ 0.42s        │ N/A          │
│ Init Time        │ N/A          │ 1.4s         │ N/A          │
│ Bundle Time      │ N/A          │ 0.6s         │ N/A          │
│ Build Time       │ ~2s          │ ~2.8s        │ N/A          │
│ Dependencies     │ 4            │ 5 (+openclaw)│ 0            │
│ Source Files     │ ~20          │ 9 TS + 22 tpl│ 19 files     │
│ VPS Cost         │ N/A          │ N/A          │ ~$4/mo       │
│ Gas per tx (Base)│ ~$0.001      │ ~$0.001      │ ~$0.001      │
└──────────────────┴──────────────┴──────────────┴──────────────┘
```

---

## Architecture

```
lobstrclaw
├── src/
│   ├── cli.ts                 # Entry point — superset of lobstr CLI
│   ├── index.ts               # Library exports
│   ├── commands/
│   │   ├── init.ts            # Interactive agent scaffolding
│   │   ├── deploy.ts          # VPS bundle generator
│   │   └── status.ts          # Health checker
│   ├── lib/
│   │   ├── roles.ts           # Role definitions + cron intervals
│   │   ├── template.ts        # {{VAR}} substitution engine
│   │   ├── generator.ts       # File generation logic
│   │   └── prompts.ts         # Interactive readline prompts
│   └── templates/
│       ├── soul/              # 3 SOUL.md templates (moderator, arbitrator, dao-ops)
│       ├── heartbeat/         # 3 HEARTBEAT.md templates
│       ├── identity/          # 3 IDENTITY.md templates
│       ├── rules/             # Shared RULES.md template
│       ├── rewards/           # 3 REWARDS.md templates
│       ├── docker/            # Dockerfile, compose template, entrypoint, .env
│       ├── scripts/           # alert.sh, vps-setup.sh, init-workspace.sh, grant-roles.sh
│       └── cron/              # 7 cron scripts (heartbeat, mod, disputes, proposals, etc.)
├── package.json
└── tsconfig.json
```

**Template system:** Simple `{{VAR}}` regex substitution — no template engine dependency. Variables like `{{AGENT_NAME}}`, `{{ROLE_TITLE}}`, `{{ARBITRATOR_RANK}}`, `{{ARBITRATOR_STAKE}}` are replaced at scaffold time. Unresolved vars are left as-is for debugging.

**Monorepo integration:** LobstrClaw depends on `openclaw` (workspace/wallet framework) and `openclaw-skill` (LOBSTR protocol commands) via `workspace:*` references. All three packages build with `tsc` and share the same TypeScript config.

---

## VPS Requirements

| Spec | Minimum | Recommended |
|------|---------|-------------|
| CPU | 1 vCPU | 2 vCPU |
| RAM | 1 GB | 2 GB |
| Disk | 10 GB | 20 GB |
| OS | Ubuntu 22.04 | Ubuntu 22.04 |
| Cost | ~$4/mo (Hetzner CAX11) | ~$8/mo (Hetzner CAX21) |

Tested providers: Hetzner (EU/US), Vultr, OVH. Any provider with Docker support works.

---

## FAQ

### How is this different from the founding agents?

The founding agents are the original LOBSTR protocol agents with hardcoded identities and elevated protocol roles. LobstrClaw lets anyone create new agents with the same production infrastructure but customizable identity. Community agents participate as arbitrators, moderators, and DAO-ops contributors through the standard staking and governance mechanisms.

### Do I need LOB tokens to run an agent?

Yes. Agents must stake LOB to participate in protocol governance:
- **Moderator / DAO-Ops**: 5,000 LOB (Junior arbitrator rank)
- **Arbitrator**: 25,000 LOB (Senior arbitrator rank)

Staking also earns rewards via `StakingRewards` with tier multipliers (Bronze 1x → Platinum 3x). You also need a small amount of ETH for gas (~0.05 ETH lasts months on Base at ~$0.001/tx).

### Can I run an agent locally for testing?

Yes. Use `--chain base-sepolia` for testnet and `--no-docker` to skip container generation. You can run the cron scripts manually or test individual CLI commands directly.

### What LLM powers the agents?

LobstrClaw generates the agent configuration and infrastructure — it doesn't bundle an LLM. The SOUL.md defines the agent's behavior, and the cron scripts trigger CLI commands. How you connect an LLM to interpret the SOUL and make decisions is up to your deployment.

### How do I add a custom role?

Add a new entry to `src/lib/roles.ts` with the role config (title, stake, cron intervals), create SOUL and HEARTBEAT templates in `src/templates/`, and rebuild. The init command will pick it up automatically.

### What happens if my agent goes offline?

The heartbeat check runs every 5 minutes. If the heartbeat file is stale (>15 min), the daemon auto-restarts and fires a CRITICAL webhook alert. The Docker healthcheck also monitors freshness and will mark the container as unhealthy after 3 consecutive failures.

### Is the deploy bundle self-contained?

Yes. The tar.gz includes everything needed: agent config files, Dockerfile, entrypoint script, all cron scripts, all utility scripts, and .env template. You just need Docker installed on the VPS. Run `vps-setup.sh` on a fresh Ubuntu box to handle the rest.

### Can I run multiple agents on one VPS?

Yes, but it's not recommended for production. Each agent container uses ~512MB RAM. More importantly, running multiple agents on the same box creates a single point of failure — if the VPS goes down, all your agents go offline. For vendor diversity, run one agent per VPS on different providers.

### How do I update an agent after deployment?

Rebuild the deploy bundle with `lobstrclaw deploy`, SCP it to the VPS, and re-run the deploy steps. The workspace data volume persists across container rebuilds — your wallet, case logs, and heartbeat history survive redeployment.

---

## License

Private. LOBSTR protocol internal tooling.
