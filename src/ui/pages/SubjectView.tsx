import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useStore } from '@/ui/store';
import {
  Button, Card, Modal, Input, Tabs, Badge, TypeBadge, Difficulty,
  EmptyState, StatsSummary, Select,
} from '@/ui/components';
import { QuestionForm } from '@/ui/components/QuestionForm';
import { PdfViewer, type PdfViewerHandle } from '@/ui/components/PdfViewer';
import { loadPdfList, getPdfUrl } from '@/data/resourceLoader';
import type { Topic, Question, QuestionOrigin } from '@/domain/models';

type TabId = 'topics' | 'questions' | 'practice' | 'pdfs';

const ORIGIN_LABELS: Record<QuestionOrigin, string> = {
  test: 'Test',
  examen_anterior: 'Examen ant.',
  clase: 'Clase',
  alumno: 'Alumno',
};

const ORIGIN_COLORS: Record<QuestionOrigin, 'amber' | 'rose' | 'blue' | 'sage'> = {
  test: 'amber',
  examen_anterior: 'rose',
  clase: 'blue',
  alumno: 'sage',
};

export function SubjectView() {
  const { subjectId } = useParams<{ subjectId: string }>();
  const navigate = useNavigate();
  const {
    subjects, topics, questions,
    loadSubjects, loadTopics, loadQuestions,
    createTopic, updateTopic, deleteTopic,
    createQuestion, updateQuestion, deleteQuestion, duplicateQuestion,
  } = useStore();

  const subject = subjects.find((s) => s.id === subjectId);
  const [tab, setTab] = useState<TabId>('topics');

  // Filters for questions tab
  const [filterTopic, setFilterTopic] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterOrigin, setFilterOrigin] = useState('');
  const [filterText, setFilterText] = useState('');

  // Modals
  const [topicModal, setTopicModal] = useState(false);
  const [editingTopic, setEditingTopic] = useState<Topic | null>(null);
  const [topicTitle, setTopicTitle] = useState('');
  const [questionModal, setQuestionModal] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);

  // PDF tab
  const [pdfList, setPdfList] = useState<string[]>([]);
  const [pdfLoaded, setPdfLoaded] = useState(false);
  const pdfViewerRef = useRef<PdfViewerHandle>(null);
  // Pending page navigation (set when user clicks "open at page X")
  const [pendingPdfPage, setPendingPdfPage] = useState<number | null>(null);

  useEffect(() => {
    if (!subjects.length) loadSubjects();
  }, []);

  useEffect(() => {
    if (subjectId) {
      loadTopics(subjectId);
      loadQuestions(subjectId);
    }
  }, [subjectId]);

  // Load PDF list when subject becomes available
  useEffect(() => {
    if (!subject) return;
    setPdfLoaded(false);
    loadPdfList(subject.name).then((list) => {
      setPdfList(list);
      setPdfLoaded(true);
    });
  }, [subject?.name]);

  // When switching to PDF tab with a pending page, navigate
  useEffect(() => {
    if (tab === 'pdfs' && pendingPdfPage !== null) {
      // Wait one tick for PdfViewer to mount / load
      setTimeout(() => {
        pdfViewerRef.current?.goToPage(pendingPdfPage);
        setPendingPdfPage(null);
      }, 300);
    }
  }, [tab, pendingPdfPage]);

  if (!subject) {
    return (
      <div className="min-h-screen bg-ink-950 flex items-center justify-center">
        <div className="text-ink-500 text-center">
          <p className="font-display text-xl mb-4">Asignatura no encontrada</p>
          <Button onClick={() => navigate('/')}>← Inicio</Button>
        </div>
      </div>
    );
  }

  const subjectTopics = topics.filter((t) => t.subjectId === subjectId);
  const subjectQuestions = questions.filter((q) => q.subjectId === subjectId);

  // Apply filters
  const filteredQuestions = subjectQuestions.filter((q) => {
    if (filterTopic && q.topicId !== filterTopic) return false;
    if (filterType && q.type !== filterType) return false;
    if (filterOrigin && q.origin !== filterOrigin) return false;
    if (filterText) {
      const text = filterText.toLowerCase();
      if (!q.prompt.toLowerCase().includes(text) && !(q.tags ?? []).join(' ').toLowerCase().includes(text))
        return false;
    }
    return true;
  });

  const handleTopicSave = async () => {
    if (!topicTitle.trim() || !subjectId) return;
    if (editingTopic) {
      await updateTopic(editingTopic.id, { title: topicTitle });
    } else {
      const order = subjectTopics.length;
      await createTopic({ subjectId, title: topicTitle, order });
    }
    setTopicModal(false);
    setTopicTitle('');
    setEditingTopic(null);
  };

  const handleQuestionSave = async (data: Omit<Question, 'id' | 'stats' | 'createdAt' | 'updatedAt' | 'contentHash'>) => {
    if (editingQuestion) {
      await updateQuestion(editingQuestion.id, data);
    } else {
      await createQuestion(data);
    }
    setQuestionModal(false);
    setEditingQuestion(null);
  };

  const openEditTopic = (t: Topic) => {
    setEditingTopic(t);
    setTopicTitle(t.title);
    setTopicModal(true);
  };

  const openEditQuestion = (q: Question) => {
    setEditingQuestion(q);
    setQuestionModal(true);
  };

  /** Navega al visor PDF en la página indicada. */
  const openPdfAtPage = (page: number) => {
    if (tab === 'pdfs') {
      pdfViewerRef.current?.goToPage(page);
    } else {
      setPendingPdfPage(page);
      setTab('pdfs');
    }
  };

  const totalStats = subjectQuestions.reduce(
    (acc, q) => ({
      seen: acc.seen + q.stats.seen,
      correct: acc.correct + q.stats.correct,
      wrong: acc.wrong + q.stats.wrong,
    }),
    { seen: 0, correct: 0, wrong: 0 }
  );

  const tabs = [
    { id: 'topics', label: 'Temas' },
    { id: 'questions', label: `Preguntas (${subjectQuestions.length})` },
    { id: 'practice', label: 'Practicar' },
    { id: 'pdfs', label: `PDFs${pdfList.length ? ` (${pdfList.length})` : ''}` },
  ];

  return (
    <div className="min-h-screen bg-ink-950 text-ink-100 flex flex-col">
      {/* Header */}
      <header className="border-b border-ink-800 bg-ink-900/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/')}
              className="text-ink-400 hover:text-ink-200 transition-colors text-sm"
            >
              ← Inicio
            </button>
            <div
              className="w-3 h-3 rounded-full flex-shrink-0"
              style={{ backgroundColor: subject.color ?? '#f59e0b' }}
            />
            <h1 className="font-display text-xl text-ink-100">{subject.name}</h1>
          </div>
          <div className="mt-3">
            <Tabs
              tabs={tabs}
              active={tab}
              onChange={(id) => setTab(id as TabId)}
            />
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex flex-col max-w-5xl mx-auto w-full px-6 py-6 gap-4">

        {/* TOPICS TAB */}
        {tab === 'topics' && (
          <div className="flex flex-col gap-4">
            <div className="flex justify-end">
              <Button size="sm" onClick={() => { setEditingTopic(null); setTopicTitle(''); setTopicModal(true); }}>
                + Nuevo tema
              </Button>
            </div>
            {subjectTopics.length === 0 ? (
              <EmptyState icon={<span>📚</span>} title="Sin temas" description="Crea un tema para organizar tus preguntas" />
            ) : (
              <div className="flex flex-col gap-2">
                {subjectTopics.map((t) => {
                  const qs = subjectQuestions.filter((q) => q.topicId === t.id);
                  return (
                    <Card key={t.id} className="group">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-ink-100">{t.title}</p>
                          <p className="text-xs text-ink-500 mt-0.5">{qs.length} pregunta{qs.length !== 1 ? 's' : ''}</p>
                        </div>
                        <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button size="sm" variant="ghost" onClick={() => {
                            setFilterTopic(t.id);
                            setTab('questions');
                          }}>Ver</Button>
                          <Button size="sm" variant="ghost" onClick={() => openEditTopic(t)}>✎</Button>
                          <Button size="sm" variant="ghost" onClick={() => {
                            if (confirm(`¿Eliminar el tema "${t.title}" y sus preguntas?`)) deleteTopic(t.id);
                          }}>
                            <span className="text-rose-400">✕</span>
                          </Button>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* QUESTIONS TAB */}
        {tab === 'questions' && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <StatsSummary seen={totalStats.seen} correct={totalStats.correct} wrong={totalStats.wrong} />
              <Button size="sm" onClick={() => { setEditingQuestion(null); setQuestionModal(true); }}>
                + Nueva pregunta
              </Button>
            </div>

            {/* Filters */}
            {subjectQuestions.length > 0 && (
              <div className="flex gap-3 flex-wrap">
                <Select value={filterTopic} onChange={(e) => setFilterTopic(e.target.value)} className="text-xs py-1.5">
                  <option value="">Todos los temas</option>
                  {subjectTopics.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
                </Select>
                <Select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="text-xs py-1.5">
                  <option value="">Todos los tipos</option>
                  <option value="TEST">Test</option>
                  <option value="DESARROLLO">Desarrollo</option>
                  <option value="COMPLETAR">Completar</option>
                </Select>
                <Select value={filterOrigin} onChange={(e) => setFilterOrigin(e.target.value)} className="text-xs py-1.5">
                  <option value="">Todos los orígenes</option>
                  <option value="test">Test / Práctica</option>
                  <option value="examen_anterior">Examen anterior</option>
                  <option value="clase">Clase</option>
                  <option value="alumno">Alumno</option>
                </Select>
                <input
                  value={filterText}
                  onChange={(e) => setFilterText(e.target.value)}
                  placeholder="Buscar..."
                  className="bg-ink-800 border border-ink-600 text-ink-100 rounded-lg px-3 py-1.5 text-sm font-body placeholder:text-ink-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
                {(filterTopic || filterType || filterOrigin || filterText) && (
                  <Button size="sm" variant="ghost" onClick={() => {
                    setFilterTopic(''); setFilterType(''); setFilterOrigin(''); setFilterText('');
                  }}>
                    × Limpiar
                  </Button>
                )}
              </div>
            )}

            {subjectQuestions.length === 0 ? (
              <EmptyState icon={<span>❓</span>} title="Sin preguntas" description="Añade preguntas para empezar a practicar" />
            ) : filteredQuestions.length === 0 ? (
              <EmptyState icon={<span>🔍</span>} title="Sin resultados" description="Prueba otros filtros" />
            ) : (
              <div className="flex flex-col gap-2">
                {filteredQuestions.map((q) => {
                  const topic = subjectTopics.find((t) => t.id === q.topicId);
                  return (
                    <Card key={q.id} className="group">
                      <div className="flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1.5">
                            <TypeBadge type={q.type} />
                            {q.origin && (
                              <Badge color={ORIGIN_COLORS[q.origin]}>
                                {ORIGIN_LABELS[q.origin]}
                              </Badge>
                            )}
                            {topic && <span className="text-xs text-ink-500">{topic.title}</span>}
                            <Difficulty level={q.difficulty} />
                            {(q.tags ?? []).map((tag) => (
                              <Badge key={tag}>{tag}</Badge>
                            ))}
                          </div>
                          <p className="text-sm text-ink-200 line-clamp-2">{q.prompt}</p>

                          {/* PDF anchor button */}
                          {q.pdfAnchorId && pdfList.length > 0 && (
                            <PdfAnchorButton
                              anchorId={q.pdfAnchorId}
                              onOpen={(page) => openPdfAtPage(page)}
                            />
                          )}

                          <div className="mt-2">
                            <StatsSummary seen={q.stats.seen} correct={q.stats.correct} wrong={q.stats.wrong} />
                          </div>
                        </div>
                        <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                          <Button size="sm" variant="ghost" onClick={() => openEditQuestion(q)} title="Editar">✎</Button>
                          <Button size="sm" variant="ghost" onClick={() => duplicateQuestion(q.id)} title="Duplicar">⧉</Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => { if (confirm('¿Eliminar pregunta?')) deleteQuestion(q.id); }}
                            title="Eliminar"
                          >
                            <span className="text-rose-400">✕</span>
                          </Button>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* PRACTICE TAB */}
        {tab === 'practice' && (
          <PracticeConfig
            subjectId={subjectId!}
            topics={subjectTopics}
            questions={subjectQuestions}
            defaultTopicId={filterTopic}
          />
        )}

        {/* PDF TAB */}
        {tab === 'pdfs' && (
          <div className="flex flex-col gap-4 flex-1">
            {!pdfLoaded ? (
              <div className="text-ink-500 text-sm">Cargando lista de PDFs…</div>
            ) : pdfList.length === 0 ? (
              <EmptyState
                icon={<span>📄</span>}
                title="Sin PDFs"
                description={
                  `Añade los PDFs de los temas en resources/${toSlugPreview(subject.name)}/Temas/ y un index.json con los nombres de archivo.`
                }
                action={
                  <div className="text-xs text-ink-600 font-mono bg-ink-900 px-4 py-3 rounded-lg text-left max-w-lg">
                    <p className="text-ink-400 mb-1"># Estructura de carpetas:</p>
                    <p>resources/</p>
                    <p className="pl-4">└─ {toSlugPreview(subject.name)}/</p>
                    <p className="pl-8">├─ extra_info.json</p>
                    <p className="pl-8">└─ Temas/</p>
                    <p className="pl-12">├─ index.json  <span className="text-ink-500">← ["Tema1.pdf", ...]</span></p>
                    <p className="pl-12">├─ Tema1.pdf</p>
                    <p className="pl-12">└─ Tema2.pdf</p>
                  </div>
                }
              />
            ) : (
              <div className="flex-1 min-h-[70vh] border border-ink-700 rounded-xl overflow-hidden">
                <PdfViewer
                  ref={pdfViewerRef}
                  pdfList={pdfList}
                  getPdfUrl={(filename) => getPdfUrl(subject.name, filename)}
                  initialPage={pendingPdfPage ?? 1}
                />
              </div>
            )}
          </div>
        )}
      </main>

      {/* Topic modal */}
      <Modal open={topicModal} onClose={() => setTopicModal(false)} title={editingTopic ? 'Editar tema' : 'Nuevo tema'}>
        <div className="flex flex-col gap-4">
          <Input
            label="Título del tema"
            value={topicTitle}
            onChange={(e) => setTopicTitle(e.target.value)}
            placeholder="Ej: Tema 2 - Búsqueda"
            autoFocus
          />
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setTopicModal(false)}>Cancelar</Button>
            <Button onClick={handleTopicSave} disabled={!topicTitle.trim()}>
              {editingTopic ? 'Guardar' : 'Crear tema'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Question modal */}
      <Modal
        open={questionModal}
        onClose={() => { setQuestionModal(false); setEditingQuestion(null); }}
        title={editingQuestion ? 'Editar pregunta' : 'Nueva pregunta'}
        size="lg"
      >
        {subjectId && (
          <QuestionForm
            topics={subjectTopics}
            initial={editingQuestion ?? undefined}
            subjectId={subjectId}
            onSave={handleQuestionSave}
            onCancel={() => { setQuestionModal(false); setEditingQuestion(null); }}
          />
        )}
      </Modal>
    </div>
  );
}

// ─── Helper: slug preview (no dep on normalize.ts from this component) ────────
function toSlugPreview(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

// ─── PdfAnchorButton ──────────────────────────────────────────────────────────

function PdfAnchorButton({ anchorId, onOpen }: { anchorId: string; onOpen: (page: number) => void }) {
  const [page, setPage] = useState<number | null>(null);

  useEffect(() => {
    import('@/data/db').then(({ db }) => {
      db.pdfAnchors.get(anchorId).then((anchor) => {
        if (anchor) setPage(anchor.page);
      });
    });
  }, [anchorId]);

  if (!page) return null;

  return (
    <button
      onClick={() => onOpen(page)}
      className="mt-1.5 text-xs text-amber-400 hover:text-amber-300 transition-colors flex items-center gap-1"
    >
      📄 Abrir PDF en página {page}
    </button>
  );
}

// ─── Practice config sub-component ────────────────────────────────────────────

interface PracticeConfigProps {
  subjectId: string;
  topics: import('@/domain/models').Topic[];
  questions: Question[];
  defaultTopicId?: string;
}

function PracticeConfig({ subjectId, topics, questions, defaultTopicId }: PracticeConfigProps) {
  const navigate = useNavigate();
  const [mode, setMode] = useState<'random' | 'all' | 'failed' | 'topic'>('random');
  const [count, setCount] = useState('20');
  const [topicId, setTopicId] = useState(defaultTopicId ?? '');

  const failedCount = questions.filter((q) => q.stats.lastResult === 'WRONG').length;

  const getAvailableCount = () => {
    if (mode === 'failed') return failedCount;
    if (mode === 'topic') return questions.filter((q) => q.topicId === topicId).length;
    return questions.length;
  };

  const available = getAvailableCount();

  const handleStart = async () => {
    if (available === 0) return;

    let pool: Question[] = [];
    if (mode === 'all') {
      pool = [...questions];
    } else if (mode === 'failed') {
      pool = questions.filter((q) => q.stats.lastResult === 'WRONG');
    } else if (mode === 'topic') {
      pool = questions.filter((q) => q.topicId === topicId);
    } else {
      const n = Math.min(parseInt(count) || 20, questions.length);
      const shuffled = [...questions].sort(() => Math.random() - 0.5);
      pool = shuffled.slice(0, n);
    }

    pool = pool.sort(() => Math.random() - 0.5);

    const { sessionRepo } = await import('@/data/repos');
    const session = await sessionRepo.create({
      subjectId,
      mode,
      topicId: mode === 'topic' ? topicId : undefined,
      questionIds: pool.map((q) => q.id),
    });

    navigate(`/practice/${session.id}`);
  };

  return (
    <Card className="max-w-md">
      <div className="flex flex-col gap-4">
        <h3 className="font-display text-ink-200">Configurar sesión</h3>
        <Select label="Modo" value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
          <option value="random">Aleatorio</option>
          <option value="all">Todas las preguntas</option>
          <option value="failed">Sólo falladas ({failedCount})</option>
          <option value="topic">Por tema</option>
        </Select>
        {mode === 'random' && (
          <Input
            label="Número de preguntas"
            type="number"
            min="1"
            max={questions.length}
            value={count}
            onChange={(e) => setCount(e.target.value)}
          />
        )}
        {mode === 'topic' && (
          <Select label="Tema" value={topicId} onChange={(e) => setTopicId(e.target.value)}>
            <option value="">Selecciona un tema…</option>
            {topics.map((t) => {
              const n = questions.filter((q) => q.topicId === t.id).length;
              return <option key={t.id} value={t.id}>{t.title} ({n})</option>;
            })}
          </Select>
        )}
        <Button onClick={handleStart} disabled={available === 0 || (mode === 'topic' && !topicId)}>
          Empezar ({available} preguntas)
        </Button>
      </div>
    </Card>
  );
}