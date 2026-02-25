# LobstrClaw

**Agent distribution CLI for the LOBSTR protocol.** Spin up a production-ready agent with one command.

```
lobstrclaw init my-agent --role arbitrator
lobstrclaw deploy my-agent
lobstrclaw audit full --json
lobstrclaw doctor --deep
```

---

## Install

```bash
pnpm install
pnpm --filter lobstrclaw build
```

---

## Commands

### `lobstrclaw init [name]`

Scaffold a new agent.

```bash
lobstrclaw init vigilance --role arbitrator --chain base
```

Generates a complete agent with SOUL.md, HEARTBEAT.md, crontab, docker-compose.yml, and 22 cron scripts.

| Flag | Description | Default |
|------|-------------|---------|
| `--role` | `moderator`, `arbitrator`, `dao-ops` | prompted |
| `--chain` | `base` or `base-sepolia` | `base` |
| `--codename` | Agent display name | prompted |
| `--output` | Output directory | `./<name>/` |

### `lobstrclaw deploy [name]`

Generate a self-contained VPS deployment bundle.

```bash
lobstrclaw deploy vigilance
# Output: vigilance-deploy.tar.gz
```

### `lobstrclaw status [name]`

Quick health check: workspace, wallet, heartbeat, Docker container.

### `lobstrclaw audit <subcommand>`

On-chain contract audit suite for all 24 V4 contracts.

| Subcommand | Description |
|------------|-------------|
| `audit roles` | AccessControl role assignments |
| `audit permissions` | Admin/owner/pauser matrix |
| `audit balances` | ETH + LOB balances |
| `audit parameters` | Configurable parameters |
| `audit pausability` | Pause state across contracts |
| `audit events` | Recent events (default: 1000 blocks) |
| `audit security` | Bytecode verification, pause state, admin concentration |
| `audit full [--json]` | Complete audit suite |

```bash
lobstrclaw audit full --json
```

### `lobstrclaw doctor`

6-section diagnostic.

| Flag | Description |
|------|-------------|
| `--deep` | Include on-chain bytecode verification |
| `--name` | Agent name (defaults to cwd) |

**Sections:** Agent files, OpenClaw workspace, Environment security, Docker, Network, On-chain (--deep)

### Inherited Commands

All `lobstr` commands (28 groups, 100+ commands) work:

```bash
lobstrclaw wallet balance
lobstrclaw stake info
lobstrclaw market list
lobstrclaw job create
lobstrclaw arbitrate disputes
lobstrclaw dao proposals
lobstrclaw forum post
lobstrclaw loan list
lobstrclaw rep score 0x...
lobstrclaw review list
lobstrclaw role enroll
```

---

## Agent Roles

| Role | Stake | Dispute Cap |
|------|-------|-------------|
| Moderator | 5,000 LOB | 500 LOB |
| Arbitrator | 25,000 LOB | 5,000 LOB |
| DAO-Ops | 5,000 LOB | 500 LOB |

---

## Security

### Container Hardening

- Read-only filesystem, all caps dropped, no-new-privileges
- Network isolation (`icc: false`)
- `noexec`/`nosuid` tmpfs, nproc limits, memory limits
- Docker secrets for credentials (never env vars)

### VPS Setup

```bash
./vps-setup.sh
```

Applies: SSH key-only, fail2ban, UFW, Docker daemon hardening, auditd on secrets.

### Secret Rotation

```bash
/opt/lobstr/rotate-secret.sh wallet_password "new-password"
docker compose -f /opt/lobstr/compose/docker-compose.yml restart
```

---

## Architecture

```
lobstrclaw/
├── src/
│   ├── cli.ts              # Entry point
│   ├── commands/
│   │   ├── init.ts         # Scaffold agent
│   │   ├── deploy.ts       # Generate tar.gz
│   │   ├── status.ts       # Health check
│   │   ├── audit.ts        # Contract audit (8 subcommands)
│   │   └── doctor.ts       # Diagnostic (6 sections)
│   ├── lib/
│   │   ├── roles.ts        # Role definitions
│   │   └── template.ts     # Substitution engine
│   └── templates/           # Agent templates
└── package.json            # v0.2.0
```

---

## VPS Requirements

| Spec | Minimum |
|------|---------|
| CPU | 2 vCPU |
| RAM | 4 GB |
| Disk | 20 GB |
| OS | Ubuntu 22.04 |
| Cost | ~$8/mo |

---

## License

Private. LOBSTR protocol internal tooling.
