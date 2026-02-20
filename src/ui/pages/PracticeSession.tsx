import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '@/data/db';
import { questionRepo, sessionRepo } from '@/data/repos';
import { scoreAnswer } from '@/domain/scoring';
import { Button, Progress, TypeBadge } from '@/ui/components';
import type { Question, PracticeSession, UserAnswer } from '@/domain/models';
import { v4 as uuidv4 } from 'uuid';
import { marked } from 'marked';
import { MdContent } from '@/ui/components/MdContent';

function renderMd(text: string): string {
  try {
    return marked.parse(text, { async: false }) as string;
  } catch {
    return text;
  }
}

export function PracticeSessionPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();

  const [session, setSession] = useState<PracticeSession | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [answers, setAnswers] = useState<UserAnswer[]>([]);
  const [loading, setLoading] = useState(true);

  // Per-question answer state
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
  const [freeText, setFreeText] = useState('');
  const [blankAnswers, setBlankAnswers] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!sessionId) return;
    (async () => {
      const s = await sessionRepo.getById(sessionId);
      if (!s) { navigate('/'); return; }
      const qs = await questionRepo.getManyByIds(s.questionIds);
      // Keep original order
      const ordered = s.questionIds.map((id) => qs.find((q) => q.id === id)).filter(Boolean) as Question[];
      setSession(s);
      setQuestions(ordered);
      // Resume: figure out where we left off
      const answeredIds = new Set(s.answers.map((a) => a.questionId));
      const nextIdx = ordered.findIndex((q) => !answeredIds.has(q.id));
      setAnswers(s.answers);
      setCurrentIndex(nextIdx === -1 ? ordered.length : nextIdx);
      setLoading(false);
    })();
  }, [sessionId]);

  const currentQuestion = questions[currentIndex];
  const isFinished = currentIndex >= questions.length;
  const progress = questions.length === 0 ? 0 : currentIndex / questions.length;

  const resetAnswerState = () => {
    setSelectedOptions([]);
    setFreeText('');
    setBlankAnswers({});
    setSubmitted(false);
  };

  const handleToggleOption = (optId: string) => {
    if (submitted) return;
    setSelectedOptions((prev) =>
      prev.includes(optId) ? prev.filter((id) => id !== optId) : [...prev, optId]
    );
  };

  const handleSubmitAnswer = async () => {
    if (!currentQuestion || !session) return;

    const answer: UserAnswer = {
      questionId: currentQuestion.id,
      answeredAt: new Date().toISOString(),
    };

    if (currentQuestion.type === 'TEST') {
      answer.selectedOptionIds = selectedOptions;
    } else if (currentQuestion.type === 'DESARROLLO') {
      answer.freeText = freeText;
    } else if (currentQuestion.type === 'COMPLETAR') {
      answer.blankAnswers = blankAnswers;
    }

    const result = scoreAnswer(currentQuestion, answer);
    answer.result = result;

    // Save to session
    await sessionRepo.addAnswer(session.id, answer);

    // Update question stats (skip DESARROLLO until manual correction)
    if (result !== null) {
      await questionRepo.updateStats(currentQuestion.id, result);
    }

    const newAnswers = [...answers, answer];
    setAnswers(newAnswers);
    setSubmitted(true);
  };

  const handleNext = () => {
    resetAnswerState();
    setCurrentIndex((i) => i + 1);
  };

  const handleFinish = async () => {
    if (!session) return;
    await sessionRepo.finish(session.id);
    navigate(`/results/${session.id}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-ink-950 flex items-center justify-center">
        <div className="text-ink-400 text-sm animate-pulse-soft">Cargando sesión...</div>
      </div>
    );
  }

  if (!session || questions.length === 0) {
    return (
      <div className="min-h-screen bg-ink-950 flex items-center justify-center text-ink-400">
        Sesión no encontrada
      </div>
    );
  }

  // Show finish screen
  if (isFinished) {
    const correct = answers.filter((a) => a.result === 'CORRECT').length;
    const wrong = answers.filter((a) => a.result === 'WRONG').length;
    const pending = answers.filter((a) => a.result === null).length;
    return (
      <div className="min-h-screen bg-ink-950 text-ink-100 flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center flex flex-col gap-6">
          <div>
            <div className="text-5xl mb-4">
              {correct / questions.length >= 0.7 ? '🎉' : correct / questions.length >= 0.4 ? '💪' : '📚'}
            </div>
            <h1 className="font-display text-3xl text-ink-100 mb-2">Sesión completada</h1>
            <p className="text-ink-400">{questions.length} preguntas respondidas</p>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="bg-sage-600/10 border border-sage-600/20 rounded-xl p-4">
              <p className="text-2xl font-display text-sage-400">{correct}</p>
              <p className="text-xs text-ink-500 mt-1">Correctas</p>
            </div>
            <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-4">
              <p className="text-2xl font-display text-rose-400">{wrong}</p>
              <p className="text-xs text-ink-500 mt-1">Incorrectas</p>
            </div>
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
              <p className="text-2xl font-display text-amber-400">{pending}</p>
              <p className="text-xs text-ink-500 mt-1">Pendientes</p>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <Button onClick={handleFinish} size="lg">
              Ver resultados detallados →
            </Button>
            <Button variant="ghost" onClick={() => navigate(`/subject/${session.subjectId}`)}>
              Volver a la asignatura
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const currentAnswer = answers.find((a) => a.questionId === currentQuestion.id);
  const autoResult = currentAnswer?.result;

  return (
    <div className="min-h-screen bg-ink-950 text-ink-100 flex flex-col">
      {/* Progress header */}
      <header className="border-b border-ink-800 bg-ink-900/50 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 py-3">
          <div className="flex items-center justify-between mb-2">
            <button
              onClick={() => { if (confirm('¿Abandonar la sesión?')) navigate(`/subject/${session.subjectId}`); }}
              className="text-ink-500 hover:text-ink-300 text-sm transition-colors"
            >
              ✕ Salir
            </button>
            <span className="text-sm text-ink-400 font-body">
              {currentIndex + 1} / {questions.length}
            </span>
          </div>
          <Progress value={currentIndex} max={questions.length} color="amber" />
        </div>
      </header>

      {/* Question content */}
      <main className="flex-1 max-w-3xl mx-auto w-full px-6 py-10 flex flex-col gap-6">
        {/* Question header */}
        <div className="flex items-center gap-2">
          <TypeBadge type={currentQuestion.type} />
          {currentQuestion.difficulty && (
            <span className="text-xs text-ink-500">
              {'★'.repeat(currentQuestion.difficulty)}{'☆'.repeat(5 - currentQuestion.difficulty)}
            </span>
          )}
          {(currentQuestion.tags ?? []).slice(0, 3).map((tag) => (
            <span key={tag} className="text-xs bg-ink-800 text-ink-400 px-2 py-0.5 rounded">{tag}</span>
          ))}
        </div>

        {/* Prompt (supports MD) */}
        <div className="bg-ink-800/60 border border-ink-700 rounded-xl p-6">
          <MdContent
            content={currentQuestion.prompt}
            className="text-ink-100 text-base leading-relaxed prose prose-invert max-w-none"
          />
        </div>

        {/* Imágenes del enunciado */} 
        {currentQuestion.imageDataUrls && currentQuestion.imageDataUrls.length > 0 && (
          <div className="flex flex-wrap gap-3">
            {currentQuestion.imageDataUrls.map((url, idx) => (
              <img
                key={idx}
                src={url}
                alt={`imagen ${idx + 1}`}
                className="max-h-72 rounded-xl border border-ink-700 object-contain cursor-pointer"
                onClick={() => window.open(url, '_blank')}
              />
            ))}
          </div>
        )}

        {/* Answer area */}
        {!submitted ? (
          <AnswerInput
            question={currentQuestion}
            selectedOptions={selectedOptions}
            freeText={freeText}
            blankAnswers={blankAnswers}
            onToggleOption={handleToggleOption}
            onFreeTextChange={setFreeText}
            onBlankChange={(id, val) => setBlankAnswers((prev) => ({ ...prev, [id]: val }))}
          />
        ) : (
          <AnswerResult
            question={currentQuestion}
            answer={currentAnswer!}
            result={autoResult}
            onManualResult={async (r) => {
              // For DESARROLLO: update answer result and question stats
              const updated = { ...currentAnswer!, manualResult: r, result: r };
              const newAnswers = answers.map((a) =>
                a.questionId === currentQuestion.id ? updated : a
              );
              setAnswers(newAnswers);
              // Update DB
              const session2 = await sessionRepo.getById(session.id);
              if (session2) {
                const updatedAnswers = session2.answers.map((a) =>
                  a.questionId === currentQuestion.id ? updated : a
                );
                await db.sessions.update(session.id, { answers: updatedAnswers });
                await questionRepo.updateStats(currentQuestion.id, r);
              }
            }}
          />
        )}

        {/* Action buttons */}
        <div className="flex justify-between items-center pt-4 border-t border-ink-800">
          {!submitted ? (
            <Button
              onClick={handleSubmitAnswer}
              disabled={
                (currentQuestion.type === 'TEST' && selectedOptions.length === 0) ||
                (currentQuestion.type === 'COMPLETAR' && Object.keys(blankAnswers).length === 0)
              }
            >
              Comprobar respuesta
            </Button>
          ) : (
            <Button onClick={handleNext}>
              {currentIndex < questions.length - 1 ? 'Siguiente →' : 'Finalizar sesión'}
            </Button>
          )}
          {!submitted && (
            <button
              onClick={() => {
                // Skip (empty answer)
                const answer: UserAnswer = {
                  questionId: currentQuestion.id,
                  answeredAt: new Date().toISOString(),
                  result: 'WRONG',
                };
                sessionRepo.addAnswer(session.id, answer);
                setAnswers((prev) => [...prev, answer]);
                setSubmitted(true);
              }}
              className="text-xs text-ink-600 hover:text-ink-400 transition-colors"
            >
              Saltar
            </button>
          )}
        </div>
      </main>
    </div>
  );
}

// ─── Answer Input Components ───────────────────────────────────────────────────

interface AnswerInputProps {
  question: Question;
  selectedOptions: string[];
  freeText: string;
  blankAnswers: Record<string, string>;
  onToggleOption: (id: string) => void;
  onFreeTextChange: (val: string) => void;
  onBlankChange: (id: string, val: string) => void;
}

function AnswerInput({
  question, selectedOptions, freeText, blankAnswers,
  onToggleOption, onFreeTextChange, onBlankChange,
}: AnswerInputProps) {
  if (question.type === 'TEST') {
    const isMulti = (question.correctOptionIds ?? []).length > 1;
    return (
      <div className="flex flex-col gap-2">
        {isMulti && (
          <p className="text-xs text-ink-500">Selecciona todas las respuestas correctas</p>
        )}
        {(question.options ?? []).map((opt) => (
          <button
            key={opt.id}
            onClick={() => onToggleOption(opt.id)}
            className={`text-left px-4 py-3 rounded-xl border text-sm font-body transition-all ${
              selectedOptions.includes(opt.id)
                ? 'border-amber-500 bg-amber-500/10 text-ink-100'
                : 'border-ink-700 bg-ink-800/50 text-ink-300 hover:border-ink-500 hover:text-ink-100'
            }`}
          >
            <span className={`inline-flex items-center justify-center w-5 h-5 rounded mr-3 border text-xs flex-shrink-0 transition-colors ${
              selectedOptions.includes(opt.id) ? 'bg-amber-500 border-amber-500 text-ink-900' : 'border-ink-600 text-ink-500'
            }`}>
              {String.fromCharCode(65 + (question.options ?? []).indexOf(opt))}
            </span>
            {opt.text}
          </button>
        ))}
      </div>
    );
  }

  if (question.type === 'COMPLETAR') {
    const blanks = question.blanks ?? [];
    // Render cloze text with input fields
    const parts = (question.clozeText ?? '').split(/\{\{[^}]+\}\}/);
    const blankMatches = [...((question.clozeText ?? '').matchAll(/\{\{([^}]+)\}\}/g))];

    return (
      <div className="flex flex-col gap-4">
        <div className="text-sm text-ink-300 leading-loose bg-ink-800/50 border border-ink-700 rounded-xl p-5">
          {parts.map((part, i) => (
            <span key={i}>
              {part}
              {i < blankMatches.length && (
                <input
                  value={blankAnswers[blankMatches[i][1]] ?? ''}
                  onChange={(e) => onBlankChange(blankMatches[i][1], e.target.value)}
                  className="inline-block mx-1 bg-ink-700 border-b-2 border-amber-500 text-amber-200 text-sm px-2 py-0.5 rounded focus:outline-none focus:bg-ink-600 min-w-24 text-center"
                  placeholder="..."
                />
              )}
            </span>
          ))}
        </div>
        {/* Fallback: show blank inputs if cloze text doesn't parse well */}
        {blanks.length > 0 && parts.length === 1 && (
          <div className="flex flex-col gap-2">
            {blanks.map((blank) => (
              <div key={blank.id} className="flex items-center gap-3">
                <span className="text-xs text-ink-500 w-20 flex-shrink-0">Hueco {blank.id}:</span>
                <input
                  value={blankAnswers[blank.id] ?? ''}
                  onChange={(e) => onBlankChange(blank.id, e.target.value)}
                  className="flex-1 bg-ink-800 border border-ink-600 text-ink-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                  placeholder="Tu respuesta..."
                />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // DESARROLLO / PRACTICO
  return (
    <div className="flex flex-col gap-2">
      <textarea
        value={freeText}
        onChange={(e) => onFreeTextChange(e.target.value)}
        rows={6}
        placeholder={question.type === 'PRACTICO' ? 'Desarrolla tu solución y/o indica el resultado numérico...' : 'Escribe tu respuesta aquí...'}
        className="w-full bg-ink-800 border border-ink-700 text-ink-100 rounded-xl px-4 py-3 text-sm font-body placeholder:text-ink-600 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent resize-none leading-relaxed"
      />
      {question.type === 'PRACTICO' && question.numericAnswer && (
        <p className="text-xs text-ink-500">Esta pregunta tiene un resultado numérico esperado.</p>
      )}
    </div>
  );
}

// ─── Answer Result ─────────────────────────────────────────────────────────────

interface AnswerResultProps {
  question: Question;
  answer: UserAnswer;
  result?: 'CORRECT' | 'WRONG' | null;
  onManualResult: (r: 'CORRECT' | 'WRONG') => void;
}

function AnswerResult({ question, answer, result, onManualResult }: AnswerResultProps) {
  const [manualSet, setManualSet] = useState(false);

  const isCorrect = result === 'CORRECT';
  const isWrong = result === 'WRONG';
  const isPending = result === null || result === undefined;

  return (
    <div className="flex flex-col gap-4 animate-fade-in">
      {/* Result banner */}
      {!isPending && (
        <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${
          isCorrect
            ? 'bg-sage-600/10 border-sage-600/30 text-sage-400'
            : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
        }`}>
          <span className="text-xl">{isCorrect ? '✓' : '✗'}</span>
          <span className="font-medium text-sm">{isCorrect ? 'Correcto' : 'Incorrecto'}</span>
        </div>
      )}

      {/* Comparison */}
      <div className="grid grid-cols-1 gap-3">
        {/* User answer */}
        <div className="bg-ink-800 border border-ink-700 rounded-xl p-4">
          <p className="text-xs text-ink-500 uppercase tracking-widest mb-2">Tu respuesta</p>
          <UserAnswerDisplay question={question} answer={answer} />
        </div>

        {/* Correct answer */}
        <div className={`border rounded-xl p-4 ${isCorrect ? 'bg-sage-600/5 border-sage-600/20' : 'bg-ink-800 border-ink-700'}`}>
          <p className="text-xs text-ink-500 uppercase tracking-widest mb-2">Respuesta correcta</p>
          <CorrectAnswerDisplay question={question} />
        </div>
      </div>

      {/* DESARROLLO/PRACTICO manual correction */}
      {(question.type === 'DESARROLLO' || question.type === 'PRACTICO') && isPending && !manualSet && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-ink-400 text-center">¿Es correcta tu respuesta?</p>
          <div className="flex gap-3 justify-center">
            <Button
              variant="secondary"
              onClick={() => { onManualResult('CORRECT'); setManualSet(true); }}
              className="flex-1 max-w-32 border-sage-600/40 text-sage-400 hover:bg-sage-600/10"
            >
              ✓ Sí
            </Button>
            <Button
              variant="secondary"
              onClick={() => { onManualResult('WRONG'); setManualSet(true); }}
              className="flex-1 max-w-32 border-rose-500/40 text-rose-400 hover:bg-rose-500/10"
            >
              ✗ No
            </Button>
          </div>
        </div>
      )}

      {/* Explanation (supports MD) */}
      {question.explanation && (
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4">
          <p className="text-xs text-amber-600 uppercase tracking-widest mb-2">Explicación</p>
          <MdContent
            content={question.explanation}
            className="text-sm text-ink-300 leading-relaxed prose prose-invert prose-sm max-w-none"
          />
        </div>
      )}

      {/* Numeric answer for PRACTICO */}
      {question.type === 'PRACTICO' && question.numericAnswer && (
        <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-4">
          <p className="text-xs text-blue-400 uppercase tracking-widest mb-2">Resultado numérico esperado</p>
          <p className="text-lg font-mono text-blue-300">{question.numericAnswer}</p>
        </div>
      )}
    </div>
  );
}

