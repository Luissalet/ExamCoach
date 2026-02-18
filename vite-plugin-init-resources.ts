/**
 * vite-plugin-init-resources.ts
 *
 * Al arrancar `npm run dev` o `npm run build`, lee public/data/global-bank.json
 * y garantiza que resources/[slug]/ existe para cada asignatura.
 *
 * ⚠️  Nunca sobreescribe archivos existentes.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

// ─── Slug (idéntico a slugify en src/domain/normalize.ts) ────────────────────

function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

// ─── Core ─────────────────────────────────────────────────────────────────────

function initResources(root: string): void {
  const resourcesDir = path.join(root, 'resources');
  fs.mkdirSync(resourcesDir, { recursive: true });

  // Buscar el banco en las ubicaciones posibles
  const candidatePaths = [
    path.join(root, 'public', 'data', 'global-bank.json'),
    path.join(root, 'src',    'data', 'global-bank.json'),
    path.join(root, 'data',   'global-bank.json'),
    path.join(root,            'global-bank.json'),
  ];

  const bankPath = candidatePaths.find(p => fs.existsSync(p));

  if (!bankPath) {
    console.log(
      '\x1b[33m[init-resources]\x1b[0m ℹ️  No se encontró global-bank.json.\n' +
      '              Exporta el banco desde la app y guárdalo en public/data/global-bank.json'
    );
    return;
  }

  console.log(`\x1b[36m[init-resources]\x1b[0m 📄 Banco encontrado: ${path.relative(root, bankPath)}`);

  let bank: { subjects?: Array<{ name: string }> };
  try {
    bank = JSON.parse(fs.readFileSync(bankPath, 'utf-8'));
  } catch (e) {
    console.error('\x1b[31m[init-resources]\x1b[0m ❌ Error al parsear global-bank.json:', e);
    return;
  }

  if (!Array.isArray(bank?.subjects)) {
    console.warn('\x1b[33m[init-resources]\x1b[0m ⚠️  El banco no tiene un array "subjects"');
    return;
  }

  if (bank.subjects.length === 0) {
    console.log('\x1b[33m[init-resources]\x1b[0m ⚠️  El banco no tiene asignaturas aún');
    return;
  }

  console.log(`\x1b[36m[init-resources]\x1b[0m 📚 ${bank.subjects.length} asignatura(s) encontradas`);

  let created = 0;

  for (const subject of bank.subjects) {
    if (!subject.name) continue;

    const slug       = slugify(subject.name);
    const subjectDir = path.join(resourcesDir, slug);
    const temasDir   = path.join(subjectDir, 'Temas');

    fs.mkdirSync(subjectDir, { recursive: true });
    fs.mkdirSync(temasDir,   { recursive: true });

    const extraInfoPath = path.join(subjectDir, 'extra_info.json');
    if (!fs.existsSync(extraInfoPath)) {
      fs.writeFileSync(
        extraInfoPath,
        JSON.stringify({ allowsNotes: false, professor: '', credits: 6, description: '', pdfs: [] }, null, 2) + '\n',
        'utf-8'
      );
      console.log(`\x1b[36m[init-resources]\x1b[0m ✅ ${slug}/extra_info.json`);
      created++;
    }

    const indexPath = path.join(temasDir, 'index.json');
    if (!fs.existsSync(indexPath)) {
      fs.writeFileSync(indexPath, '[]\n', 'utf-8');
      console.log(`\x1b[36m[init-resources]\x1b[0m ✅ ${slug}/Temas/index.json`);
      created++;
    }
  }

  if (created === 0) {
    console.log('\x1b[36m[init-resources]\x1b[0m ✓ resources/ ya está al día');
  } else {
    console.log(`\x1b[36m[init-resources]\x1b[0m 📁 ${created} archivo(s) creado(s)`);
  }
}

// ─── Plugin ───────────────────────────────────────────────────────────────────

export function initResourcesPlugin(): Plugin {
  let root: string;

  return {
    name: 'init-resources',
    enforce: 'pre',

    configResolved(config) {
      root = config.root;
    },

    buildStart() {
      initResources(root);
    },

    configureServer(server) {
      initResources(server.config.root);
    },
  };
}