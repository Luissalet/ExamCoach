import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { db } from './db';
import { getSettings, saveSettings } from './db';
import { slugify } from '@/domain/normalize';
import { computeContentHash } from '@/domain/hashing';
import { buildImageMap, importImages, extractImageFilenames } from './questionImageStorage';
import type { ContributionPack, Subject, Topic, Question } from '@/domain/models';

// ─── Zod schemas ──────────────────────────────────────────────────────────────

const ContributionQuestionSchema = z.object({
  id: z.string(),
  subjectKey: z.string(),
  topicKey: z.string(),
  type: z.enum(['TEST', 'DESARROLLO', 'COMPLETAR', 'PRACTICO']),
  prompt: z.string(),
  origin: z.enum(['test', 'examen_anterior', 'clase', 'alumno']).optional(),
  options: z.array(z.object({ id: z.string(), text: z.string() })).optional(),
  correctOptionIds: z.array(z.string()).optional(),
  modelAnswer: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  numericAnswer: z.string().optional(),
  clozeText: z.string().optional(),
  blanks: z.array(z.object({ id: z.string(), accepted: z.array(z.string()) })).optional(),
  explanation: z.string().optional(),
  difficulty: z.number().min(1).max(5).optional(),
  tags: z.array(z.string()).optional(),
  topicKeys: z.array(z.string()).optional(),
  pdfAnchor: z.object({ page: z.number(), label: z.string().optional() }).optional(),
  createdBy: z.string().optional(),
  contentHash: z.string().optional(),
  imageDataUrls: z.array(z.string()).optional(),
});

const ContributionPackSchema = z.object({
  version: z.literal(1),
  kind: z.literal('contribution'),
  packId: z.string(),
  createdBy: z.string(),
  exportedAt: z.string(),
  targets: z.array(
    z.object({
      subjectKey: z.string(),
      subjectName: z.string(),
      topics: z.array(z.object({ topicKey: z.string(), topicTitle: z.string() })),
    })
  ),
  questions: z.array(ContributionQuestionSchema),
  // ITER4 — inline images
  questionImages: z.record(z.string(), z.string()).optional(),
});

// ─── Import result ─────────────────────────────────────────────────────────────

export interface ContributionImportResult {
  packId: string;
  createdBy: string;
  newQuestions: number;
  duplicates: number;
  newTopicsCreated: number;
  newSubjectsCreated: number;
  alreadyImported: boolean;
  errors: string[];
}

// ─── Main merge function ───────────────────────────────────────────────────────

