import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import Database from 'better-sqlite3';
import { initializeDb } from '../db.js';
import { createRecipeIntelligenceRoutes } from '../routes/recipeIntelligence.js';
import { SQLiteRecipeBuilderRepository } from '../recipes/builder/index.js';

const stubAi = {
  async createConversationDraftSeeds(input: { entries: Array<{ name: string; description: string }> }) {
    return input.entries.map((entry, index) => ({
      draft_name: entry.name,
      source_text: `${entry.name}\n${entry.description}`,
      draft_notes: `Derived from chef conversation entry ${index + 1}.`,
      yield_quantity: 4,
      yield_unit: 'plate',
      serving_quantity: 6,
      serving_unit: 'oz',
      serving_count: 4,
      source_recipe_type: 'dish' as const,
      method_notes: index === 0 ? 'Glaze fish and plate with rice.' : 'Sear and plate with vegetables.',
      assumptions: index === 0
        ? ['Rice portion was inferred from plating description']
        : ['Second entry was captured in the same batch session'],
      follow_up_questions: index === 0 ? ['Confirm vegetable garnish'] : ['Confirm side garnish'],
      parsing_issues: [],
      confidence_score: index === 0 ? 78 : 71,
    }));
  },
  async createPhotoDraftSeeds() {
    return [
      {
        draft_name: 'Beurre Blanc',
        source_text: '2 qt cream\n1 lb butter\n8 oz white wine',
        draft_notes: 'Recovered from uploaded recipe card.',
        yield_quantity: 2,
        yield_unit: 'qt',
        serving_quantity: null,
        serving_unit: null,
        serving_count: null,
        source_recipe_type: 'prep' as const,
        method_notes: 'Reduce wine, mount butter, finish cream.',
        assumptions: [],
        follow_up_questions: ['Confirm shallot quantity'],
        parsing_issues: ['Card image did not clearly show garnish note'],
        confidence_score: 72,
      },
    ];
  },
  async createPrepSheetCapture() {
    return {
      prep_items: [
        {
          item_name: 'Beurre Blanc',
          batch_quantity: 2,
          batch_unit: 'qt',
          frequency: 'daily',
          likely_used_in: ['Fish of the Day'],
          source_text: '2 qt cream\n1 lb butter\n8 oz white wine',
          draft_notes: 'Recovered from prep sheet.',
          method_notes: 'Reduce wine, mount butter, finish cream.',
          assumptions: [],
          follow_up_questions: ['Confirm shallot quantity'],
          parsing_issues: [],
          confidence_score: 76,
        },
      ],
      inferred_relationships: [
        {
          prep_item: 'Beurre Blanc',
          likely_used_in: ['Fish of the Day'],
          confidence: 0.82,
        },
      ],
    };
  },
};

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
    app.use('/api/recipe-intelligence', createRecipeIntelligenceRoutes(db, { ai: stubAi }));
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
    expect(detailResponse.body.prep_sheet_captures).toEqual([]);

    const deleteResponse = await request(app).delete(`/api/recipe-intelligence/sessions/${createResponse.body.session.id}`);
    expect(deleteResponse.status).toBe(200);
    expect(deleteResponse.body).toEqual({
      removed: true,
      session_id: createResponse.body.session.id,
    });

    const afterDeleteResponse = await request(app).get(`/api/recipe-intelligence/sessions/${createResponse.body.session.id}`);
    expect(afterDeleteResponse.status).toBe(404);
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

  it('creates conversation and photo drafts using the intelligence route', async () => {
    const conversationResponse = await request(app)
      .post('/api/recipe-intelligence/conversation-drafts')
      .send({
        venue_id: 1,
        session_name: 'Chef Notes',
        created_by: 'chef',
        entries: [
          { name: 'Miso Butterfish', description: 'Butterfish with miso glaze' },
          { name: 'Grilled Short Ribs', description: 'Short ribs with sesame slaw' },
        ],
      });

    expect(conversationResponse.status).toBe(201);
    expect(conversationResponse.body.session).toMatchObject({
      venue_id: 1,
      capture_mode: 'conversation_batch',
      total_drafts_created: 2,
    });
    expect(conversationResponse.body.drafts).toHaveLength(2);
    expect(conversationResponse.body.drafts.map((draft: any) => draft.draft.draft_name)).toEqual([
      'Miso Butterfish',
      'Grilled Short Ribs',
    ]);
    expect(conversationResponse.body.drafts[0]).toEqual(expect.objectContaining({
      draft: expect.objectContaining({
        draft_name: 'Miso Butterfish',
        method_notes: 'Glaze fish and plate with rice.',
      }),
      source_intelligence: expect.objectContaining({
        origin: 'conversational',
        confidence_level: 'reviewed',
        assumptions: ['Rice portion was inferred from plating description'],
      }),
    }));

    const aliasVenueItemId = Number(
      db.prepare('INSERT INTO items (name, category, unit) VALUES (?, ?, ?)').run('Beurre Blanc Base', 'sauce_base', 'oz').lastInsertRowid,
    );
    const aliasRecipeId = Number(
      db.prepare('INSERT INTO recipes (name, type, notes) VALUES (?, ?, NULL)').run('Fish of the Day', 'dish').lastInsertRowid,
    );

    const itemAliasCreateResponse = await request(app)
      .post(`/api/recipe-intelligence/items/${aliasVenueItemId}/aliases`)
      .send({
        alias: 'Beurre Blanc',
        alias_type: 'component_name',
      });

    expect(itemAliasCreateResponse.status).toBe(201);
    expect(itemAliasCreateResponse.body.aliases).toHaveLength(1);
    expect(itemAliasCreateResponse.body.aliases[0]).toMatchObject({
      alias: 'Beurre Blanc',
      alias_type: 'component_name',
      active: 1,
    });

    const itemAliasListResponse = await request(app).get(`/api/recipe-intelligence/items/${aliasVenueItemId}/aliases`);
    expect(itemAliasListResponse.status).toBe(200);
    expect(itemAliasListResponse.body.aliases).toEqual([
      expect.objectContaining({
        alias: 'Beurre Blanc',
        alias_type: 'component_name',
      }),
    ]);

    const itemAliasDeleteResponse = await request(app)
      .delete(`/api/recipe-intelligence/items/${aliasVenueItemId}/aliases/${itemAliasCreateResponse.body.aliases[0].id}`);
    expect(itemAliasDeleteResponse.status).toBe(200);
    expect(itemAliasDeleteResponse.body.aliases).toEqual([]);

    const recipeAliasCreateResponse = await request(app)
      .post(`/api/recipe-intelligence/recipes/${aliasRecipeId}/aliases`)
      .send({
        alias: 'Fish of the Day',
        alias_type: 'component_name',
      });

    expect(recipeAliasCreateResponse.status).toBe(201);
    expect(recipeAliasCreateResponse.body.aliases).toHaveLength(1);
    expect(recipeAliasCreateResponse.body.aliases[0]).toMatchObject({
      alias: 'Fish of the Day',
      alias_type: 'component_name',
      active: 1,
    });

    const recipeAliasListResponse = await request(app).get(`/api/recipe-intelligence/recipes/${aliasRecipeId}/aliases`);
    expect(recipeAliasListResponse.status).toBe(200);
    expect(recipeAliasListResponse.body.aliases).toEqual([
      expect.objectContaining({
        alias: 'Fish of the Day',
        alias_type: 'component_name',
      }),
    ]);

    const recipeAliasDeleteResponse = await request(app)
      .delete(`/api/recipe-intelligence/recipes/${aliasRecipeId}/aliases/${recipeAliasCreateResponse.body.aliases[0].id}`);
    expect(recipeAliasDeleteResponse.status).toBe(200);
    expect(recipeAliasDeleteResponse.body.aliases).toEqual([]);

    const photoResponse = await request(app)
      .post('/api/recipe-intelligence/photo-drafts')
      .field('venue_id', '1')
      .field('session_name', 'Recipe Cards')
      .field('created_by', 'chef')
      .attach('files', Buffer.from('fake image bytes'), {
        filename: 'recipe-card.png',
        contentType: 'image/png',
      });

    expect(photoResponse.status).toBe(201);
    expect(photoResponse.body.session).toMatchObject({
      venue_id: 1,
      capture_mode: 'single_photo',
      total_drafts_created: 1,
    });
    expect(photoResponse.body.drafts).toEqual([
      expect.objectContaining({
        draft: expect.objectContaining({
          draft_name: 'Beurre Blanc',
          source_recipe_type: 'prep',
        }),
        source_intelligence: expect.objectContaining({
          origin: 'photo_ingestion',
          confidence_level: 'estimated',
          parsing_issues: ['Card image did not clearly show garnish note'],
          source_images: ['recipe-card.png'],
        }),
      }),
    ]);

    const prepResponse = await request(app)
      .post('/api/recipe-intelligence/prep-sheet-captures')
      .field('venue_id', '1')
      .field('capture_date', '2026-03-26')
      .field('session_name', 'Daily Prep Sheet')
      .field('created_by', 'chef')
      .attach('file', Buffer.from('fake prep image bytes'), {
        filename: 'prep-sheet.png',
        contentType: 'image/png',
      });
    expect(prepResponse.status).toBe(201);
    expect(prepResponse.body.session).toMatchObject({
      venue_id: 1,
      capture_mode: 'prep_sheet_batch',
      total_drafts_created: 1,
    });
    expect(prepResponse.body.capture).toMatchObject({
      capture_date: '2026-03-26',
      source_file_name: 'prep-sheet.png',
      recipe_capture_session_id: prepResponse.body.session.id,
    });
    expect(prepResponse.body.prep_items).toEqual([
      expect.objectContaining({
        item_name: 'Beurre Blanc',
        likely_used_in: ['Fish of the Day'],
      }),
    ]);
    expect(prepResponse.body.inferred_relationships).toEqual([
      expect.objectContaining({
        prep_item: 'Beurre Blanc',
        confidence: 0.82,
      }),
    ]);

    const inferenceResponse = await request(app)
      .post('/api/recipe-intelligence/inference-runs')
      .send({
        venue_id: 1,
        period_start: '2026-03-01',
        period_end: '2026-03-31',
      });
    expect(inferenceResponse.status).toBe(501);
  });

  it('returns venue-scoped prep alias seed context on draft source detail', async () => {
    const prepResponse = await request(app)
      .post('/api/recipe-intelligence/prep-sheet-captures')
      .field('venue_id', '1')
      .field('capture_date', '2026-03-26')
      .field('session_name', 'Daily Prep Sheet')
      .field('created_by', 'chef')
      .attach('file', Buffer.from('fake prep image bytes'), {
        filename: 'prep-sheet.png',
        contentType: 'image/png',
      });

    expect(prepResponse.status).toBe(201);
    expect(prepResponse.body.drafts).toHaveLength(1);

    const sourceResponse = await request(app)
      .get(`/api/recipe-intelligence/drafts/${prepResponse.body.drafts[0].draft_id}/source?venue_id=1`);

    expect(sourceResponse.status).toBe(200);
    expect(sourceResponse.body.alias_seed_context).toMatchObject({
      venue_id: 1,
      matched_prep_items: [
        expect.objectContaining({
          prep_item: 'Beurre Blanc',
          capture_date: '2026-03-26',
        }),
      ],
      related_recipe_names: [
        expect.objectContaining({
          name: 'Fish of the Day',
          source_prep_item: 'Beurre Blanc',
          capture_date: '2026-03-26',
        }),
      ],
    });

    const captureDeleteResponse = await request(app)
      .delete(`/api/recipe-intelligence/prep-sheet-captures/${prepResponse.body.capture.id}`);
    expect(captureDeleteResponse.status).toBe(200);
    expect(captureDeleteResponse.body).toEqual({
      removed: true,
      capture_id: prepResponse.body.capture.id,
    });

    const sessionDetailAfterCaptureDelete = await request(app)
      .get(`/api/recipe-intelligence/sessions/${prepResponse.body.session.id}`);
    expect(sessionDetailAfterCaptureDelete.status).toBe(200);
    expect(sessionDetailAfterCaptureDelete.body.prep_sheet_captures).toEqual([]);
  });
});
