import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { sessionRepo, questionRepo } from '@/data/repos';
import { Button, TypeBadge, Badge } from '@/ui/components';
import type { PracticeSession, Question } from '@/domain/models';

export function ResultsPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();

  const [session, setSession] = useState<PracticeSession | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [selectedQ, setSelectedQ] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!sessionId) return;
    (async () => {
      const s = await sessionRepo.getById(sessionId);
      if (!s) { navigate('/'); return; }
      const qs = await questionRepo.getManyByIds(s.questionIds);
      setSession(s);
      setQuestions(qs);
      setLoading(false);
    })();
  }, [sessionId]);

  if (loading || !session) {
    return (
      <div className="min-h-screen bg-ink-950 flex items-center justify-center">
        <p className="text-ink-500 animate-pulse-soft">Cargando resultados...</p>
      </div>
    );
  }

  const correct = session.answers.filter((a) => a.result === 'CORRECT').length;
  const wrong = session.answers.filter((a) => a.result === 'WRONG').length;
  const pending = session.answers.filter((a) => a.result === null || a.result === undefined).length;
  const total = session.questionIds.length;
  const pct = total === 0 ? 0 : Math.round((correct / total) * 100);

  const handleRepeatFailed = async () => {
    const failedIds = session.answers
      .filter((a) => a.result === 'WRONG')
      .map((a) => a.questionId);
    if (failedIds.length === 0) return;
    const newSession = await sessionRepo.create({
      subjectId: session.subjectId,
      mode: 'failed',
      questionIds: failedIds,
    });
    navigate(`/practice/${newSession.id}`);
  };

  const selectedQuestion = questions.find((q) => q.id === selectedQ);
  const selectedAnswer = session.answers.find((a) => a.questionId === selectedQ);

  return (
    <div className="min-h-screen bg-ink-950 text-ink-100">
      {/* Header */}
      <header className="border-b border-ink-800 bg-ink-900/50">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <button
            onClick={() => navigate(`/subject/${session.subjectId}`)}
            className="text-ink-400 hover:text-ink-200 text-sm transition-colors"
          >
            ← Volver a la asignatura
          </button>
          <span className="text-sm text-ink-500">
            {new Date(session.createdAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}
          </span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        {/* Summary */}
        <div className="mb-8">
          <h1 className="font-display text-2xl text-ink-100 mb-6">Resultados</h1>
          <div className="grid grid-cols-4 gap-4 mb-6">
            <div className="bg-ink-800 border border-ink-700 rounded-xl p-4 text-center">
              <p className="text-3xl font-display text-ink-100">{total}</p>
              <p className="text-xs text-ink-500 mt-1">Total</p>
            </div>
            <div className="bg-sage-600/10 border border-sage-600/20 rounded-xl p-4 text-center">
              <p className="text-3xl font-display text-sage-400">{correct}</p>
              <p className="text-xs text-ink-500 mt-1">Correctas</p>
            </div>
            <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-4 text-center">
              <p className="text-3xl font-display text-rose-400">{wrong}</p>
              <p className="text-xs text-ink-500 mt-1">Incorrectas</p>
            </div>
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 text-center">
              <p className="text-3xl font-display text-amber-400">{pct}%</p>
              <p className="text-xs text-ink-500 mt-1">Acierto</p>
            </div>
          </div>

          {/* Progress bar */}
          <div className="h-2 bg-ink-800 rounded-full overflow-hidden">
            <div className="h-full flex rounded-full overflow-hidden">
              {correct > 0 && (
                <div className="bg-sage-500 transition-all" style={{ width: `${(correct / total) * 100}%` }} />
              )}
              {wrong > 0 && (
                <div className="bg-rose-500 transition-all" style={{ width: `${(wrong / total) * 100}%` }} />
              )}
              {pending > 0 && (
                <div className="bg-amber-500 transition-all" style={{ width: `${(pending / total) * 100}%` }} />
              )}
            </div>
          </div>
          {pending > 0 && (
            <p className="text-xs text-ink-500 mt-1">{pending} pregunta{pending !== 1 ? 's' : ''} de desarrollo/práctico pendiente{pending !== 1 ? 's' : ''} de corrección manual</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3 mb-8">
          {wrong > 0 && (
            <Button onClick={handleRepeatFailed}>
              🔴 Repetir falladas ({wrong})
            </Button>
          )}
          <Button variant="secondary" onClick={() => navigate(`/subject/${session.subjectId}`)}>
            Nueva sesión
          </Button>
        </div>

        {/* Question list */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <h2 className="text-xs font-medium text-ink-400 uppercase tracking-widest mb-2">Preguntas</h2>
            {session.questionIds.map((qId, i) => {
              const q = questions.find((q) => q.id === qId);
              const a = session.answers.find((a) => a.questionId === qId);
              if (!q) return null;
              const result = a?.result;
              return (
                <button
                  key={qId}
                  onClick={() => setSelectedQ(selectedQ === qId ? null : qId)}
                  className={`text-left flex items-start gap-3 p-3 rounded-xl border transition-all ${
                    selectedQ === qId
                      ? 'border-amber-500/50 bg-amber-500/5'
                      : 'border-ink-700 hover:border-ink-600 bg-ink-800/50'
                  }`}
                >
                  <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold mt-0.5 ${
                    result === 'CORRECT' ? 'bg-sage-600/20 text-sage-400' :
                    result === 'WRONG' ? 'bg-rose-500/20 text-rose-400' :
                    'bg-amber-500/20 text-amber-400'
                  }`}>
                    {result === 'CORRECT' ? '✓' : result === 'WRONG' ? '✗' : '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <TypeBadge type={q.type} />
                    </div>
                    <p className="text-sm text-ink-300 line-clamp-2 text-left">{q.prompt}</p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Detail panel */}
          {selectedQuestion && selectedAnswer && (
            <div className="lg:sticky lg:top-20 flex flex-col gap-4 animate-slide-up">
              <h2 className="text-xs font-medium text-ink-400 uppercase tracking-widest">Detalle</h2>
              <div className={`border rounded-xl p-4 ${
                selectedAnswer.result === 'CORRECT' ? 'border-sage-600/30 bg-sage-600/5' :
                selectedAnswer.result === 'WRONG' ? 'border-rose-500/30 bg-rose-500/5' :
                'border-amber-500/30 bg-amber-500/5'
              }`}>
                <p className="text-sm text-ink-200 mb-4">{selectedQuestion.prompt}</p>

                <div className="flex flex-col gap-3">
                  <div>
                    <p className="text-xs text-ink-500 uppercase tracking-widest mb-1">Tu respuesta</p>
                    <UserAnswerSummary question={selectedQuestion} answer={selectedAnswer} />
                  </div>
                  <div>
                    <p className="text-xs text-ink-500 uppercase tracking-widest mb-1">Respuesta correcta</p>
                    <CorrectAnswerSummary question={selectedQuestion} />
                  </div>
                  {selectedQuestion.explanation && (
                    <div className="mt-2 pt-3 border-t border-ink-700">
                      <p className="text-xs text-amber-600 uppercase tracking-widest mb-1">Explicación</p>
                      <p className="text-sm text-ink-300">{selectedQuestion.explanation}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function UserAnswerSummary({ question, answer }: { question: Question; answer: import('@/domain/models').UserAnswer }) {
  if (question.type === 'TEST') {
    const selected = answer.selectedOptionIds ?? [];
    if (!selected.length) return <p className="text-sm text-ink-600 italic">Sin respuesta</p>;
    const texts = (question.options ?? []).filter((o) => selected.includes(o.id)).map((o) => o.text);
    return <p className="text-sm text-ink-200">{texts.join(', ')}</p>;
  }
  if (question.type === 'COMPLETAR') {
    const entries = Object.entries(answer.blankAnswers ?? {});
    if (!entries.length) return <p className="text-sm text-ink-600 italic">Sin respuesta</p>;
    return (
      <div>
        {entries.map(([id, val]) => (
          <p key={id} className="text-sm text-ink-200"><span className="text-ink-500">{id}:</span> {val}</p>
        ))}
      </div>
    );
  }
  return <p className="text-sm text-ink-200 whitespace-pre-wrap">{answer.freeText || <span className="italic text-ink-600">Sin respuesta</span>}</p>;
}

function CorrectAnswerSummary({ question }: { question: Question }) {
  if (question.type === 'TEST') {
    const correctIds = new Set(question.correctOptionIds ?? []);
    const texts = (question.options ?? []).filter((o) => correctIds.has(o.id)).map((o) => o.text);
    return <p className="text-sm text-sage-400">{texts.join(', ')}</p>;
  }
  if (question.type === 'COMPLETAR') {
    return (
      <div>
        {(question.blanks ?? []).map((b) => (
          <p key={b.id} className="text-sm text-sage-400"><span className="text-ink-500">{b.id}:</span> {b.accepted.join(' / ')}</p>
        ))}
      </div>
    );
  }
  return <p className="text-sm text-sage-400 whitespace-pre-wrap">{question.modelAnswer}</p>;
}
