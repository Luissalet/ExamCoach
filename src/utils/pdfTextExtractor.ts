/**
 * pdfTextExtractor.ts
 *
 * Extracción inteligente de texto de PDFs respetando layout:
 *   - Detecta columnas
 *   - Elimina headers/footers/números de página
 *   - Agrupa en párrafos con orden de lectura correcto
 *   - Detecta bloques de fórmulas/símbolos matemáticos
 *   - Detecta tablas y las formatea para lectura TTS
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
  type: 'paragraph' | 'heading' | 'math' | 'list' | 'table';
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

// ─── Table detection constants ──────────────────────────────────────────────
const TABLE_CELL_MARGIN = 5;  // px de margen para asignar items a celdas

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
    // Headings y tablas siempre van solos: flush accumulator + push
    if (block.type === 'heading' || block.type === 'table') {
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

  // ── Step 2: Detect tables ───────────────────────────────────────────────
  //    Intento 1: Buscar grid en el operator list (bordes/rectángulos del PDF)
  //    Intento 2: Si no encuentra o no captura items, fallback por gaps de texto
  const structGrids = await detectTableGridFromStructure(page, pageHeight);
  let { tableBlocks, remainingItems } = assignItemsToTableGrid(
    items, structGrids, pageHeight, pageNum - 1,
  );

  // Si el operator list no encontró tablas, intentar por texto
  if (tableBlocks.length === 0) {
    const textGrids = detectTableFromTextGaps(items, pageHeight);
    if (textGrids.length > 0) {
      ({ tableBlocks, remainingItems } = assignItemsToTableGrid(
        items, textGrids, pageHeight, pageNum - 1,
      ));
    }
  }

  // ── Step 3: Group remaining items into lines ──────────────────────────────
  const lines = groupIntoLines(remainingItems, pageHeight);

  // ── Step 4: Detect columns ────────────────────────────────────────────────
  const columns = detectColumns(lines, pageWidth);

  // ── Step 5: Build text with correct reading order ─────────────────────────
  let orderedLines: LineGroup[];
  if (columns) {
    orderedLines = [...columns.left, ...columns.right];
  } else {
    orderedLines = lines;
  }

  // ── Step 6: Group into paragraphs ─────────────────────────────────────────
  const paragraphBlocks = groupIntoParagraphs(orderedLines, pageHeight, pageNum - 1);

  // Merge all blocks sorted by Y position
  const allBlocks = [...tableBlocks, ...paragraphBlocks].sort(
    (a, b) => a.yPosition - b.yPosition,
  );

  return allBlocks;
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

// ─── Table detection via PDF structure (borders/lines/rectangles) ────────────

interface GridLine {
  pos: number;    // coordenada fija (Y para horizontales, X para verticales) — top-down
  start: number;  // inicio de la coordenada variable
  end: number;    // fin de la coordenada variable
}

interface TableGrid {
  rowYs: number[];  // posiciones Y de separadores de fila (top-down, ordenadas)
  colXs: number[];  // posiciones X de separadores de columna (ordenadas)
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
}

// Códigos de sub-operaciones dentro de constructPath en PDF.js
const PATH_OP_MOVE_TO = 13;
const PATH_OP_LINE_TO = 14;
const PATH_OP_CURVE_TO = 15;
const PATH_OP_CURVE_TO2 = 16;
const PATH_OP_CURVE_TO3 = 17;
const PATH_OP_CLOSE_PATH = 18;
const PATH_OP_RECTANGLE = 19;

// ─── CTM helpers ────────────────────────────────────────────────────────────

/** Multiplica dos matrices afines 2D [a,b,c,d,e,f] → A × B */
function mulMat(a: number[], b: number[]): number[] {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}

/** Aplica una CTM a un punto (x,y) */
function ptTransform(ctm: number[], x: number, y: number): [number, number] {
  return [
    ctm[0] * x + ctm[2] * y + ctm[4],
    ctm[1] * x + ctm[3] * y + ctm[5],
  ];
}

// ─── Grid detection (operator list) ─────────────────────────────────────────

