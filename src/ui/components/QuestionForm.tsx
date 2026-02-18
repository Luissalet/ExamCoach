import React, { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { Question, Topic, QuestionType, QuestionOption, ClozeBlank, QuestionOrigin } from '@/domain/models';
import { Button, Input, Textarea, Select } from './index';

interface QuestionFormProps {
  topics: Topic[];
  initial?: Partial<Question>;
  onSave: (data: Omit<Question, 'id' | 'stats' | 'createdAt' | 'updatedAt' | 'contentHash'>) => void;
  onCancel: () => void;
  subjectId: string;
}

const ORIGIN_LABELS: Record<QuestionOrigin, string> = {
  test: 'Test / Práctica',
  examen_anterior: 'Examen anterior',
  clase: 'Clase',
  alumno: 'Alumno',
};

export function QuestionForm({ topics, initial, onSave, onCancel, subjectId }: QuestionFormProps) {
  const [type, setType] = useState<QuestionType>(initial?.type ?? 'TEST');
  const [topicId, setTopicId] = useState(initial?.topicId ?? topics[0]?.id ?? '');
  const [prompt, setPrompt] = useState(initial?.prompt ?? '');
  const [explanation, setExplanation] = useState(initial?.explanation ?? '');
  const [difficulty, setDifficulty] = useState<string>(String(initial?.difficulty ?? ''));
  const [tags, setTags] = useState(initial?.tags?.join(', ') ?? '');
  const [origin, setOrigin] = useState<QuestionOrigin | ''>(initial?.origin ?? '');

  // TEST
  const [options, setOptions] = useState<QuestionOption[]>(
    initial?.options ?? [
      { id: uuidv4(), text: '' },
      { id: uuidv4(), text: '' },
    ]
  );
  const [correctOptionIds, setCorrectOptionIds] = useState<string[]>(initial?.correctOptionIds ?? []);

  // DESARROLLO
  const [modelAnswer, setModelAnswer] = useState(initial?.modelAnswer ?? '');
  const [keywords, setKeywords] = useState(initial?.keywords?.join(', ') ?? '');

  // COMPLETAR
  const [clozeText, setClozeText] = useState(initial?.clozeText ?? '');
  const [blanks, setBlanks] = useState<ClozeBlank[]>(initial?.blanks ?? []);

  const addOption = () => setOptions([...options, { id: uuidv4(), text: '' }]);
  const removeOption = (id: string) => {
    setOptions(options.filter((o) => o.id !== id));
    setCorrectOptionIds(correctOptionIds.filter((c) => c !== id));
  };
  const updateOption = (id: string, text: string) =>
    setOptions(options.map((o) => (o.id === id ? { ...o, text } : o)));
  const toggleCorrect = (id: string) => {
    setCorrectOptionIds((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  };

  // Parse cloze text to extract blanks ({{blank}})
  const parseCloze = () => {
    const regex = /\{\{([^}]+)\}\}/g;
    const found: ClozeBlank[] = [];
    let match;
    while ((match = regex.exec(clozeText)) !== null) {
      const existing = blanks.find((b) => b.id === match![1]);
      found.push(existing ?? { id: match![1], accepted: [match![1]] });
    }
    setBlanks(found);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedTags = tags.split(',').map((t) => t.trim()).filter(Boolean);
    const parsedKeywords = keywords.split(',').map((k) => k.trim()).filter(Boolean);
    const diff = difficulty ? (parseInt(difficulty) as Question['difficulty']) : undefined;

    onSave({
      subjectId,
      topicId,
      type,
      prompt,
      explanation: explanation || undefined,
      difficulty: diff,
      tags: parsedTags.length > 0 ? parsedTags : undefined,
      origin: origin || undefined,
      options: type === 'TEST' ? options.filter((o) => o.text.trim()) : undefined,
      correctOptionIds: type === 'TEST' ? correctOptionIds : undefined,
      modelAnswer: type === 'DESARROLLO' ? modelAnswer : undefined,
      keywords: type === 'DESARROLLO' && parsedKeywords.length > 0 ? parsedKeywords : undefined,
      clozeText: type === 'COMPLETAR' ? clozeText : undefined,
      blanks: type === 'COMPLETAR' ? blanks : undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {/* Row 1: type + topic */}
      <div className="grid grid-cols-2 gap-4">
        <Select
          label="Tipo"
          value={type}
          onChange={(e) => setType(e.target.value as QuestionType)}
        >
          <option value="TEST">Test</option>
          <option value="DESARROLLO">Desarrollo</option>
          <option value="COMPLETAR">Completar</option>
        </Select>
        <Select
          label="Tema"
          value={topicId}
          onChange={(e) => setTopicId(e.target.value)}
        >
          {topics.map((t) => (
            <option key={t.id} value={t.id}>{t.title}</option>
          ))}
        </Select>
      </div>

      {/* Row 2: origin + difficulty */}
      <div className="grid grid-cols-2 gap-4">
        <Select
          label="Origen"
          value={origin}
          onChange={(e) => setOrigin(e.target.value as QuestionOrigin | '')}
        >
          <option value="">Sin especificar</option>
          {(Object.keys(ORIGIN_LABELS) as QuestionOrigin[]).map((key) => (
            <option key={key} value={key}>{ORIGIN_LABELS[key]}</option>
          ))}
        </Select>
        <Select
          label="Dificultad"
          value={difficulty}
          onChange={(e) => setDifficulty(e.target.value)}
        >
          <option value="">Sin especificar</option>
          <option value="1">★ Muy fácil</option>
          <option value="2">★★ Fácil</option>
          <option value="3">★★★ Media</option>
          <option value="4">★★★★ Difícil</option>
          <option value="5">★★★★★ Muy difícil</option>
        </Select>
      </div>

      <Textarea
        label="Enunciado"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        required
        rows={3}
        placeholder="Escribe la pregunta aquí..."
      />

      {/* TEST options */}
      {type === 'TEST' && (
        <div className="flex flex-col gap-3">
          <p className="text-xs font-medium text-ink-400 uppercase tracking-widest">Opciones (marca las correctas)</p>
          {options.map((opt, i) => (
            <div key={opt.id} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => toggleCorrect(opt.id)}
                className={`w-5 h-5 rounded flex-shrink-0 border-2 transition-colors ${
                  correctOptionIds.includes(opt.id)
                    ? 'bg-sage-500 border-sage-500'
                    : 'border-ink-600 hover:border-ink-400'
                }`}
                title="Marcar como correcta"
              >
                {correctOptionIds.includes(opt.id) && (
                  <svg className="w-3 h-3 text-ink-900 mx-auto" viewBox="0 0 12 12" fill="currentColor">
                    <path d="M10 3L5 8.5 2 5.5l-1 1 4 4 6-7z" />
                  </svg>
                )}
              </button>
              <input
                type="text"
                value={opt.text}
                onChange={(e) => updateOption(opt.id, e.target.value)}
                placeholder={`Opción ${i + 1}`}
                className="flex-1 bg-ink-800 border border-ink-600 text-ink-100 rounded-lg px-3 py-2 text-sm font-body focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              <button
                type="button"
                onClick={() => removeOption(opt.id)}
                className="text-ink-600 hover:text-rose-400 transition-colors text-xs px-1"
                disabled={options.length <= 2}
              >
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addOption}
            className="text-xs text-ink-500 hover:text-ink-300 text-left transition-colors"
          >
            + Añadir opción
          </button>
        </div>
      )}

      {/* DESARROLLO */}
      {type === 'DESARROLLO' && (
        <div className="flex flex-col gap-3">
          <Textarea
            label="Respuesta modelo"
            value={modelAnswer}
            onChange={(e) => setModelAnswer(e.target.value)}
            rows={4}
            placeholder="Respuesta esperada…"
          />
          <Input
            label="Palabras clave (separadas por coma)"
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            placeholder="ej: fotosíntesis, cloroplasto, ATP"
          />
        </div>
      )}

      {/* COMPLETAR */}
      {type === 'COMPLETAR' && (
        <div className="flex flex-col gap-3">
          <div>
            <Textarea
              label="Texto cloze (usa {{respuesta}} para los huecos)"
              value={clozeText}
              onChange={(e) => setClozeText(e.target.value)}
              rows={4}
              placeholder="La mitocondria es la {{central eléctrica}} de la célula."
            />
            <button
              type="button"
              onClick={parseCloze}
              className="mt-2 text-xs text-amber-400 hover:text-amber-300 transition-colors"
            >
              ↻ Detectar huecos
            </button>
          </div>
          {blanks.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium text-ink-400 uppercase tracking-widest">
                Respuestas aceptadas por hueco
              </p>
              {blanks.map((b) => (
                <div key={b.id} className="flex items-center gap-3">
                  <span className="text-xs text-ink-500 font-mono w-28 truncate">{'{{'}{b.id}{'}}'}</span>
                  <input
                    type="text"
                    value={b.accepted.join(', ')}
                    onChange={(e) =>
                      setBlanks(
                        blanks.map((bl) =>
                          bl.id === b.id
                            ? { ...bl, accepted: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) }
                            : bl
                        )
                      )
                    }
                    className="flex-1 bg-ink-800 border border-ink-600 text-ink-100 rounded-lg px-3 py-1.5 text-xs font-body focus:outline-none focus:ring-2 focus:ring-amber-500"
                    placeholder="respuesta1, resp alternativa…"
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Explanation + tags */}
      <Textarea
        label="Explicación / feedback (opcional)"
        value={explanation}
        onChange={(e) => setExplanation(e.target.value)}
        rows={2}
        placeholder="Se muestra al revisar resultados…"
      />
      <Input
        label="Tags (separados por coma)"
        value={tags}
        onChange={(e) => setTags(e.target.value)}
        placeholder="ej: busqueda, heuristica, A*"
      />

      {/* Actions */}
      <div className="flex gap-3 justify-end pt-1">
        <Button type="button" variant="ghost" onClick={onCancel}>Cancelar</Button>
        <Button type="submit" disabled={!prompt.trim() || !topicId}>
          {initial?.id ? 'Guardar cambios' : 'Crear pregunta'}
        </Button>
      </div>
    </form>
  );
}