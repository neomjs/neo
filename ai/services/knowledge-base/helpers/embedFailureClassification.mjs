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
 * @summary The **writer-side** definition: what an embed failure may mint on its way into durable
 * tenant-repo state.
 *
 * Owned here because this module is the one place that *produces* codes for that boundary, and the
 * orchestrator's sync filter imports it rather than re-declaring the literal. Those two must agree
 * or a produced code is silently dropped — which is exactly the defect this module exists to end —
 * so they are deliberately one definition.
 *
 * **It is not the only validator, and calling it the sole one would be the same overclaim this
 * module warns about.** Two downstream gates re-check the same shape from different trust positions,
 * and they are separate on purpose rather than by neglect:
 *
 * - `tenantRepoCheckpointValidity.normalizeBoundedErrorCode` — the READ boundary, validating
 *   persisted state it did not write and may not trust (corruption, hand-editing, an older writer).
 * - `DeploymentStateBridgeService.safeKnowledgeBaseErrorCode` — the PROJECTION boundary, validating
 *   what leaves the process toward a remote client.
 *
 * A reader that trusted the writer's guarantee would inherit the writer's bugs, so collapsing all
 * three into one import would remove defence-in-depth rather than duplication. What must never drift
 * is producer-and-filter; reader and projector are allowed to be independently strict.
 * @type {RegExp}
 */
export const BOUNDED_KB_ERROR_CODE_PATTERN = /^KB_[A-Z0-9_]{1,120}$/;

/**
 * @summary The code meaning **unclassified** — the embed stage failed and the cause was not
 * recognised.
 *
 * It does NOT mean "embedding is broken in some general way", and two deployments reporting it may
 * share nothing but the stage at which they stopped. It remains reachable only for genuinely
 * unclassifiable inputs: absent/empty/non-string codes, or strings outside both closed vocabularies
 * below. Reading a shared occurrence as a shared defect is the inference this constant discourages.
 * @type {String}
 */
export const KB_VECTOR_EMBED_UNCLASSIFIED = 'KB_VECTOR_EMBED_FAILED';

/**
 * @summary Bounded cause for a repository that never dispatched because this tenant sweep opened its provider circuit.
 * @type {String}
 */
export const KB_VECTOR_EMBED_PROVIDER_CIRCUIT_OPEN = 'KB_VECTOR_EMBED_PROVIDER_CIRCUIT_OPEN';

/**
 * @summary Bounded disposition for a chunk whose embed call ceiling expired on consecutive attempts.
 *
 * A timeout is lane evidence, not content evidence — but a chunk whose call ceiling fires on EVERY
 * attempt is deterministically undeliverable at the current geometry (provider, model, dimension,
 * call ceiling), and each further offer costs a full ceiling of head-of-line blocking for every
 * chunk and repository queued behind it. The disposition is durable via the poison store and
 * invalidates with the embedding generation, so a raised ceiling or changed geometry re-offers the
 * chunk automatically.
 * @type {String}
 */
export const KB_VECTOR_EMBED_UNDELIVERABLE_AT_GEOMETRY = 'KB_VECTOR_EMBED_UNDELIVERABLE_AT_GEOMETRY';

/**
 * @summary The writer-owned durable-fence vocabulary carried by ingestion error rows.
 *
 * These values are dispositions, not causes: a content poison and a geometry fence retain their
 * original bounded failure code so diagnostics still explain WHY the chunk was fenced. The
 * disposition is what says the row is no longer live work at the current generation.
 * @type {Set<String>}
 */
const DURABLE_FENCE_DISPOSITIONS = Object.freeze(new Set([
    'proven-content-poison',
    'undeliverable-at-geometry'
]));

/**
 * @summary Tenant-aware chunk hash carried by every durable fence row.
 * @type {RegExp}
 */
const DURABLE_FENCE_CHUNK_ID_PATTERN = /^[a-f0-9]{64}$/u;

