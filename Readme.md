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
- Añadir origen de pregunta (test, examen anterior, clase, alumno)
- Info extra por asignatura e indicador de si permite apuntes o no en el dashboard

### 🔜 Iteración 3 — Resumenes (pendiente)

- Subir PDF resumen por asignatura y/o tema y organización en carpetas por usuario que lo aporta
- Guardar resumenes como predeterminados/favoritos
- Importar zip temas/ examenes anteriores / otros recursos por asignatura (externo para evitar problemas legales por distribución de temario online)

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
# Recursos estáticos — PDFs y datos extra por asignatura

Los PDFs de los temas y la información extra de cada asignatura se guardan como **archivos estáticos en el repositorio**, dentro de la carpeta `resources/`. Esto permite:

- Versionar los PDFs y el `extra_info.json` en Git
- Subirlos a GitHub y distribuirlos a todos los compañeros
- Servirlos directamente como assets estáticos (Vite, GitHub Pages, Netlify…)

---

## Estructura de carpetas

```
resources/
└── [slug-asignatura]/          ← slug generado automáticamente del nombre
    ├── extra_info.json         ← metadatos de la asignatura
    └── Temas/
        ├── index.json          ← lista de PDFs disponibles
        ├── Tema1.pdf
        ├── Tema2.pdf
        └── ...
```

El **slug** se genera igual que en el código:
- Normalizar UTF-8 (quitar acentos)
- Minúsculas
- Reemplazar espacios y caracteres especiales por `-`

Ejemplos:
| Nombre asignatura                     | Slug                                  |
|---------------------------------------|---------------------------------------|
| IA Razonamiento y Planificación       | `ia-razonamiento-y-planificacion`     |
| Bases de Datos II                     | `bases-de-datos-ii`                   |
| Computación Cuántica                  | `computacion-cuantica`                |

---

## extra_info.json

```json
{
  "allowsNotes": false,
  "professor": "Juan García",
  "credits": 6,
  "description": "Descripción opcional de la asignatura.",
  "pdfs": ["Tema1.pdf", "Tema2.pdf"]
}
```

| Campo         | Tipo      | Descripción                                              |
|---------------|-----------|----------------------------------------------------------|
| `allowsNotes` | `boolean` | Si permite llevar apuntes/chuleta al examen. Se muestra como indicador en el Dashboard. |
| `professor`   | `string`  | Nombre del profesor (opcional).                          |
| `credits`     | `number`  | Créditos ECTS (opcional).                                |
| `description` | `string`  | Descripción libre (opcional).                            |
| `pdfs`        | `string[]`| Fallback: lista de PDFs si no existe `Temas/index.json`. |

---

## Temas/index.json

Simple array con los nombres de los archivos PDF disponibles:

```json
["Tema1.pdf", "Tema2.pdf", "Tema3.pdf"]
```

El orden en el array determina el orden en el selector del visor.

---

## Flujo para añadir PDFs

1. Determina el slug de tu asignatura (convierte el nombre a lowercase sin acentos, espacios → `-`)
2. Crea la carpeta `resources/[slug]/Temas/`
3. Copia los PDFs de los temas ahí
4. Crea/actualiza `resources/[slug]/Temas/index.json` con los nombres
5. Crea/actualiza `resources/[slug]/extra_info.json` con los metadatos
6. Haz commit y push al repo → todos los compañeros tendrán los PDFs al hacer pull

---

## Visor PDF en la app

- La pestaña **PDFs** dentro de cada asignatura carga automáticamente los PDFs listados en `index.json`
- Soporta zoom, navegación por páginas y selector de PDF
- Las preguntas con ancla PDF muestran un botón **"📄 Abrir PDF en página X"** que lleva directamente a esa página
- El indicador **📝 Apuntes** / **🚫 Sin apuntes** aparece en las tarjetas del Dashboard según `allowsNotes`

## Licencia

MIT — úsalo libremente para estudiar.
