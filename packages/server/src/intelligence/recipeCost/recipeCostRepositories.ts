import type {
  IngredientCostResolution,
  RecipeCostIngredientDelta,
  RecipeCostRunRecord,
  RecipeCostRunSummary,
  RecipeCostSnapshot,
  RecipeCostSnapshotComparison,
  RecipeIngredientCostComponent,
} from '@fifoflow/shared';
import type {
  IngredientCostCandidate,
  PromotedRecipeSourceRecord,
  PromotedRecipeSourceRow,
  RecipeCostOperationalReadRepository,
  RecipeCostPersistenceRepository,
  RecipeCostSource,
  RecipeDefinition,
  RecipeCostUpsertResult,
} from './types.js';
import type { IntelligenceJobContext } from '../types.js';
import Database from 'better-sqlite3';
import { initializeRecipePromotionDb } from '../../recipes/promotion/persistence/sqliteSchema.js';
import { initializeCanonicalIngredientDb } from '../../mapping/ingredients/persistence/sqliteSchema.js';

export class StaticRecipeCostSource implements RecipeCostSource {
  constructor(
    private readonly recipes: RecipeDefinition[],
    private readonly candidates: IngredientCostCandidate[],
  ) {}

  async listRecipeDefinitions(_context: IntelligenceJobContext): Promise<RecipeDefinition[]> {
    return structuredClone(this.recipes);
  }

  async listIngredientCostCandidates(_context: IntelligenceJobContext): Promise<IngredientCostCandidate[]> {
    return structuredClone(this.candidates);
  }
}

export class SQLiteOperationalRecipeCostReadRepository implements RecipeCostOperationalReadRepository {
  constructor(private readonly db: Database.Database) {
    initializeRecipePromotionDb(db);
    initializeCanonicalIngredientDb(db);
  }

  async listPromotedRecipes(context: IntelligenceJobContext): Promise<PromotedRecipeSourceRecord[]> {
    const rows = (context.scope.recipeId != null
      ? this.db.prepare(
          `
            SELECT
              rv.id AS recipe_version_id,
              rv.recipe_id,
              r.name AS recipe_name,
              r.type AS recipe_type,
              rv.yield_quantity AS yield_qty,
              rv.yield_unit,
              NULL AS serving_count,
              rv.source_builder_job_id,
              rv.source_builder_draft_recipe_id,
              rv.source_template_id,
              rv.source_template_version_id
            FROM recipe_versions rv
            INNER JOIN recipes r ON r.id = rv.recipe_id
            WHERE rv.status = 'active'
              AND rv.recipe_id = ?
            ORDER BY rv.recipe_id ASC, rv.version_number DESC
          `,
        ).all(context.scope.recipeId)
      : this.db.prepare(
          `
            SELECT
              rv.id AS recipe_version_id,
              rv.recipe_id,
              r.name AS recipe_name,
              r.type AS recipe_type,
              rv.yield_quantity AS yield_qty,
              rv.yield_unit,
              NULL AS serving_count,
              rv.source_builder_job_id,
              rv.source_builder_draft_recipe_id,
              rv.source_template_id,
              rv.source_template_version_id
            FROM recipe_versions rv
            INNER JOIN recipes r ON r.id = rv.recipe_id
            WHERE rv.status = 'active'
            ORDER BY rv.recipe_id ASC, rv.version_number DESC
          `,
        ).all()) as Array<{
      recipe_version_id: number;
      recipe_id: number;
      recipe_name: string;
      recipe_type: RecipeDefinition['recipe_type'];
      yield_qty: number | null;
      yield_unit: string | null;
      serving_count: number | null;
      source_builder_job_id: number | null;
      source_builder_draft_recipe_id: number | null;
      source_template_id: number | null;
      source_template_version_id: number | null;
    }>;

    return rows.map((row) => ({
      recipe_id: row.recipe_id,
      recipe_version_id: row.recipe_version_id,
      recipe_name: row.recipe_name,
      recipe_type: row.recipe_type,
      yield_qty: row.yield_qty,
      yield_unit: row.yield_unit,
      serving_count: row.serving_count,
      source_builder_job_id: row.source_builder_job_id,
      source_builder_draft_recipe_id: row.source_builder_draft_recipe_id,
      source_template_id: row.source_template_id,
      source_template_version_id: row.source_template_version_id,
    }));
  }