export async function importContributionPack(raw: unknown): Promise<ContributionImportResult> {
  const result: ContributionImportResult = {
    packId: '',
    createdBy: '',
    newQuestions: 0,
    duplicates: 0,
    newTopicsCreated: 0,
    newSubjectsCreated: 0,
    alreadyImported: false,
    errors: [],
  };

  // Validate
  const parsed = ContributionPackSchema.safeParse(raw);
  if (!parsed.success) {
    result.errors.push('JSON inválido: ' + parsed.error.message);
    return result;
  }

  const pack = parsed.data as ContributionPack;
  result.packId = pack.packId;
  result.createdBy = pack.createdBy;

  // Check if already imported
  const settings = await getSettings();
  if (settings.importedPackIds.includes(pack.packId)) {
    result.alreadyImported = true;
    return result;
  }

  // ITER4 — Import images first (before questions so they're available immediately)
  if (pack.questionImages && Object.keys(pack.questionImages).length > 0) {
    try {
      await importImages(pack.questionImages);
    } catch (err) {
      result.errors.push(`Aviso: error importando imágenes: ${String(err)}`);
      // Don't abort — questions can still be imported
    }
  }

  const now = new Date().toISOString();

  // Build lookup maps: subjectKey -> Subject, topicKey -> Topic
  const allSubjects = await db.subjects.toArray();
  const allTopics = await db.topics.toArray();

  const subjectByKey = new Map<string, Subject>();
  for (const s of allSubjects) {
    subjectByKey.set(slugify(s.name), s);
  }

  const topicByKey = new Map<string, Topic>();
  for (const t of allTopics) {
    const subject = allSubjects.find((s) => s.id === t.subjectId);
    if (subject) {
      const key = `${slugify(subject.name)}::${slugify(t.title)}`;
      topicByKey.set(key, t);
    }
  }

  // Process each question
  for (const cq of pack.questions) {
    try {
      const subjectKey = cq.subjectKey;

      // Resolve or create subject
      let subject = subjectByKey.get(subjectKey);
      if (!subject) {
        // Find the target info for this subject
        const targetInfo = pack.targets.find((t) => t.subjectKey === subjectKey);
        const subjectName = targetInfo?.subjectName ?? subjectKey;

        subject = {
          id: uuidv4(),
          name: subjectName,
          createdAt: now,
          updatedAt: now,
        };
        await db.subjects.add(subject);
        subjectByKey.set(subjectKey, subject);
        result.newSubjectsCreated++;
      }

      // Resolve or create topic
      const topicKey = cq.topicKey;
      const topicMapKey = `${subjectKey}::${topicKey}`;
      let topic = topicByKey.get(topicMapKey);

      if (!topic) {
        // Find topic info from targets
        const targetInfo = pack.targets.find((t) => t.subjectKey === subjectKey);
        const topicInfo = targetInfo?.topics.find((t) => t.topicKey === topicKey);
        const topicTitle = topicInfo?.topicTitle ?? topicKey;

        // Get max order for subject
        const existingTopics = await db.topics.where('subjectId').equals(subject.id).toArray();
        const maxOrder = existingTopics.reduce((max, t) => Math.max(max, t.order), -1);

        topic = {
          id: uuidv4(),
          subjectId: subject.id,
          title: topicTitle,
          order: maxOrder + 1,
          createdAt: now,
          updatedAt: now,
        };
        await db.topics.add(topic);
        topicByKey.set(topicMapKey, topic);
        result.newTopicsCreated++;
      }

      // Compute content hash for deduplication
      const hashToCheck = cq.contentHash ?? await computeContentHash(cq, cq.topicKey);

      // Check for duplicate
      const isDuplicate = await db.questions
        .where('contentHash')
        .equals(hashToCheck)
        .and((q) => q.subjectId === subject!.id)
        .count() > 0;

      if (isDuplicate) {
        result.duplicates++;
        continue;
      }

      // Prepare topicKeys for multi-topic questions
      let finalTopicIds: string[] | undefined;
      if (cq.topicKeys && cq.topicKeys.length > 1) {
        finalTopicIds = [];
        for (const topicSlug of cq.topicKeys) {
          const key = `${subjectKey}::${topicSlug}`;
          const resolvedTopic = topicByKey.get(key);
          if (resolvedTopic) {
            finalTopicIds.push(resolvedTopic.id);
          }
        }
        if (finalTopicIds.length <= 1) {
          finalTopicIds = undefined;
        }
      }

      // Insert new question
      const newQuestion: Question = {
        id: uuidv4(),
        subjectId: subject.id,
        topicId: topic.id,
        topicIds: finalTopicIds,
        type: cq.type,
        prompt: cq.prompt,
        explanation: cq.explanation,
        difficulty: cq.difficulty as Question['difficulty'],
        tags: cq.tags,
        origin: cq.origin,
        options: cq.options,
        correctOptionIds: cq.correctOptionIds,
        modelAnswer: cq.modelAnswer,
        keywords: cq.keywords,
        numericAnswer: cq.numericAnswer,
        clozeText: cq.clozeText,
        blanks: cq.blanks,
        imageDataUrls: cq.imageDataUrls,
        contentHash: hashToCheck,
        createdBy: cq.createdBy ?? pack.createdBy,
        sourcePackId: pack.packId,
        stats: { seen: 0, correct: 0, wrong: 0 },
        createdAt: now,
        updatedAt: now,
      };

      // Handle PDF anchor if present
      if (cq.pdfAnchor) {
        const anchor = {
          id: uuidv4(),
          subjectId: subject.id,
          pdfId: 'pending',
          page: cq.pdfAnchor.page,
          label: cq.pdfAnchor.label,
        };
        await db.pdfAnchors.add(anchor);
        newQuestion.pdfAnchorId = anchor.id;
      }

      await db.questions.add(newQuestion);
      result.newQuestions++;
    } catch (err) {
      result.errors.push(`Error procesando pregunta ${cq.id}: ${String(err)}`);
    }
  }

  // Mark pack as imported
  await saveSettings({
    importedPackIds: [...settings.importedPackIds, pack.packId],
  });

  return result;
}

