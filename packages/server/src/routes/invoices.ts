import { Router } from 'express';
import multer from 'multer';
import Anthropic from '@anthropic-ai/sdk';
import convertHeic from 'heic-convert';
import type { InventoryStore } from '../store/types.js';
import type { InvoiceLine, InvoiceParseResult } from '@fifoflow/shared';
import { matchInvoiceLineToInventory, normalizeInvoiceItemName, tokenizeInvoiceItemName } from './invoiceMatching.js';
import { extractPdfEvidence, type InvoiceDocumentPageEvidence } from './invoiceDocumentExtraction.js';

const INVOICE_IMAGE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/heic',
  'image/heif',
]);

const INVOICE_UPLOAD_EXTENSIONS = ['.pdf', '.png', '.jpg', '.jpeg', '.webp', '.heic', '.heif'];

function fileNameLooksLike(fileName: string, extensions: string[]): boolean {
  const lowerName = fileName.toLowerCase();
  return extensions.some((extension) => lowerName.endsWith(extension));
}

export function isSupportedInvoiceUpload(file: Pick<Express.Multer.File, 'mimetype' | 'originalname'>): boolean {
  return file.mimetype === 'application/pdf'
    || INVOICE_IMAGE_MIME_TYPES.has(file.mimetype.toLowerCase())
    || fileNameLooksLike(file.originalname, INVOICE_UPLOAD_EXTENSIONS);
}

export function isHeicLikeUpload(file: Pick<Express.Multer.File, 'mimetype' | 'originalname'>): boolean {
  const mime = file.mimetype.toLowerCase();
  return mime === 'image/heic'
    || mime === 'image/heif'
    || fileNameLooksLike(file.originalname, ['.heic', '.heif']);
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (isSupportedInvoiceUpload(file)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF, PNG, JPEG, WebP, HEIC, and HEIF files are supported'));
    }
  },
});

function getMediaType(mimetype: string): 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif' {
  if (mimetype === 'image/png') return 'image/png';
  if (mimetype === 'image/webp') return 'image/webp';
  return 'image/jpeg';
}

interface ParsedInvoiceLine {
  vendor_item_name: string;
  source_text?: string | null;
  page_number?: number | null;
  quantity: number;
  unit: string;
  unit_price: number;
  line_total: number;
}

interface ParsedInvoice {
  vendor_name: string;
  invoice_date: string | null;
  invoice_number: string | null;
  lines: ParsedInvoiceLine[];
}

interface ParsedInvoiceEnvelope {
  invoices: ParsedInvoice[];
}

interface InvoiceTranscriptContext {
  fullTranscript: string;
  normalizedTranscript: string;
  transcriptTokens: Set<string>;
  pageTranscripts: Map<number, { raw: string; normalized: string; tokens: Set<string> }>;
}

export function parseInvoiceAiResponse(text: string): ParsedInvoiceEnvelope {
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, text];
  const jsonData = JSON.parse(jsonMatch[1]!.trim());

  if (Array.isArray(jsonData.invoices)) {
    return {
      invoices: jsonData.invoices.filter((invoice: unknown) => invoice && typeof invoice === 'object'),
    };
  }

  if (jsonData.vendor_name && Array.isArray(jsonData.lines)) {
    return { invoices: [jsonData as ParsedInvoice] };
  }

  throw new Error('Unexpected invoice response shape');
}

export function buildInvoiceTranscriptContext(pages: InvoiceDocumentPageEvidence[]): InvoiceTranscriptContext {
  const extractedTranscript = pages
    .map((page) => cleanExtractedTranscriptText(page.extractedText))
    .filter((text) => text.length > 0)
    .join('\n\n');
  const fullTranscript = extractedTranscript;
  const normalizedTranscript = normalizeInvoiceItemName(fullTranscript);
  const transcriptTokens = new Set(tokenizeInvoiceItemName(fullTranscript));
  const pageTranscripts = new Map<number, { raw: string; normalized: string; tokens: Set<string> }>();

  for (const page of pages) {
    const cleanedText = cleanExtractedTranscriptText(page.extractedText);
    pageTranscripts.set(page.pageNumber, {
      raw: cleanedText,
      normalized: normalizeInvoiceItemName(cleanedText),
      tokens: new Set(tokenizeInvoiceItemName(cleanedText)),
    });
  }

  return {
    fullTranscript,
    normalizedTranscript,
    transcriptTokens,
    pageTranscripts,
  };
}

