/**
 * gistSync.ts
 *
 * Sincronización incremental entre dispositivos via GitHub Gist.
 *
 * Estrategia tipo "git":
 *  - Push: sube el estado completo de la DB al Gist.
 *  - Pull: descarga el Gist y hace MERGE inteligente:
 *    • Registros con mismo ID → gana el que tenga `updatedAt` más reciente.
 *    • Registros nuevos en remoto → se añaden.
 *    • Registros solo locales → se conservan (se subirán en el próximo push).
 *    • Imágenes: solo descarga las que no existen localmente.
 *  - Antes de descargar, comprueba si el Gist cambió desde el último sync (como git fetch).
 *
 * Datos que NO se sincronizan:
 *  - PDFs (demasiado pesados — se re-suben en cada dispositivo)
 *  - API keys, tokens (seguridad)
 *  - fsaHandles (device-specific)
 */

import { db, getSettings, saveSettings } from './db';
import { PDFDocument } from 'pdf-lib';
import { listStoredPdfs, getPdfBlobUrl } from './pdfStorage';
import { savePdfBlob } from './pdfStorage';
import type {
  Subject,
  Topic,
  Question,
  PracticeSession,
  KeyConcept,
  Exam,
  Deliverable,
  SubjectGradingConfig,
  PdfAnchor,
  AppSettings,
  QuestionImageRecord,
} from '@/domain/models';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface FullBackup {
  version: 2;
  kind: 'full-backup';
  exportedAt: string;
  deviceId: string;
  subjects: Subject[];
  topics: Topic[];
  questions: Question[];
  sessions: PracticeSession[];
  pdfAnchors: PdfAnchor[];
  keyConcepts: KeyConcept[];
  exams: Exam[];
  deliverables: Deliverable[];
  gradingConfigs: SubjectGradingConfig[];
  syncedSettings: SyncedSettings;
  /** { filename: { base64, mimeType } } — solo las imágenes inline de preguntas */
  questionImages: Record<string, { base64: string; mimeType: string }>;
  /**
   * Manifiesto de PDFs sincronizados.
   * Los PDFs van como archivos separados en el Gist.
   * Si un PDF es grande (> PDF_CHUNK_LIMIT), se divide en páginas
   * usando pdf-lib y se almacena como partes numeradas.
   */
  pdfManifest?: PdfManifestEntry[];
  /**
   * Manifiesto de WAVs pre-generados.
   * No se sincronizan los WAVs (demasiado pesados),
   * solo el manifiesto para que el otro dispositivo los regenere.
   */
  pregenManifest?: PregenManifestEntry[];
}

/** Entrada en el manifiesto de WAVs pre-generados */
export interface PregenManifestEntry {
  topicId: string;
  pdfFilename: string;
  cacheKey: string;
  voiceId: string;
  blockCount: number;
  generatedAt: string;
}

/** Entrada en el manifiesto de PDFs — describe cómo reconstruir el PDF */
interface PdfManifestEntry {
  subjectId: string;
  filename: string;
  /** Clave del archivo en el Gist (sin extensión .b64) */
  gistKey: string;
  /** Si es > 1, el PDF está dividido en partes: gistKey-001, gistKey-002, etc. */
  parts: number;
  /** Tamaño original en bytes (para verificación) */
  originalSize: number;
}

/** PDFs menores a 5 MB van enteros; mayores se dividen en páginas */
const PDF_CHUNK_LIMIT = 5 * 1024 * 1024; // 5 MB
/** Máximo de páginas por parte al dividir un PDF grande */
const PAGES_PER_CHUNK = 10;

interface SyncedSettings {
  alias: string;
  importedPackIds: string[];
  importHistory?: AppSettings['importHistory'];
  globalBankSyncedAt?: string;
  studyStreak?: number;
  lastStudyDate?: string;
  subjectGoals?: Record<string, number>;
}

export interface SyncResult {
  success: boolean;
  direction: 'push' | 'pull' | 'skip';
  error?: string;
  added?: number;
  updated?: number;
  skipped?: number;
}

// ─── Device ID ──────────────────────────────────────────────────────────────

function getDeviceId(): string {
  const key = 'examcoach-device-id';
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}

// ─── Export full backup ──────────────────────────────────────────────────────

