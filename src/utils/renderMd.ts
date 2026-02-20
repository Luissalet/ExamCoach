/**
 * renderMd.ts
 *
 * Utilidad compartida para renderizar Markdown con soporte KaTeX.
 *
 * Soporta los delimitadores más habituales:
 *   - $...$ y $$...$$ (estilo pandoc/KaTeX)
 *   - \(...\) y \[...\]  (estilo LaTeX)
 */

import { marked } from 'marked';
import markedKatex from 'marked-katex-extension';
import 'katex/dist/katex.min.css';

// Configura marked+KaTeX una sola vez al importar el módulo
marked.use(
  markedKatex({
    throwOnError: false,
    nonStandard: true, // permite $...$ además de $$...$$
  })
);

/**
 * Convierte delimitadores \(...\) y \[...\] a los equivalentes
 * $...$ y $$...$$ que entiende marked-katex-extension.
 */
function normalizeLatexDelimiters(text: string): string {
  return text
    // \[...\]  →  $$\n...\n$$   (display math)
    .replace(/\\\[([\s\S]+?)\\\]/g, (_m, math) => `$$\n${math}\n$$`)
    // \(...\)  →  $...$           (inline math)
    .replace(/\\\(([\s\S]+?)\\\)/g, (_m, math) => `$${math}$`);
}

/** Renderiza texto Markdown (con LaTeX) a HTML. */
export function renderMd(text: string): string {
  if (!text) return '';
  try {
    return marked.parse(normalizeLatexDelimiters(text), { async: false }) as string;
  } catch {
    return text;
  }
}