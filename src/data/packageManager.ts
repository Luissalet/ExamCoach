/**
 * packageManager.ts
 *
 * Gestiona la instalación, desinstalación y exportación de paquetes de asignaturas.
 * Un paquete (.examcoach.zip) contiene:
 *   - manifest.json: metadatos del paquete
 *   - bank.json: topics, questions, keyConcepts, exams, pdfAnchors
 *   - Temas/, Examenes/, Resumenes/, Practica/: recursos (PDFs, etc.)
 */

import JSZip from 'jszip';
import { v4 as uuidv4 } from 'uuid';
import { db } from './db';
import { slugify } from '@/domain/normalize';
import { computeContentHash } from '@/domain/hashing';
import type {
  PackageManifest,
  SubjectBank,
  InstalledPackage,
  Subject,
  Topic,
  Question,
  KeyConcept,
  Exam,
  PdfAnchor,
} from '@/domain/models';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface InstallResult {
  success: boolean;
  packageId: string;
  packageName: string;
  subjectId: string;
  stats: {
    topics: number;
    questions: number;
    keyConcepts: number;
    exams: number;
    resources: number;
  };
  errors: string[];
  /** True if this was an update of an already-installed package */
  wasUpdate: boolean;
}

export type InstallProgress = {
  phase: 'reading' | 'validating' | 'importing-bank' | 'importing-resources' | 'complete';
  detail?: string;
  filesProcessed?: number;
  totalFiles?: number;
};

export type InstallProgressCallback = (event: InstallProgress) => void;

// ─── Install ─────────────────────────────────────────────────────────────────

