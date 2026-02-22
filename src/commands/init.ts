import { Command } from 'commander';
import * as path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import { ROLES, ROLE_NAMES, type RoleName } from '../lib/roles';
import { promptInit } from '../lib/prompts';
import { generateAgentFiles } from '../lib/generator';

export function registerInitCommand(program: Command): void {
  program
    .command('init [name]')
    .description('Scaffold a new LOBSTR protocol agent')
    .option('--role <role>', 'Agent role (moderator, arbitrator, dao-ops)')
    .option('--chain <chain>', 'Target chain (base, base-sepolia)', 'base')
    .option('--codename <codename>', 'Agent display name')
    .option('--output <path>', 'Output directory')
    .option('--no-docker', 'Skip Docker file generation')
    .option('--no-wallet', 'Skip wallet creation')
    .action(async (name: string | undefined, opts: Record<string, unknown>) => {
      try {
        console.log(chalk.bold('\n  LobstrClaw — Agent Scaffolding\n'));

        // Validate role if provided
        const roleOpt = opts.role as string | undefined;
        if (roleOpt && !ROLE_NAMES.includes(roleOpt as RoleName)) {
          console.error(chalk.red(`Invalid role: ${roleOpt}. Must be one of: ${ROLE_NAMES.join(', ')}`));
          process.exit(1);
        }

        // Gather answers (prompt for missing values)
        const answers = await promptInit({
          name: name,
          role: roleOpt as RoleName | undefined,
          codename: opts.codename as string | undefined,
          chain: opts.chain as string | undefined,
        });

        const roleConfig = ROLES[answers.role];
        const outputDir = (opts.output as string) || path.resolve(process.cwd(), answers.name);
        const docker = opts.docker !== false;

        console.log('');
        console.log(chalk.dim('  Name:     ') + answers.name);
        console.log(chalk.dim('  Role:     ') + roleConfig.title);
        console.log(chalk.dim('  Codename: ') + answers.codename);
        console.log(chalk.dim('  Chain:    ') + answers.chain);
        console.log(chalk.dim('  Output:   ') + outputDir);
        console.log('');

        // Generate workspace (optional)
        const spinner = ora('Generating agent files...').start();

        let walletCreated = false;
        if (opts.wallet !== false) {
          try {
            const { createWorkspace } = require('openclaw');
            createWorkspace(answers.name, answers.chain);
            walletCreated = true;
            spinner.text = 'Workspace created, generating config files...';
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            // Workspace creation is optional — don't fail the whole init
            spinner.text = `Skipping workspace: ${msg}`;
          }
        }

        // Generate files
        const agentNumber = String(Math.floor(Math.random() * 900) + 100);
        const created = generateAgentFiles({
          name: answers.name,
          role: answers.role,
          codename: answers.codename,
          chain: answers.chain,
          agentNumber,
          vpsDescription: 'VPS (configure after deployment)',
          outputDir,
          docker,
        });

        spinner.succeed(`Agent scaffolded: ${created.length} files created`);

        // Summary
        console.log('');
        console.log(chalk.bold('  Generated files:'));
        for (const file of created) {
          console.log(chalk.green(`    + ${file}`));
        }
        if (walletCreated) {
          console.log(chalk.green('    + OpenClaw workspace'));
        }

        console.log('');
        console.log(chalk.bold('  Next steps:'));
        console.log(chalk.dim('    1. Review and customize SOUL.md for your agent'));
        console.log(chalk.dim('    2. Fund the agent wallet with ETH (gas) + LOB (staking)'));
        if (docker) {
          console.log(chalk.dim('    3. Copy .env.example to .env and fill in secrets'));
          console.log(chalk.dim(`    4. Run: lobstrclaw deploy ${answers.name}`));
        }
        console.log('');
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(chalk.red(`\n  Error: ${msg}\n`));
        process.exit(1);
      }
    });
}