/**
 * @summary Decides whether one ingestion error row is a validated durable fence rather than live work.
 *
 * The code alone cannot answer this: content-poison rows retain an ordinary embed-domain cause that
 * can also describe a live failure. Reading the writer-owned disposition is safe only with all four
 * gates applied together: embed-domain membership, closed disposition vocabulary, reason-code
 * coherence, and the tenant-aware chunk-id shape. Every malformed or foreign row fails toward LIVE
 * work, so neither outcome classification nor materialization proof can silently complete an
 * ambiguous corpus.
 *
 * This predicate is shared by the tenant outcome classifier and the materialization-receipt writer.
 * Two spellings could otherwise classify one summary complete while withholding the proof that
 * completion requires.
 *
 * @param {*} item Candidate `summary.errors` row.
 * @returns {Boolean} True only for a coherent writer-owned durable fence row.
 */
export function isDurableFenceRow(item) {
    const details = item?.details;

    if (!details || typeof details !== 'object' || Array.isArray(details)) {
        return false;
    }

    return isEmbedFailureCode(item?.code)
        && DURABLE_FENCE_DISPOSITIONS.has(details.disposition)
        && details.reasonCode === item.code
        && typeof details.chunkId === 'string'
        && DURABLE_FENCE_CHUNK_ID_PATTERN.test(details.chunkId);
}

/**
 * @summary Bounded cause for a transport that closed mid-request — the provider stopped answering
 * rather than answering slowly.
 *
 * Deliberately NOT folded into {@link KB_VECTOR_EMBED_CONNECTION_REFUSED}, for the reason this whole
 * map exists: a refused connection means nothing was listening when we dialled, while a reset or a
 * half-closed socket means a live process accepted the request and then stopped existing. Those have
 * different fixes — start the service, versus find out what killed it — and an operator who reads
 * "refused" for a mid-request death looks at the wrong thing first.
 *
 * Both are nonetheless *death* for classification purposes ({@link isProviderDeathError}), because the
 * question that disposition asks is "did the provider stop answering", not "at which instant".
 * @type {String}
 */
export const KB_VECTOR_EMBED_TRANSPORT_CLOSED = 'KB_VECTOR_EMBED_TRANSPORT_CLOSED';

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
    'KB_TENANT_SPOOF_REJECTED',
    KB_VECTOR_EMBED_PROVIDER_CIRCUIT_OPEN,
    KB_VECTOR_EMBED_UNDELIVERABLE_AT_GEOMETRY
]));

/**
 * @summary Upstream-vocabulary codes that describe a distinguishable embed fault.
 *
 * Two timeout sources map to different codes on purpose: a consumer-owned deadline expiring
 * (`EMBEDDING_PROBE_TIMEOUT`, raised by our own caller) and the provider's own request timeout are
 * different faults with different fixes — raise our deadline, versus the provider is too slow or
 * wedged. The map also translates source-owned context/residency codes and Node's foreign transport
 * refusal code; none is echoed. Collapsing them would rebuild the ambiguity this module removes.
 * @type {Object}
 */