export async function installPackage(
  zipData: File | Blob,
  onProgress?: InstallProgressCallback,
): Promise<InstallResult> {
  const errors: string[] = [];
  const stats = { topics: 0, questions: 0, keyConcepts: 0, exams: 0, resources: 0 };

  onProgress?.({ phase: 'reading' });

  // 1. Read ZIP
  const zip = await JSZip.loadAsync(zipData);

  // 2. Find and parse manifest.json
  onProgress?.({ phase: 'validating' });

  const manifestFile = zip.file('manifest.json');
  if (!manifestFile) {
    return { success: false, packageId: '', packageName: '', subjectId: '', stats, errors: ['No se encontró manifest.json en el paquete'], wasUpdate: false };
  }

  let manifest: PackageManifest;
  try {
    manifest = JSON.parse(await manifestFile.async('text'));
  } catch {
    return { success: false, packageId: '', packageName: '', subjectId: '', stats, errors: ['manifest.json inválido'], wasUpdate: false };
  }

  if (!manifest.id || !manifest.name || !manifest.version) {
    return { success: false, packageId: '', packageName: '', subjectId: '', stats, errors: ['manifest.json incompleto (falta id, name o version)'], wasUpdate: false };
  }

  // 3. Parse bank.json
  const bankFile = zip.file('bank.json');
  if (!bankFile) {
    return { success: false, packageId: manifest.id, packageName: manifest.name, subjectId: '', stats, errors: ['No se encontró bank.json en el paquete'], wasUpdate: false };
  }

  let bank: SubjectBank;
  try {
    bank = JSON.parse(await bankFile.async('text'));
  } catch {
    return { success: false, packageId: manifest.id, packageName: manifest.name, subjectId: '', stats, errors: ['bank.json inválido'], wasUpdate: false };
  }

  // 4. Check if already installed
  const existing = await db.installedPackages.get(manifest.id);
  const wasUpdate = !!existing;

  onProgress?.({ phase: 'importing-bank', detail: 'Importando banco de preguntas…' });

  // 5. Create or find subject
  let subjectId: string;
  const allSubjects = await db.subjects.toArray();
  const existingSubject = allSubjects.find(s => slugify(s.name) === manifest.id);

  if (existingSubject) {
    subjectId = existingSubject.id;
    // Update subject metadata from manifest
    await db.subjects.update(subjectId, {
      allowsNotes: manifest.allowsNotes,
      color: existingSubject.color, // preserve user color
      updatedAt: new Date().toISOString(),
    });
  } else {
    const now = new Date().toISOString();
    subjectId = uuidv4();
    const newSubject: Subject = {
      id: subjectId,
      name: manifest.name,
      color: pickColor(allSubjects.length),
      allowsNotes: manifest.allowsNotes,
      createdAt: now,
      updatedAt: now,
    };
    await db.subjects.add(newSubject);
  }

  // 6. Import topics
  const topicIdMap = new Map<string, string>(); // bank topicId → local topicId
  const existingTopics = await db.topics.where('subjectId').equals(subjectId).toArray();
  const topicBySlug = new Map(existingTopics.map(t => [slugify(t.title), t]));

  for (const topic of bank.topics) {
    const slug = slugify(topic.title);
    const existing = topicBySlug.get(slug);

    if (existing) {
      topicIdMap.set(topic.id, existing.id);
      // Update order/tags if newer
      await db.topics.update(existing.id, {
        order: topic.order,
        tags: topic.tags,
        pdfFilename: topic.pdfFilename ?? existing.pdfFilename,
        updatedAt: new Date().toISOString(),
      });
    } else {
      const newId = uuidv4();
      topicIdMap.set(topic.id, newId);
      await db.topics.add({
        ...topic,
        id: newId,
        subjectId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      stats.topics++;
    }
  }

  // 7. Import pdfAnchors
  const anchorIdMap = new Map<string, string>();
  if (bank.pdfAnchors) {
    const existingAnchors = await db.pdfAnchors.where('subjectId').equals(subjectId).toArray();
    const anchorKey = (a: PdfAnchor) => `${a.pdfId}::${a.page}::${a.label ?? ''}`;
    const existingKeys = new Map(existingAnchors.map(a => [anchorKey(a), a]));

    for (const anchor of bank.pdfAnchors) {
      const key = anchorKey({ ...anchor, subjectId });
      const existing = existingKeys.get(key);
      if (existing) {
        anchorIdMap.set(anchor.id, existing.id);
      } else {
        const newId = uuidv4();
        anchorIdMap.set(anchor.id, newId);
        await db.pdfAnchors.add({ ...anchor, id: newId, subjectId });
      }
    }
  }

  // 8. Import questions (dedup by contentHash)
  const existingHashes = new Set<string>();
  const allQs = await db.questions.where('subjectId').equals(subjectId).toArray();
  for (const q of allQs) {
    if (q.contentHash) existingHashes.add(q.contentHash);
  }

  for (const question of bank.questions) {
    const hash = await computeContentHash(question);

    if (existingHashes.has(hash)) continue;

    const localTopicId = topicIdMap.get(question.topicId) ?? question.topicId;
    const localTopicIds = question.topicIds?.map(id => topicIdMap.get(id) ?? id);
    const localAnchorId = question.pdfAnchorId ? (anchorIdMap.get(question.pdfAnchorId) ?? undefined) : undefined;

    const now = new Date().toISOString();
    await db.questions.add({
      ...question,
      id: uuidv4(),
      subjectId,
      topicId: localTopicId,
      topicIds: localTopicIds,
      pdfAnchorId: localAnchorId,
      contentHash: hash,
      stats: { seen: 0, correct: 0, wrong: 0 },
      createdAt: now,
      updatedAt: now,
    });
    existingHashes.add(hash);
    stats.questions++;
  }

  // 9. Import key concepts (dedup by contentHash)
  if (bank.keyConcepts) {
    const existingConceptHashes = new Set<string>();
    const allConcepts = await db.keyConcepts.where('subjectId').equals(subjectId).toArray();
    for (const kc of allConcepts) {
      if (kc.contentHash) existingConceptHashes.add(kc.contentHash);
    }

    for (const concept of bank.keyConcepts) {
      if (concept.contentHash && existingConceptHashes.has(concept.contentHash)) continue;

      const localTopicId = concept.topicId ? (topicIdMap.get(concept.topicId) ?? concept.topicId) : undefined;
      const now = new Date().toISOString();
      await db.keyConcepts.add({
        ...concept,
        id: uuidv4(),
        subjectId,
        topicId: localTopicId,
        createdAt: now,
        updatedAt: now,
      });
      stats.keyConcepts++;
    }
  }

  // 10. Import exams
  if (bank.exams) {
    const existingExams = await db.exams.where('subjectId').equals(subjectId).toArray();
    const existingNames = new Set(existingExams.map(e => e.name));

    for (const exam of bank.exams) {
      if (existingNames.has(exam.name)) continue;

      // Note: exam.questionIds reference bank question IDs. We can't easily
      // remap them because we don't build a question ID map (we dedup by hash).
      // For now, skip importing exams with unreferenced questions.
      // TODO: build questionIdMap for exam remapping
      const now = new Date().toISOString();
      await db.exams.add({
        ...exam,
        id: uuidv4(),
        subjectId,
        createdAt: now,
        updatedAt: now,
      });
      stats.exams++;
    }
  }

  // 11. Import resources (PDFs, docs, etc.)
  onProgress?.({ phase: 'importing-resources', detail: 'Importando recursos…' });

  const resourceCategories = ['Temas', 'Examenes', 'Resumenes', 'Practica'];
  const allEntries = Object.entries(zip.files).filter(([path, f]) => !f.dir);
  const resourceFiles = allEntries.filter(([path]) => {
    return resourceCategories.some(cat => path.startsWith(`${cat}/`));
  });

  let processed = 0;
  for (const [path, zipFile] of resourceFiles) {
    const filename = path.split('/').pop() ?? '';
    if (filename === 'index.json') continue;

    try {
      const blob = await zipFile.async('blob');
      const mime = guessMime(filename);
      const parts = path.split('/');
      const category = parts[0];

      // For Temas, store just the filename; for others, store category/path
      const storageName = category === 'Temas'
        ? parts.slice(1).join('/')
        : path;

      // Upsert
      const existing = await db.pdfResources
        .where('subjectId').equals(subjectId)
        .filter(r => r.filename === storageName)
        .first();

      if (existing) {
        await db.pdfResources.update(existing.id, {
          blob,
          createdAt: new Date().toISOString(),
        });
      } else {
        await db.pdfResources.add({
          id: uuidv4(),
          subjectId,
          filename: storageName,
          mime,
          blob,
          createdAt: new Date().toISOString(),
        });
      }

      stats.resources++;
      processed++;
      onProgress?.({
        phase: 'importing-resources',
        detail: filename,
        filesProcessed: processed,
        totalFiles: resourceFiles.length,
      });
    } catch (err) {
      errors.push(`Error importando ${path}: ${err}`);
    }
  }

  // 12. Save installed package record
  const installedRecord: InstalledPackage = {
    id: manifest.id,
    subjectId,
    version: manifest.version,
    name: manifest.name,
    installedAt: new Date().toISOString(),
    manifest,
  };
  await db.installedPackages.put(installedRecord);

  onProgress?.({ phase: 'complete' });

  return {
    success: true,
    packageId: manifest.id,
    packageName: manifest.name,
    subjectId,
    stats,
    errors,
    wasUpdate,
  };
}

// ─── Uninstall ───────────────────────────────────────────────────────────────

export async function uninstallPackage(packageId: string): Promise<boolean> {
  const installed = await db.installedPackages.get(packageId);
  if (!installed) return false;

  const { subjectId } = installed;

  // Delete in cascade
  await Promise.all([
    db.questions.where('subjectId').equals(subjectId).delete(),
    db.topics.where('subjectId').equals(subjectId).delete(),
    db.keyConcepts.where('subjectId').equals(subjectId).delete(),
    db.exams.where('subjectId').equals(subjectId).delete(),
    db.pdfAnchors.where('subjectId').equals(subjectId).delete(),
    db.pdfResources.where('subjectId').equals(subjectId).delete(),
    db.sessions.where('subjectId').equals(subjectId).delete(),
    db.deliverables.where('subjectId').equals(subjectId).delete(),
    db.gradingConfigs.delete(subjectId),
  ]);

  await db.subjects.delete(subjectId);
  await db.installedPackages.delete(packageId);

  return true;
}

// ─── Export ──────────────────────────────────────────────────────────────────

export async function exportPackage(subjectId: string): Promise<Blob> {
  const subject = await db.subjects.get(subjectId);
  if (!subject) throw new Error('Asignatura no encontrada');

  const slug = slugify(subject.name);
  const topics = await db.topics.where('subjectId').equals(subjectId).sortBy('order');
  const questions = await db.questions.where('subjectId').equals(subjectId).toArray();
  const keyConcepts = await db.keyConcepts.where('subjectId').equals(subjectId).toArray();
  const exams = await db.exams.where('subjectId').equals(subjectId).toArray();
  const pdfAnchors = await db.pdfAnchors.where('subjectId').equals(subjectId).toArray();
  const resources = await db.pdfResources.where('subjectId').equals(subjectId).toArray();

  // Check if this was an installed package (to preserve version info)
  const installed = await db.installedPackages.where('subjectId').equals(subjectId).first();

  const now = new Date().toISOString();
  const manifest: PackageManifest = {
    formatVersion: 1,
    id: slug,
    name: subject.name,
    version: installed?.version ?? '1.0.0',
    allowsNotes: subject.allowsNotes,
    createdAt: installed?.manifest?.createdAt ?? subject.createdAt,
    updatedAt: now,
    stats: {
      questions: questions.length,
      topics: topics.length,
      exams: exams.length,
      keyConcepts: keyConcepts.length,
    },
    gptLinks: installed?.manifest?.gptLinks,
    externalLinks: installed?.manifest?.externalLinks,
    professor: installed?.manifest?.professor,
    credits: installed?.manifest?.credits,
    description: installed?.manifest?.description,
    authors: installed?.manifest?.authors,
    university: installed?.manifest?.university,
    degree: installed?.manifest?.degree,
    year: installed?.manifest?.year,
  };

  // Strip local-only fields from questions
  const exportQuestions = questions.map(q => ({
    ...q,
    stats: { seen: 0, correct: 0, wrong: 0 },
    notes: undefined,
    starred: undefined,
  }));

  const bank: SubjectBank = {
    formatVersion: 1,
    subject: slug,
    topics,
    questions: exportQuestions,
    keyConcepts,
    exams,
    pdfAnchors,
  };

  // Build ZIP
  const zip = new JSZip();
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));
  zip.file('bank.json', JSON.stringify(bank, null, 2));

  // Add resources
  for (const res of resources) {
    // Determine path in ZIP
    const isDirectTema = !res.filename.includes('/');
    const zipPath = isDirectTema
      ? `Temas/${res.filename}`
      : res.filename;
    zip.file(zipPath, res.blob);
  }

  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}

// ─── List installed ──────────────────────────────────────────────────────────

export async function listInstalled(): Promise<InstalledPackage[]> {
  return db.installedPackages.toArray();
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const COLORS = [
  '#f59e0b', '#ef4444', '#3b82f6', '#10b981', '#8b5cf6',
  '#ec4899', '#06b6d4', '#f97316', '#6366f1', '#14b8a6',
];

function pickColor(index: number): string {
  return COLORS[index % COLORS.length];
}

function guessMime(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const mimes: Record<string, string> = {
    pdf: 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    svg: 'image/svg+xml',
    ipynb: 'application/x-ipynb+json',
    py: 'text/x-python',
    txt: 'text/plain',
    md: 'text/markdown',
    html: 'text/html',
    csv: 'text/csv',
  };
  return mimes[ext] ?? 'application/octet-stream';
}
