import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '@/ui/store';
import { Button, Card, Modal, Input, Countdown, Progress, EmptyState } from '@/ui/components';
import { exportBank, exportGlobalBank, importBank, parseImportFile, downloadJSON } from '@/data/exportImport';
import { loadSubjectExtraInfo } from '@/data/resourceLoader'; // ← ITER2
import { importResourceZip } from '@/data/resourceImporter'; // ← ITER3
import type { Subject, SubjectExtraInfo, ExternalLink } from '@/domain/models';
import { db } from '@/data/db';

const SUBJECT_COLORS = [
  '#f59e0b', '#ef4444', '#3b82f6', '#10b981', '#8b5cf6', '#f97316', '#06b6d4', '#ec4899',
];

export function Dashboard() {
  const navigate = useNavigate();
  const {
    subjects, loadSubjects, createSubject, deleteSubject, updateSubject,
    settings, loadSettings,
    syncGlobalBank, syncing, lastSyncResult,
  } = useStore();

  const [showCreate, setShowCreate] = useState(false);
  const [subjectName, setSubjectName] = useState('');
  const [subjectExamDate, setSubjectExamDate] = useState('');
  const [subjectColor, setSubjectColor] = useState(SUBJECT_COLORS[0]);

  // Edición de fecha de examen inline (por asignatura)
  const [editingExamDate, setEditingExamDate] = useState<string | null>(null); // subjectId
  const [examDateDraft, setExamDateDraft] = useState('');

  const [stats, setStats] = useState<Record<string, { total: number; correct: number; seen: number }>>({});
  // ── ITER2: info extra por asignatura (allowsNotes, professor…) ─────────────
  const [extraInfo, setExtraInfo] = useState<Record<string, SubjectExtraInfo | null>>({});
  const [importLoading, setImportLoading] = useState(false);
  const [importMsg, setImportMsg] = useState('');
  const [syncMsg, setSyncMsg] = useState('');

  // ── ITER3: ZIP import + external links ───────────────────────────────────
  const [zipImporting, setZipImporting] = useState(false);
  const [zipMsg, setZipMsg] = useState('');
  const [zipDragOver, setZipDragOver] = useState(false);
  const zipInputRef = useRef<HTMLInputElement>(null);
  const [externalLinks, setExternalLinks] = useState<ExternalLink[]>([]);

  // ── Inicialización ─────────────────────────────────────────────────────────
  useEffect(() => {
    loadSettings().then(() => {
      // Sync con banco global al arrancar (respeta cooldown de 1h)
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
  }, []);

  // ── Stats por asignatura ───────────────────────────────────────────────────
  useEffect(() => {
    async function loadStats() {
      const result: Record<string, { total: number; correct: number; seen: number }> = {};
      for (const s of subjects) {
        const qs = await db.questions.where('subjectId').equals(s.id).toArray();
        result[s.id] = {
          total: qs.length,
          correct: qs.reduce((acc, q) => acc + q.stats.correct, 0),
          seen: qs.reduce((acc, q) => acc + q.stats.seen, 0),
        };
      }
      setStats(result);
    }
    if (subjects.length) loadStats();
  }, [subjects]);

  // ── ITER2: cargar extra_info.json de cada asignatura ──────────────────────
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

  // ── ITER3: cargar enlaces externos de todas las asignaturas ───────────────
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

  // ── ITER3: ZIP import ───────────────────────────────────────────────────────
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
      examDate: subjectExamDate || undefined,
      color: subjectColor,
    });
    setSubjectName('');
    setSubjectExamDate('');
    setSubjectColor(SUBJECT_COLORS[0]);
    setShowCreate(false);
    navigate(`/subject/${s.id}`);
  };

  // ── Edición de fecha de examen inline ─────────────────────────────────────
  const openExamDateEditor = (s: Subject) => {
    setEditingExamDate(s.id);
    setExamDateDraft(s.examDate ?? '');
  };

  const saveExamDate = async (subjectId: string) => {
    await updateSubject(subjectId, { examDate: examDateDraft || undefined });
    setEditingExamDate(null);
  };

  // ── Export ─────────────────────────────────────────────────────────────────
  /** Backup personal completo (incluye examDate y stats) */
  const handleExportPersonal = async () => {
    const bank = await exportBank();
    downloadJSON(bank, `backup-personal-${new Date().toISOString().split('T')[0]}.json`);
  };

  /** Banco global para committear al repo (sin examDate, stats a 0) */
  const handleExportGlobal = async () => {
    const bank = await exportGlobalBank();
    downloadJSON(bank, `global-bank.json`);
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

  return (
    <div className="min-h-screen bg-ink-950 text-ink-100">
      {/* Header */}
      <header className="border-b border-ink-800 bg-ink-900/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center">
              <span className="text-ink-900 font-display font-bold text-sm">S</span>
            </div>
            <span className="font-display text-xl text-ink-100">ExamCoach</span>
          </div>
          <div className="flex items-center gap-2">
            {/* Sync con banco global */}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSyncManual}
              disabled={syncing}
              title={lastSyncDate ? `Última sync: ${lastSyncDate}` : 'Nunca sincronizado'}
            >
              {syncing ? '⟳ Sincronizando…' : '⟳ Sincronizar banco'}
            </Button>

            {/* Exportar banco global (para maintainer → GitHub) */}
            <Button variant="ghost" size="sm" onClick={handleExportGlobal}>
              ↑ Exportar banco global
            </Button>

            {/* Backup personal */}
            <Button variant="ghost" size="sm" onClick={handleExportPersonal}>
              ↑ Backup personal
            </Button>

            {/* Import backup */}
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

            {/* ITER3: Import ZIP de recursos */}
            <label className="cursor-pointer">
              <input
                ref={zipInputRef}
                type="file"
                accept=".zip"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleZipImport(f);
                  e.target.value = '';
                }}
                disabled={zipImporting}
              />
              <span
                className={`inline-flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg font-medium font-body transition-all ${
                  zipImporting ? 'text-ink-500 bg-ink-800 animate-pulse' : 'text-amber-400 hover:text-amber-300 hover:bg-ink-800 border border-amber-500/30'
                }`}
              >
                {zipImporting ? '⏳ Importando…' : '📦 Importar recursos'}
              </span>
            </label>

            <Button variant="ghost" size="sm" onClick={() => navigate('/settings')}>
              ⚙ Ajustes
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="font-display text-3xl text-ink-100 mb-1">Mis asignaturas</h1>
          <p className="text-ink-500 text-sm">
            {subjects.length === 0
              ? 'Crea tu primera asignatura para empezar'
              : `${subjects.length} asignatura${subjects.length !== 1 ? 's' : ''} · ${Object.values(stats).reduce((a, s) => a + s.total, 0)} preguntas`}
          </p>
        </div>

        {/* Mensajes de feedback */}
        {syncMsg && (
          <div className="mb-4 px-4 py-3 rounded-lg text-sm font-body border bg-sage-600/10 border-sage-600/30 text-sage-400">
            {syncMsg}
          </div>
        )}
        {importMsg && (
          <div className={`mb-6 px-4 py-3 rounded-lg text-sm font-body border ${
            importMsg.startsWith('Error')
              ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
              : 'bg-sage-600/10 border-sage-600/30 text-sage-400'
          }`}>
            {importMsg}
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
              const extra = extraInfo[s.id]; // ← ITER2
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
                      <h2 className="font-display text-lg text-ink-100 leading-tight group-hover:text-amber-300 transition-colors">
                        {s.name}
                      </h2>
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

                    {/* Fecha de examen — editable por el usuario, personal */}
                    {editingExamDate === s.id ? (
                      <div
                        className="flex items-center gap-2 mb-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="date"
                          value={examDateDraft}
                          onChange={(e) => setExamDateDraft(e.target.value)}
                          className="text-xs bg-ink-800 border border-ink-700 rounded px-2 py-1 text-ink-100"
                          autoFocus
                        />
                        <button
                          className="text-xs text-sage-400 hover:text-sage-300"
                          onClick={() => saveExamDate(s.id)}
                        >
                          ✓
                        </button>
                        <button
                          className="text-xs text-ink-500 hover:text-ink-300"
                          onClick={() => setEditingExamDate(null)}
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <div
                        className="mb-2 cursor-pointer"
                        onClick={(e) => { e.stopPropagation(); openExamDateEditor(s); }}
                        title="Haz clic para establecer tu fecha de examen"
                      >
                        {s.examDate ? (
                          <Countdown examDate={s.examDate} />
                        ) : (
                          <span className="text-xs text-ink-600 hover:text-ink-400 transition-colors">
                            + Añadir fecha de examen
                          </span>
                        )}
                      </div>
                    )}

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

            {/* Tarjeta para crear nueva asignatura */}
            <Card
              hover
              onClick={() => setShowCreate(true)}
              className="border-dashed border-ink-700 flex items-center justify-center min-h-[120px] text-ink-600 hover:text-ink-400 hover:border-ink-500 transition-colors cursor-pointer"
            >
              <span className="text-3xl">+</span>
            </Card>
          </div>
        )}
        {/* ITER3: ZIP import message */}
        {zipMsg && (
          <div className={`mt-6 px-4 py-3 rounded-lg text-sm font-body border ${
            zipMsg.startsWith('Error') || zipMsg.startsWith('⚠')
              ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
              : 'bg-sage-600/10 border-sage-600/30 text-sage-400'
          }`}>
            {zipMsg}
          </div>
        )}

        {/* ITER3: ZIP drop zone */}
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

        {/* ITER3: Enlaces externos útiles */}
        {externalLinks.length > 0 && (
          <div className="mt-10">
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
      </main>

      {/* Modal crear asignatura */}
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
            <label className="block text-xs text-ink-500 mb-2 font-body">Tu fecha de examen (opcional)</label>
            <input
              type="date"
              value={subjectExamDate}
              onChange={(e) => setSubjectExamDate(e.target.value)}
              className="w-full bg-ink-800 border border-ink-700 rounded-lg px-3 py-2 text-sm text-ink-100 font-body"
            />
            <p className="text-xs text-ink-600 mt-1">
              La fecha es personal — cada compañero pone la suya y no se comparte.
            </p>
          </div>
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