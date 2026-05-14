/**
 * @module ai/services/github-workflow/shared/chunkPath
 *
 * @deprecated Per ADR 0004 §2.3, ID-range chunking is RETIRED in favor of the universal
 * ordinal-100 primitive in `./contentPath.mjs`. This helper is preserved as a thin
 * backward-compatibility shim during Lane B (#TBD) call-site migration only. After Lane B
 * lands and `IssueSyncer` / `LocalFileService` / sibling consumers no longer import this file,
 * remove the file entirely as part of the clean-slate migration (ADR 0004 §3.6 / Task 10).
 *
 * **Why not a re-export?** `contentPath(itemIndex)` is ordinal-based (zero-based position within
 * a planned bucket); `chunkPath(number)` is ID-range-based (last-2-digits-truncated `<NNN>xx`
 * shape). The output strings cannot be cross-derived without breaking call-site contracts.
 * Therefore the implementation stays as-is; only the documentation flags it as retired.
 *
 * @see ADR 0004 §2.3 (`learn/agentos/decisions/0004-github-content-architecture.md`)
 * @see ai/services/github-workflow/shared/contentPath.mjs (replacement primitive)
 * @see #11379 (Lane A consolidation ticket)
 * @see #11372 (parent epic)
 */

/**
 * @deprecated Use `contentPath({contentRoot, type, filename, itemIndex})` instead. Active-tier
 * ID-range chunking is RETIRED per ADR 0004 §2.3.
 *
 * @param {Number} number GitHub identifier
 * @returns {String} ID-range chunk folder name (e.g. `'111xx'` for `11190`)
 */
export default function chunkPath(number) {
    return String(number).padStart(4, '0').slice(0, -2) + 'xx';
}
