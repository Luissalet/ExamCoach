# Guía para Generar Contribution Packs

## Introducción

Un **contribution pack** es un archivo JSON que contiene preguntas organizadas por asignatura y temas. Se usa para compartir preguntas entre compañeros de clase sin compartir la misma base de datos.

## ⚡ IMPORTANTE: Uso de Markdown

**TODOS LOS CAMPOS DE TEXTO SOPORTAN Y DEBEN USAR MARKDOWN** cuando sea apropiado:

- ✅ `prompt` - Enunciado de la pregunta
- ✅ `modelAnswer` - Respuesta modelo
- ✅ `explanation` - Explicación de la respuesta
- ✅ `options[].text` - Texto de cada opción
- ✅ `clozeText` - Texto con huecos

**Usa Markdown para:**
- Formato de texto: **negrita**, *cursiva*, `código`
- Listas numeradas y con viñetas
- Encabezados (##, ###)
- Bloques de código (```código```)
- Fórmulas matemáticas
- Tablas
- Enlaces y citas

**NO uses texto plano cuando Markdown haría la pregunta más clara y legible.**

## Estructura General del Contribution Pack

```json
{
  "version": 1,
  "kind": "contribution",
  "packId": "uuid-generado-automaticamente",
  "createdBy": "TuNombre",
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
    // Array de preguntas (ver ejemplos abajo)
  ]
}
```

### Notas Importantes sobre Slugs

Los **slugs** son identificadores únicos generados automáticamente:
- Se convierten a minúsculas
- Se eliminan acentos y caracteres especiales
- Los espacios se reemplazan por guiones `-`

**Ejemplos de conversión a slug:**
- "IA Razonamiento y Planificación" → `ia-razonamiento-y-planificacion`
- "Tema 1- Introducción" → `tema-1-introduccion`
- "Procesamiento del Lenguaje Natural" → `procesamiento-del-lenguaje-natural`

---

## Índices de Temas por Asignatura

A continuación se muestran los índices de temas de varias asignaturas del máster. Usa estos como referencia para crear tus contribution packs.

### Razonamiento y Planificación Automática

**subjectKey:** `razonamiento-y-planificacion-automatica`  
**subjectName:** `Razonamiento y Planificación Automática`

**Temas:**
1. **Tema 1- Introducción a la toma de decisiones** → `tema-1-introduccion-a-la-toma-de-decisiones`
2. **Tema 2- Representación del conocimiento y razonamiento** → `tema-2-representacion-del-conocimiento-y-razonamiento`
3. **Tema 3- Lógica y pensamiento humano** → `tema-3-logica-y-pensamiento-humano`
4. **Tema 4- Búsqueda no informada** → `tema-4-busqueda-no-informada`
5. **Tema 5- Búsqueda informada** → `tema-5-busqueda-informada`
6. **Tema 6- Búsqueda entre adversarios** → `tema-6-busqueda-entre-adversarios`
7. **Tema 7- Problemas de planificación** → `tema-7-problemas-de-planificacion`
8. **Tema 8- Sistemas basados en STRIP** → `tema-8-sistemas-basados-en-strip`
9. **Tema 9- Redes de tareas jerárquicas (HTN)** → `tema-9-redes-de-tareas-jerarquicas-htn`
10. **Tema 10- Planificación multi agente** → `tema-10-planificacion-multi-agente`
11. **Tema 11- Planificación por múltiples agentes** → `tema-11-planificacion-por-multiples-agentes`
12. **Tema 12- Reparación reactiva multi agente** → `tema-12-reparacion-reactiva-multi-agente`

### Procesamiento del Lenguaje Natural

**subjectKey:** `procesamiento-del-lenguaje-natural`  
**subjectName:** `Procesamiento del Lenguaje Natural`

**Temas:**
1. **Tema 1- Introducción al procesamiento del lenguaje natural** → `tema-1-introduccion-al-procesamiento-del-lenguaje-natural`
2. **Tema 2- El texto como dato** → `tema-2-el-texto-como-dato`
3. **Tema 3- Etiquetado morfosintáctico (POS tagging)** → `tema-3-etiquetado-morfosintactico-pos-tagging`
4. **Tema 4- Análisis sintáctico** → `tema-4-analisis-sintactico`
5. **Tema 5- Análisis semántico** → `tema-5-analisis-semantico`
6. **Tema 6- Semántica léxica** → `tema-6-semantica-lexica`
7. **Tema 7- Modelado estadístico del lenguaje** → `tema-7-modelado-estadistico-del-lenguaje`
8. **Tema 8- Modelado neuronal del lenguaje** → `tema-8-modelado-neuronal-del-lenguaje`
9. **Tema 9- Aplicaciones del procesamiento del lenguaje natural** → `tema-9-aplicaciones-del-procesamiento-del-lenguaje-natural`
10. **Tema 10- Agentes conversacionales** → `tema-10-agentes-conversacionales`

### Investigación y Gestión de Proyectos en IA

**subjectKey:** `investigacion-y-gestion-de-proyectos-en-inteligencia-artificial`  
**subjectName:** `Investigación y Gestión de Proyectos en Inteligencia Artificial`

**Temas:**
1. **Tema 1- Origen y evolución de la inteligencia artificial** → `tema-1-origen-y-evolucion-de-la-inteligencia-artificial`
2. **Tema 2- Ciencia y método científico** → `tema-2-ciencia-y-metodo-cientifico`
3. **Tema 3- Financiación de proyectos** → `tema-3-financiacion-de-proyectos`
4. **Tema 4- Publicación de resultados y redacción científica** → `tema-4-publicacion-de-resultados-y-redaccion-cientifica`
5. **Tema 5- Gestión de proyectos de IA. Enfoque metodológico** → `tema-5-gestion-de-proyectos-de-inteligencia-artificial-enfoque-metodologico`
6. **Tema 6- Gestión de proyectos IA estructura de un proyecto IA y su despliegue** → `tema-6-gestion-de-proyectos-ia-estructura-de-un-proyecto-ia-y-su-despliegue`
7. **Tema 7- Gestión de proyectos IA. Recursos materiales y recursos humanos** → `tema-7-gestion-de-proyectos-ia-recursos-materiales-y-recursos-humanos`
8. **Tema 8- Investigación en agentes inteligentes y sistemas expertos** → `tema-8-investigacion-en-agentes-inteligentes-y-sistemas-expertos`
9. **Tema 9- Investigación en aprendizaje automático** → `tema-9-investigacion-en-aprendizaje-automatico`
10. **Tema 10- Investigación en sistemas cognitivos** → `tema-10-investigacion-en-sistemas-cognitivos`
11. **Tema 11- Investigación en computación bioinspirada** → `tema-11-investigacion-en-computacion-bioinspirada`
12. **Tema 12- Implicaciones filosóficas éticas y legales en la aplicación de la IA** → `tema-12-implicaciones-filosoficas-eticas-y-legales-en-la-aplicacion-de-la-inteligencia-artificial`

---

## Tipos de Preguntas

Hay **4 tipos de preguntas** soportadas:

1. **TEST** - Selección múltiple (una o varias respuestas correctas)
2. **COMPLETAR** - Rellenar huecos en un texto
3. **DESARROLLO** - Texto libre que requiere corrección manual
4. **PRACTICO** - Similar a DESARROLLO pero puede incluir un resultado numérico

---

## 1. Preguntas TEST

### Características
- Tienen opciones de respuesta (mínimo 2)
- Se indican cuál(es) son las correctas
- La corrección es **automática**
- Pueden tener una o múltiples respuestas correctas

### Formato JSON

```json
{
  "id": "uuid-unico",
  "subjectKey": "procesamiento-del-lenguaje-natural",
  "topicKey": "tema-3-etiquetado-morfosintactico-pos-tagging",
  "type": "TEST",
  "prompt": "¿Cuál de los siguientes es un método de **etiquetado morfosintáctico** (POS tagging)?",
  "options": [
    {
      "id": "opt-1",
      "text": "**Hidden Markov Models** (HMM)"
    },
    {
      "id": "opt-2",
      "text": "K-means clustering"
    },
    {
      "id": "opt-3",
      "text": "**Conditional Random Fields** (CRF)"
    },
    {
      "id": "opt-4",
      "text": "Principal Component Analysis (PCA)"
    }
  ],
  "correctOptionIds": ["opt-1", "opt-3"],
  "explanation": "Los **HMM** y **CRF** son modelos probabilísticos utilizados específicamente para el *etiquetado secuencial* de tokens.\n\n- **HMM:** Modelo generativo que asume independencia de observaciones\n- **CRF:** Modelo discriminativo que puede capturar dependencias entre características\n\nTanto K-means como PCA son técnicas de *clustering* y *reducción de dimensionalidad*, no de etiquetado secuencial.",
  "difficulty": 3,
  "tags": ["POS tagging", "modelos probabilísticos", "HMM", "CRF"],
  "createdBy": "Ana"
}
```

### Ejemplo de pregunta TEST en examen

**Pregunta extraída de examen:**
> **3. El algoritmo A* es:**
> - a) Un algoritmo de búsqueda informada
> - b) Un algoritmo de búsqueda no informada
> - c) Un algoritmo completo y óptimo si la heurística es admisible
> - d) Un algoritmo que siempre encuentra la solución más rápida

