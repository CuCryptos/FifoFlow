import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { initializeDb } from '../db.js';
import { SQLiteAllergenRepository } from '../allergy/allergenRepositories.js';
import { AllergenQueryService } from '../allergy/allergenQueryService.js';

describe('Allergen query service', () => {
  let db: Database.Database;
  let repository: SQLiteAllergenRepository;
  let service: AllergenQueryService;

  beforeEach(() => {
    db = new Database(':memory:');
    initializeDb(db);
    repository = new SQLiteAllergenRepository(db);
    service = new AllergenQueryService(repository);

    db.prepare(`INSERT INTO venues (id, name, sort_order, show_in_menus) VALUES (1, 'Dining Room', 1, 1)`).run();
    db.prepare(`INSERT INTO items (id, name, category, unit, current_qty, venue_id) VALUES (1, 'Salmon Portion', 'Protein', 'each', 0, 1)`).run();

    const milkId = getAllergenId(db, 'milk');
    db.prepare(`
      INSERT INTO item_allergens (item_id, allergen_id, status, confidence)
      VALUES (1, ?, 'free_of', 'high')
    `).run(milkId);

    db.prepare(`
      INSERT INTO allergy_documents (id, venue_id, filename, mime_type, page_count, chunk_count, product_count, status)
      VALUES (10, 1, 'allergy-chart.pdf', 'application/pdf', 1, 2, 2, 'ready')
    `).run();
    db.prepare(`
      INSERT INTO allergy_document_pages (id, document_id, page_number, extracted_text)
      VALUES (100, 10, 1, 'page')
    `).run();
    db.prepare(`
      INSERT INTO allergy_document_chunks (id, document_id, page_id, page_number, chunk_index, chunk_text)
      VALUES (1001, 10, 100, 1, 0, 'Seared Salmon | dairy free')
    `).run();
    db.prepare(`
      INSERT INTO allergy_document_chunks (id, document_id, page_id, page_number, chunk_index, chunk_text)
      VALUES (1002, 10, 100, 1, 1, 'Mystery Sauce | see kitchen')
    `).run();

    db.prepare(`
      INSERT INTO allergy_document_products (
        id, document_id, page_id, page_number, product_name, normalized_product_name, source_row_text, allergen_summary, dietary_notes, source_chunk_ids
      ) VALUES (1, 10, 100, 1, 'Seared Salmon', 'seared salmon', 'Seared Salmon | dairy free', 'dairy free', null, '[1001]')
    `).run();
    db.prepare(`
      INSERT INTO allergy_document_products (
        id, document_id, page_id, page_number, product_name, normalized_product_name, source_row_text, allergen_summary, dietary_notes, source_chunk_ids
      ) VALUES (2, 10, 100, 1, 'Mystery Sauce', 'mystery sauce', 'Mystery Sauce | see kitchen', null, 'see kitchen', '[1002]')
    `).run();

    db.prepare(`
      INSERT INTO allergy_document_product_matches (
        document_product_id, item_id, match_status, match_score, matched_by, notes, active
      ) VALUES (1, 1, 'confirmed', 0.98, 'operator', 'confirmed', 1)
    `).run();
  });

  afterEach(() => {
    db.close();
  });

  it('classifies matched products from item profiles and falls back to document evidence', () => {
    const result = service.queryChartProducts({
      question: 'What is safe for a dairy allergy?',
      venue_id: 1,
    });

    expect(result.allergen_codes).toEqual(['milk']);
    expect(result.safe).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          product_name: 'Seared Salmon',
          source: 'item_profile',
        }),
      ]),
    );
    expect(result.unknown).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          product_name: 'Mystery Sauce',
          source: 'document_evidence',
        }),
      ]),
    );
  });
});

function getAllergenId(db: Database.Database, code: string): number {
  const row = db.prepare('SELECT id FROM allergens WHERE code = ? LIMIT 1').get(code) as { id: number } | undefined;
  if (!row) {
    throw new Error(`Missing allergen seed for ${code}`);
  }
  return row.id;
}
