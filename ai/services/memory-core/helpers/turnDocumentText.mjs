import {createHash} from 'node:crypto';

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

/**
 * @summary Canonicalizes one raw-turn frontier into stable chronological order.
 *
 * Chroma result order is not an input-authority contract. Sorting by the stored turn timestamp
 * with id as the deterministic tie-breaker makes equivalent frontiers byte-stable across
 * retrieval permutations while retaining chronological model context.
 *
 * @param {Object} input
 * @param {String[]} input.ids Chroma turn ids.
 * @param {Array.<String|null>} input.documents Stored turn documents.
 * @param {Object[]} input.metadatas Turn metadata.
 * @returns {{ids:String[],documents:String[],metadatas:Object[]}}
 */
export function canonicalizeSessionTurnInput({ids, documents, metadatas} = {}) {
    if (!Array.isArray(ids) || !Array.isArray(documents) || !Array.isArray(metadatas)) {
        throw new TypeError('Session turn input requires ids, documents, and metadatas arrays.');
    }
    if (ids.length !== documents.length || ids.length !== metadatas.length) {
        throw new TypeError('Session turn input arrays must have equal lengths.');
    }

    const resolveTimestamp = metadata => {
        const value   = metadata?.timestamp ?? metadata?.createdAt;
        const numeric = Number(value);

        if (Number.isFinite(numeric)) return numeric;

        const parsed = Date.parse(value);

        return Number.isFinite(parsed) ? parsed : 0;
    };
    const turns = ids.map((id, index) => {
        const metadata = metadatas[index] || {};
        const document = resolveTurnDocumentForRead({
            documents: [documents[index]],
            metadata
        });

        if (typeof id !== 'string' || !id) {
            throw new TypeError(`Session turn input requires a non-empty id at index ${index}.`);
        }
        if (typeof document !== 'string') {
            throw new TypeError(`Session turn input requires canonical document text at index ${index}.`);
        }

        return {id, document, metadata, timestamp: resolveTimestamp(metadata)};
    }).sort((a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id));

    return {
        ids      : turns.map(turn => turn.id),
        documents: turns.map(turn => turn.document),
        metadatas: turns.map(turn => turn.metadata)
    };
}

/**
 * @summary Computes the deterministic revision of one ordered raw-turn input frontier.
 *
 * The revision binds every turn's stable Chroma id, canonical document text, and identity
 * boundary. A count-only marker would collide when one turn is replaced by another; hashing the
 * exact ordered envelope lets SessionService publish the input it observed and DreamService
 * independently attest the raw snapshot it actually processed. Stored and reconstructed forms of
 * the same canonical turn document intentionally produce the same revision.
 *
 * @param {Object} input
 * @param {String[]} input.ids Ordered Chroma turn ids.
 * @param {Array.<String|null>} input.documents Ordered stored turn documents.
 * @param {Object[]} input.metadatas Ordered turn metadata.
 * @returns {String} Versioned SHA-256 revision.
 */
export function computeSessionTurnInputRevision({ids, documents, metadatas} = {}) {
    const canonical = canonicalizeSessionTurnInput({ids, documents, metadatas});
    const turns     = canonical.ids.map((id, index) => {
        const metadata = canonical.metadatas[index];
        return {
            id,
            document     : canonical.documents[index],
            agentIdentity: metadata.agentIdentity ?? null,
            sessionId    : metadata.sessionId ?? null,
            userId       : metadata.userId ?? null
        };
    });

    const digest = createHash('sha256')
        .update(JSON.stringify({version: 1, turns}), 'utf8')
        .digest('hex');

    return `sha256:${digest}`;
}
