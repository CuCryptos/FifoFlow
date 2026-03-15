import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SQLiteCanonicalIngredientRepository,
  syncCanonicalIngredientDictionary,
  type CanonicalIngredientDictionarySeed,
} from '../packages/server/src/mapping/ingredients/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

export interface ImportCanonicalIngredientsOptions {
  dbPath?: string;
  dataPath?: string;
  now?: string;
}

export function importCanonicalIngredients(options: ImportCanonicalIngredientsOptions = {}): {
  summary: ReturnType<typeof syncCanonicalIngredientDictionary>['summary'];
  run: ReturnType<typeof syncCanonicalIngredientDictionary>['run'];
} {
  const dbPath = path.resolve(repoRoot, options.dbPath ?? 'packages/server/data/fifoflow.db');
  const dataPath = path.resolve(repoRoot, options.dataPath ?? 'packages/server/data/canonical-ingredient-dictionary.json');
  const now = options.now ?? new Date().toISOString();

  const seed = JSON.parse(fs.readFileSync(dataPath, 'utf8')) as CanonicalIngredientDictionarySeed;
  const db = new Database(dbPath);
  try {
    const repository = new SQLiteCanonicalIngredientRepository(db);
    return syncCanonicalIngredientDictionary(repository, seed, now);
  } finally {
    db.close();
  }
}

function parseArgs(argv: string[]): ImportCanonicalIngredientsOptions {
  const options: ImportCanonicalIngredientsOptions = {};
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (current === '--db' && argv[index + 1]) {
      options.dbPath = argv[index + 1];
      index += 1;
    } else if (current === '--data' && argv[index + 1]) {
      options.dataPath = argv[index + 1];
      index += 1;
    } else if (current === '--now' && argv[index + 1]) {
      options.now = argv[index + 1];
      index += 1;
    }
  }
  return options;
}

if (import.meta.url === new URL(process.argv[1]!, 'file:').href) {
  const result = importCanonicalIngredients(parseArgs(process.argv.slice(2)));
  console.log(JSON.stringify(result, null, 2));
}
