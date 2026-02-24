# ExamCoach

App web **local-first** para crear bancos de preguntas de examen y practicar de forma colaborativa. Sin backend, sin servidor, tus datos son tuyos.

## Stack

- **React 18 + TypeScript + Vite** — SPA rápida y tipada
- **Zustand** — estado global ligero
- **Dexie (IndexedDB)** — persistencia offline, funciona sin conexión
- **Zod** — validación de esquemas en export/import
- **Tailwind CSS** — estilos utilitarios
- **marked + marked-katex-extension + KaTeX** — renderizado Markdown con soporte completo de LaTeX
- **PDF.js** — visor de PDFs integrado
- **JSZip** — manejo de archivos ZIP para importación de recursos

## Capacidades

### Gestión de contenido

- **CRUD completo** de asignaturas, temas y preguntas
- **4 tipos de pregunta**: Test (multi-opción), Desarrollo (texto libre, corrección manual), Completar (cloze con huecos), Práctico (texto libre + validación numérica)
- **Markdown completo** en todos los campos de texto: negrita, cursiva, código, listas, tablas, enlaces
- **Fórmulas LaTeX/KaTeX** inline (`$...$`, `\(...\)`) y en bloque (`$$...$$`, `\[...\]`) con normalización automática de delimitadores
- **Imágenes inline** en preguntas: arrastrar y soltar o pegar desde el portapapeles, almacenadas en IndexedDB
- **Origen de pregunta** configurable: test, examen anterior, clase, alumno
- **Dificultad** en escala 1-5
- **Tags y palabras clave** por pregunta
- **Asociación multi-tema**: una pregunta puede pertenecer a varios temas
- **Anclas PDF**: vincular preguntas a páginas específicas de un PDF

### Sesiones de práctica

- **Aleatorio N**: practicar un número configurable de preguntas al azar
- **Todas las preguntas**: sesión completa
- **Solo falladas**: repasar los errores
- **Por tema**: practicar un tema específico
- **Modo inteligente (Spaced Repetition)**: algoritmo SM-2 que prioriza preguntas pendientes de repaso según rendimiento previo
- **Modo examen**: práctica cronometrada con cuenta atrás
- **Reanudación de sesión**: continuar donde lo dejaste
- **Modo flashcard**: estudio con tarjetas que se voltean
- **Vista de resultados detallada**: puntuación, respuesta correcta vs. tu respuesta, actualización de estadísticas

### Conceptos clave

- Almacenar **fórmulas, definiciones y observaciones** por asignatura
- Organizados por categoría y tema
- Soporte completo de Markdown + KaTeX
- **Sidebar de referencia** disponible durante las sesiones de práctica
- Exportación e importación mediante packs JSON estructurados

### Estadísticas y seguimiento

- **Estadísticas por pregunta**: veces vista, aciertos, fallos
- **Estadísticas por asignatura** con progreso
- **Dashboard global** de estadísticas cruzadas
- **Historial de sesiones** con timestamps
- **Análisis por dificultad**

### Repaso inteligente (SM-2)

- Programación automática basada en rendimiento
- Factor de facilidad, intervalo y repeticiones por pregunta
- Cálculo de "próxima fecha de repaso"
- El modo inteligente prioriza las preguntas vencidas

### Entregas y calificaciones

- Seguimiento de **actividades, tests y exámenes** con fechas de entrega
- Estados: pendiente, en progreso, hecho, entregado
- **Registro de notas** (escala 0-10)
- **Cálculo de evaluación continua** con pesos configurables por asignatura (% continua vs. % examen)
- **Widget de calendario** con fechas de examen y entregas próximas

### Exportación e importación

- **Banco completo**: export/import JSON versionado con UUIDs regenerados al importar
- **Contribution packs**: compartir preguntas con deduplicación automática por hash SHA-256 de contenido
- **Export compacto**: formato JSON mínimo optimizado para usar como contexto en ChatGPT (solo tipo, prompt, hash, tema)
- **Packs de conceptos clave**: exportar/importar fórmulas y definiciones
- **Historial de importaciones**: registro de contribuciones importadas con opción de deshacer
- **Resolución de conflictos**: fusión automática por slugs de asignatura y tema

### Recursos estáticos

- **PDFs por asignatura** almacenados en IndexedDB o servidos desde `resources/`
- **Visor PDF integrado** con navegación por página y zoom
- **Metadatos por asignatura** (`extra_info.json`): profesor, créditos, indicador de si permite apuntes
- **Enlaces externos** por asignatura (webs de consulta, herramientas)
- **Importación de recursos ZIP** con estructura de temas

### Sincronización

- **Banco global**: sincronización automática desde `/data/global-bank.json` al iniciar la app
- **Fusión idempotente** con deduplicación por hash de contenido
- **Intervalo configurable** (mínimo 1 hora)
- Registro de última sincronización

---

## Instalación y uso local

