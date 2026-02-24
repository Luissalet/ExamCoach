/**
 * resourceImporter.ts
 *
 * Importa un ZIP de recursos y los guarda en IndexedDB (pdfResources).
 * También genera los index.json en memoria para que la pestaña "Otros recursos"
 * pueda listar los ficheros importados.
 *
 * Estructura esperada del ZIP:
 *   resources/
 *     [slug-asignatura]/
 *       Temas/
 *         index.json
 *         *.pdf
 *       Examenes/
 *         *.pdf *.docx *.xlsx *.ipynb
 *       Practica/
 *         [slug-actividad]/
 *           *.pdf *.docx *.xlsx *.ipynb
 *       Resumenes/
 *         [autor]/
 *           completa/
 *             *.pdf
 *           [tema-slug]/
 *             *.pdf
 */

import JSZip from 'jszip';
import { db } from './db';
import { v4 as uuidv4 } from 'uuid';
import { slugify } from '@/domain/normalize';

export interface ImportResourcesResult {
  totalFiles: number;
  subjects: string[];
  categories: Record<string, number>; // e.g. { Temas: 5, Examenes: 3, ... }
  errors: string[];
  missingSubjects?: string[];
  quotaWarning?: boolean;
}

export type ImportProgressEvent = {
  phase: 'reading' | 'validating' | 'processing' | 'complete';
  filesProcessed: number;
  totalFiles: number;
  currentFile?: string;
};

export type ProgressCallback = (event: ImportProgressEvent) => void;

