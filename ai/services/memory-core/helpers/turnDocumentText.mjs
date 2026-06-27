/**
 * @module ai/services/memory-core/helpers/turnDocumentText
 * @summary Single source of the canonical turn-document text — the `User Prompt: … / Agent Thought: … /
 * Agent Response: …` representation derived from a turn memory's split fields.
 *
 * Background: a per-turn memory carries its content BOTH as three split fields
 * (`metadata.prompt` / `metadata.thought` / `metadata.response`) AND as a redundant combined document
 * that is exactly their join. The split fields are the canonical representation; the combined text is pure
 * derivation. This helper IS that derivation, extracted so the format lives in ONE place — used both to
 * BUILD the text for embedding at write time and to RECONSTRUCT it on read once the redundant stored copy
 * is dropped. A reconstruct that did not byte-match the original construction would corrupt any
 * content-fingerprint/hash, so single-sourcing the format is the prerequisite for the de-dup.
 *
 * Pure + deterministic: no I/O, no mutation, no time/randomness. Turns ONLY — a summary memory has a
 * distinct document shape and must NOT be passed through this helper.
 */

/**
 * @summary Composes the canonical turn-document text from a turn's split fields.
 *
 * Byte-identical to the inline construction it single-sources: the three fields are joined with the fixed
 * `User Prompt:` / `Agent Thought:` / `Agent Response:` labels and `\n` separators, in that exact order.
 * Reconstruct-on-read calls this with the SAME stored field values, so the derived document matches the
 * original construction exactly (the property the de-dup relies on). Values are coerced by the template
 * literal exactly as the original did — no added defaults or guards that would diverge the output.
 *
 * @param {Object} fields
 * @param {String} fields.prompt The turn's user prompt.
 * @param {String} fields.thought The agent's thought.
 * @param {String} fields.response The agent's response.
 * @returns {String} The canonical `User Prompt: … \n Agent Thought: … \n Agent Response: …` text.
 */
export function composeTurnDocumentText({prompt, thought, response} = {}) {
    return `User Prompt: ${prompt}\nAgent Thought: ${thought}\nAgent Response: ${response}`;
}

/**
 * @summary Resolves a memory's document text on READ — prefers the stored Chroma document, falling back to
 * reconstructing it from the split metadata fields when the redundant stored copy has been dropped (the
 * field↔document de-dup). A turn memory (`metadata.type === 'agent-interaction'`) reconstructs via
 * {@link composeTurnDocumentText}; a summary (or any non-turn / metadata-less record) has a DISTINCT
 * document shape and is NEVER reconstructed — it returns its stored document or `null`.
 *
 * The stored document, when present, ALWAYS wins (byte-exact, no reconstruction), so existing records are
 * behavior-preserved; reconstruction is the post-migration path for turns whose stored document was dropped.
 * Pure + total (never throws). The turn-vs-summary discriminator lives HERE so every read-path shares it.
 *
 * @param {Object} options
 * @param {Array<String>=} options.documents The Chroma `get` `documents` array (or undefined/empty).
 * @param {Object|null} options.metadata The record metadata (`{type, prompt, thought, response, …}`).
 * @returns {String|null} The document text (stored or reconstructed), or `null` when neither is available.
 */
export function resolveTurnDocumentForRead({documents, metadata} = {}) {
    const stored = Array.isArray(documents) ? documents[0] : undefined;
    if (stored) return stored;

    if (metadata && metadata.type === 'agent-interaction') {
        return composeTurnDocumentText({prompt: metadata.prompt, thought: metadata.thought, response: metadata.response});
    }

    return null;
}