```bash
# Clona el repo
git clone https://github.com/tu-usuario/study-app.git
cd study-app

# Instala dependencias
npm install
npm i -D @types/node

# Arranca en desarrollo
npm run dev
# → http://localhost:5173
```

## Build y despliegue

```bash
# Build de producción en dist/
npm run build

# Preview de la build
npm run preview

# Lint
npm run lint
```

Cualquier hosting estático sirve: GitHub Pages, Netlify, Vercel, Cloudflare Pages, etc.

### GitHub Pages

1. Añade `homepage` a `package.json`:
   ```json
   "homepage": "https://tu-usuario.github.io/study-app"
   ```
2. Instala el helper:
   ```bash
   npm install -D gh-pages
   ```
3. Añade el script de deploy:
   ```json
   "deploy": "gh-pages -d dist"
   ```
4. Build y despliega:
   ```bash
   npm run build && npm run deploy
   ```

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

## Soporte de Markdown y LaTeX (KaTeX)

Todos los campos de texto (`prompt`, `modelAnswer`, `explanation`, textos de opciones, etc.) soportan **Markdown** completo con renderizado de **fórmulas matemáticas LaTeX** mediante KaTeX.

### Markdown soportado

```markdown
**negrita**, *cursiva*, `código inline`

- listas con viñetas
- y sublistas

| col A | col B |
|-------|-------|
| val 1 | val 2 |
```

### Fórmulas matemáticas (LaTeX / KaTeX)

Se soportan cuatro notaciones de delimitadores, todas equivalentes:

| Estilo | Inline (dentro del texto) | Display (bloque centrado) |
|--------|--------------------------|--------------------------|
| Pandoc/KaTeX | `$...$` | `$$...$$` |
| LaTeX estándar | `\(...\)` | `\[...\]` |

Todos los delimitadores se normalizan automáticamente antes del renderizado.

> Para ChatGPT: al generar preguntas con fórmulas, indica que use LaTeX con delimitadores `$...$` y `$$...$$` o `\(...\)` y `\[...\]`. Ambos funcionan correctamente.

---

## Imágenes en preguntas

Las preguntas soportan **imágenes inline** directamente en el Markdown del `prompt`, `modelAnswer` o `explanation`.

### Desde la interfaz de usuario

- **Arrastra y suelta** una imagen sobre cualquier campo de texto con soporte Markdown
- **Pega** una imagen desde el portapapeles (`Ctrl+V` / `Cmd+V`)

La imagen se guarda automáticamente en IndexedDB y se inserta como referencia Markdown:

```markdown
![descripción](question-images/550e8400-e29b-41d4-a716-446655440000.png)
```

### En contribution packs

Las imágenes se exportan como **base64** en el campo `questionImages` del pack y se restauran automáticamente en IndexedDB del receptor al importar.

---

## Exportación compacta (para ChatGPT)

### Exportar

1. Ve a **Ajustes**
2. En la sección "Exportar banco compacto (para ChatGPT)", selecciona la asignatura
3. Haz click en "Exportar una asignatura" o "Exportar todas"

### Formato de salida

```json
{
  "asignatura": "Técnicas de Aprendizaje Automático",
  "slug": "tecnicas-de-aprendizaje-automatico",
  "total": 150,
  "preguntas": [
    {
      "t": "T",
      "p": "¿Qué puede aprender examinando las estadísticas...",
      "h": "sha256:888a1858caba...",
      "tp": "tema-8-aprendizaje-supervisado"
    }
  ]
}
```

| Campo | Descripción | Valores |
|-------|-------------|---------|
| `t` | Tipo de pregunta | `T` (TEST), `D` (DESARROLLO), `C` (COMPLETAR), `P` (PRACTICO) |
| `p` | Prompt/enunciado | Texto de la pregunta |
| `h` | Hash SHA-256 | Para deduplicación |
| `tp` | Slug del tema | Identificador del tema |

### Uso con ChatGPT

```
Tengo un banco de preguntas para la asignatura "Técnicas de Aprendizaje Automático".
Aquí está el banco actual en formato compacto:

[PEGA AQUÍ EL JSON EXPORTADO]

Crea 20 preguntas nuevas de tipo TEST para el tema "Redes Neuronales",
sin repetir ninguna pregunta existente (compara los prompts).
```

El formato compacto es ~90% más pequeño que el banco completo, permitiendo incluir cientos de preguntas en un prompt sin alcanzar los límites de tokens.

---

## Recursos estáticos (PDFs y metadatos)

Los PDFs y la información extra de cada asignatura se guardan como archivos estáticos en `resources/`.

### Estructura de carpetas

```
resources/
└── [slug-asignatura]/
    ├── extra_info.json
    └── Temas/
        ├── index.json
        ├── Tema1.pdf
        └── ...
```

El **slug** se genera normalizando el nombre: sin acentos, minúsculas, espacios reemplazados por `-`.

### extra_info.json

