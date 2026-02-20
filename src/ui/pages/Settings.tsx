import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '@/ui/store';
import { db } from '@/data/db';
import { Button, Input, Card, Select } from '@/ui/components';
import { exportContributionPack, importContributionPack } from '@/data/contributionImport';
import { exportCompactSubject, exportAllCompactSubjects } from '@/data/exportCompact';
import { parseImportFile, downloadJSON } from '@/data/exportImport';
import { syncImagesToDevServer, type ImageSyncResult } from '@/data/questionImageStorage';


export function SettingsPage() {
  const navigate = useNavigate();
  const { settings, loadSettings, updateSettings, subjects, loadSubjects } = useStore();
  const [alias, setAlias] = useState('');
  const [importMsg, setImportMsg] = useState('');
  const [exportSubjectId, setExportSubjectId] = useState('');
  const [importedPacks, setImportedPacks] = useState<string[]>([]);
  const [compactExportSubjectId, setCompactExportSubjectId] = useState('');
  const [imageSyncResult, setImageSyncResult] = useState<ImageSyncResult | null>(null);
  const [syncingImages, setSyncingImages] = useState(false);
  useEffect(() => {
    loadSettings();
    loadSubjects();
  }, []);

  useEffect(() => {
    setAlias(settings.alias);
    setImportedPacks(settings.importedPackIds);
  }, [settings]);


  const handleSyncImages = async () => {
  setSyncingImages(true);
  setImageSyncResult(null);
  try {
    const result = await syncImagesToDevServer();
    setImageSyncResult(result);
  } finally {
    setSyncingImages(false);
  }
};

  const handleSaveAlias = async () => {
    await updateSettings({ alias });
  };

  const handleImportContribution = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportMsg('');
    try {
      const raw = await parseImportFile(file);
      const result = await importContributionPack(raw);
      if (result.alreadyImported) {
        setImportMsg(`ℹ️ Pack ${result.packId.slice(0, 8)}... ya fue importado anteriormente.`);
      } else if (result.errors.length > 0) {
        setImportMsg('Error: ' + result.errors[0]);
      } else {
        setImportMsg(
          `✓ Importado de ${result.createdBy}: ${result.newQuestions} preguntas nuevas, ${result.duplicates} duplicadas` +
          (result.newTopicsCreated > 0 ? `, ${result.newTopicsCreated} temas creados` : '')
        );
        setImportedPacks((p) => [...p, result.packId]);
        await loadSubjects();
      }
    } catch (err) {
      setImportMsg('Error: ' + String(err));
    }
    e.target.value = '';
  };

  const handleExportContribution = async () => {
    if (!exportSubjectId) return;
    try {
      const pack = await exportContributionPack(alias, exportSubjectId);
      const subject = subjects.find((s) => s.id === exportSubjectId);
      const filename = `contribution-${alias || 'yo'}-${subject?.name.slice(0, 20).replace(/\s+/g, '-') ?? exportSubjectId}-${new Date().toISOString().split('T')[0]}.json`;
      downloadJSON(pack, filename);
    } catch (err) {
      setImportMsg('Error al exportar: ' + String(err));
    }
  };

  const handleExportCompactSubject = async () => {
    if (!compactExportSubjectId) return;
    try {
      const compact = await exportCompactSubject(compactExportSubjectId);
      const filename = `compact-${compact.slug}-${new Date().toISOString().split('T')[0]}.json`;
      downloadJSON(compact, filename);
      setImportMsg(`✓ Exportado banco compacto: ${compact.total} preguntas`);
    } catch (err) {
      setImportMsg('Error al exportar: ' + String(err));
    }
  };

  const handleExportAllCompact = async () => {
    try {
      const allCompact = await exportAllCompactSubjects();
      const totalQuestions = allCompact.reduce((sum, s) => sum + s.total, 0);
      const filename = `compact-all-subjects-${new Date().toISOString().split('T')[0]}.json`;
      downloadJSON(allCompact, filename);
      setImportMsg(`✓ Exportado ${allCompact.length} asignaturas, ${totalQuestions} preguntas en total`);
    } catch (err) {
      setImportMsg('Error al exportar: ' + String(err));
    }
  };

  const handleClearData = async () => {
    if (!confirm('¿Eliminar TODOS los datos? Esta acción es irreversible.')) return;
    await db.subjects.clear();
    await db.topics.clear();
    await db.questions.clear();
    await db.sessions.clear();
    await db.pdfAnchors.clear();
    await db.pdfResources.clear();
    await updateSettings({ alias: '', importedPackIds: [], globalBankSyncedAt: undefined });
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-ink-950 text-ink-100">
      <header className="border-b border-ink-800 bg-ink-900/50">
        <div className="max-w-2xl mx-auto px-6 py-4 flex items-center gap-4">
          <button onClick={() => navigate('/')} className="text-ink-400 hover:text-ink-200 text-sm transition-colors">
            ← Inicio
          </button>
          <h1 className="font-display text-xl text-ink-100">Ajustes</h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-8 flex flex-col gap-6">
        {/* Identity */}
        <Card>
          <h2 className="font-display text-base text-ink-200 mb-4">Identidad</h2>
          <div className="flex flex-col gap-4">
            <Input
              label="Mi alias (para contribuciones)"
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              placeholder="Ej: Luis, Ana, Pablo..."
              hint="Se añade a las preguntas que crees para identificar tu autoría en contributions packs"
            />
            <div className="flex justify-end">
              <Button size="sm" onClick={handleSaveAlias}>Guardar alias</Button>
            </div>
          </div>
        </Card>

        {/* Export contribution */}
        <Card>
          <h2 className="font-display text-base text-ink-200 mb-1">Exportar mis preguntas</h2>
          <p className="text-sm text-ink-500 mb-4">
            Genera un <code className="text-amber-400 bg-ink-900 px-1 py-0.5 rounded text-xs">contribution pack</code> para compartir con el mantenedor del banco global.
          </p>
          {!alias && (
            <p className="text-xs text-amber-400 mb-3">⚠ Define tu alias antes de exportar</p>
          )}
          <div className="flex flex-col gap-3">
            <Select
              label="Asignatura"
              value={exportSubjectId}
              onChange={(e) => setExportSubjectId(e.target.value)}
            >
              <option value="">Selecciona una asignatura...</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </Select>
            <div className="flex justify-end">
              <Button
                size="sm"
                onClick={handleExportContribution}
                disabled={!exportSubjectId}
              >
                ↑ Exportar contribution pack
              </Button>
            </div>
          </div>
        </Card>

        {/* Exportar banco compacto para ChatGPT */}
        <Card>
          <h2 className="font-display text-base text-ink-200 mb-1">
            Exportar banco compacto (para ChatGPT)
          </h2>
          <p className="text-sm text-ink-500 mb-4">
            Exporta preguntas en formato ultra-compacto (solo tipo, prompt y hash).
            Ideal para pasarle a ChatGPT el banco de preguntas existente y evitar repeticiones
            al crear contribution packs.
          </p>

          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-2">
                <Select
                  label="Asignatura"
                  value={compactExportSubjectId}
                  onChange={(e) => setCompactExportSubjectId(e.target.value)}
                >
                  <option value="">Selecciona una asignatura...</option>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </Select>
                <Button
                  size="sm"
                  onClick={handleExportCompactSubject}
                  disabled={!compactExportSubjectId}
                >
                  ⚡ Exportar una asignatura
                </Button>
              </div>

              <div className="flex flex-col justify-end">
                <Button
                  size="sm"
                  onClick={handleExportAllCompact}
                  disabled={subjects.length === 0}
                >
                  📦 Exportar todas
                </Button>
              </div>
            </div>

            <div className="bg-ink-800 border border-ink-700 rounded-lg p-3">
              <p className="text-xs text-ink-400 mb-2 font-medium">Formato de salida:</p>
              <pre className="text-xs text-ink-300 font-mono overflow-x-auto">
{`{
  "asignatura": "Técnicas de Aprendizaje Automático",
  "slug": "tecnicas-de-aprendizaje-automatico",
  "total": 150,
  "preguntas": [
    {
      "t": "T",  // T=TEST, D=DESARROLLO, C=COMPLETAR, P=PRACTICO
      "p": "¿Qué puede aprender examinando...",
      "h": "sha256:...",
      "tp": "tema-8-aprendizaje-supervisado"
    }
  ]
}`}
              </pre>
            </div>

            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
              <p className="text-xs text-amber-400">
                <strong>💡 Uso recomendado:</strong> Exporta la asignatura, copia el JSON y pégaselo a ChatGPT
                junto con tu prompt de "crea 20 preguntas nuevas para el tema X". ChatGPT verá las preguntas
                existentes y evitará duplicarlas. El formato compacto usa ~90% menos caracteres que el global-bank.json.
              </p>
            </div>
          </div>
        </Card>

        {/* Import contribution (maintainer mode) */}
        <Card>
          <h2 className="font-display text-base text-ink-200 mb-1">Importar contribuciones</h2>
          <p className="text-sm text-ink-500 mb-4">
            Modo mantenedor: importa packs de tus compañeros y fusiónelos con el banco global. Dedupe automático por contenido.
          </p>

          {importMsg && (
            <div className={`mb-4 px-3 py-2.5 rounded-lg text-sm border ${
              importMsg.startsWith('Error') ? 'bg-rose-500/10 border-rose-500/20 text-rose-400' :
              importMsg.startsWith('ℹ') ? 'bg-ink-700 border-ink-600 text-ink-300' :
              'bg-sage-600/10 border-sage-600/20 text-sage-400'
            }`}>
              {importMsg}
            </div>
          )}

          <label className="cursor-pointer">
            <input type="file" accept=".json" className="hidden" onChange={handleImportContribution} />
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-ink-600 bg-ink-800 text-ink-300 hover:text-ink-100 hover:border-ink-500 text-sm font-medium font-body transition-all cursor-pointer">
              ↓ Seleccionar contribution pack
            </span>
          </label>

          {importedPacks.length > 0 && (
            <div className="mt-4">
              <p className="text-xs text-ink-500 uppercase tracking-widest mb-2">Packs ya importados</p>
              <div className="flex flex-col gap-1 max-h-32 overflow-y-auto">
                {importedPacks.map((id) => (
                  <code key={id} className="text-xs text-ink-600 font-mono">{id}</code>
                ))}
              </div>
            </div>
          )}
        </Card>

        {/* Danger zone */}
        <Card className="border-rose-500/20">
          <h2 className="font-display text-base text-rose-400 mb-1">Zona de peligro</h2>
          <p className="text-sm text-ink-500 mb-4">
            Elimina todos los datos locales. Exporta el banco antes si quieres conservarlo.
          </p>
          <Button variant="danger" size="sm" onClick={handleClearData}>
            Borrar todos los datos
          </Button>
        </Card>

          {/* Developer tools */}
        <Card>
          <h2 className="font-display text-base text-ink-200 mb-1">🛠 Herramientas de mantenedor</h2>
          <p className="text-sm text-ink-500 mb-4">
            Sincroniza las imágenes guardadas en IndexedDB con <code className="text-amber-400 bg-ink-900 px-1 py-0.5 rounded text-xs">public/question-images/</code> para poder commitearlas al repositorio.
            Solo funciona en modo desarrollo (<code className="text-amber-400 bg-ink-900 px-1 py-0.5 rounded text-xs">npm run dev</code>).
          </p>
          <Button
            size="sm"
            variant="secondary"
            loading={syncingImages}
            onClick={handleSyncImages}
          >
            🖼 Sincronizar imágenes a disco
          </Button>
          {imageSyncResult && (
            <div className="mt-3 text-sm text-ink-400">
              {imageSyncResult.errors.length > 0 ? (
                <span className="text-rose-400">
                  ✗ {imageSyncResult.errors.length} error(es): {imageSyncResult.errors[0]}
                </span>
              ) : (
                <span className="text-sage-400">
                  ✓ {imageSyncResult.total} imágenes — {imageSyncResult.synced} nuevas, {imageSyncResult.skipped} ya existían
                </span>
              )}
            </div>
          )}
        </Card>
        {/* About */}
        <div className="text-center text-xs text-ink-700 pb-4">
          <p>StudyApp · local-first · sin backend · tus datos son tuyos</p>
          <p className="mt-1">Built with React + Dexie + Vite · v1.0.0</p>
        </div>
      </main>
    </div>
  );
}