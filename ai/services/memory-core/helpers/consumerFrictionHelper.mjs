/**
 * @summary Brain-Pillar Consumer-Friction Channel V1 — visibility-only.
 *
 * Local-model substrate consumers (e.g. Gemma 4-26b, Qwen3-8b) emit `ConsumerFriction` records
 * when the substrate payload is the wrong shape for them: context overflow, parse failure,
 * pre-invocation size-precheck skip, etc. V1 is **visibility-only**: emitted frictions accumulate
 * in an in-memory aggregator and surface in the next `GoldenPathSynthesizer.synthesizeGoldenPath`
 * handoff section. No `AgentOrchestrator.parseGoldenPath()` routing changes; no auto-mutation of
 * caller behavior beyond the explicit pre-check skip.
 *
 * Schema is the durable visibility contract: structured `ConsumerFriction` with enum-backed
 * `suggestionKind`, token-based metrics, `(assetRef, consumer, symptom)` aggregation tuple,
 * and explicit `serviceDomain` provenance.
 *
 * Bidirectional defense:
 * - **Angle 1 (downstream)**: `invokeWithGuardrail` wraps the LLM invocation in try/catch and
 *   categorizes failures (`context-overflow` / `parse-failure` / `timeout`) into a
 *   ConsumerFriction record before returning `{result: null, friction}`.
 * - **Angle 2 (upstream)**: pre-checks the invocation envelope's estimated tokens against the
 *   consumer's `safeProcessingLimitTokens` (defaults to 75% of `contextLimitTokens`); over-budget
 *   input skips the invocation and emits a `size-precheck-skip` friction.
 *
 * Debounce policy:
 * - **Deterministic symptoms** (`size-precheck-skip`, `context-overflow`) surface on the
 *   first occurrence — these are direct evidence of payload-shape mismatch and should not
 *   be swallowed by aggregation.
 * - **Probabilistic symptoms** (`parse-failure`, `timeout`, `token-budget-exceeded`,
 *   `semantic-confusion`) aggregate by `(assetRef, consumer, symptom)` tuple. They surface
 *   once `count >= PROBABILISTIC_EMIT_THRESHOLD` to avoid burying single transient errors
 *   in the handoff feed.
 *
 * Token estimation: V1 uses a conservative 3-bytes/token heuristic
 * (`Math.ceil(Buffer.byteLength(payload) / 3)`) because the codebase has no canonical
 * provider-specific tokenizer and REM payloads are code/JSON/log dense. Bytes are retained on
 * the record as evidence; tokens are the durable LLM-relevant contract.
 * Future V2 may integrate with Model-Stats registry (ADR 0012) for per-provider tokenization. ticket-ref-ok: load-bearing ADR design-pointer (mirrors the @see below).
 *
 * @see learn/agentos/decisions/0012-model-stats-framework.md
 * @see ai/services/graph/GoldenPathSynthesizer.mjs (handoff section consumer)
 * @see ai/services/graph/SemanticGraphExtractor.mjs (canonical emitter — Dream Pipeline)
 * @see ai/services/memory-core/SessionService.mjs#summarizeSession (canonical emitter — Memory Core)
 */

import {PROVIDER_TIMEOUT_CODE} from '../../../provider/createTimeoutError.mjs';

/**
 * @typedef {Object} ConsumerFriction
 * @property {String} assetRef Graph node ID of the substrate causing friction (sessionId, documentId, etc.) — first member of aggregation tuple.
 * @property {String} consumer Service name (e.g. 'SemanticGraphExtractor', 'SessionService.summarizeSession') — second member of aggregation tuple.
 * @property {String} model Consumer model identifier (e.g. 'google/gemma-4-26b-a4b', 'qwen3-8b').
 * @property {'context-overflow' | 'parse-failure' | 'token-budget-exceeded' | 'semantic-confusion' | 'timeout' | 'size-precheck-skip'} symptom Friction symptom enum — third member of aggregation tuple.
 * @property {'pre-invocation' | 'post-invocation-failure'} emissionPoint When the friction was detected.
 * @property {'split-document' | 'compress-payload' | 'extract-anchor' | 'reduce-review-cycle' | 'schema-repair' | 'unknown'} suggestionKind Enum-backed structured suggestion for substrate-evolution action.
 * @property {Number} inputBytes Raw byte size of the payload that triggered the friction — evidence.
 * @property {Number} inputTokensEstimate Estimated token count of the input payload (Math.ceil(inputBytes / 3) heuristic) — durable LLM-relevant metric.
 * @property {Number} contextLimitTokens Configured context window of the consumer model (tokens) — durable contract.
 * @property {Number} [safeProcessingLimitTokens] Optional safer threshold in tokens (default = Math.floor(contextLimitTokens * 0.75)).
 * @property {String} firstSeenAt ISO 8601 timestamp of the first emission for this aggregation-tuple.
 * @property {String} lastSeenAt ISO 8601 timestamp of the most recent emission for this aggregation-tuple.
 * @property {Number} count Number of emissions accumulated against this aggregation-tuple — for debounce/threshold.
 * @property {'dream-pipeline' | 'memory-core' | 'concept-extraction' | 'other'} serviceDomain Provenance domain of the emitting service.
 * @property {String} [note] Optional bounded prose (e.g. truncation diagnostics, raw error tail).
 */

