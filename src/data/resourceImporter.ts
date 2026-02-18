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
}

// Store imported resource files in IndexedDB alongside the existing pdfResources
// We use a separate store for non-PDF resources or extend pdfResources

export async function importResourceZip(file: File): Promise<ImportResourcesResult> {
  const result: ImportResourcesResult = {
    totalFiles: 0,
    subjects: [],
    categories: {},
    errors: [],
  };

  try {
    const zip = await JSZip.loadAsync(file);
    const entries = Object.entries(zip.files);

    // Find the root — it might be resources/ or directly [slug]/
    // Normalize paths
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
      if (parts.length < 2) continue; // Need at least [slug]/[file]

      const subjectSlug = parts[0];
      const category = parts[1]; // Temas, Examenes, Practica, Resumenes
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

    // Process each subject
    for (const [subjectSlug, files] of subjectFiles) {
      if (!result.subjects.includes(subjectSlug)) {
        result.subjects.push(subjectSlug);
      }

      // Find the matching subject in the DB
      const allSubjects = await db.subjects.toArray();
      const subject = allSubjects.find((s) => slugify(s.name) === subjectSlug);

      if (!subject) {
        result.errors.push(`No se encontró la asignatura para slug: "${subjectSlug}". Asegúrate de que existe en tu banco.`);
        continue;
      }

      for (const fileEntry of files) {
        try {
          const zipFile = zip.file(fileEntry.path);
          if (!zipFile) continue;

          const blob = await zipFile.async('blob');
          const filename = fileEntry.path.split('/').pop() ?? '';

          // Skip index.json files (metadata, not resources)
          if (filename === 'index.json') continue;

          // Store in IndexedDB
          const mime = guessMime(filename);
          const existing = await db.pdfResources
            .where('subjectId')
            .equals(subject.id)
            .filter((r) => r.filename === `${fileEntry.category}/${fileEntry.relativePath || filename}`)
            .first();

          const storageName = fileEntry.relativePath
            ? `${fileEntry.category}/${fileEntry.relativePath}`
            : `${fileEntry.category}/${filename}`;

          if (existing) {
            await db.pdfResources.update(existing.id, { blob, createdAt: new Date().toISOString() });
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
          result.categories[fileEntry.category] = (result.categories[fileEntry.category] ?? 0) + 1;

          // For Temas PDFs, also try to write via dev server
          if (fileEntry.category === 'Temas' && mime === 'application/pdf') {
            try {
              const base64 = await blobToBase64(blob);
              await fetch('/api/upload-pdf', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  slug: subjectSlug,
                  filename,
                  data: base64,
                  topicTitle: '',
                }),
              });
            } catch {
              // Dev server not available, ignore
            }
          }

          // For non-Temas files, try to write via dev server
          if (fileEntry.category !== 'Temas') {
            try {
              const base64 = await blobToBase64(blob);
              await fetch('/api/upload-resource', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  slug: subjectSlug,
                  category: fileEntry.category,
                  path: fileEntry.relativePath || filename,
                  data: base64,
                  mime,
                }),
              });
            } catch {
              // Dev server not available, ignore
            }
          }
        } catch (err) {
          result.errors.push(`Error procesando ${fileEntry.path}: ${String(err)}`);
        }
      }
    }
  } catch (err) {
    result.errors.push(`Error leyendo ZIP: ${String(err)}`);
  }

  return result;
}

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

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