**Respuestas correctas:** a y c

**Cómo convertirlo a JSON:**
```json
{
  "id": "q-001",
  "subjectKey": "razonamiento-y-planificacion-automatica",
  "topicKey": "tema-5-busqueda-informada",
  "type": "TEST",
  "prompt": "El algoritmo A* es:",
  "options": [
    {"id": "a", "text": "Un algoritmo de búsqueda informada"},
    {"id": "b", "text": "Un algoritmo de búsqueda no informada"},
    {"id": "c", "text": "Un algoritmo completo y óptimo si la heurística es admisible"},
    {"id": "d", "text": "Un algoritmo que siempre encuentra la solución más rápida"}
  ],
  "correctOptionIds": ["a", "c"],
  "difficulty": 2,
  "createdBy": "Ana"
}
```

---

## 2. Preguntas COMPLETAR

### Características
- El estudiante debe rellenar huecos en un texto
- Los huecos se marcan con `{{respuesta}}`
- Cada hueco puede tener múltiples respuestas aceptadas
- La corrección es **automática** (compara texto normalizado)

### Formato JSON

```json
{
  "id": "uuid-unico",
  "subjectKey": "procesamiento-del-lenguaje-natural",
  "topicKey": "tema-2-el-texto-como-dato",
  "type": "COMPLETAR",
  "prompt": "Completa los huecos sobre tokenización:",
  "clozeText": "La {{tokenización}} es el proceso de dividir un texto en {{tokens}}. En español, un desafío común es manejar las {{contracciones}} como 'del' o 'al'.",
  "blanks": [
    {
      "id": "tokenización",
      "accepted": ["tokenización", "tokenizacion", "segmentación", "segmentacion"]
    },
    {
      "id": "tokens",
      "accepted": ["tokens", "unidades", "palabras"]
    },
    {
      "id": "contracciones",
      "accepted": ["contracciones", "palabras compuestas", "fusiones"]
    }
  ],
  "explanation": "La tokenización divide el texto en unidades mínimas (tokens), y las contracciones son un desafío específico del español.",
  "difficulty": 2,
  "createdBy": "Luis"
}
```

