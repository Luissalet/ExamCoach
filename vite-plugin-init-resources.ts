/**
 * vite-plugin-init-resources.ts
 *
 * Al arrancar `npm run dev` o `npm run build`, lee public/data/global-bank.json
 * y garantiza que resources/[slug]/ existe para cada asignatura.
 *
 * ⚠️  Nunca sobreescribe archivos existentes.
 *
 * También expone (solo en dev) el endpoint POST /api/upload-pdf para guardar
 * PDFs directamente en resources/[slug]/Temas/ y actualizar el index.json.
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

// ─── PDF upload endpoint (dev only) ──────────────────────────────────────────

function registerUploadEndpoint(server: import('vite').ViteDevServer, root: string): void {
  server.middlewares.use('/api/upload-pdf', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');

    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }

    if (req.method !== 'POST') {
      res.statusCode = 405;
      res.end(JSON.stringify({ error: 'Method not allowed' }));
      return;
    }

    let body = '';
    req.setEncoding('utf-8');
    req.on('data', (chunk: string) => { body += chunk; });
    req.on('end', () => {
      try {
        const { slug, filename, data } = JSON.parse(body) as {
          slug: string;
          filename: string;
          data: string; // base64
        };

        if (!slug || !filename || !data) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: 'Faltan campos: slug, filename, data' }));
          return;
        }

        // Sanity check: no path traversal
        const safeName = path.basename(filename);
        const safeSlug = slugify(slug);

        const temasDir = path.join(root, 'resources', safeSlug, 'Temas');
        fs.mkdirSync(temasDir, { recursive: true });

        // Escribir el PDF
        const pdfPath = path.join(temasDir, safeName);
        fs.writeFileSync(pdfPath, Buffer.from(data, 'base64'));
        console.log(`\x1b[36m[init-resources]\x1b[0m 📥 PDF guardado: resources/${safeSlug}/Temas/${safeName}`);

        // Actualizar index.json
        const indexPath = path.join(temasDir, 'index.json');
        let index: string[] = [];
        if (fs.existsSync(indexPath)) {
          try {
            index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
          } catch {
            index = [];
          }
        }
        if (!index.includes(safeName)) {
          index.push(safeName);
          fs.writeFileSync(indexPath, JSON.stringify(index, null, 2) + '\n', 'utf-8');
          console.log(`\x1b[36m[init-resources]\x1b[0m 📝 index.json actualizado: [${index.join(', ')}]`);
        }

        res.statusCode = 200;
        res.end(JSON.stringify({ ok: true, filename: safeName, index }));
      } catch (e) {
        console.error('\x1b[31m[init-resources]\x1b[0m ❌ Error en upload:', e);
        res.statusCode = 500;
        res.end(JSON.stringify({ error: String(e) }));
      }
    });
  });
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
      registerUploadEndpoint(server, server.config.root);
    },
  };
}