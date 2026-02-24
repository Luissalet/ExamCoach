/**
 * pdfTextExtractor.ts
 *
 * Extracción inteligente de texto de PDFs respetando layout:
 *   - Detecta columnas
 *   - Elimina headers/footers/números de página
 *   - Agrupa en párrafos con orden de lectura correcto
 *   - Detecta bloques de fórmulas/símbolos matemáticos
 */

import * as pdfjsLib from 'pdfjs-dist';

// Asegurar que el worker está configurado
if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).href;
}

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface TextBlock {
  /** Texto limpio del bloque */
  text: string;
  /** Índice de página (0-indexed) */
  pageIndex: number;
  /** Tipo de contenido detectado */
  type: 'paragraph' | 'heading' | 'math' | 'list';
  /** Posición Y normalizada (0-1) en la página — para scroll sync */
  yPosition: number;
}

export interface ExtractionResult {
  blocks: TextBlock[];
  /** Número total de páginas procesadas */
  totalPages: number;
  /** Páginas que no pudieron procesarse */
  errors: { page: number; error: string }[];
}

interface TextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
}

interface LineGroup {
  y: number;
  items: TextItem[];
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const Y_TOLERANCE = 3;
const PARAGRAPH_GAP = 12;
const MATH_CHAR_REGEX = /[\u0391-\u03C9\u2200-\u22FF\u2A00-\u2AFF∑∏∫∂√∞≈≠≤≥±×÷∈∉⊂⊃∪∩∀∃∇∆λμσΣΠ]/;

// ─── Main Export ───────────────────────────────────────────────────────────────

/**
 * Extrae texto estructurado de un PDF.
 * @param source - URL del PDF o PDFDocumentProxy ya cargado
 * @param options - Opciones de extracción
 */
export async function extractPdfText(
  source: string | pdfjsLib.PDFDocumentProxy,
  options?: {
    /** Páginas a extraer (1-indexed). Si no se pasa, extrae todas. */
    pages?: number[];
    /** Callback de progreso (0-1) */
    onProgress?: (progress: number) => void;
  },
): Promise<ExtractionResult> {
  const pdfDoc =
    typeof source === 'string'
      ? await pdfjsLib.getDocument(source).promise
      : source;

  const totalPages = pdfDoc.numPages;
  const pagesToProcess = options?.pages ?? Array.from({ length: totalPages }, (_, i) => i + 1);
  const allBlocks: TextBlock[] = [];
  const errors: { page: number; error: string }[] = [];

  for (let idx = 0; idx < pagesToProcess.length; idx++) {
    const pageNum = pagesToProcess[idx];
    try {
      const pageBlocks = await extractPageBlocks(pdfDoc, pageNum);
      allBlocks.push(...pageBlocks);
    } catch (err) {
      errors.push({ page: pageNum, error: String(err) });
    }
    options?.onProgress?.((idx + 1) / pagesToProcess.length);
  }

  // Fusionar bloques pequeños consecutivos del mismo tipo para reducir cortes
  const merged = mergeSmallBlocks(allBlocks);

  return { blocks: merged, totalPages, errors };
}

// ─── Block merging ─────────────────────────────────────────────────────────────

/**
 * Fusiona bloques de tipo 'paragraph' consecutivos que sean cortos (<120 chars)
 * o que estén en la misma página, para producir chunks más largos que se leen
 * con más fluidez en TTS.
 * Los headings nunca se fusionan (marcan separaciones naturales).
 */
const MAX_MERGED_LENGTH = 800; // ~200 palabras ≈ límite cómodo para Web Speech API

function mergeSmallBlocks(blocks: TextBlock[]): TextBlock[] {
  if (blocks.length === 0) return blocks;
  const result: TextBlock[] = [];
  let acc: TextBlock | null = null;

  for (const block of blocks) {
    // Headings siempre van solos: flush accumulator + push heading
    if (block.type === 'heading') {
      if (acc) { result.push(acc); acc = null; }
      result.push(block);
      continue;
    }

    if (!acc) {
      acc = { ...block };
      continue;
    }

    // Merge si mismo tipo, misma página, y no sobrepasa el límite
    const canMerge =
      acc.type === block.type &&
      acc.pageIndex === block.pageIndex &&
      acc.text.length + block.text.length + 1 <= MAX_MERGED_LENGTH;

    if (canMerge) {
      acc.text = acc.text + ' ' + block.text;
    } else {
      result.push(acc);
      acc = { ...block };
    }
  }

  if (acc) result.push(acc);
  return result;
}

// ─── Per-page extraction ───────────────────────────────────────────────────────

async function extractPageBlocks(
  pdfDoc: pdfjsLib.PDFDocumentProxy,
  pageNum: number,
): Promise<TextBlock[]> {
  const page = await pdfDoc.getPage(pageNum);
  const textContent = await page.getTextContent();
  const viewport = page.getViewport({ scale: 1.0 });
  const pageHeight = viewport.height;
  const pageWidth = viewport.width;

  // Cast items to our TextItem shape
  let items: TextItem[] = (textContent.items as any[])
    .filter((it) => 'str' in it && it.str.trim().length > 0)
    .map((it) => ({
      str: it.str,
      transform: it.transform,
      width: it.width ?? 0,
      height: it.height ?? 0,
    }));

  // ── Step 1: Filter headers, footers, page numbers ─────────────────────────
  const HEADER_ZONE = pageHeight * 0.06;
  const FOOTER_ZONE = pageHeight * 0.94;

  items = items.filter((item) => {
    const y = pageHeight - item.transform[5]; // top-down Y
    return y >= HEADER_ZONE && y <= FOOTER_ZONE;
  });

  // Filter isolated page numbers
  items = items.filter((item) => {
    const y = pageHeight - item.transform[5];
    const isEdge = y < pageHeight * 0.1 || y > pageHeight * 0.9;
    const isJustNumber = /^\s*\d{1,4}\s*$/.test(item.str);
    return !(isEdge && isJustNumber);
  });

  if (items.length === 0) return [];

  // ── Step 2: Group into lines ──────────────────────────────────────────────
  const lines = groupIntoLines(items, pageHeight);

  // ── Step 3: Detect columns ────────────────────────────────────────────────
  const columns = detectColumns(lines, pageWidth);

  // ── Step 4: Build text with correct reading order ─────────────────────────
  let orderedLines: LineGroup[];
  if (columns) {
    orderedLines = [...columns.left, ...columns.right];
  } else {
    orderedLines = lines;
  }

  // ── Step 5: Group into paragraphs ─────────────────────────────────────────
  const blocks = groupIntoParagraphs(orderedLines, pageHeight, pageNum - 1);
  return blocks;
}

// ─── Line grouping ─────────────────────────────────────────────────────────────

function groupIntoLines(items: TextItem[], pageHeight: number): LineGroup[] {
  const sorted = [...items].sort((a, b) => {
    const ya = pageHeight - a.transform[5];
    const yb = pageHeight - b.transform[5];
    if (Math.abs(ya - yb) > Y_TOLERANCE) return ya - yb;
    return a.transform[4] - b.transform[4];
  });

  const lines: LineGroup[] = [];
  for (const item of sorted) {
    const y = pageHeight - item.transform[5];
    const lastLine = lines[lines.length - 1];
    if (lastLine && Math.abs(lastLine.y - y) < Y_TOLERANCE) {
      lastLine.items.push(item);
    } else {
      lines.push({ y, items: [item] });
    }
  }

  for (const line of lines) {
    line.items.sort((a, b) => a.transform[4] - b.transform[4]);
  }

  return lines;
}

// ─── Column detection ──────────────────────────────────────────────────────────

function detectColumns(
  lines: LineGroup[],
  pageWidth: number,
): { left: LineGroup[]; right: LineGroup[] } | null {
  const COLUMN_GAP_THRESHOLD = pageWidth * 0.15;
  let columnGapX = -1;
  let gapCount = 0;

  for (const line of lines.slice(0, 30)) {
    for (let i = 0; i < line.items.length - 1; i++) {
      const gap =
        line.items[i + 1].transform[4] -
        (line.items[i].transform[4] + line.items[i].width);
      if (gap > COLUMN_GAP_THRESHOLD) {
        columnGapX =
          columnGapX < 0
            ? line.items[i + 1].transform[4]
            : (columnGapX + line.items[i + 1].transform[4]) / 2;
        gapCount++;
      }
    }
  }

  if (gapCount < 5 || columnGapX < 0) return null;

  const left: LineGroup[] = [];
  const right: LineGroup[] = [];

  for (const line of lines) {
    const leftItems = line.items.filter(
      (it) => it.transform[4] + it.width / 2 < columnGapX,
    );
    const rightItems = line.items.filter(
      (it) => it.transform[4] + it.width / 2 >= columnGapX,
    );
    if (leftItems.length) left.push({ y: line.y, items: leftItems });
    if (rightItems.length) right.push({ y: line.y, items: rightItems });
  }

  return { left, right };
}

// ─── Paragraph grouping ───────────────────────────────────────────────────────

function groupIntoParagraphs(
  lines: LineGroup[],
  pageHeight: number,
  pageIndex: number,
): TextBlock[] {
  const blocks: TextBlock[] = [];
  let currentText = '';
  let blockStartY = 0;

  for (let i = 0; i < lines.length; i++) {
    const lineText = lines[i].items.map((it) => it.str).join('');
    if (!lineText.trim()) continue;

    if (i > 0) {
      const gap = Math.abs(lines[i].y - lines[i - 1].y);
      if (gap > PARAGRAPH_GAP && currentText.trim()) {
        blocks.push({
          text: currentText.trim(),
          pageIndex,
          type: detectBlockType(currentText),
          yPosition: blockStartY / pageHeight,
        });
        currentText = '';
        blockStartY = lines[i].y;
      }
    } else {
      blockStartY = lines[i].y;
    }

    currentText +=
      currentText && !currentText.endsWith('\n') ? ' ' + lineText : lineText;
  }

  // Last block
  if (currentText.trim()) {
    blocks.push({
      text: currentText.trim(),
      pageIndex,
      type: detectBlockType(currentText),
      yPosition: blockStartY / pageHeight,
    });
  }

  return blocks;
}

// ─── Block type detection ──────────────────────────────────────────────────────

function detectBlockType(text: string): TextBlock['type'] {
  const trimmed = text.trim();

  // Heading: short line, possibly uppercase or numbered
  if (
    trimmed.length < 80 &&
    (/^\d+[\.\)]?\s/.test(trimmed) || trimmed === trimmed.toUpperCase())
  ) {
    return 'heading';
  }

  // Math: high density of math symbols (>15% of chars)
  const mathChars = (trimmed.match(new RegExp(MATH_CHAR_REGEX, 'g')) || []).length;
  if (mathChars / trimmed.length > 0.15) {
    return 'math';
  }

  // List: starts with bullet, dash, or number+dot
  if (/^[-•●◦]\s|^\d+[\.\)]\s|^[a-z][\.\)]\s/m.test(trimmed)) {
    return 'list';
  }

  return 'paragraph';
}