export function isInvoiceLineSupportedByTranscript(
  line: Pick<ParsedInvoiceLine, 'vendor_item_name' | 'source_text' | 'page_number'>,
  transcript: InvoiceTranscriptContext,
): boolean {
  if (!transcript.transcriptTokens.size) {
    return true;
  }

  const lineTokens = tokenizeInvoiceItemName(line.vendor_item_name);
  if (!lineTokens.length) {
    return false;
  }

  const scopedTranscript = line.page_number != null
    ? transcript.pageTranscripts.get(line.page_number) ?? null
    : null;
  const normalizedTranscript = scopedTranscript?.normalized || transcript.normalizedTranscript;
  const transcriptTokens = scopedTranscript?.tokens || transcript.transcriptTokens;
  const rawTranscript = scopedTranscript?.raw || transcript.fullTranscript;

  const normalizedName = lineTokens.join(' ');
  if (normalizedName && normalizedTranscript.includes(normalizedName)) {
    return true;
  }

  const sourceText = normalizeLooseText(line.source_text ?? '');
  if (sourceText && normalizeLooseText(rawTranscript).includes(sourceText)) {
    return true;
  }

  const matchingTokens = lineTokens.filter((token) => transcriptTokens.has(token)).length;
  if (lineTokens.length === 1) {
    return matchingTokens === 1;
  }

  return matchingTokens >= Math.min(2, lineTokens.length)
    && (matchingTokens / lineTokens.length) >= 0.6;
}

function normalizeLooseText(input: string): string {
  return input
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .trim();
}

function cleanExtractedTranscriptText(input: string): string {
  return input.trim();
}

function buildInvoiceParsePrompt(vendorNames: string, vendorOverrideName: string | null, pages: InvoiceDocumentPageEvidence[]): string {
  const hasExtractedTranscript = pages.some((page) => page.extractedText.length > 0);

  return `Extract ALL invoices and their line items from the supplied evidence. Return a JSON object with this exact structure:
{
  "invoices": [
    {
      "vendor_name": "the seller/vendor name shown on this invoice",
      "invoice_date": "YYYY-MM-DD or null",
      "invoice_number": "string or null",
      "lines": [
        {
          "vendor_item_name": "product name exactly as printed on the invoice line",
          "source_text": "short exact snippet copied from the invoice line that supports this item",
          "page_number": 1,
          "quantity": number,
          "unit": "unit of measure exactly as shown (case, bottle, each, lb, oz, etc.)",
          "unit_price": number,
          "line_total": number
        }
      ]
    }
  ]
}

Known vendors in our system: ${vendorNames || 'none yet'}
${vendorOverrideName ? `Vendor override selected by the operator: ${vendorOverrideName}` : ''}

Rules:
- Read EVERY supplied page in order.
- This document may contain one invoice or multiple invoices.
- If multiple pages belong to the same invoice, combine them into one invoice entry.
- If multiple separate invoices are present, return separate invoice entries.
- Use page transcripts as the primary source of truth whenever they are present.${hasExtractedTranscript ? '' : ' No transcript was available, so rely on the page images only.'}
- Never invent substitute products, categories, or likely items.
- If an item cannot be anchored to visible invoice evidence, omit it.
- source_text must be copied exactly from the supporting invoice line, not paraphrased.
- vendor_item_name must stay faithful to the printed line item, not normalized into a different product.
- The vendor_name must be the seller shown on the invoice, not the customer or ship-to location.
- If unit_price or line_total is missing, calculate from the other visible values.
- If quantity or unit is missing, use only the closest literal value shown on the invoice line.
- Return ONLY the JSON object, no other text.`;
}

