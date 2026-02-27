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