export async function exportFullBackup(): Promise<FullBackup> {
  const [
    subjects, topics, questions, sessions, pdfAnchors,
    keyConcepts, exams, deliverables, gradingConfigs,
    questionImageRecords, settings,
  ] = await Promise.all([
    db.subjects.toArray(),
    db.topics.toArray(),
    db.questions.toArray(),
    db.sessions.toArray(),
    db.pdfAnchors.toArray(),
    db.keyConcepts.toArray(),
    db.exams.toArray(),
    db.deliverables.toArray(),
    db.gradingConfigs.toArray(),
    db.questionImages.toArray(),
    getSettings(),
  ]);

  const questionImages: Record<string, { base64: string; mimeType: string }> = {};
  for (const record of questionImageRecords) {
    try {
      const base64 = await blobToBase64(record.blob);
      questionImages[record.filename] = { base64, mimeType: record.mimeType };
    } catch { /* skip corrupted */ }
  }

  return {
    version: 2,
    kind: 'full-backup',
    exportedAt: new Date().toISOString(),
    deviceId: getDeviceId(),
    subjects, topics, questions, sessions, pdfAnchors,
    keyConcepts, exams, deliverables, gradingConfigs,
    syncedSettings: {
      alias: settings.alias,
      importedPackIds: settings.importedPackIds,
      importHistory: settings.importHistory,
      globalBankSyncedAt: settings.globalBankSyncedAt,
      studyStreak: settings.studyStreak,
      lastStudyDate: settings.lastStudyDate,
      subjectGoals: settings.subjectGoals,
    },
    questionImages,
    pregenManifest: await buildPregenManifest(topics),
  };
}

// ─── PregenManifest helpers ──────────────────────────────────────────────────

async function buildPregenManifest(topics: Topic[]): Promise<PregenManifestEntry[]> {
  try {
    const { listWavCacheEntries } = await import('@/utils/backgroundSynthesis');
    const entries = await listWavCacheEntries();
    if (entries.length === 0) return [];

    // Build lookup: for each entry, try to match with a topic
    // Cache keys are hashes, but we store voiceId and blockCount in the entry
    const manifest: PregenManifestEntry[] = [];
    for (const { key, entry } of entries) {
      // We can't directly map cache key → topic without the texts hash,
      // but we store all entries so the other device can check which ones it's missing
      manifest.push({
        topicId: '', // will be empty if we can't determine — other device uses cacheKey to match
        pdfFilename: '',
        cacheKey: key,
        voiceId: entry.voiceId,
        blockCount: entry.blockCount,
        generatedAt: new Date(entry.createdAt).toISOString(),
      });
    }
    return manifest;
  } catch {
    return [];
  }
}

// ─── Merge (pull inteligente) ────────────────────────────────────────────────

/**
 * Merge tipo git: para cada registro, gana el más reciente.
 * Registros nuevos se añaden; los que ya están actualizados se saltan.
 */
export async function mergeBackup(backup: FullBackup): Promise<SyncResult> {
  let added = 0;
  let updated = 0;
  let skipped = 0;

  try {
    // Merge each table
    const mergeResults = await Promise.all([
      mergeTable(db.subjects, backup.subjects, 'updatedAt'),
      mergeTable(db.topics, backup.topics, 'updatedAt'),
      mergeTable(db.questions, backup.questions, 'updatedAt'),
      mergeSessions(backup.sessions),
      mergeTable(db.pdfAnchors, backup.pdfAnchors, null), // pdfAnchors no tienen updatedAt
      mergeTable(db.keyConcepts, backup.keyConcepts, 'updatedAt'),
      mergeTable(db.exams, backup.exams, 'updatedAt'),
      mergeTable(db.deliverables, backup.deliverables, 'updatedAt'),
      mergeGradingConfigs(backup.gradingConfigs),
    ]);

    for (const r of mergeResults) {
      added += r.added;
      updated += r.updated;
      skipped += r.skipped;
    }

    // Merge question images — solo las que no existen localmente
    const imgResult = await mergeQuestionImages(backup.questionImages);
    added += imgResult.added;
    skipped += imgResult.skipped;

    // Merge synced settings (keep higher streak, merge goals, etc.)
    await mergeSyncedSettings(backup.syncedSettings);

    // Update lastSyncAt
    await saveSettings({ lastSyncAt: new Date().toISOString() });

    return { success: true, direction: 'pull', added, updated, skipped };
  } catch (err) {
    return { success: false, direction: 'pull', error: String(err) };
  }
}

interface MergeCount { added: number; updated: number; skipped: number }

/**
 * Merge genérico para tablas con `id` como PK y opcionalmente `updatedAt`.
 */
