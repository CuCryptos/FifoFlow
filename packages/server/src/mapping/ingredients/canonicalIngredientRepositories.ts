import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import type {
  CanonicalIngredient,
  CanonicalIngredientDictionarySeed,
  CanonicalIngredientDictionarySyncSummary,
  CanonicalIngredientRepository,
  CanonicalIngredientSyncRepository,
  CanonicalIngredientSyncRun,
  IngredientAlias,
} from './types.js';
import { initializeCanonicalIngredientDb } from './persistence/sqliteSchema.js';
import { normalizeIngredientLookup } from './canonicalIngredientResolver.js';

export class SQLiteCanonicalIngredientRepository implements CanonicalIngredientRepository, CanonicalIngredientSyncRepository {
  constructor(private readonly db: Database.Database) {
    initializeCanonicalIngredientDb(db);
  }

  initialize(): void {
    initializeCanonicalIngredientDb(this.db);
  }

  startSyncRun(startedAt: string, sourceHash: string): CanonicalIngredientSyncRun {
    const result = this.db
      .prepare(
        `
          INSERT INTO canonical_ingredient_sync_runs (source_hash, started_at, status)
          VALUES (?, ?, 'running')
        `,
      )
      .run(sourceHash, startedAt);

    return this.getRunById(Number(result.lastInsertRowid));
  }

  completeSyncRun(
    runId: number | string,
    summary: CanonicalIngredientDictionarySyncSummary,
    completedAt: string,
    notes: string | null = null,
  ): CanonicalIngredientSyncRun {
    this.db.prepare(
      `
        UPDATE canonical_ingredient_sync_runs
        SET completed_at = ?,
            status = ?,
            ingredients_inserted = ?,
            ingredients_updated = ?,
            ingredients_reused = ?,
            ingredients_retired = ?,
            aliases_inserted = ?,
            aliases_updated = ?,
            aliases_reused = ?,
            aliases_retired = ?,
            notes = ?,
            updated_at = ?
        WHERE id = ?
      `,
    ).run(
      completedAt,
      summary.status,
      summary.ingredients_inserted,
      summary.ingredients_updated,
      summary.ingredients_reused,
      summary.ingredients_retired,
      summary.aliases_inserted,
      summary.aliases_updated,
      summary.aliases_reused,
      summary.aliases_retired,
      notes,
      completedAt,
      runId,
    );

    return this.getRunById(Number(runId));
  }

  failSyncRun(runId: number | string, completedAt: string, notes: string | null = null): CanonicalIngredientSyncRun {
    this.db.prepare(
      `
        UPDATE canonical_ingredient_sync_runs
        SET completed_at = ?,
            status = 'failed',
            notes = ?,
            updated_at = ?
        WHERE id = ?
      `,
    ).run(completedAt, notes, completedAt, runId);

    return this.getRunById(Number(runId));
  }