```json
{
  "allowsNotes": false,
  "professor": "Juan García",
  "credits": 6,
  "description": "Descripción opcional de la asignatura.",
  "pdfs": ["Tema1.pdf", "Tema2.pdf"]
}
```

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `allowsNotes` | `boolean` | Si permite llevar apuntes al examen. Se muestra en el Dashboard. |
| `professor` | `string` | Nombre del profesor (opcional). |
| `credits` | `number` | Créditos ECTS (opcional). |
| `description` | `string` | Descripción libre (opcional). |
| `pdfs` | `string[]` | Fallback: lista de PDFs si no existe `Temas/index.json`. |

### Temas/index.json

```json
["Tema1.pdf", "Tema2.pdf", "Tema3.pdf"]
```

El orden en el array determina el orden en el selector del visor.

### Flujo para añadir PDFs

1. Determina el slug de tu asignatura
2. Crea la carpeta `resources/[slug]/Temas/`
3. Copia los PDFs ahí
4. Crea/actualiza `resources/[slug]/Temas/index.json` con los nombres
5. Crea/actualiza `resources/[slug]/extra_info.json` con los metadatos
6. Haz commit y push

---

## Estructura del proyecto

```
study-app/
├── src/
│   ├── domain/
│   │   ├── models.ts              # Interfaces TypeScript (Subject, Topic, Question, etc.)
│   │   ├── normalize.ts           # Normalización de texto y slugs
│   │   ├── scoring.ts             # Corrección TEST y COMPLETAR
│   │   ├── grading.ts             # Lógica de calificaciones
│   │   ├── hashing.ts             # SHA-256 para deduplicación
│   │   └── spacedRepetition.ts    # Algoritmo SM-2
│   ├── data/
│   │   ├── db.ts                  # Schema Dexie (IndexedDB, v5)
│   │   ├── repos.ts               # CRUD por entidad
│   │   ├── exportImport.ts        # Export/import banco JSON
│   │   ├── contributionImport.ts  # Merge de contribution packs
│   │   ├── keyConceptsImport.ts   # Import de conceptos clave
│   │   ├── exportCompact.ts       # Export compacto para ChatGPT
│   │   ├── exportStudyGuide.ts    # Export guía de estudio
│   │   ├── globalBank.ts          # Sincronización banco global
│   │   ├── deliverableRepo.ts     # CRUD de entregas
│   │   ├── pdfStorage.ts          # Almacenamiento de PDFs
│   │   ├── questionImageStorage.ts # Imágenes de preguntas
│   │   ├── resourceLoader.ts      # Carga de metadatos y PDFs
│   │   └── resourceImporter.ts    # Importación de recursos ZIP
│   ├── utils/
│   │   ├── renderMd.ts            # Renderizado Markdown + KaTeX centralizado
│   │   └── questionUtils.ts       # Utilidades de preguntas
│   └── ui/
│       ├── store/index.ts         # Zustand store
│       ├── components/            # MdContent, QuestionForm, PdfViewer, CalendarWidget, etc.
│       └── pages/                 # Dashboard, SubjectView, PracticeSession, Results, Settings,
│                                  # Flashcard, Deliverables, Stats, GlobalStats, SessionHistory
```

---

## Tipos de preguntas

| Tipo | Cómo se responde | Corrección |
|------|-----------------|------------|
| **TEST** | Seleccionar opciones (1 o varias) | Automática |
| **COMPLETAR** | Rellenar huecos `{{respuesta}}` | Automática (normalizada) |
| **DESARROLLO** | Texto libre | Manual (tú marcas si es correcta o no) |
| **PRACTICO** | Texto libre + resultado numérico | Manual + comparación numérica |

---

## Base de datos (Dexie/IndexedDB)

Versión actual: **v5**

| Tabla | Propósito |
|-------|-----------|
| `subjects` | Asignaturas del usuario |
| `topics` | Temas por asignatura |
| `questions` | Banco de preguntas |
| `sessions` | Registros de sesiones de práctica |
| `pdfResources` | PDFs almacenados |
| `pdfAnchors` | Referencias de preguntas a páginas PDF |
| `settings` | Configuración de la app |
| `questionImages` | Imágenes inline de preguntas |
| `deliverables` | Entregas, tests y exámenes |
| `gradingConfigs` | Pesos de calificación por asignatura |
| `keyConcepts` | Fórmulas, definiciones, observaciones |

---

## Licencia

Copyright (c) 2026 Luis Mascort. Todos los derechos reservados.

Este software es de uso exclusivamente personal y educativo. **Queda expresamente prohibido:**

- Vender, sublicenciar o comercializar esta aplicación, en su totalidad o en parte
- Distribuir, vender o comercializar obras derivadas basadas en este software
- Utilizar este software o sus derivados con fines comerciales de cualquier tipo

Se permite el uso personal, la modificación para uso propio y la contribución al proyecto original bajo las mismas condiciones de esta licencia. Cualquier redistribución debe mantener este aviso de copyright y las mismas restricciones.

Para cualquier uso fuera de los términos aquí descritos, se requiere autorización expresa por escrito del autor.
