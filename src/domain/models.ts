// ─── Core types ──────────────────────────────────────────────────────────────

export type QuestionType = 'TEST' | 'DESARROLLO' | 'COMPLETAR';
export type DifficultyLevel = 1 | 2 | 3 | 4 | 5;

// ─── Entities ─────────────────────────────────────────────────────────────────

export interface Subject {
  id: string;
  name: string;
  color?: string;
  icon?: string;
  examDate?: string; // ISO YYYY-MM-DD
  createdAt: string;
  updatedAt: string;
}

export interface Topic {
  id: string;
  subjectId: string;
  title: string;
  order: number;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface QuestionOption {
  id: string;
  text: string;
}

export interface ClozeBlank {
  id: string;
  accepted: string[]; // accepted answers (normalized at check time)
}

export interface QuestionStats {
  seen: number;
  correct: number;
  wrong: number;
  lastSeenAt?: string;
  lastResult?: 'CORRECT' | 'WRONG';
}

export interface Question {
  id: string;
  subjectId: string;
  topicId: string;
  type: QuestionType;
  prompt: string;
  explanation?: string;
  difficulty?: DifficultyLevel;
  tags?: string[];

  // TEST
  options?: QuestionOption[];
  correctOptionIds?: string[];

  // DESARROLLO
  modelAnswer?: string;
  keywords?: string[];

  // COMPLETAR
  clozeText?: string;
  blanks?: ClozeBlank[];

  // PDF anchor
  pdfAnchorId?: string;

  // Contribution metadata
  createdBy?: string;
  sourcePackId?: string;
  contentHash?: string;

  stats: QuestionStats;
  createdAt: string;
  updatedAt: string;
}

// ─── Sessions ─────────────────────────────────────────────────────────────────

export type SessionMode = 'random' | 'all' | 'failed' | 'topic' | 'smart';

export interface UserAnswer {
  questionId: string;
  // TEST: selected option IDs
  selectedOptionIds?: string[];
  // DESARROLLO: free text
  freeText?: string;
  // COMPLETAR: map blank id -> answer text
  blankAnswers?: Record<string, string>;
  // Manual override for DESARROLLO
  manualResult?: 'CORRECT' | 'WRONG';
  // Auto-computed result (null for DESARROLLO before manual)
  result?: 'CORRECT' | 'WRONG' | null;
  answeredAt: string;
}

export interface PracticeSession {
  id: string;
  subjectId: string;
  mode: SessionMode;
  topicId?: string; // if mode === 'topic'
  createdAt: string;
  finishedAt?: string;
  questionIds: string[];
  answers: UserAnswer[];
}

// ─── PDF ──────────────────────────────────────────────────────────────────────

export interface PdfResource {
  id: string;
  subjectId: string;
  filename: string;
  mime: 'application/pdf';
  blob: Blob;
  createdAt: string;
}

export interface PdfAnchor {
  id: string;
  subjectId: string;
  pdfId: string;
  page: number;
  bbox?: { x: number; y: number; w: number; h: number };
  label?: string;
}

// ─── Export formats ───────────────────────────────────────────────────────────

export interface BankExport {
  version: 1;
  kind: 'bank';
  exportedAt: string;
  subjects: Subject[];
  topics: Topic[];
  questions: Question[];
  pdfAnchors: PdfAnchor[];
}

export interface ContributionQuestion {
  id: string;
  subjectKey: string;
  topicKey: string;
  type: QuestionType;
  prompt: string;
  options?: QuestionOption[];
  correctOptionIds?: string[];
  modelAnswer?: string;
  keywords?: string[];
  clozeText?: string;
  blanks?: ClozeBlank[];
  explanation?: string;
  difficulty?: DifficultyLevel;
  tags?: string[];
  pdfAnchor?: { page: number; label?: string };
  createdBy?: string;
  contentHash?: string;
}

export interface ContributionTarget {
  subjectKey: string;
  subjectName: string;
  topics: { topicKey: string; topicTitle: string }[];
}

export interface ContributionPack {
  version: 1;
  kind: 'contribution';
  packId: string;
  createdBy: string;
  exportedAt: string;
  targets: ContributionTarget[];
  questions: ContributionQuestion[];
}

// ─── Settings ─────────────────────────────────────────────────────────────────

export interface AppSettings {
  alias: string;
  importedPackIds: string[];
}