  async listPromotedRecipeIngredients(recipeVersionId: number | string): Promise<PromotedRecipeSourceRow[]> {
    const rows = this.db.prepare(
      `
        SELECT
          id AS recipe_item_id,
          recipe_version_id,
          line_index,
          raw_ingredient_text,
          canonical_ingredient_id,
          quantity_normalized,
          unit_normalized,
          preparation_note,
          inventory_item_id AS existing_inventory_item_id
        FROM recipe_ingredients
        WHERE recipe_version_id = ?
        ORDER BY line_index ASC
      `,
    ).all(recipeVersionId) as Array<{
      recipe_item_id: number;
      recipe_version_id: number;
      line_index: number;
      raw_ingredient_text: string;
      canonical_ingredient_id: number | null;
      quantity_normalized: number;
      unit_normalized: string;
      preparation_note: string | null;
      existing_inventory_item_id: number | null;
    }>;

    return rows.map((row) => ({
      recipe_item_id: row.recipe_item_id,
      recipe_version_id: row.recipe_version_id,
      line_index: row.line_index,
      raw_ingredient_text: row.raw_ingredient_text,
      canonical_ingredient_id: row.canonical_ingredient_id,
      quantity_normalized: row.quantity_normalized,
      unit_normalized: row.unit_normalized,
      preparation_note: row.preparation_note,
      existing_inventory_item_id: row.existing_inventory_item_id,
    }));
  }

  async getCanonicalIngredientName(canonicalIngredientId: number | string): Promise<string | null> {
    const row = this.db.prepare(
      `
        SELECT canonical_name
        FROM canonical_ingredients
        WHERE id = ?
          AND active = 1
        LIMIT 1
      `,
    ).get(canonicalIngredientId) as { canonical_name: string } | undefined;
    return row?.canonical_name ?? null;
  }
}

export class SQLiteVendorPriceRecipeCostCandidateSource implements Pick<RecipeCostSource, 'listIngredientCostCandidates'> {
  constructor(private readonly db: Database.Database) {}

  async listIngredientCostCandidates(_context: IntelligenceJobContext): Promise<IngredientCostCandidate[]> {
    const rows = this.db.prepare(
      `
        SELECT
          vp.id,
          vp.item_id,
          i.name AS item_name,
          i.unit AS item_unit,
          vp.order_unit,
          vp.order_unit_price,
          vp.qty_per_unit,
          vp.vendor_id,
          v.name AS vendor_name,
          vp.created_at,
          vp.updated_at
        FROM vendor_prices vp
        INNER JOIN items i ON i.id = vp.item_id
        LEFT JOIN vendors v ON v.id = vp.vendor_id
        ORDER BY vp.is_default DESC, vp.updated_at DESC, vp.id DESC
      `,
    ).all() as Array<{
      id: number;
      item_id: number;
      item_name: string;
      item_unit: string;
      order_unit: string | null;
      order_unit_price: number;
      qty_per_unit: number | null;
      vendor_id: number | null;
      vendor_name: string | null;
      created_at: string;
      updated_at: string;
    }>;

    return rows.flatMap((row) => {
      const normalizedUnitCost = normalizeVendorPriceCandidate(row);
      if (normalizedUnitCost === null) {
        return [];
      }

      return [{
        inventory_item_id: row.item_id,
        inventory_item_name: row.item_name,
        source_type: 'vendor_price_history' as const,
        normalized_unit_cost: normalizedUnitCost,
        base_unit: row.item_unit,
        observed_at: row.updated_at ?? row.created_at,
        source_ref_table: 'vendor_prices',
        source_ref_id: String(row.id),
        vendor_id: row.vendor_id,
        vendor_name: row.vendor_name,
        evidence: row.vendor_id == null ? [] : [{
          source_table: 'vendor_prices',
          source_primary_key: String(row.id),
          observed_at: row.updated_at ?? row.created_at,
          payload: {
            order_unit: row.order_unit,
            order_unit_price: row.order_unit_price,
            qty_per_unit: row.qty_per_unit,
            vendor_id: row.vendor_id,
            vendor_name: row.vendor_name,
          },
        }],
      }];
    });
  }
}

export class InMemoryRecipeCostPersistenceRepository implements RecipeCostPersistenceRepository {
  private nextSnapshotId = 1;
  private nextResolutionId = 1;
  private nextComponentId = 1;
  private nextRunId = 1;

  private readonly snapshots = new Map<string, RecipeCostSnapshot>();
  private readonly resolutions = new Map<number | string, IngredientCostResolution[]>();
  private readonly components = new Map<number | string, RecipeIngredientCostComponent[]>();
  private readonly runs = new Map<number, RecipeCostRunRecord>();

  async withTransaction<T>(work: () => Promise<T>): Promise<T> {
    return work();
  }

  async startRun(startedAt: string): Promise<RecipeCostRunRecord> {
    const run: RecipeCostRunRecord = {
      id: this.nextRunId++,
      started_at: startedAt,
      completed_at: null,
      snapshots_created: 0,
      snapshots_updated: 0,
      complete_snapshots: 0,
      partial_snapshots: 0,
      incomplete_snapshots: 0,
      status: 'running',
      notes: null,
      created_at: startedAt,
      updated_at: startedAt,
    };

    this.runs.set(Number(run.id), run);
    return structuredClone(run);
  }

