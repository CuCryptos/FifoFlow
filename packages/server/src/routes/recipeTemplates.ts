import { Router } from 'express';
import type Database from 'better-sqlite3';
import { UNITS } from '@fifoflow/shared';
import { SQLiteRecipeBuilderRepository } from '../recipes/builder/index.js';

function normalizeTemplateUnit(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  const exact = UNITS.find((unit) => unit.toLowerCase() === normalized);
  if (exact) {
    return exact;
  }

  if (normalized === 'l') {
    return 'L';
  }

  return value;
}

export function createRecipeTemplateRoutes(db: Database.Database): Router {
  const router = Router();
  const builderRepository = new SQLiteRecipeBuilderRepository(db);

  router.get('/', (_req, res) => {
    const templates = db.prepare(
      `
        SELECT
          t.id AS template_id,
          t.name,
          t.category,
          v.id AS active_version_id,
          v.version_number AS active_version_number,
          v.yield_quantity,
          v.yield_unit,
          COUNT(i.id) AS ingredient_count
        FROM recipe_templates t
        INNER JOIN recipe_template_versions v
          ON v.recipe_template_id = t.id
         AND v.is_active = 1
        LEFT JOIN recipe_template_ingredients i
          ON i.recipe_template_version_id = v.id
        GROUP BY t.id, t.name, t.category, v.id, v.version_number, v.yield_quantity, v.yield_unit
        ORDER BY t.name COLLATE NOCASE ASC
      `,
    ).all() as Array<{
      template_id: number;
      name: string;
      category: string;
      active_version_id: number;
      active_version_number: number;
      yield_quantity: number;
      yield_unit: string;
      ingredient_count: number;
    }>;

    res.json({
      templates: templates.map((template) => ({
        ...template,
        yield_unit: normalizeTemplateUnit(template.yield_unit),
      })),
    });
  });

  router.get('/:templateId', async (req, res) => {
    const templateId = Number(req.params.templateId);
    if (!Number.isInteger(templateId) || templateId <= 0) {
      res.status(400).json({ error: 'Template id must be a positive integer.' });
      return;
    }

    const summary = db.prepare(
      `
        SELECT
          t.id AS template_id,
          t.name,
          t.category,
          v.id AS active_version_id,
          v.version_number AS active_version_number,
          v.yield_quantity,
          v.yield_unit
        FROM recipe_templates t
        INNER JOIN recipe_template_versions v
          ON v.recipe_template_id = t.id
         AND v.is_active = 1
        WHERE t.id = ?
        LIMIT 1
      `,
    ).get(templateId) as {
      template_id: number;
      name: string;
      category: string;
      active_version_id: number;
      active_version_number: number;
      yield_quantity: number;
      yield_unit: string;
    } | undefined;

    if (!summary) {
      res.status(404).json({ error: 'Recipe template not found.' });
      return;
    }

    const ingredients = await builderRepository.listTemplateSourceRows(templateId, summary.active_version_id);

    res.json({
      ...summary,
      yield_unit: normalizeTemplateUnit(summary.yield_unit),
      ingredient_count: ingredients.length,
      ingredients: ingredients.map((ingredient) => ({
        ingredient_name: ingredient.ingredient_name,
        qty: ingredient.qty,
        unit: normalizeTemplateUnit(ingredient.unit),
        sort_order: ingredient.sort_order,
        template_canonical_ingredient_id: ingredient.mapped_canonical_ingredient_id == null
          ? null
          : Number(ingredient.mapped_canonical_ingredient_id),
        template_canonical_name: ingredient.mapped_canonical_name,
        template_mapping_status: ingredient.template_mapping_status,
      })),
    });
  });

  return router;
}