  upsertCanonicalIngredient(record: Omit<CanonicalIngredient, 'id' | 'created_at' | 'updated_at'>): 'inserted' | 'updated' | 'reused' {
    const existing = this.db
      .prepare('SELECT * FROM canonical_ingredients WHERE canonical_name = ? LIMIT 1')
      .get(record.canonical_name) as CanonicalIngredientRow | undefined;

    if (!existing) {
      this.db.prepare(
        `
          INSERT INTO canonical_ingredients (
            canonical_name,
            normalized_canonical_name,
            category,
            base_unit,
            perishable_flag,
            active,
            source_hash
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
      ).run(
        record.canonical_name,
        record.normalized_canonical_name,
        record.category,
        record.base_unit,
        record.perishable_flag ? 1 : 0,
        record.active ? 1 : 0,
        record.source_hash,
      );
      return 'inserted';
    }

    if (
      existing.normalized_canonical_name === record.normalized_canonical_name
      && existing.category === record.category
      && existing.base_unit === record.base_unit
      && existing.perishable_flag === (record.perishable_flag ? 1 : 0)
      && existing.active === (record.active ? 1 : 0)
      && existing.source_hash === record.source_hash
    ) {
      return 'reused';
    }

    this.db.prepare(
      `
        UPDATE canonical_ingredients
        SET normalized_canonical_name = ?,
            category = ?,
            base_unit = ?,
            perishable_flag = ?,
            active = ?,
            source_hash = ?,
            updated_at = datetime('now')
        WHERE canonical_name = ?
      `,
    ).run(
      record.normalized_canonical_name,
      record.category,
      record.base_unit,
      record.perishable_flag ? 1 : 0,
      record.active ? 1 : 0,
      record.source_hash,
      record.canonical_name,
    );

    return 'updated';
  }

  retireMissingCanonicalIngredients(activeCanonicalNames: Set<string>): number {
    const rows = this.db
      .prepare('SELECT canonical_name FROM canonical_ingredients WHERE active = 1')
      .all() as Array<{ canonical_name: string }>;
    let retired = 0;
    for (const row of rows) {
      if (!activeCanonicalNames.has(row.canonical_name)) {
        this.db.prepare(
          `
            UPDATE canonical_ingredients
            SET active = 0,
                updated_at = datetime('now')
            WHERE canonical_name = ?
          `,
        ).run(row.canonical_name);
        retired += 1;
      }
    }
    return retired;
  }

  getCanonicalIngredientByName(name: string): CanonicalIngredient | null {
    const row = this.db
      .prepare('SELECT * FROM canonical_ingredients WHERE canonical_name = ? LIMIT 1')
      .get(name) as CanonicalIngredientRow | undefined;
    return row ? mapCanonicalIngredientRow(row) : null;
  }

  upsertIngredientAlias(record: Omit<IngredientAlias, 'id' | 'created_at' | 'updated_at'>): 'inserted' | 'updated' | 'reused' {
    const existing = this.db
      .prepare(
        `
          SELECT *
          FROM ingredient_aliases
          WHERE canonical_ingredient_id = ?
            AND alias = ?
          LIMIT 1
        `,
      )
      .get(record.canonical_ingredient_id, record.alias) as IngredientAliasRow | undefined;

    if (!existing) {
      this.db.prepare(
        `
          INSERT INTO ingredient_aliases (
            canonical_ingredient_id,
            alias,
            normalized_alias,
            alias_type,
            active,
            source_hash
          ) VALUES (?, ?, ?, ?, ?, ?)
        `,
      ).run(
        record.canonical_ingredient_id,
        record.alias,
        record.normalized_alias,
        record.alias_type,
        record.active ? 1 : 0,
        record.source_hash,
      );
      return 'inserted';
    }

    if (
      existing.normalized_alias === record.normalized_alias
      && existing.alias_type === record.alias_type
      && existing.active === (record.active ? 1 : 0)
      && existing.source_hash === record.source_hash
    ) {
      return 'reused';
    }

    this.db.prepare(
      `
        UPDATE ingredient_aliases
        SET normalized_alias = ?,
            alias_type = ?,
            active = ?,
            source_hash = ?,
            updated_at = datetime('now')
        WHERE canonical_ingredient_id = ?
          AND alias = ?
      `,
    ).run(
      record.normalized_alias,
      record.alias_type,
      record.active ? 1 : 0,
      record.source_hash,
      record.canonical_ingredient_id,
      record.alias,
    );

    return 'updated';
  }

  retireMissingAliases(canonicalIngredientId: number | string, activeAliases: Set<string>): number {
    const rows = this.db
      .prepare(
        `
          SELECT alias
          FROM ingredient_aliases
          WHERE canonical_ingredient_id = ?
            AND active = 1
        `,
      )
      .all(canonicalIngredientId) as Array<{ alias: string }>;

    let retired = 0;
    for (const row of rows) {
      if (!activeAliases.has(row.alias)) {
        this.db.prepare(
          `
            UPDATE ingredient_aliases
            SET active = 0,
                updated_at = datetime('now')
            WHERE canonical_ingredient_id = ?
              AND alias = ?
          `,
        ).run(canonicalIngredientId, row.alias);
        retired += 1;
      }
    }
    return retired;
  }

  async findCanonicalByExactName(name: string): Promise<CanonicalIngredient[]> {
    const rows = this.db.prepare(
      `
        SELECT *
        FROM canonical_ingredients
        WHERE canonical_name = ?
          AND active = 1
        ORDER BY canonical_name ASC
      `,
    ).all(name) as CanonicalIngredientRow[];
    return rows.map(mapCanonicalIngredientRow);
  }

  async findCanonicalByNormalizedName(normalizedName: string): Promise<CanonicalIngredient[]> {
    const rows = this.db.prepare(
      `
        SELECT *
        FROM canonical_ingredients
        WHERE normalized_canonical_name = ?
          AND active = 1
        ORDER BY canonical_name ASC
      `,
    ).all(normalizedName) as CanonicalIngredientRow[];
    return rows.map(mapCanonicalIngredientRow);
  }

  async findCanonicalByExactAlias(alias: string): Promise<Array<{ ingredient: CanonicalIngredient; alias: IngredientAlias }>> {
    return this.findAliasMatches('a.alias = ?', alias);
  }

  async findCanonicalByNormalizedAlias(normalizedAlias: string): Promise<Array<{ ingredient: CanonicalIngredient; alias: IngredientAlias }>> {
    return this.findAliasMatches('a.normalized_alias = ?', normalizedAlias);
  }

  listCanonicalIngredients(): CanonicalIngredient[] {
    const rows = this.db.prepare('SELECT * FROM canonical_ingredients ORDER BY canonical_name ASC').all() as CanonicalIngredientRow[];
    return rows.map(mapCanonicalIngredientRow);
  }

  listIngredientAliases(): IngredientAlias[] {
    const rows = this.db.prepare('SELECT * FROM ingredient_aliases ORDER BY canonical_ingredient_id ASC, alias ASC').all() as IngredientAliasRow[];
    return rows.map(mapIngredientAliasRow);
  }

  listSyncRuns(): CanonicalIngredientSyncRun[] {
    const rows = this.db.prepare('SELECT * FROM canonical_ingredient_sync_runs ORDER BY id ASC').all() as SyncRunRow[];
    return rows.map(mapSyncRunRow);
  }

  private findAliasMatches(whereClause: string, value: string): Array<{ ingredient: CanonicalIngredient; alias: IngredientAlias }> {
    const rows = this.db.prepare(
      `
        SELECT
          c.id AS c_id,
          c.canonical_name AS c_canonical_name,
          c.normalized_canonical_name AS c_normalized_canonical_name,
          c.category AS c_category,
          c.base_unit AS c_base_unit,
          c.perishable_flag AS c_perishable_flag,
          c.active AS c_active,
          c.source_hash AS c_source_hash,
          c.created_at AS c_created_at,
          c.updated_at AS c_updated_at,
          a.id AS a_id,
          a.canonical_ingredient_id AS a_canonical_ingredient_id,
          a.alias AS a_alias,
          a.normalized_alias AS a_normalized_alias,
          a.alias_type AS a_alias_type,
          a.active AS a_active,
          a.source_hash AS a_source_hash,
          a.created_at AS a_created_at,
          a.updated_at AS a_updated_at
        FROM ingredient_aliases a
        JOIN canonical_ingredients c ON c.id = a.canonical_ingredient_id
        WHERE ${whereClause}
          AND a.active = 1
          AND c.active = 1
        ORDER BY c.canonical_name ASC, a.alias ASC
      `,
    ).all(value) as AliasJoinRow[];

    return rows.map((row) => ({
      ingredient: mapCanonicalIngredientRow({
        id: row.c_id,
        canonical_name: row.c_canonical_name,
        normalized_canonical_name: row.c_normalized_canonical_name,
        category: row.c_category,
        base_unit: row.c_base_unit,
        perishable_flag: row.c_perishable_flag,
        active: row.c_active,
        source_hash: row.c_source_hash,
        created_at: row.c_created_at,
        updated_at: row.c_updated_at,
      }),
      alias: mapIngredientAliasRow({
        id: row.a_id,
        canonical_ingredient_id: row.a_canonical_ingredient_id,
        alias: row.a_alias,
        normalized_alias: row.a_normalized_alias,
        alias_type: row.a_alias_type,
        active: row.a_active,
        source_hash: row.a_source_hash,
        created_at: row.a_created_at,
        updated_at: row.a_updated_at,
      }),
    }));
  }

  private getRunById(id: number): CanonicalIngredientSyncRun {
    const row = this.db.prepare('SELECT * FROM canonical_ingredient_sync_runs WHERE id = ? LIMIT 1').get(id) as SyncRunRow | undefined;
    if (!row) {
      throw new Error(`Canonical ingredient sync run ${id} not found.`);
    }
    return mapSyncRunRow(row);
  }
}

export function computeIngredientSourceHash(record: {
  canonical_name: string;
  category: string;
  base_unit: string;
  perishable_flag: boolean;
}): string {
  return createHash('sha256')
    .update(JSON.stringify(record))
    .digest('hex');
}

export function computeAliasSourceHash(record: {
  canonical_name: string;
  alias: string;
  alias_type?: string | null;
}): string {
  return createHash('sha256')
    .update(JSON.stringify(record))
    .digest('hex');
}

export function computeDictionarySourceHash(seed: CanonicalIngredientDictionarySeed): string {
  return createHash('sha256')
    .update(JSON.stringify(seed))
    .digest('hex');
}

export function syncCanonicalIngredientDictionary(
  repository: CanonicalIngredientSyncRepository,
  seed: CanonicalIngredientDictionarySeed,
  now: string = new Date().toISOString(),
): { summary: CanonicalIngredientDictionarySyncSummary; run: CanonicalIngredientSyncRun } {
  repository.initialize();

  const summary: CanonicalIngredientDictionarySyncSummary = {
    ingredients_inserted: 0,
    ingredients_updated: 0,
    ingredients_reused: 0,
    ingredients_retired: 0,
    aliases_inserted: 0,
    aliases_updated: 0,
    aliases_reused: 0,
    aliases_retired: 0,
    status: 'completed',
  };

  const aliasMap = new Map(seed.aliases.map((entry) => [entry.canonical_name, entry.aliases]));
  const run = repository.startSyncRun(now, computeDictionarySourceHash(seed));

  try {
    const activeCanonicalNames = new Set<string>();

    for (const ingredient of seed.ingredients) {
      activeCanonicalNames.add(ingredient.canonical_name);
      const canonicalResult = repository.upsertCanonicalIngredient({
        canonical_name: ingredient.canonical_name,
        normalized_canonical_name: normalizeIngredientLookup(ingredient.canonical_name),
        category: ingredient.category,
        base_unit: ingredient.base_unit,
        perishable_flag: ingredient.perishable_flag,
        active: true,
        source_hash: computeIngredientSourceHash(ingredient),
      });
      incrementIngredientSummary(summary, canonicalResult);

      const canonical = repository.getCanonicalIngredientByName(ingredient.canonical_name);
      if (!canonical) {
        throw new Error(`Canonical ingredient ${ingredient.canonical_name} was not available after upsert.`);
      }

      const aliases = aliasMap.get(ingredient.canonical_name) ?? [];
      const activeAliases = new Set<string>();
      for (const alias of aliases) {
        activeAliases.add(alias);
        const aliasResult = repository.upsertIngredientAlias({
          canonical_ingredient_id: canonical.id,
          alias,
          normalized_alias: normalizeIngredientLookup(alias),
          alias_type: 'seed',
          active: true,
          source_hash: computeAliasSourceHash({ canonical_name: ingredient.canonical_name, alias, alias_type: 'seed' }),
        });
        incrementAliasSummary(summary, aliasResult);
      }
      summary.aliases_retired += repository.retireMissingAliases(canonical.id, activeAliases);
    }

    summary.ingredients_retired = repository.retireMissingCanonicalIngredients(activeCanonicalNames);
    const completedRun = repository.completeSyncRun(run.id, summary, now, null);
    return { summary, run: completedRun };
  } catch (error) {
    const failedRun = repository.failSyncRun(run.id, now, error instanceof Error ? error.message : 'Unknown canonical ingredient sync failure');
    throw Object.assign(error instanceof Error ? error : new Error(String(error)), { failedRun });
  }
}

function mapCanonicalIngredientRow(row: CanonicalIngredientRow): CanonicalIngredient {
  return {
    id: row.id,
    canonical_name: row.canonical_name,
    normalized_canonical_name: row.normalized_canonical_name,
    category: row.category,
    base_unit: row.base_unit,
    perishable_flag: row.perishable_flag === 1,
    active: row.active === 1,
    source_hash: row.source_hash,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapIngredientAliasRow(row: IngredientAliasRow): IngredientAlias {
  return {
    id: row.id,
    canonical_ingredient_id: row.canonical_ingredient_id,
    alias: row.alias,
    normalized_alias: row.normalized_alias,
    alias_type: row.alias_type,
    active: row.active === 1,
    source_hash: row.source_hash,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapSyncRunRow(row: SyncRunRow): CanonicalIngredientSyncRun {
  return {
    id: row.id,
    source_hash: row.source_hash,
    started_at: row.started_at,
    completed_at: row.completed_at,
    status: row.status,
    ingredients_inserted: row.ingredients_inserted,
    ingredients_updated: row.ingredients_updated,
    ingredients_reused: row.ingredients_reused,
    ingredients_retired: row.ingredients_retired,
    aliases_inserted: row.aliases_inserted,
    aliases_updated: row.aliases_updated,
    aliases_reused: row.aliases_reused,
    aliases_retired: row.aliases_retired,
    notes: row.notes,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function incrementIngredientSummary(
  summary: CanonicalIngredientDictionarySyncSummary,
  result: 'inserted' | 'updated' | 'reused',
): void {
  if (result === 'inserted') {
    summary.ingredients_inserted += 1;
  } else if (result === 'updated') {
    summary.ingredients_updated += 1;
  } else {
    summary.ingredients_reused += 1;
  }
}

function incrementAliasSummary(
  summary: CanonicalIngredientDictionarySyncSummary,
  result: 'inserted' | 'updated' | 'reused',
): void {
  if (result === 'inserted') {
    summary.aliases_inserted += 1;
  } else if (result === 'updated') {
    summary.aliases_updated += 1;
  } else {
    summary.aliases_reused += 1;
  }
}

type CanonicalIngredientRow = {
  id: number;
  canonical_name: string;
  normalized_canonical_name: string;
  category: string;
  base_unit: string;
  perishable_flag: number;
  active: number;
  source_hash: string;
  created_at: string;
  updated_at: string;
};

type IngredientAliasRow = {
  id: number;
  canonical_ingredient_id: number;
  alias: string;
  normalized_alias: string;
  alias_type: string | null;
  active: number;
  source_hash: string;
  created_at: string;
  updated_at: string;
};

type SyncRunRow = {
  id: number;
  source_hash: string;
  started_at: string;
  completed_at: string | null;
  status: 'running' | 'completed' | 'failed';
  ingredients_inserted: number;
  ingredients_updated: number;
  ingredients_reused: number;
  ingredients_retired: number;
  aliases_inserted: number;
  aliases_updated: number;
  aliases_reused: number;
  aliases_retired: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type AliasJoinRow = {
  c_id: number;
  c_canonical_name: string;
  c_normalized_canonical_name: string;
  c_category: string;
  c_base_unit: string;
  c_perishable_flag: number;
  c_active: number;
  c_source_hash: string;
  c_created_at: string;
  c_updated_at: string;
  a_id: number;
  a_canonical_ingredient_id: number;
  a_alias: string;
  a_normalized_alias: string;
  a_alias_type: string | null;
  a_active: number;
  a_source_hash: string;
  a_created_at: string;
  a_updated_at: string;
};
