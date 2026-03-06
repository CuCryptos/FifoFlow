import { Router } from 'express';
import multer from 'multer';
import Anthropic from '@anthropic-ai/sdk';
import type { InventoryStore } from '../store/types.js';
import type { ForecastParseResult } from '@fifoflow/shared';
import { saveForecastSchema, saveForecastMappingsBulkSchema, updateForecastEntrySchema } from '@fifoflow/shared';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are supported for forecasts'));
    }
  },
});

export function createForecastRoutes(store: InventoryStore): Router {
  const router = Router();

  // Parse forecast PDF with AI
  router.post('/parse', upload.single('file'), async (req, res) => {
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
      return;
    }

    const client = new Anthropic({ apiKey });
    const base64Data = file.buffer.toString('base64');

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 16384,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document' as const,
              source: {
                type: 'base64' as const,
                media_type: 'application/pdf' as const,
                data: base64Data,
              },
            },
            {
              type: 'text',
              text: `Extract ALL data from this forecast table. Return a JSON object with this exact structure:

{
  "date_range_label": "the date range from the header, e.g. '02/26/26 - 03/11/26'",
  "dates": ["YYYY-MM-DD", "YYYY-MM-DD", ...],
  "products": [
    {
      "product_name": "exact name as shown, e.g. 'EARLY BIRD WHALE WATCH (EBW)'",
      "group": "the section header, e.g. 'SOH' or 'RAH' or 'RSH'",
      "counts": {
        "YYYY-MM-DD": 150,
        "YYYY-MM-DD": 200
      }
    }
  ]
}

Rules:
- Read every row and every column of the table
- Parse all dates to YYYY-MM-DD format (the year in the header is 2-digit, expand to 4-digit, e.g. 26 = 2026)
- For each product row, map the guest counts to the corresponding date column
- "X" means no service — treat as 0
- Empty or blank cells = 0
- Only include rows that represent bookable products with guest counts (rows with numbers)
- Do NOT include rows that are purely structural (deck assignments like "Dk#1 - BOW", room names like "Room AB" unless they have numeric guest counts)
- Keep the exact product names as printed
- Return ONLY the JSON object, no other text`,
            },
          ],
        },
      ],
    });

    const textContent = response.content.find((c) => c.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      res.status(500).json({ error: 'Failed to extract forecast data' });
      return;
    }

    let result: ForecastParseResult;
    try {
      const jsonMatch = textContent.text.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, textContent.text];
      result = JSON.parse(jsonMatch[1]!.trim());
    } catch {
      res.status(500).json({ error: 'Failed to parse forecast data from AI response' });
      return;
    }

    res.json(result);
  });

  // Save parsed forecast to DB
  router.post('/save', async (req, res) => {
    const parsed = saveForecastSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const forecast = await store.saveForecast(parsed.data);
    res.status(201).json(forecast);
  });

  // List saved forecasts
  router.get('/', async (_req, res) => {
    const forecasts = await store.listForecasts();
    res.json(forecasts);
  });

  // IMPORTANT: /mappings must be defined before /:id to avoid matching "mappings" as a param
  router.get('/mappings', async (_req, res) => {
    const mappings = await store.listForecastMappings();
    res.json(mappings);
  });

  router.post('/mappings', async (req, res) => {
    const parsed = saveForecastMappingsBulkSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const results = await store.saveForecastMappingsBulk(parsed.data.mappings);
    res.json(results);
  });

  router.delete('/mappings/:id', async (req, res) => {
    await store.deleteForecastMapping(Number(req.params.id));
    res.status(204).send();
  });

  // Update a single forecast entry
  router.patch('/entries/:entryId', async (req, res) => {
    const parsed = updateForecastEntrySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    try {
      const entry = await store.updateForecastEntry(Number(req.params.entryId), parsed.data.guest_count);
      res.json(entry);
    } catch {
      res.status(404).json({ error: 'Forecast entry not found' });
    }
  });

  // Parameterized routes after static routes
  router.get('/:id', async (req, res) => {
    const forecast = await store.getForecastById(Number(req.params.id));
    if (!forecast) {
      res.status(404).json({ error: 'Forecast not found' });
      return;
    }
    res.json(forecast);
  });

  router.delete('/:id', async (req, res) => {
    await store.deleteForecast(Number(req.params.id));
    res.status(204).send();
  });

  return router;
}