### Ejemplo de pregunta COMPLETAR en examen

**Pregunta extraída de examen:**
> **Completa:** El algoritmo Minimax explora el árbol de juego hasta una profundidad ______ y utiliza una función de ______ para evaluar las posiciones finales.

**Respuestas:** profundidad = "máxima" o "límite", evaluación = "evaluación" o "utilidad"

**Cómo convertirlo a JSON:**
```json
{
  "id": "q-002",
  "subjectKey": "razonamiento-y-planificacion-automatica",
  "topicKey": "tema-6-busqueda-entre-adversarios",
  "type": "COMPLETAR",
  "prompt": "Completa los huecos sobre el algoritmo Minimax:",
  "clozeText": "El algoritmo Minimax explora el árbol de juego hasta una profundidad {{maxima}} y utiliza una función de {{evaluacion}} para evaluar las posiciones finales.",
  "blanks": [
    {
      "id": "maxima",
      "accepted": ["máxima", "maxima", "límite", "limite", "determinada"]
    },
    {
      "id": "evaluacion",
      "accepted": ["evaluación", "evaluacion", "utilidad", "valoración", "valoracion"]
    }
  ],
  "difficulty": 2,
  "createdBy": "Luis"
}
```

---

## 3. Preguntas DESARROLLO

### Características
- Respuesta en texto libre
- Requiere **corrección manual** por parte del estudiante
- Se puede incluir una respuesta modelo
- Se pueden definir palabras clave para orientar la respuesta

### Formato JSON

```json
{
  "id": "uuid-unico",
  "subjectKey": "investigacion-y-gestion-de-proyectos-en-inteligencia-artificial",
  "topicKey": "tema-2-ciencia-y-metodo-cientifico",
  "type": "DESARROLLO",
  "prompt": "Explica las diferencias fundamentales entre el método inductivo y el método deductivo en la investigación científica. Proporciona un ejemplo de cada uno.",
  "modelAnswer": "El **método inductivo** parte de observaciones particulares para llegar a conclusiones generales. Por ejemplo, observar que múltiples cisnes son blancos y concluir que todos los cisnes son blancos.\n\nEl **método deductivo** parte de premisas generales para llegar a conclusiones específicas. Por ejemplo, si sabemos que todos los mamíferos tienen corazón (premisa general) y que los perros son mamíferos, podemos deducir que los perros tienen corazón.\n\nLa principal diferencia es la dirección del razonamiento: inductivo va de lo particular a lo general, deductivo va de lo general a lo particular.",
  "keywords": ["inductivo", "deductivo", "particular", "general", "observaciones", "premisas"],
  "explanation": "Es importante que la respuesta mencione la dirección del razonamiento y proporcione ejemplos claros.",
  "difficulty": 3,
  "tags": ["método científico", "razonamiento"],
  "createdBy": "Pedro"
}
```

### Ejemplo de pregunta DESARROLLO en examen

**Pregunta extraída de examen:**
> **4. Describe el funcionamiento del algoritmo de búsqueda en anchura (BFS) y explica cuándo es óptimo.**

