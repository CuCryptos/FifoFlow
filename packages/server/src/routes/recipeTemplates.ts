import { Router } from 'express';
import type Database from 'better-sqlite3';
import { UNITS } from '@fifoflow/shared';

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

  router.get('/:templateId', (req, res) => {
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

    const ingredients = db.prepare(
      `
        SELECT
          ingredient_name,
          qty,
          unit,
          sort_order
        FROM recipe_template_ingredients
        WHERE recipe_template_version_id = ?
        ORDER BY sort_order ASC
      `,
    ).all(summary.active_version_id) as Array<{
      ingredient_name: string;
      qty: number;
      unit: string;
      sort_order: number;
    }>;

    res.json({
      ...summary,
      yield_unit: normalizeTemplateUnit(summary.yield_unit),
      ingredient_count: ingredients.length,
      ingredients: ingredients.map((ingredient) => ({
        ...ingredient,
        unit: normalizeTemplateUnit(ingredient.unit),
      })),
    });
  });

  return router;
}
