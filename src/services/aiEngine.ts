/**
 * aiEngine.ts
 *
 * Abstracción del motor de IA para extracción/generación de preguntas.
 * Soporta múltiples providers (OpenAI, Anthropic) con una interfaz común.
 */

import type { QuestionType, QuestionOption, ClozeBlank, DifficultyLevel, QuestionOrigin, AISettings } from '@/domain/models';
import { getSettings } from '@/data/db';
import { extractPdfText } from '@/utils/pdfTextExtractor';
import mammoth from 'mammoth';

// ─── Extracted Question (formato intermedio antes de guardar) ─────────────────

export interface ExtractedQuestion {
  type: QuestionType;
  prompt: string;
  options?: QuestionOption[];
  correctOptionIds?: string[];
  modelAnswer?: string;
  keywords?: string[];
  numericAnswer?: string;
  clozeText?: string;
  blanks?: ClozeBlank[];
  explanation?: string;
  difficulty?: DifficultyLevel;
  origin?: QuestionOrigin;
  tags?: string[];
  topicKey?: string;
}

// ─── AI Provider interface ───────────────────────────────────────────────────

export type ExtractionMode = 'generate' | 'extract';

export interface ExtractionParams {
  /** Texto del documento fuente */
  documentText: string;
  /** Slug de la asignatura */
  subjectKey: string;
  /** Nombre de la asignatura */
  subjectName: string;
  /** Topics disponibles con sus slugs */
  topics: { topicKey: string; topicTitle: string }[];
  /** Generar nuevas vs extraer existentes */
  mode: ExtractionMode;
  /** Número máximo de preguntas */
  maxQuestions?: number;
  /** Imagen en base64 (para archivos de imagen) */
  imageBase64?: string;
  /** Guía de contribución generada para la asignatura actual (slugs exactos) */
  contributionGuide?: string;
}

export interface AIProvider {
  name: string;
  extractQuestions(params: ExtractionParams): Promise<ExtractedQuestion[]>;
}

// ─── Provider factory ────────────────────────────────────────────────────────

export async function getActiveProvider(): Promise<AIProvider> {
  const settings = await getSettings();
  const ai = settings.aiSettings;

  if (!ai) {
    throw new Error('No hay configuración de IA. Ve a la pestaña IA y configura tu API key.');
  }

  if (ai.provider === 'openai') {
    if (!ai.openaiApiKey) throw new Error('Falta la API key de OpenAI.');
    const { OpenAIProvider } = await import('@/services/providers/openaiProvider');
    return new OpenAIProvider(ai.openaiApiKey, ai.openaiModel ?? 'gpt-4o-mini');
  }

  if (ai.provider === 'anthropic') {
    if (!ai.anthropicApiKey) throw new Error('Falta la API key de Anthropic.');
    const { AnthropicProvider } = await import('@/services/providers/anthropicProvider');
    return new AnthropicProvider(ai.anthropicApiKey, ai.anthropicModel ?? 'claude-sonnet-4-5-20250929');
  }

  if (ai.provider === 'webllm') {
    const { WebLLMProvider } = await import('@/services/providers/webllmProvider');
    return new WebLLMProvider(ai.webllmModel ?? 'Llama-3.1-8B-Instruct-q4f16_1-MLC');
  }

  throw new Error(`Provider desconocido: ${ai.provider}`);
}

// ─── File text extraction ────────────────────────────────────────────────────

export interface FileExtractionResult {
  text: string;
  imageBase64?: string;
  fileType: 'pdf' | 'docx' | 'txt' | 'md' | 'image';
}

export async function extractFileContent(
  file: File,
  onProgress?: (p: number) => void,
): Promise<FileExtractionResult> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const mime = file.type;

  // PDF
  if (ext === 'pdf' || mime === 'application/pdf') {
    const url = URL.createObjectURL(file);
    try {
      const result = await extractPdfText(url, { onProgress });
      const text = result.blocks.map((b) => b.text).join('\n\n');
      return { text, fileType: 'pdf' };
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  // DOCX
  if (ext === 'docx' || mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    onProgress?.(1);
    return { text: result.value, fileType: 'docx' };
  }

  // Markdown / Plain text
  if (['txt', 'md', 'markdown'].includes(ext) || mime.startsWith('text/')) {
    const text = await file.text();
    onProgress?.(1);
    return { text, fileType: ext === 'md' || ext === 'markdown' ? 'md' : 'txt' };
  }

  // Images — convert to base64 for vision API
  if (mime.startsWith('image/')) {
    const arrayBuffer = await file.arrayBuffer();
    const base64 = btoa(
      new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), ''),
    );
    onProgress?.(1);
    return {
      text: '[Imagen subida — se enviará a la API de visión para extracción]',
      imageBase64: `data:${mime};base64,${base64}`,
      fileType: 'image',
    };
  }

  throw new Error(`Formato de archivo no soportado: .${ext} (${mime})`);
}
