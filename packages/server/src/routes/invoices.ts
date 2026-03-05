import { Router } from 'express';
import multer from 'multer';
import Anthropic from '@anthropic-ai/sdk';
import type { InventoryStore } from '../store/types.js';
import type { InvoiceLine, InvoiceParseResult } from '@fifoflow/shared';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB per file
  fileFilter: (_req, file, cb) => {
    const allowed = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF, PNG, JPEG, and WebP files are supported'));
    }
  },
});

function getMediaType(mimetype: string): 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif' {
  if (mimetype === 'image/png') return 'image/png';
  if (mimetype === 'image/webp') return 'image/webp';
  return 'image/jpeg';
}

interface ParsedInvoice {
  vendor_name: string;
  invoice_date: string | null;
  invoice_number: string | null;
  lines: Array<{
    vendor_item_name: string;
    quantity: number;
    unit: string;
    unit_price: number;
    line_total: number;
  }>;
}

async function parseOneFile(
  client: Anthropic,
  file: Express.Multer.File,
  store: InventoryStore,
  vendorIdOverride?: number,
): Promise<InvoiceParseResult[]> {
  const base64Data = file.buffer.toString('base64');
  const isPdf = file.mimetype === 'application/pdf';

  const contentBlock: Anthropic.ContentBlockParam = isPdf
    ? {
        type: 'document' as const,
        source: {
          type: 'base64' as const,
          media_type: 'application/pdf' as const,
          data: base64Data,
        },
      }
    : {
        type: 'image' as const,
        source: {
          type: 'base64' as const,
          media_type: getMediaType(file.mimetype),
          data: base64Data,
        },
      };

  // Get vendor list for the prompt
  const vendors = await store.listVendors();
  const vendorNames = vendors.map((v) => v.name).join(', ');

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 16384,
    messages: [
      {
        role: 'user',
        content: [
          contentBlock,
          {
            type: 'text',
            text: `Extract ALL invoices and their line items from this document. This document may contain MULTIPLE invoices from DIFFERENT vendors across multiple pages. Return a JSON object with this exact structure:

{
  "invoices": [
    {
      "vendor_name": "the company/vendor name on this invoice",
      "invoice_date": "YYYY-MM-DD or null",
      "invoice_number": "string or null",
      "lines": [
        {
          "vendor_item_name": "product name as shown on invoice",
          "quantity": number,
          "unit": "unit of measure (case, each, lb, oz, etc.)",
          "unit_price": number (price per unit),
          "line_total": number (quantity * unit_price)
        }
      ]
    }
  ]
}

Known vendors in our system: ${vendorNames || 'none yet'}

Rules:
- CRITICAL: Read EVERY page of this document from start to finish
- This document may contain multiple separate invoices from different vendors — return each as a separate entry in the "invoices" array
- If the same vendor has multiple invoice pages (continuation), combine their line items into one invoice entry
- Extract every single line item from every page
- Use the exact product name as printed on the invoice
- Prices should be numbers without currency symbols
- If unit_price or line_total is missing, calculate from the other
- Return ONLY the JSON object, no other text`,
          },
        ],
      },
    ],
  });

  const textContent = response.content.find((c) => c.type === 'text');
  if (!textContent || textContent.type !== 'text') {
    throw new Error('Failed to extract invoice data');
  }

  let rawParsed: { invoices: ParsedInvoice[] };
  try {
    const jsonMatch = textContent.text.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, textContent.text];
    const jsonData = JSON.parse(jsonMatch[1]!.trim());
    // Handle both old single-invoice format and new multi-invoice format
    if (Array.isArray(jsonData.invoices)) {
      rawParsed = jsonData;
    } else if (jsonData.vendor_name && Array.isArray(jsonData.lines)) {
      rawParsed = { invoices: [jsonData] };
    } else {
      throw new Error('Unexpected format');
    }
  } catch {
    throw new Error('Failed to parse invoice data from AI response');
  }

  // Process each extracted invoice
  const items = await store.listItems();
  const allVendorPrices: Array<{ id: number; item_id: number; vendor_id: number; vendor_item_name: string | null }> = [];
  for (const item of items) {
    const prices = await store.listVendorPricesForItem(item.id);
    for (const vp of prices) {
      allVendorPrices.push({ id: vp.id, item_id: vp.item_id, vendor_id: vp.vendor_id, vendor_item_name: vp.vendor_item_name });
    }
  }

  const results: InvoiceParseResult[] = [];

  for (const parsed of rawParsed.invoices) {
    // Match vendor
    let vendorId: number | null = vendorIdOverride ?? null;
    let vendorName = parsed.vendor_name;
    const detectedVendorName = parsed.vendor_name;

    if (!vendorId && parsed.vendor_name) {
      const vNameLower = parsed.vendor_name.toLowerCase().trim();
      const exactMatch = vendors.find((v) => v.name.toLowerCase().trim() === vNameLower);
      if (exactMatch) {
        vendorId = exactMatch.id;
        vendorName = exactMatch.name;
      } else {
        const fuzzyMatch = vendors.find((v) => {
          const vLower = v.name.toLowerCase();
          return vLower.includes(vNameLower) || vNameLower.includes(vLower);
        });
        if (fuzzyMatch) {
          vendorId = fuzzyMatch.id;
          vendorName = fuzzyMatch.name;
        } else {
          const nameWords = vNameLower.split(/\s+/).filter((w) => w.length > 2);
          let best: { vendor: typeof vendors[0]; overlap: number } | null = null;
          for (const v of vendors) {
            const vWords = v.name.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
            const overlap = nameWords.filter((w) => vWords.some((vw) => vw.includes(w) || w.includes(vw))).length;
            if (overlap > 0 && (!best || overlap > best.overlap)) {
              best = { vendor: v, overlap };
            }
          }
          if (best) {
            vendorId = best.vendor.id;
            vendorName = best.vendor.name;
          }
        }
      }
    }

    if (vendorId) {
      const v = vendors.find((v) => v.id === vendorId);
      if (v) vendorName = v.name;
    }

    // Filter to this vendor's prices if we know the vendor
    const vendorSpecificPrices = vendorId
      ? allVendorPrices.filter((vp) => vp.vendor_id === vendorId)
      : allVendorPrices;

    const lines: InvoiceLine[] = parsed.lines.map((line) => {
      const nameLower = line.vendor_item_name.toLowerCase().trim();

      // 1. Exact match on vendor_prices.vendor_item_name
      const exactVpMatch = vendorSpecificPrices.find(
        (vp) => vp.vendor_item_name && vp.vendor_item_name.toLowerCase().trim() === nameLower
      );
      if (exactVpMatch) {
        const matchedItem = items.find((i) => i.id === exactVpMatch.item_id);
        return {
          ...line,
          matched_item_id: exactVpMatch.item_id,
          matched_item_name: matchedItem?.name ?? null,
          match_confidence: 'exact' as const,
          existing_vendor_price_id: exactVpMatch.id,
        };
      }

      // 2. Exact match on items.name
      const exactItemMatch = items.find((i) => i.name.toLowerCase().trim() === nameLower);
      if (exactItemMatch) {
        return {
          ...line,
          matched_item_id: exactItemMatch.id,
          matched_item_name: exactItemMatch.name,
          match_confidence: 'exact' as const,
          existing_vendor_price_id: null,
        };
      }

      // 3. Fuzzy: substring match on vendor_prices
      const fuzzyVpMatch = vendorSpecificPrices.find(
        (vp) => vp.vendor_item_name && (
          vp.vendor_item_name.toLowerCase().includes(nameLower) ||
          nameLower.includes(vp.vendor_item_name.toLowerCase())
        )
      );
      if (fuzzyVpMatch) {
        const matchedItem = items.find((i) => i.id === fuzzyVpMatch.item_id);
        return {
          ...line,
          matched_item_id: fuzzyVpMatch.item_id,
          matched_item_name: matchedItem?.name ?? null,
          match_confidence: 'high' as const,
          existing_vendor_price_id: fuzzyVpMatch.id,
        };
      }

      // 4. Fuzzy: substring match on items.name
      const fuzzyItemMatch = items.find((i) => {
        const itemLower = i.name.toLowerCase();
        return itemLower.includes(nameLower) || nameLower.includes(itemLower);
      });
      if (fuzzyItemMatch) {
        return {
          ...line,
          matched_item_id: fuzzyItemMatch.id,
          matched_item_name: fuzzyItemMatch.name,
          match_confidence: 'high' as const,
          existing_vendor_price_id: null,
        };
      }

      // 5. Word overlap match
      const nameWords = nameLower.split(/\s+/).filter((w) => w.length > 2);
      let bestMatch: { item: typeof items[0]; overlap: number } | null = null;
      for (const item of items) {
        const itemWords = item.name.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
        const overlap = nameWords.filter((w) => itemWords.some((iw) => iw.includes(w) || w.includes(iw))).length;
        if (overlap > 0 && (!bestMatch || overlap > bestMatch.overlap)) {
          bestMatch = { item, overlap };
        }
      }
      if (bestMatch && bestMatch.overlap >= Math.max(1, Math.floor(nameWords.length / 2))) {
        return {
          ...line,
          matched_item_id: bestMatch.item.id,
          matched_item_name: bestMatch.item.name,
          match_confidence: 'low' as const,
          existing_vendor_price_id: null,
        };
      }

      // 6. No match
      return {
        ...line,
        matched_item_id: null,
        matched_item_name: null,
        match_confidence: 'none' as const,
        existing_vendor_price_id: null,
      };
    });

    const matched = lines.filter((l) => l.match_confidence !== 'none').length;
    const totalAmount = lines.reduce((sum, l) => sum + l.line_total, 0);

    results.push({
      vendor_id: vendorId,
      vendor_name: vendorName,
      detected_vendor_name: detectedVendorName,
      invoice_date: parsed.invoice_date,
      invoice_number: parsed.invoice_number,
      lines,
      summary: {
        total_lines: lines.length,
        matched,
        unmatched: lines.length - matched,
        total_amount: Math.round(totalAmount * 100) / 100,
      },
    });
  }

  return results;
}

