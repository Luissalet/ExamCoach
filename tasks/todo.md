# Publicar nueva versión del paquete AANS en el marketplace

## Plan
- [x] Exportar paquete desde la app (datos en IndexedDB) → el usuario lo exportó manualmente a Descargas
- [x] Mover ZIP a `dist/packages/` (sobrescribir el de v1.0.0)
- [x] Subir versión del manifest dentro del ZIP: 1.0.0 → **1.1.0** (+ `updatedAt`)
- [x] Cifrar: `node scripts/encrypt-packages.mjs aprendizaje-automatico-no-supervisado`
- [x] Publicar: `node scripts/publish-packages.mjs aprendizaje-automatico-no-supervisado`
- [x] Verificar release en GitHub
- [x] Patch: dedup por id en `fetchRegistry`

## Cambios
- **Release publicada**: `pkg-aprendizaje-automatico-no-supervisado-v1.1.0` en SubjectPacks
  (275 preguntas, 10 temas; asset `.enc` de 12.6 MB, sha256 verificado).
- **`src/data/packageRegistry.ts`**: `fetchRegistry()` ahora deduplica entradas por
  `manifest.id` con un `Map`, conservando la versión más alta (`compareVersions`).
  Motivo: al publicar v1.1.0 sin borrar la release v1.0.0, el marketplace mostraba
  la asignatura duplicada. Las releases antiguas se conservan como historial.

## Review
- `gh release view` confirma tag, título y asset subido; v1.1.0 marcada como Latest.
- `npx tsc --noEmit` → exit 0.
- Nota: el repo aparece como `Luissalet/SubjectPacks` (rename de la cuenta `Mlgpigeon`);
  la API de GitHub redirige, así que el registry y los scripts siguen funcionando sin cambios.
- Los que tengan instalada la v1.0.0 (incluido este equipo) verán "actualización disponible"
  en el marketplace; al actualizar se sincroniza la versión local.
