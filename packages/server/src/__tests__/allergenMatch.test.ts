import { describe, expect, it } from 'vitest';
import { buildDocumentProductMatchPlans } from '../allergy/allergenMatchService.js';

describe('allergen match service', () => {
  it('builds chart-style suggestion candidates from product text', () => {
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
          product_name: 'BBQ Chicken',
          normalized_product_name: 'bbq chicken',
          source_row_text: 'BBQ Chicken | may contain sesame',
          allergen_summary: 'may contain sesame',
          dietary_notes: null,
          source_chunk_ids: [2],
        },
        {
          id: 3,
          document_id: 10,
          page_id: 1,
          page_number: 1,
          product_name: 'Nova Scotia Maine Lobster',
          normalized_product_name: 'nova scotia maine lobster',
          source_row_text: 'Nova Scotia Maine Lobster | contains shellfish',
          allergen_summary: 'unknown',
          dietary_notes: null,
          source_chunk_ids: [3],
        },
        {
          id: 4,
          document_id: 10,
          page_id: 1,
          page_number: 1,
          product_name: 'USDA Prime Roast Beef',
          normalized_product_name: 'usda prime roast beef',
          source_row_text: 'USDA Prime Roast Beef | contains beef',
          allergen_summary: 'contains beef',
          dietary_notes: null,
          source_chunk_ids: [4],
        },
        {
          id: 5,
          document_id: 10,
          page_id: 1,
          page_number: 1,
          product_name: 'USDAプライムローストビーフ',
          normalized_product_name: 'usdaプライムローストビーフ',
          source_row_text: 'USDAプライムローストビーフ | contains beef',
          allergen_summary: 'contains beef',
          dietary_notes: null,
          source_chunk_ids: [5],
        },
        {
          id: 6,
          document_id: 10,
          page_id: 1,
          page_number: 1,
          product_name: 'Mystery Side',
          normalized_product_name: 'mystery side',
          source_row_text: 'Mystery Side | unknown',
          allergen_summary: 'unknown',
          dietary_notes: null,
          source_chunk_ids: [6],
        },
      ],
      items: [
        { id: 1, name: 'Guava Glazed Salmon', venue_id: 2 },
        { id: 2, name: 'Chicken - Sterling Pacific Airline Single Boneless Skinless Chicken Breast', venue_id: 2 },
        { id: 3, name: 'Lobster 16/18 oz', venue_id: 2 },
        { id: 4, name: 'Beef - Inside Top Round Prime XT Iowa Premium', venue_id: 2 },
        { id: 5, name: 'Beef - Prime Sup Beef Tenderloin PSMO', venue_id: 2 },
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
          match_status: 'suggested',
        }),
      ],
    });
    expect(plans[1].candidates[0].match_score).toBeGreaterThanOrEqual(0.28);

    expect(plans[2]).toMatchObject({
      document_product_id: 3,
      candidates: [
        expect.objectContaining({
          item_id: 3,
          match_status: 'suggested',
        }),
      ],
    });

    expect(plans[3].candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          item_id: 4,
          match_status: 'suggested',
        }),
      ]),
    );

    expect(plans[4].candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          item_id: 4,
          match_status: 'suggested',
        }),
      ]),
    );

    expect(plans[5]).toMatchObject({
      document_product_id: 6,
      candidates: [],
    });
  });

  it('matches product names despite punctuation and ordering noise', () => {
    const [plan] = buildDocumentProductMatchPlans({
      products: [
        {
          id: 1,
          document_id: 10,
          page_id: 1,
          page_number: 1,
          product_name: 'Guava-Glazed Salmon',
          normalized_product_name: 'guava glazed salmon',
          source_row_text: 'Guava-Glazed Salmon',
          allergen_summary: null,
          dietary_notes: null,
          source_chunk_ids: [1],
        },
      ],
      items: [
        { id: 1, name: 'Salmon, Guava Glazed', venue_id: 2 },
        { id: 2, name: 'Salmon - Salmon 10lb/6oz', venue_id: 2 },
      ],
    });

    expect(plan.candidates[0]).toMatchObject({
      item_id: 1,
      match_status: 'suggested',
    });
    expect(plan.candidates[0].match_score).toBeGreaterThan(plan.candidates[1]?.match_score ?? 0);
  });
});