async function mergeTable<T extends { id: string }>(
  table: import('dexie').Table<T, string>,
  remoteRecords: T[],
  timestampField: 'updatedAt' | 'createdAt' | null,
): Promise<MergeCount> {
  let added = 0, updated = 0, skipped = 0;

  for (const remote of remoteRecords) {
    const local = await table.get(remote.id);

    if (!local) {
      // Nuevo — añadir
      await table.add(remote);
      added++;
    } else if (timestampField) {
      // Comparar timestamps — gana el más reciente
      const localTs = (local as any)[timestampField] as string | undefined;
      const remoteTs = (remote as any)[timestampField] as string | undefined;

      if (remoteTs && localTs && remoteTs > localTs) {
        await table.put(remote);
        updated++;
      } else {
        skipped++;
      }
    } else {
      // Sin timestamp — saltar si ya existe
      skipped++;
    }
  }

  return { added, updated, skipped };
}

/**
 * Sessions: merge by ID + finishedAt (si la remota está terminada y la local no, actualizar).
 */
async function mergeSessions(remoteSessions: PracticeSession[]): Promise<MergeCount> {
  let added = 0, updated = 0, skipped = 0;

  for (const remote of remoteSessions) {
    const local = await db.sessions.get(remote.id);

    if (!local) {
      await db.sessions.add(remote);
      added++;
    } else if (remote.finishedAt && !local.finishedAt) {
      // Remote finished, local not — take remote
      await db.sessions.put(remote);
      updated++;
    } else if (remote.answers.length > local.answers.length) {
      // More answers in remote — take remote (more progress)
      await db.sessions.put(remote);
      updated++;
    } else {
      skipped++;
    }
  }

  return { added, updated, skipped };
}

/**
 * GradingConfigs: id === subjectId, no tiene updatedAt.
 * Solo añadir si no existe localmente.
 */
async function mergeGradingConfigs(remoteConfigs: SubjectGradingConfig[]): Promise<MergeCount> {
  let added = 0, skipped = 0;

  for (const remote of remoteConfigs) {
    const local = await db.gradingConfigs.get(remote.id);
    if (!local) {
      await db.gradingConfigs.add(remote);
      added++;
    } else {
      // Si el remoto tiene examGrade y el local no, actualizar
      if (remote.examGrade != null && local.examGrade == null) {
        await db.gradingConfigs.put(remote);
        added++;
      } else {
        skipped++;
      }
    }
  }

  return { added, updated: 0, skipped };
}

/**
 * Question images: solo descarga las que no existen localmente.
 */
async function mergeQuestionImages(
  remoteImages: Record<string, { base64: string; mimeType: string }>,
): Promise<{ added: number; skipped: number }> {
  let added = 0, skipped = 0;

  for (const [filename, { base64, mimeType }] of Object.entries(remoteImages)) {
    const id = filename.replace(/\.[^.]+$/, '');
    const exists = await db.questionImages.get(id);

    if (exists) {
      skipped++;
      continue;
    }

    await db.questionImages.add({
      id,
      filename,
      blob: base64ToBlob(base64, mimeType),
      mimeType,
      createdAt: new Date().toISOString(),
    });
    added++;
  }

  return { added, skipped };
}

/**
 * Merge settings: keep the "best" of each field.
 */
async function mergeSyncedSettings(remote: SyncedSettings): Promise<void> {
  const local = await getSettings();

  await saveSettings({
    alias: local.alias || remote.alias,
    // Merge importedPackIds (union)
    importedPackIds: [...new Set([...local.importedPackIds, ...remote.importedPackIds])],
    // Keep the higher streak
    studyStreak: Math.max(local.studyStreak ?? 0, remote.studyStreak ?? 0),
    // Keep the more recent study date
    lastStudyDate: [local.lastStudyDate, remote.lastStudyDate]
      .filter(Boolean)
      .sort()
      .pop() ?? undefined,
    // Merge goals (remote fills gaps)
    subjectGoals: { ...(remote.subjectGoals ?? {}), ...(local.subjectGoals ?? {}) },
    // Keep the more recent globalBankSyncedAt
    globalBankSyncedAt: [local.globalBankSyncedAt, remote.globalBankSyncedAt]
      .filter(Boolean)
      .sort()
      .pop() ?? undefined,
    // Merge import history (union by packId)
    importHistory: mergeImportHistory(local.importHistory, remote.importHistory),
  });
}

