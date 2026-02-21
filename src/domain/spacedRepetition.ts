import type { Question } from './models';

export interface SM2Stats {
  easeFactor: number;
  interval: number;
  repetitions: number;
}

export function calcNextReview(
  current: Partial<SM2Stats>,
  result: 'CORRECT' | 'WRONG'
): SM2Stats & { nextReviewAt: string } {
  const ef = current.easeFactor ?? 2.5;
  const reps = current.repetitions ?? 0;
  const q = result === 'CORRECT' ? 5 : 0;

  let newEf = ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  newEf = Math.max(1.3, newEf);

  let newInterval: number;
  let newReps: number;

  if (q < 3) {
    newInterval = 1;
    newReps = 0;
  } else {
    newReps = reps + 1;
    if (reps === 0) newInterval = 1;
    else if (reps === 1) newInterval = 6;
    else newInterval = Math.round((current.interval ?? 1) * newEf);
  }

  const nextDate = new Date();
  nextDate.setDate(nextDate.getDate() + newInterval);

  return {
    easeFactor: newEf,
    interval: newInterval,
    repetitions: newReps,
    nextReviewAt: nextDate.toISOString().split('T')[0],
  };
}

export function sortByPriority(questions: Question[]): Question[] {
  const today = new Date().toISOString().split('T')[0];
  return [...questions].sort((a, b) => {
    const aDate = a.stats.nextReviewAt ?? '0000-00-00';
    const bDate = b.stats.nextReviewAt ?? '0000-00-00';
    const aOverdue = aDate <= today;
    const bOverdue = bDate <= today;
    if (aOverdue && !bOverdue) return -1;
    if (!aOverdue && bOverdue) return 1;
    return aDate.localeCompare(bDate);
  });
}
