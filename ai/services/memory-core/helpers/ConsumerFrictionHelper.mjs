/**
 * @summary Brain-Pillar Consumer-Friction Channel V1 — visibility-only.
 *
 * Local-model substrate consumers (e.g. Gemma 4-31b, Qwen3-8b) emit `ConsumerFriction` records
 * when the substrate payload is the wrong shape for them: context overflow, parse failure,
 * pre-invocation size-precheck skip, etc. V1 is **visibility-only**: emitted frictions accumulate
 * in an in-memory aggregator and surface in the next `GoldenPathSynthesizer.synthesizeGoldenPath`
 * handoff section. No `AgentOrchestrator.parseGoldenPath()` routing changes; no auto-mutation of
 * caller behavior beyond the explicit pre-check skip.
 *
 * Bidirectional defense (per Discussion #11444 graduation):
 * - **Angle 1 (downstream)**: `invokeWithGuardrail` wraps the LLM invocation in try/catch and
 *   categorizes failures (`context-overflow` / `parse-failure` / `timeout`) into a
 *   ConsumerFriction record before returning `{result: null, friction}`.
 * - **Angle 2 (upstream)**: pre-checks `Buffer.byteLength(inputPayload)` against the consumer's
 *   `safeProcessingLimit` (defaults to 80% of `modelContextLimit`); over-budget input skips
 *   the invocation and emits a `size-precheck-skip` friction.
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
 * Token-vs-bytes note: this V1 helper measures input size in **bytes** via
 * `Buffer.byteLength(payload, 'utf8')` because the codebase has no canonical token-counting
 * utility. Callers passing `modelContextLimit` should pass byte-equivalent thresholds (or
 * convert from token-counts using ~4 chars/token rough heuristic for English text). Future
 * V2 may integrate with the Model-Stats registry (ADR 0012) for provider-specific tokenization.
 *
 * @see learn/agentos/decisions/0012-model-stats-framework.md
 * @see ai/daemons/services/GoldenPathSynthesizer.mjs (handoff section consumer)
 * @see ai/daemons/services/SemanticGraphExtractor.mjs (canonical emitter — Dream Pipeline)
 * @see ai/services/memory-core/SessionService.mjs#summarizeSession (canonical emitter — Memory Core)
 */

/**
 * @typedef {Object} ConsumerFriction
 * @property {String} model Consumer model identifier (e.g. 'gemma4-31b', 'qwen3-8b').
 * @property {'context-overflow' | 'parse-failure' | 'token-budget-exceeded' | 'semantic-confusion' | 'timeout' | 'size-precheck-skip'} symptom Friction symptom enum.
 * @property {'pre-invocation' | 'post-invocation-failure'} emissionPoint When the friction was detected.
 * @property {Number} inputBytes Byte size of the payload that triggered the friction.
 * @property {Number} modelContextLimit Configured context limit for the consumer (bytes).
 * @property {Number} [safeProcessingLimit] Optional safer threshold (bytes); defaults to 80% of modelContextLimit.
 * @property {String} workflowUpdateSuggestion Operator/swarm-facing actionable suggestion.
 * @property {String} timestamp ISO 8601 emission time.
 * @property {String} assetRef Origin identifier (sessionId, documentId, etc.) — first member of aggregation tuple.
 * @property {String} consumer Same as model; kept explicit for the (assetRef, consumer, symptom) tuple semantics.
 */

const DETERMINISTIC_SYMPTOMS = new Set(['size-precheck-skip', 'context-overflow']);

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
 * @summary Default safe-processing fraction of the consumer's modelContextLimit.
 * Empirically: callers want a ~20% headroom buffer before pre-check skip fires.
 * @type {Number}
 */
const DEFAULT_SAFE_FRACTION = 0.8;

/**
 * Module-singleton aggregator. Keys are `${assetRef}|${consumer}|${symptom}` tuple-hashes;
 * values are `{count, firstEmission, lastEmission, latestFriction, surfaced}` entries.
 * @type {Map<String, Object>}
 */