function UserAnswerDisplay({ question, answer }: { question: Question; answer: UserAnswer }) {
  if (question.type === 'TEST') {
    const selected = answer.selectedOptionIds ?? [];
    if (selected.length === 0) return <p className="text-ink-500 text-sm italic">Sin respuesta</p>;
    return (
      <div className="flex flex-col gap-1">
        {(question.options ?? [])
          .filter((o) => selected.includes(o.id))
          .map((o) => (
            <p key={o.id} className="text-sm text-ink-200">{o.text}</p>
          ))}
      </div>
    );
  }
  if (question.type === 'COMPLETAR') {
    const blanks = answer.blankAnswers ?? {};
    return (
      <div className="flex flex-col gap-1">
        {Object.entries(blanks).map(([id, val]) => (
          <p key={id} className="text-sm text-ink-200">
            <span className="text-ink-500">{id}: </span>{val || <span className="italic text-ink-600">vacío</span>}
          </p>
        ))}
      </div>
    );
  }
  // DESARROLLO / PRACTICO
  return <p className="text-sm text-ink-200 whitespace-pre-wrap">{answer.freeText || <span className="italic text-ink-600">Sin respuesta</span>}</p>;
}

function CorrectAnswerDisplay({ question }: { question: Question }) {
  if (question.type === 'TEST') {
    const correctIds = new Set(question.correctOptionIds ?? []);
    return (
      <div className="flex flex-col gap-1">
        {(question.options ?? [])
          .filter((o) => correctIds.has(o.id))
          .map((o) => (
            <p key={o.id} className="text-sm text-sage-400">{o.text}</p>
          ))}
      </div>
    );
  }
  if (question.type === 'COMPLETAR') {
    return (
      <div className="flex flex-col gap-1">
        {(question.blanks ?? []).map((b) => (
          <p key={b.id} className="text-sm text-sage-400">
            <span className="text-ink-500">{b.id}: </span>{b.accepted.join(' / ')}
          </p>
        ))}
      </div>
    );
  }
  // DESARROLLO / PRACTICO
  return (
    <div>
      <div
        className="text-sm text-sage-400 prose prose-invert prose-sm max-w-none"
        dangerouslySetInnerHTML={{ __html: renderMd(question.modelAnswer ?? 'Sin respuesta modelo') }}
      />
      {(question.keywords ?? []).length > 0 && (
        <div className="mt-3 flex gap-2 flex-wrap">
          <span className="text-xs text-ink-500">Keywords:</span>
          {question.keywords!.map((kw) => (
            <span key={kw} className="text-xs bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded">
              {kw}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
