# Guía para crear Contribution Packs

## ¿Qué es un Contribution Pack?

Un **contribution pack** es un archivo JSON que contiene preguntas creadas por un contribuidor para compartir con el banco global de preguntas. Este formato permite que varios compañeros aporten preguntas sin compartir la misma base de datos.

## Estructura completa del Contribution Pack

```json
{
  "version": 1,
  "kind": "contribution",
  "packId": "uuid-único-del-pack",
  "createdBy": "Nombre del Contribuidor",
  "exportedAt": "2026-02-18T12:00:00.000Z",
  "targets": [
    {
      "subjectKey": "slug-de-la-asignatura",
      "subjectName": "Nombre Completo de la Asignatura",
      "topics": [
        {
          "topicKey": "slug-del-tema",
          "topicTitle": "Título Completo del Tema"
        }
      ]
    }
  ],
  "questions": [
    {
      "id": "uuid-de-la-pregunta",
      "subjectKey": "slug-de-la-asignatura",
      "topicKey": "slug-del-tema",
      "type": "TEST",
      "prompt": "Texto de la pregunta",
      "origin": "test",
      "difficulty": 3,
      "options": [
        { "id": "opt1", "text": "Opción A" },
        { "id": "opt2", "text": "Opción B" },
        { "id": "opt3", "text": "Opción C" },
        { "id": "opt4", "text": "Opción D" }
      ],
      "correctOptionIds": ["opt1"],
      "explanation": "Explicación de la respuesta correcta (opcional)",
      "tags": ["etiqueta1", "etiqueta2"],
      "createdBy": "Nombre del Contribuidor",
      "contentHash": "sha256:hash-del-contenido"
    }
  ]
}
```

## Campos obligatorios y opcionales

### Campos del pack

| Campo | Tipo | Obligatorio | Descripción |
|-------|------|-------------|-------------|
| `version` | number | ✅ | Siempre `1` |
| `kind` | string | ✅ | Siempre `"contribution"` |
| `packId` | string | ✅ | UUID único del pack |
| `createdBy` | string | ✅ | Nombre/alias del contribuidor |
| `exportedAt` | string | ✅ | Fecha ISO de exportación |
| `targets` | array | ✅ | Asignaturas y temas incluidos |
| `questions` | array | ✅ | Preguntas del pack |

### Campos de cada pregunta

| Campo | Tipo | Obligatorio | Descripción | Valores posibles |
|-------|------|-------------|-------------|------------------|
| `id` | string | ✅ | UUID único | UUID v4 |
| `subjectKey` | string | ✅ | Slug de la asignatura | `"tecnicas-de-aprendizaje-automatico"` |
| `topicKey` | string | ✅ | Slug del tema | `"tema-1-introduccion"` |
| `type` | string | ✅ | Tipo de pregunta | `"TEST"`, `"DESARROLLO"`, `"COMPLETAR"`, `"PRACTICO"` |
| `prompt` | string | ✅ | Enunciado de la pregunta | Texto libre |
| `origin` | string | ⭕ | **Origen de la pregunta** | `"test"`, `"examen_anterior"`, `"clase"`, `"alumno"` |
| `difficulty` | number | ⭕ | Dificultad (1-5) | `1`, `2`, `3`, `4`, `5` |
| `explanation` | string | ⭕ | Explicación de la respuesta | Texto libre |
| `tags` | array | ⭕ | Etiquetas | `["tema1", "importante"]` |
| `createdBy` | string | ⭕ | Autor de la pregunta | Nombre/alias |
| `contentHash` | string | ⭕ | Hash para deduplicación | `"sha256:..."` |
| `topicIds` | array | ⭕ | **Temas adicionales** (multi-tema) | `["tema-1-intro", "tema-3-avanzado"]` |

### ⚠️ PREGUNTAS MULTI-TEMA - MUY IMPORTANTE

