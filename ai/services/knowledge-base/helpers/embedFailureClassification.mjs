/**
 * @summary Maps an embed failure's provider-side error code into the bounded `KB_*` namespace that
 * durable tenant-repo state and the deployment-state snapshot admit.
 *
 * **The defect this closes is an inversion, not an omission.** Durable sync state accepts only codes
 * matching {@link BOUNDED_KB_ERROR_CODE_PATTERN} — a deliberate credential boundary, because a code
 * shaped `KB_[A-Z0-9_]+` cannot carry a clone URL, a bearer token or provider stderr. Embed failures,
 * however, arrive carrying the *provider's* vocabulary: `EMBEDDING_PROBE_TIMEOUT`, `ABORT_ERR`,
 * `OPENAI_COMPATIBLE_REQUEST_TIMEOUT`. Those are truthy, so the `error.code || 'KB_VECTOR_EMBED_FAILED'`
 * fallback at the ingest boundary never fires; the real code is recorded, then silently dropped by the
 * `^KB_` filter downstream, and `lastSourceErrorCode` lands as **null**.
 *
 * The consequence is backwards: a provider that classifies its failure well produces a receipt with
 * *no* cause, while one that throws a bare `Error` produces at least a stage name. Better upstream
 * classification made the observable strictly worse — which is why this cannot be fixed by widening
 * the filter, only by translating at the boundary.
 *
 * **Why an allow-list and not a sanitizer.** Passing an unrecognised provider code through — even
 * scrubbed — would put provider-controlled text into durable state and onto a remotely-readable
 * surface, which is the exact property the bounded pattern exists to guarantee. Every value this
 * module returns is either a literal declared here or a string that already satisfied the bounded
 * pattern, so the guarantee holds by construction rather than by escaping. An unknown code is
 * therefore reported as unclassified, and teaching this map a new provider code is a deliberate,
 * reviewed act.
 *
 * @module ai/services/knowledge-base/helpers/embedFailureClassification
 */

/**
 * @summary The single definition of a code that may cross into durable tenant-repo state.
 *
 * Owned here because this module is the one place that *produces* codes for that boundary; the
 * orchestrator's sync service imports it rather than re-declaring the literal, so the producer and
 * the filter cannot drift apart into a pair that separately look correct.
 * @type {RegExp}
 */
export const BOUNDED_KB_ERROR_CODE_PATTERN = /^KB_[A-Z0-9_]{1,120}$/;

/**
 * @summary The code meaning **unclassified** — the embed stage failed and the cause was not
 * recognised.
 *
 * It does NOT mean "embedding is broken in some general way", and two deployments reporting it may
 * share nothing but the stage at which they stopped. Reading a shared occurrence of this code as a
 * shared defect is the inference this constant is named to discourage.
 * @type {String}
 */
export const KB_VECTOR_EMBED_UNCLASSIFIED = 'KB_VECTOR_EMBED_FAILED';

/**
 * @summary Provider-vocabulary codes that describe a distinguishable embed fault.
 *
 * Two timeout sources map to different codes on purpose: a consumer-owned deadline expiring
 * (`EMBEDDING_PROBE_TIMEOUT`, raised by our own caller) and the provider's own request timeout are
 * different faults with different fixes — raise our deadline, versus the provider is too slow or
 * wedged. Collapsing them would rebuild the ambiguity this module exists to remove.
 * @type {Object}
 */
const PROVIDER_ERROR_CODE_MAP = Object.freeze({
    ABORT_ERR                        : 'KB_VECTOR_EMBED_ABORTED',
    EMBEDDING_PROBE_TIMEOUT          : 'KB_VECTOR_EMBED_TIMEOUT',
    OPENAI_COMPATIBLE_REQUEST_TIMEOUT: 'KB_VECTOR_EMBED_PROVIDER_TIMEOUT',
    PROVIDER_TIMEOUT                 : 'KB_VECTOR_EMBED_PROVIDER_TIMEOUT'
});

/**
 * @summary Translates one embed failure code into a bounded `KB_*` code, or reports it unclassified.
 *
 * Pure and total: every input yields a value satisfying {@link BOUNDED_KB_ERROR_CODE_PATTERN}, so a
 * caller never has to decide whether the result is safe to persist.
 *
 * @param {String} [code] The failure's own code, in either vocabulary. Absent, empty and non-string
 *     inputs are all unclassified — a codeless provider error is exactly the case the constant names.
 * @returns {String} A bounded `KB_*` code.
 */
export function classifyEmbedFailureCode(code) {
    if (typeof code !== 'string' || code.length === 0) {
        return KB_VECTOR_EMBED_UNCLASSIFIED
    }

    // An already-bounded code passes through untouched: `KB_SYNC_VOLUME_EXCEEDED` and the gitmirror
    // codes are produced by our own layers and are more specific than anything this map could add.
    if (BOUNDED_KB_ERROR_CODE_PATTERN.test(code)) {
        return code
    }

    // Own-property read, not a bare index: a code of `constructor` or `__proto__` would otherwise
    // resolve against Object.prototype and return a function, which is neither bounded nor a string.
    return Object.hasOwn(PROVIDER_ERROR_CODE_MAP, code)
        ? PROVIDER_ERROR_CODE_MAP[code]
        : KB_VECTOR_EMBED_UNCLASSIFIED
}
