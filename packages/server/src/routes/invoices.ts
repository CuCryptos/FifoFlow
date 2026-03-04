import { Router } from 'express';
import multer from 'multer';
import Anthropic from '@anthropic-ai/sdk';
import type { InventoryStore } from '../store/types.js';
import type { InvoiceLine, InvoiceParseResult } from '@fifoflow/shared';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
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

export function createInvoiceRoutes(store: InventoryStore): Router {
  const router = Router();

  // POST /api/invoices/parse
  router.post('/parse', upload.single('file'), async (req, res) => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
      return;
    }

    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    const vendorId = Number(req.body.vendor_id);
    if (!vendorId || isNaN(vendorId)) {
      res.status(400).json({ error: 'vendor_id is required' });
      return;
    }

    const vendor = await store.getVendorById(vendorId);
    if (!vendor) {
      res.status(404).json({ error: 'Vendor not found' });
      return;
    }

    try {
      const client = new Anthropic({ apiKey });
      const base64Data = req.file.buffer.toString('base64');
      const isPdf = req.file.mimetype === 'application/pdf';

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
              media_type: getMediaType(req.file.mimetype),
              data: base64Data,
            },
          };

      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        messages: [
          {
            role: 'user',
            content: [
              contentBlock,
              {
                type: 'text',
                text: `Extract all line items from this vendor invoice. Return a JSON object with this exact structure:
{
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

Rules:
- Extract every line item, even if partially visible
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
        res.status(500).json({ error: 'Failed to extract invoice data' });
        return;
      }

      // Parse the JSON from Claude's response
      let parsed: { invoice_date: string | null; invoice_number: string | null; lines: Array<{ vendor_item_name: string; quantity: number; unit: string; unit_price: number; line_total: number }> };
      try {
        // Try to extract JSON from the response (may be wrapped in markdown code blocks)
        const jsonMatch = textContent.text.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, textContent.text];
        parsed = JSON.parse(jsonMatch[1]!.trim());
      } catch {
        res.status(500).json({ error: 'Failed to parse invoice data from AI response' });
        return;
      }

      // Fuzzy match each line against vendor_prices and items
      const items = await store.listItems();
      const vendorPrices = await store.listVendorPricesForItem(-1).catch(() => [] as any[]);

      // Get all vendor prices for this vendor across all items
      const allVendorPrices: Array<{ id: number; item_id: number; vendor_item_name: string | null }> = [];
      for (const item of items) {
        const prices = await store.listVendorPricesForItem(item.id);
        for (const vp of prices) {
          if (vp.vendor_id === vendorId) {
            allVendorPrices.push({ id: vp.id, item_id: vp.item_id, vendor_item_name: vp.vendor_item_name });
          }
        }
      }

      const lines: InvoiceLine[] = parsed.lines.map((line) => {
        const nameLower = line.vendor_item_name.toLowerCase().trim();

        // 1. Exact match on vendor_prices.vendor_item_name
        const exactVpMatch = allVendorPrices.find(
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

        // 3. Fuzzy match: check if vendor_item_name contains or is contained in item name
        const fuzzyVpMatch = allVendorPrices.find(
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

        // 4. Fuzzy match on items.name
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

      const result: InvoiceParseResult = {
        vendor_id: vendorId,
        vendor_name: vendor.name,
        invoice_date: parsed.invoice_date,
        invoice_number: parsed.invoice_number,
        lines,
        summary: {
          total_lines: lines.length,
          matched,
          unmatched: lines.length - matched,
          total_amount: Math.round(totalAmount * 100) / 100,
        },
      };

      res.json(result);
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

      // Create vendor price if requested
      if (line.create_vendor_price) {
        // Check if vendor price already exists for this combo
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

      // Record transaction if requested
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
