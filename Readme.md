# ExamCoach

App web para crear y practicar bancos de preguntas de examen. Tus datos se guardan en tu navegador — sin registro, sin servidor, sin conexión necesaria.

Accede directamente desde GitHub Pages. No hace falta instalar nada ni crear ninguna cuenta.

---

## Instalar como app

Una vez instalada, se abre directamente sin el navegador y funciona sin conexión.

- **Chrome / Edge / Android**: pulsa "📲 Instalar app" en el menú (☰).
- **iOS / Safari**: pulsa el botón Compartir ⬆ en la barra de Safari → "Añadir a pantalla de inicio".

---

## Asignaturas y preguntas

Crea tantas **asignaturas** como necesites. Dentro de cada asignatura, organiza las preguntas por **temas**.

### Tipos de preguntas

| Tipo | Cómo funciona |
|------|---------------|
| **Test** | Selecciona una o varias opciones correctas. Corrección automática al instante. |
| **Completar** | Rellena los huecos marcados como `{{respuesta}}` en el enunciado. Corrección automática con normalización de texto. |
| **Desarrollo** | Respuesta de texto libre. Tú decides si la respuesta es correcta o no. |
| **Práctico** | Respuesta de texto libre más un resultado numérico opcional. Corrección manual. |

### Opciones de cada pregunta

- **Dificultad** en escala 1–5
- **Tags y palabras clave** para búsquedas rápidas
- **Imágenes inline** en el enunciado, la respuesta o la explicación (arrastra o pega desde el portapapeles)
- **Ancla PDF**: vincula la pregunta a una página concreta de un PDF
- **Origen**: indica si viene de un test, examen anterior, clase o de un compañero
- **Explicación**: texto adicional que se muestra tras responder
- Todos los campos de texto soportan **Markdown** y **fórmulas LaTeX**

---

## Modos de práctica

Lanza una sesión desde cualquier asignatura o tema:

- **Aleatorio N** — elige cuántas preguntas practicar al azar
- **Todas** — sesión completa con todas las preguntas del tema o asignatura
- **Solo falladas** — repasa únicamente las preguntas que has respondido mal
- **Por tema** — filtra la sesión a un tema concreto
- **Modo inteligente (SM-2)** — repetición espaciada: el algoritmo prioriza las preguntas que necesitas repasar hoy según tu historial de aciertos y fallos. Cada pregunta tiene su propia fecha de próximo repaso
- **Modo examen** — sesión cronometrada con cuenta atrás configurable
- **Práctica mixta** — mezcla preguntas de todas las asignaturas a la vez

Puedes **pausar y reanudar** cualquier sesión en el punto en que lo dejaste. Las sesiones en curso se muestran en la barra lateral del dashboard.

---

## Flashcards

Modo de tarjetas volteables para repasar conceptos rápidamente. Las tarjetas se ordenan según el algoritmo de repetición espaciada y puedes marcarlas como dominadas o pendientes.

---

## Exámenes curados

Crea **conjuntos de preguntas seleccionadas a mano** para simular exámenes reales. Gestiona y repasa estos exámenes de forma independiente al banco de preguntas general.

---

## Conceptos clave

Almacena **fórmulas, definiciones y observaciones** organizadas por asignatura y categoría. Admiten Markdown y LaTeX completo. Durante las sesiones de práctica puedes abrir la barra lateral de conceptos clave como referencia rápida sin salir de la sesión.

---

## Mapa de conocimiento y Leitner

- **Mapa de conocimiento**: visualización gráfica que muestra el porcentaje de dominio de cada tema según tus estadísticas de acierto/fallo.
- **Cajas de Leitner**: sistema visual de repaso que organiza las preguntas en cajas según tu nivel de dominio, siguiendo el método Leitner clásico.

---

## Entregas, notas y calendario

Lleva el seguimiento de tus actividades académicas:

- Registra **tests, trabajos y exámenes** con fecha de entrega
- Estados: pendiente, en progreso, hecho, entregado
- **Nota numérica** (escala 0–10) por entrega
- **Cálculo automático de la nota final** con pesos configurables (% evaluación continua vs. % examen final)
- **Widget de calendario** que muestra de un vistazo los próximos exámenes y entregas
- **Cuenta atrás** hasta el próximo examen en cada tarjeta de asignatura del dashboard

---

## Estadísticas

- Veces vista, aciertos y fallos **por pregunta**
- Progreso y porcentaje de acierto **por asignatura**
- **Dashboard global** con estadísticas cruzadas de todas las asignaturas
- **Historial de sesiones** con fecha, duración y resultado
- Análisis por nivel de dificultad

---

## Herramientas PDF

