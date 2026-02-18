# StudyApp 📚

App web **local-first** para crear bancos de preguntas y practicar exámenes. Sin backend, sin servidor, tus datos son tuyos.

## Stack

- **React + TypeScript + Vite** — SPA rápida y fácil de mantener
- **Zustand** — estado global ligero
- **Dexie (IndexedDB)** — persistencia offline, funciona sin conexión
- **Zod** — validación de esquemas en export/import
- **Tailwind CSS** — estilos utilitarios

## Características

### ✅ Iteración 1 — MVP (implementada)

- **CRUD completo** de asignaturas, temas y preguntas
- **3 tipos de pregunta**: Test (multi-opción), Desarrollo (texto libre, corrección manual), Completar (cloze con huecos)
- **Cuenta atrás** para fecha de examen en el dashboard
- **Sesiones de práctica**: aleatorio N, todas, falladas, por tema
- **Resultados**: verde/rojo por pregunta, vista detalle "tu respuesta vs. correcta"
- **Export/Import banco** en JSON versionado (con nuevos UUIDs al importar para evitar colisiones)
- **Contribution packs**: exportar tus preguntas e importar las de compañeros con deduplicación por hash de contenido

### 🔜 Iteración 2 — PDF (pendiente)

- Subir PDF por asignatura (Blob en IndexedDB)
- Visor PDF.js con anclas por página
- Botón "Abrir PDF en página X" desde pregunta/resultados
- Añadir origen de pregunta (test, examen anterior)
- Info extra por asignatura e indicador de si permite apuntes o no en el dashboard

### 🔜 Iteración 3 — Resumenes (pendiente)

- Subir PDF resumen por asignatura y/o tema y organización en carpetas por usuario que lo aporta
- Guardar resumenes como predeterminados/favoritos

### 🔜 Iteración 4 — Repaso inteligente

- Scheduler basado en estadísticas (spaced repetition básico)
- Más filtros y búsqueda avanzada
- Estadísticas por tema y tipo

---

## Instalación y uso local

```bash
# Clona el repo
git clone https://github.com/tu-usuario/study-app.git
cd study-app

# Instala dependencias
npm install

# Arranca en desarrollo
npm run dev
# → http://localhost:5173
```

## Build y despliegue

```bash
# Genera la build de producción en dist/
npm run build

# Preview de la build
npm run preview
```

### GitHub Pages

1. Añade `homepage` a `package.json`:
   ```json
   "homepage": "https://tu-usuario.github.io/study-app"
   ```
2. Instala el helper (opcional):
   ```bash
   npm install -D gh-pages
   ```
3. Añade el script de deploy:
   ```json
   "deploy": "gh-pages -d dist"
   ```
4. Haz build y despliega:
   ```bash
   npm run build && npm run deploy
   ```

Cualquier hosting estático sirve: Netlify, Vercel, Cloudflare Pages, etc.

---

## Flujo de contribuciones (compañeros de clase)

El diseño permite que varios compañeros aporten preguntas sin compartir la misma base de datos.

### Para compañeros (contribuidores)

1. Clona o descarga el repo
2. Ve a **Ajustes** y define tu **alias** (p. ej., "Ana")
3. Crea las preguntas en tu instancia local
4. En **Ajustes > Exportar mis preguntas**, selecciona la asignatura y exporta un **contribution pack**
5. Comparte el JSON con el mantenedor (Discord, email, drive...)

### Para el mantenedor (banco global)

1. En **Ajustes > Importar contribuciones**, sube el JSON del compañero
2. La app fusiona automáticamente:
   - Resuelve asignaturas y temas por `subjectKey` / `topicKey` (slugs estables)
   - Crea temas nuevos si no existen
   - **Deduplica por hash de contenido** — no se importan preguntas idénticas
   - Guarda `createdBy` y `sourcePackId` para trazabilidad
3. Exporta el banco global actualizado (**Exportar banco** en el dashboard) y compártelo con todos

### Formato contribution pack

```json
{
  "version": 1,
  "kind": "contribution",
  "packId": "uuid",
  "createdBy": "Ana",
  "exportedAt": "2026-02-18T12:00:00.000Z",
  "targets": [
    {
      "subjectKey": "ia-razonamiento-y-planificacion",
      "subjectName": "IA Razonamiento y Planificación",
      "topics": [
        { "topicKey": "tema-2-busqueda", "topicTitle": "Tema 2 - Búsqueda" }
      ]
    }
  ],
  "questions": [ ... ]
}
```

---

## Estructura del proyecto

```
study-app/
├── src/
│   ├── domain/
│   │   ├── models.ts          # Interfaces TypeScript
│   │   ├── normalize.ts       # Normalización de texto y slugs
│   │   ├── scoring.ts         # Corrección TEST y COMPLETAR
│   │   └── hashing.ts         # SHA-256 para deduplicación
│   ├── data/
│   │   ├── db.ts              # Schema Dexie (IndexedDB)
│   │   ├── repos.ts           # CRUD por entidad
│   │   ├── exportImport.ts    # Export/import banco JSON
│   │   └── contributionImport.ts  # Merge de contribution packs
│   └── ui/
│       ├── store/index.ts     # Zustand store
│       ├── components/        # Componentes reutilizables
│       └── pages/             # Dashboard, SubjectView, Practice, Results, Settings
```

---

## Tipos de preguntas

| Tipo | Cómo se responde | Corrección |
|------|-----------------|------------|
| **TEST** | Seleccionar opciones (1 o varias) | Automática |
| **COMPLETAR** | Rellenar huecos `{{respuesta}}` | Automática (normalizada) |
| **DESARROLLO** | Texto libre | Manual (tú marcas ✓/✗) |

---

## Licencia

MIT — úsalo libremente para estudiar.
