/**
 * @module ai/services/memory-core/helpers/resolveRowTimestamp
 * @summary Projects a stored Chroma-metadata `timestamp` without letting one bad row fail the call.
 *
 * `Date#toISOString()` raises `RangeError: Invalid time value` on an Invalid Date. Every Memory Core
 * result projection calls it once per row *inside* a result map, where the surrounding method-level
 * `catch` escalates a single row's defect into a whole-call error and discards every well-formed
 * co-resident row. A per-record data condition becomes a per-call outage.
 *
 * The exposure is not uniform across read paths. An id-scoped list projects a bounded, caller-named
 * slice, while a semantic query is width-amplified — `StorageRouter.injectQueryReRanker` widens Pass 1
 * threefold and additive-policy reads widen again — so a caller asking for one result still projects
 * several and reaches an arbitrary row nearly every time. The query arm is where this defect surfaces
 * first; the list arm carries the same hole with a narrower reach.
 *
 * Callers preserve the row with a `null` timestamp and count it, never dropping it: a silent skip
 * trades a visible outage for invisible under-retrieval, which is strictly harder to detect than the
 * failure it replaces.
 */

/**
 * @summary Resolves a row's stored `timestamp` metadata to ISO-8601, or `null` when unprojectable.
 *
 * Absent and unparseable collapse to the same outcome deliberately: neither is projectable, and
 * distinguishing them would imply a guarantee the stored metadata cannot make.
 *
 * Note the asymmetry with `null`: `new Date(null)` is epoch 0, not an Invalid Date, so a null-valued
 * timestamp projects as 1970 rather than counting as unprojectable. That is pre-existing behavior,
 * preserved deliberately — narrowing it would change output for already-stored rows, which is a
 * corpus-data decision rather than part of this throw-safety contract.
 *
 * @param {Object} metadata Chroma metadata row.
 * @returns {String|null} ISO-8601 timestamp, or `null` when the stored value is absent/unparseable.
 */
export function resolveRowTimestamp(metadata) {
    const parsed = new Date(metadata?.timestamp);

    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}
