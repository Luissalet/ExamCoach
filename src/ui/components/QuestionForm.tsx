import React, { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { Question, Topic, QuestionType, QuestionOption, ClozeBlank } from '@/domain/models';
import { Button, Input, Textarea, Select } from './index';

interface QuestionFormProps {
  topics: Topic[];
  initial?: Partial<Question>;
  onSave: (data: Omit<Question, 'id' | 'stats' | 'createdAt' | 'updatedAt' | 'contentHash'>) => void;
  onCancel: () => void;
  subjectId: string;
}

export function QuestionForm({ topics, initial, onSave, onCancel, subjectId }: QuestionFormProps) {
  const [type, setType] = useState<QuestionType>(initial?.type ?? 'TEST');
  const [topicId, setTopicId] = useState(initial?.topicId ?? topics[0]?.id ?? '');
  const [prompt, setPrompt] = useState(initial?.prompt ?? '');
  const [explanation, setExplanation] = useState(initial?.explanation ?? '');
  const [difficulty, setDifficulty] = useState<string>(String(initial?.difficulty ?? ''));
  const [tags, setTags] = useState(initial?.tags?.join(', ') ?? '');

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
  const [blanks, setBlanks] = useState<ClozeBlank[]>(
    initial?.blanks ?? []
  );

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
                    ? 'bg-amber-500 border-amber-500'
                    : 'border-ink-600 hover:border-amber-500'
                }`}
              />
              <input
                value={opt.text}
                onChange={(e) => updateOption(opt.id, e.target.value)}
                placeholder={`Opción ${i + 1}`}
                className="flex-1 bg-ink-800 border border-ink-600 text-ink-100 rounded-lg px-3 py-2 text-sm font-body placeholder:text-ink-500 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
              />
              {options.length > 2 && (
                <button
                  type="button"
                  onClick={() => removeOption(opt.id)}
                  className="text-ink-500 hover:text-rose-400 transition-colors p-1"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
          <Button type="button" variant="ghost" size="sm" onClick={addOption}>
            + Añadir opción
          </Button>
        </div>
      )}

      {/* DESARROLLO */}
      {type === 'DESARROLLO' && (
        <>
          <Textarea
            label="Respuesta modelo"
            value={modelAnswer}
            onChange={(e) => setModelAnswer(e.target.value)}
            rows={4}
            placeholder="Respuesta correcta de referencia..."
          />
          <Input
            label="Keywords (separadas por comas)"
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            placeholder="concepto1, concepto2, ..."
            hint="Palabras clave que deben aparecer en la respuesta (indicador, no veredicto)"
          />
        </>
      )}

      {/* COMPLETAR */}
      {type === 'COMPLETAR' && (
        <div className="flex flex-col gap-3">
          <Textarea
            label='Texto cloze (usa {{respuesta}} para los huecos)'
            value={clozeText}
            onChange={(e) => setClozeText(e.target.value)}
            rows={4}
            placeholder="El método de {{Dijkstra}} se usa para encontrar el camino {{más corto}}..."
          />
          <Button type="button" variant="ghost" size="sm" onClick={parseCloze}>
            ↻ Extraer huecos del texto
          </Button>
          {blanks.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium text-ink-400 uppercase tracking-widest">Respuestas aceptadas por hueco</p>
              {blanks.map((blank) => (
                <div key={blank.id} className="flex flex-col gap-1 bg-ink-850 rounded-lg p-3 border border-ink-700">
                  <p className="text-sm text-ink-300 font-mono">Hueco: <span className="text-amber-400">{blank.id}</span></p>
                  <input
                    value={blank.accepted.join(', ')}
                    onChange={(e) => {
                      const accepted = e.target.value.split(',').map((s) => s.trim()).filter(Boolean);
                      setBlanks(blanks.map((b) => (b.id === blank.id ? { ...b, accepted } : b)));
                    }}
                    className="bg-ink-800 border border-ink-600 text-ink-100 rounded-lg px-3 py-1.5 text-sm font-body focus:outline-none focus:ring-2 focus:ring-amber-500"
                    placeholder="respuesta1, respuesta2, ..."
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Common fields */}
      <div className="grid grid-cols-2 gap-4">
        <Select
          label="Dificultad"
          value={difficulty}
          onChange={(e) => setDifficulty(e.target.value)}
        >
          <option value="">Sin definir</option>
          <option value="1">★ Muy fácil</option>
          <option value="2">★★ Fácil</option>
          <option value="3">★★★ Media</option>
          <option value="4">★★★★ Difícil</option>
          <option value="5">★★★★★ Muy difícil</option>
        </Select>
        <Input
          label="Tags (separados por comas)"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="tag1, tag2, ..."
        />
      </div>

      <Textarea
        label="Explicación (opcional)"
        value={explanation}
        onChange={(e) => setExplanation(e.target.value)}
        rows={2}
        placeholder="Explicación adicional que se mostrará tras responder..."
      />

      <div className="flex justify-end gap-3 pt-2 border-t border-ink-700">
        <Button type="button" variant="ghost" onClick={onCancel}>Cancelar</Button>
        <Button type="submit" variant="primary">
          {initial ? 'Guardar cambios' : 'Crear pregunta'}
        </Button>
      </div>
    </form>
  );
}