function mergeImportHistory(
  local?: AppSettings['importHistory'],
  remote?: AppSettings['importHistory'],
): AppSettings['importHistory'] {
  const map = new Map<string, NonNullable<AppSettings['importHistory']>[number]>();
  for (const entry of [...(local ?? []), ...(remote ?? [])]) {
    if (!map.has(entry.packId)) map.set(entry.packId, entry);
  }
  return [...map.values()];
}

// ─── PDF sync helpers ────────────────────────────────────────────────────────

/** Sanitiza nombre para usar como clave de archivo en el Gist */
function pdfGistKey(subjectId: string, filename: string): string {
  return `pdf-${subjectId.slice(0, 8)}-${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
}

/**
 * Exporta PDFs como archivos Gist.
 * PDFs pequeños → un solo archivo base64.
 * PDFs grandes → divididos en N partes de PAGES_PER_CHUNK páginas usando pdf-lib.
 */
async function exportPdfsForGist(
  subjectIds: string[],
): Promise<{
  manifest: PdfManifestEntry[];
  files: Record<string, { content: string }>;
}> {
  const manifest: PdfManifestEntry[] = [];
  const files: Record<string, { content: string }> = {};

  for (const subjectId of subjectIds) {
    const pdfNames = await listStoredPdfs(subjectId);

    for (const filename of pdfNames) {
      try {
        const blobUrl = await getPdfBlobUrl(subjectId, filename);
        if (!blobUrl) continue;

        const response = await fetch(blobUrl);
        const blob = await response.blob();
        URL.revokeObjectURL(blobUrl);

        const key = pdfGistKey(subjectId, filename);
        const arrayBuffer = await blob.arrayBuffer();
        const size = arrayBuffer.byteLength;

        if (size <= PDF_CHUNK_LIMIT) {
          // PDF pequeño → un solo archivo
          const base64 = arrayBufferToBase64(arrayBuffer);
          files[`${key}.b64`] = { content: base64 };
          manifest.push({ subjectId, filename, gistKey: key, parts: 1, originalSize: size });
        } else {
          // PDF grande → dividir en partes por páginas
          const srcDoc = await PDFDocument.load(arrayBuffer);
          const totalPages = srcDoc.getPageCount();
          let partIndex = 0;

          for (let start = 0; start < totalPages; start += PAGES_PER_CHUNK) {
            const end = Math.min(start + PAGES_PER_CHUNK, totalPages);
            const partDoc = await PDFDocument.create();
            const indices = Array.from({ length: end - start }, (_, i) => start + i);
            const pages = await partDoc.copyPages(srcDoc, indices);
            for (const page of pages) partDoc.addPage(page);

            const partBytes = await partDoc.save();
            const partBase64 = arrayBufferToBase64(partBytes);
            files[`${key}-${String(partIndex).padStart(3, '0')}.b64`] = { content: partBase64 };
            partIndex++;
          }

          manifest.push({ subjectId, filename, gistKey: key, parts: partIndex, originalSize: size });
        }
      } catch (err) {
        console.warn(`[gistSync] No se pudo exportar PDF ${filename}:`, err);
      }
    }
  }

  return { manifest, files };
}

/**
 * Importa PDFs desde archivos Gist.
 * Solo descarga los que no existen localmente.
 * Los PDFs divididos se reensamblan usando pdf-lib.
 */
async function importPdfsFromGist(
  manifest: PdfManifestEntry[],
  gistFiles: Record<string, { content: string; truncated?: boolean; raw_url?: string }>,
): Promise<{ imported: number; skipped: number }> {
  let imported = 0, skipped = 0;

  for (const entry of manifest) {
    // Comprobar si ya existe localmente
    const existingPdfs = await listStoredPdfs(entry.subjectId);
    if (existingPdfs.includes(entry.filename)) {
      skipped++;
      continue;
    }

    try {
      let pdfBlob: Blob;

      if (entry.parts === 1) {
        // PDF entero en un solo archivo
        const fileKey = `${entry.gistKey}.b64`;
        const content = await getGistFileContent(gistFiles, fileKey);
        if (!content) { skipped++; continue; }
        pdfBlob = base64ToBlob(content, 'application/pdf');
      } else {
        // PDF dividido — descargar todas las partes y merge con pdf-lib
        const mergedDoc = await PDFDocument.create();

        for (let i = 0; i < entry.parts; i++) {
          const partKey = `${entry.gistKey}-${String(i).padStart(3, '0')}.b64`;
          const content = await getGistFileContent(gistFiles, partKey);
          if (!content) throw new Error(`Falta parte ${partKey}`);

          const partBytes = base64ToArrayBuffer(content);
          const partDoc = await PDFDocument.load(partBytes);
          const pages = await mergedDoc.copyPages(partDoc, partDoc.getPageIndices());
          for (const page of pages) mergedDoc.addPage(page);
        }

        const mergedBytes = await mergedDoc.save();
        pdfBlob = new Blob([mergedBytes as BlobPart], { type: 'application/pdf' });
      }

      await savePdfBlob(entry.subjectId, entry.filename, pdfBlob);
      imported++;
    } catch (err) {
      console.warn(`[gistSync] Error importando PDF ${entry.filename}:`, err);
      skipped++;
    }
  }

  return { imported, skipped };
}

/** Lee el contenido de un archivo del Gist, manejando truncation */
async function getGistFileContent(
  files: Record<string, { content: string; truncated?: boolean; raw_url?: string }>,
  key: string,
): Promise<string | null> {
  const file = files[key];
  if (!file) return null;
  if (file.truncated && file.raw_url) {
    return await (await fetch(file.raw_url)).text();
  }
  return file.content;
}

// ─── GitHub Gist operations ──────────────────────────────────────────────────

const GIST_FILENAME = 'examcoach-backup.json';
const CHUNK_SIZE = 9 * 1024 * 1024;

/**
 * Push local DB to GitHub Gist.
 */
export async function pushToGist(token: string): Promise<SyncResult> {
  try {
    const backup = await exportFullBackup();

    // Exportar PDFs como archivos Gist separados
    const subjectIds = backup.subjects.map((s) => s.id);
    const pdfExport = await exportPdfsForGist(subjectIds);
    backup.pdfManifest = pdfExport.manifest;

    const json = JSON.stringify(backup);
    const settings = await getSettings();
    const gistId = settings.syncGistId;

    const files: Record<string, { content: string } | null> = {};

    // Añadir archivos de PDFs
    Object.assign(files, pdfExport.files);

    if (json.length <= CHUNK_SIZE) {
      files[GIST_FILENAME] = { content: json };
    } else {
      const totalChunks = Math.ceil(json.length / CHUNK_SIZE);
      for (let i = 0; i < totalChunks; i++) {
        const chunkName = `examcoach-backup-${String(i).padStart(3, '0')}.json`;
        files[chunkName] = { content: json.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE) };
      }
      files['examcoach-manifest.json'] = {
        content: JSON.stringify({ chunks: totalChunks, exportedAt: backup.exportedAt }),
      };
      if (gistId) files[GIST_FILENAME] = null;
    }

    let resultGistId: string;

    if (gistId) {
      const res = await fetch(`https://api.github.com/gists/${gistId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `token ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/vnd.github+json',
        },
        body: JSON.stringify({ files }),
      });

      if (res.status === 404) {
        resultGistId = await createNewGist(token, files as Record<string, { content: string }>, backup.exportedAt);
      } else if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as any).message ?? `HTTP ${res.status}`);
      } else {
        resultGistId = gistId;
      }
    } else {
      resultGistId = await createNewGist(token, files as Record<string, { content: string }>, backup.exportedAt);
    }

    await saveSettings({
      syncGistId: resultGistId,
      lastSyncAt: new Date().toISOString(),
    });

    return { success: true, direction: 'push' };
  } catch (err) {
    return { success: false, direction: 'push', error: String(err) };
  }
}