const DETERMINISTIC_SYMPTOMS = new Set(['size-precheck-skip', 'context-overflow']);

const VALID_SYMPTOMS = new Set([
    'context-overflow',
    'parse-failure',
    'token-budget-exceeded',
    'semantic-confusion',
    'timeout',
    'size-precheck-skip'
]);

const VALID_SUGGESTION_KINDS = new Set([
    'split-document',
    'compress-payload',
    'extract-anchor',
    'reduce-review-cycle',
    'schema-repair',
    'unknown'
]);

const VALID_SERVICE_DOMAINS = new Set([
    'dream-pipeline',
    'memory-core',
    'concept-extraction',
    'other'
]);

/**
 * @summary Probabilistic-symptom emit threshold — surfaces aggregated frictions when count reaches this.
 * Single transient parse-failures are absorbed; persistent patterns surface for handoff.
 * @type {Number}
 */
const PROBABILISTIC_EMIT_THRESHOLD = 3;

/**
 * @summary TTL window for aggregator entries — older entries are pruned at the next read.
 * One hour matches typical REM cycle / handoff cadence.
 * @type {Number}
 */
const AGGREGATOR_TTL_MS = 60 * 60 * 1000;

/**
 * @summary Default safe-processing fraction of the consumer's contextLimitTokens.
 * Leaves 25% headroom for system-prompt envelope, repair-cycle prompt growth, and
 * output-token reservation.
 * @type {Number}
 */
const DEFAULT_SAFE_FRACTION = 0.75;

/**
 * @summary Bytes-per-token heuristic for dense REM / Agent OS text.
 * Conservative estimate; code, JSON, and logs tokenize denser than the old English-prevalent
 * 4-bytes/token heuristic, which let incident-shaped payloads pass the safe band and overflow
 * local Gemma contexts before the guardrail could skip them.
 * V2 may delegate to Model-Stats registry per-provider.
 * @type {Number}
 */
const BYTES_PER_TOKEN_HEURISTIC = 3;

/**
 * Module-singleton aggregator. Keys are `${assetRef}|${consumer}|${symptom}` tuple-hashes;
 * values are aggregator entries with cumulative count + first/last-emission timestamps.
 * @type {Map<String, Object>}
 */
const _aggregator = new Map();

function tupleKey(assetRef, consumer, symptom) {
    return `${assetRef}|${consumer}|${symptom}`;
}

/**
 * @summary Estimates token count from raw bytes via the conservative dense-text heuristic.
 * Exported for test verification + caller-side cross-references; not provider-specific.
 *
 * @param {Number} bytes Raw byte count.
 * @returns {Number} Estimated token count.
 */
export function bytesToTokens(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0) return 0;
    return Math.ceil(bytes / BYTES_PER_TOKEN_HEURISTIC);
}

/**
 * @summary Categorizes a thrown invocation error into a ConsumerFriction symptom.
 * Pure helper, exported for testability. A provider timeout is detected structurally first
 * (`error.code === PROVIDER_TIMEOUT_CODE`, the uniform cross-provider contract) so the
 * classification does not depend on the provider's message wording; the message regex remains a
 * fallback for non-coded error paths.
 *
 * @param {*} err The caught error (or thrown value).
 * @returns {'context-overflow' | 'parse-failure' | 'timeout'} The categorized symptom.
 */