export function createInvoiceRoutes(store: InventoryStore): Router {
  const router = Router();

  // POST /api/invoices/parse — bulk upload, auto-detect vendor
  router.post('/parse', upload.array('files', 20), async (req, res) => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
      return;
    }

    const files = req.files as Express.Multer.File[] | undefined;
    if (!files || files.length === 0) {
      res.status(400).json({ error: 'No files uploaded' });
      return;
    }

    // Optional vendor_id override
    const vendorIdOverride = req.body.vendor_id ? Number(req.body.vendor_id) : undefined;
    if (vendorIdOverride) {
      const vendor = await store.getVendorById(vendorIdOverride);
      if (!vendor) {
        res.status(404).json({ error: 'Vendor not found' });
        return;
      }
    }

    try {
      const client = new Anthropic({ apiKey });
      const results: InvoiceParseResult[] = [];

      for (const file of files) {
        const fileResults = await parseOneFile(client, file, store, vendorIdOverride);
        results.push(...fileResults);
      }

      res.json(results);
    } catch (err: any) {
      res.status(500).json({ error: `Invoice parsing failed: ${err.message}` });
    }
  });

  // POST /api/invoices/confirm
  router.post('/confirm', async (req, res) => {
    const { vendor_id, lines, record_transactions } = req.body as {
      vendor_id: number;
      lines: Array<{
        vendor_item_name: string;
        matched_item_id: number;
        quantity: number;
        unit: string;
        unit_price: number;
        create_vendor_price: boolean;
      }>;
      record_transactions: boolean;
    };

    if (!vendor_id || !Array.isArray(lines)) {
      res.status(400).json({ error: 'vendor_id and lines are required' });
      return;
    }

    const vendor = await store.getVendorById(vendor_id);
    if (!vendor) {
      res.status(404).json({ error: 'Vendor not found' });
      return;
    }

    let vendorPricesCreated = 0;
    let transactionsCreated = 0;

    for (const line of lines) {
      if (!line.matched_item_id) continue;

      const item = await store.getItemById(line.matched_item_id);
      if (!item) continue;

      if (line.create_vendor_price) {
        const existingPrices = await store.listVendorPricesForItem(line.matched_item_id);
        const alreadyExists = existingPrices.some(
          (vp) => vp.vendor_id === vendor_id &&
            vp.vendor_item_name?.toLowerCase() === line.vendor_item_name.toLowerCase()
        );

        if (!alreadyExists) {
          await store.createVendorPrice(line.matched_item_id, {
            vendor_id,
            vendor_item_name: line.vendor_item_name,
            order_unit: line.unit as any,
            order_unit_price: line.unit_price,
            is_default: false,
          });
          vendorPricesCreated++;
        }
      }

      if (record_transactions) {
        await store.insertTransactionAndAdjustQty({
          itemId: line.matched_item_id,
          type: 'in',
          quantity: line.quantity,
          reason: 'Received',
          notes: `Invoice from ${vendor.name}`,
          delta: line.quantity,
          estimatedCost: Math.round(line.quantity * line.unit_price * 100) / 100,
        });
        transactionsCreated++;
      }
    }

    res.json({
      vendor_prices_created: vendorPricesCreated,
      transactions_created: transactionsCreated,
    });
  });

  return router;
}
