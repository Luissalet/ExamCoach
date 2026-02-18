/**
 * pdfStorage.ts
 *
 * Gestiona PDFs subidos por el usuario:
 *   1. En desarrollo: intenta guardarlos en resources/[slug]/Temas/ via el
 *      endpoint /api/upload-pdf del Vite dev server (escribe al disco real).
 *   2. Siempre guarda también en IndexedDB como fallback offline.
 */

import { v4 as uuidv4 } from 'uuid';
import { db } from './db';
import { slugify } from '@/domain/normalize';
import { invalidateExtraInfoCache } from './resourceLoader';

// ─── IndexedDB ────────────────────────────────────────────────────────────────

/**
 * Guarda un PDF en IndexedDB para una asignatura.
 * Si ya existía un PDF con ese nombre, lo sobreescribe.
 */
export async function savePdfBlob(
  subjectId: string,
  filename: string,
  blob: Blob
): Promise<void> {
  const existing = await db.pdfResources
    .where('subjectId')
    .equals(subjectId)
    .filter((r) => r.filename === filename)
    .first();

  if (existing) {
    await db.pdfResources.update(existing.id, { blob, createdAt: new Date().toISOString() });
  } else {
    await db.pdfResources.add({
      id: uuidv4(),
      subjectId,
      filename,
      mime: 'application/pdf',
      blob,
      createdAt: new Date().toISOString(),
    });
  }
}

/**
 * Devuelve una blob URL para un PDF guardado en IndexedDB.
 * Devuelve null si no existe.
 * ⚠️ El caller debe revocar la URL con URL.revokeObjectURL() cuando ya no la necesite.
 */
export async function getPdfBlobUrl(
  subjectId: string,
  filename: string
): Promise<string | null> {
  const record = await db.pdfResources
    .where('subjectId')
    .equals(subjectId)
    .filter((r) => r.filename === filename)
    .first();

  if (!record) return null;
  return URL.createObjectURL(record.blob);
}

/**
 * Lista los nombres de archivo de PDFs guardados en IndexedDB para una asignatura.
 */
export async function listStoredPdfs(subjectId: string): Promise<string[]> {
  const records = await db.pdfResources
    .where('subjectId')
    .equals(subjectId)
    .toArray();
  return records.map((r) => r.filename);
}

/**
 * Elimina un PDF guardado en IndexedDB.
 */
export async function deleteStoredPdf(subjectId: string, filename: string): Promise<void> {
  const record = await db.pdfResources
    .where('subjectId')
    .equals(subjectId)
    .filter((r) => r.filename === filename)
    .first();
  if (record) await db.pdfResources.delete(record.id);
}

// ─── Dev server upload ────────────────────────────────────────────────────────

/**
 * Intenta subir el PDF al servidor de desarrollo Vite para guardarlo en
 * resources/[slug]/Temas/ y actualizar el index.json.
 *
 * Solo funciona con `npm run dev`. En producción devuelve false silenciosamente.
 * Invalida la caché de resourceLoader para que loadPdfList refleje el nuevo archivo.
 *
 * @returns true si el servidor lo aceptó, false si no está disponible.
 */
export async function savePdfToServer(
  subjectName: string,
  filename: string,
  file: File
): Promise<boolean> {
  try {
    // Convertir a base64
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // result es "data:application/pdf;base64,XXXX"
        resolve(result.split(',')[1]);
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });

    const slug = slugify(subjectName);

    const res = await fetch('/api/upload-pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug, filename, data: base64 }),
    });

    if (res.ok) {
      // Invalidar caché para que el próximo loadPdfList lea el index.json actualizado
      invalidateExtraInfoCache(subjectName);
      console.log(`[pdfStorage] ✅ PDF guardado en resources/${slug}/Temas/${filename}`);
      return true;
    }

    const err = await res.json().catch(() => ({}));
    console.warn('[pdfStorage] El servidor rechazó el PDF:', err);
    return false;
  } catch (e) {
    // En producción o si el endpoint no existe, falla silenciosamente
    console.info('[pdfStorage] Endpoint /api/upload-pdf no disponible (¿producción?). Solo IndexedDB.');
    return false;
  }
}