Accede desde el botón "🛠️ Herramientas PDF" en el dashboard:

- **Visor integrado** con navegación por página y zoom
- **Extraer texto** de un PDF
- **Fusionar** varios PDFs en uno
- **Dividir** un PDF por páginas
- **Rotar** páginas
- **Marca de agua** (texto o imagen)
- **Metadatos**: leer y escribir título, autor, etc.
- **Imágenes a PDF**: convierte una o varias imágenes en un documento PDF

---

## Escuchar PDFs (Text-to-Speech)

Escucha tus apuntes en español con síntesis de voz:

- Selecciona la voz disponible en tu sistema (prioriza voces neuronales de Google/Microsoft)
- Velocidad ajustable: 0.75×, 1×, 1.25×, 1.5×, 2×
- Controles de reproducción con avance/retroceso por bloque y barra de progreso
- Las fórmulas matemáticas y símbolos (letras griegas, operadores, etc.) se convierten a lenguaje natural en español
- Atajos de teclado: `Espacio` (play/pausa), `← →` (bloque anterior/siguiente), `+/-` (velocidad), `Esc` (detener)

---

## Integración con IA (opcional)

Configura tu propia API key de OpenAI o Anthropic en Ajustes:

- **Extracción automática de preguntas desde PDFs**: sube un PDF y la IA identifica y estructura las preguntas automáticamente
- **Revisión de respuestas**: tras responder una pregunta de desarrollo, la IA evalúa tu respuesta y ofrece feedback detallado
- **WebLLM**: opción experimental para ejecutar un modelo de IA directamente en el navegador, sin API key

---

## Markdown y fórmulas LaTeX

Todos los campos de texto (enunciado, respuesta, explicación, opciones, conceptos clave…) admiten:

**Markdown**
```
**negrita**, *cursiva*, `código inline`
- listas, tablas, enlaces, imágenes
```

**Fórmulas matemáticas (KaTeX)**

| Formato | Uso |
|---------|-----|
| `$...$` | Fórmula en línea dentro del texto |
| `$$...$$` | Fórmula en bloque, centrada |
| `\(...\)` | Alternativa inline (LaTeX estándar) |
| `\[...\]` | Alternativa en bloque (LaTeX estándar) |

Todos los delimitadores se normalizan automáticamente, así que puedes mezclarlos sin problema. Si usas ChatGPT para generar preguntas, dile que use `$...$` y `$$...$$`.

---

## Menú (☰) — acciones avanzadas

| Opción | Qué hace |
|--------|----------|
| 📲 **Instalar app** | Instala ExamCoach como app nativa en tu dispositivo |
| ⟳ **Sincronizar banco** | Descarga la última versión del banco global de preguntas |
| ↑ **Exportar banco global** | Exporta todo el banco a un archivo JSON |
| 🔄 **Integrar & limpiar** | Fusiona los packs de contribuciones en el banco global |
| 🔧 **Eliminar duplicadas** | Detecta y elimina preguntas con el mismo contenido |
| ↑ **Backup personal** | Exporta todos tus datos (preguntas, estadísticas, ajustes) a JSON |
| ↓ **Importar backup** | Restaura un backup personal en este navegador |
| 📦 **Importar recursos** | Sube un ZIP con PDFs organizados por asignatura |

### Copias de seguridad

Usa **↑ Backup personal** regularmente para guardar todos tus datos. El archivo JSON resultante se puede reimportar en cualquier navegador o dispositivo con **↓ Importar backup**.

### Importar recursos (PDFs)

Puedes subir un archivo ZIP con PDFs organizados por asignatura. Arrastra el ZIP a la zona inferior del dashboard o usa **📦 Importar recursos** en el menú.

---

## Búsqueda global

La barra de búsqueda del dashboard busca en tiempo real a través de todas las asignaturas y temas. Encuentra cualquier pregunta por su texto, tags o palabras clave.

---

## Exportaciones adicionales

Desde **Ajustes** puedes exportar en varios formatos:

- **Contribution pack**: JSON para compartir preguntas con otros usuarios del banco global
- **Exportación compacta (para ChatGPT)**: formato mínimo ~90% más pequeño, útil para pegar en un prompt de ChatGPT y pedir que genere preguntas nuevas sin repetir las existentes
- **Exportación Anki**: genera un archivo TSV compatible con Anki (tipo Basic/Cloze) para importar las preguntas en Anki
- **Guía de estudio**: genera automáticamente una guía de estudio a partir del banco de preguntas
- **Exportación a PDF**: exporta preguntas, resultados o sesiones como documento PDF

---

© 2026 Luis M. Salete. Todos los derechos reservados.
Código privado. Acceso exclusivo vía GitHub Pages.