/**
 * Detecta la estructura de tabla a partir de los rectángulos y líneas
 * dibujados en la página PDF (operator list). Trackea la CTM (Current
 * Transform Matrix) para transformar coordenadas correctamente.
 */
async function detectTableGridFromStructure(
  page: pdfjsLib.PDFPageProxy,
  pageHeight: number,
): Promise<TableGrid[]> {
  const opList = await page.getOperatorList();
  const hLines: GridLine[] = [];
  const vLines: GridLine[] = [];

  // Track Current Transform Matrix (CTM) para transformar coordenadas
  let ctm: number[] = [1, 0, 0, 1, 0, 0]; // identidad
  const ctmStack: number[][] = [];

  for (let i = 0; i < opList.fnArray.length; i++) {
    const fn = opList.fnArray[i];
    const args = opList.argsArray[i];

    // ── CTM tracking ──
    if (fn === pdfjsLib.OPS.save) {
      ctmStack.push([...ctm]);
      continue;
    }
    if (fn === pdfjsLib.OPS.restore) {
      ctm = ctmStack.pop() ?? [1, 0, 0, 1, 0, 0];
      continue;
    }
    if (fn === pdfjsLib.OPS.transform) {
      const m = args as number[];
      ctm = mulMat(ctm, m);
      continue;
    }

    // ── Path parsing ──
    if (fn !== pdfjsLib.OPS.constructPath) continue;

    const subOps = args[0] as number[];
    const coords = args[1] as number[];

    let ci = 0;
    let moveX = 0, moveY = 0;

    for (const op of subOps) {
      switch (op) {
        case PATH_OP_MOVE_TO: {
          const [tx, ty] = ptTransform(ctm, coords[ci++], coords[ci++]);
          moveX = tx;
          moveY = ty;
          break;
        }

        case PATH_OP_LINE_TO: {
          const [lx, ly] = ptTransform(ctm, coords[ci++], coords[ci++]);

          // Línea horizontal: mismo Y, X diferente
          if (Math.abs(ly - moveY) < 1.5 && Math.abs(lx - moveX) > 20) {
            hLines.push({
              pos: pageHeight - moveY,
              start: Math.min(moveX, lx),
              end: Math.max(moveX, lx),
            });
          }
          // Línea vertical: mismo X, Y diferente
          else if (Math.abs(lx - moveX) < 1.5 && Math.abs(ly - moveY) > 5) {
            vLines.push({
              pos: moveX,
              start: pageHeight - Math.max(moveY, ly),
              end: pageHeight - Math.min(moveY, ly),
            });
          }

          moveX = lx;
          moveY = ly;
          break;
        }

        case PATH_OP_RECTANGLE: {
          const rx = coords[ci++];
          const ry = coords[ci++];
          const rw = coords[ci++];
          const rh = coords[ci++];

          // Transformar esquinas opuestas con la CTM
          const [x1, y1] = ptTransform(ctm, rx, ry);
          const [x2, y2] = ptTransform(ctm, rx + rw, ry + rh);

          const left = Math.min(x1, x2);
          const right = Math.max(x1, x2);
          const bottom = Math.min(y1, y2);
          const top = Math.max(y1, y2);

          const w = right - left;
          const h = top - bottom;

          // Rectángulo delgado horizontal → línea horizontal
          if (h < 3 && w > 20) {
            hLines.push({
              pos: pageHeight - top,
              start: left,
              end: right,
            });
          }
          // Rectángulo delgado vertical → línea vertical
          else if (w < 3 && h > 5) {
            vLines.push({
              pos: left,
              start: pageHeight - top,
              end: pageHeight - bottom,
            });
          }
          break;
        }

        case PATH_OP_CURVE_TO: ci += 6; break;
        case PATH_OP_CURVE_TO2: ci += 4; break;
        case PATH_OP_CURVE_TO3: ci += 4; break;
        case PATH_OP_CLOSE_PATH: break;
        default: break;
      }
    }
  }

  // Necesitamos al menos 3 líneas H (top + separador + bottom)
  // y al menos 3 V (left + separador + right)
  if (hLines.length < 3 || vLines.length < 3) return [];

  // Clusterizar líneas por posición
  const hClusters = clusterLinePositions(hLines, 5);
  const vClusters = clusterLinePositions(vLines, 5);

  if (hClusters.length < 3 || vClusters.length < 3) return [];

  hClusters.sort((a, b) => a - b);
  vClusters.sort((a, b) => a - b);

  return [{
    rowYs: hClusters,
    colXs: vClusters,
    bounds: {
      minX: vClusters[0],
      maxX: vClusters[vClusters.length - 1],
      minY: hClusters[0],
      maxY: hClusters[hClusters.length - 1],
    },
  }];
}

