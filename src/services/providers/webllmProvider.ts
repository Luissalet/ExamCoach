/**
 * webllmProvider.ts
 *
 * Provider que usa WebLLM para ejecutar modelos de IA directamente
 * en el navegador (WebGPU). Gratuito, sin API key, totalmente local.
 *
 * NOTA: Requiere que el navegador soporte WebGPU (Chrome 121+, Edge 121+).
 * El primer uso descarga el modelo (~4GB para 8B), las siguientes ejecuciones
 * usan la caché del navegador.
 */

import { z } from 'zod';
import type { AIProvider, ExtractionParams, ExtractedQuestion } from '@/services/aiEngine';

// ─── Zod schema ──────────────────────────────────────────────────────────────

const ExtractedQuestionSchema = z.object({
  type: z.enum(['TEST', 'DESARROLLO', 'COMPLETAR', 'PRACTICO']),
  prompt: z.string().min(5),
  options: z.array(z.object({ id: z.string(), text: z.string() })).optional(),
  correctOptionIds: z.array(z.string()).optional(),
  modelAnswer: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  numericAnswer: z.string().optional(),
  clozeText: z.string().optional(),
  blanks: z.array(z.object({ id: z.string(), accepted: z.array(z.string()) })).optional(),
  explanation: z.string().optional(),
  difficulty: z.number().min(1).max(5).optional(),
  origin: z.enum(['test', 'examen_anterior', 'clase', 'alumno']).optional(),
  tags: z.array(z.string()).optional(),
  topicKey: z.string().optional(),
});

const ExtractedQuestionsArraySchema = z.array(ExtractedQuestionSchema);

// ─── Singleton engine cache ──────────────────────────────────────────────────

let cachedEngine: any = null;
let cachedModelId: string | null = null;

// ─── System prompt ──────────────────────────────────────────────────────────

function buildSystemPrompt(params: ExtractionParams): string {
  // Use contribution guide if available (better slugs reference)
  const guideSection = params.contributionGuide
    ? `\n\nGUÍA DE REFERENCIA DE LA ASIGNATURA:\n${params.contributionGuide}`
    : '';

  const topicList = params.topics
    .map((t) => `  - topicKey: "${t.topicKey}" → ${t.topicTitle}`)
    .join('\n');

  const modeInstruction =
    params.mode === 'generate'
      ? `TAREA: Genera ${params.maxQuestions ?? 10} preguntas de estudio basadas en el contenido. Varía los tipos (TEST, DESARROLLO, COMPLETAR, PRACTICO) y dificultades (1-5).`
      : `TAREA: Extrae TODAS las preguntas del documento. Mantén el texto original fielmente.`;

  const originHint =
    params.mode === 'generate' ? '"alumno"' : '"examen_anterior" o "test"';

  // Prompt más conciso para modelos pequeños locales
  return `Eres un extractor de preguntas educativas. Devuelves SOLO un JSON array.

ASIGNATURA: ${params.subjectName} (subjectKey: "${params.subjectKey}")

TEMAS VÁLIDOS:
${topicList}

${modeInstruction}

Formato: JSON array sin markdown fences. Cada pregunta:
{"type":"TEST","prompt":"...","options":[{"id":"a","text":"..."}],"correctOptionIds":["a"],"explanation":"...","difficulty":3,"origin":${originHint},"tags":["..."],"topicKey":"slug"}

Tipos: TEST (options+correctOptionIds), DESARROLLO (modelAnswer+keywords), COMPLETAR (clozeText con {{huecos}}+blanks), PRACTICO (numericAnswer+modelAnswer).
IDs opciones: "a","b","c","d". Blanks: "b1","b2". difficulty: 1-5. topicKey de la lista.${guideSection}

RESPONDE SOLO CON EL JSON ARRAY:`;
}

// ─── WebLLM Provider ─────────────────────────────────────────────────────────

export class WebLLMProvider implements AIProvider {
  name = 'WebLLM (Local)';

