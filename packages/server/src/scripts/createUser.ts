import { getDb } from '../db.js';
import { hashPassword } from '../auth/passwords.js';
import { createInterface } from 'node:readline';
import { stdin, stdout, exit } from 'node:process';

interface Args {
  email?: string;
  name?: string;
  role?: string;
  password?: string;
}

function parseArgs(argv: string[]): Args {
  const out: Args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = argv[i + 1];
    if (a === '--email') { out.email = next; i++; }
    else if (a === '--name') { out.name = next; i++; }
    else if (a === '--role') { out.role = next; i++; }
    else if (a === '--password') { out.password = next; i++; }
  }
  return out;
}

function prompt(question: string, silent = false): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: stdin, output: stdout, terminal: true });
    if (silent) {
      const rlAny = rl as unknown as { _writeToOutput: (s: string) => void };
      const orig = rlAny._writeToOutput;
      rlAny._writeToOutput = (s: string) => {
        if (s.startsWith(question)) orig.call(rl, s);
        else orig.call(rl, '');
      };
    }
    rl.question(question, (ans) => {
      rl.close();
      if (silent) stdout.write('\n');
      resolve(ans.trim());
    });
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const email = args.email ?? (await prompt('Email: '));
  const name = args.name ?? (await prompt('Name: '));
  const role = args.role ?? 'staff';
  const password = args.password ?? (await prompt('Password (min 10 chars): ', true));

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error('Invalid email format');
    exit(1);
  }
  if (password.length < 10) {
    console.error('Password must be at least 10 characters');
    exit(1);
  }
  if (role !== 'staff' && role !== 'admin') {
    console.error("Role must be 'staff' or 'admin'");
    exit(1);
  }

  const db = getDb();
  const existing = db
    .prepare('SELECT id FROM users WHERE email = ?')
    .get(email.toLowerCase().trim());
  if (existing) {
    console.error(`User with email ${email} already exists`);
    exit(1);
  }
  const hash = await hashPassword(password);
  const result = db
    .prepare(
      `INSERT INTO users (email, password_hash, name, role, created_at)
       VALUES (?, ?, ?, ?, datetime('now'))`,
    )
    .run(email.toLowerCase().trim(), hash, name, role);
  console.log(`User created: id=${result.lastInsertRowid}, email=${email}, role=${role}`);
}

main().catch((err) => {
  console.error(err);
  exit(1);
});
