import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { db } from './db';
import { getSettings, saveSettings } from './db';
import { slugify } from '@/domain/normalize';
import { computeContentHash } from '@/domain/hashing';
import type { ContributionPack, Subject, Topic, Question } from '@/domain/models';

// ─── Zod schemas ──────────────────────────────────────────────────────────────

const ContributionQuestionSchema = z.object({
  id: z.string(),
  subjectKey: z.string(),
  topicKey: z.string(),
  type: z.enum(['TEST', 'DESARROLLO', 'COMPLETAR', 'PRACTICO']),
  prompt: z.string(),
  options: z.array(z.object({ id: z.string(), text: z.string() })).optional(),
  correctOptionIds: z.array(z.string()).optional(),
  modelAnswer: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  clozeText: z.string().optional(),
  blanks: z.array(z.object({ id: z.string(), accepted: z.array(z.string()) })).optional(),
  explanation: z.string().optional(),
  difficulty: z.number().min(1).max(5).optional(),
  tags: z.array(z.string()).optional(),
  pdfAnchor: z.object({ page: z.number(), label: z.string().optional() }).optional(),
  createdBy: z.string().optional(),
  contentHash: z.string().optional(),
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

  // Resolve / create subjects and topics from targets
  for (const target of pack.targets) {
    let subject = subjectByKey.get(target.subjectKey);
    if (!subject) {
      const newSubject: Subject = {
        id: uuidv4(),
        name: target.subjectName,
        createdAt: now,
        updatedAt: now,
      };
      await db.subjects.add(newSubject);
      subject = newSubject;
      subjectByKey.set(target.subjectKey, subject);
      result.newSubjectsCreated++;
    }

    for (const topicTarget of target.topics) {
      const compositeKey = `${target.subjectKey}::${topicTarget.topicKey}`;
      if (!topicByKey.has(compositeKey)) {
        const existingTopics = await db.topics.where('subjectId').equals(subject!.id).toArray();
        const newTopic: Topic = {
          id: uuidv4(),
          subjectId: subject!.id,
          title: topicTarget.topicTitle,
          order: existingTopics.length,
          createdAt: now,
          updatedAt: now,
        };
        await db.topics.add(newTopic);
        topicByKey.set(compositeKey, newTopic);
        result.newTopicsCreated++;
      }
    }
  }

  // Process questions
  for (const cq of pack.questions) {
    const subjectKey = cq.subjectKey;
    const topicKey = cq.topicKey;
    const compositeKey = `${subjectKey}::${topicKey}`;

    const subject = subjectByKey.get(subjectKey);
    const topic = topicByKey.get(compositeKey);

    if (!subject || !topic) {
      result.errors.push(`No se encontró asignatura/tema para: ${subjectKey}/${topicKey}`);
      continue;
    }

    // Compute/verify content hash
    const computedHash = await computeContentHash(cq, topicKey);
    const hashToCheck = cq.contentHash ?? computedHash;

    // Check for duplicate
    const isDuplicate = await db.questions
      .where('contentHash')
      .equals(hashToCheck)
      .and((q) => q.subjectId === subject.id)
      .count() > 0;

    if (isDuplicate) {
      result.duplicates++;
      continue;
    }

    // Insert new question
    const newQuestion: Question = {
      id: uuidv4(),
      subjectId: subject.id,
      topicId: topic.id,
      type: cq.type,
      prompt: cq.prompt,
      explanation: cq.explanation,
      difficulty: cq.difficulty as Question['difficulty'],
      tags: cq.tags,
      options: cq.options,
      correctOptionIds: cq.correctOptionIds,
      modelAnswer: cq.modelAnswer,
      keywords: cq.keywords,
      clozeText: cq.clozeText,
      blanks: cq.blanks,
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
        pdfId: 'pending', // no PDF yet
        page: cq.pdfAnchor.page,
        label: cq.pdfAnchor.label,
      };
      await db.pdfAnchors.add(anchor);
      newQuestion.pdfAnchorId = anchor.id;
    }

    await db.questions.add(newQuestion);
    result.newQuestions++;
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
    return {
      id: q.id,
      subjectKey: slugify(subject.name),
      topicKey: topic ? slugify(topic.title) : q.topicId,
      type: q.type,
      prompt: q.prompt,
      options: q.options,
      correctOptionIds: q.correctOptionIds,
      modelAnswer: q.modelAnswer,
      keywords: q.keywords,
      clozeText: q.clozeText,
      blanks: q.blanks,
      explanation: q.explanation,
      difficulty: q.difficulty,
      tags: q.tags,
      createdBy: q.createdBy ?? alias,
      contentHash: q.contentHash,
    };
  });

  return {
    version: 1,
    kind: 'contribution',
    packId: uuidv4(),
    createdBy: alias || 'unknown',
    exportedAt: new Date().toISOString(),
    targets,
    questions: contributionQuestions,
  };
}
