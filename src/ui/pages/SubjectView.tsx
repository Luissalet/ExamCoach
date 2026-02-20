import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useStore } from '@/ui/store';
import {
  Button, Card, Modal, Input, Tabs, Badge, TypeBadge, Difficulty,
  EmptyState, StatsSummary, Select,
} from '@/ui/components';
import { QuestionForm } from '@/ui/components/QuestionForm';
import { PdfViewer, type PdfViewerHandle } from '@/ui/components/PdfViewer';
import { savePdfBlob, savePdfToServer, getPdfBlobUrl, listStoredPdfs, deleteStoredPdf } from '@/data/pdfStorage';
import type { Topic, Question, QuestionOrigin, QuestionType } from '@/domain/models';
import { slugify } from '@/domain/normalize';
import { getResourceBlobUrl,loadCategoryFromDB } from '@/data/resourceFromDB';
import { loadPdfMapping, getPdfUrl, resourcesUrl } from '@/data/resourceLoader';
type TabId = 'topics' | 'questions' | 'practice' | 'resources';

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

// ── Helper: check if question belongs to a topic (supports multi-topic) ─────
function questionBelongsToTopic(q: Question, topicId: string): boolean {
  if (q.topicId === topicId) return true;
  if (q.topicIds && q.topicIds.includes(topicId)) return true;
  return false;
}

// ── Resource file entry ─────────────────────────────────────────────────────
interface ResourceFile {
  name: string;
  path: string;
  type: string; // extension
}

