import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import chalk from 'chalk';
import ora from 'ora';
import { stageDeployBundle } from '../lib/generator';

export function registerDeployCommand(program: Command): void {
  program
    .command('deploy [name]')
    .description('Generate a VPS deployment bundle (tar.gz)')
    .option('--output <path>', 'Output tar.gz path')
    .action(async (name: string | undefined, opts: Record<string, unknown>) => {
      try {
        console.log(chalk.bold('\n  LobstrClaw — Deployment Bundle\n'));

        // Resolve agent directory
        const agentDir = name ? path.resolve(process.cwd(), name) : process.cwd();
        const agentName = path.basename(agentDir);

        // Validate required files exist
        const requiredFiles = ['SOUL.md', 'HEARTBEAT.md', 'crontab', 'docker-compose.yml'];
        const missing = requiredFiles.filter((f) => !fs.existsSync(path.join(agentDir, f)));

        if (missing.length > 0) {
          console.error(chalk.red(`  Missing required files in ${agentDir}:`));
          for (const f of missing) {
            console.error(chalk.red(`    - ${f}`));
          }
          console.error(chalk.dim(`\n  Run "lobstrclaw init ${agentName}" first.\n`));
          process.exit(1);
        }

        const outputPath = (opts.output as string) || path.resolve(process.cwd(), `${agentName}-deploy.tar.gz`);
        const spinner = ora('Staging deployment bundle...').start();

        // Stage files in a temp directory
        const stagingDir = path.join(agentDir, '.deploy-staging');
        try {
          // Clean any previous staging
          if (fs.existsSync(stagingDir)) {
            fs.rmSync(stagingDir, { recursive: true });
          }

          const staged = stageDeployBundle(agentDir, agentName, stagingDir);
          spinner.text = `Staged ${staged.length} files, creating tar.gz...`;

          // Create tar.gz
          execSync(`tar czf "${outputPath}" -C "${stagingDir}" .`, { stdio: 'pipe' });

          spinner.succeed(`Bundle created: ${path.basename(outputPath)}`);

          // Size info
          const stats = fs.statSync(outputPath);
          const sizeKb = Math.round(stats.size / 1024);

          console.log('');
          console.log(chalk.dim(`  Size: ${sizeKb} KB`));
          console.log(chalk.dim(`  Path: ${outputPath}`));
          console.log('');
          console.log(chalk.bold('  Bundle contents:'));
          for (const f of staged) {
            console.log(chalk.green(`    ${f}`));
          }

          console.log('');
          console.log(chalk.bold('  Deploy instructions:'));
          console.log('');
          console.log(chalk.dim('    1. Copy to VPS:'));
          console.log(`       scp -P 2222 ${path.basename(outputPath)} lobstr@YOUR_VPS:/tmp/`);
          console.log('');
          console.log(chalk.dim('    2. SSH into VPS:'));
          console.log('       ssh -p 2222 lobstr@YOUR_VPS');
          console.log('');
          console.log(chalk.dim('    3. Deploy:'));
          console.log('       cd /opt/lobstr/compose');
          console.log('       sudo rm -rf build && sudo mkdir build && cd build');
          console.log(`       sudo tar xzf /tmp/${path.basename(outputPath)}`);
          console.log('       sudo docker build -t lobstr-agent:latest -f shared/Dockerfile shared/');
          console.log(`       sudo docker rm -f lobstr-${agentName} 2>/dev/null`);
          console.log(`       sudo docker compose -p compose --env-file /opt/lobstr/compose/.env -f docker-compose.yml up -d`);
          console.log('');
          console.log(chalk.dim('    4. Check status:'));
          console.log(`       docker logs lobstr-${agentName} --tail 20`);
          console.log('');
        } finally {
          // Clean up staging directory
          if (fs.existsSync(stagingDir)) {
            fs.rmSync(stagingDir, { recursive: true });
          }
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(chalk.red(`\n  Error: ${msg}\n`));
        process.exit(1);
      }
    });
}
