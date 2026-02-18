import React, { useState, useRef, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { Question, Topic, QuestionType, QuestionOption, ClozeBlank, QuestionOrigin } from '@/domain/models';
import { Button, Input, Textarea, Select } from './index';
import { marked } from 'marked';

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

// ─── Expandable Textarea with optional MD preview ────────────────────────────

interface ExpandableTextareaProps {
  label: string;
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  rows?: number;
  required?: boolean;
  supportsMd?: boolean;
  initial?: { imageDataUrls?: string[] };
}

function ExpandableTextarea({ label, value, onChange, placeholder, rows = 3, required, supportsMd, initial }: ExpandableTextareaProps) {
  const [expanded, setExpanded] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [imageDataUrls, setImageDataUrls] = useState<string[]>(initial?.imageDataUrls ?? []);

  // Auto-resize when expanded
  useEffect(() => {
    if (expanded && textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [expanded, value]);

  const renderedMd = useCallback(() => {
    if (!value) return '';
    return marked.parse(value, { async: false }) as string;
  }, [value]);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-ink-400 uppercase tracking-widest">{label}</label>
        <div className="flex items-center gap-2">
          {supportsMd && value && (
            <button
              type="button"
              onClick={() => setShowPreview(!showPreview)}
              className="text-xs text-ink-500 hover:text-ink-300 transition-colors px-1.5 py-0.5 rounded hover:bg-ink-700"
              title={showPreview ? 'Editar' : 'Vista previa MD'}
            >
              {showPreview ? '✎ Editar' : '👁 Preview'}
            </button>
          )}
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-ink-500 hover:text-ink-300 transition-colors px-1.5 py-0.5 rounded hover:bg-ink-700"
            title={expanded ? 'Contraer' : 'Expandir'}
          >
            {expanded ? '↗ Contraer' : '↙ Expandir'}
          </button>
        </div>
      </div>
      {showPreview && supportsMd ? (
        <div
          className="bg-ink-800 border border-ink-600 text-ink-100 rounded-lg px-3 py-2 text-sm font-body prose prose-invert prose-sm max-w-none min-h-[60px] overflow-auto"
          style={expanded ? { maxHeight: '60vh' } : { maxHeight: '200px' }}
          dangerouslySetInnerHTML={{ __html: renderedMd() }}
        />
      ) : (
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          required={required}
          rows={expanded ? undefined : rows}
          className={`bg-ink-800 border border-ink-600 text-ink-100 rounded-lg px-3 py-2 text-sm font-body placeholder:text-ink-500 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all ${
            expanded ? 'min-h-[200px] max-h-[60vh] overflow-auto resize-y' : 'resize-none'
          }`}
          style={expanded ? { height: 'auto', minHeight: '200px' } : undefined}
        />
      )}
      {supportsMd && (
        <p className="text-xs text-ink-600">Soporta Markdown: **negrita**, *cursiva*, tablas, listas…</p>
      )}
    </div>
  );
}

// ─── Image uploader ──────────────────────────────────────────────────────────

interface ImageUploaderProps {
  images: string[];
  onChange: (urls: string[]) => void;
}

function ImageUploader({ images, onChange }: ImageUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const newUrls: string[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue;
      const dataUrl = await fileToDataUrl(file);
      newUrls.push(dataUrl);
    }
    onChange([...images, ...newUrls]);
  };

  const remove = (idx: number) =>
    onChange(images.filter((_, i) => i !== idx));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-ink-400 uppercase tracking-widest">
          Imágenes del enunciado
        </label>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="text-xs text-ink-500 hover:text-ink-300 transition-colors px-1.5 py-0.5 rounded hover:bg-ink-700"
        >
          + Añadir imagen
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((url, idx) => (
            <div key={idx} className="relative group w-28 h-20 rounded-lg overflow-hidden border border-ink-600">
              <img src={url} alt={`imagen ${idx + 1}`} className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => remove(idx)}
                className="absolute top-1 right-1 bg-ink-900/80 text-rose-400 rounded-full w-5 h-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

// ─── Multi-topic selector ────────────────────────────────────────────────────

interface MultiTopicSelectorProps {
  topics: Topic[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

function MultiTopicSelector({ topics, selectedIds, onChange }: MultiTopicSelectorProps) {
  const [showAll, setShowAll] = useState(false);

  const toggleTopic = (id: string) => {
    if (selectedIds.includes(id)) {
      // Don't remove the last one
      if (selectedIds.length > 1) {
        onChange(selectedIds.filter((s) => s !== id));
      }
    } else {
      onChange([...selectedIds, id]);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-ink-400 uppercase tracking-widest">
          Temas ({selectedIds.length} seleccionado{selectedIds.length !== 1 ? 's' : ''})
        </label>
        <button
          type="button"
          onClick={() => setShowAll(!showAll)}
          className="text-xs text-ink-500 hover:text-ink-300 transition-colors"
        >
          {showAll ? 'Ocultar' : 'Mostrar todos'}
        </button>
      </div>
      {!showAll ? (
        // Compact: show selected as badges + dropdown to add more
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-1.5">
            {selectedIds.map((id) => {
              const t = topics.find((tp) => tp.id === id);
              if (!t) return null;
              return (
                <span
                  key={id}
                  className="inline-flex items-center gap-1 bg-amber-500/15 text-amber-300 border border-amber-500/25 rounded-md px-2 py-0.5 text-xs"
                >
                  {t.title}
                  {selectedIds.length > 1 && (
                    <button
                      type="button"
                      onClick={() => toggleTopic(id)}
                      className="text-amber-500/60 hover:text-amber-300 ml-0.5"
                    >
                      ✕
                    </button>
                  )}
                </span>
              );
            })}
          </div>
          <select
            value=""
            onChange={(e) => { if (e.target.value) toggleTopic(e.target.value); }}
            className="bg-ink-800 border border-ink-600 text-ink-100 rounded-lg px-3 py-2 text-sm font-body focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all"
          >
            <option value="">+ Añadir tema…</option>
            {topics.filter((t) => !selectedIds.includes(t.id)).map((t) => (
              <option key={t.id} value={t.id}>{t.title}</option>
            ))}
          </select>
        </div>
      ) : (
        // Full: show all topics with checkboxes
        <div className="flex flex-col gap-1 max-h-52 overflow-y-auto rounded-lg border border-ink-700 p-2 bg-ink-800/50">
          {topics.map((t) => (
            <label
              key={t.id}
              className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer text-sm transition-colors ${
                selectedIds.includes(t.id) ? 'bg-amber-500/10 text-amber-300' : 'text-ink-300 hover:bg-ink-700'
              }`}
            >
              <input
                type="checkbox"
                checked={selectedIds.includes(t.id)}
                onChange={() => toggleTopic(t.id)}
                className="accent-amber-500"
              />
              {t.title}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main form ───────────────────────────────────────────────────────────────

export function QuestionForm({ topics, initial, onSave, onCancel, subjectId }: QuestionFormProps) {
  const [type, setType] = useState<QuestionType>(initial?.type ?? 'TEST');

  // Multi-topic support
  const initialTopicIds = initial?.topicIds?.length
    ? initial.topicIds
    : initial?.topicId
    ? [initial.topicId]
    : topics[0]?.id
    ? [topics[0].id]
    : [];
  const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>(initialTopicIds);

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
  const [imageDataUrls, setImageDataUrls] = useState<string[]>([]);

  // DESARROLLO / PRACTICO
  const [modelAnswer, setModelAnswer] = useState(initial?.modelAnswer ?? '');
  const [keywords, setKeywords] = useState(initial?.keywords?.join(', ') ?? '');
  const [numericAnswer, setNumericAnswer] = useState(initial?.numericAnswer ?? '');

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

    const primaryTopicId = selectedTopicIds[0] ?? '';

    onSave({
      subjectId,
      topicId: primaryTopicId,
      topicIds: selectedTopicIds.length > 1 ? selectedTopicIds : undefined,
      type,
      prompt,
      explanation: explanation || undefined,
      difficulty: diff,
      tags: parsedTags.length > 0 ? parsedTags : undefined,
      origin: origin || undefined,
      options: type === 'TEST' ? options.filter((o) => o.text.trim()) : undefined,
      correctOptionIds: type === 'TEST' ? correctOptionIds : undefined,
      modelAnswer: (type === 'DESARROLLO' || type === 'PRACTICO') ? modelAnswer : undefined,
      keywords: (type === 'DESARROLLO' || type === 'PRACTICO') && parsedKeywords.length > 0 ? parsedKeywords : undefined,
      numericAnswer: type === 'PRACTICO' && numericAnswer ? numericAnswer : undefined,
      clozeText: type === 'COMPLETAR' ? clozeText : undefined,
      blanks: type === 'COMPLETAR' ? blanks : undefined,
      imageDataUrls: imageDataUrls.length > 0 ? imageDataUrls : undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {/* Row 1: type + origin */}
      <div className="grid grid-cols-2 gap-4">
        <Select
          label="Tipo"
          value={type}
          onChange={(e) => setType(e.target.value as QuestionType)}
        >
          <option value="TEST">Test</option>
          <option value="DESARROLLO">Desarrollo</option>
          <option value="COMPLETAR">Completar</option>
          <option value="PRACTICO">Práctico</option>
        </Select>
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
      </div>

      {/* Multi-topic selector */}
      <MultiTopicSelector
        topics={topics}
        selectedIds={selectedTopicIds}
        onChange={setSelectedTopicIds}
      />

      {/* Row 2: difficulty */}
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

      {/* Prompt - expandable + MD */}
      <ExpandableTextarea
        label="Enunciado"
        value={prompt}
        onChange={setPrompt}
        required
        rows={3}
        placeholder="Escribe la pregunta aquí..."
        supportsMd
      />
      {/* Imágenes del enunciado */}
      <ImageUploader images={imageDataUrls} onChange={setImageDataUrls} />

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

      {/* DESARROLLO / PRACTICO */}
      {(type === 'DESARROLLO' || type === 'PRACTICO') && (
        <div className="flex flex-col gap-3">
          <ExpandableTextarea
            label="Respuesta modelo"
            value={modelAnswer}
            onChange={setModelAnswer}
            rows={4}
            placeholder="Respuesta esperada…"
            supportsMd
          />
          <Input
            label="Palabras clave (separadas por coma)"
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            placeholder="ej: fotosíntesis, cloroplasto, ATP"
          />
          {type === 'PRACTICO' && (
            <Input
              label="Resultado numérico esperado (opcional)"
              value={numericAnswer}
              onChange={(e) => setNumericAnswer(e.target.value)}
              placeholder="ej: 42.5, 3.14159, 0.95"
            />
          )}
        </div>
      )}

      {/* COMPLETAR */}
      {type === 'COMPLETAR' && (
        <div className="flex flex-col gap-3">
          <div>
            <ExpandableTextarea
              label="Texto cloze (usa {{respuesta}} para los huecos)"
              value={clozeText}
              onChange={setClozeText}
              rows={4}
              placeholder="La mitocondria es la {{central eléctrica}} de la célula."
              supportsMd
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

      {/* Explanation + tags - expandable + MD */}
      <ExpandableTextarea
        label="Explicación / feedback (opcional)"
        value={explanation}
        onChange={setExplanation}
        rows={2}
        placeholder="Se muestra al revisar resultados…"
        supportsMd
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
        <Button type="submit" disabled={!prompt.trim() || selectedTopicIds.length === 0}>
          {initial?.id ? 'Guardar cambios' : 'Crear pregunta'}
        </Button>
      </div>
    </form>
  );
}
