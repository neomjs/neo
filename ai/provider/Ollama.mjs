import Base                 from './Base.mjs';
import {createTimeoutError} from './createTimeoutError.mjs';

const OLLAMA_DURATION_NS_PER_SECOND = 1_000_000_000;

/**
 * @summary Extracts native Ollama top-level request fields from generic
 * provider options while preserving caller-owned option objects.
 *
 * Ollama's `/api/chat` accepts `format` as either `'json'` or a JSON schema.
 * OpenAI-compatible callers may instead provide `response_format`, while Gemini
 * callers historically use `responseSchema`; normalize those into Ollama's
 * native field without leaking them into `payload.options`. Provider-neutral
 * `reasoning_effort: 'none'` maps to Ollama's native `think:false` switch.
 *
 * @param {Object} options Cloned options object that may be mutated by deletion.
 * @returns {Object}
 */
function extractNativeOllamaFields(options) {
    const fields = {};

    if (options.format !== undefined) {
        fields.format = options.format;
        delete options.format;
    } else if (options.responseSchema !== undefined || options.response_schema !== undefined) {
        fields.format = options.responseSchema ?? options.response_schema;
        delete options.responseSchema;
        delete options.response_schema;
    } else if (options.response_format !== undefined) {
        const responseFormat = options.response_format;

        if (responseFormat?.type === 'json_object') {
            fields.format = 'json';
        } else if (responseFormat?.type === 'json_schema') {
            fields.format = responseFormat.json_schema?.schema ?? responseFormat.schema ?? responseFormat.json_schema;
        } else {
            fields.format = responseFormat;
        }

        delete options.response_format;
    } else if (options.responseMimeType === 'application/json' || options.response_mime_type === 'application/json') {
        fields.format = 'json';
    }

    if (options.responseMimeType !== undefined || options.response_mime_type !== undefined) {
        delete options.responseMimeType;
        delete options.response_mime_type;
    }

    if (options.think !== undefined) {
        fields.think = options.think;
        delete options.think;
    } else if (options.reasoning_effort === 'none') {
        fields.think = false;
    }
    delete options.reasoning_effort;

    if (options.maxCompletionTokens !== undefined) {
        if (options.num_predict === undefined) {
            options.num_predict = options.maxCompletionTokens;
        }
        delete options.maxCompletionTokens;
    }
    delete options.maxGeneratedTokens;
    delete options.onProviderChunk;

    return fields;
}

