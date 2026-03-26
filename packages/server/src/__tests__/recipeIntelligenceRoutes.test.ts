import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import Database from 'better-sqlite3';
import { initializeDb } from '../db.js';
import { createRecipeIntelligenceRoutes } from '../routes/recipeIntelligence.js';
import { SQLiteRecipeBuilderRepository } from '../recipes/builder/index.js';

describe('Recipe intelligence routes', () => {
  let db: Database.Database;
  let app: express.Express;
  let repository: SQLiteRecipeBuilderRepository;

  beforeEach(() => {
    db = new Database(':memory:');
    initializeDb(db);
    db.prepare(`INSERT INTO venues (id, name) VALUES (1, 'Test Venue')`).run();
    repository = new SQLiteRecipeBuilderRepository(db);

    app = express();
    app.use(express.json());
    app.use('/api/recipe-intelligence', createRecipeIntelligenceRoutes(db));
    app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      res.status(500).json({ error: err.message });
    });
  });

  afterEach(() => {
    db.close();
  });

  it('creates, lists, and loads capture sessions', async () => {
    const createResponse = await request(app)
      .post('/api/recipe-intelligence/sessions')
      .send({
        venue_id: 1,
        name: 'Dinner Capture',
        capture_mode: 'photo_batch',
        led_by: 'chef',
      });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.session).toMatchObject({
      venue_id: 1,
      name: 'Dinner Capture',
      capture_mode: 'photo_batch',
      led_by: 'chef',
    });

    const listResponse = await request(app).get('/api/recipe-intelligence/sessions?venue_id=1&status=open');
    expect(listResponse.status).toBe(200);
    expect(listResponse.body.sessions).toEqual([
      expect.objectContaining({
        id: createResponse.body.session.id,
        capture_mode: 'photo_batch',
      }),
    ]);

    const detailResponse = await request(app).get(`/api/recipe-intelligence/sessions/${createResponse.body.session.id}`);
    expect(detailResponse.status).toBe(200);
    expect(detailResponse.body.session).toMatchObject({
      id: createResponse.body.session.id,
      name: 'Dinner Capture',
    });
    expect(detailResponse.body.inputs).toEqual([]);
    expect(detailResponse.body.drafts).toEqual([]);
  });

  it('returns draft source intelligence and recalculates confidence', async () => {
    const session = await repository.createCaptureSession({
      venue_id: 1,
      name: 'Review Batch',
      capture_mode: 'conversation_batch',
      led_by: 'chef',
      notes: null,
    });

    const job = await repository.createJob({
      source_type: 'freeform',
      source_text: '2 lb salmon\n1 qt beurre blanc',
      draft_name: 'Salmon Draft',
      yield_quantity: 1,
      yield_unit: 'pan',
      source_recipe_type: 'dish',
      serving_quantity: 6,
      serving_unit: 'oz',
      serving_count: 4,
    });

    db.prepare(
      `
        UPDATE recipe_builder_jobs
        SET capture_session_id = ?,
            origin = 'conversational',
            confidence_level = 'draft',
            confidence_score = 25,
            assumptions_json = '["Portion size estimated"]',
            follow_up_questions_json = '["Confirm sauce yield"]',
            source_context_json = '{"entry_count":1}',
            updated_at = datetime('now')
        WHERE id = ?
      `,
    ).run(session.id, job.id);

    const parsedRows = await repository.replaceParsedRows(job.id, [
      {
        line_index: 1,
        raw_line_text: '2 lb salmon',
        source_template_ingredient_name: null,
        source_template_quantity: null,
        source_template_unit: null,
        source_template_sort_order: null,
        quantity_raw: '2',
        quantity_normalized: 2,
        unit_raw: 'lb',
        unit_normalized: 'lb',
        ingredient_text: 'salmon',
        preparation_note: null,
        parse_status: 'PARSED',
        parser_confidence: 'HIGH',
        estimated_flag: 0,
        estimation_basis: null,
        alternative_item_matches: [],
        alternative_recipe_matches: [],
        detected_component_type: 'inventory_item',
        matched_recipe_id: null,
        matched_recipe_version_id: null,
        match_basis: null,
        explanation_text: 'Seed row.',
      },
    ]);

    await repository.replaceResolutionRows(job.id, [
      {
        parsed_row_id: Number(parsedRows[0]?.id),
        canonical_ingredient_id: null,
        canonical_match_status: 'no_match',
        canonical_confidence: 'LOW',
        canonical_match_reason: null,
        inventory_item_id: null,
        inventory_mapping_status: 'UNMAPPED',
        recipe_mapping_status: 'UNMAPPED',
        recipe_id: null,
        recipe_version_id: null,
        recipe_match_confidence: null,
        recipe_match_reason: null,
        quantity_normalization_status: 'NORMALIZED',
        review_status: 'NEEDS_REVIEW',
        explanation_text: 'Needs mapping.',
      },
    ]);

    const draft = await repository.upsertDraftRecipe({
      recipe_builder_job_id: job.id,
      draft_name: 'Salmon Draft',
      draft_notes: null,
      yield_quantity: 1,
      yield_unit: 'pan',
      serving_quantity: 6,
      serving_unit: 'oz',
      serving_count: 4,
      completeness_status: 'NEEDS_REVIEW',
      costability_status: 'NEEDS_REVIEW',
      ingredient_row_count: 1,
      ready_row_count: 0,
      review_row_count: 1,
      blocked_row_count: 0,
      unresolved_canonical_count: 1,
      unresolved_inventory_count: 1,
      source_recipe_type: 'dish',
      method_notes: null,
      review_priority: 'normal',
      ready_for_review_flag: 1,
      approved_by: null,
      approved_at: null,
      rejected_by: null,
      rejected_at: null,
      rejection_reason: null,
    });

    const sourceResponse = await request(app).get(`/api/recipe-intelligence/drafts/${draft.record.id}/source`);
    expect(sourceResponse.status).toBe(200);
    expect(sourceResponse.body.source_intelligence).toMatchObject({
      origin: 'conversational',
      confidence_level: 'draft',
      confidence_score: 25,
      assumptions: ['Portion size estimated'],
      follow_up_questions: ['Confirm sauce yield'],
      capture_session_id: session.id,
    });

    const recalcResponse = await request(app)
      .post(`/api/recipe-intelligence/drafts/${draft.record.id}/recalculate-confidence`)
      .send({ trigger: 'operator_review' });

    expect(recalcResponse.status).toBe(200);
    expect(recalcResponse.body).toMatchObject({
      draft_id: draft.record.id,
      recipe_builder_job_id: job.id,
      confidence_level: expect.any(String),
      confidence_score: expect.any(Number),
    });
    expect(recalcResponse.body.factors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ factor: 'row_completeness' }),
        expect.objectContaining({ factor: 'operator_trigger' }),
      ]),
    );
  });

  it('returns explicit not implemented responses for future route shells', async () => {
    const conversationResponse = await request(app)
      .post('/api/recipe-intelligence/conversation-drafts')
      .send({
        venue_id: 1,
        entries: [{ name: 'Miso Butterfish', description: 'Butterfish with miso glaze' }],
      });
    expect(conversationResponse.status).toBe(501);

    const prepResponse = await request(app)
      .post('/api/recipe-intelligence/prep-sheet-captures')
      .send({
        venue_id: 1,
        capture_date: '2026-03-26',
        source_file_name: 'prep-sheet.pdf',
        source_mime_type: 'application/pdf',
      });
    expect(prepResponse.status).toBe(501);

    const inferenceResponse = await request(app)
      .post('/api/recipe-intelligence/inference-runs')
      .send({
        venue_id: 1,
        period_start: '2026-03-01',
        period_end: '2026-03-31',
      });
    expect(inferenceResponse.status).toBe(501);
  });
});