Una pregunta puede abarcar **VARIOS temas a la vez**. Esto es especialmente común en:
- Preguntas de tipo **DESARROLLO** que integran conocimientos de múltiples temas
- Preguntas **PRACTICO** que requieren aplicar conceptos de diferentes unidades
- Preguntas que relacionan temas (ej: "Compara el algoritmo A (tema 2) con el algoritmo B (tema 5)")

#### Cómo especificar múltiples temas:

**Campo `topicKey`** (obligatorio): El tema PRINCIPAL de la pregunta
**Campo `topicIds`** (opcional): Array con TODOS los temas (incluido el principal)

```json
{
  "topicKey": "tema-2-busqueda-informada",  // Tema principal
  "topicIds": [                              // Todos los temas (opcional)
    "tema-2-busqueda-informada",             // Incluir el principal
    "tema-4-busqueda-no-informada",          // Tema adicional 1
    "tema-6-planificacion"                   // Tema adicional 2
  ]
}
```

**Reglas:**
- Si una pregunta solo tiene 1 tema: usa solo `topicKey`, NO uses `topicIds`
- Si una pregunta tiene 2+ temas: usa `topicKey` para el principal Y `topicIds` con todos
- El tema de `topicKey` DEBE estar incluido en `topicIds` si este campo existe

### Campos específicos por tipo de pregunta

#### Para preguntas tipo TEST:
| Campo | Tipo | Obligatorio | Descripción |
|-------|------|-------------|-------------|
| `options` | array | ✅ | Opciones de respuesta | Array de objetos `{id, text}` |
| `correctOptionIds` | array | ✅ | IDs de opciones correctas | Array de strings |

#### Para preguntas tipo DESARROLLO o PRACTICO:
| Campo | Tipo | Obligatorio | Descripción |
|-------|------|-------------|-------------|
| `modelAnswer` | string | ⭕ | Respuesta modelo | Texto libre |
| `keywords` | array | ⭕ | Palabras clave | Array de strings |
| `numericAnswer` | string | ⭕ | Respuesta numérica (solo PRACTICO) | `"3.14"` |

#### Para preguntas tipo COMPLETAR:
| Campo | Tipo | Obligatorio | Descripción |
|-------|------|-------------|-------------|
| `clozeText` | string | ✅ | Texto con huecos `{{respuesta}}` | `"El algoritmo {{A*}} es..."` |
| `blanks` | array | ✅ | Definición de huecos | Array de objetos `{id, accepted}` |

## ⚠️ CAMPO ORIGIN - MUY IMPORTANTE

El campo `origin` especifica **de dónde fue extraída la pregunta**. Es OPCIONAL pero muy recomendado para mantener trazabilidad.

### Valores válidos para `origin`:

| Valor | Descripción | Ejemplo de uso |
|-------|-------------|----------------|
| `"test"` | Pregunta de un test de práctica | Preguntas de tests de autoevaluación |
| `"examen_anterior"` | Pregunta de un examen oficial previo | Preguntas de convocatorias anteriores |
| `"clase"` | Pregunta planteada en clase | Preguntas del profesor durante las clases |
| `"alumno"` | Pregunta creada por un alumno | Preguntas inventadas por estudiantes |

