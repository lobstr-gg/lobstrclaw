services:
  {{AGENT_CODENAME}}:
    image: lobstr-agent:latest
    container_name: lobstr-{{AGENT_CODENAME}}
    restart: unless-stopped
    user: "1000:1000"

    environment:
      - AGENT_NAME={{AGENT_CODENAME}}
      - WORKSPACE_DIR=/data/workspace
      - CRONTAB_FILE=/etc/agent/crontab

    # Security hardening — v2 (OpenClaw v2026.2.24-beta.1)
    read_only: true
    security_opt:
      - no-new-privileges:true
      - seccomp:unconfined
    cap_drop:
      - ALL
    tmpfs:
      - /tmp:size=64m,noexec,nosuid
      - /var/run:size=8m,noexec,nosuid
    pids_limit: 100
    ulimits:
      nofile:
        soft: 1024
        hard: 2048
      nproc:
        soft: 64
        hard: 128

    # Resource limits
    mem_limit: 512m
    mem_reservation: 128m
    cpus: "0.5"

    # Network isolation — agent-specific network, outbound only
    networks:
      - agent-net

    # Docker secrets (never in env vars)
    secrets:
      - wallet_password
      - webhook_url
      - rpc_url

    volumes:
      # Workspace data (persistent)
      - {{AGENT_CODENAME}}-data:/data/workspace

      # Read-only config mounts
      - ./SOUL.md:/etc/agent/SOUL.md:ro
      - ./HEARTBEAT.md:/etc/agent/HEARTBEAT.md:ro
      - ./RULES.md:/etc/agent/RULES.md:ro
      - ./GOVERNANCE.md:/etc/agent/GOVERNANCE.md:ro
      - ./crontab:/etc/agent/crontab:ro

      # Writable log directory
      - {{AGENT_CODENAME}}-logs:/var/log/agent

    healthcheck:
      test: ["CMD-SHELL", "test $$(find /data/workspace/heartbeats.jsonl -mmin -15 2>/dev/null | wc -l) -gt 0"]
      interval: 5m
      timeout: 10s
      retries: 3
      start_period: 60s

    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"

    labels:
      - "com.lobstr.role={{ROLE_TITLE}}"
      - "com.lobstr.version=v2"

networks:
  agent-net:
    driver: bridge
    internal: false
    driver_opts:
      com.docker.network.bridge.enable_icc: "false"

secrets:
  wallet_password:
    file: /opt/lobstr/secrets/wallet_password
  webhook_url:
    file: /opt/lobstr/secrets/webhook_url
  rpc_url:
    file: /opt/lobstr/secrets/rpc_url

volumes:
  {{AGENT_CODENAME}}-data:
    driver: local
  {{AGENT_CODENAME}}-logs:
    driver: local