async function createNewGist(
  token: string,
  files: Record<string, { content: string }>,
  exportedAt: string,
): Promise<string> {
  const res = await fetch('https://api.github.com/gists', {
    method: 'POST',
    headers: {
      Authorization: `token ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/vnd.github+json',
    },
    body: JSON.stringify({
      description: `ExamCoach sync backup — ${exportedAt}`,
      public: false,
      files,
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any).message ?? `HTTP ${res.status}`);
  }

  return ((await res.json()) as { id: string }).id;
}

/**
 * Pull from Gist con merge inteligente.
 * Primero comprueba si el Gist cambió desde el último sync (como `git fetch`).
 */
export async function pullFromGist(token: string): Promise<SyncResult> {
  try {
    const settings = await getSettings();
    const gistId = settings.syncGistId;

    if (!gistId) {
      return { success: false, direction: 'pull', error: 'No hay Gist de sync configurado.' };
    }

    // 1. Check if Gist changed since last sync (HEAD-like check)
    const metaRes = await fetch(`https://api.github.com/gists/${gistId}`, {
      headers: {
        Authorization: `token ${token}`,
        Accept: 'application/vnd.github+json',
      },
    });

    if (!metaRes.ok) {
      const body = await metaRes.json().catch(() => ({}));
      throw new Error((body as any).message ?? `HTTP ${metaRes.status}`);
    }

    const gist = (await metaRes.json()) as {
      updated_at: string;
      files: Record<string, { content: string; truncated?: boolean; raw_url?: string }>;
    };

    // Si no ha cambiado desde nuestro último sync, skip
    if (settings.lastSyncAt && gist.updated_at <= settings.lastSyncAt) {
      return { success: true, direction: 'skip', skipped: 0, added: 0, updated: 0 };
    }

    // 2. Download and parse
    let json: string;

    if (gist.files[GIST_FILENAME]?.content) {
      const file = gist.files[GIST_FILENAME];
      if (file.truncated && file.raw_url) {
        json = await (await fetch(file.raw_url)).text();
      } else {
        json = file.content;
      }
    } else if (gist.files['examcoach-manifest.json']) {
      const manifest = JSON.parse(gist.files['examcoach-manifest.json'].content) as { chunks: number };
      const parts: string[] = [];
      for (let i = 0; i < manifest.chunks; i++) {
        const chunkName = `examcoach-backup-${String(i).padStart(3, '0')}.json`;
        const chunkFile = gist.files[chunkName];
        if (!chunkFile) throw new Error(`Falta chunk ${chunkName}`);
        if (chunkFile.truncated && chunkFile.raw_url) {
          parts.push(await (await fetch(chunkFile.raw_url)).text());
        } else {
          parts.push(chunkFile.content);
        }
      }
      json = parts.join('');
    } else {
      throw new Error('Gist no contiene un backup válido.');
    }

    const backup = JSON.parse(json) as FullBackup;
    if (backup.kind !== 'full-backup') {
      throw new Error('El Gist no contiene un full-backup válido.');
    }

    // 3. Merge datos estructurados — no borra nada, solo añade/actualiza
    const result = await mergeBackup(backup);

    // 4. Merge PDFs — solo descarga los que no existen localmente
    if (backup.pdfManifest && backup.pdfManifest.length > 0) {
      const pdfResult = await importPdfsFromGist(backup.pdfManifest, gist.files);
      result.added = (result.added ?? 0) + pdfResult.imported;
      result.skipped = (result.skipped ?? 0) + pdfResult.skipped;
    }

    return result;
  } catch (err) {
    return { success: false, direction: 'pull', error: String(err) };
  }
}