### Ejemplo con origin:

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "subjectKey": "tecnicas-de-aprendizaje-automatico",
  "topicKey": "tema-3-regresion-lineal",
  "type": "TEST",
  "prompt": "¿Cuál es el objetivo de la regresión lineal?",
  "origin": "examen_anterior",
  "difficulty": 2,
  "options": [
    { "id": "a", "text": "Clasificar datos en categorías" },
    { "id": "b", "text": "Predecir valores continuos" },
    { "id": "c", "text": "Agrupar datos similares" },
    { "id": "d", "text": "Reducir dimensionalidad" }
  ],
  "correctOptionIds": ["b"],
  "explanation": "La regresión lineal se usa para predecir valores continuos, no para clasificación.",
  "createdBy": "Ana"
}
```

## Ejemplos completos por tipo de pregunta

### Pregunta TEST

```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "subjectKey": "vision-artificial",
  "topicKey": "tema-2-filtros",
  "type": "TEST",
  "prompt": "¿Qué filtro se utiliza para detectar bordes?",
  "origin": "clase",
  "difficulty": 2,
  "options": [
    { "id": "a", "text": "Filtro Gaussiano" },
    { "id": "b", "text": "Filtro de Sobel" },
    { "id": "c", "text": "Filtro de Media" },
    { "id": "d", "text": "Filtro Bilateral" }
  ],
  "correctOptionIds": ["b"],
  "explanation": "El filtro de Sobel es específico para detección de bordes",
  "tags": ["filtros", "bordes"],
  "createdBy": "Carlos"
}
```

### Pregunta DESARROLLO

```json
{
  "id": "223e4567-e89b-12d3-a456-426614174001",
  "subjectKey": "ia-razonamiento-y-planificacion",
  "topicKey": "tema-4-busqueda-informada",
  "type": "DESARROLLO",
  "prompt": "Explica el funcionamiento del algoritmo A* y sus ventajas",
  "origin": "alumno",
  "difficulty": 4,
  "modelAnswer": "A* combina búsqueda de costo uniforme con búsqueda heurística...",
  "keywords": ["heurística", "admisible", "costo", "óptimo"],
  "tags": ["busqueda", "algoritmos"],
  "createdBy": "María"
}
```

### Pregunta COMPLETAR

```json
{
  "id": "323e4567-e89b-12d3-a456-426614174002",
  "subjectKey": "procesamiento-del-lenguaje-natural",
  "topicKey": "tema-1-tokenizacion",
  "type": "COMPLETAR",
  "prompt": "Complete la siguiente frase:",
  "origin": "test",
  "difficulty": 1,
  "clozeText": "El proceso de dividir texto en palabras se llama {{tokenización}} y es el primer paso del {{preprocesamiento}}",
  "blanks": [
    {
      "id": "b1",
      "accepted": ["tokenización", "tokenizacion", "segmentación"]
    },
    {
      "id": "b2",
      "accepted": ["preprocesamiento", "pre-procesamiento"]
    }
  ],
  "tags": ["tokenizacion", "basico"],
  "createdBy": "Luis"
}
```

### Pregunta PRACTICO

```json
{
  "id": "423e4567-e89b-12d3-a456-426614174003",
  "subjectKey": "tecnicas-de-aprendizaje-automatico",
  "topicKey": "tema-5-metricas",
  "type": "PRACTICO",
  "prompt": "Dado VP=80, VN=70, FP=10, FN=20, calcula la precisión",
  "origin": "examen_anterior",
  "difficulty": 3,
  "modelAnswer": "Precisión = VP / (VP + FP) = 80 / (80 + 10) = 0.889",
  "numericAnswer": "0.889",
  "keywords": ["precision", "metricas", "confusion"],
  "tags": ["metricas", "calculo"],
  "createdBy": "Pedro"
}
```

### Pregunta DESARROLLO Multi-Tema

```json
{
  "id": "523e4567-e89b-12d3-a456-426614174004",
  "subjectKey": "razonamiento-y-planificacion-automatica",
  "topicKey": "tema-5-busqueda-informada",
  "topicIds": [
    "tema-4-busqueda-no-informada",
    "tema-5-busqueda-informada"
  ],
  "type": "DESARROLLO",
  "prompt": "Compara las ventajas y desventajas de la búsqueda en anchura (BFS) frente al algoritmo A*. ¿En qué situaciones preferirías usar cada uno?",
  "origin": "clase",
  "difficulty": 4,
  "modelAnswer": "BFS garantiza la solución óptima en grafos no ponderados pero tiene alto consumo de memoria. A* es más eficiente si existe una buena heurística admisible, pero requiere conocimiento del dominio...",
  "keywords": ["BFS", "A*", "heurística", "optimalidad", "complejidad espacial"],
  "tags": ["busqueda", "comparacion", "algoritmos"],
  "createdBy": "Laura"
}
```

**Nota:** Esta pregunta abarca 2 temas (búsqueda no informada y búsqueda informada), por lo que usa `topicIds`.

## Proceso recomendado para crear contribution packs

### Con ChatGPT:

1. **Exporta el banco actual** (formato compacto) para evitar duplicados
2. **Consulta el Anexo de Temarios** al final de esta guía para verificar los slugs correctos
3. **Usa este prompt con ChatGPT**:

```
Voy a crear un contribution pack de preguntas para mi banco de estudio.

