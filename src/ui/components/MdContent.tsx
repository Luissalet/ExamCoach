/**
 * MdContent.tsx
 *
 * Renderiza markdown con soporte para imágenes inline de preguntas.
 *
 * Para imágenes con src "question-images/uuid.ext":
 *  1. Intentan cargarse desde /public/question-images/ (disponible en dev y
 *     cuando el repo tiene los archivos commiteados).
 *  2. Si fallan (404 u otro error), se recargan desde IndexedDB como blob URL.
 *
 * Uso:
 *   <MdContent content={question.prompt} className="prose prose-invert ..." />
 */

import React, { useRef, useEffect, useMemo } from 'react';
import { marked } from 'marked';
import { getQuestionImageBlobUrl } from '@/data/questionImageStorage';

interface MdContentProps {
  content: string;
  className?: string;
}

export function MdContent({ content, className }: MdContentProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const html = useMemo(() => {
    if (!content) return '';
    try {
      return marked.parse(content, { async: false }) as string;
    } catch {
      return content;
    }
  }, [content]);

  // After render: install onerror fallback on question-images/ imgs
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const imgs = container.querySelectorAll<HTMLImageElement>('img');
    const blobUrls: string[] = [];

    imgs.forEach((img) => {
      // Match both /question-images/ and question-images/ (relative)
      if (!img.src.includes('question-images/')) return;

      img.onerror = async () => {
        // Extract just the filename from the full URL
        const filename = img.src.replace(/.*question-images\//, '');
        const blobUrl = await getQuestionImageBlobUrl(filename);
        if (blobUrl) {
          blobUrls.push(blobUrl);
          img.onerror = null; // prevent infinite loop
          img.src = blobUrl;
        }
      };
    });

    return () => {
      blobUrls.forEach(URL.revokeObjectURL);
    };
  }, [html]);

  return (
    <div
      ref={containerRef}
      className={className}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
