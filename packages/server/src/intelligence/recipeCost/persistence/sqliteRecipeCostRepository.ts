import Database from 'better-sqlite3';
import type {
  IngredientCostResolution,
  RecipeCostIngredientDelta,
  RecipeCostRunRecord,
  RecipeCostRunSummary,
  RecipeCostSnapshot,
  RecipeCostSnapshotComparison,
  RecipeIngredientCostComponent,
} from '@fifoflow/shared';
import { initializeRecipeCostDb } from './sqliteSchema.js';
import type {
  RecipeCostPersistenceRepository,
  RecipeCostUpsertResult,
} from '../types.js';

export class SQLiteRecipeCostRepository implements RecipeCostPersistenceRepository {
  constructor(private readonly db: Database.Database) {
    initializeRecipeCostDb(db);
  }

  async withTransaction<T>(work: () => Promise<T>): Promise<T> {
    this.db.exec('BEGIN');
    try {
      const result = await work();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  async startRun(startedAt: string): Promise<RecipeCostRunRecord> {
    const result = this.db
      .prepare(
        `
          INSERT INTO recipe_cost_runs (started_at, status)
          VALUES (?, 'running')
        `,
      )
      .run(startedAt);

    return this.getRunById(Number(result.lastInsertRowid));
  }

  async completeRun(
    runId: number | string,
    status: RecipeCostRunRecord['status'],
    summary: RecipeCostRunSummary,
    completedAt: string,
    notes: string | null = null,
  ): Promise<RecipeCostRunRecord> {
    this.db
      .prepare(
        `
          UPDATE recipe_cost_runs
          SET completed_at = ?,
              snapshots_created = ?,
              snapshots_updated = ?,
              complete_snapshots = ?,
              partial_snapshots = ?,
              incomplete_snapshots = ?,
              status = ?,
              notes = ?,
              updated_at = ?
          WHERE id = ?
        `,
      )
      .run(
        completedAt,
        summary.snapshots_created,
        summary.snapshots_updated,
        summary.complete_snapshots,
        summary.partial_snapshots,
        summary.incomplete_snapshots,
        status,
        notes,
        completedAt,
        runId,
      );

    return this.getRunById(Number(runId));
  }

  async upsertSnapshot(snapshot: RecipeCostSnapshot): Promise<RecipeCostUpsertResult<RecipeCostSnapshot>> {
    const comparableKey = snapshot.comparable_key ?? defaultComparableKey(snapshot);
    const existing = this.db
      .prepare('SELECT id FROM recipe_cost_snapshots WHERE comparable_key = ? LIMIT 1')
      .get(comparableKey) as { id: number } | undefined;

    if (existing) {
      this.db
        .prepare(
          `
            UPDATE recipe_cost_snapshots
            SET recipe_id = ?,
                recipe_version_id = ?,
                recipe_name = ?,
                recipe_type = ?,
                snapshot_at = ?,
                yield_qty = ?,
                yield_unit = ?,
                serving_count = ?,
                total_cost = ?,
                resolved_cost_subtotal = ?,
                cost_per_yield_unit = ?,
                cost_per_serving = ?,
                completeness_status = ?,
                confidence_label = ?,
                ingredient_count = ?,
                resolved_ingredient_count = ?,
                missing_cost_count = ?,
                stale_cost_count = ?,
                ambiguous_cost_count = ?,
                unit_mismatch_count = ?,
                primary_driver_item_id = ?,
                primary_driver_cost = ?,
                source_run_id = ?,
                driver_payload = ?,
                updated_at = ?
            WHERE id = ?
          `,
        )
        .run(
          snapshot.recipe_id,
          snapshot.recipe_version_id ?? null,
          snapshot.recipe_name,
          snapshot.recipe_type,
          snapshot.snapshot_at,
          snapshot.yield_qty,
          snapshot.yield_unit,
          snapshot.serving_count,
          snapshot.total_cost,
          snapshot.resolved_cost_subtotal,
          snapshot.cost_per_yield_unit,
          snapshot.cost_per_serving,
          snapshot.completeness_status,
          snapshot.confidence_label,
          snapshot.ingredient_count,
          snapshot.resolved_ingredient_count,
          snapshot.missing_cost_count,
          snapshot.stale_cost_count,
          snapshot.ambiguous_cost_count,
          snapshot.unit_mismatch_count,
          snapshot.primary_driver_item_id ?? snapshot.driver_items[0]?.inventory_item_id ?? null,
          snapshot.primary_driver_cost ?? snapshot.driver_items[0]?.line_cost ?? null,
          snapshot.source_run_id ?? null,
          JSON.stringify(snapshot.driver_items ?? []),
          snapshot.updated_at ?? snapshot.snapshot_at,
          existing.id,
        );

      return {
        action: 'updated',
        record: this.getSnapshotById(existing.id),
      };
    }

    const result = this.db
      .prepare(
        `
          INSERT INTO recipe_cost_snapshots (
            recipe_id,
            recipe_version_id,
            recipe_name,
            recipe_type,
            snapshot_at,
            comparable_key,
            yield_qty,
            yield_unit,
            serving_count,
            total_cost,
            resolved_cost_subtotal,
            cost_per_yield_unit,
            cost_per_serving,
            completeness_status,
            confidence_label,
            ingredient_count,
            resolved_ingredient_count,
            missing_cost_count,
            stale_cost_count,
            ambiguous_cost_count,
            unit_mismatch_count,
            primary_driver_item_id,
            primary_driver_cost,
            source_run_id,
            driver_payload,
            created_at,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        snapshot.recipe_id,
        snapshot.recipe_version_id ?? null,
        snapshot.recipe_name,
        snapshot.recipe_type,
        snapshot.snapshot_at,
        comparableKey,
        snapshot.yield_qty,
        snapshot.yield_unit,
        snapshot.serving_count,
        snapshot.total_cost,
        snapshot.resolved_cost_subtotal,
        snapshot.cost_per_yield_unit,
        snapshot.cost_per_serving,
        snapshot.completeness_status,
        snapshot.confidence_label,
        snapshot.ingredient_count,
        snapshot.resolved_ingredient_count,
        snapshot.missing_cost_count,
        snapshot.stale_cost_count,
        snapshot.ambiguous_cost_count,
        snapshot.unit_mismatch_count,
        snapshot.primary_driver_item_id ?? snapshot.driver_items[0]?.inventory_item_id ?? null,
        snapshot.primary_driver_cost ?? snapshot.driver_items[0]?.line_cost ?? null,
        snapshot.source_run_id ?? null,
        JSON.stringify(snapshot.driver_items ?? []),
        snapshot.created_at ?? snapshot.snapshot_at,
        snapshot.updated_at ?? snapshot.snapshot_at,
      );

    return {
      action: 'created',
      record: this.getSnapshotById(Number(result.lastInsertRowid)),
    };
  }

  async upsertIngredientResolution(
    resolution: IngredientCostResolution,
  ): Promise<RecipeCostUpsertResult<IngredientCostResolution>> {
    if (resolution.recipe_cost_snapshot_id === null || resolution.recipe_cost_snapshot_id === undefined) {
      throw new Error('recipe_cost_snapshot_id is required before persisting ingredient resolution logs.');
    }

    const detailJson = JSON.stringify({
      explanation_text: resolution.explanation_text,
      evidence: resolution.evidence,
      detail_json: resolution.detail_json ?? null,
    });
    const chosenSourceRef = resolution.source_ref_table && resolution.source_ref_id
      ? `${resolution.source_ref_table}:${resolution.source_ref_id}`
      : null;

    const result = this.db
      .prepare(
        `
          INSERT INTO ingredient_cost_resolution_log (
            recipe_cost_snapshot_id,
            recipe_id,
            recipe_item_id,
            inventory_item_id,
            inventory_item_name,
            resolution_status,
            chosen_source_type,
            chosen_source_ref,
            normalized_unit_cost,
            base_unit,
            observed_at,
            stale_after_days,
            stale_flag,
            ambiguity_count,
            candidate_count,
            explanation_text,
            detail_json,
            created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        resolution.recipe_cost_snapshot_id,
        resolution.recipe_id,
        String(resolution.recipe_item_id),
        resolution.inventory_item_id,
        resolution.inventory_item_name,
        resolution.status,
        resolution.source_type,
        chosenSourceRef,
        resolution.normalized_unit_cost,
        resolution.base_unit,
        resolution.observed_at,
        resolution.stale_after_days,
        resolution.is_stale ? 1 : 0,
        resolution.ambiguity_count,
        resolution.candidate_count ?? inferCandidateCount(resolution),
        resolution.explanation_text,
        detailJson,
        resolution.created_at ?? resolution.updated_at ?? resolution.observed_at ?? new Date().toISOString(),
      );

    return {
      action: 'created',
      record: this.getResolutionById(Number(result.lastInsertRowid)),
    };
  }

  async upsertIngredientComponent(
    component: RecipeIngredientCostComponent,
  ): Promise<RecipeCostUpsertResult<RecipeIngredientCostComponent>> {
    if (component.recipe_cost_snapshot_id === null || component.recipe_cost_snapshot_id === undefined) {
      throw new Error('recipe_cost_snapshot_id is required before persisting ingredient cost components.');
    }

    const existing = this.db
      .prepare(
        `
          SELECT id
          FROM recipe_ingredient_cost_components
          WHERE recipe_cost_snapshot_id = ?
            AND recipe_item_id = ?
            AND (
              (inventory_item_id IS NULL AND ? IS NULL)
              OR inventory_item_id = ?
            )
          LIMIT 1
        `,
      )
      .get(
        component.recipe_cost_snapshot_id,
        String(component.recipe_item_id),
        component.inventory_item_id,
        component.inventory_item_id,
      ) as { id: number } | undefined;

    const costSourceRef = component.cost_source_ref
      ?? (component.resolution.source_ref_table && component.resolution.source_ref_id
        ? `${component.resolution.source_ref_table}:${component.resolution.source_ref_id}`
        : null);
    const staleFlag = component.stale_flag ?? component.resolution.is_stale;
    const ambiguityFlag = component.ambiguity_flag ?? component.resolution.ambiguity_count > 0;

    if (existing) {
      this.db
        .prepare(
          `
            UPDATE recipe_ingredient_cost_components
            SET ingredient_name = ?,
                quantity_base_unit = ?,
                base_unit = ?,
                resolved_unit_cost = ?,
                extended_cost = ?,
                resolution_status = ?,
                cost_source_type = ?,
                cost_source_ref = ?,
                stale_flag = ?,
                ambiguity_flag = ?,
                created_at = ?
            WHERE id = ?
          `,
        )
        .run(
          component.inventory_item_name,
          component.quantity_base_unit ?? component.normalized_quantity,
          component.base_unit,
          component.resolved_unit_cost ?? component.normalized_unit_cost,
          component.extended_cost ?? component.line_cost,
          component.resolution_status,
          component.cost_source_type ?? component.resolution.source_type ?? null,
          costSourceRef,
          staleFlag ? 1 : 0,
          ambiguityFlag ? 1 : 0,
          component.created_at ?? component.updated_at ?? new Date().toISOString(),
          existing.id,
        );

      return {
        action: 'updated',
        record: this.getComponentById(existing.id),
      };
    }

    const result = this.db
      .prepare(
        `
          INSERT INTO recipe_ingredient_cost_components (
            recipe_cost_snapshot_id,
            recipe_item_id,
            inventory_item_id,
            ingredient_name,
            quantity_base_unit,
            base_unit,
            resolved_unit_cost,
            extended_cost,
            resolution_status,
            cost_source_type,
            cost_source_ref,
            stale_flag,
            ambiguity_flag,
            created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        component.recipe_cost_snapshot_id,
        String(component.recipe_item_id),
        component.inventory_item_id,
        component.inventory_item_name,
        component.quantity_base_unit ?? component.normalized_quantity,
        component.base_unit,
        component.resolved_unit_cost ?? component.normalized_unit_cost,
        component.extended_cost ?? component.line_cost,
        component.resolution_status,
        component.cost_source_type ?? component.resolution.source_type ?? null,
        costSourceRef,
        staleFlag ? 1 : 0,
        ambiguityFlag ? 1 : 0,
        component.created_at ?? component.updated_at ?? new Date().toISOString(),
      );

    return {
      action: 'created',
      record: this.getComponentById(Number(result.lastInsertRowid)),
    };
  }

  async replaceSnapshotResolutions(
    recipeCostSnapshotId: number | string,
    resolutions: IngredientCostResolution[],
  ): Promise<IngredientCostResolution[]> {
    this.db.prepare('DELETE FROM ingredient_cost_resolution_log WHERE recipe_cost_snapshot_id = ?').run(recipeCostSnapshotId);
    const persisted: IngredientCostResolution[] = [];
    for (const resolution of resolutions) {
      const result = await this.upsertIngredientResolution({
        ...resolution,
        recipe_cost_snapshot_id: recipeCostSnapshotId,
      });
      persisted.push(result.record);
    }
    return persisted;
  }

  async replaceSnapshotComponents(
    recipeCostSnapshotId: number | string,
    components: RecipeIngredientCostComponent[],
  ): Promise<RecipeIngredientCostComponent[]> {
    this.db.prepare('DELETE FROM recipe_ingredient_cost_components WHERE recipe_cost_snapshot_id = ?').run(recipeCostSnapshotId);
    const persisted: RecipeIngredientCostComponent[] = [];
    for (const component of components) {
      const result = await this.upsertIngredientComponent({
        ...component,
        recipe_cost_snapshot_id: recipeCostSnapshotId,
      });
      persisted.push(result.record);
    }
    return persisted;
  }

  async getLatestTrustedSnapshot(recipeId: number, recipeVersionId?: number | null): Promise<RecipeCostSnapshot | null> {
    return this.getComparableSnapshotQuery(recipeId, recipeVersionId)
      .get() as RecipeCostSnapshot | null;
  }

  async getLatestComparableSnapshot(recipeId: number, recipeVersionId?: number | null): Promise<RecipeCostSnapshot | null> {
    return this.getLatestTrustedSnapshot(recipeId, recipeVersionId);
  }

  async listTrustedSnapshotsInWindow(windowStart: string, windowEnd: string): Promise<RecipeCostSnapshot[]> {
    const rows = this.db
      .prepare(
        `
          SELECT id
          FROM recipe_cost_snapshots
          WHERE snapshot_at >= ?
            AND snapshot_at <= ?
            AND completeness_status = 'complete'
            AND confidence_label = 'high'
          ORDER BY snapshot_at ASC, id ASC
        `,
      )
      .all(windowStart, windowEnd) as Array<{ id: number }>;

    return rows.map((row) => this.getSnapshotById(row.id));
  }

  async getPreviousComparableSnapshot(
    recipeId: number,
    beforeDate: string,
    recipeVersionId?: number | null,
  ): Promise<RecipeCostSnapshot | null> {
    const row = this.db
      .prepare(
        `
          SELECT id
          FROM recipe_cost_snapshots
          WHERE recipe_id = ?
            AND (? IS NULL OR recipe_version_id = ?)
            AND snapshot_at < ?
            AND completeness_status = 'complete'
            AND confidence_label = 'high'
          ORDER BY snapshot_at DESC, id DESC
          LIMIT 1
        `,
      )
      .get(recipeId, recipeVersionId ?? null, recipeVersionId ?? null, beforeDate) as { id: number } | undefined;

    return row ? this.getSnapshotById(row.id) : null;
  }

  async getIngredientComponentHistory(
    recipeId: number,
    inventoryItemId: number,
    limit = 10,
  ): Promise<RecipeIngredientCostComponent[]> {
    const rows = this.db
      .prepare(
        `
          SELECT c.id
          FROM recipe_ingredient_cost_components c
          JOIN recipe_cost_snapshots s ON s.id = c.recipe_cost_snapshot_id
          WHERE s.recipe_id = ?
            AND c.inventory_item_id = ?
          ORDER BY s.snapshot_at DESC, c.id DESC
          LIMIT ?
        `,
      )
      .all(recipeId, inventoryItemId, limit) as Array<{ id: number }>;

    return rows.map((row) => this.getComponentById(row.id));
  }

  async buildComparableSnapshotComparison(
    snapshot: RecipeCostSnapshot,
    recipeVersionId?: number | null,
  ): Promise<RecipeCostSnapshotComparison> {
    const previous = await this.getPreviousComparableSnapshot(snapshot.recipe_id, snapshot.snapshot_at, recipeVersionId ?? snapshot.recipe_version_id ?? null);
    if (!isComparableSnapshot(snapshot)) {
      return {
        recipe_id: snapshot.recipe_id,
        current_snapshot_id: snapshot.id,
        previous_snapshot_id: previous?.id ?? null,
        comparable: false,
        comparison_reason: 'Current snapshot is not trusted enough for comparison.',
        total_cost_delta: null,
        total_cost_delta_pct: null,
        primary_driver_item_id: null,
        primary_driver_name: null,
        primary_driver_delta_cost: null,
        ingredient_deltas: [],
      };
    }

    if (!previous) {
      return {
        recipe_id: snapshot.recipe_id,
        current_snapshot_id: snapshot.id,
        previous_snapshot_id: null,
        comparable: false,
        comparison_reason: 'No previous trusted comparable snapshot was available.',
        total_cost_delta: null,
        total_cost_delta_pct: null,
        primary_driver_item_id: null,
        primary_driver_name: null,
        primary_driver_delta_cost: null,
        ingredient_deltas: [],
      };
    }

    const currentComponents = await this.getSnapshotComponents(Number(snapshot.id));
    const previousComponents = await this.getSnapshotComponents(Number(previous.id));
    const ingredientDeltas = buildIngredientDeltas(currentComponents, previousComponents);
    const primaryDriver = ingredientDeltas
      .filter((delta) => delta.delta_cost !== null)
      .sort((a, b) => Math.abs(b.delta_cost ?? 0) - Math.abs(a.delta_cost ?? 0))[0] ?? null;
    const totalDelta = snapshot.total_cost !== null && previous.total_cost !== null
      ? roundCurrency(snapshot.total_cost - previous.total_cost)
      : null;
    const totalDeltaPct = totalDelta !== null && previous.total_cost && previous.total_cost > 0
      ? roundRatio(totalDelta / previous.total_cost)
      : null;

    return {
      recipe_id: snapshot.recipe_id,
      current_snapshot_id: snapshot.id,
      previous_snapshot_id: previous.id,
      comparable: true,
      comparison_reason: null,
      total_cost_delta: totalDelta,
      total_cost_delta_pct: totalDeltaPct,
      primary_driver_item_id: primaryDriver?.inventory_item_id ?? null,
      primary_driver_name: primaryDriver?.inventory_item_name ?? null,
      primary_driver_delta_cost: primaryDriver?.delta_cost ?? null,
      ingredient_deltas: ingredientDeltas,
    };
  }

  async listSnapshots(): Promise<RecipeCostSnapshot[]> {
    const rows = this.db.prepare('SELECT id FROM recipe_cost_snapshots ORDER BY snapshot_at DESC, id DESC').all() as Array<{ id: number }>;
    return rows.map((row) => this.getSnapshotById(row.id));
  }

  async listResolutions(): Promise<IngredientCostResolution[]> {
    const rows = this.db.prepare('SELECT id FROM ingredient_cost_resolution_log ORDER BY id ASC').all() as Array<{ id: number }>;
    return rows.map((row) => this.getResolutionById(row.id));
  }

  async listComponents(): Promise<RecipeIngredientCostComponent[]> {
    const rows = this.db.prepare('SELECT id FROM recipe_ingredient_cost_components ORDER BY id ASC').all() as Array<{ id: number }>;
    return rows.map((row) => this.getComponentById(row.id));
  }

  async listRuns(): Promise<RecipeCostRunRecord[]> {
    const rows = this.db.prepare('SELECT id FROM recipe_cost_runs ORDER BY id ASC').all() as Array<{ id: number }>;
    return rows.map((row) => this.getRunById(row.id));
  }

  private getComparableSnapshotQuery(recipeId: number, recipeVersionId?: number | null) {
    const row = this.db
      .prepare(
        `
          SELECT id
          FROM recipe_cost_snapshots
          WHERE recipe_id = ?
            AND (? IS NULL OR recipe_version_id = ?)
            AND completeness_status = 'complete'
            AND confidence_label = 'high'
          ORDER BY snapshot_at DESC, id DESC
          LIMIT 1
        `,
      )
      .get(recipeId, recipeVersionId ?? null, recipeVersionId ?? null) as { id: number } | undefined;

    return {
      get: () => (row ? this.getSnapshotById(row.id) : null),
    };
  }

  private getSnapshotById(id: number): RecipeCostSnapshot {
    const row = this.db
      .prepare('SELECT * FROM recipe_cost_snapshots WHERE id = ? LIMIT 1')
      .get(id) as SnapshotRow | undefined;
    if (!row) {
      throw new Error(`Recipe cost snapshot ${id} not found.`);
    }

    const components = this.getSnapshotComponents(id);
    return mapSnapshotRow(row, components);
  }

  private getSnapshotComponents(id: number): RecipeIngredientCostComponent[] {
    const rows = this.db
      .prepare('SELECT id FROM recipe_ingredient_cost_components WHERE recipe_cost_snapshot_id = ? ORDER BY id ASC')
      .all(id) as Array<{ id: number }>;
    return rows.map((row) => this.getComponentById(row.id));
  }

  private getResolutionById(id: number): IngredientCostResolution {
    const row = this.db
      .prepare('SELECT * FROM ingredient_cost_resolution_log WHERE id = ? LIMIT 1')
      .get(id) as ResolutionRow | undefined;
    if (!row) {
      throw new Error(`Ingredient cost resolution ${id} not found.`);
    }
    return mapResolutionRow(row);
  }

  private getComponentById(id: number): RecipeIngredientCostComponent {
    const row = this.db
      .prepare('SELECT * FROM recipe_ingredient_cost_components WHERE id = ? LIMIT 1')
      .get(id) as ComponentRow | undefined;
    if (!row) {
      throw new Error(`Recipe ingredient cost component ${id} not found.`);
    }

    const resolution = this.db
      .prepare(
        `
          SELECT id
          FROM ingredient_cost_resolution_log
          WHERE recipe_cost_snapshot_id = ?
            AND recipe_item_id = ?
            AND (
              (inventory_item_id IS NULL AND ? IS NULL)
              OR inventory_item_id = ?
            )
          ORDER BY id DESC
          LIMIT 1
        `,
      )
      .get(row.recipe_cost_snapshot_id, row.recipe_item_id, row.inventory_item_id, row.inventory_item_id) as { id: number } | undefined;

    return mapComponentRow(row, resolution ? this.getResolutionById(resolution.id) : buildFallbackResolution(row));
  }

  private getRunById(id: number): RecipeCostRunRecord {
    const row = this.db.prepare('SELECT * FROM recipe_cost_runs WHERE id = ? LIMIT 1').get(id) as RunRow | undefined;
    if (!row) {
      throw new Error(`Recipe cost run ${id} not found.`);
    }
    return {
      id: row.id,
      started_at: row.started_at,
      completed_at: row.completed_at,
      snapshots_created: row.snapshots_created,
      snapshots_updated: row.snapshots_updated,
      complete_snapshots: row.complete_snapshots,
      partial_snapshots: row.partial_snapshots,
      incomplete_snapshots: row.incomplete_snapshots,
      status: row.status,
      notes: row.notes,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }
}

type SnapshotRow = {
  id: number;
  recipe_id: number;
  recipe_version_id: number | null;
  recipe_name: string;
  recipe_type: RecipeCostSnapshot['recipe_type'];
  snapshot_at: string;
  comparable_key: string;
  yield_qty: number | null;
  yield_unit: string | null;
  serving_count: number | null;
  total_cost: number | null;
  resolved_cost_subtotal: number;
  cost_per_yield_unit: number | null;
  cost_per_serving: number | null;
  completeness_status: RecipeCostSnapshot['completeness_status'];
  confidence_label: RecipeCostSnapshot['confidence_label'];
  ingredient_count: number;
  resolved_ingredient_count: number;
  missing_cost_count: number;
  stale_cost_count: number;
  ambiguous_cost_count: number;
  unit_mismatch_count: number;
  primary_driver_item_id: number | null;
  primary_driver_cost: number | null;
  source_run_id: number | null;
  driver_payload: string;
  created_at: string;
  updated_at: string;
};

type ResolutionRow = {
  id: number;
  recipe_cost_snapshot_id: number;
  recipe_id: number;
  recipe_item_id: string;
  inventory_item_id: number | null;
  inventory_item_name: string;
  resolution_status: IngredientCostResolution['status'];
  chosen_source_type: IngredientCostResolution['source_type'];
  chosen_source_ref: string | null;
  normalized_unit_cost: number | null;
  base_unit: string;
  observed_at: string | null;
  stale_after_days: number | null;
  stale_flag: number;
  ambiguity_count: number;
  candidate_count: number;
  explanation_text: string;
  detail_json: string;
  created_at: string;
};

type ComponentRow = {
  id: number;
  recipe_cost_snapshot_id: number;
  recipe_item_id: string;
  inventory_item_id: number | null;
  ingredient_name: string;
  quantity_base_unit: number | null;
  base_unit: string;
  resolved_unit_cost: number | null;
  extended_cost: number | null;
  resolution_status: RecipeIngredientCostComponent['resolution_status'];
  cost_source_type: RecipeIngredientCostComponent['cost_source_type'];
  cost_source_ref: string | null;
  stale_flag: number;
  ambiguity_flag: number;
  created_at: string;
};

type RunRow = {
  id: number;
  started_at: string;
  completed_at: string | null;
  snapshots_created: number;
  snapshots_updated: number;
  complete_snapshots: number;
  partial_snapshots: number;
  incomplete_snapshots: number;
  status: RecipeCostRunRecord['status'];
  notes: string | null;
  created_at: string;
  updated_at: string;
};

function mapSnapshotRow(row: SnapshotRow, components: RecipeIngredientCostComponent[]): RecipeCostSnapshot {
  const driverItems = safeJsonParse(row.driver_payload, []) as RecipeCostSnapshot['driver_items'];
  return {
    id: row.id,
    recipe_id: row.recipe_id,
    recipe_version_id: row.recipe_version_id,
    recipe_name: row.recipe_name,
    recipe_type: row.recipe_type,
    yield_qty: row.yield_qty,
    yield_unit: row.yield_unit,
    serving_count: row.serving_count,
    total_cost: row.total_cost,
    resolved_cost_subtotal: row.resolved_cost_subtotal,
    cost_per_yield_unit: row.cost_per_yield_unit,
    cost_per_serving: row.cost_per_serving,
    completeness_status: row.completeness_status,
    confidence_label: row.confidence_label,
    ingredient_count: row.ingredient_count,
    resolved_ingredient_count: row.resolved_ingredient_count,
    missing_cost_count: row.missing_cost_count,
    stale_cost_count: row.stale_cost_count,
    ambiguous_cost_count: row.ambiguous_cost_count,
    unit_mismatch_count: row.unit_mismatch_count,
    comparable_key: row.comparable_key,
    source_run_id: row.source_run_id,
    primary_driver_item_id: row.primary_driver_item_id,
    primary_driver_cost: row.primary_driver_cost,
    driver_items: driverItems,
    components,
    snapshot_at: row.snapshot_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapResolutionRow(row: ResolutionRow): IngredientCostResolution {
  const detail = safeJsonParse(row.detail_json, {}) as {
    evidence?: IngredientCostResolution['evidence'];
    detail_json?: Record<string, unknown> | null;
  };
  const chosenRefParts = row.chosen_source_ref?.split(':') ?? [];
  return {
    id: row.id,
    recipe_cost_snapshot_id: row.recipe_cost_snapshot_id,
    recipe_id: row.recipe_id,
    recipe_name: '',
    recipe_item_id: row.recipe_item_id,
    inventory_item_id: row.inventory_item_id,
    inventory_item_name: row.inventory_item_name,
    source_type: row.chosen_source_type,
    status: row.resolution_status,
    normalized_unit_cost: row.normalized_unit_cost,
    base_unit: row.base_unit,
    source_ref_table: chosenRefParts.length > 1 ? chosenRefParts[0]! : null,
    source_ref_id: chosenRefParts.length > 1 ? chosenRefParts.slice(1).join(':') : row.chosen_source_ref,
    observed_at: row.observed_at,
    stale_after_days: row.stale_after_days,
    is_stale: row.stale_flag === 1,
    ambiguity_count: row.ambiguity_count,
    candidate_count: row.candidate_count,
    explanation_text: row.explanation_text,
    evidence: detail.evidence ?? [],
    detail_json: detail.detail_json ?? {},
    created_at: row.created_at,
    updated_at: row.created_at,
  };
}

function mapComponentRow(row: ComponentRow, resolution: IngredientCostResolution): RecipeIngredientCostComponent {
  return {
    id: row.id,
    recipe_cost_snapshot_id: row.recipe_cost_snapshot_id,
    recipe_id: resolution.recipe_id,
    recipe_name: resolution.recipe_name,
    recipe_item_id: row.recipe_item_id,
    inventory_item_id: row.inventory_item_id,
    inventory_item_name: row.ingredient_name,
    quantity_in_recipe: row.quantity_base_unit ?? 0,
    recipe_unit: row.base_unit,
    normalized_quantity: row.quantity_base_unit,
    quantity_base_unit: row.quantity_base_unit,
    base_unit: row.base_unit,
    normalized_unit_cost: row.resolved_unit_cost,
    resolved_unit_cost: row.resolved_unit_cost,
    line_cost: row.extended_cost,
    extended_cost: row.extended_cost,
    resolution_status: row.resolution_status,
    cost_source_type: row.cost_source_type,
    cost_source_ref: row.cost_source_ref,
    stale_flag: row.stale_flag === 1,
    ambiguity_flag: row.ambiguity_flag === 1,
    resolution,
    created_at: row.created_at,
    updated_at: row.created_at,
  };
}

function buildFallbackResolution(row: ComponentRow): IngredientCostResolution {
  return {
    id: `fallback:${row.id}`,
    recipe_cost_snapshot_id: row.recipe_cost_snapshot_id,
    recipe_id: 0,
    recipe_name: '',
    recipe_item_id: row.recipe_item_id,
    inventory_item_id: row.inventory_item_id,
    inventory_item_name: row.ingredient_name,
    source_type: row.cost_source_type ?? null,
    status: row.resolution_status,
    normalized_unit_cost: row.resolved_unit_cost,
    base_unit: row.base_unit,
    source_ref_table: null,
    source_ref_id: row.cost_source_ref,
    observed_at: null,
    stale_after_days: null,
    is_stale: row.stale_flag === 1,
    ambiguity_count: row.ambiguity_flag === 1 ? 1 : 0,
    candidate_count: row.ambiguity_flag === 1 ? 2 : 1,
    explanation_text: 'Fallback resolution reconstructed from persisted component row.',
    evidence: [],
    detail_json: {},
    created_at: row.created_at,
    updated_at: row.created_at,
  };
}

function buildIngredientDeltas(
  currentComponents: RecipeIngredientCostComponent[],
  previousComponents: RecipeIngredientCostComponent[],
): RecipeCostIngredientDelta[] {
  const resolvedPrevious = previousComponents.filter(
    (component): component is RecipeIngredientCostComponent & { inventory_item_id: number } => component.inventory_item_id !== null,
  );
  const resolvedCurrent = currentComponents.filter(
    (component): component is RecipeIngredientCostComponent & { inventory_item_id: number } => component.inventory_item_id !== null,
  );
  const previousByItem = new Map(resolvedPrevious.map((component) => [component.inventory_item_id, component]));
  return resolvedCurrent.map((component) => {
    const previous = previousByItem.get(component.inventory_item_id);
    const currentCost = component.line_cost ?? component.extended_cost ?? null;
    const previousCost = previous?.line_cost ?? previous?.extended_cost ?? null;
    const deltaCost = currentCost !== null && previousCost !== null ? roundCurrency(currentCost - previousCost) : null;
    const deltaPct = deltaCost !== null && previousCost && previousCost > 0 ? roundRatio(deltaCost / previousCost) : null;
    return {
      inventory_item_id: component.inventory_item_id,
      inventory_item_name: component.inventory_item_name,
      current_cost: currentCost,
      previous_cost: previousCost,
      delta_cost: deltaCost,
      delta_pct: deltaPct,
    };
  });
}

function inferCandidateCount(resolution: IngredientCostResolution): number {
  if (resolution.candidate_count !== undefined) {
    return resolution.candidate_count;
  }
  if (resolution.status === 'ambiguous_cost') {
    return Math.max(2, resolution.ambiguity_count);
  }
  return resolution.source_type ? 1 : 0;
}

function defaultComparableKey(snapshot: RecipeCostSnapshot): string {
  const snapshotBucket = snapshot.snapshot_at.slice(0, 10);
  return `${snapshot.recipe_id}:${snapshot.recipe_version_id ?? 'legacy'}:${snapshotBucket}`;
}

function isComparableSnapshot(snapshot: RecipeCostSnapshot): boolean {
  return snapshot.completeness_status === 'complete' && snapshot.confidence_label === 'high';
}

function safeJsonParse<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundRatio(value: number): number {
  return Math.round(value * 10000) / 10000;
}