LEE PRIMERO esta guía completa sobre el formato (disponible en GUIA_CONTRIBUTION_PACKS.md)

REQUISITOS OBLIGATORIOS:

1. Campo "origin" (OBLIGATORIO en cada pregunta):
   - "test": pregunta de un test de práctica
   - "examen_anterior": pregunta de un examen oficial anterior
   - "clase": pregunta planteada durante la clase
   - "alumno": pregunta creada por un alumno
   
   Si estás creando preguntas desde cero, usa: origin: "alumno"

2. Preguntas multi-tema (cuando una pregunta abarca varios temas):
   - USA "topicKey" para el tema PRINCIPAL
   - AÑADE "topicIds" con TODOS los temas (incluido el principal)
   
   Ejemplo: pregunta que compare A* (tema 5) con BFS (tema 4):
   {
     "topicKey": "tema-5-busqueda-informada",
     "topicIds": [
       "tema-4-busqueda-no-informada",
       "tema-5-busqueda-informada"
     ]
   }

3. Verifica los slugs correctos:
   - Asignatura: "tecnicas-de-aprendizaje-automatico"
   - Temas: consulta el Anexo en GUIA_CONTRIBUTION_PACKS.md

Banco actual (para evitar duplicados):
[PEGA AQUÍ EL JSON DEL BANCO COMPACTO EXPORTADO]

TAREA:
Por favor, crea 20 preguntas tipo TEST para el tema "Tema 8- Aprendizaje supervisado. Clasificación con Naïve Bayes" 
de la asignatura "Técnicas de Aprendizaje Automático".

VERIFICACIÓN FINAL (antes de responder):
✓ Todas las preguntas tienen el campo "origin"
✓ Los slugs de "topicKey" coinciden con los del Anexo
✓ Si una pregunta relaciona varios temas, tiene "topicIds"
✓ No hay duplicados con el banco actual (compara los prompts)
✓ El JSON es válido
✓ Cada pregunta tiene difficulty apropiada (1-5)
✓ Incluye explanation cuando sea útil
```
1. Incluir el campo "origin" en cada pregunta
2. No repetir preguntas del banco actual
3. Usar difficulty apropiada para cada pregunta
4. Incluir explanation cuando sea útil
```

3. **Revisa el JSON generado** para asegurarte de que:
   - Todas las preguntas tienen `origin`
   - Los slugs (`subjectKey`, `topicKey`) son correctos
   - El formato es válido

4. **Importa el pack** en la app para validar que no hay errores

## Validación y errores comunes

### ❌ Error: Falta el campo origin
```json
{
  "type": "TEST",
  "prompt": "¿Qué es un perceptrón?",
  // ❌ Falta "origin"
  "options": [...]
}
```

### ✅ Correcto:
```json
{
  "type": "TEST",
  "prompt": "¿Qué es un perceptrón?",
  "origin": "clase",  // ✅ Campo origin incluido
  "options": [...]
}
```

### Otros errores comunes:

1. **Slugs incorrectos**: Los `subjectKey` y `topicKey` deben coincidir con los del banco
2. **UUIDs duplicados**: Cada pregunta debe tener un UUID único
3. **Tipo de pregunta incorrecto**: Solo `"TEST"`, `"DESARROLLO"`, `"COMPLETAR"` o `"PRACTICO"`
4. **Opciones sin ID**: En TEST, cada opción debe tener un `id` único
5. **CorrectOptionIds vacío**: En TEST, debe haber al menos una opción correcta

## Flujo completo de contribución

