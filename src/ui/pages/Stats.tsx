import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '@/data/db';
import { subjectRepo, questionRepo } from '@/data/repos';
import { Button, Card, Badge, Difficulty, Progress } from '@/ui/components';
import type { Subject, Topic, Question, PracticeSession } from '@/domain/models';

export function StatsPage() {
  const { subjectId } = useParams<{ subjectId: string }>();
  const navigate = useNavigate();

  const [subject, setSubject] = useState<Subject | null>(null);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [sessions, setSessions] = useState<PracticeSession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!subjectId) return;
    (async () => {
      const s = await subjectRepo.getById(subjectId);
      if (!s) {
        navigate('/');
        return;
      }
      const ts = await db.topics.where('subjectId').equals(subjectId).toArray();
      const qs = await questionRepo.getBySubject(subjectId);
      const allSessions = await db.sessions.where('subjectId').equals(subjectId).toArray();
      const finished = allSessions
        .filter((s) => s.finishedAt)
        .sort((a, b) => (b.finishedAt! > a.finishedAt! ? 1 : -1))
        .slice(0, 20);
      setSubject(s);
      setTopics(ts);
      setQuestions(qs);
      setSessions(finished);
      setLoading(false);
    })();
  }, [subjectId]);

  const globalStats = useMemo(() => {
    return {
      total: questions.length,
      seen: questions.filter((q) => q.stats.seen > 0).length,
      unseen: questions.filter((q) => q.stats.seen === 0).length,
      correct: questions.reduce((acc, q) => acc + q.stats.correct, 0),
      wrong: questions.reduce((acc, q) => acc + q.stats.wrong, 0),
      totalAttempts: questions.reduce((acc, q) => acc + q.stats.seen, 0),
    };
  }, [questions]);

  const correctPct = useMemo(() => {
    return globalStats.totalAttempts === 0 ? 0 : Math.round((globalStats.correct / globalStats.totalAttempts) * 100);
  }, [globalStats]);

  const topicStats = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    return topics
      .map((topic) => {
        const topicQuestions = questions.filter((q) => q.topicId === topic.id || (q.topicIds && q.topicIds.includes(topic.id)));
        const seen = topicQuestions.filter((q) => q.stats.seen > 0).length;
        const correct = topicQuestions.reduce((acc, q) => acc + q.stats.correct, 0);
        const totalAttempts = topicQuestions.reduce((acc, q) => acc + q.stats.seen, 0);
        const correctPct = totalAttempts === 0 ? 0 : Math.round((correct / totalAttempts) * 100);
        const overdue = topicQuestions.filter(
          (q) => q.stats.nextReviewAt && q.stats.nextReviewAt <= today
        ).length;
        return { topic, count: topicQuestions.length, seen, correctPct, overdue };
      })
      .sort((a, b) => b.count - a.count);
  }, [topics, questions]);

  const problematicQuestions = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    return questions
      .filter((q) => q.stats.seen > 0)
      .map((q) => {
        const failRate = q.stats.seen === 0 ? 0 : Math.round(((q.stats.seen - q.stats.correct) / q.stats.seen) * 100);
        const isOverdue = q.stats.nextReviewAt && q.stats.nextReviewAt <= today;
        return { question: q, failRate, isOverdue };
      })
      .sort((a, b) => b.failRate - a.failRate)
      .slice(0, 10);
  }, [questions]);

  if (loading) {
    return (
      <div className="min-h-screen bg-ink-950 flex items-center justify-center">
        <p className="text-ink-500 animate-pulse">Cargando estadísticas…</p>
      </div>
    );
  }

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

  return (
    <div className="min-h-screen bg-ink-950 text-ink-100 flex flex-col">
      {/* Header */}
      <header className="border-b border-ink-800 bg-ink-900/50">
        <div className="max-w-5xl mx-auto px-6 py-4">
          <button
            onClick={() => navigate(`/subject/${subjectId}`)}
            className="text-ink-400 hover:text-ink-200 text-sm transition-colors mb-4"
          >
            ← Volver
          </button>
          <div className="flex items-center gap-4">
            <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: subject.color ?? '#f59e0b' }} />
            <h1 className="font-display text-2xl text-ink-100">Estadísticas — {subject.name}</h1>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto w-full px-6 py-8 flex flex-col gap-8">
        {/* Resumen global */}
        <Card>
          <div className="flex flex-col gap-4">
            <h2 className="font-display text-lg text-ink-100">Resumen global</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div className="flex flex-col">
                <span className="text-2xl font-bold text-ink-100">{globalStats.total}</span>
                <span className="text-xs text-ink-500">Total preguntas</span>
              </div>
              <div className="flex flex-col">
                <span className="text-2xl font-bold text-sage-400">{globalStats.seen}</span>
                <span className="text-xs text-ink-500">Vistas</span>
              </div>
              <div className="flex flex-col">
                <span className="text-2xl font-bold text-amber-400">{globalStats.unseen}</span>
                <span className="text-xs text-ink-500">Sin ver</span>
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-ink-300">Acierto global</span>
                <span className="text-sm font-bold text-ink-200">{correctPct}%</span>
              </div>
              <Progress value={globalStats.correct} max={globalStats.totalAttempts} color={correctPct >= 70 ? 'sage' : correctPct >= 40 ? 'amber' : 'rose'} />
            </div>
          </div>
        </Card>

        {/* Por tema */}
        {topicStats.length > 0 && (
          <Card>
            <div className="flex flex-col gap-4">
              <h2 className="font-display text-lg text-ink-100">Por tema</h2>
              <div className="flex flex-col gap-3">
                {topicStats.map(({ topic, count, seen, correctPct, overdue }) => (
                  <div key={topic.id} className="flex items-start gap-4 pb-3 border-b border-ink-800 last:pb-0 last:border-0">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-ink-100">{topic.title}</span>
                        <Badge color="sage">{count} px</Badge>
                        <Badge color="amber">{seen} vistas</Badge>
                        {overdue > 0 && <Badge color="rose">{overdue} repaso</Badge>}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-bold ${
                          correctPct >= 70 ? 'text-sage-400' :
                          correctPct >= 40 ? 'text-amber-400' :
                          'text-rose-400'
                        }`}>
                          {correctPct}% acierto
                        </span>
                        <div className="h-1 flex-1 bg-ink-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${
                              correctPct >= 70 ? 'bg-sage-500' :
                              correctPct >= 40 ? 'bg-amber-500' :
                              'bg-rose-500'
                            }`}
                            style={{ width: `${correctPct}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        )}

        {/* Preguntas problemáticas */}
        {problematicQuestions.length > 0 && (
          <Card>
            <div className="flex flex-col gap-4">
              <h2 className="font-display text-lg text-ink-100">Preguntas problemáticas (Top 10)</h2>
              <div className="flex flex-col gap-2">
                {problematicQuestions.map(({ question, failRate, isOverdue }) => {
                  const topic = topics.find((t) => t.id === question.topicId);
                  return (
                    <div
                      key={question.id}
                      className="flex items-start gap-3 p-3 bg-ink-800/50 border border-ink-700 rounded-lg hover:border-ink-600 transition-all"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="text-xs bg-rose-500/20 text-rose-400 px-2 py-0.5 rounded font-bold">
                            {failRate}% fallos
                          </span>
                          <Badge color="rose">{question.type}</Badge>
                          {topic && <span className="text-xs text-ink-500">{topic.title}</span>}
                          {isOverdue && <Badge color="amber">Repaso hoy</Badge>}
                          {question.difficulty && <Difficulty level={question.difficulty} />}
                        </div>
                        <p className="text-sm text-ink-200 line-clamp-1">{question.prompt}</p>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => navigate(`/subject/${subjectId}`)}
                        className="flex-shrink-0"
                      >
                        Practicar →
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          </Card>
        )}

        {/* B4: Historial de sesiones */}
        {sessions.length > 0 && (
          <Card>
            <div className="flex flex-col gap-4">
              <h2 className="font-display text-lg text-ink-100">Historial de sesiones</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-ink-700 text-ink-500 text-xs text-left">
                      <th className="pb-2 font-normal">Fecha</th>
                      <th className="pb-2 font-normal">Modo</th>
                      <th className="pb-2 font-normal text-center">Preguntas</th>
                      <th className="pb-2 font-normal text-center">Aciertos</th>
                      <th className="pb-2 font-normal text-center">% Acierto</th>
                      <th className="pb-2 font-normal"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.map((s) => {
                      const correct = s.answers.filter((a) => a.result === 'CORRECT').length;
                      const total = s.questionIds.length;
                      const pct = total === 0 ? 0 : Math.round((correct / total) * 100);
                      const MODE_LABELS: Record<string, string> = {
                        random: 'Aleatorio', all: 'Todas', failed: 'Falladas',
                        topic: 'Tema', smart: 'Smart', exam: 'Examen',
                      };
                      return (
                        <tr key={s.id} className="border-b border-ink-800 last:border-0 hover:bg-ink-800/30">
                          <td className="py-2 text-ink-300">
                            {new Date(s.finishedAt!).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </td>
                          <td className="py-2">
                            <span className="text-xs bg-ink-800 text-ink-400 px-2 py-0.5 rounded">
                              {MODE_LABELS[s.mode] ?? s.mode}
                            </span>
                          </td>
                          <td className="py-2 text-center text-ink-300">{total}</td>
                          <td className="py-2 text-center text-sage-400">{correct}</td>
                          <td className="py-2 text-center">
                            <span className={`font-bold ${pct >= 70 ? 'text-sage-400' : pct >= 40 ? 'text-amber-400' : 'text-rose-400'}`}>
                              {pct}%
                            </span>
                          </td>
                          <td className="py-2 text-right">
                            <button
                              onClick={() => navigate(`/results/${s.id}`)}
                              className="text-xs text-amber-500 hover:text-amber-400 transition-colors"
                            >
                              Ver →
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </Card>
        )}
      </main>
    </div>
  );
}
