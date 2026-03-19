import { describe, expect, it } from 'vitest';
import { parseInvoiceAiResponse } from '../routes/invoices.js';

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
    const result = parseInvoiceAiResponse(`
      \`\`\`json
      {
        "invoices": [
          {
            "vendor_name": "RNDC",
            "invoice_date": null,
            "invoice_number": null,
            "lines": []
          }
        ]
      }
      \`\`\`
    `);

    expect(result.invoices).toHaveLength(1);
    expect(result.invoices[0].vendor_name).toBe('RNDC');
  });
});
