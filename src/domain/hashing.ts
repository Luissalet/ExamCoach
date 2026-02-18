import type { Question, ContributionQuestion } from './models';
import { normalizeText, slugify } from './normalize';

/**
 * Compute a stable content hash for a question.
 * Used to detect duplicates when merging contribution packs.
 * Based on: type, normalized prompt, normalized options/answers, topicKey.
 */
export async function computeContentHash(
  q: Pick<Question, 'type' | 'prompt' | 'options' | 'correctOptionIds' | 'modelAnswer' | 'clozeText' | 'blanks'>,
  topicKey: string
): Promise<string> {
  const parts: string[] = [
    q.type,
    normalizeText(q.prompt),
    slugify(topicKey),
  ];

  if (q.type === 'TEST') {
    const optionTexts = (q.options ?? [])
      .map((o) => normalizeText(o.text, true))
      .sort()
      .join('|');
    parts.push(optionTexts);
    parts.push([...(q.correctOptionIds ?? [])].sort().join(','));
  } else if (q.type === 'DESARROLLO') {
    parts.push(normalizeText(q.modelAnswer ?? ''));
  } else if (q.type === 'COMPLETAR') {
    parts.push(normalizeText(q.clozeText ?? ''));
    const blanksStr = (q.blanks ?? [])
      .map((b) => b.accepted.map((a) => normalizeText(a, true)).sort().join(','))
      .join('|');
    parts.push(blanksStr);
  }

  const raw = parts.join('::');
  const encoder = new TextEncoder();
  const data = encoder.encode(raw);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return 'sha256:' + hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Compute hash for a contribution question (uses subjectKey+topicKey as context).
 */
export async function computeContributionHash(q: ContributionQuestion): Promise<string> {
  return computeContentHash(q, q.topicKey);
}
