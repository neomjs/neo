/**
 * @summary Shared interactive-timeout contract for the local chat providers.
 *
 * Both {@link Neo.ai.provider.OpenAiCompatible} and {@link Neo.ai.provider.Ollama}
 * throw the exact error shape produced here, so a caller can detect a provider
 * timeout via a single uniform `error.code` regardless of which provider served the
 * request. Housing the helper plus the documented `generate(options)` contract in one
 * module keeps the two parallel provider implementations from silently drifting apart
 * (their transport differs — `fetch` + `AbortController` vs node `http.request` — but
 * the observable contract here must stay uniform).
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
 * @summary The shared interactive options contract honored by every local chat
 * provider's `generate(input, options)` / `stream(input, options)`.
 *
 * @typedef {Object} ProviderGenerateOptions
 * @property {Number} [timeoutMs] Abort the provider request after this many milliseconds.
 *     Unset/invalid falls back to the provider's default deadline.
 * @property {AbortSignal} [signal] Upstream cancellation signal. When it aborts, the
 *     in-flight request is destroyed — both providers honor it identically.
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
 * @param {String} options.modelName Chat model id.
 * @returns {Error} Error with `code='PROVIDER_TIMEOUT'`, plus `provider` and `timeoutMs` fields.
 */
function createTimeoutError({provider, operationLabel, timeoutMs, host, modelName}) {
    const error = new Error(`[${provider}] ${operationLabel} timed out after ${timeoutMs}ms (host=${host}, model=${modelName})`);

    error.code      = PROVIDER_TIMEOUT_CODE;
    error.provider  = provider;
    error.timeoutMs = timeoutMs;

    return error;
}

export {PROVIDER_TIMEOUT_CODE, createTimeoutError};