export async function importResourceZip(
  file: File,
  onProgress?: ProgressCallback,
): Promise<ImportResourcesResult> {
  const result: ImportResourcesResult = {
    totalFiles: 0,
    subjects: [],
    categories: {},
    errors: [],
  };

  try {
    // ── Phase 1: Read ZIP ──────────────────────────────────────────────────
    onProgress?.({ phase: 'reading', filesProcessed: 0, totalFiles: 0 });

    const zip = await JSZip.loadAsync(file);
    const entries = Object.entries(zip.files);

    // Find the root — it might be resources/ or directly [slug]/
    const paths = entries
      .filter(([_, f]) => !f.dir)
      .map(([path]) => path);

    // Determine prefix (resources/ or empty)
    let prefix = '';
    if (paths.some((p) => p.startsWith('resources/'))) {
      prefix = 'resources/';
    }

    // Group files by subject slug
    const subjectFiles = new Map<string, { path: string; category: string; relativePath: string }[]>();

    for (const path of paths) {
      const relPath = prefix ? path.replace(prefix, '') : path;
      const parts = relPath.split('/');
      if (parts.length < 2) continue;

      const subjectSlug = parts[0];
      const category = parts[1];
      const restPath = parts.slice(2).join('/');

      if (!subjectFiles.has(subjectSlug)) {
        subjectFiles.set(subjectSlug, []);
      }
      subjectFiles.get(subjectSlug)!.push({
        path,
        category,
        relativePath: restPath,
      });
    }

    // ── Phase 2: Validate subjects ─────────────────────────────────────────
    onProgress?.({ phase: 'validating', filesProcessed: 0, totalFiles: 0 });

    const allSubjects = await db.subjects.toArray();
    const subjectMap = new Map(
      allSubjects.map((s) => [slugify(s.name), s]),
    );

    const zipSlugs = Array.from(subjectFiles.keys());
    const missingSlugs = zipSlugs.filter((slug) => !subjectMap.has(slug));

    if (missingSlugs.length > 0) {
      result.missingSubjects = missingSlugs;
      result.errors.push(
        `No se encontraron ${missingSlugs.length} asignatura(s) en tu banco: ${missingSlugs.join(', ')}. ` +
        `Importa primero el banco de preguntas que contenga estas asignaturas.`,
      );
      return result;
    }

    // ── Phase 3: Count total processable files ─────────────────────────────
    let totalFiles = 0;
    for (const files of subjectFiles.values()) {
      for (const f of files) {
        const fname = f.path.split('/').pop() ?? '';
        if (fname !== 'index.json' && fname !== 'extra_info.json') {
          totalFiles++;
        }
      }
    }

    // ── Phase 4: Process files one by one ──────────────────────────────────
    let processed = 0;

    for (const [subjectSlug, files] of subjectFiles) {
      if (!result.subjects.includes(subjectSlug)) {
        result.subjects.push(subjectSlug);
      }

      const subject = subjectMap.get(subjectSlug)!;

      for (const fileEntry of files) {
        try {
          const zipFile = zip.file(fileEntry.path);
          if (!zipFile) continue;

          const filename = fileEntry.path.split('/').pop() ?? '';

          // Skip metadata files
          if (filename === 'index.json' || filename === 'extra_info.json') continue;

          const blob = await zipFile.async('blob');
          const mime = guessMime(filename);

          // Para Temas, guardar solo el nombre del archivo (sin prefijo de categoría)
          // porque getPdfBlobUrl() busca por filename sin prefijo (ej. "Tema_1.pdf").
          // Para el resto de categorías, mantener el prefijo (ej. "Examenes/file.pdf")
          // porque getResourceBlobUrl() usa la ruta completa con categoría.
          const storageName = fileEntry.category === 'Temas'
            ? (fileEntry.relativePath || filename)
            : fileEntry.relativePath
              ? `${fileEntry.category}/${fileEntry.relativePath}`
              : `${fileEntry.category}/${filename}`;

          // Check for existing (update instead of duplicate)
          const existing = await db.pdfResources
            .where('subjectId')
            .equals(subject.id)
            .filter((r) => r.filename === storageName)
            .first();

          if (existing) {
            await db.pdfResources.update(existing.id, {
              blob,
              createdAt: new Date().toISOString(),
            });
          } else {
            await db.pdfResources.add({
              id: uuidv4(),
              subjectId: subject.id,
              filename: storageName,
              mime,
              blob,
              createdAt: new Date().toISOString(),
            });
          }

          result.totalFiles++;
          result.categories[fileEntry.category] =
            (result.categories[fileEntry.category] ?? 0) + 1;

          processed++;
          onProgress?.({
            phase: 'processing',
            filesProcessed: processed,
            totalFiles,
            currentFile: filename,
          });

          // Yield to UI thread every 5 files to keep progress bar responsive
          if (processed % 5 === 0) {
            await new Promise((r) => setTimeout(r, 0));
          }
        } catch (err) {
          if (isQuotaExceededError(err)) {
            result.quotaWarning = true;
            result.errors.push(
              `Almacenamiento lleno. Se importaron ${result.totalFiles} de ${totalFiles} archivos. ` +
              `Intenta liberar espacio o no usar modo incógnito.`,
            );
            onProgress?.({ phase: 'complete', filesProcessed: processed, totalFiles });
            return result;
          }
          result.errors.push(`Error procesando ${fileEntry.path}: ${String(err)}`);
          processed++;
        }
      }
    }

    onProgress?.({ phase: 'complete', filesProcessed: processed, totalFiles });
  } catch (err) {
    result.errors.push(`Error leyendo ZIP: ${String(err)}`);
  }

  return result;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function guessMime(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const mimes: Record<string, string> = {
    pdf: 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ipynb: 'application/x-ipynb+json',
    py: 'text/x-python',
    txt: 'text/plain',
    md: 'text/markdown',
    json: 'application/json',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
  };
  return mimes[ext] ?? 'application/octet-stream';
}

function isQuotaExceededError(err: unknown): boolean {
  if (err instanceof DOMException) {
    return (
      err.code === 22 ||
      err.name === 'QuotaExceededError' ||
      err.name === 'NS_ERROR_DOM_INDEXEDDB_QUOTA_ERR'
    );
  }
  return false;
}
