import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import Database from 'better-sqlite3';
import { initializeDb } from '../db.js';
import { createAllergyAssistantRoutes } from '../routes/allergyAssistant.js';

function createTestApp() {
  const db = new Database(':memory:');
  initializeDb(db);

  const fakeAi = {
    async transcribeImagePage() {
      return 'Allergy chart\nGuava Glazed Salmon | contains guava\nHouse Salad | guava free';
    },
    async extractProductsFromPage() {
      return [
        {
          page_number: 1,
          product_name: 'Guava Glazed Salmon',
          source_row_text: 'Guava Glazed Salmon | contains guava',
          allergen_summary: 'contains guava',
          dietary_notes: null,
        },
        {
          page_number: 1,
          product_name: 'House Salad',
          source_row_text: 'House Salad | guava free',
          allergen_summary: 'guava free',
          dietary_notes: null,
        },
      ];
    },
    async answerQuestion() {
      return {
        allergen_focus: 'guava',
        answer_markdown: 'Avoid the guava salmon. The house salad is charted as guava free.',
        safe_items: [
          {
            product_id: 2,
            product_name: 'House Salad',
            rationale: 'The uploaded allergy chart marks this product guava free.',
            evidence_chunk_ids: [2],
          },
        ],
        avoid_items: [
          {
            product_id: 1,
            product_name: 'Guava Glazed Salmon',
            rationale: 'The uploaded allergy chart says this product contains guava.',
            evidence_chunk_ids: [1],
          },
        ],
        caution_items: [],
        unknown_items: [],
      };
    },
  };

  const app = express();
  app.use(express.json());
  app.use('/api/allergy-assistant', createAllergyAssistantRoutes(db, { ai: fakeAi }));
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({ error: err.message });
  });
  return { app, db };
}

describe('Allergy assistant routes', () => {
  let app: express.Express;
  let db: Database.Database;

  beforeEach(() => {
    ({ app, db } = createTestApp());
    db.prepare("INSERT INTO venues (id, name, sort_order, show_in_menus) VALUES (2, 'Dining Room', 1, 1)").run();
  });

  afterEach(() => {
    db.close();
  });

  it('uploads an allergy chart and stores parsed product rows', async () => {
    const response = await request(app)
      .post('/api/allergy-assistant/documents/upload')
      .field('venue_id', '2')
      .attach('files', Buffer.from('fake-image-bytes'), {
        filename: 'allergy-chart.png',
        contentType: 'image/png',
      });

    expect(response.status).toBe(201);
    expect(response.body.documents).toHaveLength(1);
    expect(response.body.documents[0]).toMatchObject({
      filename: 'allergy-chart.png',
      venue_id: 2,
      page_count: 1,
      product_count: 2,
      status: 'ready',
    });

    const page = db.prepare('SELECT extracted_text FROM allergy_document_pages LIMIT 1').get() as { extracted_text: string };
    expect(page.extracted_text).toContain('Guava Glazed Salmon');

    const productRows = db.prepare(
      'SELECT product_name, allergen_summary, source_row_text FROM allergy_document_products ORDER BY id ASC',
    ).all() as Array<{ product_name: string; allergen_summary: string | null; source_row_text: string }>;

    expect(productRows).toEqual([
      {
        product_name: 'Guava Glazed Salmon',
        allergen_summary: 'contains guava',
        source_row_text: 'Guava Glazed Salmon | contains guava',
      },
      {
        product_name: 'House Salad',
        allergen_summary: 'guava free',
        source_row_text: 'House Salad | guava free',
      },
    ]);
  });

  it('answers chef questions from stored chart products without recipes', async () => {
    seedAllergyDocument(db, {
      id: 10,
      venueId: 2,
      filename: 'hawaii-menu-allergens.pdf',
      chunks: [
        'Guava Glazed Salmon | contains guava',
        'House Salad | guava free',
      ],
      products: [
        {
          id: 1,
          pageNumber: 1,
          productName: 'Guava Glazed Salmon',
          sourceRowText: 'Guava Glazed Salmon | contains guava',
          allergenSummary: 'contains guava',
          sourceChunkIds: [1],
        },
        {
          id: 2,
          pageNumber: 1,
          productName: 'House Salad',
          sourceRowText: 'House Salad | guava free',
          allergenSummary: 'guava free',
          sourceChunkIds: [2],
        },
      ],
    });

    const response = await request(app)
      .post('/api/allergy-assistant/chat')
      .send({
        venue_id: 2,
        question: 'A guest has a guava allergy. Which products on this chart are safe?',
      });

    expect(response.status).toBe(200);
    expect(response.body.allergen_focus).toBe('guava');
    expect(response.body.avoid_items).toEqual([
      expect.objectContaining({
        product_id: 1,
        product_name: 'Guava Glazed Salmon',
      }),
    ]);
    expect(response.body.safe_items).toEqual([
      expect.objectContaining({
        product_id: 2,
        product_name: 'House Salad',
      }),
    ]);
    expect(response.body.cited_chunks).toHaveLength(2);
  });
});

function seedAllergyDocument(
  db: Database.Database,
  input: {
    id: number;
    venueId: number | null;
    filename: string;
    chunks: string[];
    products: Array<{
      id: number;
      pageNumber: number;
      productName: string;
      sourceRowText: string;
      allergenSummary: string | null;
      sourceChunkIds: number[];
    }>;
  },
) {
  db.prepare(
    `
      INSERT INTO allergy_documents (id, venue_id, filename, mime_type, page_count, chunk_count, product_count, status)
      VALUES (?, ?, ?, 'application/pdf', 1, ?, ?, 'ready')
    `,
  ).run(input.id, input.venueId, input.filename, input.chunks.length, input.products.length);

  const pageId = Number(
    db.prepare(
      `
        INSERT INTO allergy_document_pages (document_id, page_number, extracted_text)
        VALUES (?, 1, ?)
      `,
    ).run(input.id, input.chunks.join('\n')).lastInsertRowid,
  );

  const insertChunk = db.prepare(
    `
      INSERT INTO allergy_document_chunks (document_id, page_id, page_number, chunk_index, chunk_text)
      VALUES (?, ?, 1, ?, ?)
    `,
  );

  const persistedChunkIds: number[] = [];
  input.chunks.forEach((chunk, index) => {
    const result = insertChunk.run(input.id, pageId, index, chunk);
    persistedChunkIds.push(Number(result.lastInsertRowid));
  });

  const insertProduct = db.prepare(
    `
      INSERT INTO allergy_document_products (
        id,
        document_id,
        page_id,
        page_number,
        product_name,
        normalized_product_name,
        source_row_text,
        allergen_summary,
        dietary_notes,
        source_chunk_ids
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, null, ?)
    `,
  );

  input.products.forEach((product) => {
    const actualChunkIds = product.sourceChunkIds.map((chunkOrder) => persistedChunkIds[chunkOrder - 1]).filter(Boolean);
    insertProduct.run(
      product.id,
      input.id,
      pageId,
      product.pageNumber,
      product.productName,
      product.productName.toLowerCase(),
      product.sourceRowText,
      product.allergenSummary,
      JSON.stringify(actualChunkIds),
    );
  });
}
