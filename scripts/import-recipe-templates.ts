import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

interface IngredientRecord {
  name: string;
  qty: number;
  unit: string;
}

interface TemplateRecord {
  name: string;
  category: string;
  yield_quantity: number;
  yield_unit: string;
  ingredients: IngredientRecord[];
}

interface TemplateLibrary {
  templates: TemplateRecord[];
}

interface CliOptions {
  dbPath: string;
  dataPath: string;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    dbPath: path.resolve('packages/server/data/fifoflow.db'),
    dataPath: path.resolve('packages/server/data/recipe-template-library.json'),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === '--db' && next) {
      options.dbPath = path.resolve(next);
      index += 1;
      continue;
    }
    if (arg === '--data' && next) {
      options.dataPath = path.resolve(next);
      index += 1;
    }
  }

  return options;
}

function loadLibrary(dataPath: string): TemplateLibrary {
  const raw = fs.readFileSync(dataPath, 'utf8');
  const parsed = JSON.parse(raw) as TemplateLibrary;
  if (!Array.isArray(parsed.templates)) {
    throw new Error(`Invalid template library at ${dataPath}: missing templates array.`);
  }
  return parsed;
}

function ensureSchema(db: Database.Database): void {
  db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS recipe_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS recipe_template_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipe_template_id INTEGER NOT NULL REFERENCES recipe_templates(id) ON DELETE CASCADE,
      version_number INTEGER NOT NULL,
      yield_quantity REAL NOT NULL,
      yield_unit TEXT NOT NULL,
      source_hash TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(recipe_template_id, version_number),
      UNIQUE(recipe_template_id, source_hash)
    );

    CREATE TABLE IF NOT EXISTS recipe_template_ingredients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipe_template_version_id INTEGER NOT NULL REFERENCES recipe_template_versions(id) ON DELETE CASCADE,
      ingredient_name TEXT NOT NULL,
      qty REAL NOT NULL,
      unit TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(recipe_template_version_id, sort_order)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_recipe_template_versions_active
      ON recipe_template_versions(recipe_template_id)
      WHERE is_active = 1;

    CREATE INDEX IF NOT EXISTS idx_recipe_template_versions_template_id
      ON recipe_template_versions(recipe_template_id);

    CREATE INDEX IF NOT EXISTS idx_recipe_template_ingredients_version_id
      ON recipe_template_ingredients(recipe_template_version_id);

    CREATE TRIGGER IF NOT EXISTS update_recipe_templates_timestamp
    AFTER UPDATE ON recipe_templates
    BEGIN
      UPDATE recipe_templates SET updated_at = datetime('now') WHERE id = NEW.id;
    END;

    CREATE TRIGGER IF NOT EXISTS update_recipe_template_versions_timestamp
    AFTER UPDATE ON recipe_template_versions
    BEGIN
      UPDATE recipe_template_versions SET updated_at = datetime('now') WHERE id = NEW.id;
    END;
  `);
}

function normalizeTemplate(template: TemplateRecord): TemplateRecord {
  return {
    name: template.name.trim(),
    category: template.category.trim(),
    yield_quantity: Number(template.yield_quantity),
    yield_unit: template.yield_unit.trim(),
    ingredients: template.ingredients.map((ingredient) => ({
      name: ingredient.name.trim().toLowerCase(),
      qty: Number(ingredient.qty),
      unit: ingredient.unit.trim(),
    })),
  };
}

function computeSourceHash(template: TemplateRecord): string {
  return crypto.createHash('sha256').update(JSON.stringify(template)).digest('hex');
}

function main(): void {
  const { dbPath, dataPath } = parseArgs(process.argv.slice(2));
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const library = loadLibrary(dataPath);
  const db = new Database(dbPath);
  ensureSchema(db);

  const selectTemplate = db.prepare('SELECT id FROM recipe_templates WHERE name = ?');
  const insertTemplate = db.prepare('INSERT INTO recipe_templates (name, category) VALUES (?, ?)');
  const updateTemplate = db.prepare('UPDATE recipe_templates SET category = ? WHERE id = ?');
  const selectVersionByHash = db.prepare(
    'SELECT id, version_number FROM recipe_template_versions WHERE recipe_template_id = ? AND source_hash = ?',
  );
  const selectNextVersion = db.prepare(
    'SELECT COALESCE(MAX(version_number), 0) + 1 AS next_version FROM recipe_template_versions WHERE recipe_template_id = ?',
  );
  const deactivateVersions = db.prepare(
    'UPDATE recipe_template_versions SET is_active = 0 WHERE recipe_template_id = ? AND id != ?',
  );
  const activateVersion = db.prepare(
    'UPDATE recipe_template_versions SET is_active = 1 WHERE id = ?',
  );
  const insertVersion = db.prepare(
    `INSERT INTO recipe_template_versions
      (recipe_template_id, version_number, yield_quantity, yield_unit, source_hash, is_active)
     VALUES (?, ?, ?, ?, ?, 1)`,
  );
  const versionIngredientCount = db.prepare(
    'SELECT COUNT(*) AS count FROM recipe_template_ingredients WHERE recipe_template_version_id = ?',
  );
  const deleteIngredients = db.prepare(
    'DELETE FROM recipe_template_ingredients WHERE recipe_template_version_id = ?',
  );
  const insertIngredient = db.prepare(
    `INSERT INTO recipe_template_ingredients
      (recipe_template_version_id, ingredient_name, qty, unit, sort_order)
     VALUES (?, ?, ?, ?, ?)`,
  );

  let templatesInserted = 0;
  let versionsInserted = 0;
  let versionsReused = 0;
  let ingredientsInserted = 0;

  const importAll = db.transaction((templates: TemplateRecord[]) => {
    for (const rawTemplate of templates) {
      const template = normalizeTemplate(rawTemplate);
      const sourceHash = computeSourceHash(template);

      let templateId = (selectTemplate.get(template.name) as { id: number } | undefined)?.id;
      if (!templateId) {
        const result = insertTemplate.run(template.name, template.category);
        templateId = Number(result.lastInsertRowid);
        templatesInserted += 1;
      } else {
        updateTemplate.run(template.category, templateId);
      }

      const existingVersion = selectVersionByHash.get(templateId, sourceHash) as { id: number; version_number: number } | undefined;
      let versionId: number;

      if (existingVersion) {
        versionId = existingVersion.id;
        activateVersion.run(versionId);
        deactivateVersions.run(templateId, versionId);
        versionsReused += 1;

        const ingredientCount = (versionIngredientCount.get(versionId) as { count: number }).count;
        if (ingredientCount === 0) {
          deleteIngredients.run(versionId);
          template.ingredients.forEach((ingredient, index) => {
            insertIngredient.run(versionId, ingredient.name, ingredient.qty, ingredient.unit, index + 1);
            ingredientsInserted += 1;
          });
        }
        continue;
      }

      const nextVersion = (selectNextVersion.get(templateId) as { next_version: number }).next_version;
      const versionResult = insertVersion.run(
        templateId,
        nextVersion,
        template.yield_quantity,
        template.yield_unit,
        sourceHash,
      );
      versionId = Number(versionResult.lastInsertRowid);
      deactivateVersions.run(templateId, versionId);
      versionsInserted += 1;

      template.ingredients.forEach((ingredient, index) => {
        insertIngredient.run(versionId, ingredient.name, ingredient.qty, ingredient.unit, index + 1);
        ingredientsInserted += 1;
      });
    }
  });

  importAll(library.templates);

  const counts = db.prepare(
    `SELECT
      (SELECT COUNT(*) FROM recipe_templates) AS template_count,
      (SELECT COUNT(*) FROM recipe_template_versions) AS version_count,
      (SELECT COUNT(*) FROM recipe_template_ingredients) AS ingredient_count`,
  ).get() as { template_count: number; version_count: number; ingredient_count: number };

  console.log(
    JSON.stringify(
      {
        db_path: dbPath,
        data_path: dataPath,
        templates_processed: library.templates.length,
        templates_inserted: templatesInserted,
        versions_inserted: versionsInserted,
        versions_reused: versionsReused,
        ingredients_inserted: ingredientsInserted,
        totals: counts,
      },
      null,
      2,
    ),
  );

  db.close();
}

main();
