import Dexie, { type Table } from 'dexie';
import type {
  Subject,
  Topic,
  Question,
  PracticeSession,
  PdfResource,
  PdfAnchor,
  AppSettings,
  QuestionImageRecord,
  Deliverable,
  SubjectGradingConfig,
} from '@/domain/models';

export class StudyDB extends Dexie {
  subjects!: Table<Subject, string>;
  topics!: Table<Topic, string>;
  questions!: Table<Question, string>;
  sessions!: Table<PracticeSession, string>;
  pdfResources!: Table<PdfResource, string>;
  pdfAnchors!: Table<PdfAnchor, string>;
  settings!: Table<AppSettings & { id: string }, string>;
  questionImages!: Table<QuestionImageRecord, string>;
  deliverables!: Table<Deliverable, string>;
  gradingConfigs!: Table<SubjectGradingConfig, string>;

  constructor() {
    super('StudyAppDB');

    this.version(1).stores({
      subjects: 'id, name, examDate, createdAt',
      topics: 'id, subjectId, order, createdAt',
      questions:
        'id, subjectId, topicId, type, difficulty, contentHash, createdAt',
      sessions: 'id, subjectId, mode, createdAt',
      pdfResources: 'id, subjectId, createdAt',
      pdfAnchors: 'id, subjectId, pdfId',
      settings: 'id',
    });

    // v2: question images (inline en markdown)
    this.version(2).stores({
      subjects: 'id, name, examDate, createdAt',
      topics: 'id, subjectId, order, createdAt',
      questions:
        'id, subjectId, topicId, type, difficulty, contentHash, createdAt',
      sessions: 'id, subjectId, mode, createdAt',
      pdfResources: 'id, subjectId, createdAt',
      pdfAnchors: 'id, subjectId, pdfId',
      settings: 'id',
      questionImages: 'id, filename, createdAt',
    });

    // v3: deliverables + grading configs (local, never synced to global bank)
    this.version(3).stores({
      subjects: 'id, name, examDate, createdAt',
      topics: 'id, subjectId, order, createdAt',
      questions:
        'id, subjectId, topicId, type, difficulty, contentHash, createdAt',
      sessions: 'id, subjectId, mode, createdAt',
      pdfResources: 'id, subjectId, createdAt',
      pdfAnchors: 'id, subjectId, pdfId',
      settings: 'id',
      questionImages: 'id, filename, createdAt',
      deliverables: 'id, subjectId, type, dueDate, completed, createdAt',
      gradingConfigs: 'id',
    });
  }
}

export const db = new StudyDB();

// Settings helpers
const SETTINGS_ID = 'global';

export async function getSettings(): Promise<AppSettings> {
  const row = await db.settings.get(SETTINGS_ID);
  return row ?? { alias: '', importedPackIds: [] };
}

export async function saveSettings(settings: Partial<AppSettings>): Promise<void> {
  const current = await getSettings();
  await db.settings.put({ ...current, ...settings, id: SETTINGS_ID });
}