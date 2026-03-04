# Lessons Learned

## 2026-02-27 — Global bank sync duplicates ALL questions on every Dashboard reload

**Pattern:** `mergeGlobalBank()` compared the `contentHash` stored in `global-bank.json` directly against the hashes in IndexedDB. If the hashing algorithm changed (e.g., `topicKey` removed from hash inputs, `correctOptionIds` resolved to normalized texts), **every single hash mismatched** → all 857 questions re-inserted on every Dashboard mount → count doubled from ~857 to ~1687.

**Root causes (3):**
1. `global-bank.json` itself contained 830 duplicates from a previous broken sync, plus 23 fake placeholder hashes from external generation
2. `mergeGlobalBank()` trusted the stored `contentHash` from the JSON instead of recomputing with the current algorithm
3. `syncGlobalBank()` in the Zustand store ignored the `force` parameter and `globalBankSyncedAt` timestamp — ran full sync on EVERY Dashboard mount

**Fixes applied:**
1. Recomputed ALL hashes in `global-bank.json` with current `computeContentHash` algorithm and deduplicated (1687 → 857 questions)
2. Changed `mergeGlobalBank()` to ALWAYS recompute the hash via `computeContentHash(q)` before dedup — never trust stored hashes
3. Changed `syncGlobalBank()` to check `settings.globalBankSyncedAt` and skip if already synced (unless `force=true`)
4. Added re-entry guard in `importContributionPack()` and `importing` loading state in Settings UI

**Rules:**
- Never compare hashes from different sources without recomputing them with the same algorithm
- Idempotent sync functions must actually be idempotent — check "already synced" timestamps
- Static data files (JSON banks) must be deduplicated and have correct hashes before shipping
- When diagnosing duplication bugs, always check: (a) is the dedup key stable across algorithm versions? (b) does the sync run more often than intended?

## 2026-03-02 — Gist sync duplicates subjects and questions across devices

**Pattern:** `mergeBackup()` in `gistSync.ts` used only UUID-based matching (`mergeTable` with `id` as PK). Since each device generates its own UUIDs, the same subject/topic/question created on two devices has different IDs → both added as "new" → everything duplicated on every sync.

**Root cause:** `mergeTable()` was a generic function that only matched by `id`. Unlike `globalBank.ts` which deduplicates by content (slug for subjects/topics, contentHash for questions), gist sync had no content-based deduplication.

**Fixes applied:**
1. Subjects: dedup by `slugify(name)` — if same slug exists, map remote ID → local ID
2. Topics: dedup by `slugify(subjectName)::slugify(title)` composite key
3. Questions: dedup by `contentHash` (recomputed with current algorithm)
4. Key Concepts: dedup by `contentHash`
5. All dependent tables (sessions, exams, deliverables, gradingConfigs, pdfAnchors): remap foreign keys (subjectId, topicId) using the ID maps built during subject/topic merge
6. Stats merge: when duplicate question found, merge stats taking highest values (most progress)
7. Local-only fields preserved: examDate, allowsNotes (subjects), notes, starred (questions)

**Rules:**
- Device sync must NEVER rely solely on UUID matching — different devices generate different UUIDs for the same logical entity
- Always use content-based identity (slugs, hashes) for cross-device deduplication
- When merging entities with parent-child relationships, build ID remapping maps and apply them to all child records
- Stats should be merged (max of each field), not overwritten — user progress must never be lost
- When introducing ID remapping, audit ALL consumers of those IDs — including PDF manifests, file storage keys, and any other path that references entity IDs outside the DB merge functions

## 2026-03-04 — Background WAV synthesis not triggered for resource PDFs + crash on re-entry

**Pattern:** Exiting listen mode while generating WAV for a resource PDF (Otros recursos) did not transfer synthesis to background. Re-entering caused a crash. The resource list never showed a loading spinner.

**Root causes (3):**
1. `PdfListenMode` cleanup checked `topicId` before calling `enqueueSynthesis()`, but in resource mode `topicId` is `undefined` from `useParams` → background synthesis never enqueued
2. `ResourceWavStatusIcon` only checked cache status (cached/not cached). Unlike `WavStatusIcon` for topics, it did NOT receive `synthesisJobs` from the store and never showed a spinner for active synthesis
3. `piperTts.synthesizeToBlob()` had no serialization — if `backgroundSynthesis` and `audioTtsEngine` called `session.predict()` concurrently (e.g., re-entering listen mode while background job running), the Piper WASM session crashed

**Fixes applied:**
1. Changed cleanup condition from `topicId` to `topicId ?? resourceFile` — resource mode now correctly enqueues background synthesis using `resourceFile` as identifier
2. Added `synthesisJobs` prop to `ResourceWavStatusIcon` and `ResourcesTab`, matching the pattern already used by `WavStatusIcon` for topics — now shows spinner with percentage
3. Added a promise-based mutex (`_synthLock`) in `piperTts.ts` to serialize all `synthesizeToBlob()` calls — prevents concurrent `session.predict()` crashes

**Rules:**
- When a feature works for one entity type (topics), audit that it also works for all other entity types (resources) that share the same code path
- Singleton resources (WASM sessions, DB connections) must have serialization guards if accessed from multiple async flows (foreground engine + background manager)
- Status icons for background processes must always check the active jobs store, not just the final cached state — otherwise the user sees no feedback during processing
- When `useParams` provides an optional value, never use it as a required guard without a fallback for the alternative mode
