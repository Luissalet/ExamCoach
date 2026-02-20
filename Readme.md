# ExamCoach 📚

App web **local-first** para crear bancos de preguntas y practicar exámenes. Sin backend, sin servidor, tus datos son tuyos.

## Stack

- **React + TypeScript + Vite** — SPA rápida y fácil de mantener
- **Zustand** — estado global ligero
- **Dexie (IndexedDB)** — persistencia offline, funciona sin conexión
- **Zod** — validación de esquemas en export/import
- **Tailwind CSS** — estilos utilitarios
- **marked + marked-katex-extension + KaTeX** — renderizado de Markdown con soporte completo de LaTeX matemático

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
- Otros recursos (aplicaciones de ayuda como filterlab y webs de consulta)
- Soporte respuesta formato md para preguntas de desarrollo (negrita, viñeta etc)

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

npm i -D @types/node

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

## Soporte de Markdown y LaTeX (KaTeX)

Todos los campos de texto de las preguntas (`prompt`, `modelAnswer`, `explanation`, textos de opciones, etc.) soportan **Markdown** completo con renderizado de **fórmulas matemáticas LaTeX** mediante KaTeX.

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

Se soportan **cuatro notaciones de delimitadores**, todas equivalentes:

| Estilo | Inline (dentro del texto) | Display (bloque centrado) |
|--------|--------------------------|--------------------------|
| Pandoc/KaTeX | `$...$` | `$$...$$` |
| LaTeX estándar | `\(...\)` | `\[...\]` |

Todos los delimitadores se normalizan automáticamente antes del renderizado, por lo que puedes usar el que prefieras o el que genere tu herramienta (ChatGPT suele usar `\(...\)` y `\[...\]`).

**Ejemplos:**

```
El kernel es $h = \begin{bmatrix} -1 & -1 & -1 \\ -1 & 8 & -1 \\ -1 & -1 & -1 \end{bmatrix}$

La función de coste es:
$$J(\theta) = \frac{1}{2m} \sum_{i=1}^{m}(h_\theta(x^{(i)}) - y^{(i)})^2$$

Usando notación LaTeX estándar: \( f(n) = g(n) + h(n) \)
```

> ⚠️ **Para ChatGPT**: al generar preguntas con fórmulas, indica explícitamente que use LaTeX con delimitadores `$...$` y `$$...$$` o `\(...\)` y `\[...\]`. Ambos funcionan correctamente en la app.

---

## Imágenes en preguntas

Las preguntas soportan **imágenes inline** directamente en el Markdown del `prompt`, `modelAnswer` o `explanation`.

### Desde la interfaz de usuario

- **Arrastra y suelta** una imagen sobre cualquier campo de texto con soporte Markdown
- **Pega** una imagen desde el portapapeles (`Ctrl+V` / `Cmd+V`)

La imagen se guarda automáticamente en IndexedDB y se inserta como referencia en el Markdown:

```markdown
![descripción](question-images/550e8400-e29b-41d4-a716-446655440000.png)
```

### En contribution packs

Las imágenes se exportan como **base64** en el campo `questionImages` del pack:

```json
{
  "version": 1,
  "kind": "contribution",
  "packId": "...",
  "questions": [
    {
      "prompt": "Analiza la siguiente imagen:\n\n![figura](question-images/uuid.png)",
      ...
    }
  ],
  "questionImages": {
    "uuid.png": "base64encodeddata..."
  }
}
```

Al importar el pack, las imágenes se restauran automáticamente en IndexedDB del receptor.

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
│   ├── utils/
│   │   └── renderMd.ts        # Renderizado Markdown + KaTeX centralizado
│   └── ui/
│       ├── store/index.ts     # Zustand store
│       ├── components/        # Componentes reutilizables (MdContent, ...)
│       └── pages/             # Dashboard, SubjectView, Practice, Results, Settings
```

---

## Tipos de preguntas

| Tipo | Cómo se responde | Corrección |
|------|-----------------|------------|
| **TEST** | Seleccionar opciones (1 o varias) | Automática |
| **COMPLETAR** | Rellenar huecos `{{respuesta}}` | Automática (normalizada) |
| **DESARROLLO** | Texto libre | Manual (tú marcas ✓/✗) |
| **PRACTICO** | Texto libre + resultado numérico | Manual + comparación numérica |

---

# Recursos estáticos — PDFs y datos extra por asignatura

Los PDFs de los temas y la información extra de cada asignatura se guardan como **archivos estáticos en el repositorio**, dentro de la carpeta `resources/`.

Esto permite:

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
6. Haz commit y push — los PDFs estarán disponibles para todos los compañeros

---

## 📖 Uso

### Para exportar una asignatura:

1. Ve a **Ajustes** en la app
2. Busca la sección "Exportar banco compacto (para ChatGPT)"
3. Selecciona la asignatura
4. Haz click en "⚡ Exportar una asignatura"
5. Se descargará un archivo JSON como `compact-tecnicas-de-aprendizaje-automatico-2026-02-18.json`

### Para exportar todas las asignaturas:

1. En la misma sección
2. Haz click en "📦 Exportar todas"
3. Se descargará un archivo con todas las asignaturas en formato array

---

## 💡 Cómo usar con ChatGPT

### Ejemplo de prompt:

```
Tengo un banco de preguntas para la asignatura "Técnicas de Aprendizaje Automático".
Aquí está el banco actual en formato compacto:

[PEGA AQUÍ EL JSON EXPORTADO]

Por favor, crea 20 preguntas nuevas de tipo TEST para el tema "Redes Neuronales", 
asegurándote de NO repetir ninguna pregunta que ya existe en el banco (compara 
los prompts). Las preguntas deben ser diferentes en contenido y formulación.
```

ChatGPT podrá:
- Ver todas las preguntas existentes
- Identificarlas por el prompt
- Evitar duplicados
- Crear preguntas nuevas y originales

El formato compacto permite incluir **cientos de preguntas** sin alcanzar los límites de tokens de ChatGPT.

---

## 📊 Formato de salida

### Para una asignatura:
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

### Para todas las asignaturas:
```json
[
  {
    "asignatura": "Técnicas de Aprendizaje Automático",
    "slug": "tecnicas-de-aprendizaje-automatico",
    "total": 150,
    "preguntas": [...]
  },
  {
    "asignatura": "Visión Artificial",
    "slug": "vision-artificial",
    "total": 120,
    "preguntas": [...]
  }
]
```

---

## 🔑 Campos

| Campo | Descripción | Ejemplo |
|-------|-------------|---------|
| `t` | Tipo de pregunta | `T` (TEST), `D` (DESARROLLO), `C` (COMPLETAR), `P` (PRACTICO) |
| `p` | Prompt/enunciado de la pregunta | `"¿Qué puede aprender examinando..."` |
| `h` | Hash SHA-256 de contenido | `"sha256:888a1858..."` |
| `tp` | Slug del tema | `"tema-8-aprendizaje-supervisado"` |

---

## ⚡ Ventajas

1. **90% más pequeño** que global-bank.json
2. **Fácil de procesar** por ChatGPT
3. **Permite incluir cientos de preguntas** en un prompt
4. **Deduplicación efectiva** por hash
5. **Identificación clara** por prompt

---

## 📝 Notas

- El hash se usa para deduplicación (dos preguntas con el mismo contenido tendrán el mismo hash)
- El tema ayuda a ChatGPT a entender el contexto
- El tipo ayuda a ChatGPT a generar preguntas del mismo formato
- Solo se incluye información esencial, nada de stats, opciones completas, etc.