1. **Contribuidor crea preguntas**
   - Define su alias en Ajustes
   - Crea preguntas en la app (o con ChatGPT)
   - Exporta contribution pack

2. **Mantenedor importa el pack**
   - Recibe el JSON del contribuidor
   - Importa en Ajustes > Importar contribuciones
   - La app automáticamente:
     - Deduplica por hash de contenido
     - Crea asignaturas/temas si no existen
     - Mantiene trazabilidad (`createdBy`, `sourcePackId`)

3. **Mantenedor exporta banco global actualizado**
   - Exporta el banco completo
   - Comparte con todos los compañeros

## Herramientas útiles

- **UUID Generator**: https://www.uuidgenerator.net/
- **JSON Validator**: https://jsonlint.com/
- **Slugify Tool**: Convierte "Técnicas de IA" → "tecnicas-de-ia"

## Soporte

Si tienes dudas o encuentras errores:
1. Revisa esta guía
2. Valida el JSON en jsonlint.com
3. Importa el pack en modo test para ver mensajes de error
4. Consulta el código en `src/data/contributionImport.ts`

---

## Anexo: Índices de Temario de las 5 Asignaturas

A continuación se listan los **temarios completos** de las 5 asignaturas del proyecto. Usa estos índices para:
- Conocer todos los temas disponibles
- Generar los slugs correctos para `topicKey`
- Identificar temas relacionados para preguntas multi-tema

### 1. Procesamiento del Lenguaje Natural

**Slug**: `procesamiento-del-lenguaje-natural`

| # | Título del Tema | Slug |
|---|-----------------|------|
| 1 | Tema 1- Introducción al procesamiento del lenguaje natural | `tema-1-introduccion-al-procesamiento-del-lenguaje-natural` |
| 2 | Tema 2- El texto como dato | `tema-2-el-texto-como-dato` |
| 3 | Tema 3- Etiquetado morfosintáctico (POS tagging) | `tema-3-etiquetado-morfosintactico-pos-tagging` |
| 4 | Tema 4- Análisis sintáctico | `tema-4-analisis-sintactico` |
| 5 | Tema 5- Análisis semántico | `tema-5-analisis-semantico` |
| 6 | Tema 6- Semántica léxica | `tema-6-semantica-lexica` |
| 7 | Tema 7- Modelado estadístico del lenguaje | `tema-7-modelado-estadistico-del-lenguaje` |
| 8 | Tema 8- Modelado neuronal del lenguaje | `tema-8-modelado-neuronal-del-lenguaje` |
| 9 | Tema 9- Aplicaciones del procesamiento del lenguaje natural | `tema-9-aplicaciones-del-procesamiento-del-lenguaje-natural` |
| 10 | Tema 10- Agentes conversacionales | `tema-10-agentes-conversacionales` |

---

### 2. Visión Artificial

**Slug**: `vision-artificial`