export function categorizeInvocationError(err) {
    const msg = String(err?.message || err || '');

    if (err?.code === PROVIDER_TIMEOUT_CODE)                    return 'timeout';
    if (/context|overflow|too large|maximum|exceed/i.test(msg)) return 'context-overflow';
    if (/timeout|aborted|timed[ -]out/i.test(msg))              return 'timeout';
    return 'parse-failure';
}

/**
 * @summary Derives a default `suggestionKind` from a symptom + assetRef-shape heuristic.
 * Callers may override via the `suggestionKind` option on `invokeWithGuardrail`. Pure helper.
 *
 * @param {String} symptom The ConsumerFriction symptom.
 * @param {String} [assetRef] Optional asset reference for shape-based heuristic.
 * @returns {'split-document' | 'compress-payload' | 'extract-anchor' | 'reduce-review-cycle' | 'schema-repair' | 'unknown'}
 */
export function deriveSuggestionKind(symptom, assetRef) {
    switch (symptom) {
        case 'size-precheck-skip':
        case 'context-overflow':
        case 'token-budget-exceeded':
            return 'compress-payload';
        case 'parse-failure':
            return 'schema-repair';
        case 'semantic-confusion':
            return 'extract-anchor';
        case 'timeout':
            return 'unknown';
        default:
            return 'unknown';
    }
}

/**
 * @summary Emits a ConsumerFriction record into the in-memory aggregator. Deterministic
 * symptoms (`size-precheck-skip`, `context-overflow`) surface on first occurrence;
 * probabilistic symptoms aggregate by `(assetRef, consumer, symptom)` tuple and surface
 * when their count reaches `PROBABILISTIC_EMIT_THRESHOLD`.
 *
 * Validates enum membership of `symptom`, `suggestionKind`, `emissionPoint`, `serviceDomain`
 * and the positive-finite-number contract on `contextLimitTokens`. A missing numeric limit
 * would corrupt the downstream friction record, so this helper fails loudly. Throws
 * `TypeError` on invalid input. Pure aside from the module-singleton aggregator mutation.
 *
 * @param {Partial<ConsumerFriction>} input Friction fields. `assetRef`, `consumer`, `model`,
 *   `symptom`, `emissionPoint`, `serviceDomain`, `inputBytes`, `contextLimitTokens` are required.
 *   `count` / `firstSeenAt` / `lastSeenAt` are managed by the aggregator and may be omitted.
 * @returns {Object} The aggregator entry: `{count, firstSeenAt, lastSeenAt, latestFriction, surfaced}`.
 * @throws {TypeError} If `contextLimitTokens` is not a positive finite number.
 */
export function emitConsumerFriction(input) {
    if (!input || typeof input !== 'object') {
        throw new TypeError(`emitConsumerFriction: input is required`);
    }
    if (!VALID_SYMPTOMS.has(input.symptom)) {
        throw new TypeError(`emitConsumerFriction: invalid symptom '${input.symptom}'`);
    }
    if (input.emissionPoint && input.emissionPoint !== 'pre-invocation' && input.emissionPoint !== 'post-invocation-failure') {
        throw new TypeError(`emitConsumerFriction: invalid emissionPoint '${input.emissionPoint}'`);
    }
    if (input.suggestionKind && !VALID_SUGGESTION_KINDS.has(input.suggestionKind)) {
        throw new TypeError(`emitConsumerFriction: invalid suggestionKind '${input.suggestionKind}'`);
    }
    if (input.serviceDomain && !VALID_SERVICE_DOMAINS.has(input.serviceDomain)) {
        throw new TypeError(`emitConsumerFriction: invalid serviceDomain '${input.serviceDomain}'`);
    }
    if (!Number.isFinite(input.contextLimitTokens) || input.contextLimitTokens <= 0) {
        throw new TypeError(`emitConsumerFriction: contextLimitTokens must be a positive finite number, got ${input.contextLimitTokens}`);
    }

    const consumer = input.consumer || input.model;
    const key      = tupleKey(input.assetRef, consumer, input.symptom);
    const nowIso   = new Date().toISOString();
    const existing = _aggregator.get(key);

    const entry = existing || {
        count         : 0,
        firstSeenAt   : nowIso,
        lastSeenAt    : nowIso,
        latestFriction: null,
        surfaced      : false
    };

    entry.count += 1;
    entry.lastSeenAt = nowIso;

    // Build the latest authoritative ConsumerFriction record for this aggregation-tuple.
    entry.latestFriction = {
        assetRef                 : input.assetRef,
        consumer,
        model                    : input.model,
        symptom                  : input.symptom,
        emissionPoint            : input.emissionPoint,
        suggestionKind           : input.suggestionKind || deriveSuggestionKind(input.symptom, input.assetRef),
        inputBytes               : input.inputBytes,
        inputTokensEstimate      : input.inputTokensEstimate ?? bytesToTokens(input.inputBytes),
        contextLimitTokens       : input.contextLimitTokens,
        safeProcessingLimitTokens: input.safeProcessingLimitTokens,
        firstSeenAt              : entry.firstSeenAt,
        lastSeenAt               : entry.lastSeenAt,
        count                    : entry.count,
        serviceDomain            : input.serviceDomain || 'other',
        ...(input.note !== undefined ? {note: input.note} : {})
    };

    if (DETERMINISTIC_SYMPTOMS.has(input.symptom)) {
        entry.surfaced = true;
    } else if (entry.count >= PROBABILISTIC_EMIT_THRESHOLD) {
        entry.surfaced = true;
    }

    _aggregator.set(key, entry);

    return entry;
}