// ─── Export contribution pack ──────────────────────────────────────────────────

export async function exportContributionPack(
  alias: string,
  subjectId: string,
  topicId?: string
): Promise<ContributionPack> {
  const subject = await db.subjects.get(subjectId);
  if (!subject) throw new Error('Asignatura no encontrada');

  let questions = topicId
    ? await db.questions.where('topicId').equals(topicId).and((q) => q.createdBy === alias).toArray()
    : await db.questions.where('subjectId').equals(subjectId).and((q) => q.createdBy === alias).toArray();

  if (!alias) {
    // If no alias, export all questions from subject
    questions = topicId
      ? await db.questions.where('topicId').equals(topicId).toArray()
      : await db.questions.where('subjectId').equals(subjectId).toArray();
  }

  const topicIds = [...new Set(questions.map((q) => q.topicId))];
  const topics = await db.topics.where('id').anyOf(topicIds).toArray();

  const targets = [
    {
      subjectKey: slugify(subject.name),
      subjectName: subject.name,
      topics: topics.map((t) => ({
        topicKey: slugify(t.title),
        topicTitle: t.title,
      })),
    },
  ];

  const contributionQuestions = questions.map((q) => {
    const topic = topics.find((t) => t.id === q.topicId);

    let topicKeysSlugs: string[] | undefined;
    if (q.topicIds && q.topicIds.length > 1) {
      topicKeysSlugs = q.topicIds.map((tid) => {
        const t = topics.find((topic) => topic.id === tid);
        return t ? slugify(t.title) : tid;
      });
    }

    return {
      id: q.id,
      subjectKey: slugify(subject.name),
      topicKey: topic ? slugify(topic.title) : q.topicId,
      topicKeys: topicKeysSlugs,
      type: q.type,
      prompt: q.prompt,
      origin: q.origin,
      options: q.options,
      correctOptionIds: q.correctOptionIds,
      modelAnswer: q.modelAnswer,
      keywords: q.keywords,
      numericAnswer: q.numericAnswer,
      clozeText: q.clozeText,
      blanks: q.blanks,
      imageDataUrls: q.imageDataUrls,
      explanation: q.explanation,
      difficulty: q.difficulty,
      tags: q.tags,
      createdBy: q.createdBy ?? alias,
      contentHash: q.contentHash,
    };
  });

  // ITER4 — collect all inline images from questions
  const allTexts: string[] = [];
  for (const q of contributionQuestions) {
    if (q.prompt) allTexts.push(q.prompt);
    if (q.explanation) allTexts.push(q.explanation);
    if (q.modelAnswer) allTexts.push(q.modelAnswer);
    if (q.clozeText) allTexts.push(q.clozeText);
  }
  const questionImages = await buildImageMap(allTexts);

  return {
    version: 1,
    kind: 'contribution',
    packId: uuidv4(),
    createdBy: alias || 'unknown',
    exportedAt: new Date().toISOString(),
    targets,
    questions: contributionQuestions,
    questionImages: Object.keys(questionImages).length > 0 ? questionImages : undefined,
  };
}