| # | Título del Tema | Slug |
|---|-----------------|------|
| 1 | Tema 1- Introducción a los sistemas de percepción | `tema-1-introduccion-a-los-sistemas-de-percepcion` |
| 2 | Tema 2- Elementos de un sistema de percepción | `tema-2-elementos-de-un-sistema-de-percepcion` |
| 3 | Tema 3- Captura y digitalización de señales | `tema-3-captura-y-digitalizacion-de-senales` |
| 4 | Tema 4- Fuentes y tipos de ruido | `tema-4-fuentes-y-tipos-de-ruido` |
| 5 | Tema 5- Detección y cancelación de anomalías | `tema-5-deteccion-y-cancelacion-de-anomalias` |
| 6 | Tema 6- Procesamiento de imagen. Operaciones elementales | `tema-6-procesamiento-de-imagen-operaciones-elementales` |
| 7 | Tema 7- Procesamiento de imagen. Operaciones espaciales | `tema-7-procesamiento-de-imagen-operaciones-espaciales` |
| 8 | Tema 8- Procesamiento de señales. Filtrado y análisis en frecuencia | `tema-8-procesamiento-de-senales-filtrado-y-analisis-en-frecuencia` |
| 9 | Tema 9- Procesamiento e imagen. Morfología matemática | `tema-9-procesamiento-e-imagen-morfologia-matematica` |
| 10 | Tema 10- Procesamiento de imagen. Crecimiento de regiones | `tema-10-procesamiento-de-imagen-crecimiento-de-regiones` |
| 11 | Tema 11- Extracción de características. Propiedades estadísticas y frecuenciales de la señal | `tema-11-extraccion-de-caracteristicas-propiedades-estadisticas-y-frecuenciales-de-la-senal` |
| 12 | Tema 12- Extracción de características. Caracterización de textura en imágenes | `tema-12-extraccion-de-caracteristicas-caracterizacion-de-textura-en-imagenes` |
| 13 | Tema 13- Extracción de características. Procesamientos multiescala y métodos avanzados | `tema-13-extraccion-de-caracteristicas-procesamientos-multiescala-y-metodos-avanzados` |
| 14 | Tema 14- Decisión. Principios e implementación de algoritmos de ayuda en la toma de decisiones | `tema-14-decision-principios-e-implementacion-de-algoritmos-de-ayuda-en-la-toma-de-decisiones` |
| 15 | Tema 15- Aplicaciones actuales del tratamiento de la señal | `tema-15-aplicaciones-actuales-del-tratamiento-de-la-senal` |

---

### 3. Investigación y Gestión de Proyectos en Inteligencia Artificial

**Slug**: `investigacion-y-gestion-de-proyectos-en-inteligencia-artificial`

| # | Título del Tema | Slug |
|---|-----------------|------|
| 1 | Tema 1- Origen y evolución de la inteligencia artificial | `tema-1-origen-y-evolucion-de-la-inteligencia-artificial` |
| 2 | Tema 2- Ciencia y método científico | `tema-2-ciencia-y-metodo-cientifico` |
| 3 | Tema 3- Financiación de proyectos | `tema-3-financiacion-de-proyectos` |
| 4 | Tema 4- Publicación de resultados y redacción científica | `tema-4-publicacion-de-resultados-y-redaccion-cientifica` |
| 5 | Tema 5- Gestión de proyectos de inteligencia artificial. Enfoque metodológico | `tema-5-gestion-de-proyectos-de-inteligencia-artificial-enfoque-metodologico` |
| 6 | Tema 6- Gestión de proyectos IA estructura de un proyecto IA y su despliegue | `tema-6-gestion-de-proyectos-ia-estructura-de-un-proyecto-ia-y-su-despliegue` |
| 7 | Tema 7-Gestión de proyectos IA. Recursos materiales y recursos humanos | `tema-7-gestion-de-proyectos-ia-recursos-materiales-y-recursos-humanos` |
| 8 | Tema 8- Investigación en agentes inteligentes y sistemas expertos | `tema-8-investigacion-en-agentes-inteligentes-y-sistemas-expertos` |
| 9 | Tema 9- Investigación en aprendizaje automático | `tema-9-investigacion-en-aprendizaje-automatico` |
| 10 | Tema 10- Investigación en sistemas cognitivos | `tema-10-investigacion-en-sistemas-cognitivos` |
| 11 | Tema 11- Investigación en computación bioinspirada | `tema-11-investigacion-en-computacion-bioinspirada` |
| 12 | Tema 12- Implicaciones filosóficas éticas y legales en la aplicación de la inteligencia artificial | `tema-12-implicaciones-filosoficas-eticas-y-legales-en-la-aplicacion-de-la-inteligencia-artificial` |

---

### 4. Razonamiento y Planificación Automática

**Slug**: `razonamiento-y-planificacion-automatica`