const PROVIDER_ERROR_CODE_MAP = Object.freeze({
    ABORT_ERR   : 'KB_VECTOR_EMBED_ABORTED',
    ECONNREFUSED: 'KB_VECTOR_EMBED_CONNECTION_REFUSED',
    // Three vocabularies for one event: the peer reset the connection (`ECONNRESET`), we wrote to a
    // socket the peer had already closed (`EPIPE`), or undici observed the socket end mid-request
    // (`UND_ERR_SOCKET`). All three mean a live process took the request and stopped existing, which
    // is why they share a code and why that code is not `…CONNECTION_REFUSED`.
    ECONNRESET                       : 'KB_VECTOR_EMBED_TRANSPORT_CLOSED',
    EPIPE                            : 'KB_VECTOR_EMBED_TRANSPORT_CLOSED',
    UND_ERR_SOCKET                   : 'KB_VECTOR_EMBED_TRANSPORT_CLOSED',
    EMBEDDING_CONTEXT_INSUFFICIENT   : 'KB_VECTOR_EMBED_CONTEXT_INSUFFICIENT',
    EMBEDDING_INPUT_TRUNCATED        : 'KB_VECTOR_EMBED_INPUT_TRUNCATED',
    EMBEDDING_MODEL_NOT_RESIDENT     : 'KB_VECTOR_EMBED_MODEL_NOT_RESIDENT',
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

/**
 * @summary Classifies an embed failure through its bounded `cause` chain.
 *
 * Wrapper errors are allowed to name the failed stage while keeping the provider failure in
 * `error.cause`. Reading only the outer code therefore turns a precisely classified provider fault
 * into the unclassified sentinel. This walker inspects at most four distinct Error-like objects,
 * stops on cycles, and returns the first code that the closed vocabulary recognises. Raw messages
 * and arbitrary fields never leave the chain.
 *
 * @param {*} error Error-like value whose `code` / `cause` chain should be classified.
 * @returns {String} A bounded `KB_*` code.
 */
export function classifyEmbedFailureError(error) {
    const visited = new Set();
    let   current = error;

    for (let depth = 0; depth < 4 && current && typeof current === 'object' && !visited.has(current); depth++) {
        visited.add(current);

        const classified = classifyEmbedFailureCode(current.code);
        if (classified !== KB_VECTOR_EMBED_UNCLASSIFIED) {
            return classified
        }

        current = current.cause
    }

    return KB_VECTOR_EMBED_UNCLASSIFIED
}

/**
 * @summary The bounded codes that mean the provider stopped answering, as opposed to answering slowly.
 *
 * **Module-private, and a `Set` rather than an exported list, for the reason `createTimeoutError.mjs`
 * records about its own timeout set:** `Object.freeze` does not stop `.add()`, so an exported set is a
 * shared mutable classifier any consumer could widen for every other consumer at once. Only the
 * predicate crosses the boundary.
 *
 * **Disjoint from the timeout vocabulary, and that disjointness is load-bearing rather than tidy.** A
 * timeout already has a disposition — the call-ceiling strike path graduates it — and a chunk that
 * merely times out must never reach the death path, because the death path's evidence is weaker: it
 * infers attributability from a later success rather than from a repeated deadline. Folding
 * `ETIMEDOUT` in here would let the weaker evidence fence chunks the stronger path already handles,
 * and a fixture built on a timeout stub would pass before and after the change while proving nothing.
 * @type {Set<String>}
 */
const PROVIDER_DEATH_CODES = Object.freeze(new Set([
    'KB_VECTOR_EMBED_CONNECTION_REFUSED',
    KB_VECTOR_EMBED_TRANSPORT_CLOSED
]));

/**
 * @summary Whether an embed failure means the provider stopped answering mid-flight or refused outright.
 *
 * Classified through {@link classifyEmbedFailureError} rather than by reading `error.code` directly, so
 * a transport death wrapped by a stage-naming error still classifies — the same reason that walker
 * exists. Reusing it also means the death vocabulary cannot drift from the map: a code absent from
 * `PROVIDER_ERROR_CODE_MAP` classifies as unclassified and is therefore not death, which is the
 * conservative direction.
 *
 * **Not a content claim, deliberately.** A dead provider says nothing about whether the bytes were
 * valid, which is why `isolateFirstFailedBatch` refuses to bisect one into a poison disposition. This
 * predicate answers only "did the provider stop answering"; whether that is *attributable to one
 * input* is a separate question the caller answers with paired evidence.
 *
 * @param {*} error Error-like value whose `code` / `cause` chain should be classified.
 * @returns {Boolean} `true` only for a classified provider-death code.
 */
export function isProviderDeathError(error) {
    return PROVIDER_DEATH_CODES.has(classifyEmbedFailureError(error))
}

/**
 * @summary Whether the provider ACCEPTED this request and then stopped existing, as opposed to refusing it.
 *
 * The distinction is load-bearing and it is free. `ECONNRESET` / `EPIPE` / `UND_ERR_SOCKET` all require an
 * **established connection** before they can be observed — a peer cannot reset, or close under our write, a
 * connection it never accepted. So this code carries its own liveness proof: the provider was answering at
 * the moment the request left, and the request that was in flight is the one that was in flight.
 * `KB_VECTOR_EMBED_CONNECTION_REFUSED` is the opposite — nothing was listening, which proves the provider
 * was ALREADY dead and attributes nothing to the input.
 *
 * `VectorService`'s death-class graduation needs "the provider was alive, and *this* input killed it".
 * This code supplies the liveness half from the failure itself, so no recovery probe is needed and the
 * evidence is available even when the suspect is the last chunk in the corpus.
 *
 * A reset can also come from a network blip with the input blameless, so the caller's strike threshold —
 * not this predicate — gates a graduation.
 *
 * @param {*} error Error-like value whose `code` / `cause` chain should be classified.
 * @returns {Boolean} `true` only when the classified code means an established connection died mid-request.
 */
export function isAcceptedThenDiedError(error) {
    return classifyEmbedFailureError(error) === KB_VECTOR_EMBED_TRANSPORT_CLOSED
}

/**
 * @summary Projects the closed provider-residency disposition through a bounded cause chain.
 *
 * The two literals are source-owned observations from `TextEmbeddingService`. Arbitrary provider
 * strings never cross the durable receipt boundary; absent, unknown, cyclic, and over-depth values
 * stay absent.
 *
 * @param {*} error Error-like value whose chain may carry a residency disposition.
 * @returns {'never-resident'|'evicted-mid-batch'|undefined}
 */
export function classifyEmbedResidencyDisposition(error) {
    const allowed = new Set(['never-resident', 'evicted-mid-batch']);
    const visited = new Set();
    let   current = error;

    for (let depth = 0; depth < 4 && current && typeof current === 'object' && !visited.has(current); depth++) {
        visited.add(current);

        if (allowed.has(current.residencyDisposition)) {
            return current.residencyDisposition
        }

        current = current.cause
    }
}

/**
 * @summary Whether a failed embed may be retried later (`deferrable`) or must fail its ingest run
 * now (`rejected`).
 *
 * The two dispositions differ in what they cost when wrong, and the asymmetry is the whole argument.
 * Deferring a permanently-failing embed costs bounded retries whose backlog is *observable* — a
 * pending depth that never falls. Failing a merely-slow one costs the corpus: the run discards its
 * completed parse and chunk work, the repo takes a backoff step, and nothing is ever ingested. That
 * second outcome is not hypothetical; it is the measured behaviour of an external deployment whose
 * four repos sat at thirteen consecutive failures with an empty collection.
 * @type {Object}
 */
export const EMBED_DISPOSITION = Object.freeze({
    deferrable: 'deferrable',
    rejected  : 'rejected'
});

/**
 * @summary The bounded codes that must NOT be retried — the closed set of our own deliberate refusals.
 *
 * Membership here means a later attempt is either futile or unsafe, never merely unlucky: an input
 * over the embedding budget is over it on every retry; a work-volume gate refused on purpose and a
 * silent requeue would launder that refusal; a rejected tenant must never be retried into success.
 *
 * Most entries pass through {@link classifyEmbedFailureCode} directly. The truncation entry is the
 * bounded translation of `TextEmbeddingService`'s source-owned current-input overflow: either its
 * bounded estimate exceeds an otherwise policy-compliant trusted resident context, or the exact
 * structured refusal proves the input/context relation. Arbitrary provider prose and foreign
 * provider codes remain deferrable: inference about another process is not a basis for discarding a
 * corpus.
 * @type {Set<String>}
 */
const REJECTED_EMBED_ERROR_CODES = Object.freeze(new Set([
    'KB_EMBEDDING_INPUT_SIZE_EXCEEDED',
    'KB_SYNC_VOLUME_EXCEEDED',
    'KB_TENANT_SPOOF_REJECTED',
    // The current input is classified too large for a policy-compliant observed context, or the
    // provider emitted the exact structured refusal. A context-policy mismatch takes precedence and
    // uses the distinct deferrable code because repairing the resident may make the same input fit.
    'KB_VECTOR_EMBED_INPUT_TRUNCATED'
]));

/**
 * @summary Decides whether one bounded embed-failure code defers or rejects.
 *
 * **Deferral is the default and rejection is the closed set — the inverse of the obvious design, for
 * an evidence-driven reason.** Keying deferral off a recognised-transient list (the timeout codes,
 * the abort, the refused connection) reads as the careful choice, and it would not have fired on the
 * failure that motivated this: the deployment reported `KB_VECTOR_EMBED_FAILED`, which is
 * {@link KB_VECTOR_EMBED_UNCLASSIFIED} — the provider's code matched no entry in either vocabulary.
 * A transient-allow-list therefore rejects precisely the case it was built to survive, and it does so
 * silently, because an unrecognised code looks like a decision rather than a gap.
 *
 * So an unclassified failure defers. That is the same "unrecognised degrades in the safe direction"
 * discipline {@link classifyEmbedFailureCode} already applies to the durable-state boundary, pointed
 * at the corpus instead: there, safe means declining to persist an unknown; here, safe means
 * declining to discard on one.
 *
 * Pure and total, and deliberately typed on the BOUNDED code rather than the raw provider code, so a
 * caller cannot reach a disposition without having translated first.
 *
 * @param {String} [boundedCode] A bounded `KB_*` code, as produced by {@link classifyEmbedFailureCode}.
 * @returns {String} One of {@link EMBED_DISPOSITION}.
 */
export function classifyEmbedDisposition(boundedCode) {
    return typeof boundedCode === 'string' && REJECTED_EMBED_ERROR_CODES.has(boundedCode)
        ? EMBED_DISPOSITION.rejected
        : EMBED_DISPOSITION.deferrable
}

/**
 * @summary Every code {@link classifyEmbedFailureCode} can emit — the embed domain, derived rather
 * than restated.
 *
 * Built from this module's own three sources so it cannot drift from them: adding a provider
 * mapping or an internal code widens this set in the same edit, and a hand-maintained duplicate
 * list would have been one rename away from silently disagreeing with the function it describes.
 * @type {Set<String>}
 */
const EMBED_DOMAIN_CODES = Object.freeze(new Set([
    KB_VECTOR_EMBED_UNCLASSIFIED,
    ...INTERNAL_EMBED_ERROR_CODES,
    ...Object.values(PROVIDER_ERROR_CODE_MAP)
]));

/**
 * @summary Whether a bounded code came from the embed stage at all.
 *
 * **The boundary {@link classifyEmbedDisposition} deliberately does not police.** That function is
 * total over its documented input — *a bounded embed-failure code* — and answers `deferrable` for
 * anything it does not recognise, which is correct there: an unrecognised EMBED failure must not
 * discard a corpus (the observed production code was the unclassified sentinel).
 *
 * A caller holding a MIXED error stream is a different situation, and the same default becomes a
 * defect. An ingestion summary carries parse failures, tenant-guard rejections and size refusals
 * alongside embed failures; routed through the disposition alone, a permanently-malformed file would
 * defer forever — never failing, never advancing, never surfacing a cause. **Silently stuck is worse
 * than loudly broken**, and it is the failure this predicate exists to prevent.
 *
 * So deferral is opt-in by DOMAIN and default WITHIN it: ask this first, and only then ask the
 * disposition. Anything outside the embed domain keeps whatever behaviour its own layer already had.
 *
 * @param {String} [boundedCode] A bounded `KB_*` code.
 * @returns {Boolean} True when the code is one the embed classifier can produce.
 */
export function isEmbedFailureCode(boundedCode) {
    return typeof boundedCode === 'string' && EMBED_DOMAIN_CODES.has(boundedCode)
}