/**
 * Clusteriza valores numéricos (posiciones de líneas) con tolerancia.
 * Retorna el promedio de cada cluster.
 */
function clusterLinePositions(lines: GridLine[], tolerance: number): number[] {
  const values = lines.map((l) => l.pos).sort((a, b) => a - b);
  if (values.length === 0) return [];

  const clusters: number[][] = [[values[0]]];

  for (let i = 1; i < values.length; i++) {
    const lastCluster = clusters[clusters.length - 1];
    const lastVal = lastCluster[lastCluster.length - 1];
    if (values[i] - lastVal <= tolerance) {
      lastCluster.push(values[i]);
    } else {
      clusters.push([values[i]]);
    }
  }

  return clusters.map((c) => c.reduce((a, b) => a + b, 0) / c.length);
}

// ─── Fallback: text-based table detection ───────────────────────────────────

/**
 * Detección de tablas por análisis de gaps en el texto. Se usa cuando
 * el operator list no encuentra bordes (ej: tablas sin bordes visibles,
 * o PDFs donde las coordenadas no coinciden).
 *
 * Busca líneas consecutivas donde los items de texto tengan gaps
 * significativos en posiciones X consistentes (= columnas de tabla).
 */
function detectTableFromTextGaps(
  items: TextItem[],
  pageHeight: number,
): TableGrid[] {
  // Agrupar items en líneas por Y
  const lines = groupIntoLines(items, pageHeight);
  if (lines.length < 3) return [];

  // Para cada línea, encontrar las posiciones X donde hay gaps grandes
  const GAP_THRESHOLD = 25; // px mínimo entre columnas
  const X_ALIGN_TOL = 15;   // tolerancia de alineación de columna

  interface LineCols { lineIdx: number; colXs: number[]; }

  const lineColInfo: LineCols[] = lines.map((line, idx) => {
    const colXs: number[] = [line.items[0]?.transform[4] ?? 0];
    for (let i = 1; i < line.items.length; i++) {
      const prevEnd = line.items[i - 1].transform[4] + line.items[i - 1].width;
      const curStart = line.items[i].transform[4];
      if (curStart - prevEnd > GAP_THRESHOLD) {
        colXs.push(curStart);
      }
    }
    return { lineIdx: idx, colXs };
  });

  // Encontrar regiones consecutivas con ≥2 columnas alineadas
  const regions: { start: number; end: number }[] = [];
  let rStart = -1;

  for (let i = 0; i < lineColInfo.length; i++) {
    const info = lineColInfo[i];
    if (info.colXs.length < 2) {
      if (rStart >= 0 && i - rStart >= 3) {
        regions.push({ start: rStart, end: i - 1 });
      }
      rStart = -1;
      continue;
    }

    if (rStart < 0) {
      rStart = i;
      continue;
    }

    // Verificar alineación con la línea anterior
    const prev = lineColInfo[i - 1];
    if (prev.colXs.length < 2) {
      if (i - rStart >= 3) regions.push({ start: rStart, end: i - 1 });
      rStart = i;
      continue;
    }

    const minCols = Math.min(prev.colXs.length, info.colXs.length);
    let aligned = 0;
    for (let c = 0; c < minCols; c++) {
      if (Math.abs(prev.colXs[c] - info.colXs[c]) <= X_ALIGN_TOL) aligned++;
    }
    if (aligned < 2) {
      if (i - rStart >= 3) regions.push({ start: rStart, end: i - 1 });
      rStart = i;
    }
  }
  if (rStart >= 0 && lineColInfo.length - rStart >= 3) {
    regions.push({ start: rStart, end: lineColInfo.length - 1 });
  }

  if (regions.length === 0) return [];

  // Convertir regiones a TableGrid
  const grids: TableGrid[] = [];

  for (const region of regions) {
    // Determinar columnas promedio de la región
    const allColXs: number[][] = [];
    let maxCols = 0;
    for (let i = region.start; i <= region.end; i++) {
      const cols = lineColInfo[i].colXs;
      if (cols.length > maxCols) maxCols = cols.length;
      allColXs.push(cols);
    }

    // Promediar cada posición de columna
    const avgColXs: number[] = [];
    for (let c = 0; c < maxCols; c++) {
      const vals = allColXs.filter((xs) => xs.length > c).map((xs) => xs[c]);
      if (vals.length > 0) {
        avgColXs.push(vals.reduce((a, b) => a + b, 0) / vals.length);
      }
    }

    // Agregar un borde derecho virtual (max X de items + margen)
    let maxX = 0;
    for (let i = region.start; i <= region.end; i++) {
      const line = lines[i];
      for (const item of line.items) {
        maxX = Math.max(maxX, item.transform[4] + item.width);
      }
    }
    avgColXs.push(maxX + 10);

    // Row separators = Y de cada línea + borde superior e inferior
    const rowYs: number[] = [];
    // Borde superior (un poco arriba de la primera línea)
    const firstLineH = lines[region.start].items[0]?.height ?? 12;
    rowYs.push(lines[region.start].y - firstLineH);
    // Cada separador entre filas
    for (let i = region.start; i <= region.end; i++) {
      if (i < region.end) {
        const midY = (lines[i].y + lines[i + 1].y) / 2;
        rowYs.push(midY);
      }
    }
    // Borde inferior
    const lastLineH = lines[region.end].items[0]?.height ?? 12;
    rowYs.push(lines[region.end].y + lastLineH);

    if (avgColXs.length >= 2 && rowYs.length >= 3) {
      grids.push({
        rowYs,
        colXs: avgColXs,
        bounds: {
          minX: avgColXs[0] - 5,
          maxX: avgColXs[avgColXs.length - 1],
          minY: rowYs[0],
          maxY: rowYs[rowYs.length - 1],
        },
      });
    }
  }

  return grids;
}

