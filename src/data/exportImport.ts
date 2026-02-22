import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { db, getSettings, saveSettings } from './db';
import { subjectRepo, topicRepo, questionRepo } from './repos';
import type { BankExport, Subject, Topic, Question, PdfAnchor } from '@/domain/models';

// ─── Zod schemas for validation ───────────────────────────────────────────────

const SubjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string().optional(),
  icon: z.string().optional(),
  examDate: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const TopicSchema = z.object({
  id: z.string(),
  subjectId: z.string(),
  title: z.string(),
  order: z.number(),
  tags: z.array(z.string()).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const QuestionOptionSchema = z.object({
  id: z.string(),
  text: z.string(),
});

const ClozeBlankSchema = z.object({
  id: z.string(),
  accepted: z.array(z.string()),
});

const QuestionStatsSchema = z.object({
  seen: z.number(),
  correct: z.number(),
  wrong: z.number(),
  lastSeenAt: z.string().optional(),
  lastResult: z.enum(['CORRECT', 'WRONG']).optional(),
});

const QuestionSchema = z.object({
  id: z.string(),
  subjectId: z.string(),
  topicId: z.string(),
  topicIds: z.array(z.string()).optional(), // ITER3
  type: z.enum(['TEST', 'DESARROLLO', 'COMPLETAR', 'PRACTICO']),
  prompt: z.string(),
  explanation: z.string().optional(),
  difficulty: z.number().min(1).max(5).optional(),
  tags: z.array(z.string()).optional(),
  options: z.array(QuestionOptionSchema).optional(),
  correctOptionIds: z.array(z.string()).optional(),
  modelAnswer: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  numericAnswer: z.string().optional(), // ITER3
  clozeText: z.string().optional(),
  blanks: z.array(ClozeBlankSchema).optional(),
  pdfAnchorId: z.string().optional(),
  createdBy: z.string().optional(),
  sourcePackId: z.string().optional(),
  contentHash: z.string().optional(),
  stats: QuestionStatsSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

const PdfAnchorSchema = z.object({
  id: z.string(),
  subjectId: z.string(),
  pdfId: z.string(),
  page: z.number(),
  bbox: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }).optional(),
  label: z.string().optional(),
});

const BankExportSchema = z.object({
  version: z.literal(1),
  kind: z.literal('bank'),
  exportedAt: z.string(),
  subjects: z.array(SubjectSchema),
  topics: z.array(TopicSchema),
  questions: z.array(QuestionSchema),
  pdfAnchors: z.array(PdfAnchorSchema),
});

// ─── Export ───────────────────────────────────────────────────────────────────

/** Exporta el banco completo tal cual (backup personal, incluye examDate y stats). */
export async function exportBank(subjectIds?: string[]): Promise<BankExport> {
  let subjects: Subject[];
  let topics: Topic[];
  let questions: Question[];
  let pdfAnchors: PdfAnchor[];

  if (subjectIds && subjectIds.length > 0) {
    subjects = await db.subjects.where('id').anyOf(subjectIds).toArray();
    topics = [];
    questions = [];
    pdfAnchors = [];
    for (const sid of subjectIds) {
      topics.push(...(await topicRepo.getBySubject(sid)));
      questions.push(...(await questionRepo.getBySubject(sid)));
      pdfAnchors.push(...(await db.pdfAnchors.where('subjectId').equals(sid).toArray()));
    }
  } else {
    subjects = await db.subjects.toArray();
    topics = await db.topics.toArray();
    questions = await db.questions.toArray();
    pdfAnchors = await db.pdfAnchors.toArray();
  }

  return {
    version: 1,
    kind: 'bank',
    exportedAt: new Date().toISOString(),
    subjects,
    topics,
    questions,
    pdfAnchors,
  };
}

/**
 * Exporta el banco global — versión pensada para committear al repositorio.
 *
 * Diferencias respecto a exportBank():
 *  - examDate eliminado de todas las asignaturas (es dato personal de cada usuario)
 *  - stats reseteadas a 0 (cada usuario empieza desde cero)
 */
export async function exportGlobalBank(subjectIds?: string[]): Promise<BankExport> {
  const bank = await exportBank(subjectIds);

  return {
    ...bank,
    exportedAt: new Date().toISOString(),
    subjects: bank.subjects.map(({ examDate: _examDate, ...rest }) => rest as Subject),
    questions: bank.questions.map(({ sourcePackId: _sourcePackId, ...q }) => ({
      ...q,
      stats: { seen: 0, correct: 0, wrong: 0 },
    })),
  };
}

export function downloadJSON(data: unknown, filename: string): void {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Import (backup personal / legacy) ────────────────────────────────────────
//
// ⚠️  Este import siempre crea UUIDs nuevos — es para restaurar backups personales.
//     Para sincronizar con el banco global usa mergeGlobalBank() en globalBank.ts.

export interface ImportBankResult {
  subjectsAdded: number;
  topicsAdded: number;
  questionsAdded: number;
  errors: string[];
}

export async function importBank(raw: unknown): Promise<ImportBankResult> {
  const result: ImportBankResult = {
    subjectsAdded: 0,
    topicsAdded: 0,
    questionsAdded: 0,
    errors: [],
  };

  const parsed = BankExportSchema.safeParse(raw);
  if (!parsed.success) {
    result.errors.push('JSON inválido: ' + parsed.error.message);
    return result;
  }

  const bank = parsed.data;
  const now = new Date().toISOString();

  const subjectIdMap = new Map<string, string>();
  const topicIdMap = new Map<string, string>();
  const anchorIdMap = new Map<string, string>();

  for (const s of bank.subjects) {
    const newId = uuidv4();
    subjectIdMap.set(s.id, newId);
    await db.subjects.add({ ...s, id: newId, createdAt: now, updatedAt: now });
    result.subjectsAdded++;
  }

  for (const t of bank.topics) {
    const newId = uuidv4();
    topicIdMap.set(t.id, newId);
    const newSubjectId = subjectIdMap.get(t.subjectId) ?? t.subjectId;
    await db.topics.add({ ...t, id: newId, subjectId: newSubjectId, createdAt: now, updatedAt: now });
    result.topicsAdded++;
  }

  for (const a of bank.pdfAnchors) {
    const newId = uuidv4();
    anchorIdMap.set(a.id, newId);
    const newSubjectId = subjectIdMap.get(a.subjectId) ?? a.subjectId;
    await db.pdfAnchors.add({ ...a, id: newId, subjectId: newSubjectId });
  }

  for (const q of bank.questions) {
    const newId = uuidv4();
    const newSubjectId = subjectIdMap.get(q.subjectId) ?? q.subjectId;
    const newTopicId = topicIdMap.get(q.topicId) ?? q.topicId;
    const newAnchorId = q.pdfAnchorId ? (anchorIdMap.get(q.pdfAnchorId) ?? q.pdfAnchorId) : undefined;
    await db.questions.add({
      ...q,
      id: newId,
      subjectId: newSubjectId,
      topicId: newTopicId,
      pdfAnchorId: newAnchorId,
      stats: { seen: 0, correct: 0, wrong: 0 },
      createdAt: now,
      updatedAt: now,
    } as Question);
    result.questionsAdded++;
  }

  return result;
}

export async function parseImportFile(file: File): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target?.result as string);
        resolve(json);
      } catch {
        reject(new Error('Archivo JSON inválido'));
      }
    };
    reader.onerror = () => reject(new Error('Error leyendo archivo'));
    reader.readAsText(file);
  });
}

