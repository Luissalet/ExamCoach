import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '@/data/db';
import { deliverableRepo, gradingConfigRepo } from '@/data/deliverableRepo';
import { subjectRepo } from '@/data/repos';
import { calcGradeBreakdown, fmt, DEFAULT_GRADING_CONFIG } from '@/domain/grading';
import type { Deliverable, Subject, SubjectGradingConfig } from '@/domain/models';
import { Button, Modal } from '@/ui/components';
import { v4 as uuidv4 } from 'uuid';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalize(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function matchSubject(csvName: string, subjects: Subject[]): Subject | undefined {
  const n = normalize(csvName);
  return subjects.find(
    (s) => normalize(s.name).includes(n) || n.includes(normalize(s.name)),
  );
}

function parseGrade(raw: string): number | undefined {
  if (!raw || raw.trim() === '-') return undefined;
  const cleaned = raw.replace(',', '.');
  const n = parseFloat(cleaned);
  return isNaN(n) ? undefined : n;
}

function parseDateES(raw: string): string | undefined {
  if (!raw) return undefined;
  const parts = raw.split('/');
  if (parts.length !== 3) return undefined;
  const [d, m, y] = parts;
  return `${y.padStart(4, '20')}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

function isTestName(name: string) {
  return /^test/i.test(name.trim());
}

function dueDateColor(dueDate: string | undefined, completed: boolean): string {
  if (completed) return 'text-sage-400';
  if (!dueDate) return 'text-ink-500';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  const diff = Math.ceil((due.getTime() - today.getTime()) / 86400000);
  if (diff < 0) return 'text-rose-400';
  if (diff <= 7) return 'text-amber-400';
  return 'text-ink-500';
}

function dueDateLabel(dueDate: string | undefined, completed: boolean): string {
  if (!dueDate) return '';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  const diff = Math.ceil((due.getTime() - today.getTime()) / 86400000);
  const formatted = due.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  if (completed) return formatted;
  if (diff < 0) return `${formatted} · vencido`;
  if (diff === 0) return `${formatted} · hoy`;
  if (diff === 1) return `${formatted} · mañana`;
  if (diff <= 7) return `${formatted} · ${diff}d`;
  return formatted;
}

// ─── CSV Import ───────────────────────────────────────────────────────────────

async function importFromCSV(
  csvText: string,
  subjects: Subject[],
  defaultTestPts: number,
): Promise<{ created: number; skipped: number }> {
  // Normalize line endings and split
  const lines = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

  // Parse header
  const headerLine = lines[0];
  const headers = parseCSVRow(headerLine).map((h) => normalize(h));

  const idx = {
    subject: headers.findIndex((h) => h.includes('asignatura')),
    name: headers.findIndex((h) => h.includes('actividad') || h.includes('nombre')),
    start: headers.findIndex((h) => h === 'inicio'),
    end: headers.findIndex((h) => h === 'fin'),
    completed: headers.findIndex((h) => h.includes('entregado')),
    grade: headers.findIndex((h) => h === 'nota'),
  };

  const batchNow = new Date().toISOString();
  let created = 0;
  let skipped = 0;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) { skipped++; continue; }

    const row = parseCSVRow(line);
    const subjectName = row[idx.subject] ?? '';
    const name = row[idx.name] ?? '';
    if (!subjectName || !name) { skipped++; continue; }

    const subject = matchSubject(subjectName, subjects);
    if (!subject) { skipped++; continue; }

    const type: 'activity' | 'test' = isTestName(name) ? 'test' : 'activity';
    const completed = (row[idx.completed] ?? '').toUpperCase() === 'TRUE';
    const grade = parseGrade(row[idx.grade] ?? '');
    const dueDate = parseDateES(row[idx.end] ?? '');
    const startDate = parseDateES(row[idx.start] ?? '');

    const deliverable: Deliverable = {
      id: uuidv4(),
      subjectId: subject.id,
      name,
      type,
      startDate,
      dueDate,
      completed,
      grade: completed && grade != null ? grade : undefined,
      continuousPoints: type === 'test' ? defaultTestPts : 0,
      createdAt: batchNow,
      updatedAt: batchNow,
    };

    try {
      await db.deliverables.add(deliverable);
      created++;
    } catch {
      skipped++;
    }
  }

  return { created, skipped };
}

/** Simple CSV row parser that handles quoted fields. */
function parseCSVRow(line: string): string[] {
  const result: string[] = [];
  let inQuote = false;
  let cell = '';
  for (let i = 0; i <= line.length; i++) {
    const ch = i < line.length ? line[i] : ',';
    if (ch === '"') { inQuote = !inQuote; continue; }
    if (ch === ',' && !inQuote) { result.push(cell.trim()); cell = ''; }
    else cell += ch;
  }
  return result;
}

// ─── Grade Calculator ─────────────────────────────────────────────────────────

interface GradeCalculatorProps {
  config: SubjectGradingConfig;
  deliverables: Deliverable[];
  onConfigChange: (config: SubjectGradingConfig) => void;
}

function GradeCalculator({ config, deliverables, onConfigChange }: GradeCalculatorProps) {
  const bd = calcGradeBreakdown(config, deliverables);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(config);

  useEffect(() => setDraft(config), [config]);

  const gradeColor = (g: number) =>
    g >= 9 ? 'text-sage-400' : g >= 7 ? 'text-green-400' : g >= 5 ? 'text-amber-400' : 'text-rose-400';

  const handleSave = () => {
    onConfigChange(draft);
    setEditing(false);
  };

  // Percentage of continuous used
  const continuousPct =
    config.maxContinuousPoints === 0
      ? 0
      : Math.min((bd.rawContinuous / config.maxContinuousPoints) * 100, 100);

  return (
    <div className="bg-ink-900 border border-ink-700 rounded-xl p-4 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium text-ink-400 uppercase tracking-widest">
          Calculadora de nota
        </h3>
        <button
          onClick={() => setEditing(!editing)}
          className="text-xs text-ink-600 hover:text-amber-400 transition-colors"
        >
          ⚙ Configurar
        </button>
      </div>

      {/* Config panel */}
      {editing && (
        <div className="flex flex-col gap-3 p-3 bg-ink-850 rounded-lg border border-ink-700">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-ink-400 mb-1 block">Peso continua (%)</label>
              <input
                type="number" min={0} max={100} step={5}
                value={Math.round(draft.continuousWeight * 100)}
                onChange={(e) => setDraft({ ...draft, continuousWeight: Number(e.target.value) / 100 })}
                className="w-full bg-ink-800 border border-ink-600 rounded-lg px-3 py-1.5 text-sm text-ink-100"
              />
            </div>
            <div>
              <label className="text-xs text-ink-400 mb-1 block">Máx. continua (pts)</label>
              <input
                type="number" min={1} step={1}
                value={draft.maxContinuousPoints}
                onChange={(e) => setDraft({ ...draft, maxContinuousPoints: Number(e.target.value) })}
                className="w-full bg-ink-800 border border-ink-600 rounded-lg px-3 py-1.5 text-sm text-ink-100"
              />
            </div>
            <div>
              <label className="text-xs text-ink-400 mb-1 block">Puntos por test</label>
              <input
                type="number" min={0} step={0.05}
                value={draft.testContinuousPoints}
                onChange={(e) => setDraft({ ...draft, testContinuousPoints: Number(e.target.value) })}
                className="w-full bg-ink-800 border border-ink-600 rounded-lg px-3 py-1.5 text-sm text-ink-100"
              />
            </div>
            <div>
              <label className="text-xs text-ink-400 mb-1 block">Nota examen (0-10)</label>
              <input
                type="number" min={0} max={10} step={0.1}
                placeholder="—"
                value={draft.examGrade ?? ''}
                onChange={(e) =>
                  setDraft({ ...draft, examGrade: e.target.value === '' ? undefined : Number(e.target.value) })
                }
                className="w-full bg-ink-800 border border-ink-600 rounded-lg px-3 py-1.5 text-sm text-ink-100"
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancelar</Button>
            <Button size="sm" onClick={handleSave}>Guardar</Button>
          </div>
        </div>
      )}

      {/* Visual breakdown */}
      <div className="flex flex-col gap-3">
        {/* Raw continuous bar */}
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-ink-500">Continua bruta</span>
            <span className="text-amber-400 font-medium">
              {fmt(bd.rawContinuous)} / {config.maxContinuousPoints} pts
              {bd.rawContinuous > config.maxContinuousPoints && (
                <span className="text-ink-500 ml-1">(cap {config.maxContinuousPoints})</span>
              )}
            </span>
          </div>
          <div className="h-2 bg-ink-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-amber-500 rounded-full transition-all"
              style={{ width: `${continuousPct}%` }}
            />
          </div>
        </div>

        {/* Flow equation */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-ink-850 rounded-lg p-3 border border-ink-700">
            <p className="text-xs text-ink-500 mb-1">Continua</p>
            <p className={`text-2xl font-display font-bold ${gradeColor(bd.continuousContribution / (config.continuousWeight || 1))}`}>
              {fmt(bd.continuousContribution)}
            </p>
            <p className="text-xs text-ink-600 mt-0.5">
              / {fmt(config.maxContinuousPoints * config.continuousWeight)}
            </p>
          </div>

          <div className="bg-ink-850 rounded-lg p-3 border border-ink-700">
            <p className="text-xs text-ink-500 mb-1">Examen</p>
            {bd.examContribution != null ? (
              <>
                <p className={`text-2xl font-display font-bold ${gradeColor(bd.examContribution / (1 - config.continuousWeight))}`}>
                  {fmt(bd.examContribution)}
                </p>
                <p className="text-xs text-ink-600 mt-0.5">
                  / {fmt(10 * (1 - config.continuousWeight))}
                </p>
              </>
            ) : (
              <p className="text-xl font-display text-ink-600 mt-1">—</p>
            )}
          </div>

          <div className={`rounded-lg p-3 border ${bd.finalGrade != null ? 'bg-ink-800 border-amber-700/30' : 'bg-ink-850 border-ink-700'}`}>
            <p className="text-xs text-ink-500 mb-1">Final</p>
            {bd.finalGrade != null ? (
              <p className={`text-2xl font-display font-bold ${gradeColor(bd.finalGrade)}`}>
                {fmt(bd.finalGrade)}
              </p>
            ) : (
              <p className="text-sm font-display text-ink-500 mt-1.5">
                {fmt(bd.continuousContribution)} + ?
              </p>
            )}
          </div>
        </div>

        {/* Formula hint */}
        <p className="text-xs text-ink-700 text-center">
          min({fmt(bd.rawContinuous)}, {config.maxContinuousPoints}) × {Math.round(config.continuousWeight * 100)}%
          {config.examGrade != null && ` + ${config.examGrade} × ${Math.round((1 - config.continuousWeight) * 100)}%`}
          {bd.finalGrade != null && ` = ${fmt(bd.finalGrade)}`}
        </p>

        {bd.remainingPotential > 0.005 && (
          <p className="text-xs text-ink-600 text-center">
            Potencial restante: +{fmt(bd.remainingPotential)} pts en continua
            {bd.bestCaseGrade != null && (
              <span className="text-ink-500"> → mejor caso {fmt(bd.bestCaseGrade)}</span>
            )}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Deliverable Row ──────────────────────────────────────────────────────────

interface DeliverableRowProps {
  d: Deliverable;
  onToggle: (id: string, completed: boolean) => void;
  onGradeChange: (id: string, grade: number | undefined) => void;
  onPointsChange: (id: string, pts: number) => void;
  onDelete: (id: string) => void;
}

function DeliverableRow({
  d,
  onToggle,
  onGradeChange,
  onPointsChange,
  onDelete,
}: DeliverableRowProps) {
  const dateColor = dueDateColor(d.dueDate, d.completed);
  const dateLabel = dueDateLabel(d.dueDate, d.completed);
  const [editingPts, setEditingPts] = useState(false);

  return (
    <div
      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all group ${
        d.completed
          ? 'bg-ink-900/40 border border-ink-800/30'
          : 'bg-ink-850 border border-ink-700 hover:border-ink-600'
      }`}
    >
      {/* Checkbox */}
      <button
        onClick={() => onToggle(d.id, !d.completed)}
        className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all ${
          d.completed
            ? 'bg-sage-500 border-sage-500 text-white'
            : 'border-ink-600 hover:border-sage-400'
        }`}
      >
        {d.completed && <span className="text-xs leading-none">✓</span>}
      </button>

      {/* Name + date */}
      <div className="flex-1 min-w-0">
        <p
          className={`text-sm font-body ${
            d.completed ? 'text-ink-500 line-through' : 'text-ink-200'
          }`}
        >
          {d.name}
        </p>
        {dateLabel && (
          <p className={`text-xs mt-0.5 font-body ${dateColor}`}>{dateLabel}</p>
        )}
      </div>

      {/* Continuous pts badge — click to edit */}
      {editingPts ? (
        <input
          type="number"
          min={0}
          step={0.1}
          autoFocus
          className="w-16 bg-ink-800 border border-amber-500 rounded px-1.5 py-0.5 text-xs text-ink-100 text-center"
          defaultValue={d.continuousPoints}
          onBlur={(e) => {
            const v = parseFloat(e.target.value);
            if (!isNaN(v)) onPointsChange(d.id, v);
            setEditingPts(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') setEditingPts(false);
          }}
        />
      ) : (
        <button
          onClick={() => setEditingPts(true)}
          title="Puntos en continua — clic para editar"
          className={`text-xs px-1.5 py-0.5 rounded border transition-colors ${
            d.continuousPoints === 0 && d.type === 'activity'
              ? 'border-rose-700/50 text-rose-500 bg-rose-900/20 hover:border-rose-400'
              : 'border-ink-700 text-ink-500 bg-ink-800 hover:border-amber-500 hover:text-amber-400'
          }`}
        >
          {d.continuousPoints === 0 && d.type === 'activity' ? '? pts' : `${d.continuousPoints} pts`}
        </button>
      )}

      {/* Grade input (activities only) */}
      {d.type === 'activity' && (
        <input
          type="number"
          min={0}
          max={10}
          step={0.1}
          placeholder="nota"
          disabled={!d.completed}
          value={d.grade ?? ''}
          onChange={(e) =>
            onGradeChange(
              d.id,
              e.target.value === '' ? undefined : parseFloat(e.target.value),
            )
          }
          className={`w-16 bg-ink-800 border rounded px-2 py-0.5 text-xs text-center font-body transition-colors ${
            d.completed
              ? 'border-ink-600 text-ink-200 hover:border-amber-500 focus:border-amber-500 outline-none'
              : 'border-ink-800 text-ink-700 cursor-not-allowed'
          }`}
        />
      )}

      {/* Type badge */}
      <span
        className={`text-xs px-1.5 py-0.5 rounded border font-medium flex-shrink-0 ${
          d.type === 'test'
            ? 'bg-blue-900/30 text-blue-400 border-blue-800/40'
            : 'bg-amber-900/20 text-amber-500 border-amber-800/30'
        }`}
      >
        {d.type === 'test' ? 'Test' : 'Act.'}
      </span>

      {/* Delete */}
      <button
        onClick={() => onDelete(d.id)}
        className="opacity-0 group-hover:opacity-100 text-ink-600 hover:text-rose-400 transition-all w-5 h-5 flex items-center justify-center text-xs flex-shrink-0"
        title="Eliminar"
      >
        ✕
      </button>
    </div>
  );
}

// ─── Add Deliverable Form ─────────────────────────────────────────────────────

interface AddFormProps {
  subjectId: string;
  defaultTestPoints: number;
  onAdd: (d: Omit<Deliverable, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onClose: () => void;
}

function AddDeliverableForm({ subjectId, defaultTestPoints, onAdd, onClose }: AddFormProps) {
  const [name, setName] = useState('');
  const [type, setType] = useState<'activity' | 'test'>('activity');
  const [dueDate, setDueDate] = useState('');
  const [continuousPoints, setContinuousPoints] = useState('');

  const defaultPts = type === 'test' ? defaultTestPoints : 0;

  const handleSubmit = () => {
    if (!name.trim()) return;
    const pts = continuousPoints !== '' ? parseFloat(continuousPoints) : defaultPts;
    onAdd({
      subjectId,
      name: name.trim(),
      type,
      dueDate: dueDate || undefined,
      completed: false,
      grade: undefined,
      continuousPoints: isNaN(pts) ? defaultPts : pts,
    });
  };

  return (
    <div className="flex flex-col gap-3 p-4 bg-ink-850 rounded-xl border border-ink-600">
      {/* Type selector */}
      <div className="flex gap-2">
        {(['activity', 'test'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setType(t)}
            className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              type === t
                ? t === 'test'
                  ? 'bg-blue-600 text-white'
                  : 'bg-amber-500 text-ink-900'
                : 'bg-ink-800 text-ink-400 hover:text-ink-200'
            }`}
          >
            {t === 'test' ? 'Test' : 'Actividad'}
          </button>
        ))}
      </div>

      <input
        autoFocus
        placeholder={type === 'test' ? 'Test Tema 1' : 'Actividad 1: ...'}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && name.trim() && handleSubmit()}
        className="bg-ink-800 border border-ink-600 rounded-lg px-3 py-2 text-sm text-ink-100 placeholder-ink-600 focus:border-amber-500 outline-none"
      />

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-ink-500 mb-1 block">Fecha límite</label>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full bg-ink-800 border border-ink-600 rounded-lg px-2 py-1.5 text-sm text-ink-100"
          />
        </div>
        <div>
          <label className="text-xs text-ink-500 mb-1 block">
            Pts continua {type === 'test' ? `(def. ${defaultTestPoints})` : ''}
          </label>
          <input
            type="number"
            min={0}
            step={0.1}
            placeholder={String(defaultPts)}
            value={continuousPoints}
            onChange={(e) => setContinuousPoints(e.target.value)}
            className="w-full bg-ink-800 border border-ink-600 rounded-lg px-2 py-1.5 text-sm text-ink-100"
          />
        </div>
      </div>

      <div className="flex gap-2 justify-end">
        <Button size="sm" variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button size="sm" onClick={handleSubmit} disabled={!name.trim()}>
          Añadir
        </Button>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function DeliverablesPage() {
  const navigate = useNavigate();

  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('');
  const [deliverables, setDeliverables] = useState<Deliverable[]>([]);
  const [config, setConfig] = useState<SubjectGradingConfig>({
    id: '',
    ...DEFAULT_GRADING_CONFIG,
  });
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [csvMsg, setCsvMsg] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const csvInputRef = useRef<HTMLInputElement>(null);

  // Load subjects
  useEffect(() => {
    subjectRepo.getAll().then((ss) => {
      setSubjects(ss);
      if (ss.length > 0) setSelectedSubjectId(ss[0].id);
      setLoading(false);
    });
  }, []);

  // Load deliverables + config when subject changes
  const loadSubjectData = useCallback(async (subjectId: string) => {
    if (!subjectId) return;
    const [ds, cfg] = await Promise.all([
      deliverableRepo.getBySubject(subjectId),
      gradingConfigRepo.get(subjectId),
    ]);
    setDeliverables(ds);
    setConfig(cfg);
  }, []);

  useEffect(() => {
    loadSubjectData(selectedSubjectId);
  }, [selectedSubjectId, loadSubjectData]);

  // ─── Handlers ───────────────────────────────────────────────────────────────

  const handleToggle = async (id: string, completed: boolean) => {
    await deliverableRepo.update(id, { completed });
    setDeliverables((prev) =>
      prev.map((d) => (d.id === id ? { ...d, completed } : d)),
    );
  };

  const handleGradeChange = async (id: string, grade: number | undefined) => {
    await deliverableRepo.update(id, { grade });
    setDeliverables((prev) =>
      prev.map((d) => (d.id === id ? { ...d, grade } : d)),
    );
  };

  const handlePointsChange = async (id: string, continuousPoints: number) => {
    await deliverableRepo.update(id, { continuousPoints });
    setDeliverables((prev) =>
      prev.map((d) => (d.id === id ? { ...d, continuousPoints } : d)),
    );
  };

  const handleDelete = async (id: string) => {
    await deliverableRepo.delete(id);
    setDeliverables((prev) => prev.filter((d) => d.id !== id));
  };

  const handleAdd = async (data: Omit<Deliverable, 'id' | 'createdAt' | 'updatedAt'>) => {
    const d = await deliverableRepo.create(data);
    setDeliverables((prev) =>
      [...prev, d].sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? '')),
    );
    setShowAdd(false);
  };

  const handleConfigChange = async (newConfig: SubjectGradingConfig) => {
    await gradingConfigRepo.save(newConfig);
    setConfig(newConfig);
    // Refresh deliverables in case test points changed
    await loadSubjectData(selectedSubjectId);
  };

  const handleCSVImport = async (file: File) => {
    setCsvMsg('Importando…');
    try {
      const text = await file.text();
      const { created, skipped } = await importFromCSV(
        text,
        subjects,
        config.testContinuousPoints,
      );
      setCsvMsg(`✓ ${created} importadas (${skipped} omitidas)`);
      await loadSubjectData(selectedSubjectId);
    } catch (e) {
      console.error(e);
      setCsvMsg('Error al importar el CSV');
    }
    setTimeout(() => setCsvMsg(null), 5000);
  };

  const handleClearAll = async () => {
    await deliverableRepo.deleteBySubject(selectedSubjectId);
    setDeliverables([]);
    setShowClearConfirm(false);
  };

  // ─── Derived state ───────────────────────────────────────────────────────────

  const currentSubject = subjects.find((s) => s.id === selectedSubjectId);
  const activities = deliverables.filter((d) => d.type === 'activity');
  const tests = deliverables.filter((d) => d.type === 'test');
  const completedActs = activities.filter((d) => d.completed).length;
  const completedTests = tests.filter((d) => d.completed).length;

  // ─── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-ink-950 flex items-center justify-center">
        <p className="text-ink-500 text-sm">Cargando…</p>
      </div>
    );
  }

  if (subjects.length === 0) {
    return (
      <div className="min-h-screen bg-ink-950 flex flex-col items-center justify-center gap-4">
        <p className="text-ink-400">No hay asignaturas. Créalas primero.</p>
        <Button onClick={() => navigate('/')}>← Ir al inicio</Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-ink-950 flex flex-col">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="border-b border-ink-800 bg-ink-950/80 backdrop-blur sticky top-0 z-10 px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => navigate('/')}
          className="text-ink-500 hover:text-ink-200 transition-colors text-sm"
        >
          ←
        </button>
        <h1 className="font-display text-base text-ink-100">Actividades & Notas</h1>
        <div className="flex-1" />

        {csvMsg && (
          <span
            className={`text-xs px-3 py-1 rounded-lg border ${
              csvMsg.startsWith('✓')
                ? 'text-sage-400 border-sage-700/30 bg-sage-900/10'
                : 'text-rose-400 border-rose-700/30 bg-rose-900/10'
            }`}
          >
            {csvMsg}
          </span>
        )}
        <input
          ref={csvInputRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleCSVImport(f);
            e.target.value = '';
          }}
        />
        <Button size="sm" variant="ghost" onClick={() => csvInputRef.current?.click()}>
          📥 Importar CSV
        </Button>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* ── Subject sidebar ──────────────────────────────────────────────── */}
        <aside className="w-44 border-r border-ink-800 flex flex-col py-3 gap-0.5 px-2 overflow-y-auto flex-shrink-0">
          {subjects.map((s) => (
            <button
              key={s.id}
              onClick={() => setSelectedSubjectId(s.id)}
              className={`w-full text-left px-2.5 py-2 rounded-lg text-sm transition-all font-body ${
                s.id === selectedSubjectId
                  ? 'bg-ink-800 text-ink-100 font-medium'
                  : 'text-ink-500 hover:text-ink-300 hover:bg-ink-900'
              }`}
            >
              <div className="flex items-center gap-2">
                {s.color && (
                  <div
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: s.color }}
                  />
                )}
                <span className="truncate text-xs">{s.name}</span>
              </div>
            </button>
          ))}
        </aside>

        {/* ── Main content ─────────────────────────────────────────────────── */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto px-6 py-6 flex flex-col gap-6">
            {/* Subject header */}
            {currentSubject && (
              <div className="flex items-start justify-between gap-3">
                <h2 className="font-display text-xl text-ink-100 leading-tight">
                  {currentSubject.name}
                </h2>
                <div className="flex items-center gap-3 text-xs text-ink-600 flex-shrink-0 mt-1">
                  <span>{completedActs}/{activities.length} act.</span>
                  <span>·</span>
                  <span>{completedTests}/{tests.length} tests</span>
                  {deliverables.length > 0 && (
                    <>
                      <span>·</span>
                      <button
                        onClick={() => setShowClearConfirm(true)}
                        className="text-rose-700 hover:text-rose-400 transition-colors"
                      >
                        Limpiar
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Grade calculator */}
            <GradeCalculator
              config={config}
              deliverables={deliverables}
              onConfigChange={handleConfigChange}
            />

            {/* Activities section */}
            <section className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-medium text-ink-500 uppercase tracking-widest">
                  Actividades
                </h3>
                <span className="text-xs text-ink-700">
                  {completedActs}/{activities.length}
                </span>
              </div>

              {activities.length === 0 ? (
                <p className="text-xs text-ink-700 text-center py-3">
                  Sin actividades. Importa un CSV o añade manualmente.
                </p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {activities.map((d) => (
                    <DeliverableRow
                      key={d.id}
                      d={d}
                      onToggle={handleToggle}
                      onGradeChange={handleGradeChange}
                      onPointsChange={handlePointsChange}
                      onDelete={handleDelete}
                    />
                  ))}
                </div>
              )}
            </section>

            {/* Tests section */}
            <section className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-medium text-ink-500 uppercase tracking-widest">
                  Tests{' '}
                  <span className="text-ink-700 normal-case">
                    ({config.testContinuousPoints} pts c/u)
                  </span>
                </h3>
                <span className="text-xs text-ink-700">
                  {completedTests}/{tests.length}
                </span>
              </div>

              {tests.length === 0 ? (
                <p className="text-xs text-ink-700 text-center py-3">
                  Sin tests registrados.
                </p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {tests.map((d) => (
                    <DeliverableRow
                      key={d.id}
                      d={d}
                      onToggle={handleToggle}
                      onGradeChange={handleGradeChange}
                      onPointsChange={handlePointsChange}
                      onDelete={handleDelete}
                    />
                  ))}
                </div>
              )}
            </section>

            {/* Add form / button */}
            {showAdd ? (
              <AddDeliverableForm
                subjectId={selectedSubjectId}
                defaultTestPoints={config.testContinuousPoints}
                onAdd={handleAdd}
                onClose={() => setShowAdd(false)}
              />
            ) : (
              <button
                onClick={() => setShowAdd(true)}
                className="w-full py-3 border-2 border-dashed border-ink-800 rounded-xl text-sm text-ink-700 hover:text-amber-500 hover:border-amber-800 transition-colors"
              >
                + Añadir actividad o test
              </button>
            )}
          </div>
        </main>
      </div>

      {/* Clear confirm modal */}
      <Modal
        open={showClearConfirm}
        onClose={() => setShowClearConfirm(false)}
        title="Limpiar actividades"
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-ink-300 font-body">
            ¿Eliminar todas las actividades de{' '}
            <strong className="text-ink-100">{currentSubject?.name}</strong>?
            Esta acción no se puede deshacer.
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setShowClearConfirm(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleClearAll}
              className="bg-rose-600 hover:bg-rose-500 text-white border-rose-600"
            >
              Eliminar todo
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
