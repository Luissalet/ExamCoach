# Plan: Sistema de Paquetes y Marketplace

## Decisiones tomadas

- **Arranque vacío**: la app arranca sin asignaturas. El usuario instala desde el marketplace.
- **Registry**: GitHub Releases API para listar paquetes disponibles.
- **Gist sync híbrida**: el gist guarda bancos de preguntas + progreso, pero NO los PDFs/recursos. Los recursos se instalan aparte desde el marketplace.

## Formato de paquete

```
mi-asignatura.examcoach.zip
├── manifest.json        ← identidad + metadatos (absorbe extra_info.json)
├── bank.json            ← preguntas, topics, conceptos clave, exámenes
├── Temas/
│   ├── index.json
│   └── *.pdf
├── Examenes/
│   ├── index.json
│   └── [subcarpetas]/
├── Resumenes/
│   ├── index.json
│   └── [autor]/
└── Practica/
    ├── index.json
    └── [actividad]/
```

### manifest.json

```json
{
  "formatVersion": 1,
  "id": "ingenieria-del-software",
  "name": "Ingeniería del Software",
  "version": "2.1.0",
  "description": "Banco de preguntas y recursos para IS",
  "authors": ["Luis", "colaborador2"],
  "university": "UAM",
  "degree": "GII",
  "year": "3º",
  "credits": 6,
  "professor": "Nombre Profesor",
  "allowsNotes": false,
  "createdAt": "2026-01-15T...",
  "updatedAt": "2026-03-01T...",
  "stats": {
    "questions": 342,
    "topics": 12,
    "exams": 8,
    "keyConcepts": 45
  },
  "minAppVersion": "1.5.0",
  "gptLinks": [],
  "externalLinks": []
}
```

### bank.json

```json
{
  "formatVersion": 1,
  "subject": "ingenieria-del-software",
  "topics": [],
  "questions": [],
  "keyConcepts": [],
  "exams": []
}
```

## Cambios de código necesarios

### 1. Eliminar global-bank.json

- Disgregarlo en bancos individuales por asignatura (bank.json dentro de cada paquete).
- La app ya no embebe datos en el build — arranca vacía.
- Migración: al detectar datos del global bank antiguo, marcarlos como "instalados".

### 2. Package Manager (src/data/packageManager.ts)

- `installPackage(zip: File | Blob)`: descomprime, valida manifest, importa bank.json a Dexie, guarda recursos en IndexedDB/FSA.
- `uninstallPackage(packageId: string)`: elimina asignatura, topics, preguntas, recursos.
- `exportPackage(subjectId: string)`: genera ZIP con manifest + bank + recursos.
- `listInstalled()`: lista paquetes instalados con versión.
- `checkForUpdates(installed: Package[])`: compara con registry remoto.

### 3. Package Registry (src/data/packageRegistry.ts)

- Consulta GitHub Releases API: `GET /repos/{owner}/{repo}/releases`.
- Parsea releases para extraer manifests (adjuntos como assets).
- Devuelve catálogo con stats, versiones, URLs de descarga.
- Cache local para no pegar a la API en cada visita.

### 4. Marketplace UI (src/ui/pages/Marketplace.tsx)

- Nueva ruta `/marketplace`.
- Lista paquetes disponibles con nombre, stats, versión, botón instalar/actualizar.
- Indicador de paquetes ya instalados.
- Barra de búsqueda/filtro por universidad, grado, año.
- Detalle de paquete: descripción, autores, changelog.

### 5. Dashboard adaptado

- Si no hay asignaturas instaladas: CTA prominente al marketplace.
- Botón de acceso al marketplace siempre visible.
- Indicador de actualizaciones disponibles.

### 6. Gist sync adaptada

- El gist guarda: bancos de preguntas + progreso + stats + lista de paquetes instalados (con versión).
- Al hacer pull en otro dispositivo: importa banco + progreso, muestra qué paquetes de recursos faltan para descargar del marketplace.
- NO incluye PDFs ni recursos pesados en el gist.

### 7. Vite plugin adaptado

- Ya no necesita inicializar resources/ desde global-bank.json.
- Puede mantener endpoints de dev para subir recursos a paquetes locales.

### 8. Crear paquetes de las 6 asignaturas existentes

- Script que lee global-bank.json + resources/ y genera 6 ZIPs.
- Subir como GitHub Releases con manifest como descripción.

## Almacenamiento

- **GitHub Releases**: cada paquete como asset de un release. Límite 2GB/archivo.
- Sin costes: gratis para repos públicos.
- La app descarga directamente las URLs de assets.

## Orden de implementación sugerido

1. Definir tipos TypeScript (PackageManifest, SubjectBank)
2. packageManager.ts (install/uninstall/export)
3. packageRegistry.ts (fetch releases)
4. Marketplace UI
5. Adaptar Dashboard
6. Migración de global-bank.json → paquetes individuales
7. Adaptar gist sync
8. Script de generación de paquetes + upload a GitHub Releases
9. Testing e2e
