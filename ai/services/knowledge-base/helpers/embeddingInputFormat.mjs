/**
 * @summary The single authority for the string a knowledge chunk presents to an embedding provider.
 *
 * Pure and Neo-free so every consumer — the vector service that calls the provider, the ingestion
 * guardrail that measures the input before invoking it, and the byte-budget planner that decides
 * where to split — reads one definition rather than a copy of it. The copies are what failed:
 * two services each restated the format and a planner restated it a third time, so the guardrail
 * measured one string while the provider received another.
 *
 * @module ai/services/knowledge-base/helpers/embeddingInputFormat
 */

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
