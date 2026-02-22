import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '@/ui/store';
import { Button, Card, Modal, Input, Countdown, Progress, EmptyState } from '@/ui/components';
import { exportBank, exportGlobalBank, importBank, parseImportFile, downloadJSON, removeDuplicateQuestions, commitAndCleanContributions } from '@/data/exportImport';
import { loadSubjectExtraInfo } from '@/data/resourceLoader';
import { importResourceZip } from '@/data/resourceImporter';
import type { Subject, SubjectExtraInfo, ExternalLink } from '@/domain/models';
import { db } from '@/data/db';
import { CalendarWidget } from '@/ui/components/CalendarWidget';
import { deliverableRepo } from '@/data/deliverableRepo';
import type { Deliverable } from '@/domain/models';

const SUBJECT_COLORS = [
  '#f59e0b', '#ef4444', '#3b82f6', '#10b981', '#8b5cf6', '#f97316', '#06b6d4', '#ec4899',
];

export function Dashboard() {
  const navigate = useNavigate();
  const {
    subjects, loadSubjects, createSubject, deleteSubject,
    settings, loadSettings,
    syncGlobalBank, syncing, lastSyncResult,
  } = useStore();

  const [showCreate, setShowCreate] = useState(false);
  const [subjectName, setSubjectName] = useState('');
  const [subjectColor, setSubjectColor] = useState(SUBJECT_COLORS[0]);

  const [stats, setStats] = useState<Record<string, { total: number; correct: number; seen: number }>>({});
  const [dueToday, setDueToday] = useState<Record<string, number>>({});
  const [incompleteSessions, setIncompleteSessions] = useState<Record<string, string>>({}); // subjectId → sessionId
  const [extraInfo, setExtraInfo] = useState<Record<string, SubjectExtraInfo | null>>({});
  const [importLoading, setImportLoading] = useState(false);
  const [importMsg, setImportMsg] = useState('');
  const [syncMsg, setSyncMsg] = useState('');
  const [pendingCorrectionCount, setPendingCorrectionCount] = useState<Record<string, number>>({});

  const [zipImporting, setZipImporting] = useState(false);
  const [zipMsg, setZipMsg] = useState('');
  const [zipDragOver, setZipDragOver] = useState(false);
  const zipInputRef = useRef<HTMLInputElement>(null);
  const [externalLinks, setExternalLinks] = useState<ExternalLink[]>([]);

  const [commitMsg, setCommitMsg] = useState('');
  const [committing, setCommitting] = useState(false);
  const [dedupMsg, setDedupMsg] = useState('');
  const [deduping, setDeduping] = useState(false);
  const [upcomingDeliverables, setUpcomingDeliverables] = useState<Deliverable[]>([]);
  // nextExamDates: subjectId → next upcoming exam dueDate (from exam deliverables)
  const [nextExamDates, setNextExamDates] = useState<Record<string, string>>({});

  // ── Inicialización ─────────────────────────────────────────────────────────
  useEffect(() => {
    loadSettings().then(() => {
      syncGlobalBank(false).then((result) => {
        if (result && (result.subjectsAdded + result.topicsAdded + result.questionsAdded) > 0) {
          setSyncMsg(
            `✓ Banco global: +${result.subjectsAdded} asignaturas, +${result.topicsAdded} temas, +${result.questionsAdded} preguntas`
          );
          setTimeout(() => setSyncMsg(''), 5000);
        }
      });
    });
    loadSubjects();
    deliverableRepo.getAll().then(all => {
      const today = new Date().toISOString().split('T')[0];
      const upcoming = all
        .filter(d => d.dueDate && d.dueDate >= today && !d.status.includes('done'))
        .sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''))
        .slice(0, 10);
      setUpcomingDeliverables(upcoming);

      // Compute next exam date per subject from exam-type deliverables
      const examMap: Record<string, string> = {};
      const upcomingExams = all
        .filter(d => d.type === 'exam' && d.dueDate && d.dueDate >= today)
        .sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''));
      for (const ex of upcomingExams) {
        if (!examMap[ex.subjectId]) {
          examMap[ex.subjectId] = ex.dueDate!;
        }
      }
      setNextExamDates(examMap);
    });
  }, []);

  // ── Stats por asignatura ───────────────────────────────────────────────────
  useEffect(() => {
    async function loadStats() {
      const result: Record<string, { total: number; correct: number; seen: number }> = {};
      const pendingCounts: Record<string, number> = {};
      const dueTodayMap: Record<string, number> = {};
      const incompleteSessionsMap: Record<string, string> = {};
      const today = new Date().toISOString().split('T')[0];

      for (const s of subjects) {
        const qs = await db.questions.where('subjectId').equals(s.id).toArray();
        result[s.id] = {
          total: qs.length,
          correct: qs.reduce((acc, q) => acc + q.stats.correct, 0),
          seen: qs.reduce((acc, q) => acc + q.stats.seen, 0),
        };
        // SM-2 preguntas pendientes hoy (para badge "Repaso de hoy")
        dueTodayMap[s.id] = qs.filter(q => !q.stats.nextReviewAt || q.stats.nextReviewAt <= today).length;

        // Count pending corrections (finished sessions with unanswered DESARROLLO/PRACTICO)
        const sessions = await db.sessions
          .where('subjectId')
          .equals(s.id)
          .filter(sess => sess.finishedAt != null && sess.answers.some(a => a.result === null))
          .toArray();
        pendingCounts[s.id] = sessions.reduce((acc, sess) => acc + sess.answers.filter(a => a.result === null).length, 0);

        // Sesión incompleta más reciente (A3)
        const incompleteSess = await db.sessions
          .where('subjectId')
          .equals(s.id)
          .filter(sess => sess.finishedAt == null && sess.answers.length > 0)
          .toArray();
        if (incompleteSess.length > 0) {
          // Tomar la más reciente
          incompleteSess.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
          incompleteSessionsMap[s.id] = incompleteSess[0].id;
        }
      }
      setStats(result);
      setPendingCorrectionCount(pendingCounts);
      setDueToday(dueTodayMap);
      setIncompleteSessions(incompleteSessionsMap);
    }
    if (subjects.length) loadStats();
  }, [subjects]);

  // ── ITER2: extra_info.json ─────────────────────────────────────────────────
  useEffect(() => {
    if (!subjects.length) return;
    async function loadExtra() {
      const result: Record<string, SubjectExtraInfo | null> = {};
      await Promise.all(subjects.map(async (s) => {
        result[s.id] = await loadSubjectExtraInfo(s.name);
      }));
      setExtraInfo(result);
    }
    loadExtra();
  }, [subjects]);

  // ── ITER3: enlaces externos ────────────────────────────────────────────────
  useEffect(() => {
    if (!subjects.length) return;
    const allLinks: ExternalLink[] = [];
    for (const sid of Object.keys(extraInfo)) {
      const info = extraInfo[sid];
      if (info?.externalLinks) {
        for (const link of info.externalLinks) {
          if (!allLinks.some((l) => l.url === link.url)) {
            allLinks.push(link);
          }
        }
      }
    }
    setExternalLinks(allLinks);
  }, [extraInfo]);

  // ── ITER3: ZIP import ──────────────────────────────────────────────────────
  const handleZipImport = async (file: File) => {
    if (!file.name.endsWith('.zip')) {
      setZipMsg('Error: solo se aceptan archivos .zip');
      return;
    }
    setZipImporting(true);
    setZipMsg('');
    try {
      const result = await importResourceZip(file);
      if (result.errors.length > 0) {
        setZipMsg(`⚠ Importado con errores: ${result.totalFiles} archivos. Errores: ${result.errors[0]}`);
      } else {
        const cats = Object.entries(result.categories).map(([k, v]) => `${k}: ${v}`).join(', ');
        setZipMsg(`✓ Importados ${result.totalFiles} archivos de ${result.subjects.length} asignatura(s). ${cats}`);
      }
    } catch (err) {
      setZipMsg('Error: ' + String(err));
    } finally {
      setZipImporting(false);
      setZipDragOver(false);
    }
  };

  // ── Crear asignatura ───────────────────────────────────────────────────────
  const handleCreate = async () => {
    if (!subjectName.trim()) return;
    const s = await createSubject({
      name: subjectName.trim(),
      color: subjectColor,
    });
    setSubjectName('');
    setSubjectColor(SUBJECT_COLORS[0]);
    setShowCreate(false);
    navigate(`/subject/${s.id}`);
  };

  // ── Export ─────────────────────────────────────────────────────────────────
  const handleExportPersonal = async () => {
    const bank = await exportBank();
    downloadJSON(bank, `backup-personal-${new Date().toISOString().split('T')[0]}.json`);
  };

  const handleExportGlobal = async () => {
    const bank = await exportGlobalBank();
    downloadJSON(bank, `global-bank.json`);
  };

  const handleCommitAndClean = async () => {
    if (!confirm(
      '¿Integrar contributions en el banco global?\n\n' +
      'Se actualizará src/data/global-bank.json con todo el contenido actual. ' +
      'Las preguntas de contribution packs quedarán marcadas como preguntas del banco global ' +
      '(se limpia su origen pero NO se eliminan de IndexedDB).\n\n' +
      'Tus propias preguntas y estadísticas NO se tocan.'
    )) return;

    setCommitting(true);
    setCommitMsg('');
    try {
      const result = await commitAndCleanContributions();
      if (result.wroteToFile) {
        setCommitMsg(`✓ global-bank.json actualizado (${result.questionsInBank} preguntas) · ${result.committedFromPacks} packs integrados · historial reseteado`);
      } else {
        setCommitMsg(`⚠ No se pudo escribir en disco (solo funciona en dev). ${result.committedFromPacks} preguntas de packs marcadas como globales.`);
      }
      await loadSubjects();
    } catch (err) {
      setCommitMsg('Error: ' + String(err));
    } finally {
      setCommitting(false);
      setTimeout(() => setCommitMsg(''), 7000);
    }
  };

  const handleRemoveDuplicates = async () => {
    if (!confirm(
      '¿Eliminar preguntas duplicadas?\n\n' +
      'Se compararán las preguntas por su contentHash. Si hay duplicados, ' +
      'se conservará la que tenga más historial de uso y se borrarán las demás.\n\n' +
      'Esta operación NO se puede deshacer.'
    )) return;

    setDeduping(true);
    setDedupMsg('');
    try {
      const result = await removeDuplicateQuestions();
      if (result.removed === 0) {
        setDedupMsg(`✓ Sin duplicados: ${result.checked} preguntas revisadas, ninguna eliminada.`);
      } else {
        setDedupMsg(`✓ Limpieza completada: ${result.removed} duplicadas eliminadas de ${result.checked} revisadas.`);
        await loadSubjects();
      }
    } catch (err) {
      setDedupMsg('Error: ' + String(err));
    } finally {
      setDeduping(false);
      setTimeout(() => setDedupMsg(''), 7000);
    }
  };

  // ── Import (backup personal) ───────────────────────────────────────────────
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportLoading(true);
    setImportMsg('');
    try {
      const raw = await parseImportFile(file);
      const result = await importBank(raw);
      if (result.errors.length > 0) {
        setImportMsg('Error: ' + result.errors[0]);
      } else {
        setImportMsg(`✓ Importado: ${result.subjectsAdded} asignaturas, ${result.topicsAdded} temas, ${result.questionsAdded} preguntas`);
        await loadSubjects();
      }
    } catch (err) {
      setImportMsg('Error: ' + String(err));
    } finally {
      setImportLoading(false);
      e.target.value = '';
    }
  };

  // ── Sync manual ────────────────────────────────────────────────────────────
  const handleSyncManual = async () => {
    setSyncMsg('');
    const result = await syncGlobalBank(true);
    if (!result) return;
    if (result.errors.length > 0) {
      setSyncMsg('Error al sincronizar: ' + result.errors[0]);
    } else if (result.subjectsAdded + result.topicsAdded + result.questionsAdded === 0) {
      setSyncMsg('✓ Ya estás al día con el banco global');
    } else {
      setSyncMsg(
        `✓ Sincronizado: +${result.subjectsAdded} asignaturas, +${result.topicsAdded} temas, +${result.questionsAdded} preguntas`
      );
    }
    setTimeout(() => setSyncMsg(''), 5000);
  };

  const pctCorrect = (s: Subject) => {
    const st = stats[s.id];
    if (!st || st.seen === 0) return 0;
    return Math.round((st.correct / st.seen) * 100);
  };

  const lastSyncDate = settings.globalBankSyncedAt
    ? new Date(settings.globalBankSyncedAt).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })
    : null;

  // C3: Check if global bank sync is stale (>7 days or never synced)
  const [syncBannerDismissed, setSyncBannerDismissed] = useState(false);
  const syncStale = (() => {
    if (syncBannerDismissed) return false;
    if (!settings.globalBankSyncedAt) return true;
    const daysSince = (Date.now() - new Date(settings.globalBankSyncedAt).getTime()) / (1000 * 60 * 60 * 24);
    return daysSince > 7;
  })();
  const syncStaleDays = settings.globalBankSyncedAt
    ? Math.floor((Date.now() - new Date(settings.globalBankSyncedAt).getTime()) / (1000 * 60 * 60 * 24))
    : null;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="h-screen bg-ink-950 text-ink-100 flex flex-col overflow-hidden">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="border-b border-ink-800 bg-ink-900/50 backdrop-blur-sm flex-shrink-0 z-10">
        <div className="px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center">
              <span className="text-ink-900 font-display font-bold text-sm">S</span>
            </div>
            <span className="font-display text-xl text-ink-100">ExamCoach</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSyncManual}
              disabled={syncing}
              title={lastSyncDate ? `Última sync: ${lastSyncDate}` : 'Nunca sincronizado'}
            >
              {syncing ? '⟳ Sincronizando…' : '⟳ Sincronizar banco'}
            </Button>

            <Button variant="ghost" size="sm" onClick={handleExportGlobal}>
              ↑ Exportar banco global
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={handleCommitAndClean}
              disabled={committing}
              title="Integra todos los packs en el banco global y actualiza el archivo"
            >
              {committing ? '⏳…' : '🔄 Integrar & limpiar'}
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={handleRemoveDuplicates}
              disabled={deduping}
              title="Detecta y elimina preguntas duplicadas (mismo contentHash)"
            >
              {deduping ? '⏳…' : '🔧 Eliminar duplicadas'}
            </Button>

            <Button variant="ghost" size="sm" onClick={handleExportPersonal}>
              ↑ Backup personal
            </Button>

            <label className="cursor-pointer">
              <input type="file" accept=".json" className="hidden" onChange={handleImport} disabled={importLoading} />
              <span
                className={`inline-flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg font-medium font-body transition-all ${
                  importLoading ? 'text-ink-500 bg-ink-800' : 'text-ink-300 hover:text-ink-100 hover:bg-ink-800'
                }`}
              >
                ↓ Importar backup
              </span>
            </label>

            <label className="cursor-pointer">
              <input
                ref={zipInputRef}
                type="file"
                accept=".zip"
                className="hidden"
                disabled={zipImporting}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleZipImport(f);
                  e.target.value = '';
                }}
              />
              <span
                className={`inline-flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg font-medium font-body transition-all ${
                  zipImporting
                    ? 'text-ink-500 bg-ink-800 animate-pulse'
                    : 'text-amber-400 hover:text-amber-300 hover:bg-ink-800 border border-amber-500/30'
                }`}
              >
                {zipImporting ? '⏳ Importando…' : '📦 Importar recursos'}
              </span>
            </label>

            <Button variant="ghost" size="sm" onClick={() => navigate('/stats')}>
              📊 Estadísticas
            </Button>
            <Button variant="ghost" size="sm" onClick={() => navigate('/settings')}>
              ⚙ Ajustes
            </Button>
          </div>
        </div>
      </header>

      {/* C3: Stale sync banner */}
      {syncStale && (
        <div className="bg-amber-500/10 border-b border-amber-500/20 px-6 py-2 flex items-center justify-between flex-shrink-0">
          <span className="text-xs text-amber-400">
            {syncStaleDays != null
              ? `El banco global no se ha sincronizado en ${syncStaleDays} días.`
              : 'El banco global nunca se ha sincronizado.'}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { handleSyncManual(); setSyncBannerDismissed(true); }}
              className="text-xs text-amber-400 hover:text-amber-300 font-medium underline underline-offset-2"
            >
              Sincronizar ahora
            </button>
            <button
              onClick={() => setSyncBannerDismissed(true)}
              className="text-xs text-ink-600 hover:text-ink-400 transition-colors"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* ── Body: main + sidebar ───────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Main (scrollable) ──────────────────────────────────────────── */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-5xl mx-auto px-6 py-10">

            {/* Título */}
            <div className="mb-8">
              <h1 className="font-display text-3xl text-ink-100 mb-1">Mis asignaturas</h1>
              <p className="text-ink-500 text-sm">
                {subjects.length === 0
                  ? 'Crea tu primera asignatura para empezar'
                  : `${subjects.length} asignatura${subjects.length !== 1 ? 's' : ''} · ${Object.values(stats).reduce((k, b) => k + b.total, 0)} preguntas`}
              </p>
            </div>

            {/* Mensajes de estado */}
            {syncMsg && (
              <div className="mb-4 px-4 py-3 rounded-lg text-sm font-body border bg-sage-600/10 border-sage-600/30 text-sage-400">
                {syncMsg}
              </div>
            )}
            {importMsg && (
              <div className={`mb-4 px-4 py-3 rounded-lg text-sm font-body border ${
                importMsg.startsWith('Error')
                  ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                  : 'bg-sage-600/10 border-sage-600/30 text-sage-400'
              }`}>
                {importMsg}
              </div>
            )}
            {commitMsg && (
              <div className={`mb-4 px-4 py-3 rounded-lg text-sm font-body border ${
                commitMsg.startsWith('Error')
                  ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                  : commitMsg.startsWith('⚠')
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                  : 'bg-sage-600/10 border-sage-600/30 text-sage-400'
              }`}>
                {commitMsg}
              </div>
            )}
            {dedupMsg && (
              <div className={`mb-4 px-4 py-3 rounded-lg text-sm font-body border ${
                dedupMsg.startsWith('Error')
                  ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                  : 'bg-sage-600/10 border-sage-600/30 text-sage-400'
              }`}>
                {dedupMsg}
              </div>
            )}

            {/* Grid de asignaturas */}
            {subjects.length === 0 ? (
              <EmptyState
                icon={<span>📚</span>}
                title="Sin asignaturas"
                description="El banco global se carga automáticamente. Si está vacío, crea una asignatura."
                action={<Button onClick={() => setShowCreate(true)}>+ Nueva asignatura</Button>}
              />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {subjects.map((s) => {
                  const st = stats[s.id] ?? { total: 0, correct: 0, seen: 0 };
                  const pct = pctCorrect(s);
                  const extra = extraInfo[s.id];
                  return (
                    <Card
                      key={s.id}
                      hover
                      onClick={() => navigate(`/subject/${s.id}`)}
                      className="group relative overflow-hidden"
                    >
                      <div
                        className="absolute top-0 left-0 right-0 h-1 rounded-t-xl"
                        style={{ backgroundColor: s.color ?? '#f59e0b' }}
                      />
                      <div className="pt-1">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex flex-col gap-1">
                            <h2 className="font-display text-lg text-ink-100 leading-tight group-hover:text-amber-300 transition-colors">
                              {s.name}
                            </h2>
                            {pendingCorrectionCount[s.id] > 0 && (
                              <span className="text-xs bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded w-fit">
                                {pendingCorrectionCount[s.id]} sin corregir
                              </span>
                            )}
                            {/* A1: Badge "Repaso de hoy" */}
                            {(dueToday[s.id] ?? 0) > 0 && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigate(`/subject/${s.id}?tab=practice&autostart=smart`);
                                }}
                                className="text-xs bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 border border-blue-500/30 px-2 py-0.5 rounded w-fit transition-colors font-medium"
                                title="Lanzar repaso inteligente del día"
                              >
                                🧠 {dueToday[s.id]} por repasar hoy
                              </button>
                            )}
                            {/* A3: Badge "Sesión en curso" */}
                            {incompleteSessions[s.id] && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigate(`/practice/${incompleteSessions[s.id]}`);
                                }}
                                className="text-xs bg-orange-500/20 text-orange-300 hover:bg-orange-500/30 border border-orange-500/30 px-2 py-0.5 rounded w-fit transition-colors font-medium"
                                title="Reanudar sesión en curso"
                              >
                                ▶ Sesión en curso
                              </button>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {/* ── ITER2: indicador de apuntes ─────────────────── */}
                            {extra?.allowsNotes !== undefined && (
                              <span
                                title={extra.allowsNotes ? 'Permite apuntes en el examen' : 'Sin apuntes en el examen'}
                                className={`text-xs px-1.5 py-0.5 rounded ${
                                  extra.allowsNotes
                                    ? 'bg-sage-600/20 text-sage-400'
                                    : 'bg-rose-500/20 text-rose-400'
                                }`}
                              >
                                {extra.allowsNotes ? '📝' : '🚫'}
                              </span>
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (confirm(`¿Eliminar "${s.name}" y todas sus preguntas?`)) {
                                  deleteSubject(s.id);
                                }
                              }}
                              className="opacity-0 group-hover:opacity-100 transition-opacity text-ink-600 hover:text-rose-400 p-1 -mr-1 -mt-1"
                            >
                              ✕
                            </button>
                          </div>
                        </div>

                        {/* ── ITER2: profesor si existe ──────────────────────── */}
                        {extra?.professor && (
                          <p className="text-xs text-ink-500 -mt-1 mb-1">Prof. {extra.professor}</p>
                        )}

                        {/* Próximo examen — leído de deliverables tipo 'exam' */}
                        <div className="mb-2">
                          {nextExamDates[s.id] ? (
                            <div>
                              <Countdown examDate={nextExamDates[s.id]} />
                              <span className="text-[10px] text-ink-600 block -mt-0.5">
                                🎓 próximo examen
                              </span>
                            </div>
                          ) : (
                            <button
                              onClick={(e) => { e.stopPropagation(); navigate('/deliverables'); }}
                              className="text-xs text-ink-600 hover:text-amber-400 transition-colors"
                            >
                              + Añadir examen →
                            </button>
                          )}
                        </div>

                        <div className="mt-3 flex items-center gap-2 text-xs text-ink-500">
                          <span>{st.total} preguntas</span>
                          {st.seen > 0 && (
                            <>
                              <span>·</span>
                              <span className={pct >= 70 ? 'text-sage-400' : pct >= 40 ? 'text-amber-400' : 'text-rose-400'}>
                                {pct}% acierto
                              </span>
                            </>
                          )}
                        </div>

                        {st.seen > 0 && (
                          <Progress
                            value={st.correct}
                            max={st.seen}
                            color={pct >= 70 ? 'sage' : pct >= 40 ? 'amber' : 'rose'}
                          />
                        )}
                      </div>
                    </Card>
                  );
                })}

                {/* Tarjeta nueva asignatura */}
                <button
                  onClick={() => setShowCreate(true)}
                  className="border-2 border-dashed border-ink-700 hover:border-amber-500/50 rounded-xl p-5 flex flex-col items-center justify-center gap-3 text-ink-500 hover:text-amber-400 transition-all duration-200 min-h-[140px] group cursor-pointer"
                >
                  <span className="text-3xl group-hover:scale-110 transition-transform">+</span>
                  <span className="text-sm font-medium font-body">Nueva asignatura</span>
                </button>
              </div>
            )}

            {/* ZIP drop zone */}
            {zipMsg && (
              <div className={`mt-6 px-4 py-3 rounded-lg text-sm font-body border ${
                zipMsg.startsWith('Error') || zipMsg.startsWith('⚠')
                  ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                  : 'bg-sage-600/10 border-sage-600/30 text-sage-400'
              }`}>
                {zipMsg}
              </div>
            )}
            <div
              onDragOver={(e) => { e.preventDefault(); setZipDragOver(true); }}
              onDragLeave={() => setZipDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files[0];
                if (file) handleZipImport(file);
              }}
              className={`mt-8 border-2 border-dashed rounded-xl p-6 text-center transition-all cursor-pointer ${
                zipDragOver
                  ? 'border-amber-500 bg-amber-500/5 text-amber-300'
                  : 'border-ink-700 text-ink-600 hover:border-ink-500 hover:text-ink-400'
              }`}
              onClick={() => zipInputRef.current?.click()}
            >
              <p className="text-sm font-body">
                {zipDragOver
                  ? '📦 Suelta el ZIP aquí'
                  : '📦 Arrastra un ZIP de recursos aquí o haz clic para importar'}
              </p>
              <p className="text-xs text-ink-600 mt-1">
                Estructura: resources/[asignatura]/Temas|Examenes|Practica|Resumenes
              </p>
            </div>

            {/* ── Botones link externos ───────────────────────────────────── */}
            {externalLinks.length > 0 && (
              <div className="mt-10 pb-12">
                <h2 className="font-display text-xl text-ink-200 mb-4">Otros recursos</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {externalLinks.map((link) => (
                    <a
                      key={link.url}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 bg-ink-800 border border-ink-700 rounded-xl px-4 py-3 hover:border-ink-500 hover:bg-ink-800/80 transition-all group"
                    >
                      {link.icon ? (
                        link.icon.startsWith('http') ? (
                          <img src={link.icon} alt="" className="w-5 h-5 rounded" />
                        ) : (
                          <span className="text-lg">{link.icon}</span>
                        )
                      ) : (
                        <img
                          src={`https://www.google.com/s2/favicons?domain=${new URL(link.url).hostname}&sz=32`}
                          alt=""
                          className="w-5 h-5 rounded"
                        />
                      )}
                      <span className="text-sm text-ink-200 group-hover:text-amber-300 transition-colors truncate">
                        {link.name}
                      </span>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        </main>

        {/* ── Sidebar derecho: Calendario + Próximas entregas ────────────── */}
        <aside className="w-72 flex-shrink-0 border-l border-ink-800 overflow-y-auto bg-ink-950/50">
          <div className="p-4 flex flex-col gap-6 pt-6">

            {/* Calendario */}
            <div>
              <h2 className="text-xs font-medium text-ink-500 uppercase tracking-widest mb-3">
                Calendario
              </h2>
              <CalendarWidget subjects={subjects} />
            </div>

            {/* Próximas entregas */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs font-medium text-ink-500 uppercase tracking-widest">
                  Próximas entregas
                </h2>
                <button
                  onClick={() => navigate('/deliverables')}
                  className="text-xs text-amber-500 hover:text-amber-300 transition-colors"
                >
                  Ver todas →
                </button>
              </div>

              {upcomingDeliverables.length === 0 ? (
                <div className="bg-ink-900 border border-ink-700 rounded-xl p-4 text-center">
                  <p className="text-sm text-ink-600">Sin entregas pendientes próximas</p>
                  <button
                    onClick={() => navigate('/deliverables')}
                    className="text-xs text-amber-500 hover:text-amber-300 mt-2 transition-colors block mx-auto"
                  >
                    Gestionar actividades →
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {upcomingDeliverables.map(d => {
                    const subject = subjects.find(s => s.id === d.subjectId);
                    const dueDateObj = d.dueDate ? new Date(d.dueDate + 'T12:00:00') : null;
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    const daysLeft = dueDateObj
                      ? Math.ceil((dueDateObj.getTime() - today.getTime()) / 86400000)
                      : null;
                    return (
                      <div
                        key={d.id}
                        onClick={() => navigate('/deliverables')}
                        className="flex items-center gap-3 p-3 bg-ink-900 border border-ink-700 rounded-xl hover:border-ink-600 cursor-pointer transition-colors"
                      >
                        {subject?.color && (
                          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: subject.color }} />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-ink-200 truncate">{d.name}</p>
                          <p className="text-xs text-ink-500 truncate">{subject?.name}</p>
                        </div>
                        {daysLeft !== null && (
                          <span className={`text-xs flex-shrink-0 font-medium ${
                            daysLeft <= 0 ? 'text-rose-400' :
                            daysLeft <= 3 ? 'text-rose-400' :
                            daysLeft <= 7 ? 'text-amber-400' : 'text-ink-500'
                          }`}>
                            {daysLeft <= 0 ? '¡Hoy!' : daysLeft === 1 ? 'Mañana' : `${daysLeft}d`}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>
        </aside>

      </div>{/* fin flex body */}

      {/* ── Modal crear asignatura ─────────────────────────────────────────── */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Nueva asignatura">
        <div className="flex flex-col gap-4">
          <Input
            label="Nombre"
            value={subjectName}
            onChange={(e) => setSubjectName(e.target.value)}
            placeholder="Bases de Datos"
            autoFocus
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          />
          <div>
            <label className="block text-xs text-ink-500 mb-2 font-body">Color</label>
            <div className="flex gap-2 flex-wrap">
              {SUBJECT_COLORS.map((c) => (
                <button
                  key={c}
                  className={`w-7 h-7 rounded-full border-2 transition-all ${
                    subjectColor === c ? 'border-white scale-110' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: c }}
                  onClick={() => setSubjectColor(c)}
                />
              ))}
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={() => setShowCreate(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={!subjectName.trim()}>Crear</Button>
          </div>
        </div>
      </Modal>

    </div>
  );
}