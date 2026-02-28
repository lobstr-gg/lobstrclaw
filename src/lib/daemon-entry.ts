/**
 * Daemon entry point — forked by `lobstrclaw start` as a detached child process.
 * Reads config from __LOBSTRCLAW_DAEMON_CONFIG env var and runs the daemon.
 */
import { runDaemon, type DaemonConfig } from './daemon';

const configJson = process.env.__LOBSTRCLAW_DAEMON_CONFIG;
if (!configJson) {
  console.error('[daemon-entry] Missing __LOBSTRCLAW_DAEMON_CONFIG');
  process.exit(1);
}

let config: DaemonConfig;
try {
  config = JSON.parse(configJson);
} catch (err) {
  console.error('[daemon-entry] Invalid daemon config:', err);
  process.exit(1);
}

runDaemon(config);
