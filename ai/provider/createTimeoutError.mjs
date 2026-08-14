/**
 * @summary Shared provider-timeout contract for local model requests.
 *
 * Both {@link Neo.ai.provider.OpenAiCompatible} chat requests and native
 * {@link Neo.ai.provider.Ollama} chat / embedding requests throw the exact error shape
 * produced here, so a caller can detect a provider timeout via one uniform `error.code`
 * regardless of which local provider served the request. Housing the helper plus the
 * documented options contract in one module keeps the parallel provider implementations
 * from silently drifting apart (their transports differ, but the observable contract here
 * must stay uniform).
 *
 * @module Neo.ai.provider.createTimeoutError
 */

/**
 * Uniform, caller-detectable code set on every provider-timeout error, so consumers
 * (e.g. KB `ask` synthesis degradation, a future daemon-yield) branch on one value
 * instead of per-provider knowledge.
 * @type {String}
 */
const PROVIDER_TIMEOUT_CODE = 'PROVIDER_TIMEOUT';

/**
 * The OpenAI-compatible EMBEDDING transport's own timeout code.
 *
 * It is deliberately not `PROVIDER_TIMEOUT`: that transport stamps its socket-level `req.on('timeout')`
 * directly rather than routing through {@link createTimeoutError}, so the two codes are distinct facts
 * about which layer gave up, and collapsing them would erase that. What matters is that BOTH live
 * here, because the identity is consumed by parties that never see the producer — a drain-loop
 * classifier that treats saturation differently from an outage, and its fixtures. While the literal
 * was repeated at the producer and each consumer, a coordinated rename could keep every test green
 * while silently restoring the retry amplification the classifier exists to prevent.
 * @type {String}
 */
const OPENAI_COMPATIBLE_REQUEST_TIMEOUT_CODE = 'OPENAI_COMPATIBLE_REQUEST_TIMEOUT';

/**
 * Every code that means "a provider request ran out of time", across both local transports.
 *
 * Two of these are ours ({@link PROVIDER_TIMEOUT_CODE}, {@link OPENAI_COMPATIBLE_REQUEST_TIMEOUT_CODE})
 * and two are Node's socket-layer codes that surface when the transport gives up before either of ours
 * is stamped. Consumers care about the union — "did this attempt time out" — while the individual codes
 * stay distinct facts about WHICH layer gave up, which is why the union lives beside them rather than
 * collapsing them.
 *
 * **Module-private on purpose.** Only {@link isProviderTimeoutCode} crosses the boundary. A `Set` is
 * not protected by `Object.freeze` — `.add()` still succeeds on a frozen one — so an exported set would
 * be a shared mutable classifier that any consumer could widen for every other consumer at once. That
 * is the drift this SSOT exists to remove, so the set does not leave this module and no consumer needs
 * it to: all three ask the same question, and the predicate is that question.
 * @type {Set<String>}
 */
const PROVIDER_TIMEOUT_CODES = Object.freeze(new Set([
    'ESOCKETTIMEDOUT',
    'ETIMEDOUT',
    OPENAI_COMPATIBLE_REQUEST_TIMEOUT_CODE,
    PROVIDER_TIMEOUT_CODE
]));

/**
 * @summary Whether an error code is a provider timeout — the one classifier both local providers share.
 *
 * The membership test itself is trivial; housing it here is the point. This exact four-code list had
 * been re-typed at four call sites with three different shapes (a frozen Set, two inline `||` chains,
 * and a chain that also matches an HTTP contention pattern), so adding a fifth timeout code meant
 * finding all four — and the JSDoc above {@link OPENAI_COMPATIBLE_REQUEST_TIMEOUT_CODE} already records
 * why a coordinated rename can keep every test green while silently restoring retry amplification.
 *
 * **Deliberately narrow.** This answers "did the attempt time out", nothing else. Callers that also
 * treat aborts, an open circuit, or provider-busy responses as terminal COMPOSE those terms around this
 * predicate rather than folding them in: an abort and an open circuit are caller-owned facts with
 * different outcomes, and a predicate that quietly absorbed them would let a cancelled request read as
 * a provider timeout at every consumer at once.
 *
 * @param {String|undefined|null} code The `error.code` to classify.
 * @returns {Boolean} `true` only for a known provider-timeout code.
 */
function isProviderTimeoutCode(code) {
    return PROVIDER_TIMEOUT_CODES.has(code);
}

/**
 * @summary The shared provider-request options contract honored by local providers.
 *
 * @typedef {Object} ProviderTimeoutOptions
 * @property {Number} [timeoutMs] Abort the provider request after this many milliseconds.
 *     Unset/invalid falls back to the provider's default deadline.
 * @property {AbortSignal} [signal] Upstream cancellation signal. When it aborts, the
 *     in-flight request is destroyed when the provider transport supports it.
 * @property {String} [operationLabel] Safe diagnostic label surfaced in the timeout
 *     error message; must never carry prompt content or credentials.
 */

/**
 * @summary Creates the shared provider-timeout error.
 *
 * The message names the provider, operation, timeout budget, host, and model while
 * deliberately omitting prompt content and credentials. `code` is uniform across
 * providers (detection); `provider` preserves the per-provider origin (diagnosis).
 *
 * @param {Object} options
 * @param {String} options.provider Provider id used both in the message prefix and the `provider` field (e.g. 'Ollama').
 * @param {String} options.operationLabel Safe diagnostic label for the caller operation.
 * @param {Number} options.timeoutMs Timeout budget in milliseconds.
 * @param {String} options.host Provider host.
 * @param {String} options.modelName Provider model id.
 * @returns {Error} Error with `code='PROVIDER_TIMEOUT'`, plus `provider` and `timeoutMs` fields.
 */
function createTimeoutError({provider, operationLabel, timeoutMs, host, modelName}) {
    const error = new Error(`[${provider}] ${operationLabel} timed out after ${timeoutMs}ms (host=${host}, model=${modelName})`);

    error.code      = PROVIDER_TIMEOUT_CODE;
    error.provider  = provider;
    error.timeoutMs = timeoutMs;

    return error;
}

export {
    OPENAI_COMPATIBLE_REQUEST_TIMEOUT_CODE,
    PROVIDER_TIMEOUT_CODE,
    createTimeoutError,
    isProviderTimeoutCode
};