/**
 * @summary Returns currently-surfaced ConsumerFriction records for handoff rendering.
 * Prunes entries past `AGGREGATOR_TTL_MS`. Caller is `GoldenPathSynthesizer.synthesizeGoldenPath`
 * (the human/swarm-facing read consumer per Visibility-Only V1).
 *
 * Side-effect: prunes stale entries from the aggregator as it iterates. Returns a fresh
 * array per call so callers can sort/filter/format without mutating the underlying state.
 *
 * @param {Object} [options]
 * @param {Number} [options.now=Date.now()] Injectable clock for deterministic test isolation.
 * @returns {Array<ConsumerFriction>} Surfaced friction records (already aggregated with count + firstSeenAt + lastSeenAt).
 */
export function getAggregatedFrictions({now = Date.now()} = {}) {
    const surfaced = [];

    for (const [key, entry] of _aggregator.entries()) {
        const lastTs = Date.parse(entry.lastSeenAt);
        if (Number.isFinite(lastTs) && now - lastTs > AGGREGATOR_TTL_MS) {
            _aggregator.delete(key);
            continue;
        }

        if (entry.surfaced && entry.latestFriction) {
            surfaced.push(entry.latestFriction);
        }
    }

    return surfaced;
}

/**
 * @summary Clears the in-memory aggregator. Test-only primitive — should not be called
 * from production code paths because it would erase the friction-feed the next handoff
 * cycle is going to render.
 */
export function clearAggregatedFrictions() {
    _aggregator.clear();
}

/**
 * @summary Bidirectional defense wrapper around an LLM invocation.
 *
 * Implements both Angle 1 (downstream try/catch with symptom categorization) and Angle 2
 * (upstream pre-check skip when the estimated input tokens exceed `safeProcessingLimitTokens`).
 * Returns a uniform `{result, friction}` envelope so callers can:
 *   - Use `result` when non-null (success path)
 *   - Use `friction` when non-null (emitted ConsumerFriction; aggregator already updated)
 *   - Both never non-null simultaneously
 *
 * @param {Object} options
 * @param {Function} options.invocationFn Async function performing the actual LLM call.
 * @param {String} options.inputPayload The payload string passed to the consumer (for token estimation).
 * @param {String} options.model Consumer model identifier.
 * @param {String} options.assetRef Origin identifier (sessionId, documentId, etc.) — first tuple member.
 * @param {String} options.consumer Service name emitting the friction (e.g. 'SemanticGraphExtractor') — second tuple member.
 * @param {Number} options.contextLimitTokens Consumer context limit (tokens). **Required, positive, finite.** Loud-fails with `TypeError` at entry: config is the source of truth, and missing values must surface instead of falling back to hidden defaults.
 * @param {Number} [options.safeProcessingLimitTokens] Optional safer threshold (tokens); defaults to 75% of contextLimitTokens.
 * @param {'dream-pipeline' | 'memory-core' | 'concept-extraction' | 'other'} options.serviceDomain Provenance domain.
 * @param {String} [options.suggestionKind] Optional caller-provided enum override; defaults to symptom-derived.
 * @param {String} [options.note] Optional bounded prose context.
 * @returns {Promise<{result: *, friction: ConsumerFriction | null}>}
 * @throws {TypeError} If `contextLimitTokens` is not a positive finite number.
 */