**Cómo convertirlo a JSON:**
```json
{
  "id": "q-003",
  "subjectKey": "razonamiento-y-planificacion-automatica",
  "topicKey": "tema-4-busqueda-no-informada",
  "type": "DESARROLLO",
  "prompt": "Describe el funcionamiento del algoritmo de búsqueda en anchura (BFS) y explica cuándo es óptimo.",
  "modelAnswer": "**Funcionamiento de BFS:**\n\nEl algoritmo de búsqueda en anchura explora el árbol de búsqueda nivel por nivel. Utiliza una estructura de cola (FIFO) para mantener los nodos por explorar.\n\n**Pasos:**\n1. Insertar el nodo inicial en la cola\n2. Extraer el primer nodo de la cola\n3. Si es el objetivo, terminar\n4. Si no, expandir sus sucesores y añadirlos al final de la cola\n5. Repetir desde el paso 2\n\n**Optimalidad:**\n\nBFS es óptimo cuando:\n- Todos los pasos tienen el mismo coste\n- El coste es una función no decreciente de la profundidad\n\nEsto se debe a que BFS siempre encuentra la solución en el nivel más superficial, que será la de menor coste si todos los pasos cuestan lo mismo.",
  "keywords": ["anchura", "BFS", "cola", "FIFO", "nivel", "óptimo", "coste uniforme"],
  "difficulty": 3,
  "createdBy": "Pedro"
}
```

---

## 4. Preguntas PRACTICO

### Características
- Similar a DESARROLLO pero orientada a ejercicios prácticos
- Puede incluir un **resultado numérico esperado**
- También requiere corrección manual
- Útil para problemas de cálculo o implementación

### Formato JSON

```json
{
  "id": "uuid-unico",
  "subjectKey": "razonamiento-y-planificacion-automatica",
  "topicKey": "tema-5-busqueda-informada",
  "type": "PRACTICO",
  "prompt": "Dado el siguiente grafo, calcula el camino óptimo desde A hasta G usando A* con la heurística proporcionada:\n\n```\nGrafo:\nA -> B (coste: 2), A -> C (coste: 3)\nB -> D (coste: 4), C -> D (coste: 1)\nD -> G (coste: 2)\n\nHeurística h(n):\nh(A) = 7, h(B) = 5, h(C) = 4, h(D) = 2, h(G) = 0\n```\n\nIndica el camino y el coste total.",
  "modelAnswer": "**Solución paso a paso:**\n\n1. Iniciar desde A: f(A) = 0 + 7 = 7\n2. Expandir A:\n   - B: f(B) = 2 + 5 = 7\n   - C: f(C) = 3 + 4 = 7\n3. Expandir B (mismo f, pero llegó primero):\n   - D vía B: f(D) = 6 + 2 = 8\n4. Expandir C:\n   - D vía C: f(D) = 4 + 2 = 6 (mejor que vía B)\n5. Expandir D (vía C):\n   - G: f(G) = 6 + 0 = 6\n\n**Camino óptimo:** A → C → D → G\n**Coste total:** 3 + 1 + 2 = 6",
  "numericAnswer": "6",
  "keywords": ["A*", "heurística", "camino óptimo", "f(n)", "g(n)", "h(n)"],
  "difficulty": 4,
  "tags": ["ejercicio práctico", "A*", "grafos"],
  "createdBy": "María"
}
```

### Ejemplo de pregunta PRACTICO en examen

**Pregunta extraída de examen:**
> **5. Implementa el algoritmo de Poda Alfa-Beta para el siguiente árbol de juego. Indica qué nodos se podan y cuál es el valor final.**
> 
> [Diagrama del árbol de juego con valores]

**Cómo convertirlo a JSON:**
```json
{
  "id": "q-004",
  "subjectKey": "razonamiento-y-planificacion-automatica",
  "topicKey": "tema-6-busqueda-entre-adversarios",
  "type": "PRACTICO",
  "prompt": "Implementa el algoritmo de Poda Alfa-Beta para el siguiente árbol de juego. Indica qué nodos se podan y cuál es el valor final.\n\n```\n         MAX\n        /   \\\n      MIN   MIN\n      / \\   / \\\n     3   5 2   9\n```",
  "modelAnswer": "**Solución:**\n\n1. Nodo MIN izquierdo:\n   - Evalúa 3, α=-∞, β=3\n   - Evalúa 5, pero 5 > β=3 en MAX, por lo que no cambia nada\n   - Valor MIN izquierdo = 3\n\n2. Nodo MIN derecho:\n   - Evalúa 2, α=3 (del MIN izquierdo), β=2\n   - El siguiente nodo (9) se **PODA** porque 9 > α=3 en MAX, y ya sabemos que MIN elegirá 2\n   - Valor MIN derecho = 2\n\n3. Nodo MAX raíz:\n   - Elige max(3, 2) = 3\n\n**Valor final:** 3\n**Nodos podados:** El hijo derecho del MIN derecho (valor 9)",
  "numericAnswer": "3",
  "keywords": ["alfa-beta", "poda", "minimax", "maximización", "minimización"],
  "difficulty": 4,
  "createdBy": "María"
}
```

---

## Soporte para Markdown - EJEMPLOS DETALLADOS

### ⚡ REGLA DE ORO: Usa Markdown en TODOS los campos de texto

**IMPORTANTE:** Markdown hace las preguntas más legibles, profesionales y fáciles de estudiar. No uses texto plano cuando Markdown puede mejorar la claridad.

### Sintaxis Markdown soportada:

