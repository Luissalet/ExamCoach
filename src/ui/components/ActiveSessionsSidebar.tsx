/**
 * ActiveSessionsSidebar.tsx
 *
 * Sidebar izquierdo colapsable que muestra todas las sesiones de práctica
 * activas (incompletas), tanto individuales como mixtas.
 * Permite reanudar o cancelar cada sesión.
 */

import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '@/data/db';
import type { PracticeSession, Subject } from '@/domain/models';

interface ActiveSession {
  session: PracticeSession;
  subjects: Subject[];
  isMixed: boolean;
  progress: number; // 0–100
  answeredCount: number;
  totalCount: number;
}

interface Props {
  /** Force a refresh (increment to trigger reload) */
  refreshKey?: number;
}

export function ActiveSessionsSidebar({ refreshKey }: Props) {
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [activeSessions, setActiveSessions] = useState<ActiveSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const loadSessions = useCallback(async () => {
    try {
      // Get ALL incomplete sessions (finishedAt is null/undefined, with some progress)
      const allSessions = await db.sessions.toArray();
      const incomplete = allSessions.filter(
        (s) => !s.finishedAt && s.questionIds.length > 0,
      );

      // Sort by most recent first
      incomplete.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

      // Load all subjects for name resolution
      const allSubjects = await db.subjects.toArray();
      const subjectMap = new Map(allSubjects.map((s) => [s.id, s]));

      const result: ActiveSession[] = incomplete.map((session) => {
        const isMixed = !!(session.subjectIds && session.subjectIds.length > 1);
        const subjectIdList = isMixed
          ? session.subjectIds!
          : [session.subjectId];
        const subjects = subjectIdList
          .map((id) => subjectMap.get(id))
          .filter(Boolean) as Subject[];

        const answeredCount = session.answers.length;
        const totalCount = session.questionIds.length;
        const progress =
          totalCount > 0 ? Math.round((answeredCount / totalCount) * 100) : 0;

        return { session, subjects, isMixed, progress, answeredCount, totalCount };
      });

      setActiveSessions(result);
    } catch (err) {
      console.error('Error loading active sessions:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions, refreshKey]);

  const handleCancel = async (sessionId: string) => {
    // Mark the session as finished (cancelled) so it no longer appears
    await db.sessions.update(sessionId, { finishedAt: new Date().toISOString() });
    setConfirmDeleteId(null);
    await loadSessions();
  };

  const handleResume = (sessionId: string) => {
    navigate(`/practice/${sessionId}`);
  };

  // Don't render anything if there are no active sessions
  if (!loading && activeSessions.length === 0) return null;

  return (
    <aside
      className={`flex-shrink-0 border-r border-ink-800 bg-ink-950/50 transition-all duration-300 overflow-hidden ${
        collapsed ? 'w-12' : 'w-64'
      }`}
    >
      {/* Toggle button */}
      <div className="p-2 flex items-center justify-between border-b border-ink-800">
        {!collapsed && (
          <h2 className="text-xs font-medium text-ink-500 uppercase tracking-widest px-2">
            Sesiones activas
          </h2>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-1.5 text-ink-500 hover:text-ink-300 hover:bg-ink-800 rounded-lg transition-all"
          title={collapsed ? 'Expandir sidebar' : 'Colapsar sidebar'}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className={`transition-transform ${collapsed ? 'rotate-180' : ''}`}
          >
            <path d="M10 3L5 8L10 13" />
          </svg>
        </button>
      </div>

      {/* Collapsed: just show count badge */}
      {collapsed && (
        <div className="flex flex-col items-center pt-3 gap-2">
          <button
            onClick={() => setCollapsed(false)}
            className="relative p-2 text-amber-400 hover:bg-ink-800 rounded-lg transition-colors"
            title={`${activeSessions.length} sesión(es) activa(s)`}
          >
            <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
              <path d="M6 4l8 6-8 6V4z" />
            </svg>
            {activeSessions.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-orange-500 text-[10px] text-white font-bold rounded-full flex items-center justify-center">
                {activeSessions.length}
              </span>
            )}
          </button>
        </div>
      )}

      {/* Expanded: session list */}
      {!collapsed && (
        <div className="overflow-y-auto h-[calc(100%-40px)] p-2 flex flex-col gap-2">
          {loading ? (
            <p className="text-xs text-ink-600 animate-pulse px-2 py-4 text-center">
              Cargando…
            </p>
          ) : (
            activeSessions.map(({ session, subjects, isMixed, progress, answeredCount, totalCount }) => (
              <div
                key={session.id}
                className="bg-ink-900 border border-ink-700 rounded-xl p-3 hover:border-ink-600 transition-colors group"
              >
                {/* Session type badge */}
                <div className="flex items-center gap-1.5 mb-2">
                  {isMixed ? (
                    <span className="text-[10px] bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded font-medium">
                      🔀 Mixta
                    </span>
                  ) : (
                    <span className="text-[10px] bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded font-medium">
                      📘 Individual
                    </span>
                  )}
                  <span className="text-[10px] text-ink-600 capitalize">
                    {session.mode}
                  </span>
                </div>

                {/* Subject names */}
                <div className="flex flex-wrap gap-1 mb-2">
                  {subjects.map((s) => (
                    <span
                      key={s.id}
                      className="inline-flex items-center gap-1 text-xs text-ink-300 truncate max-w-full"
                    >
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: s.color ?? '#f59e0b' }}
                      />
                      <span className="truncate">{s.name}</span>
                    </span>
                  ))}
                </div>

                {/* Progress bar */}
                <div className="mb-2">
                  <div className="flex items-center justify-between text-[10px] text-ink-500 mb-1">
                    <span>{answeredCount}/{totalCount} respondidas</span>
                    <span>{progress}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-ink-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-amber-500 rounded-full transition-all"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>

                {/* Time */}
                <p className="text-[10px] text-ink-600 mb-2">
                  {formatRelativeDate(session.createdAt)}
                </p>

                {/* Actions */}
                {confirmDeleteId === session.id ? (
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => handleCancel(session.id)}
                      className="flex-1 text-[11px] px-2 py-1.5 bg-rose-500/20 border border-rose-500/30 text-rose-400 hover:bg-rose-500/30 rounded-lg transition-colors font-medium"
                    >
                      Confirmar
                    </button>
                    <button
                      onClick={() => setConfirmDeleteId(null)}
                      className="flex-1 text-[11px] px-2 py-1.5 bg-ink-800 border border-ink-700 text-ink-400 hover:bg-ink-700 rounded-lg transition-colors"
                    >
                      No
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => handleResume(session.id)}
                      className="flex-1 text-[11px] px-2 py-1.5 bg-amber-500/20 border border-amber-500/30 text-amber-300 hover:bg-amber-500/30 rounded-lg transition-colors font-medium"
                    >
                      ▶ Reanudar
                    </button>
                    <button
                      onClick={() => setConfirmDeleteId(session.id)}
                      className="text-[11px] px-2 py-1.5 bg-ink-800 border border-ink-700 text-ink-500 hover:text-rose-400 hover:border-rose-500/30 rounded-lg transition-colors"
                      title="Cancelar sesión"
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </aside>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRelativeDate(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return 'Ahora mismo';
  if (diffMin < 60) return `Hace ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `Hace ${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD === 1) return 'Ayer';
  if (diffD < 7) return `Hace ${diffD} días`;
  return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}