  async completeRun(
    runId: number | string,
    status: RecipeCostRunRecord['status'],
    summary: RecipeCostRunSummary,
    completedAt: string,
    notes: string | null = null,
  ): Promise<RecipeCostRunRecord> {
    const numericRunId = Number(runId);
    const existing = this.runs.get(numericRunId);
    if (!existing) {
      throw new Error(`Unknown recipe cost run ${runId}.`);
    }

    const updated: RecipeCostRunRecord = {
      ...existing,
      status,
      completed_at: completedAt,
      snapshots_created: summary.snapshots_created,
      snapshots_updated: summary.snapshots_updated,
      complete_snapshots: summary.complete_snapshots,
      partial_snapshots: summary.partial_snapshots,
      incomplete_snapshots: summary.incomplete_snapshots,
      notes,
      updated_at: completedAt,
    };
    this.runs.set(numericRunId, updated);
    return structuredClone(updated);
  }

  async upsertSnapshot(snapshot: RecipeCostSnapshot): Promise<RecipeCostUpsertResult<RecipeCostSnapshot>> {
    const comparableKey = snapshot.comparable_key ?? defaultComparableKey(snapshot);
    const existing = this.snapshots.get(comparableKey);
    const record: RecipeCostSnapshot = {
      ...structuredClone(snapshot),
      id: existing?.id ?? this.nextSnapshotId++,
      comparable_key: comparableKey,
      created_at: existing?.created_at ?? snapshot.created_at ?? snapshot.snapshot_at,
      updated_at: snapshot.updated_at ?? snapshot.snapshot_at,
    };

    this.snapshots.set(comparableKey, record);
    return {
      action: existing ? 'updated' : 'created',
      record: structuredClone(record),
    };
  }

  async upsertIngredientResolution(
    resolution: IngredientCostResolution,
  ): Promise<RecipeCostUpsertResult<IngredientCostResolution>> {
    const record: IngredientCostResolution = {
      ...structuredClone(resolution),
      id: resolution.id ?? this.nextResolutionId++,
      created_at: resolution.created_at ?? new Date().toISOString(),
      updated_at: resolution.updated_at ?? resolution.created_at ?? new Date().toISOString(),
    };
    return { action: 'created', record };
  }

  async upsertIngredientComponent(
    component: RecipeIngredientCostComponent,
  ): Promise<RecipeCostUpsertResult<RecipeIngredientCostComponent>> {
    const record: RecipeIngredientCostComponent = {
      ...structuredClone(component),
      id: component.id ?? this.nextComponentId++,
      created_at: component.created_at ?? new Date().toISOString(),
      updated_at: component.updated_at ?? component.created_at ?? new Date().toISOString(),
    };
    return { action: 'created', record };
  }

  async replaceSnapshotResolutions(
    recipeCostSnapshotId: number | string,
    resolutions: IngredientCostResolution[],
  ): Promise<IngredientCostResolution[]> {
    const persisted = resolutions.map((resolution) => ({
      ...structuredClone(resolution),
      id: this.nextResolutionId++,
      recipe_cost_snapshot_id: recipeCostSnapshotId,
      created_at: resolution.created_at ?? new Date().toISOString(),
      updated_at: resolution.updated_at ?? resolution.created_at ?? new Date().toISOString(),
    }));
    this.resolutions.set(recipeCostSnapshotId, persisted);
    return structuredClone(persisted);
  }

  async replaceSnapshotComponents(
    recipeCostSnapshotId: number | string,
    components: RecipeIngredientCostComponent[],
  ): Promise<RecipeIngredientCostComponent[]> {
    const resolutionIndex = new Map(
      (this.resolutions.get(recipeCostSnapshotId) ?? []).map((resolution) => [
        `${resolution.recipe_item_id}:${resolution.inventory_item_id ?? 'unresolved'}`,
        resolution,
      ]),
    );
    const persisted = components.map((component) => {
      const resolution = resolutionIndex.get(`${component.recipe_item_id}:${component.inventory_item_id ?? 'unresolved'}`) ?? component.resolution;
      return {
        ...structuredClone(component),
        id: this.nextComponentId++,
        recipe_cost_snapshot_id: recipeCostSnapshotId,
        resolution,
        created_at: component.created_at ?? new Date().toISOString(),
        updated_at: component.updated_at ?? component.created_at ?? new Date().toISOString(),
      };
    });
    this.components.set(recipeCostSnapshotId, persisted);
    return structuredClone(persisted);
  }

  async getLatestTrustedSnapshot(recipeId: number, recipeVersionId?: number | null): Promise<RecipeCostSnapshot | null> {
    return this.findComparableSnapshots(recipeId, recipeVersionId)[0] ?? null;
  }