function finiteNumber(value) {
    const parsed = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
    return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * @summary Converts Ollama token-count and duration counters into tokens/second.
 *
 * Native Ollama responses report durations in nanoseconds. Returning `null` for
 * zero/absent duration keeps callers from treating missing telemetry as zero
 * throughput, which would collapse "unknown" into "stuck".
 *
 * @param {Number|String} count Ollama token counter (`eval_count`, `prompt_eval_count`).
 * @param {Number|String} durationNs Ollama duration counter in nanoseconds.
 * @returns {Number|null}
 */
export function calculateOllamaTokensPerSecond(count, durationNs) {
    const tokenCount = finiteNumber(count),
          duration   = finiteNumber(durationNs);

    if (tokenCount === undefined || duration === undefined || duration <= 0) {
        return null;
    }

    return tokenCount / (duration / OLLAMA_DURATION_NS_PER_SECOND);
}

/**
 * @summary Normalizes one native Ollama raw response into a role/model eval sample.
 *
 * The diagnostics daemon needs chat-vs-embedding attribution without learning
 * every caller's response envelope. This helper accepts the raw `/api/chat` or
 * `/api/embed` payload (or a provider result carrying `.raw`) and preserves the
 * counters that Ollama already emits: generated eval, prompt eval, total eval,
 * and tokens/second. Missing counters remain `null` rather than implied zero.
 *
 * @param {Object} payload Native Ollama response payload or provider `{raw}` envelope.
 * @param {Object} [options]
 * @param {'chat'|'embedding'} [options.role] Provider role that produced the sample.
 * @param {String} [options.model] Configured model id fallback when the raw payload omits it.
 * @returns {Object}
 */
export function extractOllamaEvalSample(payload, {role, model} = {}) {
    const raw                  = payload?.raw && typeof payload.raw === 'object' ? payload.raw : payload || {},
          evalCount            = finiteNumber(raw.eval_count),
          evalDurationNs       = finiteNumber(raw.eval_duration),
          promptEvalCount      = finiteNumber(raw.prompt_eval_count),
          promptEvalDurationNs = finiteNumber(raw.prompt_eval_duration),
          totalEvalCount       = [evalCount, promptEvalCount].filter(Number.isFinite).reduce((sum, value) => sum + value, 0),
          totalEvalDurationNs  = [evalDurationNs, promptEvalDurationNs].filter(Number.isFinite).reduce((sum, value) => sum + value, 0),
          hasAnyEvalCounter    = evalCount !== undefined || promptEvalCount !== undefined,
          hasAnyEvalDuration   = evalDurationNs !== undefined || promptEvalDurationNs !== undefined;

    return {
        model                    : model || raw.model || null,
        role                     : role || (Array.isArray(raw.embeddings) ? 'embedding' : 'chat'),
        evalCount                : evalCount ?? null,
        evalDurationNs           : evalDurationNs ?? null,
        evalTokensPerSecond      : calculateOllamaTokensPerSecond(evalCount, evalDurationNs),
        promptEvalCount          : promptEvalCount ?? null,
        promptEvalDurationNs     : promptEvalDurationNs ?? null,
        promptEvalTokensPerSecond: calculateOllamaTokensPerSecond(promptEvalCount, promptEvalDurationNs),
        totalEvalCount           : hasAnyEvalCounter ? totalEvalCount : null,
        totalEvalDurationNs      : hasAnyEvalDuration ? totalEvalDurationNs : null,
        totalTokensPerSecond     : hasAnyEvalCounter && hasAnyEvalDuration
            ? calculateOllamaTokensPerSecond(totalEvalCount, totalEvalDurationNs)
            : null
    };
}

/**
 * @summary Builds a per-model attribution summary from Ollama eval samples.
 *
 * This is the pure data contract for the deployment diagnostics probe: callers
 * collect raw `/api/chat` and `/api/embed` results over their chosen window, then
 * this helper identifies busy versus resident-but-not-progressing models without
 * issuing provider calls itself.
 *
 * @param {Object[]} samples Raw Ollama payloads or normalized eval samples.
 * @param {Object} [options]
 * @param {Number} [options.stuckThresholdTokensPerSecond=0.001] Samples at or below this
 *   observed throughput are classified as stuck when counters are present.
 * @returns {{models: Object[], busyModels: Object[], stuckModels: Object[], primaryLoad: Object|null, roleLoad: Object, primaryRole: Object|null}}
 */
export function buildOllamaEvalAttribution(samples, {stuckThresholdTokensPerSecond = 0.001} = {}) {
    const normalized = (Array.isArray(samples) ? samples : [])
        .map(sample => sample?.totalTokensPerSecond !== undefined ? sample : extractOllamaEvalSample(sample))
        .filter(Boolean);

    const grouped = new Map();

    for (const sample of normalized) {
        const key   = `${sample.role || 'unknown'}:${sample.model || 'unknown'}`;
        let   entry = grouped.get(key);

        if (!entry) {
            entry = {
                model              : sample.model ?? null,
                role               : sample.role ?? 'unknown',
                sampleCount        : 0,
                totalEvalCount     : 0,
                totalEvalDurationNs: 0,
                hasAnyEvalCounter  : false,
                hasAnyEvalDuration : false
            };
            grouped.set(key, entry);
        }

        entry.sampleCount++;

        if (Number.isFinite(sample.totalEvalCount)) {
            entry.totalEvalCount    += sample.totalEvalCount;
            entry.hasAnyEvalCounter  = true;
        }
        if (Number.isFinite(sample.totalEvalDurationNs)) {
            entry.totalEvalDurationNs += sample.totalEvalDurationNs;
            entry.hasAnyEvalDuration  = true;
        }
    }

    const models = [...grouped.values()].map(entry => {
        const tokensPerSecond = entry.hasAnyEvalCounter && entry.hasAnyEvalDuration
            ? calculateOllamaTokensPerSecond(entry.totalEvalCount, entry.totalEvalDurationNs)
            : null;
        const state = !entry.hasAnyEvalCounter || tokensPerSecond === null
            ? 'unknown'
            : tokensPerSecond <= stuckThresholdTokensPerSecond
                ? 'stuck'
                : 'busy';

        return {
            model              : entry.model,
            role               : entry.role,
            sampleCount        : entry.sampleCount,
            totalEvalCount     : entry.hasAnyEvalCounter ? entry.totalEvalCount : null,
            totalEvalDurationNs: entry.hasAnyEvalDuration ? entry.totalEvalDurationNs : null,
            tokensPerSecond,
            state
        };
    });

    const busyModels           = models.filter(sample => sample.state === 'busy'),
          stuckModels          = models.filter(sample => sample.state === 'stuck'),
          primaryLoad          = [...busyModels].sort((a, b) => b.tokensPerSecond - a.tokensPerSecond)[0] || null,
          totalTokensPerSecond = models.reduce((sum, sample) => sum + (Number.isFinite(sample.tokensPerSecond) ? sample.tokensPerSecond : 0), 0),
          roleLoad             = {};

    for (const sample of models) {
        const role = sample.role || 'unknown';

        if (!roleLoad[role]) {
            roleLoad[role] = {
                role,
                modelCount     : 0,
                tokensPerSecond: 0,
                throughputShare: 0
            };
        }

        roleLoad[role].modelCount++;
        if (Number.isFinite(sample.tokensPerSecond)) {
            roleLoad[role].tokensPerSecond += sample.tokensPerSecond;
        }
    }

    for (const role of Object.keys(roleLoad)) {
        roleLoad[role].throughputShare = totalTokensPerSecond > 0
            ? roleLoad[role].tokensPerSecond / totalTokensPerSecond
            : 0;
    }

    return {
        models,
        busyModels,
        stuckModels,
        primaryLoad,
        roleLoad,
        primaryRole: Object.values(roleLoad).sort((a, b) => b.tokensPerSecond - a.tokensPerSecond)[0] || null
    };
}

/**
 * Concrete AI provider for a local Ollama daemon.
 * Uses the native JS Fetch API.
 *
 * @class Neo.ai.provider.Ollama
 * @extends Neo.ai.provider.Base
 */
class OllamaProvider extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.provider.Ollama'
         * @protected
         */
        className: 'Neo.ai.provider.Ollama',
        /**
         * Default API endpoint for Ollama.
         * @member {String} host='http://127.0.0.1:11434'
         */
        host: 'http://127.0.0.1:11434',
        /**
         * @member {String} modelName='gemma4'
         */
        modelName: 'gemma4',
        /**
         * @summary Ollama `/api/chat` keep-alive retention window.
         *
         * `-1` keeps the model resident until explicitly unloaded; callers may
         * override per request with a top-level `keep_alive` option.
         * @member {Number|String} keepAlive=-1
         */
        keepAlive: -1,
        /**
         * Dedicated embedding model (e.g., `nomic-embed-text`, `mxbai-embed-large`).
         * Distinct from `modelName` which is the chat/generation model.
         * Falls back to `modelName` when unset (some Ollama chat models support
         * embeddings, though operators typically configure a dedicated embedding model).
         * @member {String} embeddingModel=null
         */
        embeddingModel: null,
        /**
         * @member {String[]} requiredEnv=[]
         */
        requiredEnv: []
    }

    /**
     * @summary Prepares the native Ollama `/api/chat` payload.
     *
     * Provider-neutral JSON hints are normalized into Ollama's top-level
     * `format` field, preserving legacy `format: 'json'` extraction and adding
     * schema passthrough for callers that can supply structured-output schemas.
     *
     * @param {String|Array} input
     * @param {Object} options
     * @param {Boolean} stream
     * @returns {Object}
     * @protected
     */
    preparePayload(input, options, stream) {
        let messages = [];

        if (typeof input === 'string') {
            messages.push({
                role   : 'user',
                content: input
            });
        } else if (Array.isArray(input)) {
            // Map Neo roles to Ollama roles (system, user, assistant)
            messages = input.map(msg => ({
                role   : msg.role === 'model' ? 'assistant' : msg.role,
                content: String(msg.content)
            }));
        }

        const payload = {
            model : this.modelName,
            messages,
            stream: stream
        };

        const clonedOptions = { ...options };
        delete clonedOptions.operationLabel;
        delete clonedOptions.signal;
        delete clonedOptions.timeoutMs;

        Object.assign(payload, extractNativeOllamaFields(clonedOptions));

        if (clonedOptions.tools && clonedOptions.tools.length > 0) {
            payload.tools = clonedOptions.tools.map(tool => ({
                type    : 'function',
                function: {
                    name       : tool.name,
                    description: tool.description || '',
                    parameters : tool.inputSchema || { type: 'object', properties: {} }
                }
            }));
            delete clonedOptions.tools;
        }

        payload.keep_alive = clonedOptions.keep_alive === undefined ? this.keepAlive : clonedOptions.keep_alive;
        delete clonedOptions.keep_alive;

        // Caller options this provider does not consume — drop them so they don't leak into
        // ollama's `options` bag.
        delete clonedOptions.responseSchema;
        delete clonedOptions.responseSchemaName;
        delete clonedOptions.responseSchemaStrict;
        delete clonedOptions.response_format;

        if (Object.keys(clonedOptions).length > 0) {
            payload.options = clonedOptions;
        }

        return payload;
    }

    /**
     * Generates text completion.
     *
     * @param {String|Array} input Prompt string or message history array.
     * @param {Object} [options]
     * @param {Number} [options.timeoutMs] Abort the request after this many ms of socket inactivity.
     *     For non-streaming Ollama chat (`stream:false`) the server emits no bytes until the full
     *     completion is ready, so the idle timeout acts as an effective total deadline. Defaults to
     *     1 hour when unset/invalid, preserving prior behavior. Lets interactive callers (e.g. KB
     *     `ask` synthesis) fail fast and degrade rather than wait behind a long batch inference.
     * @param {String} [options.operationLabel] Safe diagnostic label surfaced in the timeout error.
     * @param {AbortSignal} [options.signal] Upstream cancellation signal; when it aborts, the in-flight request is destroyed (parity with OpenAiCompatible).
     * @returns {Promise<{content: String, raw: Object, evalSample: Object}>}
     */
    async generate(input, options = {}) {
        const payload          = this.preparePayload(input, options, false);
        const rawTimeoutMs     = Number(options.timeoutMs);
        const requestTimeoutMs = Number.isFinite(rawTimeoutMs) && rawTimeoutMs > 0 ? rawTimeoutMs : 60 * 60 * 1000;
        const operationLabel   = options.operationLabel || 'Ollama chat completion';

        try {
            const parsedUrl  = new URL(`${this.host}/api/chat`);
            const httpModule = parsedUrl.protocol === 'https:' ? await import('https') : await import('http');

            let resolveFunc, rejectFunc;
            const responsePromise = new Promise((res, rej) => {
                resolveFunc = res;
                rejectFunc = rej;
            });

            const req = httpModule.request(parsedUrl, {
                method : 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                signal : options.signal,  // honor upstream cancellation (parity with OpenAiCompatible)
                timeout: requestTimeoutMs // configurable; defaults to 1h (see options.timeoutMs)
            }, (res) => {
                let body = '';
                res.on('data', chunk => body += chunk);
                res.on('end', () => {
                    if (res.statusCode < 200 || res.statusCode >= 300) {
                        rejectFunc(new Error(`Ollama API error: ${res.statusCode} - ${body}`));
                    } else {
                        try {
                            const result = JSON.parse(body);
                            resolveFunc(result);
                        } catch (e) {
                            rejectFunc(new Error(`Failed to parse Ollama response: ${e.message}`));
                        }
                    }
                });
            });

            req.on('error', (err) => {
                rejectFunc(err);
            });

            req.on('timeout', () => {
                req.destroy();
                rejectFunc(createTimeoutError({
                    provider : 'Ollama',
                    operationLabel,
                    timeoutMs: requestTimeoutMs,
                    host     : this.host,
                    modelName: this.modelName
                }));
            });

            req.write(JSON.stringify(payload));
            req.end();

            const result = await responsePromise;

            const resultPayload = {
                content   : result.message?.content || '',
                raw       : result,
                evalSample: extractOllamaEvalSample(result, {
                    role : 'chat',
                    model: this.modelName
                })
            };

            if (result.message?.tool_calls && result.message.tool_calls.length > 0) {
                resultPayload.toolCalls = result.message.tool_calls.map(c => ({
                    function: {
                        name     : c.function.name,
                        arguments: c.function.arguments
                    }
                }));
            }

            return resultPayload;
        } catch (error) {
            // Re-throw to let the caller handle it or gracefully degrade
            // instead of vomiting a raw fetch trace if the daemon is offline
            throw error;
        }
    }

    /**
     * @summary Generates embedding vectors for one or more input texts via Ollama's
     * native `/api/embed` endpoint.
     *
     * The native endpoint accepts a string OR array-of-strings for `input` and returns
     * `{embeddings: number[][]}`. Always returns an array-of-arrays for caller
     * uniformity — single-string callers receive `[[...]]` shape just like batch.
     *
     * Distinct from the OpenAI-compatible `/v1/embeddings` path: this uses Ollama's
     * native API (matches the rest of this provider class) so operators who explicitly
     * choose `embeddingProvider: 'ollama'` get the native semantics without depending
     * on Ollama's OpenAI-compat surface.
     *
     * Uses the `embeddingModel` config slot when set; falls back to `modelName` (the
     * chat model) if `embeddingModel` is unset — Ollama supports embeddings from many
     * chat models but operators typically want a dedicated embedding model like
     * `nomic-embed-text`.
     *
     * @param {String|String[]} input Single text or array of texts to embed.
     * @param {Object} [options]
     * @param {String} [options.model] Override the configured `embeddingModel` / `modelName`.
     * @param {Boolean} [options.truncate=false] Whether Ollama may truncate inputs over context.
     * @param {Number} [options.num_ctx] Native Ollama context window for this embedding request.
     * @param {Number} [options.timeoutMs] Abort the request after this many ms of socket inactivity.
     * @param {String} [options.operationLabel] Safe diagnostic label surfaced in the timeout error.
     * @param {AbortSignal} [options.signal] Upstream cancellation signal.
     * @returns {Promise<{embeddings: Number[][], raw: Object, evalSample: Object}>}
     */
    async embed(input, options = {}) {
        const {
            dimensions,
            keep_alive,
            model: modelOverride,
            operationLabel = 'Ollama embedding request',
            signal,
            timeoutMs,
            truncate = false,
            ...ollamaOptions
        } = options;
        const model            = modelOverride || this.embeddingModel || this.modelName;
        const rawTimeoutMs     = Number(timeoutMs);
        const requestTimeoutMs = Number.isFinite(rawTimeoutMs) && rawTimeoutMs > 0 ? rawTimeoutMs : 60 * 60 * 1000;
        const payload          = {
            model,
            input,
            truncate
        };

        if (keep_alive !== undefined) {
            payload.keep_alive = keep_alive;
        }
        if (dimensions !== undefined) {
            payload.dimensions = dimensions;
        }
        if (Object.keys(ollamaOptions).length > 0) {
            payload.options = ollamaOptions;
        }

        try {
            const parsedUrl  = new URL(`${this.host}/api/embed`);
            const httpModule = parsedUrl.protocol === 'https:' ? await import('https') : await import('http');

            let resolveFunc, rejectFunc;
            const responsePromise = new Promise((res, rej) => {
                resolveFunc = res;
                rejectFunc  = rej;
            });

            const req = httpModule.request(parsedUrl, {
                method : 'POST',
                headers: {'Content-Type': 'application/json'},
                signal,
                timeout: requestTimeoutMs
            }, (res) => {
                let body = '';
                res.on('data', chunk => body += chunk);
                res.on('end', () => {
                    if (res.statusCode < 200 || res.statusCode >= 300) {
                        rejectFunc(new Error(`Ollama embed API error: ${res.statusCode} - ${body}`));
                    } else {
                        try {
                            const result = JSON.parse(body);
                            resolveFunc(result);
                        } catch (e) {
                            rejectFunc(new Error(`Failed to parse Ollama embed response: ${e.message}`));
                        }
                    }
                });
            });

            req.on('error', err => rejectFunc(err));

            req.on('timeout', () => {
                req.destroy();
                rejectFunc(createTimeoutError({
                    provider : 'Ollama',
                    operationLabel,
                    timeoutMs: requestTimeoutMs,
                    host     : this.host,
                    modelName: model
                }));
            });

            req.write(JSON.stringify(payload));
            req.end();

            const result = await responsePromise;
            return {
                embeddings: result.embeddings || [],
                raw       : result,
                evalSample: extractOllamaEvalSample(result, {
                    role: 'embedding',
                    model
                })
            };
        } catch (error) {
            throw error;
        }
    }

    /**
     * @summary Streams text completion.
     *
     * The timeout is an IDLE timer, re-armed on every chunk — not a total deadline. That distinction
     * is the whole design: a stream's legitimate lifetime is unbounded, so a flat deadline would kill
     * healthy long generations, while a stalled provider that stops sending is exactly the condition
     * a consumer cannot detect on its own. `generate()`'s socket-level `timeout` has the same
     * inactivity semantics; this reproduces them over `fetch`, which has no idle option of its own.
     *
     * @param {String|Array} input
     * @param {Object} [options]
     * @param {Number} [options.timeoutMs] Idle timeout between chunks. Defaults to 1 hour, matching
     *     `generate()`, so existing callers keep their prior effective behaviour.
     * @param {AbortSignal} [options.signal] Upstream cancellation signal; when it aborts, the
     *     in-flight request is destroyed (parity with `generate()` and OpenAiCompatible).
     * @param {String} [options.operationLabel] Safe diagnostic label surfaced in the timeout error.
     * @returns {AsyncGenerator<String>} Yields text chunks.
     */
    async *stream(input, options = {}) {
        const payload        = this.preparePayload(input, options, true),
              rawTimeoutMs   = Number(options.timeoutMs),
              idleTimeoutMs  = Number.isFinite(rawTimeoutMs) && rawTimeoutMs > 0 ? rawTimeoutMs : 60 * 60 * 1000,
              operationLabel = options.operationLabel || 'Ollama chat stream',
              controller     = new AbortController();

        let idleTimer  = null,
            reader     = null,
            readerDone = false,
            timedOut   = false;

        const armIdleTimer = () => {
            clearTimeout(idleTimer);
            idleTimer = setTimeout(() => {
                timedOut = true;
                controller.abort()
            }, idleTimeoutMs);
            // Never hold the process open on this timer alone.
            idleTimer.unref?.()
        };

        // An already-aborted upstream signal must not start the request at all.
        const abortFromUpstream = () => controller.abort();

        options.signal?.addEventListener('abort', abortFromUpstream, {once: true});
        if (options.signal?.aborted) controller.abort();

        try {
            armIdleTimer();

            const response = await fetch(`${this.host}/api/chat`, {
                method : 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body  : JSON.stringify(payload),
                signal: controller.signal
            });

            if (!response.ok) {
                const text = await response.text();
                throw new Error(`Ollama API error: ${response.status} - ${text}`);
            }

            reader = response.body.getReader();

            const decoder = new TextDecoder('utf-8');

            while (true) {
                const {done, value} = await reader.read();

                if (done) {
                    // Natural end: the transport is already finished, so `finally` must NOT cancel or
                    // abort. Without this flag the cleanup below cannot tell a completed stream from
                    // an abandoned one.
                    readerDone = true;
                    break
                }

                // Progress re-arms the deadline: the timer measures SILENCE, not duration.
                armIdleTimer();

                const chunkText = decoder.decode(value, {stream: true});

                // Ollama returns newline delimited JSON for streams
                const lines = chunkText.split('\n').filter(line => line.trim() !== '');

                for (const line of lines) {
                    try {
                        const data = JSON.parse(line);
                        if (data.message && typeof data.message.content === 'string') {
                            yield data.message.content;
                        }
                    } catch (e) {
                         // Ignore incomplete JSON chunks boundary issues
                    }
                }
            }
        } catch (error) {
            // Distinguish OUR deadline from the caller's cancellation. Both surface as an
            // AbortError from `fetch`, and reporting a stalled provider as "cancelled" would send
            // the next reader looking for a caller that never asked to stop.
            if (timedOut) {
                throw createTimeoutError({
                    provider : 'Ollama',
                    operationLabel,
                    timeoutMs: idleTimeoutMs,
                    host     : this.host,
                    modelName: this.modelName
                })
            }

            // Re-throw to let the caller handle it or gracefully degrade
            throw error;
        } finally {
            clearTimeout(idleTimer);
            options.signal?.removeEventListener('abort', abortFromUpstream);

            // **A consumer that simply stops iterating is an ordinary terminal, and it was the leak.**
            // `break` out of a `for await`, an early `return`, or a throw in the loop body resumes this
            // generator at its `yield` with a return completion — so this block runs while the HTTP
            // request is still live and nobody is reading it. Clearing the idle timer alone therefore
            // removed the only bound the request had left: measured against a real server as
            // `{requestClosed: false, connections: 1}`, which is the same unbounded-request class the
            // timer exists to prevent, reached by a path that never touches the timer.
            //
            // Cancelling the reader releases the body; aborting the controller closes the socket. Both
            // are gated on `readerDone` so natural completion stays untouched — there the transport has
            // already finished, and aborting it would turn a clean stream into a cancelled one.
            if (reader && !readerDone) {
                try {
                    await reader.cancel()
                } catch (error) {
                    // The reader is discarded either way. A failing cancel must not replace the
                    // caller's own error — or their clean early return — with one about cleanup.
                }
            }

            !readerDone && !controller.signal.aborted && controller.abort()
        }
    }
}

export default Neo.setupClass(OllamaProvider);