interface ResourceCategory {
  name: string;
  slug: string;
  files: ResourceFile[];
  subcategories?: { name: string; files: ResourceFile[] }[];
}

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

  const [filterTopic, setFilterTopic] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterOrigin, setFilterOrigin] = useState('');
  const [filterText, setFilterText] = useState('');

  const [topicModal, setTopicModal] = useState(false);
  const [editingTopic, setEditingTopic] = useState<Topic | null>(null);
  const [topicTitle, setTopicTitle] = useState('');
  const [questionModal, setQuestionModal] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);

  // Lista combinada: resources/ estáticos + IndexedDB
  const [pdfList, setPdfList] = useState<string[]>([]);

  // Drag & drop state per topic (topicId → is dragging over)
  const [draggingOver, setDraggingOver] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null); // topicId uploading

  // Modal ver PDF
  const [viewPdfTopic, setViewPdfTopic] = useState<Topic | null>(null);
  const [viewPdfUrl, setViewPdfUrl] = useState<string | null>(null);
  const topicPdfViewerRef = useRef<PdfViewerHandle>(null);
  const activeObjectUrlRef = useRef<string | null>(null);

  // Resources tab state
  const [resources, setResources] = useState<ResourceCategory[]>([]);
  const [resourcesLoading, setResourcesLoading] = useState(false);

  useEffect(() => {
    if (!subjects.length) loadSubjects();
  }, []);

  useEffect(() => {
    if (subjectId) {
      loadTopics(subjectId);
      loadQuestions(subjectId);
    }
  }, [subjectId]);

  // Carga lista de PDFs y sincroniza bidireccional: DB → index.json y index.json → DB
  const refreshPdfList = useCallback(async () => {
    if (!subject || !subjectId) return;
    const currentTopics = topics.filter(t => t.subjectId === subjectId);

    const [mapping, dbList] = await Promise.all([
      loadPdfMapping(subject.name),
      listStoredPdfs(subjectId),
    ]);

    // index.json → DB: asignar PDFs a temas que coincidan por topicTitle y aún no tengan PDF
    for (const entry of mapping) {
      if (!entry.topicTitle || !entry.pdf) continue;
      const topic = currentTopics.find(
        t => !t.pdfFilename && t.title.trim().toLowerCase() === entry.topicTitle.trim().toLowerCase()
      );
      if (topic) {
        await updateTopic(topic.id, { pdfFilename: entry.pdf });
      }
    }

    // DB → index.json: sincronizar temas que ya tienen pdfFilename pero no están en el mapeo
    const topicsWithPdf = currentTopics.filter(t => t.pdfFilename);
    if (topicsWithPdf.length > 0) {
      const entriesToSync = topicsWithPdf
        .filter(t => !mapping.some(e => e.pdf === t.pdfFilename && e.topicTitle))
        .map(t => ({ topicTitle: t.title, pdf: t.pdfFilename! }));

      if (entriesToSync.length > 0) {
        fetch('/api/sync-pdf-mapping', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slug: slugify(subject.name), entries: entriesToSync }),
        }).catch(() => { /* solo disponible en dev, ignorar en prod */ });
      }
    }

    const staticList = mapping.map(e => e.pdf);
    const merged = Array.from(new Set([...staticList, ...dbList]));
    setPdfList(merged);
  }, [subject?.name, subjectId, topics]);

  useEffect(() => {
    refreshPdfList();
  }, [refreshPdfList]);

  // Load resources when tab changes to 'resources'
  useEffect(() => {
    if (tab !== 'resources' || !subject) return;
    loadResources();
  }, [tab, subject?.name]);

  const loadResources = async () => {
  if (!subject || !subjectId) return;
  setResourcesLoading(true);
  const slug = slugify(subject.name);
  const categories: ResourceCategory[] = [];

  // Try to load each resource category
  for (const cat of [
    { name: 'Exámenes', slug: 'Examenes' },
    { name: 'Práctica', slug: 'Practica' },
    { name: 'Resúmenes', slug: 'Resumenes' },
  ]) {
    try {
      // First, try to load from static files
      const res = await fetch(resourcesUrl(`resources/${slug}/${cat.slug}/index.json`), { cache: 'no-cache' });
      if (res.ok) {
        const data = await res.json();
        const hasFiles = (data.files && data.files.length > 0) || 
                        (data.subcategories && data.subcategories.some((sc: any) => sc.files.length > 0));
        
        if (hasFiles) {
          categories.push({ 
            name: cat.name, 
            slug: cat.slug, 
            files: data.files ?? [], 
            subcategories: data.subcategories 
          });
          continue; // Skip IndexedDB if we have static files
        }
      }
    } catch {
      // Static file not available, will try IndexedDB
    }

    // Fallback: try to load from IndexedDB
    try {
      const dbData = await loadCategoryFromDB(subjectId, cat.slug);
      const hasFiles = (dbData.files && dbData.files.length > 0) || 
                      (dbData.subcategories && dbData.subcategories.length > 0);
      
      if (hasFiles) {
        categories.push({
          name: cat.name,
          slug: cat.slug,
          files: dbData.files,
          subcategories: dbData.subcategories,
        });
      } else {
        // Empty category
        categories.push({ name: cat.name, slug: cat.slug, files: [] });
      }
    } catch (err) {
      console.error(`Error loading ${cat.slug} from IndexedDB:`, err);
      categories.push({ name: cat.name, slug: cat.slug, files: [] });
    }
  }

  setResources(categories);
  setResourcesLoading(false);
};

  // Limpiar blob URL al cerrar el modal
  useEffect(() => {
    if (!viewPdfTopic) {
      if (activeObjectUrlRef.current) {
        URL.revokeObjectURL(activeObjectUrlRef.current);
        activeObjectUrlRef.current = null;
      }
      setViewPdfUrl(null);
    }
  }, [viewPdfTopic]);

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

  const subjectTopics = topics
  .filter((t) => t.subjectId === subjectId)
  .sort((a, b) => a.title.localeCompare(b.title, 'es', { numeric: true }));
  const subjectQuestions = questions.filter((q) => q.subjectId === subjectId);

  const filteredQuestions = subjectQuestions.filter((q) => {
    if (filterTopic && !questionBelongsToTopic(q, filterTopic)) return false;
    if (filterType && q.type !== filterType) return false;
    if (filterOrigin && q.origin !== filterOrigin) return false;
    if (filterText) {
      const text = filterText.toLowerCase();
      if (!q.prompt.toLowerCase().includes(text) && !(q.tags ?? []).join(' ').toLowerCase().includes(text))
        return false;
    }
    return true;
  });

  // ── Guardar PDF (drag drop o file input) ──────────────────────────────────
  const handlePdfFile = async (topic: Topic, file: File) => {
    if (!subjectId || file.type !== 'application/pdf') return;
    setUploading(topic.id);
    try {
      // Guardar en IndexedDB (siempre) y en resources/ vía dev server (si disponible)
      await Promise.all([
        savePdfBlob(subjectId, file.name, file),
        savePdfToServer(subject.name, file.name, file, topic.title),
      ]);
      await updateTopic(topic.id, { pdfFilename: file.name });
      await refreshPdfList();
    } finally {
      setUploading(null);
      setDraggingOver(null);
    }
  };

  // ── Abrir visor PDF ────────────────────────────────────────────────────────
  const openViewPdf = async (t: Topic) => {
    if (!t.pdfFilename || !subjectId) return;
    // Intentar blob URL (IndexedDB primero)
    let url = await getPdfBlobUrl(subjectId, t.pdfFilename);
    if (url) {
      activeObjectUrlRef.current = url;
    } else {
      // Fallback a recursos estáticos
      url = getPdfUrl(subject.name, t.pdfFilename);
    }
    setViewPdfUrl(url);
    setViewPdfTopic(t);
  };

  // ── Eliminar PDF de un tema ────────────────────────────────────────────────
  const removePdf = async (t: Topic) => {
    if (!subjectId || !t.pdfFilename) return;
    if (!confirm(`¿Quitar el PDF "${t.pdfFilename}" del tema? (También se borra del almacenamiento local)`)) return;
    await deleteStoredPdf(subjectId, t.pdfFilename);
    await updateTopic(t.id, { pdfFilename: undefined });
    await refreshPdfList();
  };

  // ── Topic modal ────────────────────────────────────────────────────────────
  const handleTopicSave = async () => {
    if (!topicTitle.trim() || !subjectId) return;
    if (editingTopic) {
      await updateTopic(editingTopic.id, { title: topicTitle });
    } else {
      await createTopic({ subjectId, title: topicTitle, order: subjectTopics.length });
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
    { id: 'resources', label: 'Otros recursos' },
  ];

  return (
    <div className="min-h-screen bg-ink-950 text-ink-100 flex flex-col">
      <header className="border-b border-ink-800 bg-ink-900/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate('/')} className="text-ink-400 hover:text-ink-200 transition-colors text-sm">
              ← Inicio
            </button>
            <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: subject.color ?? '#f59e0b' }} />
            <h1 className="font-display text-xl text-ink-100">{subject.name}</h1>
          </div>
          <div className="mt-3">
            <Tabs tabs={tabs} active={tab} onChange={(id) => setTab(id as TabId)} />
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col max-w-5xl mx-auto w-full px-6 py-6 gap-4">

        {/* TEMAS */}
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
                  const qs = subjectQuestions.filter((q) => questionBelongsToTopic(q, t.id));
                  const isDragging = draggingOver === t.id;
                  const isUploading = uploading === t.id;

                  return (
                    <div
                      key={t.id}
                      onDragOver={(e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setDraggingOver(t.id); }}
                      onDragLeave={(e: React.DragEvent) => { e.stopPropagation(); setDraggingOver(null); }}
                      onDrop={(e: React.DragEvent) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const file = e.dataTransfer.files[0];
                        if (file) handlePdfFile(t, file);
                      }}
                    >
                    <Card
                      className={`group transition-all ${isDragging ? 'border-amber-500/60 bg-amber-500/5 ring-1 ring-amber-500/30' : ''}`}
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-ink-100">{t.title}</p>
                          <p className="text-xs text-ink-500 mt-0.5">{qs.length} pregunta{qs.length !== 1 ? 's' : ''}</p>

                          {/* PDF adjunto */}
                          {isUploading ? (
                            <p className="mt-2 text-xs text-amber-400 animate-pulse">⏳ Guardando PDF…</p>
                          ) : t.pdfFilename ? (
                            <div className="flex items-center gap-2 mt-2 flex-wrap">
                              <span className="text-xs text-ink-400 flex items-center gap-1">
                                📄 <span className="truncate max-w-[200px]" title={t.pdfFilename}>{t.pdfFilename}</span>
                              </span>
                              <button
                                onClick={(e) => { e.stopPropagation(); openViewPdf(t); }}
                                className="text-xs bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 hover:text-amber-300 transition-all font-medium px-2 py-0.5 rounded-md"
                              >
                                👁 Ver PDF
                              </button>
                              <label
                                onClick={(e) => e.stopPropagation()}
                                className="text-xs text-ink-500 hover:text-ink-300 hover:bg-ink-700 transition-all px-1.5 py-0.5 rounded cursor-pointer"
                                title="Cambiar PDF"
                              >
                                ✎ Cambiar
                                <input
                                  type="file"
                                  accept="application/pdf"
                                  className="hidden"
                                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePdfFile(t, f); e.target.value = ''; }}
                                />
                              </label>
                              <button
                                onClick={(e) => { e.stopPropagation(); removePdf(t); }}
                                className="text-xs text-rose-500/50 hover:text-rose-400 hover:bg-ink-700 transition-all px-1.5 py-0.5 rounded"
                                title="Quitar PDF"
                              >
                                ✕
                              </button>
                            </div>
                          ) : isDragging ? (
                            <p className="mt-2 text-xs text-amber-400 font-medium">Suelta el PDF aquí</p>
                          ) : (
                            <label
                              onClick={(e) => e.stopPropagation()}
                              className="mt-2 text-xs text-amber-500/60 hover:text-amber-400 flex items-center gap-1.5 px-2 py-1 rounded-md border border-dashed border-amber-500/25 hover:border-amber-500/50 hover:bg-amber-500/5 w-fit transition-all cursor-pointer"
                            >
                              📎 Añadir PDF <span className="text-ink-600">(arrastra o haz clic)</span>
                              <input
                                type="file"
                                accept="application/pdf"
                                className="hidden"
                                onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePdfFile(t, f); e.target.value = ''; }}
                              />
                            </label>
                          )}
                        </div>

                        <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                          <Button size="sm" variant="ghost" onClick={() => { setFilterTopic(t.id); setTab('questions'); }}>Ver</Button>
                          <Button size="sm" variant="ghost" onClick={() => openEditTopic(t)}>✎</Button>
                          <Button size="sm" variant="ghost" onClick={() => { if (confirm(`¿Eliminar "${t.title}" y sus preguntas?`)) deleteTopic(t.id); }}>
                            <span className="text-rose-400">✕</span>
                          </Button>
                        </div>
                      </div>
                    </Card>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* PREGUNTAS */}
        {tab === 'questions' && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <StatsSummary seen={totalStats.seen} correct={totalStats.correct} wrong={totalStats.wrong} />
              <Button size="sm" onClick={() => { setEditingQuestion(null); setQuestionModal(true); }}>+ Nueva pregunta</Button>
            </div>
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
                  <option value="PRACTICO">Práctico</option>
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
                  <Button size="sm" variant="ghost" onClick={() => { setFilterTopic(''); setFilterType(''); setFilterOrigin(''); setFilterText(''); }}>
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
                  const extraTopics = q.topicIds?.length
                    ? q.topicIds.filter((id) => id !== q.topicId).map((id) => subjectTopics.find((t) => t.id === id)).filter(Boolean)
                    : [];
                  return (
                    <Card key={q.id} className="group">
                      <div className="flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1.5">
                            <TypeBadge type={q.type} />
                            {q.origin && <Badge color={ORIGIN_COLORS[q.origin]}>{ORIGIN_LABELS[q.origin]}</Badge>}
                            {topic && <span className="text-xs text-ink-500">{topic.title}</span>}
                            {extraTopics.map((et) => (
                              <span key={et!.id} className="text-xs text-ink-600">+{et!.title}</span>
                            ))}
                            <Difficulty level={q.difficulty} />
                            {(q.tags ?? []).map((tag) => <Badge key={tag}>{tag}</Badge>)}
                          </div>
                          <p className="text-sm text-ink-200 line-clamp-2">{q.prompt}</p>
                          <div className="mt-2">
                            <StatsSummary seen={q.stats.seen} correct={q.stats.correct} wrong={q.stats.wrong} />
                          </div>
                        </div>
                        <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                          <Button size="sm" variant="ghost" onClick={() => { setEditingQuestion(q); setQuestionModal(true); }} title="Editar">✎</Button>
                          <Button size="sm" variant="ghost" onClick={() => duplicateQuestion(q.id)} title="Duplicar">⧉</Button>
                          <Button size="sm" variant="ghost" onClick={() => { if (confirm('¿Eliminar pregunta?')) deleteQuestion(q.id); }} title="Eliminar">
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

        {/* PRACTICAR */}
        {tab === 'practice' && (
          <PracticeConfig subjectId={subjectId!} topics={subjectTopics} questions={subjectQuestions} defaultTopicId={filterTopic} />
        )}

        {/* OTROS RECURSOS */}
        {tab === 'resources' && (
          <ResourcesTab
            subject={subject}
            resources={resources}
            loading={resourcesLoading}
          />
        )}
      </main>

      {/* Modal ver PDF */}
      <Modal
        open={!!viewPdfTopic && !!viewPdfUrl}
        onClose={() => setViewPdfTopic(null)}
        title={`${viewPdfTopic?.title ?? ''} — ${viewPdfTopic?.pdfFilename ?? ''}`}
        size="xl"
      >
        {viewPdfUrl && (
          <div className="h-[78vh]">
            <PdfViewer
              ref={topicPdfViewerRef}
              pdfList={[viewPdfTopic?.pdfFilename ?? '']}
              getPdfUrl={() => viewPdfUrl}
              initialPage={1}
            />
          </div>
        )}
      </Modal>

      {/* Modal editar tema */}
      <Modal open={topicModal} onClose={() => setTopicModal(false)} title={editingTopic ? 'Editar tema' : 'Nuevo tema'}>
        <div className="flex flex-col gap-4">
          <Input label="Título del tema" value={topicTitle} onChange={(e) => setTopicTitle(e.target.value)} placeholder="Ej: Tema 2 - Búsqueda" autoFocus />
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setTopicModal(false)}>Cancelar</Button>
            <Button onClick={handleTopicSave} disabled={!topicTitle.trim()}>{editingTopic ? 'Guardar' : 'Crear tema'}</Button>
          </div>
        </div>
      </Modal>

      {/* Modal pregunta */}
      <Modal open={questionModal} onClose={() => { setQuestionModal(false); setEditingQuestion(null); }} title={editingQuestion ? 'Editar pregunta' : 'Nueva pregunta'} size="lg">
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

// ─── Resources Tab ──────────────────────────────────────────────────────────

interface ResourcesTabProps {
  subject: import('@/domain/models').Subject;
  resources: ResourceCategory[];
  loading: boolean;
}

function ResourcesTab({ subject, resources, loading }: ResourcesTabProps) {
  const slug = slugify(subject.name);
  // Helper para abrir archivos desde static o IndexedDB
  const handleFileClick = async (file: ResourceFile, categorySlug: string, subcategoryName?: string) => {
    // Construir la URL estática
    const staticPath = subcategoryName 
      ? `${categorySlug}/${subcategoryName}/${file.name}`
      : `${categorySlug}/${file.name}`;
    const staticUrl = resourcesUrl(`resources/${slug}/${staticPath}`);
    
    // Intentar abrir desde archivos estáticos
    try {
      const res = await fetch(staticUrl, { method: 'HEAD' });
      if (res.ok) {
        window.open(staticUrl, '_blank');
        return;
      }
    } catch {}
    
    // Fallback a IndexedDB
    const dbPath = subcategoryName 
      ? `${categorySlug}/${subcategoryName}/${file.name}`
      : `${categorySlug}/${file.name}`;
    const blobUrl = await getResourceBlobUrl(subject.id, dbPath);
    
    if (blobUrl) {
      window.open(blobUrl, '_blank');
      // Liberar memoria después de 1 minuto
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    } else {
      alert('Archivo no encontrado');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-ink-400 text-sm animate-pulse">Cargando recursos…</p>
      </div>
    );
  }

  const hasAnyFiles = resources.some((cat) => cat.files.length > 0 || (cat.subcategories && cat.subcategories.some((sc) => sc.files.length > 0)));

  if (!hasAnyFiles) {
    return (
      <EmptyState
        icon={<span>📁</span>}
        title="Sin recursos adicionales"
        description="Los recursos se cargan al importar un ZIP con la estructura resources/[asignatura]/Examenes|Practica|Resumenes."
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {resources.map((cat) => {
        const totalFiles = cat.files.length + (cat.subcategories?.reduce((acc, sc) => acc + sc.files.length, 0) ?? 0);
        if (totalFiles === 0) return null;

        return (
          <div key={cat.slug}>
            <h3 className="font-display text-lg text-ink-200 mb-3 flex items-center gap-2">
              {cat.name === 'Exámenes' ? '📝' : cat.name === 'Práctica' ? '💻' : '📋'}
              {cat.name}
              <span className="text-xs text-ink-500 font-body">({totalFiles} archivo{totalFiles !== 1 ? 's' : ''})</span>
            </h3>

            {/* Direct files */}
            {cat.files.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 mb-3">
              {cat.files.map((f) => (
                <button
                  key={f.path || f.name}
                  onClick={() => handleFileClick(f, cat.slug)}
                  className="flex items-center gap-3 bg-ink-800 border border-ink-700 rounded-lg px-4 py-3 hover:border-ink-500 hover:bg-ink-750 transition-all group text-left w-full"
                >
                  <span className="text-lg">{getFileIcon(f.name)}</span>
                  <span className="text-sm text-ink-200 truncate group-hover:text-amber-300 transition-colors">{f.name}</span>
                </button>
              ))}
            </div>
          )}

            {/* Subcategories */}
            {cat.subcategories && cat.subcategories.filter((sc) => sc.files.length > 0).map((sc) => (
            <div key={sc.name} className="ml-4 mb-3">
              <p className="text-sm text-ink-400 font-medium mb-2">{sc.name}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {sc.files.map((f) => (
                  <button
                    key={f.path || f.name}
                    onClick={() => handleFileClick(f, cat.slug, sc.name)}
                    className="flex items-center gap-3 bg-ink-800 border border-ink-700 rounded-lg px-4 py-3 hover:border-ink-500 hover:bg-ink-750 transition-all group text-left w-full"
                  >
                    <span className="text-lg">{getFileIcon(f.name)}</span>
                    <span className="text-sm text-ink-200 truncate group-hover:text-amber-300 transition-colors">{f.name}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
          </div>
        );
      })}
    </div>
  );
}

function getFileIcon(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const icons: Record<string, string> = {
    pdf: '📄', docx: '📝', doc: '📝', xlsx: '📊', xls: '📊',
    ipynb: '🔬', py: '🐍', txt: '📃', md: '📃', zip: '📦',
    png: '🖼', jpg: '🖼', jpeg: '🖼',
  };
  return icons[ext] ?? '📁';
}

// ─── Practice config ──────────────────────────────────────────────────────────

const ALL_TYPES: { type: QuestionType; label: string }[] = [
  { type: 'TEST', label: 'Test' },
  { type: 'DESARROLLO', label: 'Desarrollo' },
  { type: 'COMPLETAR', label: 'Completar' },
  { type: 'PRACTICO', label: 'Práctico' },
];

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

  // Type filter checklist — all enabled by default
  const [enabledTypes, setEnabledTypes] = useState<Set<QuestionType>>(new Set(['TEST', 'DESARROLLO', 'COMPLETAR', 'PRACTICO']));

  const toggleType = (t: QuestionType) => {
    setEnabledTypes((prev) => {
      const next = new Set(prev);
      if (next.has(t)) {
        // Don't allow deselecting all
        if (next.size > 1) next.delete(t);
      } else {
        next.add(t);
      }
      return next;
    });
  };

  // Count questions by type (to show next to checkbox)
  const countByType = (type: QuestionType) => questions.filter((q) => q.type === type).length;

  // Filtered questions by enabled types
  const typeFilteredQuestions = questions.filter((q) => enabledTypes.has(q.type));

  const failedCount = typeFilteredQuestions.filter((q) => q.stats.lastResult === 'WRONG').length;
  const getAvailableCount = () => {
    if (mode === 'failed') return failedCount;
    if (mode === 'topic') return typeFilteredQuestions.filter((q) => questionBelongsToTopic(q, topicId)).length;
    return typeFilteredQuestions.length;
  };
  const available = getAvailableCount();

  const handleStart = async () => {
    if (available === 0) return;
    let pool: Question[] = [];
    if (mode === 'all') pool = [...typeFilteredQuestions];
    else if (mode === 'failed') pool = typeFilteredQuestions.filter((q) => q.stats.lastResult === 'WRONG');
    else if (mode === 'topic') pool = typeFilteredQuestions.filter((q) => questionBelongsToTopic(q, topicId));
    else { const n = Math.min(parseInt(count) || 20, typeFilteredQuestions.length); pool = [...typeFilteredQuestions].sort(() => Math.random() - 0.5).slice(0, n); }
    pool = pool.sort(() => Math.random() - 0.5);
    const { sessionRepo } = await import('@/data/repos');
    const session = await sessionRepo.create({ subjectId, mode, topicId: mode === 'topic' ? topicId : undefined, questionIds: pool.map((q) => q.id) });
    navigate(`/practice/${session.id}`);
  };

  return (
    <Card className="max-w-md">
      <div className="flex flex-col gap-4">
        <h3 className="font-display text-ink-200">Configurar sesión</h3>

        {/* Type filter checklist */}
        <div>
          <p className="text-xs font-medium text-ink-400 uppercase tracking-widest mb-2">Tipos de pregunta</p>
          <div className="flex flex-wrap gap-2">
            {ALL_TYPES.map(({ type, label }) => {
              const c = countByType(type);
              const active = enabledTypes.has(type);
              return (
                <label
                  key={type}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm cursor-pointer transition-all ${
                    active
                      ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                      : 'bg-ink-800 border-ink-700 text-ink-500'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={() => toggleType(type)}
                    className="accent-amber-500 w-3.5 h-3.5"
                  />
                  {label} <span className="text-xs opacity-60">({c})</span>
                </label>
              );
            })}
          </div>
        </div>

        <Select label="Modo" value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
          <option value="random">Aleatorio</option>
          <option value="all">Todas las preguntas</option>
          <option value="failed">Sólo falladas ({failedCount})</option>
          <option value="topic">Por tema</option>
        </Select>
        {mode === 'random' && <Input label="Número de preguntas" type="number" min="1" max={typeFilteredQuestions.length} value={count} onChange={(e) => setCount(e.target.value)} />}
        {mode === 'topic' && (
          <Select label="Tema" value={topicId} onChange={(e) => setTopicId(e.target.value)}>
            <option value="">Selecciona un tema…</option>
            {topics.map((t) => { const n = typeFilteredQuestions.filter((q) => questionBelongsToTopic(q, t.id)).length; return <option key={t.id} value={t.id}>{t.title} ({n})</option>; })}
          </Select>
        )}
        <Button onClick={handleStart} disabled={available === 0 || (mode === 'topic' && !topicId)}>Empezar ({available} preguntas)</Button>
      </div>
    </Card>
  );
}
