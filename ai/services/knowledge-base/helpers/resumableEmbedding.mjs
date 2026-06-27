/**
 * @module ai/services/knowledge-base/helpers/resumableEmbedding
 * @summary Pure helpers for resumable KB shadow-swap embedding — the fix for the all-or-nothing rebuild
 * that loses ALL embedding progress when a single batch fails (a transient provider blip costing a full
 * re-embed of the corpus). The shadow collection that holds the completed batches is preserved across runs
 * and resumed into: these pure helpers decide (a) whether a preserved resume-shadow is valid for the CURRENT
 * corpus (the fingerprint guard — never resume into a drifted corpus), and (b) which chunks still need
 * embedding (the resume-skip). The Chroma I/O (read existing IDs, preserve/promote the shadow) is the
 * VectorService wiring's concern; THIS is the placement-independent, fully-testable decision.
 */

import crypto from 'crypto';

/**
 * @summary Deterministic fingerprint of a corpus's chunk-ID set — the resume-shadow validity key.
 *
 * A resume-shadow built for one corpus must NOT be resumed into for a drifted corpus (added/removed chunks),
 * or the promoted collection would carry stale rows. The fingerprint is order-independent (sorted unique IDs)
 * so re-deriving it for the same corpus is stable.
 *
 * @param {Object[]} chunks Tenant-stamped chunks each carrying a string `.id`.
 * @returns {String} sha256 hex of the sorted unique chunk IDs.
 */
export function computeCorpusFingerprint(chunks) {
    const ids = [...new Set(
        (Array.isArray(chunks) ? chunks : [])
            .map(chunk => chunk?.id)
            .filter(id => typeof id === 'string' && id.length > 0)
    )].sort();

    return crypto.createHash('sha256').update(ids.join('\n')).digest('hex');
}

/**
 * @summary Selects the chunks NOT yet embedded into a resumed shadow collection (the resume-skip).
 *
 * Given the IDs already present in the preserved resume-shadow, return only the remaining chunks to embed
 * plus the count already done. A fresh run (empty `existingIds`) returns every chunk — so the same code path
 * serves both the from-scratch build and the resume.
 *
 * @param {Object} options
 * @param {Object[]} options.chunks The full current-corpus chunks (each with a string `.id`).
 * @param {Set<String>|String[]} [options.existingIds] IDs already embedded in the resume-shadow.
 * @returns {{remaining: Object[], alreadyEmbedded: Number}} remaining chunks to embed + count already present.
 */
export function selectResumableChunks({chunks, existingIds} = {}) {
    const present = existingIds instanceof Set
        ? existingIds
        : new Set(Array.isArray(existingIds) ? existingIds : []);

    const all       = Array.isArray(chunks) ? chunks : [];
    const remaining = all.filter(chunk => !present.has(chunk?.id));

    return {remaining, alreadyEmbedded: all.length - remaining.length};
}

/**
 * @summary Decides whether a preserved resume-shadow may be resumed for the current corpus.
 *
 * Resume only when a resume-shadow exists AND its stamped fingerprint matches the current corpus AND the
 * resume-attempt cap has not been exhausted (a persistently-failing chunk must eventually fall back to a
 * clean rebuild rather than resume forever). Fail-safe: any uncertainty → rebuild fresh (never resume into
 * stale or runaway state).
 *
 * @param {Object} options
 * @param {Object|null} [options.resumeState] Preserved marker `{fingerprint, attempts}` or null if none.
 * @param {String} options.currentFingerprint Fingerprint of the current corpus.
 * @param {Number} [options.maxAttempts=3] Resume attempts before a forced clean rebuild.
 * @returns {{resume: Boolean, reason: String, attempts: Number}} resume decision + the next attempt number.
 */
export function decideResume({resumeState, currentFingerprint, maxAttempts = 3} = {}) {
    if (!resumeState || typeof resumeState !== 'object') {
        return {resume: false, reason: 'no-resume-shadow', attempts: 1};
    }
    if (resumeState.fingerprint !== currentFingerprint) {
        return {resume: false, reason: 'corpus-drift', attempts: 1};
    }

    const priorAttempts = Number.isInteger(resumeState.attempts) && resumeState.attempts > 0 ? resumeState.attempts : 1;

    if (priorAttempts >= maxAttempts) {
        return {resume: false, reason: 'attempt-cap-exhausted', attempts: 1};
    }

    return {resume: true, reason: 'fingerprint-match', attempts: priorAttempts + 1};
}
