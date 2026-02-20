// ─── Core types ──────────────────────────────────────────────────────────────

export type QuestionType = 'TEST' | 'DESARROLLO' | 'COMPLETAR' | 'PRACTICO';
export type DifficultyLevel = 1 | 2 | 3 | 4 | 5;

/**
 * ITER2 — Origen de la pregunta: de dónde fue extraída.
 * - test: de un test/examen de práctica
 * - examen_anterior: de un examen oficial de años anteriores
 * - clase: pregunta planteada durante clase
 * - alumno: aportada directamente por un alumno
 */
export type QuestionOrigin = 'test' | 'examen_anterior' | 'clase' | 'alumno';

// ─── Entities ─────────────────────────────────────────────────────────────────

export interface Subject {
  id: string;
  name: string;
  color?: string;
  icon?: string;
  /**
   * Fecha de examen personal — NUNCA se exporta al banco global ni se importa
   * desde él. Cada usuario la configura localmente.
   */
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
  /** Nombre del archivo PDF asociado a este tema (de resources/[slug]/Temas/) */
  pdfFilename?: string;
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
  /**
   * ITER3 — Temas adicionales. Una pregunta puede abarcar varios temas.
   * topicId sigue siendo el tema principal (para backward-compat e indexación).
   * topicIds incluye TODOS los temas (incluido topicId) cuando hay más de uno.
   */
  topicIds?: string[];
  type: QuestionType;
  prompt: string;
  explanation?: string;
  difficulty?: DifficultyLevel;
  tags?: string[];

  /** ITER2 — Origen de la pregunta (dónde fue extraída). */
  origin?: QuestionOrigin;

  // TEST
  options?: QuestionOption[];
  correctOptionIds?: string[];

  // DESARROLLO / PRACTICO
  modelAnswer?: string;
  keywords?: string[];
  /** ITER3 — Resultado numérico esperado (para preguntas de tipo PRACTICO). */
  numericAnswer?: string;

  // COMPLETAR
  clozeText?: string;
  blanks?: ClozeBlank[];

  // PDF anchor
  pdfAnchorId?: string;

  /**
   * @deprecated — Imágenes antiguas adjuntas como base64 data URIs.
   * Las nuevas imágenes van inline en el markdown del prompt como
   * ![alt](question-images/uuid.ext) y se gestionan via questionImageStorage.
   */
  imageDataUrls?: string[];

  // Contribution metadata
  createdBy?: string;
  sourcePackId?: string;
  contentHash?: string;

  stats: QuestionStats;
  createdAt: string;
  updatedAt: string;
}

// ─── Question Images ──────────────────────────────────────────────────────────

/**
 * Registro de imagen de pregunta en IndexedDB.
 * Las imágenes se referencian en markdown como: ![alt](question-images/filename)
 */
export interface QuestionImageRecord {
  /** UUID (sin extensión) — clave primaria */
  id: string;
  /** "uuid.ext" — filename como aparece en la ruta question-images/ */
  filename: string;
  blob: Blob;
  mimeType: string;
  createdAt: string;
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
  mime: string;
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

// ─── ITER2: Recursos estáticos del repo ───────────────────────────────────────
//
// Los PDFs de temas se guardan en resources/[slug-asignatura]/Temas/*.pdf
// El JSON de info extra vive en resources/[slug-asignatura]/extra_info.json
// Esto permite commitearlos a GitHub y servirlos como assets estáticos.

export interface SubjectExtraInfo {
  /** Si la asignatura permite llevar apuntes/chuleta al examen. */
  allowsNotes?: boolean;
  /** Nombre del profesor/a. */
  professor?: string;
  /** Créditos ECTS de la asignatura. */
  credits?: number;
  /** Descripción libre. */
  description?: string;
  /**
   * Lista de nombres de archivo PDF disponibles en resources/[slug]/Temas/.
   * Ej: ["Tema1.pdf", "Tema2.pdf"]
   */
  pdfs?: string[];
  /** ITER3 — Enlaces externos útiles (webs de consulta, apps de ayuda). */
  externalLinks?: ExternalLink[];
}

// ─── ITER3: Enlaces externos útiles ──────────────────────────────────────────

export interface ExternalLink {
  name: string;
  url: string;
  icon?: string; // URL del favicon o emoji
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
  topicKeys?: string[]; // ITER3 — temas adicionales
  type: QuestionType;
  prompt: string;
  options?: QuestionOption[];
  correctOptionIds?: string[];
  modelAnswer?: string;
  keywords?: string[];
  numericAnswer?: string; // ITER3 — resultado numérico (PRACTICO)
  clozeText?: string;
  blanks?: ClozeBlank[];
  explanation?: string;
  difficulty?: DifficultyLevel;
  tags?: string[];
  origin?: QuestionOrigin;
  pdfAnchor?: { page: number; label?: string };
  createdBy?: string;
  contentHash?: string;
  /** @deprecated — usar imágenes inline en markdown */
  imageDataUrls?: string[];
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
  /**
   * Imágenes inline referenciadas en el markdown de las preguntas.
   * Mapa de { "uuid.ext" → "base64" }.
   * Al importar, se guardan en IndexedDB y se intentan escribir en
   * public/question-images/ via dev server.
   */
  questionImages?: Record<string, string>;
}

// ─── Settings ─────────────────────────────────────────────────────────────────

export interface AppSettings {
  alias: string;
  importedPackIds: string[];
  /**
   * ISO timestamp de la última vez que se sincronizó con el banco global.
   * Si es undefined, nunca se ha sincronizado.
   */
  globalBankSyncedAt?: string;
}