| # | Título del Tema | Slug |
|---|-----------------|------|
| 1 | Tema 1- Introducción a la toma de decisiones | `tema-1-introduccion-a-la-toma-de-decisiones` |
| 2 | Tema 2- Representación del conocimiento y razonamiento | `tema-2-representacion-del-conocimiento-y-razonamiento` |
| 3 | Tema 3- Lógica y pensamiento humano | `tema-3-logica-y-pensamiento-humano` |
| 4 | Tema 4- Búsqueda no informada | `tema-4-busqueda-no-informada` |
| 5 | Tema 5- Búsqueda informada | `tema-5-busqueda-informada` |
| 6 | Tema 6- Búsqueda entre adversarios | `tema-6-busqueda-entre-adversarios` |
| 7 | Tema 7- Problemas de planificación | `tema-7-problemas-de-planificacion` |
| 8 | Tema 8- Sistemas basados en STRIP | `tema-8-sistemas-basados-en-strip` |
| 9 | Tema 9- Redes de tareas jerárquicas (HTN) | `tema-9-redes-de-tareas-jerarquicas-htn` |
| 10 | Tema 10- Planificación multi agente | `tema-10-planificacion-multi-agente` |
| 11 | Tema 11- Planificación por múltiples agentes | `tema-11-planificacion-por-multiples-agentes` |
| 12 | Tema 12- Reparación reactiva multi agente | `tema-12-reparacion-reactiva-multi-agente` |

---

### 5. Técnicas de Aprendizaje Automático

**Slug**: `tecnicas-de-aprendizaje-automatico`

| # | Título del Tema | Slug |
|---|-----------------|------|
| 1 | Tema 1- Introducción al aprendizaje automático | `tema-1-introduccion-al-aprendizaje-automatico` |
| 2 | Tema 2- Análisis de datos descriptivo y exploratorio | `tema-2-analisis-de-datos-descriptivo-y-exploratorio` |
| 3 | Tema 3- Datos ausentes y normalización | `tema-3-datos-ausentes-y-normalizacion` |
| 4 | Tema 4- Regresión y evaluación de algoritmos de regresión | `tema-4-regresion-y-evaluacion-de-algoritmos-de-regresion` |
| 5 | Tema 5- Evaluación de algoritmos de clasificación | `tema-5-evaluacion-de-algoritmos-de-clasificacion` |
| 6 | Tema 6- Aprendizaje supervisado. Regresión y clasificación con árboles de decisión | `tema-6-aprendizaje-supervisado-regresion-y-clasificacion-con-arboles-de-decision` |
| 7 | Tema 7- Máquinas de vectores de soporte | `tema-7-maquinas-de-vectores-de-soporte` |
| 8 | Tema 8- Aprendizaje supervisado. Clasificación con Naïve Bayes | `tema-8-aprendizaje-supervisado-clasificacion-con-naive-bayes` |
| 9 | Tema 9- Combinacion de clasificadores. Bootstrapping Bagging y Boosting | `tema-9-combinacion-de-clasificadores-bootstrapping-bagging-y-boosting` |
| 10 | Tema 10- Aprendizaje supervisado. Regresión y clasificación con Random Forest | `tema-10-aprendizaje-supervisado-regresion-y-clasificacion-con-random-forest` |
| 11 | Tema 11- Parametrización automática y optimización de algoritmos | `tema-11-parametrizacion-automatica-y-optimizacion-de-algoritmos` |

---

## Cómo generar slugs correctos

Para generar el slug de un tema:
1. Toma el título completo del tema
2. Convierte a minúsculas
3. Elimina acentos (á→a, é→e, í→i, ó→o, ú→u, ñ→n)
4. Reemplaza espacios y caracteres especiales por `-`
5. Elimina caracteres que no sean letras, números o guiones

**Ejemplos:**
- "Tema 3- Etiquetado morfosintáctico (POS tagging)" → `"tema-3-etiquetado-morfosintactico-pos-tagging"`
- "Tema 7-Gestión de proyectos IA. Recursos materiales" → `"tema-7-gestion-de-proyectos-ia-recursos-materiales-y-recursos-humanos"`

**Importante:** Siempre verifica el slug exacto en la tabla correspondiente de arriba para asegurarte de que coincide.
