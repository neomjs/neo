/**
 * @summary Natural-key identity contract for Knowledge Base merge imports.
 *
 * The Knowledge Base chunk id is a **content digest** — `DatabaseService.createContentHash` hashes
 * `tenantId`, `repoSlug`, `type`, `name`, `description`, `content`, `extends`, `configType`,
 * `params` and `returns`. So id-equality means *the hashed content is unchanged*, never *same
 * entity*: change a chunk's content, or change how any hashed field is derived, and the same logical
 * chunk acquires a new id.
 *
 * That makes an id-keyed merge structurally unable to work on this substrate. It cannot distinguish
 * "same chunk, changed content" from "different chunk" — the two are indistinguishable at the id
 * layer by construction — so a blind upsert silently produces logical duplicates, each carrying
 * contradictory metadata for the same symbol.
 *
 * The **sibling Memory Core path is correct to preflight ids**, because its ids are identities. Giving
 * this substrate the same id-keyed preflight would skip the id-matching rows and insert every
 * divergent one as a duplicate — the same defect with diligence in front of it. Symmetry between two
 * substrates whose ids mean different things is the trap, not the fix.
 *
 * So identity here is a **natural key**: the tuple that names an entity independently of its content.
 * A natural key present on both sides under differing ids means the bundle and the live code no
 * longer derive identity the same way, which is a regression signal about the *code* rather than a
 * merge detail — and the strongest available evidence of a derivation bug. It is worth refusing over.
 *
 * **The key is deliberately sufficient for detection and NOT for resolution.** Measured across 17,002
 * rows it leaves 31 colliding keys (45 extra rows, 0.26%), because `name` is synthesized and collapses
 * distinct computed members onto one label — `src/collection/Filter.mjs - [computed]()` occurs 16
 * times. Adding `line_start` nearly closes it and defeats the purpose, since line numbers shift on any
 * edit and this key exists to compare across versions. A 0.26% ambiguity rate is immaterial when
 * flagging divergences for a human and unacceptable as the basis for deciding which row wins, so this
 * module detects and refuses; it never picks a winner.
 */

/**
 * The tuple that names a chunk independently of its content, in a fixed order.
 * @member {String[]} NATURAL_KEY_FIELDS
 */
export const NATURAL_KEY_FIELDS = Object.freeze(['tenantId', 'repoSlug', 'source', 'name', 'type']);

/**
 * Thrown when a merge bundle and the live collection disagree on how identity is derived.
 * @member {String} KB_MERGE_NATURAL_KEY_DIVERGENCE
 */
export const KB_MERGE_NATURAL_KEY_DIVERGENCE = 'KB_MERGE_NATURAL_KEY_DIVERGENCE';

/**
 * States the divergence scan can report, so a receipt can distinguish "scanned and clean" from
 * "never scanned". A `0` divergence count means nothing without knowing which of the two it was.
 * @member {Object} DIVERGENCE_SCAN
 */
export const DIVERGENCE_SCAN = Object.freeze({
    performed         : 'performed',
    skippedEmptyTarget: 'skipped-empty-target',
    skippedReplaceMode: 'skipped-replace-mode'
});

/**
 * Field-encoding tags. A field is emitted as `[ABSENT]`, `[NULL]`, or `[STRING, value]`, which keeps
 * the three cases structurally disjoint so no string value can impersonate an absence.
 * @member {Object} KEY_FIELD_TAGS
 */
export const KEY_FIELD_TAGS = Object.freeze({ABSENT: 0, NULL: 1, STRING: 2});

/**
 * @summary Derives a chunk's natural key as an injective string.
 *
 * Two properties, and both are correctness requirements rather than style:
 *
 * 1. **`JSON.stringify` of an array, not a delimiter join.** `source` is a filesystem path and `name`
 *    is synthesized prose carrying arbitrary punctuation, so any single-character delimiter appears
 *    inside real values: `source: 'src/a'` + `name: 'b-c'` and `source: 'src/a-b'` + `name: 'c'`
 *    frame identically under `join('-')`.
 * 2. **Type-tagged fields, not sentinel strings.** This previously encoded absence and null as
 *    reserved strings, which is injective only until a row's metadata literally contains one of them
 *    — at which point two different rows frame to the same key. A key collision silently merges two
 *    distinct entities, which is the exact failure this module exists to prevent, reintroduced by its
 *    own encoding. Tagging removes the reserved-value class entirely: there is no string a caller can
 *    put in `source` or `name` that collides with an absence.
 *
 * @param {Object} row     A backup row (`{id, metadata}`) or a bare metadata object.
 * @returns {String}       Injective natural-key string.
 */
export function naturalKeyOf(row) {
    const metadata = row?.metadata ?? row ?? {};

    return JSON.stringify(NATURAL_KEY_FIELDS.map(field => {
        const value = metadata[field];

        if (value === undefined) return [KEY_FIELD_TAGS.ABSENT];
        if (value === null)      return [KEY_FIELD_TAGS.NULL];

        return [KEY_FIELD_TAGS.STRING, String(value)];
    }));
}

