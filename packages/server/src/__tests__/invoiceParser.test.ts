import { describe, expect, it } from 'vitest';
import type { InvoiceDocumentPageEvidence } from '../routes/invoiceDocumentExtraction.js';
import {
  buildInvoiceTranscriptContext,
  isInvoiceLineSupportedByTranscript,
  parseInvoiceAiResponse,
} from '../routes/invoices.js';

describe('invoice AI response parser', () => {
  it('accepts the current multi-invoice response shape', () => {
    const result = parseInvoiceAiResponse(`
      {
        "invoices": [
          {
            "vendor_name": "Southern Glazer's",
            "invoice_date": "2026-03-19",
            "invoice_number": "INV-101",
            "lines": [
              {
                "vendor_item_name": "Tito's Vodka 1L",
                "source_text": "TITO'S VODKA 1L",
                "page_number": 1,
                "quantity": 6,
                "unit": "bottle",
                "unit_price": 21.5,
                "line_total": 129
              }
            ]
          },
          {
            "vendor_name": "Hawaii Beverage",
            "invoice_date": "2026-03-19",
            "invoice_number": "INV-102",
            "lines": []
          }
        ]
      }
    `);

    expect(result.invoices).toHaveLength(2);
    expect(result.invoices[0]).toMatchObject({
      vendor_name: "Southern Glazer's",
      invoice_number: 'INV-101',
      lines: [
        expect.objectContaining({
          source_text: "TITO'S VODKA 1L",
          page_number: 1,
        }),
      ],
    });
  });

  it('accepts the legacy single-invoice response shape', () => {
    const result = parseInvoiceAiResponse(`
      {
        "vendor_name": "Youngs Market",
        "invoice_date": "2026-03-19",
        "invoice_number": "INV-201",
        "lines": [
          {
            "vendor_item_name": "Buffalo Trace 750ml",
            "quantity": 12,
            "unit": "bottle",
            "unit_price": 19,
            "line_total": 228
          }
        ]
      }
    `);

    expect(result.invoices).toHaveLength(1);
    expect(result.invoices[0]).toMatchObject({
      vendor_name: 'Youngs Market',
      invoice_number: 'INV-201',
    });
  });

  it('accepts fenced json responses', () => {
    const result = parseInvoiceAiResponse('```json\n{\n  "invoices": [\n    {\n      "vendor_name": "RNDC",\n      "invoice_date": null,\n      "invoice_number": null,\n      "lines": []\n    }\n  ]\n}\n```');

    expect(result.invoices).toHaveLength(1);
    expect(result.invoices[0].vendor_name).toBe('RNDC');
  });
});

describe('invoice transcript guardrails', () => {
  it('keeps lines that are supported by the extracted transcript on the same page', () => {
    const transcript = buildInvoiceTranscriptContext(makePages([
      {
        pageNumber: 1,
        extractedText: 'RNDC\nTITO\'S VODKA 1L   6   21.50   129.00',
      },
    ]));

    expect(isInvoiceLineSupportedByTranscript({
      vendor_item_name: "Tito's Vodka 1L",
      source_text: "TITO'S VODKA 1L",
      page_number: 1,
    }, transcript)).toBe(true);
  });

  it('rejects hallucinated lines that do not appear in the extracted transcript', () => {
    const transcript = buildInvoiceTranscriptContext(makePages([
      {
        pageNumber: 1,
        extractedText: 'Southern Glazer\'s\nBOMBAY SAPPHIRE 1L   6   25.00   150.00',
      },
    ]));

    expect(isInvoiceLineSupportedByTranscript({
      vendor_item_name: 'Pork Butt',
      source_text: 'PORK BUTT',
      page_number: 1,
    }, transcript)).toBe(false);
  });

  it('falls back to token coverage when source text is absent but transcript still supports the line', () => {
    const transcript = buildInvoiceTranscriptContext(makePages([
      {
        pageNumber: 2,
        extractedText: 'PAGE 2\nKETEL ONE BOTANICAL GRAPEFRUIT ROSE 750ML  12  14.50  174.00',
      },
    ]));

    expect(isInvoiceLineSupportedByTranscript({
      vendor_item_name: 'Ketel One Botanical Grapefruit Rose 750ml',
      page_number: 2,
    }, transcript)).toBe(true);
  });
});

function makePages(input: Array<{ pageNumber: number; extractedText: string }>): InvoiceDocumentPageEvidence[] {
  return input.map((page) => ({
    pageNumber: page.pageNumber,
    extractedText: page.extractedText,
    imageBase64: null,
    imageMediaType: 'image/jpeg',
  }));
}