const _aggregator = new Map();

function tupleKey(assetRef, consumer, symptom) {
    return `${assetRef}|${consumer}|${symptom}`;
}

/**
 * @summary Categorizes a thrown invocation error into a ConsumerFriction symptom.
 * Pure helper, exported for testability.
 *
 * @param {*} err The caught error (or thrown value).
 * @returns {'context-overflow' | 'parse-failure' | 'timeout'} The categorized symptom.
 */
export function categorizeInvocationError(err) {
    const msg = String(err?.message || err || '');

    if (/context|overflow|too large|maximum|exceed/i.test(msg)) return 'context-overflow';
    if (/timeout|aborted|timed[ -]out/i.test(msg))              return 'timeout';
    return 'parse-failure';
}

/**
 * @summary Emits a ConsumerFriction record into the in-memory aggregator. Deterministic
 * symptoms (`size-precheck-skip`, `context-overflow`) surface on first occurrence;
 * probabilistic symptoms aggregate by `(assetRef, consumer, symptom)` tuple and surface
 * when their count reaches `PROBABILISTIC_EMIT_THRESHOLD`.
 *
 * Pure, side-effect-bounded to the module-singleton aggregator. Returns the aggregator
 * entry so callers can inspect emission state (useful for tests + integration assertions).
 *
 * @param {ConsumerFriction} friction The friction record to emit.
 * @returns {Object} The aggregator entry: `{count, firstEmission, lastEmission, latestFriction, surfaced}`.
 */
