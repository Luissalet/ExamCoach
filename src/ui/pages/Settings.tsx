import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '@/ui/store';
import { db, getSettings } from '@/data/db';
import { Button, Input, Card, Select, Modal, TypeBadge } from '@/ui/components';
import { exportContributionPack, importContributionPack, undoContributionImport, previewContributionPack, type ContributionPackPreview, type UnmatchedTopic, type TopicMappings } from '@/data/contributionImport';
import { downloadContributionGuide } from '@/data/generateContributionGuide';
import { exportCompactSubject, exportAllCompactSubjects } from '@/data/exportCompact';
import { parseImportFile, downloadJSON } from '@/data/exportImport';
import { syncImagesToDevServer, type ImageSyncResult } from '@/data/questionImageStorage';
import { QuestionPreviewContent } from '@/ui/components/QuestionPreview';
import type { ImportHistoryEntry, Question } from '@/domain/models';


export function SettingsPage() {
  const navigate = useNavigate();
  const { settings, loadSettings, updateSettings, subjects, loadSubjects } = useStore();
  const [alias, setAlias] = useState('');
  const [importMsg, setImportMsg] = useState('');
  const [exportSubjectId, setExportSubjectId] = useState('');
  const [importedPacks, setImportedPacks] = useState<string[]>([]);
  const [compactExportSubjectId, setCompactExportSubjectId] = useState('');
  const [imageSyncResult, setImageSyncResult] = useState<ImageSyncResult | null>(null);
  const [syncingImages, setSyncingImages] = useState(false);
  const [importHistory, setImportHistory] = useState<ImportHistoryEntry[]>([]);
  const [undoMsg, setUndoMsg] = useState('');
  const [undoingPackId, setUndoingPackId] = useState<string | null>(null);
  const [packPreview, setPackPreview] = useState<ContributionPackPreview | null>(null);
  const [previewSampleQuestion, setPreviewSampleQuestion] = useState<Question | null>(null);
  // Queue para importación múltiple
  const [fileQueue, setFileQueue] = useState<File[]>([]);
  const [queueTotal, setQueueTotal] = useState(0);
  const [importing, setImporting] = useState(false);
  // Unmatched topics from import
  const [unmatchedTopics, setUnmatchedTopics] = useState<UnmatchedTopic[]>([]);
  const [topicMappings, setTopicMappings] = useState<TopicMappings>({});
  const [allTopicsForMapping, setAllTopicsForMapping] = useState<{ id: string; title: string; subjectName: string }[]>([]);

  useEffect(() => {
    loadSettings();
    loadSubjects();
  }, []);

  useEffect(() => {
    setAlias(settings.alias);
    setImportedPacks(settings.importedPackIds);
    setImportHistory(settings.importHistory ?? []);
  }, [settings]);


  const handleSyncImages = async () => {
  setSyncingImages(true);
  setImageSyncResult(null);
  try {
    const result = await syncImagesToDevServer();
    setImageSyncResult(result);
  } finally {
    setSyncingImages(false);
  }
};

  const handleSaveAlias = async () => {
    await updateSettings({ alias });
  };


  const handleUndo = async (packId: string) => {
  if (!confirm('¿Eliminar todas las preguntas de este pack importado? La acción no se puede deshacer.')) return;
  setUndoingPackId(packId);
  setUndoMsg('');
  try {
    const result = await undoContributionImport(packId);
    setUndoMsg(`✓ ${result.deletedQuestions} preguntas eliminadas`);
    setImportHistory(h => h.filter(e => e.packId !== packId));
    setImportedPacks(p => p.filter(id => id !== packId));
    await loadSubjects();
  } catch (err) {
    setUndoMsg('Error: ' + String(err));
  } finally {
    setUndoingPackId(null);
    setTimeout(() => setUndoMsg(''), 5000);
  }
};

  // Carga el preview del siguiente archivo en la cola
  const processNextInQueue = async (queue: File[]) => {
    if (queue.length === 0) {
      setFileQueue([]);
      return;
    }
    const [next, ...rest] = queue;
    setFileQueue(rest);
    try {
      const raw = await parseImportFile(next);
      const preview = await previewContributionPack(raw);
      if ('error' in preview) {
        setImportMsg('Error: ' + preview.error);
        // Continuar con el siguiente
        await processNextInQueue(rest);
      } else {
        setPackPreview(preview);
      }
    } catch (err) {
      setImportMsg('Error: ' + String(err));
      await processNextInQueue(rest);
    }
  };

  const handleImportContribution = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setImportMsg('');
    setQueueTotal(files.length);
    const [first, ...rest] = files;
    setFileQueue(rest);
    try {
      const raw = await parseImportFile(first);
      const preview = await previewContributionPack(raw);
      if ('error' in preview) {
        setImportMsg('Error: ' + preview.error);
        if (rest.length > 0) await processNextInQueue(rest);
      } else {
        setPackPreview(preview);
      }
    } catch (err) {
      setImportMsg('Error: ' + String(err));
      if (rest.length > 0) await processNextInQueue(rest);
    }
    e.target.value = '';
  };

  const handleConfirmImport = async (mappings?: TopicMappings) => {
    if (!packPreview || importing) return;
    setImporting(true);
    try {
      const result = await importContributionPack(packPreview.rawPack, mappings);
      if (result.alreadyImported) {
        setImportMsg(`ℹ️ Pack ${result.packId.slice(0, 8)}... ya fue importado anteriormente.`);
      } else if (result.errors.length > 0) {
        setImportMsg('Error: ' + result.errors[0]);
      } else if (result.unmatchedTopics.length > 0) {
        // Show unmatched topics for manual mapping
        setUnmatchedTopics(result.unmatchedTopics);
        // Load all topics for the mapping dropdowns
        const allSubjects = await db.subjects.toArray();
        const allTopics = await db.topics.toArray();
        const topicsWithSubject = allTopics.map((t) => {
          const s = allSubjects.find((s) => s.id === t.subjectId);
          return { id: t.id, title: t.title, subjectName: s?.name ?? '' };
        });
        setAllTopicsForMapping(topicsWithSubject);
        setTopicMappings({});
        const msg = `⚠ ${result.newQuestions} preguntas importadas, pero ${result.skippedUnmatched} preguntas no se pudieron asignar porque sus temas no coinciden con los existentes. Asigna los temas manualmente abajo.`;
        setImportMsg(msg);
        if (result.newQuestions > 0) {
          setImportedPacks((p) => [...p, result.packId]);
          await loadSubjects();
        }
        setImporting(false);
        return; // Don't close preview yet
      } else {
        setImportMsg(
          `✓ Importado de ${result.createdBy}: ${result.newQuestions} preguntas nuevas, ${result.duplicates} duplicadas`
        );
        setImportedPacks((p) => [...p, result.packId]);
        await loadSubjects();
      }
      setPackPreview(null);
      setUnmatchedTopics([]);
      // Procesar siguiente en la cola
      if (fileQueue.length > 0) {
        await processNextInQueue(fileQueue);
      } else {
        setQueueTotal(0);
      }
    } catch (err) {
      setImportMsg('Error: ' + String(err));
      setPackPreview(null);
      setUnmatchedTopics([]);
      if (fileQueue.length > 0) await processNextInQueue(fileQueue);
      else setQueueTotal(0);
    } finally {
      setImporting(false);
    }
  };

  const handleRetryWithMappings = async () => {
    // Re-import with the user-defined topic mappings
    await handleConfirmImport(topicMappings);
    setUnmatchedTopics([]);
  };

  const handleExportContribution = async () => {
    if (!exportSubjectId) return;
    try {
      const pack = await exportContributionPack(alias, exportSubjectId);
      const subject = subjects.find((s) => s.id === exportSubjectId);
      const filename = `contribution-${alias || 'yo'}-${subject?.name.slice(0, 20).replace(/\s+/g, '-') ?? exportSubjectId}-${new Date().toISOString().split('T')[0]}.json`;
      downloadJSON(pack, filename);
    } catch (err) {
      setImportMsg('Error al exportar: ' + String(err));
    }
  };

  const handleExportCompactSubject = async () => {
    if (!compactExportSubjectId) return;
    try {
      const compact = await exportCompactSubject(compactExportSubjectId);
      const filename = `compact-${compact.slug}-${new Date().toISOString().split('T')[0]}.json`;
      downloadJSON(compact, filename);
      setImportMsg(`✓ Exportado banco compacto: ${compact.total} preguntas`);
    } catch (err) {
      setImportMsg('Error al exportar: ' + String(err));
    }
  };

  const handleExportAllCompact = async () => {
    try {
      const allCompact = await exportAllCompactSubjects();
      const totalQuestions = allCompact.reduce((sum, s) => sum + s.total, 0);
      const filename = `compact-all-subjects-${new Date().toISOString().split('T')[0]}.json`;
      downloadJSON(allCompact, filename);
      setImportMsg(`✓ Exportado ${allCompact.length} asignaturas, ${totalQuestions} preguntas en total`);
    } catch (err) {
      setImportMsg('Error al exportar: ' + String(err));
    }
  };

  const handleClearData = async () => {
    if (!confirm('¿Eliminar TODOS los datos? Esta acción es irreversible.')) return;
    await db.subjects.clear();
    await db.topics.clear();
    await db.questions.clear();
    await db.sessions.clear();
    await db.pdfAnchors.clear();
    await db.pdfResources.clear();
    await updateSettings({ alias: '', importedPackIds: [], globalBankSyncedAt: undefined });
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-ink-950 text-ink-100">
      <header className="border-b border-ink-800 bg-ink-900/50">
        <div className="max-w-2xl mx-auto px-6 py-4 flex items-center gap-4">
          <button onClick={() => navigate('/')} className="text-ink-400 hover:text-ink-200 text-sm transition-colors">
            ← Inicio
          </button>
          <h1 className="font-display text-xl text-ink-100">Ajustes</h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-8 flex flex-col gap-6">
        {/* Identity */}
        <Card>
          <h2 className="font-display text-base text-ink-200 mb-4">Identidad</h2>
          <div className="flex flex-col gap-4">
            <Input
              label="Mi alias (para contribuciones)"
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              placeholder="Ej: Luis, Ana, Pablo..."
              hint="Se añade a las preguntas que crees para identificar tu autoría en contributions packs"
            />
            <div className="flex justify-end">
              <Button size="sm" onClick={handleSaveAlias}>Guardar alias</Button>
            </div>
          </div>
        </Card>

        {/* Export contribution */}
        <Card>
          <h2 className="font-display text-base text-ink-200 mb-1">Exportar mis preguntas</h2>
          <p className="text-sm text-ink-500 mb-4">
            Genera un <code className="text-amber-400 bg-ink-900 px-1 py-0.5 rounded text-xs">contribution pack</code> para compartir con el mantenedor del banco global.
          </p>
          {!alias && (
            <p className="text-xs text-amber-400 mb-3">⚠ Define tu alias antes de exportar</p>
          )}
          <div className="flex flex-col gap-3">
            <Select
              label="Asignatura"
              value={exportSubjectId}
              onChange={(e) => setExportSubjectId(e.target.value)}
            >
              <option value="">Selecciona una asignatura...</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </Select>
            <div className="flex justify-end">
              <Button
                size="sm"
                onClick={handleExportContribution}
                disabled={!exportSubjectId}
              >
                ↑ Exportar contribution pack
              </Button>
            </div>
          </div>
        </Card>

        {/* Exportar banco compacto para ChatGPT */}
        <Card>
          <h2 className="font-display text-base text-ink-200 mb-1">
            Exportar banco compacto (para ChatGPT)
          </h2>
          <p className="text-sm text-ink-500 mb-4">
            Exporta preguntas en formato ultra-compacto (solo tipo, prompt y hash).
            Ideal para pasarle a ChatGPT el banco de preguntas existente y evitar repeticiones
            al crear contribution packs.
          </p>

          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-2">
                <Select
                  label="Asignatura"
                  value={compactExportSubjectId}
                  onChange={(e) => setCompactExportSubjectId(e.target.value)}
                >
                  <option value="">Selecciona una asignatura...</option>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </Select>
                <Button
                  size="sm"
                  onClick={handleExportCompactSubject}
                  disabled={!compactExportSubjectId}
                >
                  ⚡ Exportar una asignatura
                </Button>
              </div>

              <div className="flex flex-col justify-end">
                <Button
                  size="sm"
                  onClick={handleExportAllCompact}
                  disabled={subjects.length === 0}
                >
                  📦 Exportar todas
                </Button>
              </div>
            </div>

            <div className="bg-ink-800 border border-ink-700 rounded-lg p-3">
              <p className="text-xs text-ink-400 mb-2 font-medium">Formato de salida:</p>
              <pre className="text-xs text-ink-300 font-mono overflow-x-auto">
{`{
  "asignatura": "Técnicas de Aprendizaje Automático",
  "slug": "tecnicas-de-aprendizaje-automatico",
  "total": 150,
  "preguntas": [
    {
      "t": "T",  // T=TEST, D=DESARROLLO, C=COMPLETAR, P=PRACTICO
      "p": "¿Qué puede aprender examinando...",
      "h": "sha256:...",
      "tp": "tema-8-aprendizaje-supervisado"
    }
  ]
}`}
              </pre>
            </div>

            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
              <p className="text-xs text-amber-400">
                <strong>💡 Uso recomendado:</strong> Exporta la asignatura, copia el JSON y pégaselo a ChatGPT
                junto con tu prompt de "crea 20 preguntas nuevas para el tema X". ChatGPT verá las preguntas
                existentes y evitará duplicarlas. El formato compacto usa ~90% menos caracteres que el global-bank.json.
              </p>
            </div>
          </div>
        </Card>

        {/* Generate contribution guide */}
        <Card>
          <h2 className="font-display text-base text-ink-200 mb-1">Guía de contribución personalizada</h2>
          <p className="text-sm text-ink-500 mb-4">
            Genera una guía <code className="text-amber-400 bg-ink-900 px-1 py-0.5 rounded text-xs">GUIA_CONTRIBUTION_PACKS.md</code> con los slugs exactos de tus asignaturas y temas.
            Comparte esta guía con tus compañeros o con ChatGPT para que genere packs compatibles con tu banco.
          </p>
          <Button size="sm" variant="secondary" onClick={downloadContributionGuide}>
            📋 Descargar guía personalizada
          </Button>
        </Card>

        {/* Import contribution (maintainer mode) */}
        <Card>
          <h2 className="font-display text-base text-ink-200 mb-1">Importar contribuciones</h2>
          <p className="text-sm text-ink-500 mb-4">
            Modo mantenedor: importa packs de tus compañeros y fusiónelos con el banco global. Dedupe automático por contenido.
          </p>

          {importMsg && (
            <div className={`mb-4 px-3 py-2.5 rounded-lg text-sm border ${
              importMsg.startsWith('Error') ? 'bg-rose-500/10 border-rose-500/20 text-rose-400' :
              importMsg.startsWith('ℹ') ? 'bg-ink-700 border-ink-600 text-ink-300' :
              'bg-sage-600/10 border-sage-600/20 text-sage-400'
            }`}>
              {importMsg}
            </div>
          )}

          <label className="cursor-pointer">
            <input type="file" accept=".json" multiple className="hidden" onChange={handleImportContribution} />
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-ink-600 bg-ink-800 text-ink-300 hover:text-ink-100 hover:border-ink-500 text-sm font-medium font-body transition-all cursor-pointer">
              ↓ Seleccionar contribution pack(s)
            </span>
          </label>

          {unmatchedTopics.length > 0 && (
            <div className="mt-4 p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg">
              <p className="text-sm text-amber-400 font-medium mb-3">
                Temas no encontrados — asigna cada uno a un tema existente:
              </p>
              <div className="flex flex-col gap-3">
                {unmatchedTopics.map((ut) => (
                  <div key={`${ut.subjectKey}::${ut.topicKey}`} className="flex flex-col gap-1">
                    <p className="text-xs text-ink-300">
                      <span className="text-ink-500">{ut.subjectKey} →</span> {ut.topicTitle} <span className="text-ink-500">({ut.questionCount} preguntas)</span>
                    </p>
                    <select
                      className="w-full bg-ink-800 border border-ink-600 rounded px-2 py-1.5 text-sm text-ink-200"
                      value={topicMappings[`${ut.subjectKey}::${ut.topicKey}`] ?? ''}
                      onChange={(e) => {
                        setTopicMappings((prev) => ({
                          ...prev,
                          [`${ut.subjectKey}::${ut.topicKey}`]: e.target.value,
                        }));
                      }}
                    >
                      <option value="">— Selecciona un tema existente —</option>
                      {allTopicsForMapping.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.subjectName} → {t.title}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 mt-4">
                <Button
                  size="sm"
                  onClick={handleRetryWithMappings}
                  disabled={unmatchedTopics.some((ut) => !topicMappings[`${ut.subjectKey}::${ut.topicKey}`])}
                >
                  Reimportar con asignaciones
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setUnmatchedTopics([]); setTopicMappings({}); }}>
                  Ignorar
                </Button>
              </div>
            </div>
          )}

          {importedPacks.length > 0 && (
            <div className="mt-4">
              <p className="text-xs text-ink-500 uppercase tracking-widest mb-2">Packs ya importados</p>
              <div className="flex flex-col gap-1 max-h-32 overflow-y-auto">
                {importedPacks.map((id) => (
                  <code key={id} className="text-xs text-ink-600 font-mono">{id}</code>
                ))}
              </div>
            </div>
          )}
        </Card>

        {importHistory.length > 0 && (
  <Card>
    <h2 className="font-display text-base text-ink-200 mb-1">Historial de importaciones</h2>
    <p className="text-sm text-ink-500 mb-4">
      Puedes revertir cualquier contribution pack importado. Esto elimina las preguntas de ese pack de tu base de datos.
    </p>
    {undoMsg && (
      <p className="text-sm text-sage-400 mb-3">{undoMsg}</p>
    )}
    <div className="flex flex-col gap-2">
      {[...importHistory].reverse().map(entry => (
        <div key={entry.packId} className="flex items-start justify-between gap-3 p-3 bg-ink-850 rounded-lg border border-ink-700">
          <div className="flex flex-col gap-0.5 min-w-0">
            <p className="text-sm text-ink-200 font-medium">{entry.createdBy}</p>
            <p className="text-xs text-ink-500 truncate">
              {entry.subjectNames.join(', ')} · {entry.questionCount} preguntas
            </p>
            <p className="text-xs text-ink-700">
              {new Date(entry.importedAt).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}
            </p>
          </div>
          <button
            onClick={() => handleUndo(entry.packId)}
            disabled={undoingPackId === entry.packId}
            className="text-xs text-rose-500 hover:text-rose-300 border border-rose-800 hover:border-rose-500 px-2 py-1 rounded transition-colors flex-shrink-0 disabled:opacity-50"
          >
            {undoingPackId === entry.packId ? 'Eliminando…' : 'Revertir'}
          </button>
        </div>
      ))}
    </div>
  </Card>
)}




        {/* Danger zone */}
        <Card className="border-rose-500/20">
          <h2 className="font-display text-base text-rose-400 mb-1">Zona de peligro</h2>
          <p className="text-sm text-ink-500 mb-4">
            Elimina todos los datos locales. Exporta el banco antes si quieres conservarlo.
          </p>
          <Button variant="danger" size="sm" onClick={handleClearData}>
            Borrar todos los datos
          </Button>
        </Card>

          {/* Developer tools */}
        <Card>
          <h2 className="font-display text-base text-ink-200 mb-1">🛠 Herramientas de mantenedor</h2>
          <p className="text-sm text-ink-500 mb-4">
            Sincroniza las imágenes guardadas en IndexedDB con <code className="text-amber-400 bg-ink-900 px-1 py-0.5 rounded text-xs">public/question-images/</code> para poder commitearlas al repositorio.
            Solo funciona en modo desarrollo (<code className="text-amber-400 bg-ink-900 px-1 py-0.5 rounded text-xs">npm run dev</code>).
          </p>
          <Button
            size="sm"
            variant="secondary"
            loading={syncingImages}
            onClick={handleSyncImages}
          >
            🖼 Sincronizar imágenes a disco
          </Button>
          {imageSyncResult && (
            <div className="mt-3 text-sm text-ink-400">
              {imageSyncResult.errors.length > 0 ? (
                <span className="text-rose-400">
                  ✗ {imageSyncResult.errors.length} error(es): {imageSyncResult.errors[0]}
                </span>
              ) : (
                <span className="text-sage-400">
                  ✓ {imageSyncResult.total} imágenes — {imageSyncResult.synced} nuevas, {imageSyncResult.skipped} ya existían
                </span>
              )}
            </div>
          )}
        </Card>
        {/* About */}
        <div className="text-center text-xs text-ink-700 pb-4">
          <p>StudyApp · local-first · sin backend · tus datos son tuyos</p>
          <p className="mt-1">Built with React + Dexie + Vite · v1.0.0</p>
        </div>
      </main>

      {/* Modal preview contribution pack */}
      <Modal
        open={!!packPreview}
        onClose={async () => { setPackPreview(null); if (fileQueue.length > 0) await processNextInQueue(fileQueue); else setQueueTotal(0); }}
        title={queueTotal > 1 ? `Vista previa (${queueTotal - fileQueue.length}/${queueTotal})` : 'Vista previa del Contribution Pack'}
        size="lg"
      >
        {packPreview && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <p className="text-sm text-ink-500 uppercase tracking-widest">Autor</p>
                  <p className="text-base text-ink-100 font-medium">{packPreview.createdBy}</p>
                </div>
                <div className="flex-1">
                  <p className="text-sm text-ink-500 uppercase tracking-widest">Exportado</p>
                  <p className="text-base text-ink-100 font-medium">
                    {new Date(packPreview.exportedAt).toLocaleDateString('es-ES')}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <Card className="text-center py-3">
                  <p className="text-2xl font-display text-amber-400">{packPreview.topicsCount}</p>
                  <p className="text-xs text-ink-500 mt-1">Temas</p>
                </Card>
                <Card className="text-center py-3">
                  <p className="text-2xl font-display text-sage-400">{packPreview.questionsCount}</p>
                  <p className="text-xs text-ink-500 mt-1">Total preguntas</p>
                </Card>
                <Card className="text-center py-3 border-sage-600/30">
                  <p className="text-2xl font-display text-sage-300">{'newQuestionsCount' in packPreview ? (packPreview as any).newQuestionsCount : '?'}</p>
                  <p className="text-xs text-ink-500 mt-1">Nuevas</p>
                </Card>
              </div>

              {packPreview.alreadyImported && (
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
                  <p className="text-sm text-amber-400">
                    ⚠ Este pack ya fue importado previamente.
                  </p>
                </div>
              )}

              {/* C1: Detailed per-topic breakdown table */}
              {'rows' in packPreview && (packPreview as any).rows.length > 0 && (
                <div>
                  <p className="text-sm text-ink-500 uppercase tracking-widest mb-2">Desglose por tema</p>
                  <div className="overflow-x-auto max-h-48 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-ink-700 text-ink-500 text-left">
                          <th className="pb-1.5 font-normal">Asignatura</th>
                          <th className="pb-1.5 font-normal">Tema</th>
                          <th className="pb-1.5 font-normal text-center">Preguntas</th>
                          <th className="pb-1.5 font-normal text-center">Nuevas</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(packPreview as any).rows.map((r: any, i: number) => (
                          <tr key={i} className="border-b border-ink-800 last:border-0">
                            <td className="py-1.5 text-ink-300">{r.subjectName}</td>
                            <td className="py-1.5 text-ink-300">{r.topicName}</td>
                            <td className="py-1.5 text-center text-ink-400">{r.questionsCount}</td>
                            <td className="py-1.5 text-center text-sage-400 font-medium">{r.newCount}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {packPreview.questionsSampleFull.length > 0 && (
                <div>
                  <p className="text-sm text-ink-500 uppercase tracking-widest mb-2">
                    Preguntas nuevas ({packPreview.questionsSampleFull.length})
                  </p>
                  <div className="flex flex-col gap-2 max-h-72 overflow-y-auto pr-1">
                    {packPreview.questionsSampleFull.map((q, i) => (
                      <button
                        key={q.id ?? i}
                        onClick={() => setPreviewSampleQuestion(q)}
                        className="w-full text-left group flex items-start gap-3 p-3 bg-ink-800 rounded-lg border border-ink-700 hover:border-ink-500 hover:bg-ink-750 transition-all duration-150 cursor-pointer"
                      >
                        <TypeBadge type={q.type} />
                        <span className="text-xs text-ink-300 group-hover:text-ink-100 transition-colors line-clamp-2 flex-1">
                          {q.prompt.replace(/[#*`]/g, '').trim()}
                        </span>
                        <span className="text-ink-600 group-hover:text-ink-400 text-xs flex-shrink-0 mt-0.5">›</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-ink-800">
              <Button variant="ghost" onClick={async () => { setPackPreview(null); if (fileQueue.length > 0) await processNextInQueue(fileQueue); else setQueueTotal(0); }}>
                {fileQueue.length > 0 ? 'Saltar' : 'Cancelar'}
              </Button>
              <Button onClick={() => handleConfirmImport()} disabled={importing || ('newQuestionsCount' in packPreview && (packPreview as any).newQuestionsCount === 0)}>
                {importing ? '⏳ Importando…' : 'newQuestionsCount' in packPreview && (packPreview as any).newQuestionsCount > 0
                  ? `Importar ${(packPreview as any).newQuestionsCount} preguntas nuevas`
                  : 'Sin preguntas nuevas'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal preview pregunta individual (desde contribution pack) — debe estar DESPUÉS del modal de pack para quedar encima */}
      {previewSampleQuestion && (
        <Modal
          open={!!previewSampleQuestion}
          onClose={() => setPreviewSampleQuestion(null)}
          title={previewSampleQuestion.prompt.replace(/[#*`]/g, '').trim().slice(0, 60) + (previewSampleQuestion.prompt.length > 60 ? '…' : '')}
          size="lg"
        >
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2 flex-wrap">
              <TypeBadge type={previewSampleQuestion.type} />
              {previewSampleQuestion.difficulty && (
                <span className="text-xs text-ink-500">{'★'.repeat(previewSampleQuestion.difficulty)}</span>
              )}
            </div>
            <QuestionPreviewContent question={previewSampleQuestion} />
            <div className="flex justify-end pt-2 border-t border-ink-800">
              <Button size="sm" variant="ghost" onClick={() => setPreviewSampleQuestion(null)}>
                Cerrar
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}