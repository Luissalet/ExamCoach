import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '@/ui/store';
import { Button, Card, Modal, Input, Countdown, Progress, EmptyState } from '@/ui/components';
import { exportBank, importBank, parseImportFile, downloadJSON } from '@/data/exportImport';
import type { Subject } from '@/domain/models';
import { db } from '@/data/db';

const SUBJECT_COLORS = [
  '#f59e0b', '#ef4444', '#3b82f6', '#10b981', '#8b5cf6', '#f97316', '#06b6d4', '#ec4899',
];

export function Dashboard() {
  const navigate = useNavigate();
  const { subjects, loadSubjects, createSubject, deleteSubject } = useStore();
  const [showCreate, setShowCreate] = useState(false);
  const [subjectName, setSubjectName] = useState('');
  const [subjectExamDate, setSubjectExamDate] = useState('');
  const [subjectColor, setSubjectColor] = useState(SUBJECT_COLORS[0]);
  const [stats, setStats] = useState<Record<string, { total: number; correct: number; seen: number }>>({});
  const [importLoading, setImportLoading] = useState(false);
  const [importMsg, setImportMsg] = useState('');

  useEffect(() => {
    loadSubjects();
  }, [loadSubjects]);

  // Load stats for each subject
  useEffect(() => {
    async function loadStats() {
      const result: Record<string, { total: number; correct: number; seen: number }> = {};
      for (const s of subjects) {
        const qs = await db.questions.where('subjectId').equals(s.id).toArray();
        const total = qs.length;
        const correct = qs.reduce((acc, q) => acc + q.stats.correct, 0);
        const seen = qs.reduce((acc, q) => acc + q.stats.seen, 0);
        result[s.id] = { total, correct, seen };
      }
      setStats(result);
    }
    if (subjects.length) loadStats();
  }, [subjects]);

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

  const handleExportAll = async () => {
    const bank = await exportBank();
    downloadJSON(bank, `study-bank-${new Date().toISOString().split('T')[0]}.json`);
  };

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

  const pctCorrect = (s: Subject) => {
    const st = stats[s.id];
    if (!st || st.seen === 0) return 0;
    return Math.round((st.correct / st.seen) * 100);
  };

  return (
    <div className="min-h-screen bg-ink-950 text-ink-100">
      {/* Header */}
      <header className="border-b border-ink-800 bg-ink-900/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center">
              <span className="text-ink-900 font-display font-bold text-sm">S</span>
            </div>
            <span className="font-display text-xl text-ink-100">StudyApp</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={handleExportAll}>
              ↑ Exportar banco
            </Button>
            <label className="cursor-pointer">
              <input type="file" accept=".json" className="hidden" onChange={handleImport} disabled={importLoading} />
              <span className={`inline-flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg font-medium font-body transition-all ${importLoading ? 'text-ink-500 bg-ink-800' : 'text-ink-300 hover:text-ink-100 hover:bg-ink-800'}`}>
                ↓ Importar
              </span>
            </label>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/settings')}
            >
              ⚙ Ajustes
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10">
        {/* Page title */}
        <div className="mb-8">
          <h1 className="font-display text-3xl text-ink-100 mb-1">Mis asignaturas</h1>
          <p className="text-ink-500 text-sm">
            {subjects.length === 0
              ? 'Crea tu primera asignatura para empezar'
              : `${subjects.length} asignatura${subjects.length !== 1 ? 's' : ''} · ${Object.values(stats).reduce((a, s) => a + s.total, 0)} preguntas`}
          </p>
        </div>

        {importMsg && (
          <div className={`mb-6 px-4 py-3 rounded-lg text-sm font-body border ${importMsg.startsWith('Error') ? 'bg-rose-500/10 border-rose-500/30 text-rose-400' : 'bg-sage-600/10 border-sage-600/30 text-sage-400'}`}>
            {importMsg}
          </div>
        )}

        {/* Subject grid */}
        {subjects.length === 0 ? (
          <EmptyState
            icon={<span>📚</span>}
            title="Sin asignaturas"
            description="Crea una asignatura para empezar a practicar"
            action={
              <Button onClick={() => setShowCreate(true)}>+ Nueva asignatura</Button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {subjects.map((s) => {
              const st = stats[s.id] ?? { total: 0, correct: 0, seen: 0 };
              const pct = pctCorrect(s);
              return (
                <Card
                  key={s.id}
                  hover
                  onClick={() => navigate(`/subject/${s.id}`)}
                  className="group relative overflow-hidden"
                >
                  {/* Color accent */}
                  <div
                    className="absolute top-0 left-0 right-0 h-1 rounded-t-xl"
                    style={{ backgroundColor: s.color ?? '#f59e0b' }}
                  />
                  <div className="pt-1">
                    <div className="flex items-start justify-between mb-3">
                      <h2 className="font-display text-lg text-ink-100 leading-tight group-hover:text-amber-300 transition-colors">
                        {s.name}
                      </h2>
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

                    <Countdown examDate={s.examDate} />

                    <div className="mt-4 flex items-center gap-2 text-xs text-ink-500">
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
                        className="mt-3"
                      />
                    )}
                  </div>
                </Card>
              );
            })}

            {/* Add new button */}
            <button
              onClick={() => setShowCreate(true)}
              className="border-2 border-dashed border-ink-700 hover:border-amber-500/50 rounded-xl p-5 flex flex-col items-center justify-center gap-3 text-ink-500 hover:text-amber-400 transition-all duration-200 min-h-[140px] group"
            >
              <span className="text-3xl group-hover:scale-110 transition-transform">+</span>
              <span className="text-sm font-medium font-body">Nueva asignatura</span>
            </button>
          </div>
        )}
      </main>

      {/* Create modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Nueva asignatura">
        <div className="flex flex-col gap-4">
          <Input
            label="Nombre"
            value={subjectName}
            onChange={(e) => setSubjectName(e.target.value)}
            placeholder="Ej: IA Razonamiento y Planificación"
            autoFocus
          />
          <Input
            label="Fecha de examen (opcional)"
            type="date"
            value={subjectExamDate}
            onChange={(e) => setSubjectExamDate(e.target.value)}
          />
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium text-ink-400 uppercase tracking-widest">Color</p>
            <div className="flex gap-2 flex-wrap">
              {SUBJECT_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setSubjectColor(c)}
                  className={`w-7 h-7 rounded-full transition-all ${subjectColor === c ? 'ring-2 ring-offset-2 ring-offset-ink-800 ring-white scale-110' : 'hover:scale-105'}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => setShowCreate(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={!subjectName.trim()}>Crear asignatura</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