function buildInvoiceParseContent(
  file: Express.Multer.File,
  pages: InvoiceDocumentPageEvidence[],
  vendors: Array<{ id: number; name: string }>,
  vendorIdOverride?: number,
): Anthropic.ContentBlockParam[] {
  const vendorNames = vendors.map((vendor) => vendor.name).join(', ');
  const vendorOverrideName = vendorIdOverride
    ? vendors.find((vendor) => vendor.id === vendorIdOverride)?.name ?? null
    : null;

  const content: Anthropic.ContentBlockParam[] = [
    {
      type: 'text',
      text: `Invoice file: ${file.originalname}\n${buildInvoiceParsePrompt(vendorNames, vendorOverrideName, pages)}`,
    },
  ];

  for (const page of pages) {
    if (page.extractedText) {
      content.push({
        type: 'text',
        text: `PAGE ${page.pageNumber} TRANSCRIPT:\n${page.extractedText.slice(0, 12000)}`,
      });
    } else {
      content.push({
        type: 'text',
        text: `PAGE ${page.pageNumber} TRANSCRIPT:\n[no embedded text extracted from this page]`,
      });
    }

    if (page.imageBase64) {
      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: page.imageMediaType,
          data: page.imageBase64,
        },
      });
    }
  }

  return content;
}

function buildImageEvidence(file: Express.Multer.File): InvoiceDocumentPageEvidence[] {
  return [{
    pageNumber: 1,
    extractedText: '',
    imageBase64: file.buffer.toString('base64'),
    imageMediaType: getMediaType(file.mimetype),
  }];
}

async function normalizeInvoiceUpload(file: Express.Multer.File): Promise<Express.Multer.File> {
  if (!isHeicLikeUpload(file)) {
    return file;
  }

  const converted = await convertHeic({
    buffer: file.buffer,
    format: 'JPEG',
    quality: 0.92,
  });
  const convertedBuffer = Buffer.isBuffer(converted) ? converted : Buffer.from(converted);

  return {
    ...file,
    buffer: convertedBuffer,
    mimetype: 'image/jpeg',
    originalname: file.originalname.replace(/\.(heic|heif)$/i, '.jpg'),
    size: convertedBuffer.byteLength,
  };
}

function normalizeParsedLine(rawLine: ParsedInvoiceLine): ParsedInvoiceLine | null {
  const vendorItemName = String(rawLine.vendor_item_name ?? '').trim();
  if (!vendorItemName) {
    return null;
  }

  const quantity = Number(rawLine.quantity) || 0;
  const unitPrice = Number(rawLine.unit_price) || 0;
  let lineTotal = Number(rawLine.line_total) || quantity * unitPrice;
  if (!lineTotal && quantity && unitPrice) {
    lineTotal = Math.round(quantity * unitPrice * 100) / 100;
  }

  return {
    vendor_item_name: vendorItemName,
    source_text: rawLine.source_text ? String(rawLine.source_text).trim() : null,
    page_number: rawLine.page_number != null ? Number(rawLine.page_number) || null : null,
    quantity,
    unit: String(rawLine.unit ?? 'each').trim() || 'each',
    unit_price: unitPrice,
    line_total: lineTotal,
  };
}