```markdown
# Encabezado 1
## Encabezado 2
### Encabezado 3

**Negrita**
*Cursiva*
~~Tachado~~

- Lista no ordenada
- Otro item
  - Subitem

1. Lista ordenada
2. Otro item

`código inline`

```
bloque de código
con múltiples líneas
```

[Enlace](https://ejemplo.com)

> Cita o nota importante

| Columna 1 | Columna 2 |
|-----------|-----------|
| Dato 1    | Dato 2    |

---

Línea horizontal
```

### Ejemplo 1: Pregunta TEST con Markdown

❌ **MAL - Sin Markdown:**
```json
{
  "prompt": "Cual de las siguientes afirmaciones sobre A* es correcta?",
  "options": [
    {"id": "a", "text": "Usa heuristica h(n) que estima el coste desde n hasta el objetivo"},
    {"id": "b", "text": "La funcion f(n) = g(n) + h(n)"}
  ]
}
```

✅ **BIEN - Con Markdown:**
```json
{
  "prompt": "¿Cuál de las siguientes afirmaciones sobre **A*** es correcta?",
  "options": [
    {"id": "a", "text": "Usa heurística `h(n)` que estima el coste desde `n` hasta el objetivo"},
    {"id": "b", "text": "La función `f(n) = g(n) + h(n)` donde `g(n)` es el coste real desde el inicio"},
    {"id": "c", "text": "Es **óptimo** solo si la heurística es *admisible*"}
  ]
}
```

### Ejemplo 2: Pregunta DESARROLLO con Markdown estructurado

❌ **MAL - Texto plano sin estructura:**
```json
{
  "prompt": "Explica las diferencias entre BFS y DFS",
  "modelAnswer": "BFS explora por niveles usando cola FIFO. DFS explora en profundidad usando pila LIFO. BFS encuentra solucion optima si todos los costes son iguales. DFS usa menos memoria pero puede no encontrar solucion optima."
}
```

✅ **BIEN - Con Markdown estructurado:**
```json
{
  "prompt": "Explica las diferencias fundamentales entre **BFS** (Búsqueda en Anchura) y **DFS** (Búsqueda en Profundidad). Incluye:\n\n1. Estructura de datos usada\n2. Orden de exploración\n3. Optimalidad\n4. Consumo de memoria",
  "modelAnswer": "## Comparación BFS vs DFS\n\n### 1. Estructura de datos\n\n- **BFS:** Utiliza una **cola FIFO** (First In, First Out)\n- **DFS:** Utiliza una **pila LIFO** (Last In, First Out)\n\n### 2. Orden de exploración\n\n- **BFS:** Explora *nivel por nivel* (todos los nodos a profundidad `d` antes de pasar a `d+1`)\n- **DFS:** Explora *rama por rama* (baja hasta el final de una rama antes de retroceder)\n\n### 3. Optimalidad\n\n- **BFS:** ✅ **Óptimo** cuando todos los pasos tienen el mismo coste\n- **DFS:** ❌ **NO óptimo** - puede encontrar una solución más profunda antes que una superficial\n\n### 4. Consumo de memoria\n\n- **BFS:** `O(b^d)` - guarda todos los nodos de un nivel\n- **DFS:** `O(bd)` - solo guarda el camino actual\n\n> Donde `b` es el factor de ramificación y `d` la profundidad"
}
```

### Ejemplo 3: Pregunta PRACTICO con código y fórmulas

✅ **Con Markdown para código:**
```json
{
  "prompt": "Implementa el cálculo de `f(n) = g(n) + h(n)` para el algoritmo **A*** dado el siguiente grafo:\n\n```\nA -> B (coste: 3)\nA -> C (coste: 5)\nB -> G (coste: 2)\nC -> G (coste: 1)\n\nHeurística:\nh(A) = 5\nh(B) = 2  \nh(C) = 1\nh(G) = 0\n```\n\nCalcula `f(n)` para cada nodo y determina el camino óptimo.",
  "modelAnswer": "## Solución paso a paso\n\n### Cálculo de f(n) para cada nodo\n\nRecordemos que `f(n) = g(n) + h(n)`:\n- `g(n)` = coste acumulado desde el inicio\n- `h(n)` = estimación heurística hasta el objetivo\n\n#### Desde A:\n\n| Nodo | g(n) | h(n) | f(n) = g+h |\n|------|------|------|------------|\n| A    | 0    | 5    | **5**      |\n| B    | 3    | 2    | **5**      |\n| C    | 5    | 1    | **6**      |\n\n#### Expandir B (menor f):\n\n| Nodo | Camino | g(n) | h(n) | f(n) |\n|------|--------|------|------|------|\n| G    | A→B→G  | 5    | 0    | **5**|\n\n#### Expandir C (por completitud):\n\n| Nodo | Camino | g(n) | h(n) | f(n) |\n|------|--------|------|------|------|\n| G    | A→C→G  | 6    | 0    | **6**|\n\n### Resultado\n\n✅ **Camino óptimo:** `A → B → G`  \n✅ **Coste total:** `3 + 2 = 5`\n\n> **Nota:** A* eligió primero el camino A→B porque `f(B) = 5 < f(C) = 6`",
  "numericAnswer": "5"
}
```