/**
 * @summary Renders an encoded natural key back to human-readable field values.
 *
 * Lives beside the encoder on purpose: the refusal message reads these positions, so an encoding
 * change that skipped this function would produce a diagnostic full of `[2,"…"]` fragments — the
 * message being the only part of a fail-loud guard an operator actually consumes.
 *
 * @param {String} key Output of {@link naturalKeyOf}.
 * @returns {String[]} One display string per field, in `NATURAL_KEY_FIELDS` order.
 */
export function decodeNaturalKey(key) {
    return JSON.parse(key).map(([tag, value]) => {
        if (tag === KEY_FIELD_TAGS.ABSENT) return '<absent>';
        if (tag === KEY_FIELD_TAGS.NULL)   return '<null>';

        return value;
    });
}

/**
 * @summary Indexes live rows by natural key so incoming rows can be compared against them.
 *
 * @param {Object[]} rows  Live rows, each `{id, metadata}`.
 * @returns {Map<String, Set<String>>} natural key → the set of live ids carrying it.
 */
export function indexByNaturalKey(rows) {
    const index = new Map();

    for (const row of rows) {
        const key = naturalKeyOf(row);
        let   ids = index.get(key);

        if (!ids) {
            ids = new Set();
            index.set(key, ids);
        }

        ids.add(row.id);
    }

    return index;
}

/**
 * @summary Classifies one incoming row against the live index.
 *
 * Three outcomes, and the middle one is why a receipt needs more than a total: an incoming row whose
 * id is already live carries unchanged hashed content, so counting it as an import overstates what
 * the run did.
 *
 * `'id-already-present'`, not `'overwritten-identical'`. The id is a digest over content plus hashed
 * fields and does **not** cover the embedding vector or metadata outside the hash input, so a
 * matching id proves the hashed content is unchanged and proves nothing about the row as stored —
 * two rows can share an id and carry different vectors. The row is also still upserted, so "identical"
 * described both a stronger guarantee and a skip that does not happen.
 *
 * @param {Object}                     options
 * @param {Object}                     options.row       Incoming row `{id, metadata}`.
 * @param {Map<String, Set<String>>}   options.liveIndex Output of `indexByNaturalKey`.
 * @param {Set<String>}                options.liveIds   Every live id, for the id-presence check.
 * @returns {{outcome: String, key: String, liveIds: String[]}}
 *          `outcome` is `'id-already-present'`, `'natural-key-divergent'` or `'inserted'`.
 */
export function classifyIncomingRow({row, liveIndex, liveIds}) {
    const key = naturalKeyOf(row);

    // Order matters. An id already live means the hashed content is unchanged, so it is not a
    // divergence even though its natural key is present too — checking divergence first would
    // misreport every correct re-run as a derivation regression and fire the guard on a clean merge.
    if (liveIds.has(row.id)) {
        return {outcome: 'id-already-present', key, liveIds: [row.id]};
    }

    const existing = liveIndex.get(key);

    if (existing && existing.size > 0) {
        return {outcome: 'natural-key-divergent', key, liveIds: [...existing]};
    }

    return {outcome: 'inserted', key, liveIds: []};
}

/**
 * @summary Refuses the merge when the bundle and live code derive identity differently.
 *
 * Refusal is the safe state and it fires before any write: proceeding would create logical
 * duplicates that share `{tenantId, repoSlug}` with their twins, which puts them inside kbSync's
 * stale-deletion scope — so the duplication would not stay visible as duplication, it would resolve
 * later as a mass-deletion event.
 *
 * @param {Object}   options
 * @param {Object[]} options.divergent       Entries `{id, key, liveIds}`.
 * @param {Number}  [options.sampleLimit=5]  How many colliding keys to name in the message.
 * @throws {Error}   With `code = KB_MERGE_NATURAL_KEY_DIVERGENCE` when `divergent` is non-empty.
 */
export function assertNoNaturalKeyDivergence({divergent, sampleLimit = 5}) {
    if (!divergent || divergent.length === 0) {
        return;
    }

    const sample = divergent.slice(0, sampleLimit).map(entry => {
        const [tenantId, repoSlug, source, name, type] = decodeNaturalKey(entry.key);

        return `  ${type} "${name}" in ${source} (${tenantId}/${repoSlug}) — bundle id ${entry.id.slice(0, 12)}…, live id ${entry.liveIds[0]?.slice(0, 12)}…`;
    }).join('\n');

    const error = new Error(
        `Knowledge Base merge refused: ${divergent.length} chunk(s) share a natural key with a live row ` +
        `under a DIFFERENT id. The Knowledge Base id is a content digest, so this means the bundle and ` +
        `the live code no longer derive chunk identity the same way — a regression in derivation, not a ` +
        `merge detail. Proceeding would upsert each of them as a logical duplicate carrying contradictory ` +
        `metadata for the same symbol.\n\n` +
        `Divergent sample (${Math.min(sampleLimit, divergent.length)} of ${divergent.length}):\n${sample}\n\n` +
        `Nothing was written. Investigate why identity derivation changed — a hash input such as ` +
        `\`extends\` resolving on one side and not the other is the known cause — then re-run. ` +
        `\`--mode replace\` truncates first, so no divergence can exist on that path.`
    );

    error.code      = KB_MERGE_NATURAL_KEY_DIVERGENCE;
    error.divergent = divergent.length;

    throw error;
}
