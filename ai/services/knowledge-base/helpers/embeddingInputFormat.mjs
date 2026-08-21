/**
 * @summary The single authority for the string a knowledge chunk presents to an embedding provider.
 *
 * Pure and Neo-free so every consumer — the vector service that calls the provider, the ingestion
 * guardrail that measures the input before invoking it, and the byte-budget planner that decides
 * where to split — reads one definition rather than a copy of it. The copies are what failed:
 * two services each restated the format and a planner restated it a third time, so the guardrail
 * measured one string while the provider received another.
 *
 * This module also owns the format's **identity** ({@link EMBEDDING_INPUT_FORMAT_ID}), because a
 * vector is only interpretable against the string it was built from, and the row that stores the
 * vector has to be able to say which string that was.
 *
 * @module ai/services/knowledge-base/helpers/embeddingInputFormat
 */

import crypto from 'node:crypto';

/**
 * @summary Builds the leading identification line of a chunk's provider input.
 *
 * **Contract: `type` first, `kind` as fallback.** The published chunk schema
 * (`../parser/parsed-chunk-v1.schema.json`) requires `kind` and declares no `type`, so a chunk from
 * any parser written against it must be named by `kind`. Where BOTH exist they are different facts,
 * not synonyms: the in-repo parsers set `type` to the corpus bucket (`src` / `app` / `example`) and
 * `kind` to the chunk shape (`method`, `class-config`). Preferring `kind` would therefore rename the
 * header of every chunk that already carries a `type`.
 *
 * That rename would be undetectable rather than merely disruptive, which is why the order is a
 * contract and not a preference: this string is DERIVED and is not a member of a chunk's `hashInputs`,
 * so it does not participate in the chunk id. Re-ingestion would not re-embed the affected rows —
 * existing rows would keep vectors built from the old string while new rows carried the new one, with
 * no reconciliation signal able to tell them apart.
 *
 * Consequently: changing this format at all is a corpus-level decision, not a formatting choice.
 *
 * @param {Object} chunk Parsed knowledge chunk.
 * @returns {String} The header line, including its trailing newline.
 */
export function buildEmbeddingInputHeader(chunk) {
    return `${chunk.type || chunk.kind}: ${chunk.name} in ${chunk.className || ''}\n`;
}

/**
 * @summary Builds the full provider input string: the header followed by the chunk's body.
 *
 * The header is a genuine prefix, which is what lets the byte-budget planner size a split by
 * measuring {@link buildEmbeddingInputHeader} instead of restating its template.
 *
 * @param {Object} chunk Parsed knowledge chunk.
 * @returns {String} Provider input text.
 */
export function buildEmbeddingInputText(chunk) {
    return `${buildEmbeddingInputHeader(chunk)}${chunk.description || chunk.content || ''}`;
}

/**
 * @summary Chunks that exercise every branch the format has, so the identity below cannot miss one.
 *
 * The digest is only as sensitive as this set: a branch no probe reaches can change without changing
 * the identity, which would leave rows claiming a format they were not built from. So each entry
 * exists for a named branch rather than for coverage in general —
 *
 * 1. `kind` alone, the schema-conforming shape (`parsed-chunk-v1` requires `kind`, declares no `type`);
 * 2. `type` present alongside `kind`, which is the type-first contract and the branch whose reversal
 *    silently renamed every header once already;
 * 3. no `className`, the empty-string fallback;
 * 4. `description` present alongside `content`, which is the description-first body branch;
 * 5. neither body field, the second empty-string fallback.
 *
 * @type {Object[]}
 */
const FORMAT_PROBE_CHUNKS = Object.freeze([
    {kind: 'method', name: 'probeA', className: 'ProbeClass', content: 'probe body'},
    {kind: 'method', name: 'probeA', className: 'ProbeClass', content: 'probe body', type: 'src'},
    {kind: 'class-config', name: 'probeB', content: 'probe body'},
    {kind: 'method', name: 'probeC', className: 'ProbeClass', content: 'probe body', description: 'probe description'},
    {kind: 'method', name: 'probeD', className: 'ProbeClass'}
]);

/**
 * @summary The row-metadata field that carries {@link EMBEDDING_INPUT_FORMAT_ID}.
 *
 * Exported from here rather than from the writer, so the writer and every reader name the field
 * once. A detector that hardcoded its own spelling would report zero affected rows against a
 * correctly-written corpus — a false clean bill, which on this lane is the worst available failure
 * because it reads as verification.
 *
 * Prefixed to keep it out of the parsed-chunk namespace: `buildChunkMetadata` copies every chunk
 * field, so an unprefixed name could collide with a future schema field and be silently overwritten
 * by content.
 * @type {String}
 */
export const EMBEDDING_INPUT_FORMAT_METADATA_KEY = 'kbEmbeddingInputFormat';

/**
 * @summary The stored identity of the current provider-input format.
 *
 * **Why a row needs this at all.** The provider input is DERIVED and is not a member of a chunk's
 * `hashInputs`, so changing the format does not change any chunk id: re-ingestion recomputes the same
 * id, finds the row present, and skips it. The stale vector stays, and nothing on disk distinguishes
 * it from a correct one — same id, same content, same metadata. Storing the format's identity beside
 * the vector is what makes that difference observable, and **absence of this field is itself the
 * discriminator**: every row written before the field existed simply lacks it.
 *
 * **Why it is derived rather than declared.** A hand-maintained literal can be forgotten, and the
 * cost of forgetting is silent — rows would claim a format they were not built from, which is worse
 * than no marker at all because it reads as verified. Hashing the format's own output over
 * {@link FORMAT_PROBE_CHUNKS} removes the whole class of "format changed, identity did not" **for
 * every branch that set reaches** — which is what a derived identity can honestly buy, and it is
 * strictly more than a hand-maintained literal offers. It is not unconditional: per the probe set's
 * own contract above, a branch no probe exercises can change without changing the identity, so
 * adding a branch to the format means adding a probe for it in the same change. Incidental edits
 * that do not change any produced string correctly leave the identity alone.
 *
 * The human-readable prefix is kept so an operator reading row metadata sees a family rather than
 * only a hex string; the suffix is what carries the guarantee. Truncated to 12 hex characters
 * because this is change-detection, not a security boundary, and the field is written on every row.
 *
 * `node:crypto` is a platform builtin rather than a Neo dependency, so the module's Neo-free
 * property is intact; the digest is computed once at load from frozen literals, so it stays pure.
 *
 * @type {String}
 */
export const EMBEDDING_INPUT_FORMAT_ID = `kb-embed-input-v1-${
    crypto.createHash('sha256')
        // NUL-joined, and the separator is load-bearing: a format change that only moved text
        // across the boundary between two probe outputs would leave a plain concatenation
        // byte-identical. Written as an escape, never as a raw control byte — a literal NUL in
        // source makes the file binary to grep and invisible in review.
        .update(FORMAT_PROBE_CHUNKS.map(buildEmbeddingInputText).join('\u0000'))
        .digest('hex')
        .slice(0, 12)
}`;