export async function invokeWithGuardrail({
    invocationFn,
    inputPayload,
    model,
    assetRef,
    consumer,
    contextLimitTokens,
    safeProcessingLimitTokens,
    serviceDomain,
    suggestionKind,
    note
}) {
    if (!Number.isFinite(contextLimitTokens) || contextLimitTokens <= 0) {
        throw new TypeError(`invokeWithGuardrail: contextLimitTokens must be a positive finite number, got ${contextLimitTokens}`);
    }

    const inputBytes          = Buffer.byteLength(inputPayload || '', 'utf8');
    const inputTokensEstimate = bytesToTokens(inputBytes);
    const effectiveSafeTokens = Number.isFinite(safeProcessingLimitTokens)
        ? safeProcessingLimitTokens
        : Math.floor(contextLimitTokens * DEFAULT_SAFE_FRACTION);
    const consumerKey = consumer || model;

    if (inputTokensEstimate > effectiveSafeTokens) {
        const symptom = 'size-precheck-skip';
        const entry   = emitConsumerFriction({
            assetRef,
            consumer                 : consumerKey,
            model,
            symptom,
            emissionPoint            : 'pre-invocation',
            suggestionKind           : suggestionKind || deriveSuggestionKind(symptom, assetRef),
            inputBytes,
            inputTokensEstimate,
            contextLimitTokens,
            safeProcessingLimitTokens: effectiveSafeTokens,
            serviceDomain,
            note
        });

        return {result: null, friction: entry.latestFriction};
    }

    try {
        const result = await invocationFn();
        return {result, friction: null};
    } catch (err) {
        const symptom = categorizeInvocationError(err);
        const errTail = String(err?.message || err || '').substring(0, 200);
        const entry   = emitConsumerFriction({
            assetRef,
            consumer                 : consumerKey,
            model,
            symptom,
            emissionPoint            : 'post-invocation-failure',
            suggestionKind           : suggestionKind || deriveSuggestionKind(symptom, assetRef),
            inputBytes,
            inputTokensEstimate,
            contextLimitTokens,
            safeProcessingLimitTokens: effectiveSafeTokens,
            serviceDomain,
            note                     : note || errTail
        });

        return {result: null, friction: entry.latestFriction};
    }
}

/**
 * @summary Renders the surfaced frictions as a Markdown section for handoff inclusion.
 * Returns an empty string when no frictions are surfaced (caller can opt to skip the section).
 *
 * Pure formatter — does not mutate aggregator state.
 *
 * @param {Object} [options]
 * @param {Number} [options.now=Date.now()] Injectable clock for deterministic test isolation.
 * @returns {String} Markdown section, or empty string when no frictions surface.
 */
export function renderConsumerFrictionSection({now = Date.now()} = {}) {
    const surfaced = getAggregatedFrictions({now});

    if (surfaced.length === 0) {
        return '';
    }

    const lines = ['### 🧠 Substrate-Consumer Friction', ''];

    // Group by symptom for readability
    const bySymptom = new Map();
    for (const friction of surfaced) {
        const list = bySymptom.get(friction.symptom) || [];
        list.push(friction);
        bySymptom.set(friction.symptom, list);
    }

    for (const [symptom, frictions] of bySymptom) {
        lines.push(`**${symptom}** (${frictions.length} unique tuple${frictions.length === 1 ? '' : 's'})`);
        for (const f of frictions) {
            const safe = f.safeProcessingLimitTokens ?? '<unset>';
            lines.push(`- \`${f.consumer}\` on \`${f.assetRef}\` (model \`${f.model}\`, domain \`${f.serviceDomain}\`) — ${f.inputTokensEstimate} tokens / safe ${safe} / context ${f.contextLimitTokens} (count ${f.count}, first ${f.firstSeenAt}, last ${f.lastSeenAt})`);
            lines.push(`  - *Suggestion (\`${f.suggestionKind}\`):* ${f.note || 'see emitter context'}`);
        }
        lines.push('');
    }

    return lines.join('\n');
}

/**
 * @summary Internal constants exported for test verification.
 */
export const _testConstants = {
    DETERMINISTIC_SYMPTOMS,
    VALID_SYMPTOMS,
    VALID_SUGGESTION_KINDS,
    VALID_SERVICE_DOMAINS,
    PROBABILISTIC_EMIT_THRESHOLD,
    AGGREGATOR_TTL_MS,
    DEFAULT_SAFE_FRACTION,
    BYTES_PER_TOKEN_HEURISTIC
};
