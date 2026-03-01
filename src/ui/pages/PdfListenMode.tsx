/**
 * PdfListenMode.tsx
 *
 * Página completa del modo escucha de PDFs.
 * Soporta dos modos:
 *   1. Temas: /subject/:subjectId/listen/:topicId
 *   2. Recursos (resúmenes, etc.): /subject/:subjectId/listen-resource?file=Resumenes/archivo.pdf
 *
 * Muestra texto extraído con highlighting del bloque actual + controles TTS.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { db } from '@/data/db';
import { subjectRepo } from '@/data/repos';
import { EmptyState } from '@/ui/components';
import { TtsControls } from '@/ui/components/TtsControls';
import { extractPdfText, type TextBlock } from '@/utils/pdfTextExtractor';
import { mathToSpeech } from '@/utils/mathSymbolSpeech';
import { createTtsEngine, type TtsEngine, type TtsState, type TtsVoiceInfo } from '@/utils/ttsEngine';
import { getPdfBlobUrl } from '@/data/pdfStorage';
import { getResourceBlobUrl } from '@/data/resourceFromDB';
import { getPdfUrl, resourcesUrl } from '@/data/resourceLoader';
import { slugify } from '@/domain/normalize';
import type { Subject, Topic } from '@/domain/models';

// ─── Component ─────────────────────────────────────────────────────────────────

export function PdfListenMode() {
  const { subjectId, topicId } = useParams<{ subjectId: string; topicId?: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // Resource mode: file query param (e.g. "Resumenes/archivo.pdf")
  const resourceFile = searchParams.get('file');
  const isResourceMode = !!resourceFile;

  // ── State ──────────────────────────────────────────────────────────────────
  const [subject, setSubject] = useState<Subject | null>(null);
  const [topic, setTopic] = useState<Topic | null>(null);
  const [loading, setLoading] = useState(true);
  const [extracting, setExtracting] = useState(false);
  const [extractProgress, setExtractProgress] = useState(0);
  const [blocks, setBlocks] = useState<TextBlock[]>([]);
  const [processedTexts, setProcessedTexts] = useState<string[]>([]);
  const [ttsState, setTtsState] = useState<TtsState>('idle');
  const [currentBlock, setCurrentBlock] = useState(0);
  const [rate, setRate] = useState(1.0);
  const [voices, setVoices] = useState<TtsVoiceInfo[]>([]);
  const [selectedVoice, setSelectedVoice] = useState('');
  const [error, setError] = useState<string | null>(null);

  const ttsRef = useRef<TtsEngine | null>(null);
  const blockRefs = useRef<(HTMLDivElement | null)[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  // ── Title for display ──────────────────────────────────────────────────────
  const displayTitle = isResourceMode
    ? decodeURIComponent(resourceFile!.split('/').pop() ?? 'Recurso')
    : topic?.title ?? 'Tema';

  // ── Load subject + topic, then extract ─────────────────────────────────────
  useEffect(() => {
    if (!subjectId) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);

      // 1. Load subject
      const s = await subjectRepo.getById(subjectId);
      if (!s) { if (!cancelled) { setError('Asignatura no encontrada'); setLoading(false); } return; }
      if (!cancelled) setSubject(s);

      // 2. Load topic (if topic mode)
      let t: Topic | undefined;
      if (!isResourceMode && topicId) {
        t = await db.topics.get(topicId);
        if (!t) { if (!cancelled) { setError('Tema no encontrado'); setLoading(false); } return; }
        if (!cancelled) setTopic(t);
      }

      // 3. Validate PDF source
      if (!isResourceMode && (!t || !t.pdfFilename)) {
        if (!cancelled) setLoading(false);
        return;
      }

      // 4. Resolve PDF URL
      // Primero busca en IndexedDB (blobs importados por ZIP), luego en estáticos.
      // Para el fallback estático, verificamos que no sea un SPA catch-all (text/html).
      let url: string | null = null;
      try {
        if (isResourceMode && resourceFile) {
          url = await getResourceBlobUrl(subjectId, resourceFile);
          if (!url) {
            const slug = slugify(s.name);
            const staticUrl = resourcesUrl(`resources/${slug}/${resourceFile}`);
            // Verificar que sea un archivo real y no el SPA catch-all
            try {
              const headRes = await fetch(staticUrl, { method: 'HEAD' });
              const ct = headRes.headers.get('Content-Type') ?? '';
              if (headRes.ok && !ct.includes('text/html')) {
                url = staticUrl;
              }
            } catch {
              // estático no disponible
            }
          }
        } else if (t?.pdfFilename) {
          url = await getPdfBlobUrl(subjectId, t.pdfFilename);
          if (!url) {
            const staticUrl = getPdfUrl(s.name, t.pdfFilename);
            try {
              const headRes = await fetch(staticUrl, { method: 'HEAD' });
              const ct = headRes.headers.get('Content-Type') ?? '';
              if (headRes.ok && !ct.includes('text/html')) {
                url = staticUrl;
              }
            } catch {
              // estático no disponible
            }
          }
        }
      } catch {
        if (!cancelled) { setError('No se pudo obtener la URL del PDF'); setLoading(false); }
        return;
      }

      if (!url) {
        if (!cancelled) { setError('No se pudo obtener la URL del PDF'); setLoading(false); }
        return;
      }

      // 5. Extract text
      if (cancelled) return;
      if (!cancelled) setExtracting(true);

      try {
        const result = await extractPdfText(url, {
          onProgress: (p) => { if (!cancelled) setExtractProgress(p); },
        });

        if (cancelled) return;
        setBlocks(result.blocks);
        const processed = result.blocks.map((b) => mathToSpeech(b.text));
        setProcessedTexts(processed);
      } catch (err) {
        if (!cancelled) setError(`Error al extraer texto: ${err}`);
      } finally {
        if (!cancelled) { setLoading(false); setExtracting(false); }
      }
    })();

    return () => { cancelled = true; };
  }, [subjectId, topicId, isResourceMode, resourceFile]);

  // ── Initialize TTS engine ──────────────────────────────────────────────────
  useEffect(() => {
    const engine = createTtsEngine();
    ttsRef.current = engine;

    // Load voices (may be async)
    const checkVoices = () => {
      const spanishVoices = engine.getSpanishVoices();
      setVoices(spanishVoices);
      const currentVoice = engine.getVoice();
      if (currentVoice) setSelectedVoice(currentVoice.name);
    };

    checkVoices();
    // Re-check after a short delay (voices load async in some browsers)
    const timer = setTimeout(checkVoices, 500);

    return () => {
      clearTimeout(timer);
      engine.destroy();
      ttsRef.current = null;
    };
  }, []);

  // ── Auto scroll to active block ────────────────────────────────────────────
  useEffect(() => {
    const el = blockRefs.current[currentBlock];
    if (el && ttsState !== 'idle') {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [currentBlock, ttsState]);

  // ── TTS callbacks ──────────────────────────────────────────────────────────
  const ttsCallbacks = useCallback(
    () => ({
      onBlockStart: (idx: number) => setCurrentBlock(idx),
      onBlockEnd: (_idx: number) => {},
      onFinish: () => {
        setTtsState('idle');
        setCurrentBlock(0);
      },
      onError: (err: string) => {
        console.warn('[TTS]', err);
      },
      onStateChange: (s: TtsState) => setTtsState(s),
    }),
    [],
  );

  // ── Controls ───────────────────────────────────────────────────────────────
  const handlePlay = useCallback(() => {
    if (!ttsRef.current || processedTexts.length === 0) return;
    ttsRef.current.speak(processedTexts, ttsCallbacks());
  }, [processedTexts, ttsCallbacks]);

  const handlePause = useCallback(() => ttsRef.current?.pause(), []);
  const handleResume = useCallback(() => ttsRef.current?.resume(), []);
  const handleStop = useCallback(() => {
    ttsRef.current?.stop();
    setCurrentBlock(0);
  }, []);
  const handleNext = useCallback(() => ttsRef.current?.next(), []);
  const handlePrevious = useCallback(() => ttsRef.current?.previous(), []);

  const handleRateChange = useCallback((newRate: number) => {
    setRate(newRate);
    ttsRef.current?.setRate(newRate);
  }, []);

  const handleVoiceChange = useCallback((name: string) => {
    setSelectedVoice(name);
    ttsRef.current?.setVoice(name);
  }, []);

  const handleSkipTo = useCallback(
    (idx: number) => {
      if (ttsState === 'idle') {
        // Start playing from that block
        if (!ttsRef.current || processedTexts.length === 0) return;
        ttsRef.current.speak(processedTexts, ttsCallbacks());
        // Wait a tick then skip
        setTimeout(() => ttsRef.current?.skipTo(idx), 50);
      } else {
        ttsRef.current?.skipTo(idx);
      }
    },
    [ttsState, processedTexts, ttsCallbacks],
  );

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't capture if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;

      switch (e.key) {
        case ' ':
          e.preventDefault();
          if (ttsState === 'idle') handlePlay();
          else if (ttsState === 'playing') handlePause();
          else if (ttsState === 'paused') handleResume();
          break;
        case 'ArrowRight':
          e.preventDefault();
          handleNext();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          handlePrevious();
          break;
        case '+':
        case '=':
          e.preventDefault();
          handleRateChange(Math.min(2.0, rate + 0.25));
          break;
        case '-':
          e.preventDefault();
          handleRateChange(Math.max(0.5, rate - 0.25));
          break;
        case 'Escape':
          e.preventDefault();
          handleStop();
          navigate(-1);
          break;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [ttsState, rate, handlePlay, handlePause, handleResume, handleNext, handlePrevious, handleRateChange, handleStop, navigate]);

  // ── Check Web Speech API support ───────────────────────────────────────────
  const speechSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  // ── Render ─────────────────────────────────────────────────────────────────

  // Loading state
  if (loading && !extracting) {
    return (
      <div className="min-h-screen bg-ink-950 flex items-center justify-center">
        <p className="text-ink-400 text-sm animate-pulse">Cargando…</p>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-ink-950">
        <Header title={displayTitle} onBack={() => navigate(-1)} />
        <div className="max-w-3xl mx-auto p-6">
          <EmptyState
            icon={<span className="text-3xl">⚠️</span>}
            title="Error"
            description={error}
          />
          <div className="text-center mt-4">
            <button
              onClick={() => window.location.reload()}
              className="text-sm text-amber-400 hover:text-amber-300 underline"
            >
              Reintentar
            </button>
          </div>
        </div>
      </div>
    );
  }

  // No PDF for topic
  if (!isResourceMode && (!topic?.pdfFilename)) {
    return (
      <div className="min-h-screen bg-ink-950">
        <Header title={displayTitle} onBack={() => navigate(-1)} />
        <div className="max-w-3xl mx-auto p-6">
          <EmptyState
            icon={<span className="text-3xl">📄</span>}
            title="Sin PDF asociado"
            description="Este tema no tiene un PDF vinculado. Añade un PDF desde la vista de asignatura."
          />
        </div>
      </div>
    );
  }

  // Web Speech API not supported
  if (!speechSupported) {
    return (
      <div className="min-h-screen bg-ink-950">
        <Header title={displayTitle} onBack={() => navigate(-1)} />
        <div className="max-w-3xl mx-auto p-6">
          <EmptyState
            icon={<span className="text-3xl">🔇</span>}
            title="TTS no soportado"
            description="Tu navegador no soporta Web Speech API. Usa Chrome, Edge o Safari para esta funcionalidad."
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-ink-950 flex flex-col">
      <Header title={displayTitle} onBack={() => { handleStop(); navigate(-1); }} />

      {/* Main content */}
      <main ref={containerRef} className="flex-1 overflow-y-auto pb-20">
        <div className="max-w-3xl mx-auto px-4 py-6">
          {/* Extraction progress */}
          {extracting && (
            <div className="mb-6">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-sm text-ink-300 animate-pulse">Extrayendo texto…</span>
                <span className="text-xs text-ink-500 font-mono">
                  {Math.round(extractProgress * 100)}%
                </span>
              </div>
              <div className="h-1.5 bg-ink-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-amber-500 rounded-full transition-all duration-300"
                  style={{ width: `${extractProgress * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* No voices warning */}
          {!extracting && voices.length === 0 && blocks.length > 0 && (
            <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
              <p className="text-xs text-amber-400">
                No se encontraron voces en español. La lectura usará la voz por defecto del sistema.
              </p>
            </div>
          )}

          {/* Text blocks */}
          {blocks.map((block, idx) => {
            const isActive = idx === currentBlock && ttsState !== 'idle';

            return (
              <div
                key={idx}
                ref={(el) => { blockRefs.current[idx] = el; }}
                onClick={() => handleSkipTo(idx)}
                className={`
                  mb-3 px-4 py-3 rounded-lg cursor-pointer transition-all duration-200
                  border
                  ${isActive
                    ? 'border-amber-500/50 bg-ink-800/80 ring-1 ring-amber-500/20 shadow-lg shadow-amber-500/5'
                    : 'border-transparent hover:border-ink-700 hover:bg-ink-900/50'
                  }
                  ${block.type === 'math' ? 'bg-blue-500/5' : ''}
                  ${block.type === 'table' ? 'bg-emerald-500/5' : ''}
                  ${block.type === 'callout' ? 'bg-red-500/8 border-red-500/20' : ''}
                `}
              >
                {/* Block type indicator */}
                <div className="flex items-start gap-2">
                  {block.type === 'math' && (
                    <span className="text-xs text-blue-400 mt-0.5 shrink-0" title="Fórmula">🔢</span>
                  )}
                  {block.type === 'heading' && (
                    <span className="text-xs text-amber-500 mt-0.5 shrink-0" title="Título">§</span>
                  )}
                  {block.type === 'list' && (
                    <span className="text-xs text-sage-400 mt-0.5 shrink-0" title="Lista">☰</span>
                  )}
                  {block.type === 'table' && (
                    <span className="text-xs text-emerald-400 mt-0.5 shrink-0" title="Tabla">⊞</span>
                  )}
                  {block.type === 'callout' && (
                    <span className="text-xs text-red-400 mt-0.5 shrink-0" title="Importante">⚠</span>
                  )}

                  <p
                    className={`
                      text-sm leading-relaxed flex-1
                      ${block.type === 'heading'
                        ? 'font-display text-lg text-ink-100 font-semibold'
                        : block.type === 'math'
                          ? 'text-ink-200 font-mono text-xs'
                          : block.type === 'table'
                            ? 'text-ink-200 text-xs whitespace-pre-line'
                            : block.type === 'callout'
                              ? 'text-red-300 text-sm font-medium'
                              : 'text-ink-300'
                      }
                    `}
                  >
                    {block.text}
                  </p>

                  {/* Page indicator */}
                  <span className="text-[10px] text-ink-600 shrink-0 mt-1">
                    p.{block.pageIndex + 1}
                  </span>
                </div>
              </div>
            );
          })}

          {/* Empty state after extraction */}
          {!extracting && !loading && blocks.length === 0 && !error && (
            <EmptyState
              icon={<span className="text-3xl">📝</span>}
              title="Sin texto extraíble"
              description="No se pudo extraer texto de este PDF. Puede que sea un PDF escaneado (imagen)."
            />
          )}
        </div>
      </main>

      {/* TTS Controls */}
      {blocks.length > 0 && (
        <TtsControls
          state={ttsState}
          currentBlock={currentBlock}
          totalBlocks={blocks.length}
          rate={rate}
          voiceName={selectedVoice}
          voices={voices}
          onPlay={handlePlay}
          onPause={handlePause}
          onResume={handleResume}
          onStop={handleStop}
          onNext={handleNext}
          onPrevious={handlePrevious}
          onRateChange={handleRateChange}
          onVoiceChange={handleVoiceChange}
          onSkipTo={handleSkipTo}
        />
      )}
    </div>
  );
}

// ─── Header ────────────────────────────────────────────────────────────────────

function Header({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <header className="sticky top-0 z-20 bg-ink-950/95 backdrop-blur border-b border-ink-800 px-4 py-3">
      <div className="max-w-3xl mx-auto flex items-center gap-3">
        <button
          onClick={onBack}
          className="text-ink-400 hover:text-ink-200 transition-colors"
          title="Volver (Esc)"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M13 4L7 10L13 16" />
          </svg>
        </button>
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-lg">🎧</span>
          <h1 className="font-display text-ink-100 text-lg truncate">
            Escucha — {title}
          </h1>
        </div>
      </div>
    </header>
  );
}