  async getLatestComparableSnapshot(recipeId: number, recipeVersionId?: number | null): Promise<RecipeCostSnapshot | null> {
    return this.getLatestTrustedSnapshot(recipeId, recipeVersionId);
  }

  async listTrustedSnapshotsInWindow(windowStart: string, windowEnd: string): Promise<RecipeCostSnapshot[]> {
    return [...this.snapshots.values()]
      .filter((snapshot) => isComparableSnapshot(snapshot))
      .filter((snapshot) => snapshot.snapshot_at >= windowStart && snapshot.snapshot_at <= windowEnd)
      .sort((a, b) => a.snapshot_at.localeCompare(b.snapshot_at))
      .map((snapshot) => structuredClone(snapshot));
  }

  async getPreviousComparableSnapshot(
    recipeId: number,
    beforeDate: string,
    recipeVersionId?: number | null,
  ): Promise<RecipeCostSnapshot | null> {
    return this.findComparableSnapshots(recipeId, recipeVersionId).find((snapshot) => snapshot.snapshot_at < beforeDate) ?? null;
  }

  async getIngredientComponentHistory(
    recipeId: number,
    inventoryItemId: number,
    limit = 10,
  ): Promise<RecipeIngredientCostComponent[]> {
    return [...this.components.values()]
      .flat()
      .filter((component) => component.recipe_id === recipeId && component.inventory_item_id === inventoryItemId)
      .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))
      .slice(0, limit)
      .map((component) => structuredClone(component));
  }

  async buildComparableSnapshotComparison(
    snapshot: RecipeCostSnapshot,
    recipeVersionId?: number | null,
  ): Promise<RecipeCostSnapshotComparison> {
    if (!isComparableSnapshot(snapshot)) {
      return buildNonComparableResult(snapshot, null, 'Current snapshot is not trusted enough for comparison.');
    }

    const previous = await this.getPreviousComparableSnapshot(snapshot.recipe_id, snapshot.snapshot_at, recipeVersionId ?? snapshot.recipe_version_id ?? null);
    if (!previous) {
      return buildNonComparableResult(snapshot, null, 'No previous trusted comparable snapshot was available.');
    }

    const currentComponents = this.components.get(snapshot.id) ?? [];
    const previousComponents = this.components.get(previous.id) ?? [];
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
    return [...this.snapshots.values()].map((snapshot) => structuredClone(snapshot));
  }

  async listResolutions(): Promise<IngredientCostResolution[]> {
    return [...this.resolutions.values()].flat().map((resolution) => structuredClone(resolution));
  }

  async listComponents(): Promise<RecipeIngredientCostComponent[]> {
    return [...this.components.values()].flat().map((component) => structuredClone(component));
  }

  private findComparableSnapshots(recipeId: number, recipeVersionId?: number | null): RecipeCostSnapshot[] {
    return [...this.snapshots.values()]
      .filter((snapshot) => snapshot.recipe_id === recipeId)
      .filter((snapshot) => recipeVersionId === undefined || recipeVersionId === null ? true : snapshot.recipe_version_id === recipeVersionId)
      .filter((snapshot) => isComparableSnapshot(snapshot))
      .sort((a, b) => b.snapshot_at.localeCompare(a.snapshot_at));
  }
}

function defaultComparableKey(snapshot: RecipeCostSnapshot): string {
  return `${snapshot.recipe_id}:${snapshot.recipe_version_id ?? 'legacy'}:${snapshot.snapshot_at.slice(0, 10)}`;
}

function normalizeVendorPriceCandidate(row: {
  item_unit: string;
  order_unit: string | null;
  order_unit_price: number;
  qty_per_unit: number | null;
}): number | null {
  if (row.qty_per_unit !== null && row.qty_per_unit > 0) {
    return roundCurrency(row.order_unit_price / row.qty_per_unit);
  }

  if (row.order_unit === null || row.order_unit === row.item_unit) {
    return roundCurrency(row.order_unit_price);
  }

  return null;
}

function isComparableSnapshot(snapshot: RecipeCostSnapshot): boolean {
  return snapshot.completeness_status === 'complete' && snapshot.confidence_label === 'high';
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

function buildNonComparableResult(
  snapshot: RecipeCostSnapshot,
  previousSnapshotId: number | string | null,
  reason: string,
): RecipeCostSnapshotComparison {
  return {
    recipe_id: snapshot.recipe_id,
    current_snapshot_id: snapshot.id,
    previous_snapshot_id: previousSnapshotId,
    comparable: false,
    comparison_reason: reason,
    total_cost_delta: null,
    total_cost_delta_pct: null,
    primary_driver_item_id: null,
    primary_driver_name: null,
    primary_driver_delta_cost: null,
    ingredient_deltas: [],
  };
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundRatio(value: number): number {
  return Math.round(value * 10000) / 10000;
}
