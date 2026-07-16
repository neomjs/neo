/**
 * @module ai/services/memory-core/helpers/birdViewCitations
 * @summary The source-agnostic citation grammar shared by every Bird View: manifest identity, the
 * drill-down descriptor, and the provenance fingerprint.
 *
 * A Bird View answers a question a peer would otherwise answer by hand, so every claim it makes has to
 * be traceable back to the record that supports it. These primitives are what make that traceable: a
 * stable manifest identity per source, a bounded drill-down descriptor a caller can actually invoke, and
 * a fingerprint of exactly which sources fed a synthesis.
 *
 * They live here rather than beside any one view because the grammar is genuinely source-agnostic —
 * temporal views key their answer to a window, the current-state view keys its to a capture time, and
 * neither difference reaches the citation shape. A consumer reading all three self-awareness slots
 * should not have to learn three citation vocabularies, and duplicating the drill-down bounds per view
 * would let them drift apart silently.
 */

/**
 * @summary Resolves the explicit, content-sensitive manifest identity for one source.
 *
 * Source ids remain the backward-compatible identity when an adapter has no revision signal. Adapters that
 * can observe content revisions may provide either a precomputed `manifestKey` or a scalar `revision`; those
 * values are combined with the id so a content change invalidates the manifest without serializing arbitrary
 * source payloads into the hash contract.
 * @param {Object} source
 * @returns {String|null}
 */
export function getSourceManifestKey(source) {
    if (!source?.id) return null;

    const {id, manifestKey, revision} = source;

    if (typeof manifestKey === 'string' || typeof manifestKey === 'number' && Number.isFinite(manifestKey)) {
        return `${id}\0manifest:${manifestKey}`
    }

    if (typeof revision === 'string' || typeof revision === 'number' && Number.isFinite(revision)) {
        return `${id}\0revision:${revision}`
    }

    return String(id)
}

/**
 * @summary Returns a JSON-safe copy of a drill-down argument value, or `undefined` when unsupported.
 *
 * Drill-down arguments are transport data, never an escape hatch for copying an arbitrary source object into
 * a citation. Only JSON primitives, arrays, and plain records survive; functions, class instances, symbols,
 * non-finite numbers, and cyclic structures are rejected.
 * @param {*} value
 * @param {Set<Object>} [seen]
 * @returns {*|undefined}
 */
export function copyJsonValue(value, seen = new Set()) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;

    if (Array.isArray(value)) {
        if (seen.has(value)) return undefined;
        seen.add(value);

        const projected = value.map(item => copyJsonValue(item, seen));
        seen.delete(value);

        return projected.some(item => item === undefined) ? undefined : projected
    }

    if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
        if (seen.has(value)) return undefined;
        seen.add(value);

        const projected = {};
        for (const [key, item] of Object.entries(value)) {
            if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
                seen.delete(value);
                return undefined
            }

            const copied = copyJsonValue(item, seen);

            if (copied === undefined) {
                seen.delete(value);
                return undefined
            }

            projected[key] = copied
        }

        seen.delete(value);
        return projected
    }

    return undefined
}

/**
 * @summary Projects the one source-agnostic drill-down descriptor shape admitted into citations.
 * @param {*} value
 * @returns {{operation: String, arguments: Object}|null}
 */
export function projectDrillDown(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
        typeof value.operation !== 'string' || value.operation.length === 0 || value.operation.length > 128 ||
        !value.arguments || typeof value.arguments !== 'object' || Array.isArray(value.arguments)) {
        return null
    }

    const args = copyJsonValue(value.arguments);

    return args === undefined || JSON.stringify(args).length > 4096
        ? null
        : {operation: value.operation, arguments: args}
}

/**
 * @summary Deterministic FNV-1a manifest hash over the sorted source manifest keys.
 *
 * This is a change-detection fingerprint of exactly which sources fed a synthesis (provenance / cache
 * comparison), not a cryptographic digest — order-independent (keys are sorted first) so the same source set
 * and revisions always hash identically regardless of retrieval order.
 * @param {Object[]} sources
 * @returns {String} 8-hex-char manifest hash.
 */
export function hashSourceManifest(sources) {
    // JSON framing makes the member boundaries unambiguous. A newline join lets one adversarial revision
    // impersonate two manifest members (`a@"x\\nb..."`), even before considering normal FNV collisions.
    const joined = JSON.stringify(sources.map(getSourceManifestKey).filter(Boolean).sort());
    let   hash   = 0x811c9dc5;

    for (let i = 0; i < joined.length; i++) {
        hash ^= joined.charCodeAt(i);
        hash  = Math.imul(hash, 0x01000193) >>> 0
    }

    return hash.toString(16).padStart(8, '0')
}
