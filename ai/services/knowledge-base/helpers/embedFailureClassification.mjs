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
 * surface, which is the exact property the bounded pattern exists to guarantee.
 *
 * **Every value this module returns is a literal declared in this file**, so the guarantee holds by
 * construction rather than by escaping. That sentence is load-bearing and was false in the first
 * draft, which also admitted any string matching the bounded pattern: the pattern constrains the
 * alphabet, not the author, so a provider raising `KB_SECRET_…` satisfied it and travelled through
 * verbatim. Shape is not provenance. Both the internal and provider sets below are closed
 * membership lists, and extending either is a deliberate, reviewed act.
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
 * @summary The codes our OWN layers raise on the embed path, and the only ones allowed through
 * unchanged.
 *
 * **Syntax is not provenance.** An earlier draft admitted anything matching the bounded pattern,
 * reasoning that a `KB_`-shaped string is safe. It is not: the pattern constrains the *alphabet*, not
 * the *author*, so a provider raising `KB_SECRET_…` — 120 admissible characters of its own choosing —
 * travelled verbatim into durable state and onto the remotely-readable snapshot. The pattern is a
 * necessary check on codes we mint; it was never evidence about who minted one.
 *
 * Membership is therefore the gate. A trusted internal code omitted here degrades to unclassified,
 * which is the safe direction and a deliberate one-line addition when a new internal code appears.
 * @type {Set<String>}
 */
const INTERNAL_EMBED_ERROR_CODES = Object.freeze(new Set([
    'KB_EMBEDDING_INPUT_SIZE_EXCEEDED',
    'KB_SYNC_VOLUME_EXCEEDED',
    'KB_TENANT_SPOOF_REJECTED'
]));

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

    // Membership, not shape. A code we mint is more specific than anything the map could add, so it
    // passes through — but only because it is a declared member here. Testing the bounded pattern
    // instead would admit a provider-authored `KB_…` string verbatim, which is the hole this closes.
    if (INTERNAL_EMBED_ERROR_CODES.has(code)) {
        return code
    }

    // Own-property read, not a bare index: a code of `constructor` or `__proto__` would otherwise
    // resolve against Object.prototype and return a function, which is neither bounded nor a string.
    return Object.hasOwn(PROVIDER_ERROR_CODE_MAP, code)
        ? PROVIDER_ERROR_CODE_MAP[code]
        : KB_VECTOR_EMBED_UNCLASSIFIED
}
