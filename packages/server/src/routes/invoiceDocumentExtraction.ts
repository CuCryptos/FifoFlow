import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface InvoiceDocumentPageEvidence {
  pageNumber: number;
  extractedText: string;
  imageBase64: string | null;
  imageMediaType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';
}

export async function extractPdfEvidence(buffer: Buffer): Promise<InvoiceDocumentPageEvidence[]> {
  const tempDir = await mkdtemp(join(tmpdir(), 'fifoflow-invoice-'));
  const pdfPath = join(tempDir, 'invoice.pdf');
  const imagePrefix = join(tempDir, 'page');

  try {
    await writeFile(pdfPath, buffer);

    const pageCount = await readPdfPageCount(pdfPath);
    await execFileAsync('pdftoppm', ['-jpeg', '-jpegopt', 'quality=82', '-r', '144', pdfPath, imagePrefix]);

    const renderedFiles = await readdir(tempDir);
    const renderedPages = new Map<number, string>();
    for (const entry of renderedFiles) {
      const match = entry.match(/^page-(\d+)\.jpg$/);
      if (match) {
        renderedPages.set(Number(match[1]), join(tempDir, entry));
      }
    }

    const pages: InvoiceDocumentPageEvidence[] = [];
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      const extractedText = await extractPdfPageText(pdfPath, pageNumber);
      const renderedPath = renderedPages.get(pageNumber) ?? null;
      const imageBase64 = renderedPath ? await readFile(renderedPath, 'base64') : null;
      pages.push({
        pageNumber,
        extractedText: cleanExtractedPageText(extractedText),
        imageBase64,
        imageMediaType: 'image/jpeg',
      });
    }

    return pages;
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

export function cleanExtractedPageText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\u0000/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function buildInvoiceTranscript(pages: InvoiceDocumentPageEvidence[]): string {
  return pages
    .map((page) => {
      if (!page.extractedText) {
        return `PAGE ${page.pageNumber}: [no embedded text extracted]`;
      }
      return `PAGE ${page.pageNumber}:\n${page.extractedText}`;
    })
    .join('\n\n');
}

async function readPdfPageCount(pdfPath: string): Promise<number> {
  const { stdout } = await execFileAsync('pdfinfo', [pdfPath]);
  const match = stdout.match(/^Pages:\s+(\d+)$/m);
  if (!match) {
    throw new Error('Unable to determine PDF page count');
  }
  return Number(match[1]);
}

async function extractPdfPageText(pdfPath: string, pageNumber: number): Promise<string> {
  try {
    const { stdout } = await execFileAsync('pdftotext', ['-layout', '-f', String(pageNumber), '-l', String(pageNumber), pdfPath, '-']);
    return stdout;
  } catch {
    return '';
  }
}
