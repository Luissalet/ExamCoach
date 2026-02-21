/**
 * CalendarWidget.tsx
 *
 * Mini calendario mensual para el Dashboard.
 * Muestra los deliverables (actividades/tests) de todas las asignaturas
 * con indicación de estado (pending/in_progress/done/submitted).
 */

import { useEffect, useState, useMemo } from 'react';
import { deliverableRepo } from '@/data/deliverableRepo';
import type { Deliverable, Subject, DeliverableStatus } from '@/domain/models';
import { isDeliverableCompleted } from '@/domain/models';

interface CalendarWidgetProps {
  subjects: Subject[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number) {
  // 0=Sun…6=Sat → convert to Mon-based (0=Mon…6=Sun)
  const day = new Date(year, month, 1).getDay();
  return (day + 6) % 7;
}

function toDateStr(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

const STATUS_LABEL: Record<DeliverableStatus, string> = {
  pending: 'Pendiente',
  in_progress: 'En progreso',
  done: 'Hecho',
  submitted: 'Entregado',
};

const STATUS_COLOR: Record<DeliverableStatus, string> = {
  pending: 'text-ink-500',
  in_progress: 'text-blue-400',
  done: 'text-sage-400',
  submitted: 'text-amber-400',
};

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];
const DAY_LABELS = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'];

// ─── Component ────────────────────────────────────────────────────────────────

export function CalendarWidget({ subjects }: CalendarWidgetProps) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [deliverables, setDeliverables] = useState<Deliverable[]>([]);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  // Subject color lookup
  const subjectColor = useMemo(() => {
    const map: Record<string, string> = {};
    for (const s of subjects) map[s.id] = s.color ?? '#f59e0b';
    return map;
  }, [subjects]);

  // Subject name lookup
  const subjectName = useMemo(() => {
    const map: Record<string, string> = {};
    for (const s of subjects) map[s.id] = s.name;
    return map;
  }, [subjects]);

  useEffect(() => {
    deliverableRepo.getAll().then(setDeliverables);
  }, []);

  // Group by dueDate
  const byDate = useMemo(() => {
    const map: Record<string, Deliverable[]> = {};
    for (const d of deliverables) {
      if (!d.dueDate) continue;
      if (!map[d.dueDate]) map[d.dueDate] = [];
      map[d.dueDate].push(d);
    }
    return map;
  }, [deliverables]);

  // Calendar grid
  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDow = getFirstDayOfWeek(viewYear, viewMonth);
  const todayStr = toDateStr(today.getFullYear(), today.getMonth(), today.getDate());

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
    setSelectedDay(null);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
    setSelectedDay(null);
  };

  // Selected day events
  const selectedEvents = selectedDay ? (byDate[selectedDay] ?? []) : [];

  return (
    <div className="bg-ink-900 border border-ink-700 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-ink-800">
        <button
          onClick={prevMonth}
          className="text-ink-500 hover:text-ink-200 transition-colors px-1"
        >
          ‹
        </button>
        <span className="text-sm font-medium text-ink-200 font-display">
          {MONTH_NAMES[viewMonth]} {viewYear}
        </span>
        <button
          onClick={nextMonth}
          className="text-ink-500 hover:text-ink-200 transition-colors px-1"
        >
          ›
        </button>
      </div>

      {/* Day-of-week header */}
      <div className="grid grid-cols-7 px-2 pt-2">
        {DAY_LABELS.map(d => (
          <div key={d} className="text-center text-xs text-ink-600 pb-1">{d}</div>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-7 gap-px px-2 pb-2">
        {/* Empty cells before first day */}
        {Array.from({ length: firstDow }).map((_, i) => (
          <div key={`e-${i}`} />
        ))}

        {/* Days */}
        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
          const dateStr = toDateStr(viewYear, viewMonth, day);
          const events = byDate[dateStr] ?? [];
          const isToday = dateStr === todayStr;
          const isSelected = dateStr === selectedDay;
          const hasEvents = events.length > 0;
          const allDone = hasEvents && events.every(e => isDeliverableCompleted(e.status));
          const somePending = hasEvents && events.some(e => !isDeliverableCompleted(e.status));

          return (
            <button
              key={day}
              onClick={() => setSelectedDay(isSelected ? null : dateStr)}
              className={`
                relative flex flex-col items-center rounded-lg py-1 text-xs transition-all
                ${isSelected ? 'bg-amber-500/20 ring-1 ring-amber-500' : 'hover:bg-ink-800'}
                ${isToday ? 'font-bold' : ''}
              `}
            >
              <span className={`
                w-6 h-6 flex items-center justify-center rounded-full
                ${isToday ? 'bg-amber-500 text-ink-900 font-bold' : 'text-ink-300'}
              `}>
                {day}
              </span>

              {/* Event dots */}
              {hasEvents && (
                <div className="flex gap-0.5 mt-0.5 flex-wrap justify-center max-w-[24px]">
                  {events.slice(0, 3).map((ev, idx) => (
                    <div
                      key={idx}
                      className={`w-1.5 h-1.5 rounded-full transition-opacity ${isDeliverableCompleted(ev.status) ? 'opacity-40' : 'opacity-100'}`}
                      style={{ backgroundColor: subjectColor[ev.subjectId] ?? '#f59e0b' }}
                    />
                  ))}
                  {events.length > 3 && (
                    <span className="text-ink-600 text-[8px] leading-none">+{events.length - 3}</span>
                  )}
                </div>
              )}

              {/* Status indicator */}
              {isSelected && hasEvents && (
                <span className={`absolute -top-0.5 -right-0.5 text-[8px] font-bold ${allDone ? 'text-sage-400' : somePending ? 'text-amber-400' : ''}`}>
                  {allDone ? '✓' : '!'}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Selected day detail */}
      {selectedDay && selectedEvents.length > 0 && (
        <div className="border-t border-ink-800 px-4 py-3 flex flex-col gap-2">
          <p className="text-xs text-ink-500 font-medium uppercase tracking-widest mb-1">
            {new Date(selectedDay + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
          {selectedEvents.map(ev => (
            <div key={ev.id} className="flex items-center gap-2">
              <div
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: subjectColor[ev.subjectId] ?? '#f59e0b' }}
              />
              <span className={`text-xs flex-1 truncate ${isDeliverableCompleted(ev.status) ? 'text-ink-500 line-through' : 'text-ink-200'}`}>
                {ev.name}
              </span>
              <span className="text-xs text-ink-600 flex-shrink-0">
                {subjectName[ev.subjectId]?.split(' ')[0] ?? ''}
              </span>
              <span className={`text-xs flex-shrink-0 ${STATUS_COLOR[ev.status]}`}>
                {STATUS_LABEL[ev.status]}
              </span>
            </div>
          ))}
        </div>
      )}

      {selectedDay && selectedEvents.length === 0 && (
        <div className="border-t border-ink-800 px-4 py-3">
          <p className="text-xs text-ink-600 text-center">Sin entregas este día</p>
        </div>
      )}
    </div>
  );
}