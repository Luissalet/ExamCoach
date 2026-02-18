/**
 * resourceLoader.ts
 *
 * Carga assets estáticos del directorio resources/ del repo:
 *   resources/[slug-asignatura]/extra_info.json   → SubjectExtraInfo
 *   resources/[slug-asignatura]/Temas/index.json  → string[] (nombres de PDFs)
 *   resources/[slug-asignatura]/Temas/[file].pdf  → URL directa
 *
 * El slug se genera igual que en normalize.ts (slugify) para que el directorio
 * coincida con el nombre de asignatura usado en contribution packs.
 */

import type { SubjectExtraInfo } from '@/domain/models';

/** Cache en memoria para evitar fetches repetidos en la misma sesión. */
const extraInfoCache = new Map<string, SubjectExtraInfo | null>();
const pdfListCache = new Map<string, string[]>();

/**
 * Convierte un nombre de asignatura en slug de directorio.
 * Debe coincidir exactamente con la función slugify de normalize.ts.
 */
function toSlug(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

/**
 * Carga el extra_info.json de una asignatura.
 * Devuelve null si no existe o hay error.
 */
export async function loadSubjectExtraInfo(subjectName: string): Promise<SubjectExtraInfo | null> {
  const slug = toSlug(subjectName);
  if (extraInfoCache.has(slug)) return extraInfoCache.get(slug)!;

  try {
    const res = await fetch(`./resources/${slug}/extra_info.json`, { cache: 'no-cache' });
    if (!res.ok) {
      extraInfoCache.set(slug, null);
      return null;
    }
    const data: SubjectExtraInfo = await res.json();
    extraInfoCache.set(slug, data);
    return data;
  } catch {
    extraInfoCache.set(slug, null);
    return null;
  }
}

/**
 * Invalida la caché de una asignatura (útil tras modificar los ficheros).
 */
export function invalidateExtraInfoCache(subjectName: string): void {
  const slug = toSlug(subjectName);
  extraInfoCache.delete(slug);
  pdfListCache.delete(slug);
}

/**
 * Carga la lista de PDFs disponibles para una asignatura.
 * Lee resources/[slug]/Temas/index.json → string[]
 *
 * Si no existe el index.json, intenta leer la lista desde extra_info.pdfs.
 * Devuelve [] si no hay PDFs o hay error.
 */
export async function loadPdfList(subjectName: string): Promise<string[]> {
  const slug = toSlug(subjectName);
  if (pdfListCache.has(slug)) return pdfListCache.get(slug)!;

  // Primero intenta index.json dedicado
  try {
    const res = await fetch(`./resources/${slug}/Temas/index.json`, { cache: 'no-cache' });
    if (res.ok) {
      const list: string[] = await res.json();
      pdfListCache.set(slug, list);
      return list;
    }
  } catch {
    // fall through
  }

  // Fallback: lista en extra_info.pdfs
  const info = await loadSubjectExtraInfo(subjectName);
  const list = info?.pdfs ?? [];
  pdfListCache.set(slug, list);
  return list;
}

/**
 * Devuelve la URL de un PDF (relativa a la raíz del sitio).
 */
export function getPdfUrl(subjectName: string, filename: string): string {
  const slug = toSlug(subjectName);
  return `./resources/${slug}/Temas/${encodeURIComponent(filename)}`;
}