// ─── Commit & Clean ────────────────────────────────────────────────────────────
//
// Actualiza src/data/global-bank.json con el estado actual de la DB (listo para
// git commit), luego marca las preguntas de contribution packs como "committed"
// (borra su sourcePackId) y resetea el historial de packs importados.
//
// NOTA IMPORTANTE sobre duplicados:
// La versión anterior hacía bulkDelete + mergeGlobalBank(bank) al final, lo que
// creaba una race condition con el syncWithGlobalBank() del arranque: ambas
// llamadas construían su propio existingHashes snapshot antes de insertar, y
// si se interleaban podían insertar la misma pregunta dos veces.
//
// La solución es NO borrar las preguntas — solo limpiar su sourcePackId para
// marcarlas como preguntas del banco global. Así se evita cualquier reinserción.

export interface CommitCleanResult {
  questionsInBank: number;
  committedFromPacks: number;   // preguntas de packs marcadas como comprometidas
  clearedPackIds: number;
  wroteToFile: boolean;
}

export async function commitAndCleanContributions(): Promise<CommitCleanResult> {
  const bank = await exportGlobalBank();

  // Escribir al archivo via dev server
  let wroteToFile = false;
  try {
    const res = await fetch('/api/write-global-bank', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bank),
    });
    wroteToFile = res.ok;
  } catch {
    // Dev server no disponible
  }

  // En lugar de borrar + re-insertar (que causa duplicados por race conditions),
  // simplemente limpiamos el sourcePackId de las preguntas de contribution packs.
  // Quedan en la DB como preguntas normales del banco global.
  const allQuestions = await db.questions.toArray();
  const packQuestionIds = allQuestions
    .filter((q) => !!q.sourcePackId)
    .map((q) => q.id);

  if (packQuestionIds.length > 0) {
    await db.questions
      .where('id')
      .anyOf(packQuestionIds)
      .modify({ sourcePackId: undefined });
  }

  // Resetear historial de packs importados
  const settings = await getSettings();
  const clearedPackIds = settings.importedPackIds.length;
  await saveSettings({ importedPackIds: [], importHistory: [] });

  return {
    questionsInBank: bank.questions.length,
    committedFromPacks: packQuestionIds.length,
    clearedPackIds,
    wroteToFile,
  };
}

// ─── Remove Duplicates ─────────────────────────────────────────────────────────
//
// Detecta preguntas duplicadas (mismo contentHash) y conserva solo la mejor
// (mayor número de vistas o más reciente), eliminando el resto.

export interface RemoveDuplicatesResult {
  removed: number;
  checked: number;
}

export async function removeDuplicateQuestions(): Promise<RemoveDuplicatesResult> {
  const allQuestions = await db.questions.toArray();
  const checked = allQuestions.length;

  // Agrupar por contentHash
  const byHash = new Map<string, Question[]>();
  const toDelete: string[] = [];

  for (const q of allQuestions) {
    if (!q.contentHash) continue; // sin hash: no podemos deduplicar de forma segura
    if (!byHash.has(q.contentHash)) byHash.set(q.contentHash, []);
    byHash.get(q.contentHash)!.push(q);
  }

  for (const [, group] of byHash) {
    if (group.length <= 1) continue;

    // Ordenar: conservar la que tiene más historial de uso, luego la más reciente
    group.sort((a, b) => {
      const scoreA = a.stats.seen + a.stats.correct + a.stats.wrong;
      const scoreB = b.stats.seen + b.stats.correct + b.stats.wrong;
      if (scoreB !== scoreA) return scoreB - scoreA;
      return b.createdAt.localeCompare(a.createdAt);
    });

    // Conservar la primera, eliminar el resto
    toDelete.push(...group.slice(1).map((q) => q.id));
  }

  if (toDelete.length > 0) {
    await db.questions.bulkDelete(toDelete);
  }

  return { removed: toDelete.length, checked };
}