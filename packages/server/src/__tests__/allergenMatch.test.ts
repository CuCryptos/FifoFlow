import { describe, expect, it } from 'vitest';
import { buildDocumentProductMatchPlans } from '../allergy/allergenMatchService.js';

describe('allergen match service', () => {
  it('builds strong suggestions and weak no-match candidates from product text', () => {
    const plans = buildDocumentProductMatchPlans({
      products: [
        {
          id: 1,
          document_id: 10,
          page_id: 1,
          page_number: 1,
          product_name: 'Guava Glazed Salmon',
          normalized_product_name: 'guava glazed salmon',
          source_row_text: 'Guava Glazed Salmon | contains guava',
          allergen_summary: 'contains guava',
          dietary_notes: null,
          source_chunk_ids: [1],
        },
        {
          id: 2,
          document_id: 10,
          page_id: 1,
          page_number: 1,
          product_name: 'Chicken Citrus Bowl',
          normalized_product_name: 'chicken citrus bowl',
          source_row_text: 'Chicken Citrus Bowl | may contain sesame',
          allergen_summary: 'may contain sesame',
          dietary_notes: null,
          source_chunk_ids: [2],
        },
        {
          id: 3,
          document_id: 10,
          page_id: 1,
          page_number: 1,
          product_name: 'Mystery Side',
          normalized_product_name: 'mystery side',
          source_row_text: 'Mystery Side | unknown',
          allergen_summary: 'unknown',
          dietary_notes: null,
          source_chunk_ids: [3],
        },
      ],
      items: [
        { id: 1, name: 'Guava Glazed Salmon', venue_id: 2 },
        { id: 2, name: 'Chicken Breast', venue_id: 2 },
      ],
    });

    expect(plans[0]).toMatchObject({
      document_product_id: 1,
      candidates: [
        expect.objectContaining({
          item_id: 1,
          match_status: 'suggested',
        }),
      ],
    });
    expect(plans[0].candidates[0].match_score).toBeGreaterThan(0.9);

    expect(plans[1]).toMatchObject({
      document_product_id: 2,
      candidates: [
        expect.objectContaining({
          item_id: 2,
          match_status: 'no_match',
        }),
      ],
    });
    expect(plans[1].candidates[0].match_score).toBeGreaterThan(0);
    expect(plans[1].candidates[0].match_score).toBeLessThan(0.45);

    expect(plans[2]).toMatchObject({
      document_product_id: 3,
      candidates: [],
    });
  });
});
