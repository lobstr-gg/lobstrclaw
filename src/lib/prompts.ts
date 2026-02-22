import * as readline from 'readline';
import { ROLE_NAMES, type RoleName } from './roles';

function createInterface(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

function ask(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

export interface InitAnswers {
  name: string;
  role: RoleName;
  codename: string;
  chain: string;
}

export async function promptInit(defaults: Partial<InitAnswers>): Promise<InitAnswers> {
  const rl = createInterface();

  try {
    const name = defaults.name || await ask(rl, 'Agent name (directory name): ');
    if (!name) throw new Error('Agent name is required');

    let role = defaults.role;
    if (!role) {
      console.log('\nAvailable roles:');
      ROLE_NAMES.forEach((r, i) => console.log(`  ${i + 1}. ${r}`));
      const choice = await ask(rl, `\nSelect role (1-${ROLE_NAMES.length}): `);
      const idx = parseInt(choice, 10) - 1;
      if (idx < 0 || idx >= ROLE_NAMES.length) throw new Error('Invalid role selection');
      role = ROLE_NAMES[idx];
    }

    const codename = defaults.codename || await ask(rl, 'Agent codename (display name): ');
    if (!codename) throw new Error('Codename is required');

    const chain = defaults.chain || await ask(rl, 'Chain (base / base-sepolia) [base]: ') || 'base';
    if (chain !== 'base' && chain !== 'base-sepolia') {
      throw new Error(`Invalid chain: ${chain}. Must be "base" or "base-sepolia"`);
    }

    return { name, role, codename, chain };
  } finally {
    rl.close();
  }
}