### Ejemplo 4: Pregunta COMPLETAR con formato claro

✅ **Con Markdown:**
```json
{
  "prompt": "Completa los huecos sobre **algoritmos de búsqueda**:",
  "clozeText": "El algoritmo **BFS** utiliza una estructura de tipo {{cola}}, mientras que **DFS** utiliza una {{pila}}.\n\nLa complejidad espacial de BFS es {{O(b^d)}}, donde:\n- `b` = factor de ramificación\n- `d` = profundidad de la solución\n\nBFS es **óptimo** cuando todos los pasos tienen el mismo {{coste}}.",
  "blanks": [
    {
      "id": "cola",
      "accepted": ["cola", "FIFO", "queue", "cola FIFO"]
    },
    {
      "id": "pila",
      "accepted": ["pila", "LIFO", "stack", "pila LIFO"]
    },
    {
      "id": "O(b^d)",
      "accepted": ["O(b^d)", "O(b**d)", "exponencial"]
    },
    {
      "id": "coste",
      "accepted": ["coste", "costo", "peso"]
    }
  ]
}
```

### Cuándo usar cada elemento Markdown:

| Elemento | Cuándo usar | Ejemplo |
|----------|-------------|---------|
| **Negrita** | Términos clave, conceptos importantes | `**A***`, `**óptimo**` |
| *Cursiva* | Énfasis suave, términos técnicos | `*admisible*`, `*heurística*` |
| `Código` | Variables, funciones, código inline | `f(n)`, `h(n)`, `BFS` |
| ``` Bloque ``` | Pseudocódigo, ejemplos, grafos ASCII | Ver ejemplos arriba |
| ## Encabezados | Estructurar respuestas largas | `## Solución`, `### Paso 1` |
| Listas | Enumerar puntos, pasos, características | Ver ejemplos arriba |
| Tablas | Comparaciones, datos estructurados | Ver ejemplos arriba |
| > Citas | Notas importantes, advertencias | `> Nota: BFS es óptimo solo si...` |

### Ejemplo 5: Pregunta con fórmulas matemáticas

```json
{
  "prompt": "Dado un problema de búsqueda, explica cómo se calcula la función de evaluación `f(n)` en **A***.",
  "modelAnswer": "## Función de evaluación en A*\n\nLa función `f(n)` se calcula como:\n\n```\nf(n) = g(n) + h(n)\n```\n\nDonde:\n- `g(n)` = **coste real** desde el nodo inicial hasta el nodo `n`\n- `h(n)` = **estimación heurística** del coste desde `n` hasta el objetivo\n\n### Propiedades importantes:\n\n1. **Admisibilidad:** La heurística `h(n)` debe cumplir:\n   ```\n   h(n) ≤ h*(n)  para todo n\n   ```\n   Donde `h*(n)` es el coste real óptimo desde `n` al objetivo.\n\n2. **Optimalidad:** Si `h(n)` es admisible, entonces `f(n)` garantiza encontrar la solución óptima.\n\n### Ejemplo numérico:\n\nSi `g(n) = 5` y `h(n) = 3`, entonces:\n```\nf(n) = 5 + 3 = 8\n```\n\nEsto significa que el coste estimado total del camino a través de `n` es **8**."
}
```

---

## Campos Opcionales

Además de los campos obligatorios, puedes incluir:

- **`explanation`** - Explicación o justificación de la respuesta correcta
- **`difficulty`** - Nivel de dificultad (1=Muy fácil, 2=Fácil, 3=Media, 4=Difícil, 5=Muy difícil)
- **`tags`** - Etiquetas para categorizar (array de strings)
- **`contentHash`** - Hash SHA-256 para evitar duplicados (se genera automáticamente)

---

## Ejemplo Completo de Contribution Pack