  constructor(private model: string = 'Llama-3.1-8B-Instruct-q4f16_1-MLC') {}

  async extractQuestions(params: ExtractionParams): Promise<ExtractedQuestion[]> {
    // Check WebGPU support
    if (!('gpu' in navigator)) {
      throw new Error(
        'Tu navegador no soporta WebGPU, necesario para ejecutar modelos locales. ' +
        'Usa Chrome 121+ o Edge 121+. Alternativamente, configura un provider de API (OpenAI/Anthropic).'
      );
    }

    // Dynamic import of @mlc-ai/web-llm — use variable to avoid Rollup static analysis
    let webllm: any;
    const mlcPkg = '@mlc-ai/web-llm';
    try {
      webllm = await import(/* @vite-ignore */ mlcPkg);
    } catch {
      throw new Error(
        'La librería WebLLM no está instalada. ' +
        'Ejecuta: npm install @mlc-ai/web-llm\n\n' +
        'Nota: WebLLM requiere ~4GB de descarga la primera vez para el modelo. ' +
        'Las siguientes ejecuciones usan la caché del navegador.'
      );
    }

    // Reuse or create engine
    if (!cachedEngine || cachedModelId !== this.model) {
      try {
        cachedEngine = await webllm.CreateMLCEngine(this.model, {
          initProgressCallback: (progress: any) => {
            console.log(`[WebLLM] ${progress.text}`);
          },
        });
        cachedModelId = this.model;
      } catch (err: any) {
        cachedEngine = null;
        cachedModelId = null;
        throw new Error(
          `Error cargando modelo ${this.model}: ${err?.message ?? err}. ` +
          'Asegúrate de tener conexión a internet para la primera descarga.'
        );
      }
    }

    const systemPrompt = buildSystemPrompt(params);

    // Truncate more aggressively for local models (smaller context windows)
    const maxChars = 8000; // ~2000 tokens, safe for 8B models
    let userContent: string;

    if (params.imageBase64) {
      throw new Error(
        'Los modelos locales (WebLLM) no soportan análisis de imágenes. ' +
        'Usa un provider de API (OpenAI/Anthropic) para archivos de imagen.'
      );
    }

    const textTruncated = params.documentText.slice(0, maxChars);
    userContent = `Documento:\n\n${textTruncated}\n\nDevuelve SOLO el JSON array:`;

    const response = await cachedEngine.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      temperature: 0.3,
      max_tokens: 8000,
    });

    const content: string = response.choices?.[0]?.message?.content ?? '';
    return parseAndValidateQuestions(content);
  }
}

// ─── Response parsing ────────────────────────────────────────────────────────

function parseAndValidateQuestions(raw: string): ExtractedQuestion[] {
  let cleaned = raw.trim();
  if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
  else if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
  if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
  cleaned = cleaned.trim();

  const startIdx = cleaned.indexOf('[');
  const endIdx = cleaned.lastIndexOf(']');
  if (startIdx === -1 || endIdx === -1) {
    throw new Error(
      'El modelo local no devolvió un JSON array válido. ' +
      'Los modelos pequeños a veces tienen dificultades con output estructurado. ' +
      'Prueba con un documento más corto o usa un provider de API.'
    );
  }
  cleaned = cleaned.slice(startIdx, endIdx + 1);

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(
      'Error parseando JSON del modelo local. ' +
      'Intenta de nuevo o usa un provider de API para mejores resultados.'
    );
  }

  const result = ExtractedQuestionsArraySchema.safeParse(parsed);
  if (!result.success) {
    if (Array.isArray(parsed)) {
      const salvaged: ExtractedQuestion[] = [];
      for (const item of parsed) {
        const single = ExtractedQuestionSchema.safeParse(item);
        if (single.success) salvaged.push(single.data as ExtractedQuestion);
      }
      if (salvaged.length > 0) return salvaged;
    }
    throw new Error(`Formato inválido del modelo local: ${result.error.message.slice(0, 200)}`);
  }

  return result.data as ExtractedQuestion[];
}