async function parseOneFile(
  client: Anthropic,
  file: Express.Multer.File,
  store: InventoryStore,
  vendorIdOverride?: number,
): Promise<InvoiceParseResult[]> {
  const normalizedFile = await normalizeInvoiceUpload(file);
  const vendors = await store.listVendors();
  const pages = normalizedFile.mimetype === 'application/pdf'
    ? await extractPdfEvidence(normalizedFile.buffer)
    : buildImageEvidence(normalizedFile);

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 16384,
    messages: [
      {
        role: 'user',
        content: buildInvoiceParseContent(normalizedFile, pages, vendors, vendorIdOverride),
      },
    ],
  });

  const textContent = response.content.find((content) => content.type === 'text');
  if (!textContent || textContent.type !== 'text') {
    throw new Error('Failed to extract invoice data');
  }

  let parsedEnvelope: ParsedInvoiceEnvelope;
  try {
    parsedEnvelope = parseInvoiceAiResponse(textContent.text);
  } catch {
    throw new Error('Failed to parse invoice data from AI response');
  }

  const transcript = buildInvoiceTranscriptContext(pages);
  const items = await store.listItems();
  const allVendorPrices: Array<{ id: number; item_id: number; vendor_id: number; vendor_item_name: string | null }> = [];
  for (const item of items) {
    const prices = await store.listVendorPricesForItem(item.id);
    for (const vendorPrice of prices) {
      allVendorPrices.push({
        id: vendorPrice.id,
        item_id: vendorPrice.item_id,
        vendor_id: vendorPrice.vendor_id,
        vendor_item_name: vendorPrice.vendor_item_name,
      });
    }
  }

  const results: InvoiceParseResult[] = [];

  for (const parsed of parsedEnvelope.invoices) {
    let vendorId: number | null = vendorIdOverride ?? null;
    let vendorName = parsed.vendor_name;
    const detectedVendorName = parsed.vendor_name;

    if (!vendorId && parsed.vendor_name) {
      const normalizedVendorName = parsed.vendor_name.toLowerCase().trim();
      const exactMatch = vendors.find((vendor) => vendor.name.toLowerCase().trim() === normalizedVendorName);
      if (exactMatch) {
        vendorId = exactMatch.id;
        vendorName = exactMatch.name;
      } else {
        const fuzzyMatch = vendors.find((vendor) => {
          const vendorNameLower = vendor.name.toLowerCase();
          return vendorNameLower.includes(normalizedVendorName) || normalizedVendorName.includes(vendorNameLower);
        });
        if (fuzzyMatch) {
          vendorId = fuzzyMatch.id;
          vendorName = fuzzyMatch.name;
        } else {
          const nameWords = normalizedVendorName.split(/\s+/).filter((word) => word.length > 2);
          let best: { vendor: (typeof vendors)[number]; overlap: number } | null = null;
          for (const vendor of vendors) {
            const vendorWords = vendor.name.toLowerCase().split(/\s+/).filter((word) => word.length > 2);
            const overlap = nameWords.filter((word) => vendorWords.some((vendorWord) => vendorWord.includes(word) || word.includes(vendorWord))).length;
            if (overlap > 0 && (!best || overlap > best.overlap)) {
              best = { vendor, overlap };
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
      const vendor = vendors.find((entry) => entry.id === vendorId);
      if (vendor) {
        vendorName = vendor.name;
      }
    }

    const vendorSpecificPrices = vendorId
      ? allVendorPrices.filter((vendorPrice) => vendorPrice.vendor_id === vendorId)
      : allVendorPrices;

    const normalizedLines = parsed.lines
      .map((rawLine) => normalizeParsedLine(rawLine))
      .filter((line): line is ParsedInvoiceLine => line !== null)
      .filter((line) => isInvoiceLineSupportedByTranscript(line, transcript));

    if (parsed.lines.length > 0 && normalizedLines.length === 0 && transcript.transcriptTokens.size > 0) {
      throw new Error(`No invoice lines from ${normalizedFile.originalname} could be verified against extracted document text`);
    }

    const lines: InvoiceLine[] = normalizedLines.map((line) => {
      const matched = matchInvoiceLineToInventory(line.vendor_item_name, items, vendorSpecificPrices);
      return {
        vendor_item_name: line.vendor_item_name,
        quantity: line.quantity,
        unit: line.unit,
        unit_price: line.unit_price,
        line_total: line.line_total,
        ...matched,
      };
    });

    const matchedCount = lines.filter((line) => line.matched_item_id != null).length;
    const totalAmount = lines.reduce((sum, line) => sum + line.line_total, 0);

    results.push({
      vendor_id: vendorId,
      vendor_name: vendorName,
      detected_vendor_name: detectedVendorName,
      invoice_date: parsed.invoice_date,
      invoice_number: parsed.invoice_number,
      lines,
      summary: {
        total_lines: lines.length,
        matched: matchedCount,
        unmatched: lines.length - matchedCount,
        total_amount: Math.round(totalAmount * 100) / 100,
      },
    });
  }

  return results;
}

export function createInvoiceRoutes(store: InventoryStore): Router {
  const router = Router();

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
    let vendorsAssigned = 0;

    for (const line of lines) {
      if (!line.matched_item_id) continue;

      const item = await store.getItemById(line.matched_item_id);
      if (!item) continue;

      if (!item.vendor_id) {
        await store.updateItem(line.matched_item_id, { vendor_id });
        vendorsAssigned++;
      }

      if (line.create_vendor_price) {
        const existingPrices = await store.listVendorPricesForItem(line.matched_item_id);
        const alreadyExists = existingPrices.some(
          (vendorPrice) => vendorPrice.vendor_id === vendor_id
            && vendorPrice.vendor_item_name?.toLowerCase() === line.vendor_item_name.toLowerCase(),
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
      vendors_assigned: vendorsAssigned,
    });
  });

  return router;
}