// ─── Grid → cells assignment ────────────────────────────────────────────────

/**
 * Asigna items de texto a las celdas del grid de tabla detectado.
 * Retorna bloques de tabla formateados para TTS y los items restantes.
 *
 * Valida que el grid efectivamente contenga items de texto antes de aceptarlo.
 * Si el grid del operator list no captura items, intenta fallback por texto.
 */
function assignItemsToTableGrid(
  items: TextItem[],
  grids: TableGrid[],
  pageHeight: number,
  pageIndex: number,
): { tableBlocks: TextBlock[]; remainingItems: TextItem[] } {
  if (grids.length === 0) {
    return { tableBlocks: [], remainingItems: items };
  }

  const tableBlocks: TextBlock[] = [];
  let remainingItems = [...items];

  for (const grid of grids) {
    const result = buildTableFromGrid(remainingItems, grid, pageHeight, pageIndex);
    if (result) {
      tableBlocks.push(result.block);
      remainingItems = result.remainingItems;
    }
  }

  return { tableBlocks, remainingItems };
}

/**
 * Construye un bloque de tabla a partir de un grid y items de texto.
 * Retorna null si el grid no contiene suficientes items.
 */
function buildTableFromGrid(
  items: TextItem[],
  grid: TableGrid,
  pageHeight: number,
  pageIndex: number,
): { block: TextBlock; remainingItems: TextItem[] } | null {
  const { rowYs, colXs, bounds } = grid;
  const M = TABLE_CELL_MARGIN;

  // Separar items dentro vs fuera de la tabla
  const tableItems: TextItem[] = [];
  const outsideItems: TextItem[] = [];

  for (const item of items) {
    const itemY = pageHeight - item.transform[5];
    const itemX = item.transform[4];

    if (
      itemX >= bounds.minX - M &&
      itemX <= bounds.maxX + M &&
      itemY >= bounds.minY - M &&
      itemY <= bounds.maxY + M
    ) {
      tableItems.push(item);
    } else {
      outsideItems.push(item);
    }
  }

  // Si muy pocos items caen dentro del grid, es un falso positivo
  if (tableItems.length < 3) return null;

  // Número de filas y columnas
  const numRows = rowYs.length - 1;
  const numCols = colXs.length - 1;
  if (numRows < 1 || numCols < 1) return null;

  // Recopilar items por celda
  const cellItems: TextItem[][][] = Array.from({ length: numRows }, () =>
    Array.from({ length: numCols }, () => [] as TextItem[]),
  );

  for (const item of tableItems) {
    const itemY = pageHeight - item.transform[5];
    const itemX = item.transform[4];

    // Encontrar fila
    let row = -1;
    for (let r = 0; r < numRows; r++) {
      if (itemY >= rowYs[r] - M && itemY < rowYs[r + 1] + M) {
        row = r;
        break;
      }
    }

    // Encontrar columna
    let col = -1;
    for (let c = 0; c < numCols; c++) {
      if (itemX >= colXs[c] - M && (c === numCols - 1 || itemX < colXs[c + 1] - M)) {
        col = c;
        break;
      }
    }

    if (row >= 0 && col >= 0) {
      cellItems[row][col].push(item);
    }
  }

  // Ordenar items dentro de cada celda (arriba→abajo, izquierda→derecha)
  // y concatenar texto
  const cells: string[][] = cellItems.map((rowItems) =>
    rowItems.map((citems) => {
      citems.sort((a, b) => {
        const ya = pageHeight - a.transform[5];
        const yb = pageHeight - b.transform[5];
        if (Math.abs(ya - yb) > Y_TOLERANCE) return ya - yb;
        return a.transform[4] - b.transform[4];
      });
      return citems.map((it) => it.str).join(' ').trim();
    }),
  );

  // Validar que al menos la mitad de las filas tienen contenido
  const filledRows = cells.filter((row) => row.some((c) => c.length > 0)).length;
  if (filledRows < 2) return null;

  // Detectar si la primera fila es cabecera o datos
  const firstRowText = cells[0].map((c) => c.trim()).filter(Boolean);
  const hasHeader = firstRowText.length >= 2 && firstRowText.every((t) => t.length < 60);

  // Formatear para TTS
  const parts: string[] = [];

  if (hasHeader) {
    const headers = firstRowText;
    parts.push(`Tabla. Columnas: ${headers.join(', ')}.`);

    for (let r = 1; r < numRows; r++) {
      const rowCells = cells[r].map((c) => c.trim());
      if (rowCells.every((c) => !c)) continue;

      if (rowCells.length === cells[0].length && cells[0].length >= 2) {
        const cellParts = rowCells
          .map((cell, idx) => {
            if (!cell) return '';
            if (idx === 0) return cell;
            return `${headers[idx]}: ${cell}`;
          })
          .filter(Boolean);
        parts.push(cellParts.join('. ') + '.');
      } else {
        parts.push(rowCells.filter(Boolean).join('. ') + '.');
      }
    }
  } else {
    // Tabla sin cabecera (continuación de página anterior)
    parts.push('Tabla, continuación.');
    for (let r = 0; r < numRows; r++) {
      const rowCells = cells[r].map((c) => c.trim());
      if (rowCells.every((c) => !c)) continue;
      parts.push(rowCells.filter(Boolean).join('. ') + '.');
    }
  }

  return {
    block: {
      text: parts.join('\n'),
      pageIndex,
      type: 'table' as const,
      yPosition: bounds.minY / pageHeight,
    },
    remainingItems: outsideItems,
  };
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