export function emitConsumerFriction(friction) {
    const key      = tupleKey(friction.assetRef, friction.consumer || friction.model, friction.symptom);
    const now      = Date.now();
    const existing = _aggregator.get(key);

    const entry = existing || {
        count          : 0,
        firstEmission  : now,
        lastEmission   : now,
        latestFriction : friction,
        surfaced       : false
    };

    entry.count          += 1;
    entry.lastEmission    = now;
    entry.latestFriction  = friction;

    if (DETERMINISTIC_SYMPTOMS.has(friction.symptom)) {
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
 * Side-effect: prunes stale entries from the aggregator as it iterates. Returning a fresh
 * array per call so callers can sort / filter / format without mutating the underlying state.
 *
 * @param {Object} [options]
 * @param {Number} [options.now=Date.now()] Injectable clock for deterministic test isolation.
 * @returns {Array<{key: String, count: Number, firstEmission: String, lastEmission: String, friction: ConsumerFriction}>}
 */
export function getAggregatedFrictions({now = Date.now()} = {}) {
    const surfaced = [];

    for (const [key, entry] of _aggregator.entries()) {
        if (now - entry.lastEmission > AGGREGATOR_TTL_MS) {
            _aggregator.delete(key);
            continue;
        }

        if (entry.surfaced) {
            surfaced.push({
                key,
                count          : entry.count,
                firstEmission  : new Date(entry.firstEmission).toISOString(),
                lastEmission   : new Date(entry.lastEmission).toISOString(),
                friction       : entry.latestFriction
            });
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
 * (upstream pre-check skip when input exceeds `safeProcessingLimit`). Returns a uniform
 * `{result, friction}` envelope so callers can:
 *   - Use `result` when non-null (success path)
 *   - Use `friction` when non-null (emitted ConsumerFriction; aggregator already updated)
 *   - Both never non-null simultaneously
 *
 * Callers MUST provide `model`, `assetRef`, `modelContextLimit`, and `invocationFn`. The
 * `safeProcessingLimit` defaults to `Math.floor(modelContextLimit * DEFAULT_SAFE_FRACTION)`
 * when not passed. `inputPayload` is required for byte-measurement; pass `''` if there is
 * no payload to measure (rare; would skip the pre-check).
 *
 * @param {Object} options
 * @param {Function} options.invocationFn Async function performing the actual LLM call.
 * @param {String} options.inputPayload The payload string passed to the consumer (for byte measurement).
 * @param {String} options.model Consumer model identifier.
 * @param {String} options.assetRef Origin identifier (sessionId, documentId, etc.).
 * @param {Number} options.modelContextLimit Consumer context limit (bytes).
 * @param {Number} [options.safeProcessingLimit] Optional safer threshold (bytes); defaults to 80% of modelContextLimit.
 * @param {String} [options.consumer] Aggregation-tuple alias for `model`; defaults to `model`.
 * @param {String} [options.workflowUpdateHint] Optional caller-provided remediation hint embedded in `workflowUpdateSuggestion`.
 * @returns {Promise<{result: *, friction: ConsumerFriction | null}>}
 */
export async function invokeWithGuardrail({
    invocationFn,
    inputPayload,
    model,
    assetRef,
    modelContextLimit,
    safeProcessingLimit,
    consumer,
    workflowUpdateHint
}) {
    const inputBytes    = Buffer.byteLength(inputPayload || '', 'utf8');
    const effectiveSafe = Number.isFinite(safeProcessingLimit)
        ? safeProcessingLimit
        : Math.floor(modelContextLimit * DEFAULT_SAFE_FRACTION);
    const timestamp     = new Date().toISOString();
    const consumerKey   = consumer || model;

    if (inputBytes > effectiveSafe) {
        const friction = {
            model,
            symptom                 : 'size-precheck-skip',
            emissionPoint           : 'pre-invocation',
            inputBytes,
            modelContextLimit,
            safeProcessingLimit     : effectiveSafe,
            workflowUpdateSuggestion: workflowUpdateHint
                || `Reduce input payload below ${effectiveSafe} bytes for ${model} (current: ${inputBytes} bytes).`,
            timestamp,
            assetRef,
            consumer                : consumerKey
        };

        emitConsumerFriction(friction);
        return {result: null, friction};
    }

    try {
        const result = await invocationFn();
        return {result, friction: null};
    } catch (err) {
        const symptom  = categorizeInvocationError(err);
        const errMsg   = String(err?.message || err || '').substring(0, 200);
        const friction = {
            model,
            symptom,
            emissionPoint           : 'post-invocation-failure',
            inputBytes,
            modelContextLimit,
            safeProcessingLimit     : effectiveSafe,
            workflowUpdateSuggestion: workflowUpdateHint
                || `Consumer ${model} ${symptom}: ${errMsg}. Reduce input or switch consumer.`,
            timestamp,
            assetRef,
            consumer                : consumerKey
        };

        emitConsumerFriction(friction);
        return {result: null, friction};
    }
}

/**
 * @summary Renders the surfaced frictions as a Markdown section for handoff inclusion.
 * Returns an empty string when no frictions are surfaced (caller can opt to skip the section).
 *
 * Pure formatter — does not mutate aggregator state (the underlying `getAggregatedFrictions`
 * does prune stale entries; this wrapper only formats whatever survives the prune).
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
    for (const entry of surfaced) {
        const list = bySymptom.get(entry.friction.symptom) || [];
        list.push(entry);
        bySymptom.set(entry.friction.symptom, list);
    }

    for (const [symptom, entries] of bySymptom) {
        lines.push(`**${symptom}** (${entries.length} unique tuple${entries.length === 1 ? '' : 's'})`);
        for (const entry of entries) {
            const f = entry.friction;
            lines.push(`- \`${f.consumer}\` on \`${f.assetRef}\` — ${f.inputBytes} bytes / safe ${f.safeProcessingLimit ?? '<unset>'} / context ${f.modelContextLimit} — count ${entry.count} (first ${entry.firstEmission}, last ${entry.lastEmission})`);
            lines.push(`  - *Suggestion:* ${f.workflowUpdateSuggestion}`);
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
    PROBABILISTIC_EMIT_THRESHOLD,
    AGGREGATOR_TTL_MS,
    DEFAULT_SAFE_FRACTION
};
