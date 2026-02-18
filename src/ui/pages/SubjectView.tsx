import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useStore } from '@/ui/store';
import { db } from '@/data/db';
import {
  Button, Card, Modal, Input, Textarea, Tabs, Badge, TypeBadge, Difficulty,
  EmptyState, StatsSummary, Select,
} from '@/ui/components';
import { QuestionForm } from '@/ui/components/QuestionForm';
import type { Topic, Question } from '@/domain/models';

type TabId = 'topics' | 'questions' | 'practice';

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
  const [filterText, setFilterText] = useState('');

  // Modals
  const [topicModal, setTopicModal] = useState(false);
  const [editingTopic, setEditingTopic] = useState<Topic | null>(null);
  const [topicTitle, setTopicTitle] = useState('');
  const [questionModal, setQuestionModal] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);

  useEffect(() => {
    if (!subjects.length) loadSubjects();
  }, []);

  useEffect(() => {
    if (subjectId) {
      loadTopics(subjectId);
      loadQuestions(subjectId);
    }
  }, [subjectId]);

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

  const openNewTopic = () => {
    setEditingTopic(null);
    setTopicTitle('');
    setTopicModal(true);
  };

  const openEditQuestion = (q: Question) => {
    setEditingQuestion(q);
    setQuestionModal(true);
  };

  const openNewQuestion = () => {
    setEditingQuestion(null);
    setQuestionModal(true);
  };

  const totalStats = subjectQuestions.reduce(
    (acc, q) => ({
      seen: acc.seen + q.stats.seen,
      correct: acc.correct + q.stats.correct,
      wrong: acc.wrong + q.stats.wrong,
    }),
    { seen: 0, correct: 0, wrong: 0 }
  );

  return (
    <div className="min-h-screen bg-ink-950 text-ink-100">
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
            <h1 className="font-display text-xl text-ink-100 flex-1 truncate">{subject.name}</h1>
            {subject.examDate && (
              <div className="text-sm text-ink-400">
                Examen: <span className="text-ink-200">{subject.examDate}</span>
              </div>
            )}
          </div>
          {/* Stats bar */}
          <div className="mt-3 flex items-center gap-4">
            <StatsSummary {...totalStats} />
            <span className="text-ink-600 text-xs">·</span>
            <span className="text-xs text-ink-500">{subjectQuestions.length} preguntas · {subjectTopics.length} temas</span>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="border-b border-ink-800 bg-ink-900/30">
        <div className="max-w-5xl mx-auto px-6 py-3">
          <Tabs
            tabs={[
              { id: 'topics', label: 'Temas', icon: '📁' },
              { id: 'questions', label: 'Preguntas', icon: '❓' },
              { id: 'practice', label: 'Practicar', icon: '⚡' },
            ]}
            active={tab}
            onChange={(id) => setTab(id as TabId)}
          />
        </div>
      </div>

      <main className="max-w-5xl mx-auto px-6 py-8">
        {/* TOPICS TAB */}
        {tab === 'topics' && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg text-ink-200">Temas</h2>
              <Button size="sm" onClick={openNewTopic}>+ Nuevo tema</Button>
            </div>
            {subjectTopics.length === 0 ? (
              <EmptyState
                icon={<span>📁</span>}
                title="Sin temas"
                description="Crea temas para organizar tus preguntas"
                action={<Button size="sm" onClick={openNewTopic}>+ Nuevo tema</Button>}
              />
            ) : (
              <div className="flex flex-col gap-3">
                {subjectTopics.map((t) => {
                  const topicQs = subjectQuestions.filter((q) => q.topicId === t.id);
                  const seen = topicQs.reduce((a, q) => a + q.stats.seen, 0);
                  const correct = topicQs.reduce((a, q) => a + q.stats.correct, 0);
                  return (
                    <Card key={t.id} className="group flex items-center gap-4">
                      <div className="flex-1">
                        <p className="font-medium text-ink-100">{t.title}</p>
                        <p className="text-xs text-ink-500 mt-0.5">
                          {topicQs.length} preguntas
                          {seen > 0 && ` · ${Math.round((correct / seen) * 100)}% acierto`}
                        </p>
                      </div>
                      <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setFilterTopic(t.id);
                            setTab('practice');
                          }}
                        >
                          ⚡ Practicar
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => openEditTopic(t)}>✎</Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            if (confirm(`¿Eliminar "${t.title}"?`)) deleteTopic(t.id);
                          }}
                        >
                          <span className="text-rose-400">✕</span>
                        </Button>
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
              <h2 className="font-display text-lg text-ink-200">Preguntas</h2>
              <Button
                size="sm"
                onClick={openNewQuestion}
                disabled={subjectTopics.length === 0}
              >
                + Nueva pregunta
              </Button>
            </div>

            {subjectTopics.length === 0 && (
              <div className="text-sm text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-4 py-3">
                Primero crea al menos un tema para poder añadir preguntas.
              </div>
            )}

            {/* Filters */}
            {subjectQuestions.length > 0 && (
              <div className="flex gap-3 flex-wrap">
                <Select
                  value={filterTopic}
                  onChange={(e) => setFilterTopic(e.target.value)}
                  className="text-xs py-1.5"
                >
                  <option value="">Todos los temas</option>
                  {subjectTopics.map((t) => (
                    <option key={t.id} value={t.id}>{t.title}</option>
                  ))}
                </Select>
                <Select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  className="text-xs py-1.5"
                >
                  <option value="">Todos los tipos</option>
                  <option value="TEST">Test</option>
                  <option value="DESARROLLO">Desarrollo</option>
                  <option value="COMPLETAR">Completar</option>
                </Select>
                <input
                  value={filterText}
                  onChange={(e) => setFilterText(e.target.value)}
                  placeholder="Buscar..."
                  className="bg-ink-800 border border-ink-600 text-ink-100 rounded-lg px-3 py-1.5 text-sm font-body placeholder:text-ink-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
                {(filterTopic || filterType || filterText) && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => { setFilterTopic(''); setFilterType(''); setFilterText(''); }}
                  >
                    × Limpiar
                  </Button>
                )}
              </div>
            )}

            {subjectQuestions.length === 0 ? (
              <EmptyState
                icon={<span>❓</span>}
                title="Sin preguntas"
                description="Añade preguntas para empezar a practicar"
              />
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
                            {topic && <span className="text-xs text-ink-500">{topic.title}</span>}
                            <Difficulty level={q.difficulty} />
                            {(q.tags ?? []).map((tag) => (
                              <Badge key={tag}>{tag}</Badge>
                            ))}
                          </div>
                          <p className="text-sm text-ink-200 line-clamp-2">{q.prompt}</p>
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
      </main>

      {/* Topic modal */}
      <Modal
        open={topicModal}
        onClose={() => setTopicModal(false)}
        title={editingTopic ? 'Editar tema' : 'Nuevo tema'}
      >
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

    // Shuffle
    pool = pool.sort(() => Math.random() - 0.5);

    // Create session
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
    <div className="max-w-md">
      <h2 className="font-display text-lg text-ink-200 mb-6">Configurar sesión</h2>

      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-ink-400 uppercase tracking-widest">Modo</p>
          <div className="grid grid-cols-2 gap-2">
            {[
              { id: 'random', label: '🎲 Aleatorio N' },
              { id: 'all', label: '📋 Todas' },
              { id: 'failed', label: '🔴 Falladas', disabled: failedCount === 0 },
              { id: 'topic', label: '📁 Por tema', disabled: topics.length === 0 },
            ].map((m) => (
              <button
                key={m.id}
                disabled={m.disabled}
                onClick={() => setMode(m.id as typeof mode)}
                className={`px-4 py-3 rounded-lg text-sm font-medium font-body border transition-all ${
                  mode === m.id
                    ? 'bg-amber-500 border-amber-500 text-ink-900'
                    : m.disabled
                    ? 'border-ink-800 text-ink-700 cursor-not-allowed'
                    : 'border-ink-700 text-ink-300 hover:border-ink-500 hover:text-ink-100'
                }`}
              >
                {m.label}
                {m.id === 'failed' && failedCount > 0 && (
                  <span className="ml-1 text-xs opacity-70">({failedCount})</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {mode === 'random' && (
          <Input
            label="Número de preguntas"
            type="number"
            value={count}
            onChange={(e) => setCount(e.target.value)}
            min="1"
            max={questions.length}
            hint={`Máximo: ${questions.length}`}
          />
        )}

        {mode === 'topic' && (
          <Select
            label="Tema"
            value={topicId}
            onChange={(e) => setTopicId(e.target.value)}
          >
            <option value="">Selecciona un tema...</option>
            {topics.map((t) => {
              const n = questions.filter((q) => q.topicId === t.id).length;
              return (
                <option key={t.id} value={t.id}>{t.title} ({n})</option>
              );
            })}
          </Select>
        )}

        <div className="flex items-center justify-between pt-2 border-t border-ink-800">
          <p className="text-sm text-ink-400">
            {available} pregunta{available !== 1 ? 's' : ''} disponible{available !== 1 ? 's' : ''}
          </p>
          <Button
            onClick={handleStart}
            disabled={available === 0 || (mode === 'topic' && !topicId)}
          >
            ⚡ Empezar
          </Button>
        </div>
      </div>
    </div>
  );
}