// ─── Auto-sync engine ────────────────────────────────────────────────────────

let syncInterval: ReturnType<typeof setInterval> | null = null;
let lastPushHash = '';

/**
 * Arranca auto-sync periódico.
 * - Pull al inicio (solo si hay cambios remotos).
 * - Push cada `intervalMs` (default: 5 min) si hay cambios locales.
 */
export function startAutoSync(intervalMs = 5 * 60 * 1000): void {
  if (syncInterval) return;
  autoSyncTick();
  syncInterval = setInterval(autoSyncTick, intervalMs);

  // Push al salir de la app (cerrar pestaña, cambiar de app en móvil)
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') autoSyncPush();
  });
}

export function stopAutoSync(): void {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
}

async function autoSyncTick(): Promise<void> {
  try {
    const settings = await getSettings();
    if (!settings.githubToken || !settings.syncGistId) return;

    // Pull primero (solo descarga si hay cambios)
    await pullFromGist(settings.githubToken);

    // Luego push si hay cambios locales
    await autoSyncPush();
  } catch {
    // Auto-sync nunca crashea la app
  }
}

async function autoSyncPush(): Promise<void> {
  try {
    const settings = await getSettings();
    if (!settings.githubToken || !settings.syncGistId) return;

    // Quick hash para detectar cambios locales sin exportar todo
    const [qCount, sCount, dCount, kCount] = await Promise.all([
      db.questions.count(),
      db.sessions.count(),
      db.deliverables.count(),
      db.keyConcepts.count(),
    ]);
    const hash = `${qCount}-${sCount}-${dCount}-${kCount}-${settings.lastStudyDate ?? ''}`;
    if (hash === lastPushHash) return;

    const result = await pushToGist(settings.githubToken);
    if (result.success) lastPushHash = hash;
  } catch { /* silent */ }
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function base64ToBlob(base64: string, mime: string): Blob {
  const bytes = atob(base64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

function arrayBufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const arr = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
  return arr.buffer as ArrayBuffer;
}
