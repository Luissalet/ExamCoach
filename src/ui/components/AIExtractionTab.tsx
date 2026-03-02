/**
 * AIExtractionTab.tsx
 *
 * Pestaña "IA" en SubjectView. Permite subir archivos y extraer/generar
 * preguntas usando un modelo de IA (OpenAI o Anthropic).
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button, Progress } from './index';
import { AISettingsPanel } from './AISettingsPanel';
import { AIReviewModal, type AcceptedQuestion } from './AIReviewModal';
import {
  getActiveProvider,
  extractFileContent,
  type ExtractedQuestion,
  type ExtractionMode,
} from '@/services/aiEngine';
import { generateSubjectGuide } from '@/services/generateSubjectGuide';
import { getSettings } from '@/data/db';
import { slugify } from '@/domain/normalize';
import type { Topic, Question, Subject } from '@/domain/models';
import { useStore } from '@/ui/store';

// ─── Props ───────────────────────────────────────────────────────────────────

interface AIExtractionTabProps {
  subject: Subject;
  topics: Topic[];
}

// ─── Accepted file extensions ────────────────────────────────────────────────

const ACCEPT = '.pdf,.docx,.txt,.md,.markdown,.jpg,.jpeg,.png,.webp';

// ─── Component ───────────────────────────────────────────────────────────────

export function AIExtractionTab({ subject, topics }: AIExtractionTabProps) {
  const { createQuestion, loadQuestions } = useStore();

  // State
  const [mode, setMode] = useState<ExtractionMode>('extract');
  const [file, setFile] = useState<File | null>(null);
  const [selectedTopicId, setSelectedTopicId] = useState<string>(topics[0]?.id ?? '');
  const [maxQuestions, setMaxQuestions] = useState(20);
  const [extracting, setExtracting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');
  const [error, setError] = useState<string | null>(null);

  // AI config
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  // Review modal
  const [extractedQuestions, setExtractedQuestions] = useState<ExtractedQuestion[]>([]);
  const [showReview, setShowReview] = useState(false);

  // Drag & drop
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Check API key on mount
  useEffect(() => {
    checkApiKey();
  }, []);

  const checkApiKey = async () => {
    const settings = await getSettings();
    const ai = settings.aiSettings;
    if (!ai) {
      setHasApiKey(false);
      return;
    }
    if (ai.provider === 'openai' && ai.openaiApiKey) setHasApiKey(true);
    else if (ai.provider === 'anthropic' && ai.anthropicApiKey) setHasApiKey(true);
    else if (ai.provider === 'webllm') setHasApiKey(true); // No API key needed
    else setHasApiKey(false);
  };

  // ── File selection ──

  const handleFileSelect = useCallback((f: File) => {
    setFile(f);
    setError(null);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const f = e.dataTransfer.files[0];
      if (f) handleFileSelect(f);
    },
    [handleFileSelect],
  );

  // ── Extract questions ──

  const handleExtract = async () => {
    if (!file) return;

    setExtracting(true);
    setError(null);
    setProgress(0);
    setProgressLabel('Extrayendo texto del archivo...');

    try {
      // Step 1: Extract text from file
      const { text, imageBase64, fileType } = await extractFileContent(file, (p) => {
        setProgress(p * 0.3); // 0-30% for file extraction
      });

      if (!text.trim() && !imageBase64) {
        throw new Error('No se pudo extraer texto del archivo. ¿Está vacío o es un PDF escaneado sin OCR?');
      }

      setProgress(0.3);
      setProgressLabel('Generando guía de referencia...');

      // Step 2: Generate contribution guide for this subject (exact slugs)
      const contributionGuide = await generateSubjectGuide(subject.id);

      setProgress(0.35);
      setProgressLabel('Enviando a la IA...');

      // Step 3: Get AI provider
      const provider = await getActiveProvider();

      // Step 4: Build topic list
      const topicList = topics.map((t) => ({
        topicKey: slugify(t.title),
        topicTitle: t.title,
      }));

      setProgress(0.4);
      setProgressLabel(
        mode === 'generate'
          ? 'Generando preguntas nuevas...'
          : 'Extrayendo preguntas del documento...',
      );

      // Step 5: Call AI with contribution guide embedded
      const extracted = await provider.extractQuestions({
        documentText: text,
        subjectKey: slugify(subject.name),
        subjectName: subject.name,
        topics: topicList,
        mode,
        maxQuestions,
        imageBase64,
        contributionGuide,
      });

      setProgress(1);
      setProgressLabel(`${extracted.length} preguntas encontradas`);

      if (extracted.length === 0) {
        setError('La IA no encontró preguntas en el documento. Prueba con otro archivo o cambia el modo.');
        return;
      }

      // Step 5: Show review modal
      setExtractedQuestions(extracted);
      setShowReview(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setExtracting(false);
    }
  };

  // ── Import accepted questions ──

  const handleImport = async (accepted: AcceptedQuestion[]) => {
    let imported = 0;

    for (const { question: q, topicId } of accepted) {
      try {
        const newQuestion: Omit<Question, 'id' | 'createdAt' | 'updatedAt' | 'contentHash'> = {
          subjectId: subject.id,
          topicId,
          type: q.type,
          prompt: q.prompt,
          explanation: q.explanation,
          difficulty: q.difficulty as Question['difficulty'],
          tags: q.tags,
          origin: q.origin ?? (mode === 'generate' ? 'alumno' : 'examen_anterior'),
          options: q.options,
          correctOptionIds: q.correctOptionIds,
          modelAnswer: q.modelAnswer,
          keywords: q.keywords,
          numericAnswer: q.numericAnswer,
          clozeText: q.clozeText,
          blanks: q.blanks,
          createdBy: 'IA',
          stats: { seen: 0, correct: 0, wrong: 0 },
        };

        await createQuestion(newQuestion);
        imported++;
      } catch (err) {
        console.error('Error importing question:', err);
      }
    }

    // Refresh questions list
    await loadQuestions(subject.id);

    setShowReview(false);
    setFile(null);
    setExtractedQuestions([]);
    setError(null);
    setProgressLabel(`${imported} preguntas importadas correctamente`);
    setProgress(0);

    // Clear success message after 5s
    setTimeout(() => setProgressLabel(''), 5000);
  };

  // ── Render ──

  const subjectKey = slugify(subject.name);

  return (
    <div className="flex flex-col gap-5">
      {/* ── API key banner ── */}
      {hasApiKey === false && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm text-amber-300 font-medium">Configuración necesaria</p>
            <p className="text-xs text-ink-400 mt-0.5">
              Configura un proveedor de IA: OpenAI/Anthropic (con API key) o WebLLM (gratuito, local en tu navegador).
            </p>
          </div>
          <Button size="sm" onClick={() => setShowSettings(true)}>
            Configurar
          </Button>
        </div>
      )}

      {/* ── Mode selector ── */}
      <div className="flex gap-2">
        <button
          onClick={() => setMode('extract')}
          className={`flex-1 rounded-lg px-4 py-3 text-sm text-left border transition-colors ${
            mode === 'extract'
              ? 'border-amber-500/50 bg-amber-500/10 text-amber-300'
              : 'border-ink-700 bg-ink-900 text-ink-400 hover:border-ink-600'
          }`}
        >
          <span className="text-base block mb-1">Extraer preguntas</span>
          <span className="text-xs opacity-70">
            Sube un examen o test y extrae las preguntas que ya contiene
          </span>
        </button>
        <button
          onClick={() => setMode('generate')}
          className={`flex-1 rounded-lg px-4 py-3 text-sm text-left border transition-colors ${
            mode === 'generate'
              ? 'border-amber-500/50 bg-amber-500/10 text-amber-300'
              : 'border-ink-700 bg-ink-900 text-ink-400 hover:border-ink-600'
          }`}
        >
          <span className="text-base block mb-1">Generar nuevas</span>
          <span className="text-xs opacity-70">
            Sube apuntes o un tema y genera preguntas de estudio automáticamente
          </span>
        </button>
      </div>

      {/* ── File upload zone ── */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`flex flex-col items-center gap-3 border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
          dragging
            ? 'border-amber-500 bg-amber-500/10'
            : file
              ? 'border-sage-600/50 bg-sage-900/10'
              : 'border-ink-700 hover:border-ink-500 bg-ink-900/50'
        }`}
      >
        <span className="text-3xl">{file ? '✓' : '📄'}</span>
        {file ? (
          <>
            <span className="text-sm text-sage-300 font-medium">{file.name}</span>
            <span className="text-xs text-ink-500">
              {(file.size / 1024).toFixed(0)} KB — Click para cambiar
            </span>
          </>
        ) : (
          <>
            <span className="text-sm text-ink-300">
              Arrastra un archivo aquí o haz click para seleccionar
            </span>
            <span className="text-xs text-ink-500">
              PDF, DOCX, TXT, MD, JPG, PNG
            </span>
          </>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPT}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFileSelect(f);
            e.target.value = '';
          }}
          className="hidden"
        />
      </div>

      {/* ── Options row ── */}
      <div className="grid grid-cols-2 gap-4">
        {/* Topic selector — solo visible en modo generar (en extraer se detecta por pregunta) */}
        {mode === 'generate' && (
          <div>
            <label className="text-xs text-ink-400 uppercase tracking-widest block mb-1">
              Tema principal
            </label>
            <select
              value={selectedTopicId}
              onChange={(e) => setSelectedTopicId(e.target.value)}
              className="w-full bg-ink-800 border border-ink-700 rounded-lg px-3 py-2 text-sm text-ink-100 focus:ring-2 focus:ring-amber-500 focus:border-transparent"
            >
              {topics.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
            <p className="text-xs text-ink-500 mt-1">
              Puedes reasignar temas individualmente en el modal de revisión
            </p>
          </div>
        )}

        {mode === 'extract' && (
          <div>
            <p className="text-xs text-ink-500 mt-1 col-span-1">
              La IA detectará automáticamente el tema de cada pregunta. Podrás revisarlos y reasignar en el modal.
            </p>
          </div>
        )}

        {/* Max questions (only for generate mode) */}
        {mode === 'generate' && (
          <div>
            <label className="text-xs text-ink-400 uppercase tracking-widest block mb-1">
              Cantidad de preguntas
            </label>
            <select
              value={maxQuestions}
              onChange={(e) => setMaxQuestions(Number(e.target.value))}
              className="w-full bg-ink-800 border border-ink-700 rounded-lg px-3 py-2 text-sm text-ink-100 focus:ring-2 focus:ring-amber-500 focus:border-transparent"
            >
              <option value={5}>5 preguntas</option>
              <option value={10}>10 preguntas</option>
              <option value={20}>20 preguntas</option>
              <option value={30}>30 preguntas</option>
              <option value={50}>50 preguntas</option>
            </select>
          </div>
        )}
      </div>

      {/* ── Progress ── */}
      {extracting && (
        <div className="flex flex-col gap-2">
          <Progress value={progress} max={1} />
          <p className="text-xs text-ink-400 text-center">{progressLabel}</p>
        </div>
      )}

      {/* ── Error ── */}
      {error && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-lg px-4 py-3 text-sm text-rose-300">
          {error}
        </div>
      )}

      {/* ── Success message ── */}
      {!extracting && !error && progressLabel && (
        <div className="bg-sage-500/10 border border-sage-500/30 rounded-lg px-4 py-3 text-sm text-sage-300">
          {progressLabel}
        </div>
      )}

      {/* ── Extract button ── */}
      <Button
        onClick={handleExtract}
        disabled={!file || hasApiKey === false || extracting}
        loading={extracting}
      >
        {extracting
          ? 'Procesando...'
          : mode === 'generate'
            ? `Generar ${maxQuestions} preguntas`
            : 'Extraer preguntas del documento'}
      </Button>

      {/* ── Settings gear ── */}
      {hasApiKey && (
        <button
          onClick={() => setShowSettings(true)}
          className="text-xs text-ink-500 hover:text-ink-300 self-end"
        >
          Cambiar configuración de IA
        </button>
      )}

      {/* ── Settings modal ── */}
      <AISettingsPanel
        open={showSettings}
        onClose={() => setShowSettings(false)}
        onSaved={() => {
          setShowSettings(false);
          checkApiKey();
        }}
      />

      {/* ── Review modal ── */}
      <AIReviewModal
        open={showReview}
        questions={extractedQuestions}
        topics={topics}
        sourceFileName={file?.name ?? ''}
        mode={mode}
        onImport={handleImport}
        onCancel={() => {
          setShowReview(false);
          setExtractedQuestions([]);
        }}
      />
    </div>
  );
}
