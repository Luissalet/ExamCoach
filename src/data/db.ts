import Dexie, { type Table } from 'dexie';
import type {
  Subject,
  Topic,
  Question,
  PracticeSession,
  PdfResource,
  PdfAnchor,
  AppSettings,
} from '@/domain/models';

export class StudyDB extends Dexie {
  subjects!: Table<Subject, string>;
  topics!: Table<Topic, string>;
  questions!: Table<Question, string>;
  sessions!: Table<PracticeSession, string>;
  pdfResources!: Table<PdfResource, string>;
  pdfAnchors!: Table<PdfAnchor, string>;
  settings!: Table<AppSettings & { id: string }, string>;

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