```json
{
  "version": 1,
  "kind": "contribution",
  "packId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "createdBy": "Ana",
  "exportedAt": "2026-02-18T12:00:00.000Z",
  "targets": [
    {
      "subjectKey": "razonamiento-y-planificacion-automatica",
      "subjectName": "Razonamiento y Planificación Automática",
      "topics": [
        {
          "topicKey": "tema-5-busqueda-informada",
          "topicTitle": "Tema 5- Búsqueda informada"
        },
        {
          "topicKey": "tema-6-busqueda-entre-adversarios",
          "topicTitle": "Tema 6- Búsqueda entre adversarios"
        }
      ]
    }
  ],
  "questions": [
    {
      "id": "q-001",
      "subjectKey": "razonamiento-y-planificacion-automatica",
      "topicKey": "tema-5-busqueda-informada",
      "type": "TEST",
      "prompt": "El algoritmo A* es:",
      "options": [
        {"id": "a", "text": "Un algoritmo de búsqueda informada"},
        {"id": "b", "text": "Un algoritmo de búsqueda no informada"},
        {"id": "c", "text": "Un algoritmo completo y óptimo si la heurística es admisible"},
        {"id": "d", "text": "Un algoritmo que siempre encuentra la solución más rápida"}
      ],
      "correctOptionIds": ["a", "c"],
      "explanation": "A* es un algoritmo de búsqueda informada que usa una heurística. Es completo y óptimo cuando la heurística es admisible (nunca sobreestima el coste real).",
      "difficulty": 2,
      "tags": ["A*", "búsqueda informada", "heurística"],
      "createdBy": "Ana"
    },
    {
      "id": "q-002",
      "subjectKey": "razonamiento-y-planificacion-automatica",
      "topicKey": "tema-6-busqueda-entre-adversarios",
      "type": "COMPLETAR",
      "prompt": "Completa los huecos sobre el algoritmo Minimax:",
      "clozeText": "El algoritmo Minimax explora el árbol de juego hasta una profundidad {{maxima}} y utiliza una función de {{evaluacion}} para evaluar las posiciones finales.",
      "blanks": [
        {
          "id": "maxima",
          "accepted": ["máxima", "maxima", "límite", "limite", "determinada"]
        },
        {
          "id": "evaluacion",
          "accepted": ["evaluación", "evaluacion", "utilidad", "valoración", "valoracion"]
        }
      ],
      "difficulty": 2,
      "createdBy": "Ana"
    },
    {
      "id": "q-003",
      "subjectKey": "razonamiento-y-planificacion-automatica",
      "topicKey": "tema-6-busqueda-entre-adversarios",
      "type": "PRACTICO",
      "prompt": "Calcula el valor Minimax para el siguiente árbol de juego:\n\n```\n         MAX\n        /   \\\n      MIN   MIN\n      / \\   / \\\n     3   5 2   9\n```",
      "modelAnswer": "**Solución:**\n\n1. Nodo MIN izquierdo: min(3, 5) = 3\n2. Nodo MIN derecho: min(2, 9) = 2\n3. Nodo MAX raíz: max(3, 2) = 3\n\n**Valor Minimax:** 3",
      "numericAnswer": "3",
      "keywords": ["minimax", "árbol de juego", "maximización", "minimización"],
      "difficulty": 3,
      "tags": ["ejercicio práctico", "minimax"],
      "createdBy": "Ana"
    }
  ]
}
```

---

## Instrucciones para ChatGPT

Al recibir un examen, sigue estos pasos:

### 1. Identificación de la asignatura y temas
- **Identifica la asignatura** y busca su `subjectKey` y `subjectName` en la lista de asignaturas proporcionada
- **Identifica los temas** mencionados en las preguntas y busca sus `topicKey` correspondientes

### 2. Clasificación de preguntas
- **Clasifica cada pregunta** por tipo:
  - **TEST:** Si tiene opciones de selección múltiple
  - **COMPLETAR:** Si requiere rellenar huecos en un texto
  - **DESARROLLO:** Si requiere respuesta en texto libre sin cálculos
  - **PRACTICO:** Si requiere cálculos, código o tiene un resultado numérico

### 3. Extracción y formato con Markdown

**⚡ CRÍTICO: USA MARKDOWN EN TODOS LOS CAMPOS DE TEXTO**

Para cada pregunta, extrae y formatea:

#### Para el `prompt` (enunciado):
- ✅ Usa **negrita** para términos clave y nombres de algoritmos
- ✅ Usa `código` para variables, funciones, código inline
- ✅ Usa bloques de código (```) para pseudocódigo, grafos, ejemplos
- ✅ Usa listas numeradas si la pregunta tiene múltiples partes
- ❌ NO dejes el texto plano sin formato

#### Para `options` (preguntas TEST):
- ✅ Formatea cada opción con Markdown apropiado
- ✅ Usa `código` para variables y términos técnicos
- ✅ Usa **negrita** para conceptos clave

#### Para `modelAnswer` (respuesta modelo):
- ✅ Usa `##` y `###` para estructurar respuestas largas
- ✅ Usa **listas** para enumerar puntos
- ✅ Usa **tablas** para comparaciones
- ✅ Usa bloques de código para soluciones paso a paso
- ✅ Usa > citas para notas importantes
- ❌ NO escribas párrafos largos sin estructura

#### Para `clozeText` (preguntas COMPLETAR):
- ✅ Formatea el texto con Markdown antes de los huecos `{{hueco}}`
- ✅ Usa **negrita**, `código`, listas según corresponda

#### Para `explanation`:
- ✅ Explica de forma estructurada con Markdown
- ✅ Usa formato para hacer la explicación más clara

### 4. Generación de IDs y metadatos
- **Genera IDs únicos** para cada pregunta (ej: "q-001", "q-002"...)
- **Genera IDs únicos** para opciones (ej: "a", "b", "c", "opt-1"...)
- **Asigna dificultad** basándote en la complejidad:
  - 1 = Muy fácil (definiciones simples)
  - 2 = Fácil (conceptos básicos)
  - 3 = Media (aplicación de conceptos)
  - 4 = Difícil (problemas complejos)
  - 5 = Muy difícil (análisis profundo, múltiples pasos)
- **Añade tags relevantes** (conceptos clave mencionados)

### 5. Generación del JSON completo
- Sigue **exactamente** la estructura del contribution pack
- Asegúrate de que todos los slugs coincidan con los proporcionados
- Incluye `explanation` cuando la respuesta lo requiera
- Para preguntas PRACTICO, incluye `numericAnswer` si aplica

### Ejemplo de transformación:

**Examen (texto plano):**
```
1. ¿Qué es el algoritmo A*?
a) Un algoritmo de búsqueda no informada
b) Un algoritmo que usa heurística h(n)
c) Un algoritmo óptimo si h(n) es admisible
Respuestas correctas: b, c
```

**JSON (con Markdown):**
```json
{
  "id": "q-001",
  "subjectKey": "razonamiento-y-planificacion-automatica",
  "topicKey": "tema-5-busqueda-informada",
  "type": "TEST",
  "prompt": "¿Qué es el algoritmo **A***?",
  "options": [
    {
      "id": "a",
      "text": "Un algoritmo de **búsqueda no informada**"
    },
    {
      "id": "b",
      "text": "Un algoritmo que usa heurística `h(n)` para estimar el coste hasta el objetivo"
    },
    {
      "id": "c",
      "text": "Un algoritmo **óptimo** si `h(n)` es *admisible*"
    }
  ],
  "correctOptionIds": ["b", "c"],
  "explanation": "**A*** es un algoritmo de búsqueda **informada** que combina:\n- `g(n)`: coste real desde el inicio\n- `h(n)`: estimación heurística al objetivo\n\nEs **óptimo** cuando `h(n)` nunca sobreestima (es *admisible*).",
  "difficulty": 2,
  "tags": ["A*", "búsqueda informada", "heurística", "optimalidad"],
  "createdBy": "Ana"
}
```

### Checklist antes de generar el JSON:

- [ ] Todos los `prompt` usan Markdown apropiadamente
- [ ] Todas las `options` están formateadas
- [ ] Todas las `modelAnswer` están bien estructuradas con Markdown
- [ ] Los `clozeText` tienen formato antes de los huecos
- [ ] Todas las `explanation` son claras y formateadas
- [ ] Los slugs coinciden exactamente con los de la lista
- [ ] Cada pregunta tiene un ID único
- [ ] Las preguntas TEST tienen `correctOptionIds`
- [ ] Las preguntas COMPLETAR tienen `blanks` bien definidos
- [ ] Las preguntas DESARROLLO/PRACTICO tienen `modelAnswer`
- [ ] Se ha asignado `difficulty` razonable
- [ ] Se han añadido `tags` relevantes

### Prompt sugerido para usar con ChatGPT:

```
Te voy a pasar un examen de [NOMBRE DE LA ASIGNATURA]. 
Conviértelo en un contribution pack siguiendo la guía que te he proporcionado.

IMPORTANTE: 
- Usa Markdown en TODOS los campos de texto (prompt, options, modelAnswer, explanation)
- Formatea el contenido para que sea claro y legible
- Estructura las respuestas largas con encabezados, listas y tablas
- Usa código inline y bloques de código cuando sea apropiado

El examen es el siguiente:
[PEGAR EXAMEN AQUÍ]

Genera el JSON completo del contribution pack con Markdown apropiado.
```

---

## Notas Finales

### Requisitos técnicos:
- Cada pregunta debe tener un **ID único** (puedes usar UUIDs o identificadores simples como "q-001")
- Las opciones también necesitan **IDs únicos** (ej: "a", "b", "c", "opt-1", etc.)
- El sistema **deduplica automáticamente** usando `contentHash`, así que no te preocupes por preguntas repetidas
- El campo `createdBy` identifica al autor del contribution pack

### ⚡ CRÍTICO - Uso de Markdown:

**TODOS LOS CAMPOS DE TEXTO DEBEN USAR MARKDOWN:**

✅ **HAZ ESTO:**
- Formatea términos clave con **negrita**
- Usa `código` para variables, funciones, algoritmos
- Estructura respuestas largas con `##` encabezados
- Usa listas para enumerar puntos
- Usa tablas para comparaciones
- Usa bloques de código para pseudocódigo
- Usa > citas para notas importantes

❌ **NO HAGAS ESTO:**
- No dejes texto plano sin formato
- No escribas párrafos largos sin estructura
- No omitas formato en variables y código
- No ignores las opciones de Markdown disponibles

### Verificación de slugs:
- **IMPORTANTE:** Los slugs deben coincidir **exactamente** con los de la lista de asignaturas y temas proporcionada
- Los slugs son case-sensitive (aunque normalmente todo en minúsculas)
- Revisa dos veces que estés usando el slug correcto

### Calidad del contenido:
- Las preguntas bien formateadas con Markdown son **mucho más fáciles de estudiar**
- El formato ayuda a resaltar conceptos clave
- Las respuestas estructuradas facilitan la comprensión
- Invierte tiempo en formatear bien el contenido

---

¡Con esta guía y el uso apropiado de Markdown, ChatGPT generará contribution packs de alta calidad listos para estudiar!
