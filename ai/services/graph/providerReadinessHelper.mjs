import http       from 'http';
import {execFile} from 'child_process';
import os         from 'os';
import path       from 'path';
import aiConfig   from '../../mcp/server/memory-core/config.mjs';
import logger     from '../../mcp/server/memory-core/logger.mjs';
import {
    buildOllamaEvalAttribution,
    extractOllamaEvalSample
} from '../../provider/Ollama.mjs';
import {
    isGraphModelProviderSupported,
    isOpenAiCompatibleProvider,
    resolveGraphModelProvider
} from './providerDispatch.mjs';
import {
    withLmsEmbeddingInputSuffix
} from '../shared/vector/lmsEmbeddingInputSuffix.mjs';
import {
    observeUnqueuedProviderActivity
} from '../shared/providerActivityLedger.mjs';

let openAiCompatibleEmbeddingServingProbeQueue = Promise.resolve(),
    lmsResidencyMutationQueue                  = Promise.resolve();

const
    providerDiscoveryCache         = new Map(),
    providerDiscoveryForceInflight = new Map(),
    ollamaWarmInflight             = new Map(),
    PROVIDER_DISCOVERY_FORCE       = 'force',
    PROVIDER_DISCOVERY_ROUTINE     = 'routine';

/**
 * @summary Stable code for a readiness caller whose Ollama warm wait ended before provider work.
 * @type {String}
 */
export const OLLAMA_WARM_PROVIDER_PENDING_CODE = 'OLLAMA_WARM_PROVIDER_PENDING';

/**
 * Default LM Studio CLI bin directory. `lms bootstrap` installs the CLI here; an interactive shell
 * has it on PATH, but a daemon / MCP-server launch env often does not — so a bare `execFile('lms', …)`
 * ENOENTs and false-negatives the provider as unavailable while it is actually healthy (blocking
 * KB + Memory Core embedding ops).
 * @type {String}
 */
const LMS_DEFAULT_BIN_DIR = path.join(os.homedir(), '.lmstudio', 'bin');

/**
 * @summary Builds execFile options for the `lms` CLI with its bin dir guaranteed on PATH.
 *
 * Augmenting PATH here makes the `lms` readiness probe (`fetchLmsLoadedModels`) robust to the launch
 * env, fixing `spawn lms ENOENT` false-negatives. Idempotent — never duplicates an already-present bin
 * dir. The caller's extra options are preserved, INCLUDING a caller-supplied `extra.env` (merged, not
 * clobbered). (The `lms` load/unload spawns carry the same fragility — a noted follow-up — but their
 * tests assert a 3-arg execFile signature, so they stay out of this slice.)
 *
 * @param {Object} [extra={}] Extra execFile options (e.g. `{timeout}`, `{env}`) merged into the result.
 * @returns {Object} execFile options carrying an augmented `PATH` env (caller `extra.env` preserved).
 */
/**
 * @summary True when an OBSERVED model id satisfies a REQUIRED one. Directional, and Ollama-only.
 *
 * Ollama canonicalises stored models to `name:tag` and reports an untagged pull as `name:latest`.
 * Our config carries the untagged name — `NEO_OLLAMA_EMBEDDING_MODEL=qwen3-embedding` is valid Ollama
 * and what every deployment uses — so an exact comparison reports a **resident** model as missing,
 * permanently: warming it produces the same `:latest` id that already failed to match.
 *
 * That false negative is not cosmetic. It reaches an actuator — `missingModels` becomes
 * `missing-required-model`, which `ContainerHealthDiagnosisService` classes as recoverable and answers
 * with `warmProvider`. The requirement can never be satisfied, so the warm has no exit.
 *
 * **Three bounds, each of which a laxer rule would break:**
 *
 * 1. **Directional.** Only an UNTAGGED requirement accepts a `:latest` observation. A requirement
 *    written `x:latest` is a pin and stays exact — equivalence must not erase which side owns the
 *    requirement, or a config pin silently becomes a suggestion.
 * 2. **Ollama-only.** LM Studio ids carry no implicit tag (`google/gemma-4-26b-a4b` is the whole id),
 *    so folding tags there would accept a model the deployment does not serve.
 * 3. **`:latest` only.** `qwen3-embedding:8b` and `qwen3-embedding:4b` are different models with
 *    different vector dimensions. Collapsing arbitrary tags would let a plane embed against the wrong
 *    model and corrupt a corpus — far worse than the loop this fixes.
 *
 * @param {*} required Configured model id (owns the requirement).
 * @param {*} observed Model id reported by the provider.
 * @param {String} provider Provider key; only `'ollama'` carries the implicit-tag semantics.
 * @returns {Boolean}
 */
export function satisfiesRequiredModelId(required, observed, provider) {
    if (typeof required !== 'string' || typeof observed !== 'string' || !required) {
        return false;
    }

    if (required === observed) {
        return true;
    }

    return provider === 'ollama' && !required.includes(':') && observed === `${required}:latest`;
}

/**
 * @summary Resolves which REQUIRED id (if any) an observed id satisfies — the keyed-lookup form of
 * `satisfiesRequiredModelId`, for maps whose keys are configured ids.
 *
 * Needed wherever a requirement is looked up BY the observed id: a `Map` keyed on the configured
 * `qwen3-embedding` misses an observed `qwen3-embedding:latest`, and a missed context requirement is
 * a requirement not enforced — a low-context alias would pass the very check meant to reject it.
 *
 * @param {*} observed Model id reported by the provider.
 * @param {Iterable<String>} requiredIds Configured ids.
 * @param {String} provider
 * @returns {String|null} The satisfied required id, or null.
 */
export function resolveRequiredModelId(observed, requiredIds, provider) {
    for (const required of requiredIds) {
        if (satisfiesRequiredModelId(required, observed, provider)) {
            return required;
        }
    }

    return null;
}

export function lmsExecOptions(extra = {}) {
    // Merge the caller's env (if any) over process.env, then derive + augment PATH from THAT merged env,
    // so a caller-supplied `extra.env` (and its own PATH) is preserved rather than clobbered.
    const baseEnv = {...process.env, ...(extra.env || {})},
          sep     = process.platform === 'win32' ? ';' : ':',
          curr    = baseEnv.PATH || '',
          PATH    = curr.split(sep).includes(LMS_DEFAULT_BIN_DIR)
              ? curr
              : (curr ? `${curr}${sep}${LMS_DEFAULT_BIN_DIR}` : LMS_DEFAULT_BIN_DIR);

    return {...extra, env: {...baseEnv, PATH}};
}

/**
 * @module ai/services/graph/ProviderReadinessHelper
 */

/**
 * @summary Resolves the OpenAI-compatible host used by one REM graph-provider option.
 * @param {Object} config
 * @returns {String|undefined}
 */
export function getOpenAiCompatibleHost(config = aiConfig) {
    return config.openAiCompatible?.host;
}

/**
 * @summary Clears provider-discovery caches for deterministic tests and explicit diagnostics.
 * @returns {void}
 */
export function clearProviderDiscoveryProbeCache() {
    providerDiscoveryCache.clear();
    providerDiscoveryForceInflight.clear();
}

/**
 * @summary Validates the requested provider-discovery freshness contract.
 * @param {Object} options
 * @param {String} options.freshness Either `force` or `routine`.
 * @param {Number} [options.cacheTtlMs] Routine-cache freshness window.
 * @param {String} options.caller Caller name for fail-loud errors.
 * @returns {void}
 */
function assertProviderDiscoveryFreshness({freshness, cacheTtlMs, caller}) {
    if (![PROVIDER_DISCOVERY_FORCE, PROVIDER_DISCOVERY_ROUTINE].includes(freshness)) {
        throw new TypeError(`${caller}: freshness must be '${PROVIDER_DISCOVERY_FORCE}' or '${PROVIDER_DISCOVERY_ROUTINE}'`);
    }

    if (freshness === PROVIDER_DISCOVERY_ROUTINE && (!Neo.isNumber(cacheTtlMs) || cacheTtlMs < 0)) {
        throw new TypeError(`${caller}: cacheTtlMs must be a non-negative number for routine provider discovery`);
    }
}

/**
 * @summary Runs one provider-discovery probe with routine TTL caching or force-fresh coalescing.
 * @param {Object} options
 * @param {String} options.key Stable probe identity.
 * @param {String} options.freshness Either `force` or `routine`.
 * @param {Number} [options.cacheTtlMs] Routine-cache freshness window.
 * @param {String} options.caller Caller name for fail-loud errors.
 * @param {Function} options.runProbe Probe executor.
 * @returns {Promise<*>}
 */
async function runProviderDiscoveryProbe({
    key,
    freshness = PROVIDER_DISCOVERY_FORCE,
    cacheTtlMs,
    caller,
    runProbe
}) {
    assertProviderDiscoveryFreshness({freshness, cacheTtlMs, caller});

    if (freshness === PROVIDER_DISCOVERY_ROUTINE) {
        const
            cached = providerDiscoveryCache.get(key),
            now    = Date.now();

        if (cached?.promise) {
            return cached.promise;
        }

        if (cached && now <= cached.expiresAt) {
            return cached.value;
        }

        const promise = Promise.resolve()
            .then(runProbe)
            .then(value => {
                providerDiscoveryCache.set(key, {
                    value,
                    expiresAt: Date.now() + cacheTtlMs
                });

                return value;
            })
            .catch(error => {
                if (providerDiscoveryCache.get(key)?.promise === promise) {
                    providerDiscoveryCache.delete(key);
                }

                throw error;
            });

        providerDiscoveryCache.set(key, {promise});
        return promise;
    }

    const forceKey = `${PROVIDER_DISCOVERY_FORCE}:${key}`;

    if (providerDiscoveryForceInflight.has(forceKey)) {
        return providerDiscoveryForceInflight.get(forceKey);
    }

    const promise = Promise.resolve()
        .then(runProbe)
        .finally(() => providerDiscoveryForceInflight.delete(forceKey));

    providerDiscoveryForceInflight.set(forceKey, promise);
    return promise;
}

/**
 * @summary Extracts model identifiers from an OpenAI-compatible `/v1/models` payload.
 *
 * LM Studio, MLX, vLLM, and llama.cpp-compatible servers all expose the OpenAI
 * `data: [{id}]` shape for this endpoint. The extra `model` / `name` fallbacks
 * keep the readiness probe tolerant of local-server variants without changing the
 * public contract.
 *
 * @param {Object} payload Parsed `/v1/models` response.
 * @returns {String[]}
 */
export function getOpenAiCompatibleModelIds(payload) {
    if (!Array.isArray(payload?.data)) {
        return [];
    }

    return payload.data
        .map(item => item?.id || item?.model || item?.name)
        .filter(Boolean);
}

/**
 * @summary Converts CLI/API numeric fields into finite numbers when possible.
 * @param {*} value Candidate numeric value.
 * @returns {Number|undefined}
 */
function toFiniteNumber(value) {
    if (Neo.isNumber(value)) {
        return value;
    }

    if (typeof value === 'string' && value.trim() !== '') {
        const parsed = Number(value);

        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }
}

/**
 * @summary Reads the first finite numeric value from a row using tolerant field aliases.
 * @param {Object} row Parsed LM Studio `lms ps --json` row.
 * @param {String[]} keys Candidate field names.
 * @returns {Number|undefined}
 */
function readNumericField(row, keys) {
    for (const key of keys) {
        const value = toFiniteNumber(row?.[key]);

        if (value !== undefined) {
            return value;
        }
    }
}

/**
 * @summary Checks an observed LM Studio parallel value only when the CLI exposes it.
 *
 * `lms ps --json` can report `parallel: null` for embedding rows even when the
 * desktop UI shows a configured value. Unknown telemetry is diagnostic, not an
 * unsatisfiable repair loop. Numeric mismatches still fail loud for roles whose
 * parallel value is observable, such as chat rows.
 *
 * @param {*} observedParallel Loaded-model parallel value.
 * @param {*} requiredParallel Configured required parallel value.
 * @returns {Boolean}
 */
function isObservedLmsParallelSufficient(observedParallel, requiredParallel) {
    return !Neo.isNumber(requiredParallel) ||
        !Neo.isNumber(observedParallel) ||
        observedParallel === requiredParallel;
}

/**
 * @summary Checks whether an LM Studio loaded-model identifier belongs to a configured model.
 *
 * LM Studio appends numeric suffixes (`:2`, `:3`, etc.) when the same model is
 * loaded more than once. Matching only numeric suffixes avoids conflating
 * legitimate colon-bearing model keys with unrelated model identifiers.
 *
 * @param {String} id Loaded-model identifier reported by `lms ps`.
 * @param {String} model Configured model id.
 * @returns {Boolean}
 */
function matchesLmsLoadedModelId(id, model) {
    if (!id || !model) {
        return false;
    }

    if (id === model) {
        return true;
    }

    if (!id.startsWith(`${model}:`)) {
        return false;
    }

    return /^[1-9]\d*$/.test(id.slice(model.length + 1));
}

/**
 * @summary Checks whether an exact LM Studio resident model satisfies the configured shape.
 * @param {Object} options
 * @param {Object} options.loadedModel Parsed `lms ps --json` row for the exact model id.
 * @param {String} options.model Configured model id.
 * @param {Object} [options.contextLengths] Per-model required context lengths.
 * @param {Object} [options.parallels] Per-model required parallel slots.
 * @returns {Boolean}
 */
function isLmsLoadedModelSufficient({
    loadedModel,
    model,
    contextLengths = {},
    parallels      = {}
} = {}) {
    if (!loadedModel) {
        return false;
    }

    const requiredContext  = contextLengths?.[model],
          requiredParallel = parallels?.[model],
          hasContextGate   = Neo.isNumber(requiredContext),
          hasParallelGate  = Neo.isNumber(requiredParallel);

    if (hasContextGate && (!Neo.isNumber(loadedModel.contextLength) || loadedModel.contextLength < requiredContext)) {
        return false;
    }

    if (hasParallelGate && !isObservedLmsParallelSufficient(loadedModel.parallel, requiredParallel)) {
        return false;
    }

    return true;
}

/**
 * @summary Extracts loaded LM Studio model metadata from `lms ps --json`.
 *
 * LM Studio CLI output has evolved across versions, so this normalizer accepts
 * common array/object envelopes and field aliases while preserving only the
 * readiness facts Neo needs: model id, loaded context length, and parallel slots.
 *
 * @param {Object[]|Object} payload Parsed JSON payload from `lms ps --json`.
 * @returns {Object[]}
 */
export function getLmsLoadedModels(payload) {
    const rows = Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.models)
            ? payload.models
            : Array.isArray(payload?.data)
                ? payload.data
                : Array.isArray(payload?.loadedModels)
                    ? payload.loadedModels
                    : [];

    const models = [];
    const seen   = new Set();

    for (const row of rows) {
        const id = row?.id || row?.identifier || row?.model || row?.name || row?.path || row?.modelKey;

        if (!id || seen.has(id)) {
            continue;
        }

        seen.add(id);
        const model = {
            id,
            contextLength: readNumericField(row, [
                'contextLength',
                'context_length',
                'context',
                'contextWindow',
                'context_window',
                'n_ctx',
                'num_ctx'
            ]),
            parallel: readNumericField(row, [
                'parallel',
                'parallelism',
                'slots',
                'numParallel',
                'num_parallel'
            ])
        };

        for (const key of ['type', 'modelKey', 'format', 'displayName', 'publisher', 'path', 'indexedModelIdentifier', 'architecture']) {
            if (row?.[key] !== undefined) {
                model[key] = row[key];
            }
        }

        models.push(model);
    }

    return models;
}

/**
 * @summary Fetches loaded LM Studio model metadata using the CLI's JSON surface.
 * @param {Object} options
 * @param {Number} options.timeoutMs CLI timeout. Required; no module-level default.
 * @param {Function} [options.execFileFn=execFile] Child-process seam for tests.
 * @param {String} [options.freshness='force'] `routine` enables TTL caching; `force` bypasses completed cache.
 * @param {Number} [options.cacheTtlMs] Required for routine caching.
 * @param {AbortSignal} [options.signal] Caller-owned cancellation signal. Signal-bearing probes are
 *     intentionally not coalesced because one caller must not abort another caller's shared child.
 * @returns {Promise<Object[]>}
 */
export function fetchLmsLoadedModels({
    timeoutMs,
    execFileFn = execFile,
    freshness  = PROVIDER_DISCOVERY_FORCE,
    cacheTtlMs,
    signal
} = {}) {
    if (typeof timeoutMs !== 'number') {
        return Promise.reject(new TypeError('fetchLmsLoadedModels: timeoutMs is required'));
    }

    const runProbe = () => new Promise((resolve, reject) => {
        if (signal?.aborted) {
            const abortError = signal.reason instanceof Error ? signal.reason : Object.assign(
                new Error('fetchLmsLoadedModels aborted'),
                {name: 'AbortError', code: 'ABORT_ERR'}
            );

            reject(abortError);
            return;
        }

        execFileFn('lms', ['ps', '--json'], lmsExecOptions({timeout: timeoutMs, ...(signal ? {signal} : {})}), (error, stdout = '', stderr = '') => {
            if (error) {
                const isCallerAbort = signal?.aborted && (
                    error === signal.reason ||
                    error?.cause === signal.reason ||
                    error?.name === 'AbortError' ||
                    error?.code === 'ABORT_ERR'
                );

                if (isCallerAbort) {
                    reject(signal.reason instanceof Error ? signal.reason : error);
                    return;
                }

                reject(new Error(`lms ps --json failed: ${error.message}${stderr ? `; stderr=${stderr.trim()}` : ''}`));
                return;
            }

            try {
                resolve(getLmsLoadedModels(JSON.parse(stdout || '[]')));
            } catch (parseError) {
                reject(new Error(`lms ps --json returned invalid JSON: ${parseError.message}`));
            }
        });
    });

    if (signal) {
        assertProviderDiscoveryFreshness({freshness, cacheTtlMs, caller: 'fetchLmsLoadedModels'});
        return runProbe();
    }

    return runProviderDiscoveryProbe({
        key   : `lms-loaded-models:${timeoutMs}`,
        freshness,
        cacheTtlMs,
        caller: 'fetchLmsLoadedModels',
        runProbe
    });
}

/**
 * @summary Finds loaded LM Studio siblings superseded by a verified exact model id.
 *
 * The configured model id must stay resident because downstream OpenAI-compatible
 * calls target that id. Once that exact id has the desired context/parallel shape,
 * suffixed duplicate siblings are stale resident memory and should be unloaded.
 *
 * @param {Object} options
 * @param {Object[]} options.loadedModels Parsed `lms ps --json` models.
 * @param {String[]} options.requiredModels Required configured model ids.
 * @param {Object} [options.contextLengths] Per-model required context lengths.
 * @param {Object} [options.parallels] Per-model required parallel slots.
 * @returns {Object[]}
 */
export function getSupersededLmsLoadedModels({
    loadedModels,
    requiredModels,
    contextLengths = {},
    parallels      = {}
} = {}) {
    const models     = Array.isArray(loadedModels) ? loadedModels : [],
          byId       = new Map(models.map(item => [item.id, item])),
          superseded = [];

    for (const model of requiredModels || []) {
        if (!isLmsLoadedModelSufficient({
            loadedModel: byId.get(model),
            model,
            contextLengths,
            parallels
        })) {
            continue;
        }

        for (const item of models) {
            if (item.id !== model && matchesLmsLoadedModelId(item.id, model)) {
                superseded.push({
                    ...item,
                    model
                });
            }
        }
    }

    return superseded;
}

/**
 * @summary Extracts currently loaded model identifiers from an Ollama `/api/ps` payload.
 *
 * Native Ollama exposes currently resident models as `models: [{name, model}]`.
 * `id` is accepted as a tolerance seam for compatible local-server variants, but
 * the returned list still represents observed residency, not a config default.
 *
 * @param {Object} payload Parsed `/api/ps` response.
 * @returns {String[]}
 */
export function getOllamaRunningModelIds(payload) {
    return getOllamaRunningModels(payload).map(item => item.id);
}

/**
 * @summary Extracts resident native Ollama model metadata from `/api/ps`.
 *
 * Ollama reports the loaded context as `context_length` per running model. The
 * readiness layer preserves it so a model that is merely resident at the default
 * 4K-ish context window cannot satisfy Neo's configured local-model context cap.
 *
 * @param {Object} payload Parsed `/api/ps` response.
 * @returns {Object[]}
 */
export function getOllamaRunningModels(payload) {
    if (!Array.isArray(payload?.models)) {
        return [];
    }

    const models = [];
    const seen   = new Set();

    for (const item of payload.models) {
        const id = item?.name || item?.model || item?.id;
        if (!id || seen.has(id)) {
            continue;
        }

        seen.add(id);
        models.push({
            id,
            contextLength: Neo.isNumber(item?.context_length) ? item.context_length : undefined
        });
    }

    return models;
}

/**
 * @summary Fetches model ids from an OpenAI-compatible provider.
 *
 * @param {Object} options
 * @param {String} options.host Provider host.
 * @param {Number} options.timeoutMs HTTP timeout. Required; no module-level default.
 * @param {Function} [options.fetchFn=fetch] Fetch seam for tests.
 * @param {String} [options.freshness='force'] `routine` enables TTL caching; `force` bypasses completed cache.
 * @param {Number} [options.cacheTtlMs] Required for routine caching.
 * @returns {Promise<String[]>}
 */
export async function fetchOpenAiCompatibleModelIds({
    host,
    timeoutMs,
    fetchFn    = fetch,
    freshness  = PROVIDER_DISCOVERY_FORCE,
    cacheTtlMs
} = {}) {
    if (!host) {
        throw new TypeError('fetchOpenAiCompatibleModelIds: host is required');
    }
    if (typeof timeoutMs !== 'number') {
        throw new TypeError('fetchOpenAiCompatibleModelIds: timeoutMs is required');
    }

    return runProviderDiscoveryProbe({
        key   : `openai-compatible-models:${host}:${timeoutMs}`,
        freshness,
        cacheTtlMs,
        caller: 'fetchOpenAiCompatibleModelIds',
        async runProbe() {
            const url      = new URL('/v1/models', host).toString();
            const response = await fetchFn(url, {
                method: 'GET',
                signal: AbortSignal.timeout(timeoutMs)
            });

            if (!response.ok) {
                const text = typeof response.text === 'function' ? await response.text() : '';
                throw new Error(`OpenAI-compatible model enumeration failed: HTTP ${response.status}${text ? ` - ${text}` : ''}`);
            }

            return getOpenAiCompatibleModelIds(await response.json());
        }
    });
}

/**
 * @summary Runs one tiny OpenAI-compatible embedding-serving canary.
 *
 * This probe verifies `/v1/embeddings` can serve the configured embedding model
 * without returning or logging vector bodies. The caller owns load gating through
 * `shouldRun`; a skipped decision returns an explicit degraded envelope instead
 * of issuing a provider request during heavy maintenance or known contention.
 *
 * @param {Object} options
 * @param {String} options.host Provider host.
 * @param {String} options.model Embedding model identifier.
 * @param {String} options.input Tiny canary text. Required and capped at 256 UTF-8 bytes.
 * @param {Number} options.timeoutMs HTTP timeout. Required; no module-level default.
 * @param {String} [options.apiKey] Optional OpenAI-compatible bearer token.
 * @param {Object[]} [options.lmsLoadedModels] Optional LMS metadata rows for suffix parity with TextEmbeddingService.
 * @param {Function} [options.fetchFn=fetch] Fetch seam for tests.
 * @param {Function} [options.shouldRun] Optional load/backpressure gate.
 * @returns {Promise<Object>}
 */
export async function checkOpenAiCompatibleEmbeddingServing({
    host,
    model,
    input,
    timeoutMs,
    apiKey,
    lmsLoadedModels = [],
    fetchFn = fetch,
    shouldRun
} = {}) {
    if (!host) {
        throw new TypeError('checkOpenAiCompatibleEmbeddingServing: host is required');
    }
    if (!model) {
        throw new TypeError('checkOpenAiCompatibleEmbeddingServing: model is required');
    }
    if (typeof timeoutMs !== 'number') {
        throw new TypeError('checkOpenAiCompatibleEmbeddingServing: timeoutMs is required');
    }
    if (!Neo.isString(input) || input.length === 0) {
        throw new TypeError('checkOpenAiCompatibleEmbeddingServing: non-empty input is required');
    }
    if (Buffer.byteLength(input, 'utf8') > 256) {
        throw new TypeError('checkOpenAiCompatibleEmbeddingServing: input must be <= 256 UTF-8 bytes');
    }

    const gate = shouldRun ? await shouldRun({host, model, timeoutMs}) : true;

    if (gate === false || gate?.run === false || gate?.skipped === true) {
        return {
            ready   : false,
            degraded: true,
            skipped : true,
            provider: 'openAiCompatible',
            host,
            model,
            reason  : gate?.reason || 'embedding-serving-canary-skipped',
            warning : gate?.warning || `[provider/openAiCompatible] embedding-serving canary skipped for '${model}': ${gate?.reason || 'load gate returned false'}`
        };
    }

    const headers = {'content-type': 'application/json'};
    if (apiKey) {
        headers.authorization = `Bearer ${apiKey}`;
    }

    const
        loadedModel  = Array.isArray(lmsLoadedModels) ? lmsLoadedModels.find(item => item?.id === model) : null,
        requestInput = withLmsEmbeddingInputSuffix(input, loadedModel);

    const runProbe = async () => {
        const response = await fetchFn(new URL('/v1/embeddings', host).toString(), {
            method: 'POST',
            headers,
            body  : JSON.stringify({model, input: requestInput}),
            signal: AbortSignal.timeout(timeoutMs)
        });

        if (!response.ok) {
            const text    = typeof response.text === 'function' ? await response.text() : '',
                  message = `HTTP ${response.status}${text ? ` - ${text.slice(0, 256)}` : ''}`;

            return {
                ready   : false,
                degraded: true,
                provider: 'openAiCompatible',
                host,
                model,
                status  : response.status,
                error   : {message},
                warning : `[provider/openAiCompatible] embedding-serving canary failed for '${model}': ${message}`
            };
        }

        const payload = await response.json(),
              vector  = payload?.data?.[0]?.embedding;

        if (!Array.isArray(vector)) {
            return {
                ready   : false,
                degraded: true,
                provider: 'openAiCompatible',
                host,
                model,
                error   : {message: 'response did not contain data[0].embedding[]'},
                warning : `[provider/openAiCompatible] embedding-serving canary failed for '${model}': response did not contain data[0].embedding[]`
            };
        }

        return {
            ready       : true,
            degraded    : false,
            provider    : 'openAiCompatible',
            host,
            model,
            vectorLength: vector.length
        };
    };

    const queuedProbe = openAiCompatibleEmbeddingServingProbeQueue
        .catch(() => {})
        .then(runProbe)
        .catch(error => ({
            ready   : false,
            degraded: true,
            provider: 'openAiCompatible',
            host,
            model,
            error   : {
                message: error?.message || String(error),
                code   : error?.code
            },
            warning : `[provider/openAiCompatible] embedding-serving canary failed for '${model}': ${error?.message || error}`
        }));

    openAiCompatibleEmbeddingServingProbeQueue = queuedProbe.catch(() => {});

    return queuedProbe;
}

/**
 * @summary Fetches currently resident model ids from native Ollama.
 *
 * @param {Object} options
 * @param {String} options.host Provider host.
 * @param {Number} options.timeoutMs HTTP timeout. Required; no module-level default.
 * @param {Function} [options.fetchFn=fetch] Fetch seam for tests.
 * @returns {Promise<String[]>}
 */
export async function fetchOllamaRunningModelIds({host, timeoutMs, fetchFn = fetch} = {}) {
    return (await fetchOllamaRunningModels({host, timeoutMs, fetchFn})).map(item => item.id);
}

/**
 * @summary Fetches resident native Ollama model metadata from `/api/ps`.
 * @param {Object} options
 * @param {String} options.host Provider host.
 * @param {Number} options.timeoutMs HTTP timeout. Required; no module-level default.
 * @param {Function} [options.fetchFn=fetch] Fetch seam for tests.
 * @returns {Promise<Object[]>}
 */
export async function fetchOllamaRunningModels({host, timeoutMs, fetchFn = fetch} = {}) {
    if (!host) {
        throw new TypeError('fetchOllamaRunningModels: host is required');
    }
    if (typeof timeoutMs !== 'number') {
        throw new TypeError('fetchOllamaRunningModels: timeoutMs is required');
    }

    const url      = new URL('/api/ps', host).toString();
    const response = await fetchFn(url, {
        method: 'GET',
        signal: AbortSignal.timeout(timeoutMs)
    });

    if (!response.ok) {
        const text = typeof response.text === 'function' ? await response.text() : '';
        throw new Error(`Ollama running-model enumeration failed: HTTP ${response.status}${text ? ` - ${text}` : ''}`);
    }

    return getOllamaRunningModels(await response.json());
}

/**
 * @summary Warms one native Ollama model without abandoning dispatched provider work.
 *
 * Native Ollama is not an OpenAI-compatible provider behind a different selector:
 * chat/generation work is warmed through `/api/chat`, while vector work is warmed
 * through `/api/embed`. `keep_alive` flows from operator config so readiness
 * matches the same residency policy used by normal provider calls. One in-flight
 * warm is coalesced per exact provider/model shape. The caller deadline ends only
 * the readiness wait: the underlying fetch is never aborted, remains handled, and
 * is reused by later readiness cycles until it actually settles.
 *
 * @param {Object} options
 * @param {String} options.host Ollama host.
 * @param {String} options.model Ollama model identifier.
 * @param {String} options.role Either `'chat'` or `'embedding'`.
 * @param {String|Number} [options.keepAlive] Ollama keep_alive value.
 * @param {Number} [options.contextLength] Native Ollama `options.num_ctx` warm-up override.
 * @param {Number} options.timeoutMs Caller wait deadline. Required; no module-level default.
 * @param {Function} [options.fetchFn=fetch] Fetch seam for tests.
 * @param {Object|null} [options.providerActivityRecorder] Best-effort provider lifecycle sink.
 * @param {String} [options.service='orchestrator'] Source-owned provider activity service.
 * @param {Object} [options.log=logger] Logger seam.
 * @returns {Promise<Object>} Completed warm result or explicit `{pending: true}` disposition.
 */
export async function warmOllamaRoleModel({
    host,
    model,
    role,
    keepAlive,
    contextLength,
    timeoutMs,
    fetchFn = fetch,
    providerActivityRecorder = null,
    service = 'orchestrator',
    log = logger
} = {}) {
    if (!host) {
        throw new TypeError('warmOllamaRoleModel: host is required');
    }
    if (!model) {
        throw new TypeError('warmOllamaRoleModel: model is required');
    }
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
        throw new TypeError('warmOllamaRoleModel: timeoutMs must be a positive number');
    }
    if (role !== 'chat' && role !== 'embedding') {
        throw new TypeError("warmOllamaRoleModel: role must be 'chat' or 'embedding'");
    }
    if (keepAlive !== undefined && typeof keepAlive !== 'string' && !Number.isFinite(keepAlive)) {
        throw new TypeError('warmOllamaRoleModel: keepAlive must be a string or finite number when provided');
    }

    const endpoint = role === 'embedding' ? '/api/embed' : '/api/chat';
    const payload  = role === 'embedding'
        ? {model, input: ''}
        : {model, messages: [{role: 'user', content: ''}], stream: false};

    if (keepAlive !== undefined) {
        payload.keep_alive = keepAlive;
    }
    if (Neo.isNumber(contextLength)) {
        payload.options = {
            ...(payload.options || {}),
            num_ctx: contextLength
        };
    }

    const operationKey = JSON.stringify([
        new URL(endpoint, host).toString(),
        model,
        role,
        Neo.isNumber(contextLength) ? contextLength : null,
        keepAlive === undefined ? ['omitted'] : ['provided', keepAlive]
    ]);
    let providerPromise = ollamaWarmInflight.get(operationKey);

    if (!providerPromise) {
        providerPromise = observeUnqueuedProviderActivity({
            recorder: providerActivityRecorder,
            activity: {
                model,
                operationStage: 'unknown',
                priority      : 'unknown',
                provider      : 'ollama',
                role,
                service
            },
            task: async () => {
                const response = await fetchFn(new URL(endpoint, host).toString(), {
                    method : 'POST',
                    headers: {'content-type': 'application/json'},
                    body   : JSON.stringify(payload)
                });

                if (!response.ok) {
                    const text = typeof response.text === 'function' ? await response.text() : '';
                    throw new Error(`Ollama ${role} model warmup failed for '${model}': HTTP ${response.status}${text ? ` - ${text}` : ''}`);
                }

                let raw = null;

                if (typeof response.text === 'function') {
                    const text = await response.text();

                    if (text.trim()) {
                        try {
                            raw = JSON.parse(text);
                        } catch (error) {
                            raw = null;
                        }
                    }
                } else if (typeof response.json === 'function') {
                    try {
                        raw = await response.json();
                    } catch (error) {
                        raw = null;
                    }
                }

                return {
                    model,
                    role,
                    endpoint,
                    evalSample: extractOllamaEvalSample(raw, {model, role})
                };
            }
        });
        ollamaWarmInflight.set(operationKey, providerPromise);
        providerPromise.then(
            () => {
                if (ollamaWarmInflight.get(operationKey) === providerPromise) {
                    ollamaWarmInflight.delete(operationKey);
                }
            },
            () => {
                if (ollamaWarmInflight.get(operationKey) === providerPromise) {
                    ollamaWarmInflight.delete(operationKey);
                }
            }
        );
    }

    return new Promise((resolve, reject) => {
        let settled = false;

        const timer = setTimeout(() => {
            if (settled) return;

            settled = true;
            log.warn?.(`[ProviderReadinessHelper] Ollama ${role} model '${model}' warm is still in flight after ${timeoutMs}ms; retaining and coalescing provider work.`);
            resolve({
                code                   : OLLAMA_WARM_PROVIDER_PENDING_CODE,
                model,
                role,
                endpoint,
                pending                : true,
                providerWorkDisposition: 'in-flight',
                timeoutMs
            });
        }, timeoutMs);
        const settle = (fn, value) => {
            if (settled) return;

            settled = true;
            clearTimeout(timer);
            fn(value);
        };

        providerPromise.then(
            value => settle(resolve, value),
            error => settle(reject, error)
        );
    });
}

/**
 * @summary Invokes `lms load <model> [--context-length <N>]` for one LM Studio model.
 *
 * When `contextLength` is provided, appends `--context-length <N>` to the `lms`
 * CLI arguments so the model loads with the operator-declared context window
 * instead of the modelfile default (typically 4K-8K). Closes the silent
 * context-mismatch failure mode where downstream chat invocations exceed the
 * loaded-model cap and return empty bodies.
 *
 * @param {String} model LM Studio model identifier.
 * @param {Object} [options]
 * @param {Function} [options.execFileFn=execFile] Child-process seam for tests.
 * @param {Number} [options.contextLength] LM Studio loaded-model context-window override (tokens).
 * @param {Number} [options.parallel] LM Studio loaded-model parallel-slot count (`--parallel`). Each
 * slot holds an independent KV cache at the loaded context window, so the slot count multiplies the
 * model's resident RAM. Omit to inherit the lms default; set low for a lease-serialized role whose
 * concurrent demand is 1 (the chat model) to reclaim the idle KV-cache multiplier.
 * @param {String} [options.identifier] Stable LM Studio loaded-model identifier.
 * @returns {Promise<{stdout: String, stderr: String}>}
 */
export function loadLmsModel(model, {execFileFn = execFile, contextLength, parallel, identifier} = {}) {
    if (!model) {
        return Promise.reject(new TypeError('loadLmsModel: model is required'));
    }

    const args = ['load', model];
    if (Neo.isNumber(contextLength)) {
        args.push('--context-length', String(contextLength));
    }
    if (Neo.isNumber(parallel)) {
        args.push('--parallel', String(parallel));
    }
    if (Neo.isString(identifier) && identifier) {
        args.push('--identifier', identifier);
    }

    return new Promise((resolve, reject) => {
        execFileFn('lms', args, (error, stdout = '', stderr = '') => {
            if (error) {
                reject(new Error(`lms load ${model} failed: ${error.message}${stderr ? `; stderr=${stderr.trim()}` : ''}`));
                return;
            }

            resolve({stdout, stderr});
        });
    });
}

/**
 * @summary Invokes `lms unload <identifier>` for one LM Studio resident model.
 * @param {String} identifier LM Studio loaded-model identifier.
 * @param {Object} [options]
 * @param {Function} [options.execFileFn=execFile] Child-process seam for tests.
 * @returns {Promise<{stdout: String, stderr: String}>}
 */
export function unloadLmsModel(identifier, {execFileFn = execFile} = {}) {
    if (!identifier) {
        return Promise.reject(new TypeError('unloadLmsModel: identifier is required'));
    }

    return new Promise((resolve, reject) => {
        execFileFn('lms', ['unload', identifier], (error, stdout = '', stderr = '') => {
            if (error) {
                reject(new Error(`lms unload ${identifier} failed: ${error.message}${stderr ? `; stderr=${stderr.trim()}` : ''}`));
                return;
            }

            resolve({stdout, stderr});
        });
    });
}

/**
 * @summary Builds the per-model `--context-length` override map for `ensureLmsModelsLoaded`.
 *
 * Composes the resolved chat + embedding model identifiers with their respective
 * role-keyed context-length thresholds into the `{[modelId]: tokens}` shape the
 * helper's `contextLengths` parameter consumes. Callers (Orchestrator boot path)
 * resolve the four inputs from their own config substrate and pass them in —
 * keeps this helper module decoupled from any specific config-shape source.
 *
 * Skips entries when the model id is missing OR the context-length is not a
 * finite number, so partially-configured deployments produce a partial map
 * rather than corrupted entries.
 *
 * @param {Object} options
 * @param {String} [options.chatModel] Chat model identifier (e.g. `aiConfig.openAiCompatible.model`).
 * @param {String} [options.embeddingModel] Embedding model identifier.
 * @param {Number} [options.chatContextLength] Chat-role context window in tokens.
 * @param {Number} [options.embeddingContextLength] Embedding-role context window in tokens.
 * @returns {Object} Map keyed by model id with finite-number context-length values.
 */
export function buildLmsContextLengthsMap({
    chatModel,
    embeddingModel,
    chatContextLength,
    embeddingContextLength
} = {}) {
    const map    = {};
    const setMax = (modelId, value) => {
        if (!modelId || !Neo.isNumber(value)) {
            return;
        }
        // Same-model chat+embedding edge: when both roles share a model id (operator
        // points chat + embedding at the same identifier), keep the LARGER cap so
        // the role with the bigger context-window envelope is not silently capped
        // by the smaller role's threshold.
        if (map[modelId] === undefined || value > map[modelId]) {
            map[modelId] = value;
        }
    };
    setMax(chatModel, chatContextLength);
    setMax(embeddingModel, embeddingContextLength);
    return map;
}

/**
 * @summary Builds the LM Studio preload set from configured provider-role selectors.
 *
 * The state-provider config chooses which provider serves each role. The OpenAI-compatible
 * model defaults remain populated even when a role is routed to Gemini or native Ollama, so
 * this helper must never infer activity from non-null model leaves. It only includes roles
 * whose selector explicitly targets the OpenAI-compatible surface that LM Studio serves.
 *
 * Role ownership:
 * - `modelProvider`: session-summary chat role.
 * - `graphProvider`: REM graph-generation chat role.
 * - `embeddingProvider`: vector embedding role.
 *
 * @param {Object} config aiConfig-shaped provider config.
 * @returns {{models: String[], contextLengths: Object, parallels: Object}} Role-aware LMS preload config.
 */
export function buildLmsPreloadConfig(config = aiConfig) {
    const openAiCompatibleConfig = config.openAiCompatible,
          chatModel              = openAiCompatibleConfig.model,
          embeddingModel         = openAiCompatibleConfig.embeddingModel,
          chatContextLength      = config.localModels.chat.contextLimitTokens,
          embeddingContextLength = config.localModels.embedding.contextLimitTokens,
          chatParallel           = config.localModels.chat.parallel,
          embeddingParallel      = config.localModels.embedding.parallel,
          roles                  = [{
              provider     : config.modelProvider,
              model        : chatModel,
              contextRole  : 'chat',
              contextLength: chatContextLength
          }, {
              provider     : config.graphProvider,
              model        : chatModel,
              contextRole  : 'chat',
              contextLength: chatContextLength
          }, {
              provider     : config.embeddingProvider,
              model        : embeddingModel,
              contextRole  : 'embedding',
              contextLength: embeddingContextLength
          }].filter(role => isOpenAiCompatibleProvider(role.provider) && role.model);

    const models              = [...new Set(roles.map(role => role.model))],
          selectedContextRole = role => roles.some(({contextRole}) => contextRole === role),
          contextLengths      = buildLmsContextLengthsMap({
              chatModel     : selectedContextRole('chat') ? chatModel : undefined,
              embeddingModel: selectedContextRole('embedding') ? embeddingModel : undefined,
              chatContextLength,
              embeddingContextLength
    });

    // `--parallel` is a per-model request-slot count (each slot = an independent KV cache = a RAM
    // multiplier), distinct from `requireParallelModels` (how many DISTINCT models stay co-resident).
    // Keyed by model id so it force-includes through the same path as contextLengths. When an operator
    // points chat + embedding at one LM Studio id, keep the larger requested slot count.
    const parallels   = {};
    const setParallel = (model, value) => {
        if (!model || !Neo.isNumber(value)) {
            return;
        }
        if (parallels[model] === undefined || value > parallels[model]) {
            parallels[model] = value;
        }
    };

    if (selectedContextRole('chat')) {
        setParallel(chatModel, chatParallel);
    }
    if (selectedContextRole('embedding')) {
        setParallel(embeddingModel, embeddingParallel);
    }

    return {models, contextLengths, parallels}
}

/**
 * @summary Builds the native Ollama readiness set from provider-role selectors.
 *
 * Non-null Ollama model leaves are deployment configuration, not proof that the
 * native Ollama provider owns a role. This mirrors {@link buildLmsPreloadConfig}:
 * only explicit provider selectors participate, preserving operator choice when
 * chat, graph, or embedding is routed to another provider family.
 *
 * @param {Object} config aiConfig-shaped provider config.
 * @returns {{provider: String, host: String, keepAlive: *, requireParallelModels: Number, model: String, embeddingModel: String, roles: Object[], models: String[], contextLengths: Object}}
 */
export function buildOllamaReadinessConfig(config = aiConfig) {
    const ollamaConfig           = config.ollama,
          chatModel              = ollamaConfig.model,
          embeddingModel         = ollamaConfig.embeddingModel,
          chatContextLength      = config.localModels.chat.contextLimitTokens,
          embeddingContextLength = config.localModels.embedding.contextLimitTokens,
          roles                  = [{
              provider     : config.modelProvider,
              providerRole : 'modelProvider',
              role         : 'chat',
              model        : chatModel,
              contextLength: chatContextLength
          }, {
              provider     : config.graphProvider,
              providerRole : 'graphProvider',
              role         : 'chat',
              model        : chatModel,
              contextLength: chatContextLength
          }, {
              provider     : config.embeddingProvider,
              providerRole : 'embeddingProvider',
              role         : 'embedding',
              model        : embeddingModel,
              contextLength: embeddingContextLength
          }].filter(role => role.provider === 'ollama' && role.model);

    const dedupedRoles = [];
    const seenRoles    = new Set();

    for (const role of roles) {
        const key = `${role.role}:${role.model}`;
        if (!seenRoles.has(key)) {
            seenRoles.add(key);
            dedupedRoles.push(role);
        }
    }

    return {
        provider             : 'ollama',
        host                 : ollamaConfig.host,
        keepAlive            : ollamaConfig.keep_alive,
        requireParallelModels: ollamaConfig.requireParallelModels,
        model                : chatModel,
        embeddingModel,
        roles                : dedupedRoles,
        models               : [...new Set(dedupedRoles.map(role => role.model))],
        contextLengths       : buildLmsContextLengthsMap({
            chatModel     : dedupedRoles.some(role => role.role === 'chat') ? chatModel : undefined,
            embeddingModel: dedupedRoles.some(role => role.role === 'embedding') ? embeddingModel : undefined,
            chatContextLength,
            embeddingContextLength
        })
    }
}

/**
 * @summary Finds LM Studio models whose observed loaded context or parallel slots do not match config.
 * @param {Object} options
 * @param {Object[]} options.loadedModels Parsed `lms ps --json` models.
 * @param {String[]} options.requiredModels Required model identifiers.
 * @param {Object} [options.contextLengths] Per-model required context lengths.
 * @param {Object} [options.parallels] Per-model required parallel slots.
 * @returns {Object[]}
 */
export function getInsufficientLmsLoadedModels({
    loadedModels,
    requiredModels,
    contextLengths = {},
    parallels      = {}
} = {}) {
    const byId         = new Map((Array.isArray(loadedModels) ? loadedModels : []).map(item => [item.id, item]));
    const insufficient = [];

    for (const model of requiredModels || []) {
        const requiredContext  = contextLengths?.[model],
              requiredParallel = parallels?.[model],
              hasContextGate   = Neo.isNumber(requiredContext),
              hasParallelGate  = Neo.isNumber(requiredParallel);

        if (!hasContextGate && !hasParallelGate) {
            continue;
        }

        const observed    = byId.get(model),
              contextGap  = hasContextGate && (!Neo.isNumber(observed?.contextLength) || observed.contextLength < requiredContext),
              parallelGap = hasParallelGate && !isObservedLmsParallelSufficient(observed?.parallel, requiredParallel);

        if (contextGap || parallelGap) {
            insufficient.push({
                model,
                contextLength        : observed?.contextLength,
                requiredContextLength: hasContextGate ? requiredContext : undefined,
                parallel             : observed?.parallel,
                requiredParallel     : hasParallelGate ? requiredParallel : undefined
            });
        }
    }

    return insufficient;
}

/**
 * @summary Ensures LM Studio has all configured OpenAI-compatible models loaded.
 *
 * The orchestrator-owned `lms server start` task gets the server process running;
 * this helper adds the model-residency half by probing `/v1/models`, invoking
 * `lms load <model>` for missing chat / embedding models, then waiting until the
 * endpoint enumerates both. Parameters come from config-owned callers so the helper
 * has no hidden retry or timeout defaults.
 *
 * Every call runs behind one process-wide FIFO so the supervisor readiness hook and recovery
 * actuator cannot overlap destructive `lms unload` / `lms load` sequences. Calls are serialized,
 * never coalesced: each queued caller re-probes with its own role set, shape requirements, and
 * authority oracle after its predecessor settles.
 *
 * Per-model context-length overrides flow through the optional `contextLengths`
 * map (`{[modelId]: tokens}`). When present, the helper invokes
 * `lms load <model> --context-length <N>` for that model so the loaded context
 * window matches the neo-side `aiConfig.localModels.{chat,embedding}.contextLimitTokens`
 * threshold. Closes the silent context-mismatch failure mode (loaded-cap <
 * prompt-size → empty downstream body).
 *
 * @param {Object} options
 * @param {String} options.host OpenAI-compatible host.
 * @param {String[]} options.models Required resident model ids.
 * @param {Number} options.attempts Probe attempts after load.
 * @param {Number} options.delayMs Delay between probes.
 * @param {Number} options.timeoutMs HTTP probe timeout.
 * @param {Object} [options.contextLengths] Per-model context-length override map keyed by model id.
 * @param {Object} [options.parallels] Per-model `--parallel` slot-count override map keyed by model id. A
 * model present here is force-included in the load set (like `contextLengths`) so the slot count is
 * enforced on a resident model, not just a missing one.
 * @param {Boolean} [options.allowPartial=false] Return degraded readiness instead of throwing when one model cannot be loaded.
 * @param {Function} [options.fetchModelIds] Injectable model-list probe.
 * @param {Function} [options.fetchLoadedModels] Injectable loaded-model metadata probe.
 * @param {Function} [options.loadModel] Injectable model-load function.
 * @param {Function} [options.unloadModel] Injectable model-unload function.
 * @param {Function} [options.embeddingServingProbe] Optional bounded embedding-serving canary seam.
 * @param {String} [options.modelDiscoveryFreshness='force'] Routine callers may use `routine`; post-mutation probes force-refresh.
 * @param {Number} [options.modelDiscoveryCacheTtlMs] Required when `modelDiscoveryFreshness` is `routine`.
 * @param {Object} [options.log=logger] Logger seam.
 * @returns {Promise<Object>}
 */
export function ensureLmsModelsLoaded(options = {}) {
    const queuedRepair = lmsResidencyMutationQueue
        .catch(() => {})
        .then(() => ensureLmsModelsLoadedOnce(options));

    lmsResidencyMutationQueue = queuedRepair.catch(() => {});

    return queuedRepair;
}

/**
 * @summary Executes one LMS residency repair after the process-wide mutation queue admits it.
 * @param {Object} options Validated by the repair body.
 * @returns {Promise<Object>}
 */
async function ensureLmsModelsLoadedOnce({
    host,
    models,
    attempts,
    delayMs,
    timeoutMs,
    contextLengths = {},
    parallels      = {},
    allowPartial   = false,
    fetchModelIds     = opts => fetchOpenAiCompatibleModelIds(opts),
    fetchLoadedModels = opts => fetchLmsLoadedModels(opts),
    loadModel         = (model, options) => loadLmsModel(model, options),
    unloadModel       = (identifier, options) => unloadLmsModel(identifier, options),
    embeddingServingProbe,
    modelDiscoveryFreshness = PROVIDER_DISCOVERY_FORCE,
    modelDiscoveryCacheTtlMs,
    log               = logger,
    isAuthorityHeld   = null
} = {}) {
    if (!Array.isArray(models) || models.length === 0) {
        throw new TypeError('ensureLmsModelsLoaded: models must contain at least one configured model');
    }

    /**
     * Asserted before EACH unload and EACH load. This function evicts extra models, then unloads and
     * reloads per configured model, so every mutation sits behind a fresh await and a single entry
     * check would bind only the first. Null oracle is not a refusal — startup callers hold no lease.
     */
    const assertHeld = () => {
        if (typeof isAuthorityHeld === 'function' && isAuthorityHeld() !== true) {
            const error = new Error('Authority moved before an LMS model load/unload; refusing.');

            error.reason = 'runtime-authority-lost';

            throw error;
        }
    };
    if (typeof attempts !== 'number' || typeof delayMs !== 'number' || typeof timeoutMs !== 'number') {
        throw new TypeError('ensureLmsModelsLoaded: attempts, delayMs, and timeoutMs are required');
    }

    const requiredModels = [...new Set(models.filter(Boolean))];
    if (requiredModels.length === 0) {
        throw new TypeError('ensureLmsModelsLoaded: models must contain at least one configured model');
    }

    // EXACT, deliberately. LM Studio model ids carry no implicit tag, so the Ollama untagged→`:latest`
    // equivalence would accept a model this deployment does not serve.
    const getMissing          = available => requiredModels.filter(model => !available.includes(model));
    const completeReadyResult = async result => {
        if (result.ready !== true || typeof embeddingServingProbe !== 'function') {
            return result;
        }

        let embeddingServing;

        try {
            embeddingServing = await embeddingServingProbe({
                host,
                timeoutMs,
                requiredModels,
                availableModels     : result.availableModels,
                lmsLoadedModels     : result.lmsLoadedModels || [],
                loadedContexts      : result.loadedContexts || {},
                loadedParallels     : result.loadedParallels || {},
                loadedParallelsKnown: Object.fromEntries((result.lmsLoadedModels || []).map(item => [item.id, Neo.isNumber(item.parallel)]))
            });
        } catch (error) {
            embeddingServing = {
                ready   : false,
                degraded: true,
                error   : {message: error?.message || String(error)},
                warning : `[provider/openAiCompatible] embedding-serving canary failed: ${error?.message || error}`
            };
        }

        if (embeddingServing?.ready === true) {
            return {
                ...result,
                embeddingServing
            };
        }

        if (embeddingServing?.warning) {
            log.warn?.(`[ProviderReadinessHelper] ${embeddingServing.warning}`);
        }

        return {
            ...result,
            ready   : false,
            degraded: true,
            embeddingServing
        };
    };
    const requiresObservedLoadCheck = requiredModels.some(model =>
        Neo.isNumber(contextLengths?.[model]) || Neo.isNumber(parallels?.[model])
    );
    const probeModels = async (phase, freshness = modelDiscoveryFreshness) => {
        let lastError;

        for (let attempt = 1; attempt <= attempts; attempt++) {
            try {
                return {
                    attempt,
                    availableModels: await fetchModelIds({
                        host,
                        timeoutMs,
                        freshness,
                        cacheTtlMs: freshness === PROVIDER_DISCOVERY_ROUTINE ? modelDiscoveryCacheTtlMs : undefined
                    })
                };
            } catch (error) {
                lastError = error;
                if (attempt < attempts) {
                    await new Promise(resolve => setTimeout(resolve, delayMs));
                }
            }
        }

        throw new Error(`LM Studio model readiness failed during ${phase}: ${lastError?.message || lastError}`);
    };

    let   {availableModels} = await probeModels('initial /v1/models probe');
    const initialMissing    = getMissing(availableModels),
          initialLoadedModels  = [],
          failedModels         = [],
          cleanupFailedModels  = [],
          unloadedModels       = [],
          modelHasObservedGate = model => Neo.isNumber(contextLengths?.[model]) || Neo.isNumber(parallels?.[model]);

    const needsInitialLoadedProbe = requiresObservedLoadCheck && requiredModels.some(model =>
        !initialMissing.includes(model) && modelHasObservedGate(model)
    );

    if (needsInitialLoadedProbe) {
        try {
            initialLoadedModels.push(...await fetchLoadedModels({
                timeoutMs,
                freshness : modelDiscoveryFreshness,
                cacheTtlMs: modelDiscoveryFreshness === PROVIDER_DISCOVERY_ROUTINE ? modelDiscoveryCacheTtlMs : undefined
            }));
        } catch (error) {
            log.warn?.(`[ProviderReadinessHelper] Initial LM Studio loaded-model probe failed: ${error.message}; falling back to reload enforcement.`);
        }
    }

    const initialLoadedById = new Map(initialLoadedModels.map(item => [item.id, item]));

    // `/v1/models` reports presence only. For models with context/parallel gates, use
    // `lms ps --json` metadata to avoid reloading an already-correct resident model,
    // but still replace an exact resident model whose loaded shape is stale.
    const modelsToLoad = requiredModels.filter(model => {
        if (initialMissing.includes(model)) return true;
        if (!modelHasObservedGate(model)) return false;

        return !isLmsLoadedModelSufficient({
            loadedModel: initialLoadedById.get(model),
            model,
            contextLengths,
            parallels
        });
    });
    const attemptedModels = [...modelsToLoad];
    const loadedModels    = [];

    const cleanupSupersededModels = async lmsLoadedModels => {
        const superseded = getSupersededLmsLoadedModels({
            loadedModels: lmsLoadedModels,
            requiredModels,
            contextLengths,
            parallels
        });

        for (const item of superseded) {
            log.info?.(`[ProviderReadinessHelper] Unloading superseded LM Studio model '${item.id}' after '${item.model}' reached the configured shape.`);

            try {
                assertHeld();                       // last point owned before this eviction
                await unloadModel(item.id);
                unloadedModels.push(item.id);
            } catch (error) {
                const failure = {
                    model: item.model,
                    id   : item.id,
                    error: error.message
                };

                cleanupFailedModels.push(failure);
                log.warn?.(`[ProviderReadinessHelper] LM Studio model '${item.id}' unload failed: ${error.message}`);

                if (!allowPartial) {
                    throw error;
                }
            }
        }

        return cleanupFailedModels;
    };

    if (modelsToLoad.length === 0) {
        if (requiresObservedLoadCheck && initialLoadedModels.length) {
            await cleanupSupersededModels(initialLoadedModels);
        }

        return completeReadyResult({
            ready          : cleanupFailedModels.length === 0,
            degraded       : cleanupFailedModels.length > 0,
            loadedModels   : [],
            attemptedModels,
            failedModels,
            cleanupFailedModels,
            unloadedModels,
            requiredModels,
            availableModels,
            lmsLoadedModels: initialLoadedModels,
            loadedContexts : Object.fromEntries(initialLoadedModels.map(item => [item.id, item.contextLength])),
            loadedParallels: Object.fromEntries(initialLoadedModels.map(item => [item.id, item.parallel])),
            attempts       : 1
        });
    }

    for (const model of modelsToLoad) {
        const contextLength = contextLengths?.[model];
        const parallel      = parallels?.[model];
        const contextSuffix = Neo.isNumber(contextLength)
            ? ` --context-length ${contextLength}`
            : '';
        const parallelSuffix = Neo.isNumber(parallel)
            ? ` --parallel ${parallel}`
            : '';
        const reason = initialMissing.includes(model)
            ? 'missing from /v1/models'
            : 'context-length / parallel enforcement on resident model';
        log.info?.(`[ProviderReadinessHelper] Loading LM Studio model '${model}' via lms load${contextSuffix}${parallelSuffix} (${reason}).`);
        try {
            const observed           = initialLoadedById.get(model),
                  exactResident      = !initialMissing.includes(model),
                  shouldReplaceExact = observed
                      ? !isLmsLoadedModelSufficient({
                          loadedModel: observed,
                          model,
                          contextLengths,
                          parallels
                      })
                      : exactResident && modelHasObservedGate(model);

            if (shouldReplaceExact) {
                log.info?.(`[ProviderReadinessHelper] Unloading stale LM Studio model '${model}' before stable-identifier reload.`);
                assertHeld();                       // and before this one
                await unloadModel(model);
                unloadedModels.push(model);
            }

            const loadOptions = {identifier: model};

            if (Neo.isNumber(contextLength)) {
                loadOptions.contextLength = contextLength;
            }
            if (Neo.isNumber(parallel)) {
                loadOptions.parallel = parallel;
            }

            assertHeld();                           // and before the load itself
            await loadModel(model, loadOptions);
            loadedModels.push(model);
        } catch (error) {
            failedModels.push({
                model,
                contextLength,
                parallel,
                error: error.message
            });
            log.warn?.(`[ProviderReadinessHelper] LM Studio model '${model}' preload failed: ${error.message}`);

            if (!allowPartial) {
                throw error;
            }
        }
    }

    let missingModels = initialMissing;

    const startedAt = Date.now();
    for (let attempt = 1; attempt <= attempts; attempt++) {
        ({availableModels} = await probeModels('post-load /v1/models probe', PROVIDER_DISCOVERY_FORCE));
        missingModels = getMissing(availableModels);

        const knownUnavailable = new Set([
            ...failedModels.map(item => item.model)
        ]);
        const serviceableMissing = missingModels.filter(model => !knownUnavailable.has(model));

        if (missingModels.length === 0) {
            let lmsLoadedModels = [];

            if (requiresObservedLoadCheck) {
                try {
                    lmsLoadedModels = await fetchLoadedModels({
                        timeoutMs,
                        freshness: PROVIDER_DISCOVERY_FORCE
                    });
                } catch (error) {
                    const warning = `LM Studio loaded-model readiness failed: ${error.message}`;

                    log.warn?.(`[ProviderReadinessHelper] ${warning}`);

                    if (!allowPartial) {
                        throw new Error(warning);
                    }

                    return {
                        ready            : false,
                        degraded         : true,
                        loadedModels,
                        attemptedModels,
                        failedModels,
                        cleanupFailedModels,
                        unloadedModels,
                        missingModels,
                        observedLoadError: error.message,
                        requiredModels,
                        availableModels,
                        attempts         : attempt,
                        elapsedMs        : Date.now() - startedAt
                    };
                }
            }

            const insufficientLoadedModels = requiresObservedLoadCheck
                ? getInsufficientLmsLoadedModels({
                    loadedModels: lmsLoadedModels,
                    requiredModels,
                    contextLengths,
                    parallels
                })
                : [];

            if (insufficientLoadedModels.length) {
                const warning = `LM Studio loaded-model readiness failed: ${insufficientLoadedModels.map(item => {
                    const context = item.requiredContextLength !== undefined
                        ? `context observed=${item.contextLength ?? 'unknown'} required>=${item.requiredContextLength}`
                        : null;
                    const parallel = item.requiredParallel !== undefined
                        ? `parallel observed=${item.parallel ?? 'unknown'} required=${item.requiredParallel}`
                        : null;

                    return `${item.model} (${[context, parallel].filter(Boolean).join(', ')})`
                }).join('; ')}`;

                log.warn?.(`[ProviderReadinessHelper] ${warning}`);

                if (!allowPartial) {
                    throw new Error(warning);
                }

                return {
                    ready          : false,
                    degraded       : true,
                    loadedModels,
                    attemptedModels,
                    failedModels,
                    cleanupFailedModels,
                    unloadedModels,
                    missingModels,
                    insufficientLoadedModels,
                    requiredModels,
                    availableModels,
                    lmsLoadedModels,
                    loadedContexts : Object.fromEntries(lmsLoadedModels.map(item => [item.id, item.contextLength])),
                    loadedParallels: Object.fromEntries(lmsLoadedModels.map(item => [item.id, item.parallel])),
                    attempts       : attempt,
                    elapsedMs      : Date.now() - startedAt
                };
            }

            if (requiresObservedLoadCheck && lmsLoadedModels.length) {
                await cleanupSupersededModels(lmsLoadedModels);
            }

            const ready = missingModels.length === 0 && failedModels.length === 0 && cleanupFailedModels.length === 0;
            return completeReadyResult({
                ready,
                degraded       : !ready,
                loadedModels,
                attemptedModels,
                failedModels,
                cleanupFailedModels,
                unloadedModels,
                missingModels,
                requiredModels,
                availableModels,
                lmsLoadedModels,
                loadedContexts : Object.fromEntries(lmsLoadedModels.map(item => [item.id, item.contextLength])),
                loadedParallels: Object.fromEntries(lmsLoadedModels.map(item => [item.id, item.parallel])),
                attempts       : attempt,
                elapsedMs      : Date.now() - startedAt
            });
        }

        if (allowPartial && serviceableMissing.length === 0) {
            const ready = false;
            return {
                ready,
                degraded : !ready,
                loadedModels,
                attemptedModels,
                failedModels,
                cleanupFailedModels,
                unloadedModels,
                missingModels,
                requiredModels,
                availableModels,
                attempts : attempt,
                elapsedMs: Date.now() - startedAt
            };
        }

        if (attempt < attempts) {
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
    }

    if (allowPartial) {
        return {
            ready    : false,
            degraded : true,
            loadedModels,
            attemptedModels,
            failedModels,
            cleanupFailedModels,
            unloadedModels,
            missingModels,
            requiredModels,
            availableModels,
            attempts,
            elapsedMs: Date.now() - startedAt
        };
    }

    throw new Error(
        `LM Studio model readiness failed: missing ${missingModels.join(', ')} from ${host}/v1/models after ` +
        `${attempts} attempt(s). Run ${missingModels.map(model => `lms load ${model}`).join(' && ')} ` +
        'or raise the LM Studio loaded-model cap so chat and embedding models can stay resident together.'
    );
}

/**
 * @summary Ensures native Ollama has all configured role models resident.
 *
 * Ollama has no `lms load` equivalent and must be warmed through its native API.
 * This helper probes `/api/ps`, warms missing or under-context role/model pairs through
 * `/api/chat` or `/api/embed`, and then verifies that the required chat and
 * embedding models are resident together at the configured context. Partial failure returns a degraded
 * readiness envelope when `allowPartial` is true so callers can fail readiness
 * with operator-actionable diagnostics instead of emitting warning-only drift.
 *
 * @param {Object} options
 * @param {String} options.host Ollama host.
 * @param {Object[]} options.roles Role entries from {@link buildOllamaReadinessConfig}.
 * @param {Number} options.requireParallelModels Minimum resident-model count.
 * @param {Number} options.attempts Probe attempts after warm-up.
 * @param {Number} options.delayMs Delay between probes.
 * @param {Number} options.timeoutMs HTTP probe timeout.
 * @param {String|Number} [options.keepAlive] Ollama keep_alive value.
 * @param {Boolean} [options.allowPartial=false] Return degraded readiness instead of throwing when one role cannot be warmed.
 * @param {Function} [options.fetchModelIds] Injectable `/api/ps` probe. May return model ids or `{id, contextLength}` entries.
 * @param {Function} [options.warmModel] Injectable warm-up function.
 * @param {Object|null} [options.providerActivityRecorder] Best-effort native warm lifecycle sink.
 * @param {Function|null} [options.isEffectStillAdmitted=null] Live provider-demand admission oracle.
 * @param {Object} [options.log=logger] Logger seam.
 * @returns {Promise<Object>}
 */
export async function ensureOllamaModelsReady({
    host,
    roles,
    requireParallelModels,
    attempts,
    delayMs,
    timeoutMs,
    keepAlive,
    allowPartial = false,
    fetchModelIds = opts => fetchOllamaRunningModels(opts),
    warmModel     = (role, options) => warmOllamaRoleModel({...role, ...options}),
    providerActivityRecorder = null,
    log           = logger,
    isAuthorityHeld = null,
    isEffectStillAdmitted = null
} = {}) {
    if (!Array.isArray(roles) || roles.length === 0) {
        throw new TypeError('ensureOllamaModelsReady: roles must contain at least one configured Ollama role');
    }

    /**
     * Asserted immediately before EACH warm, not once on entry. This function polls readiness and
     * warms per role in a loop, so every iteration sits behind a fresh await — a single entry check
     * would bind the first warm and nothing after it.
     *
     * Null oracle is not a refusal: startup and readiness callers hold no lease and are unaffected.
     */
    const assertHeld = () => {
        if (typeof isAuthorityHeld === 'function' && isAuthorityHeld() !== true) {
            const error = new Error('Authority moved before an Ollama model warm; refusing.');

            error.reason = 'runtime-authority-lost';

            throw error;
        }
    };
    const assertEffectAdmitted = ({attemptedModels, failedModels, pendingModels, refusedModel, warmedModels}) => {
        if (typeof isEffectStillAdmitted === 'function' && isEffectStillAdmitted() !== true) {
            const error = new Error('Provider demand changed before an Ollama model warm; refusing.');

            const priorProviderEffect   = warmedModels.length > 0 || pendingModels.length > 0,
                  priorAttemptUncertain = !priorProviderEffect && failedModels.length > 0;

            if (priorProviderEffect) {
                error.reason = 'runtime-effect-partially-applied';
            } else if (priorAttemptUncertain) {
                error.reason = 'runtime-effect-disposition-uncertain';
            } else {
                error.reason = 'runtime-effect-not-admitted';
            }

            if (priorProviderEffect || priorAttemptUncertain) {
                error.effectDisposition = priorProviderEffect ? 'partial' : 'uncertain';
                error.providerResidency = {
                    action         : 'warm-provider',
                    provider       : 'ollama',
                    ready          : false,
                    admission      : priorProviderEffect ? 'refused-after-partial' : 'refused-after-uncertain-attempt',
                    refusedModel,
                    attemptedModels: attemptedModels.map(toRoleEnvelope),
                    warmedModels   : warmedModels.map(toRoleEnvelope),
                    pendingModels  : pendingModels.map(toRoleEnvelope),
                    failedModels   : failedModels.map(toRoleEnvelope)
                };
            }

            throw error;
        }
    };
    if (!Neo.isNumber(requireParallelModels)) {
        throw new TypeError('ensureOllamaModelsReady: requireParallelModels is required');
    }
    if (typeof attempts !== 'number' || typeof delayMs !== 'number' || typeof timeoutMs !== 'number') {
        throw new TypeError('ensureOllamaModelsReady: attempts, delayMs, and timeoutMs are required');
    }

    const requiredModels = [...new Set(roles.map(role => role.model).filter(Boolean))];
    if (requiredModels.length === 0) {
        throw new TypeError('ensureOllamaModelsReady: roles must contain at least one configured model');
    }

    const requiredResidentModels = Math.min(requireParallelModels, requiredModels.length);
    const requiredModelSet       = new Set(requiredModels);
    const normalizeAvailable     = available => [...new Map((Array.isArray(available) ? available : []).map(item => {
        if (typeof item === 'string') {
            return [item, {id: item, contextLength: undefined}];
        }
        const id = item?.id || item?.name || item?.model;
        return id ? [id, {
            id,
            contextLength: Neo.isNumber(item.contextLength) ? item.contextLength :
                Neo.isNumber(item.context_length) ? item.context_length : undefined
        }] : null;
    }).filter(Boolean)).values()];
    const toIds = available => available.map(item => item.id);
    // ONE predicate behind every derived verdict — required-available, extra, missing, and context.
    // A model-identity rule applied at only some of them produces a payload that contradicts itself:
    // a resident `x:latest` reported as EXTRA while `x` is reported as MISSING, in the same result.
    const satisfiesRequired    = item => resolveRequiredModelId(item.id, requiredModelSet, 'ollama');
    const getRequiredAvailable = available => available.filter(satisfiesRequired);
    const getExtraModels       = available => toIds(available.filter(item => !satisfiesRequired(item)));
    const contextRequirements  = roles.reduce((map, role) => {
        if (!role.model || !Neo.isNumber(role.contextLength)) {
            return map;
        }

        const current = map.get(role.model);
        if (!Neo.isNumber(current) || role.contextLength > current) {
            map.set(role.model, role.contextLength);
        }

        return map;
    }, new Map());
    const toRoleEnvelope = role => ({
        model       : role.model,
        role        : role.role,
        providerRole: role.providerRole,
        ...(Neo.isNumber(role.contextLength) ? {contextLength: role.contextLength} : {})
    });
    const getMissing = available => requiredModels.filter(model =>
        !toIds(available).some(observed => satisfiesRequiredModelId(model, observed, 'ollama')));
    // Resolved by requirement, not by exact key: a context requirement keyed on the configured
    // `qwen3-embedding` would MISS an observed `qwen3-embedding:latest`, and a requirement that is
    // not found is a requirement not enforced — the low-context alias would pass the check that
    // exists to reject it. A missed lookup here fails OPEN, which is the dangerous direction.
    const getInsufficientContext = available => available
        .map(item => ({item, required: resolveRequiredModelId(item.id, contextRequirements.keys(), 'ollama')}))
        .filter(({item, required}) => required !== null &&
            (!Neo.isNumber(item.contextLength) || item.contextLength < contextRequirements.get(required)))
        .map(({item, required}) => ({
            model                : required,
            ...(item.id !== required ? {observedModel: item.id} : {}),
            contextLength        : item.contextLength,
            requiredContextLength: contextRequirements.get(required)
        }));
    const getWarning = ({availableModels, missingModels, observedRequiredCount}) => {
        const availableModelIds = toIds(availableModels);

        return createParallelModelCapacityWarning({
            provider             : 'ollama',
            model                : roles.find(role => role.role === 'chat')?.model,
            embeddingModel       : roles.find(role => role.role === 'embedding')?.model,
            requiredModels,
            availableModels      : availableModelIds,
            missingModels,
            extraModels          : getExtraModels(availableModels),
            observedCount        : availableModelIds.length,
            observedRequiredCount,
            requireParallelModels: requiredResidentModels
        });
    };

    const probeModels = async phase => {
        let lastError;

        for (let attempt = 1; attempt <= attempts; attempt++) {
            try {
                return {
                    attempt,
                    availableModels: normalizeAvailable(await fetchModelIds({host, timeoutMs}))
                };
            } catch (error) {
                lastError = error;
                if (attempt < attempts) {
                    await new Promise(resolve => setTimeout(resolve, delayMs));
                }
            }
        }

        throw new Error(`Ollama model readiness failed during ${phase}: ${lastError?.message || lastError}`);
    };

    const startedAt = Date.now();
    let availableModels, initialProbeAttempt;

    try {
        ({availableModels, attempt: initialProbeAttempt} = await probeModels('initial /api/ps probe'));
    } catch (error) {
        if (!allowPartial) {
            throw error;
        }

        return {
            ready                    : false,
            degraded                 : true,
            provider                 : 'ollama',
            host,
            requiredModels,
            availableModels          : [],
            extraModels              : [],
            missingModels            : requiredModels,
            insufficientContextModels: [],
            observedCount            : 0,
            observedRequiredCount    : 0,
            requireParallelModels,
            requiredResidentModels,
            warmedModels             : [],
            attemptedModels          : [],
            failedModels             : [],
            pendingModels            : [],
            error                    : {message: error.message},
            warning                  : `[provider/ollama] model residency probe failed: ${error.message}`,
            attempts,
            elapsedMs                : Date.now() - startedAt
        };
    }

    const initialMissing             = getMissing(availableModels);
    const initialInsufficientContext = getInsufficientContext(availableModels);
    const initialContextModelIds     = new Set(initialInsufficientContext.map(item => item.model));
    const rolesToWarm                = roles.filter(role => initialMissing.includes(role.model) || initialContextModelIds.has(role.model));
    const warmedModels               = [];
    const failedModels               = [];
    const pendingModels              = [];
    const attemptedModels            = [];
    const evalSamples                = [];
    const getEvalAttribution         = () => evalSamples.length ? buildOllamaEvalAttribution(evalSamples) : null;

    for (const role of rolesToWarm) {
        const roleEnvelope = toRoleEnvelope(role);
        const announceWarm = () => {
            attemptedModels.push(roleEnvelope);

            const contextSuffix = Neo.isNumber(role.contextLength) ? ` with num_ctx ${role.contextLength}` : '';
            log.info?.(`[ProviderReadinessHelper] Warming native Ollama ${role.role} model '${role.model}'${contextSuffix} via ${role.role === 'embedding' ? '/api/embed' : '/api/chat'}.`);
        };

        // Preserve the existing caller contract byte-for-byte when there is no live-demand oracle:
        // attempted accounting and logger failures remain outside the provider-result catch.
        if (typeof isEffectStillAdmitted !== 'function') {
            announceWarm();
        }

        try {
            const warmOptions = {host, keepAlive, timeoutMs};
            if (providerActivityRecorder) {
                warmOptions.providerActivityRecorder = providerActivityRecorder;
            }
            if (Neo.isNumber(role.contextLength)) {
                warmOptions.contextLength = role.contextLength;
            }

            // Last point owned before this specific warm leaves the process. The readiness poll and
            // the previous role's warm are both awaited above, so the entry check is stale here.
            assertHeld();
            assertEffectAdmitted({
                attemptedModels,
                failedModels,
                pendingModels,
                refusedModel: roleEnvelope,
                warmedModels
            });

            if (typeof isEffectStillAdmitted === 'function') {
                announceWarm();
            }

            const warmResult = await warmModel(role, warmOptions);

            if (warmResult?.pending) {
                pendingModels.push({
                    ...roleEnvelope,
                    code                   : warmResult.code,
                    providerWorkDisposition: warmResult.providerWorkDisposition,
                    timeoutMs              : warmResult.timeoutMs
                });
                continue;
            }

            if (warmResult?.evalSample) {
                evalSamples.push(warmResult.evalSample);
            }

            warmedModels.push({
                ...roleEnvelope,
                ...(warmResult?.evalSample ? {evalSample: warmResult.evalSample} : {})
            });
        } catch (error) {
            // These are admission terminals, not degraded provider results. A refusal before the
            // The first refusal stays zero-effect. A confirmed prior warm is partial; a failed
            // prior attempt is uncertain because the provider-dispatch boundary is not proven.
            if ((error?.reason === 'runtime-authority-lost' && typeof isEffectStillAdmitted === 'function') ||
                error?.reason === 'runtime-effect-not-admitted' || error?.reason === 'runtime-effect-partially-applied' ||
                error?.reason === 'runtime-effect-disposition-uncertain') {
                throw error;
            }

            failedModels.push({
                ...roleEnvelope,
                error: error.message
            });
            log.warn?.(`[ProviderReadinessHelper] Ollama ${role.role} model '${role.model}' warm-up failed: ${error.message}`);

            if (!allowPartial) {
                throw error;
            }
        }
    }

    if (pendingModels.length > 0) {
        const observedRequiredCount = getRequiredAvailable(availableModels).length;

        return {
            ready                    : false,
            degraded                 : true,
            provider                 : 'ollama',
            host,
            warmedModels,
            attemptedModels,
            failedModels,
            pendingModels,
            missingModels            : initialMissing,
            insufficientContextModels: initialInsufficientContext,
            requiredModels,
            availableModels          : toIds(availableModels),
            extraModels              : getExtraModels(availableModels),
            loadedContexts           : Object.fromEntries(availableModels.map(item => [item.id, item.contextLength])),
            observedCount            : availableModels.length,
            observedRequiredCount,
            requireParallelModels,
            requiredResidentModels,
            warning                  : `[provider/ollama] model warm still in flight: ${pendingModels.map(item => `${item.role}:${item.model}`).join(', ')}; provider work remains coalesced and will be re-observed on the next readiness cycle.`,
            ollamaEvalAttribution    : getEvalAttribution(),
            attempts                 : initialProbeAttempt,
            elapsedMs                : Date.now() - startedAt
        };
    }

    let missingModels             = initialMissing;
    let insufficientContextModels = initialInsufficientContext;

    for (let attempt = 1; attempt <= attempts; attempt++) {
        ({availableModels} = await probeModels('post-warm /api/ps probe'));
        missingModels = getMissing(availableModels);
        insufficientContextModels = getInsufficientContext(availableModels);

        const failedModelIds        = new Set(failedModels.map(item => item.model));
        const contextModelIds       = new Set(insufficientContextModels.map(item => item.model));
        const activePendingModels   = pendingModels.filter(item => missingModels.includes(item.model) || contextModelIds.has(item.model));
        const serviceableMissing    = missingModels.filter(model => !failedModelIds.has(model));
        const serviceableContext    = insufficientContextModels.filter(item => !failedModelIds.has(item.model));
        const observedCount         = availableModels.length;
        const observedRequiredCount = getRequiredAvailable(availableModels).length;
        const capacityReady         = observedRequiredCount >= requiredResidentModels;
        const ready                 = capacityReady && missingModels.length === 0 && insufficientContextModels.length === 0 && failedModels.length === 0 && activePendingModels.length === 0;
        const capacityOnlyGap       = missingModels.length === 0 && !capacityReady;

        const contextOnlyGap = missingModels.length === 0 && serviceableContext.length > 0;

        if (ready || (allowPartial && (serviceableMissing.length === 0 || capacityOnlyGap || contextOnlyGap))) {
            const degraded       = !ready;
            const contextWarning = serviceableContext.length
                ? `[provider/ollama] loaded context too small: ${serviceableContext.map(item => `${item.observedModel || item.model} observed=${item.contextLength ?? 'unknown'} required>=${item.requiredContextLength}`).join(', ')}; warm with options.num_ctx matching localModels context caps.`
                : null;
            return {
                ready,
                degraded,
                provider       : 'ollama',
                host,
                warmedModels,
                attemptedModels,
                failedModels,
                pendingModels  : activePendingModels,
                missingModels,
                insufficientContextModels,
                requiredModels,
                availableModels: toIds(availableModels),
                extraModels    : getExtraModels(availableModels),
                loadedContexts : Object.fromEntries(availableModels.map(item => [item.id, item.contextLength])),
                observedCount,
                observedRequiredCount,
                requireParallelModels,
                requiredResidentModels,
                warning        : degraded
                    ? (activePendingModels.length
                        ? `[provider/ollama] model warm still in flight: ${activePendingModels.map(item => `${item.role}:${item.model}`).join(', ')}; provider work remains coalesced and will be re-observed on the next readiness cycle.`
                        : (contextWarning || getWarning({availableModels, missingModels, observedRequiredCount})))
                    : null,
                ollamaEvalAttribution: getEvalAttribution(),
                attempts             : attempt,
                elapsedMs            : Date.now() - startedAt
            };
        }

        if (attempt < attempts) {
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
    }

    const contextWarning = insufficientContextModels.length
        ? `[provider/ollama] loaded context too small: ${insufficientContextModels.map(item => `${item.observedModel || item.model} observed=${item.contextLength ?? 'unknown'} required>=${item.requiredContextLength}`).join(', ')}; warm with options.num_ctx matching localModels context caps.`
        : null;
    const observedRequiredCount = getRequiredAvailable(availableModels).length;
    const contextModelIds       = new Set(insufficientContextModels.map(item => item.model));
    const activePendingModels   = pendingModels.filter(item => missingModels.includes(item.model) || contextModelIds.has(item.model));
    const warning               = activePendingModels.length
        ? `[provider/ollama] model warm still in flight: ${activePendingModels.map(item => `${item.role}:${item.model}`).join(', ')}; provider work remains coalesced and will be re-observed on the next readiness cycle.`
        : (contextWarning || getWarning({availableModels, missingModels, observedRequiredCount}));
    if (allowPartial) {
        return {
            ready                : false,
            degraded             : true,
            provider             : 'ollama',
            host,
            warmedModels,
            attemptedModels,
            failedModels,
            pendingModels        : activePendingModels,
            missingModels,
            insufficientContextModels,
            requiredModels,
            availableModels      : toIds(availableModels),
            extraModels          : getExtraModels(availableModels),
            loadedContexts       : Object.fromEntries(availableModels.map(item => [item.id, item.contextLength])),
            observedCount        : availableModels.length,
            observedRequiredCount,
            requireParallelModels,
            requiredResidentModels,
            warning,
            ollamaEvalAttribution: getEvalAttribution(),
            attempts,
            elapsedMs            : Date.now() - startedAt
        };
    }

    throw new Error(
        `Ollama model readiness failed: ${warning}`
    );
}

/**
 * @summary Restores the active provider role-set residency before higher-cost recovery actions.
 *
 * This is the bounded recovery companion to the read-only parallel-capacity probe:
 * LM Studio is repaired through the orchestrator-owned `lms load` path, while
 * native Ollama is warmed through its role-specific HTTP endpoints. Remote or
 * disabled OpenAI-compatible deployments remain observe-only and return a
 * degraded envelope instead of attempting a local CLI mutation.
 *
 * @param {Object} options
 * @param {Object} [options.config=aiConfig] Provider-source config.
 * @param {Number} options.attempts Probe attempts after warm-up.
 * @param {Number} options.delayMs Delay between probes.
 * @param {Number} options.timeoutMs HTTP/CLI probe timeout.
 * @param {Object} [options.log=logger] Logger seam.
 * @param {Function} [options.lmsRepairFn=ensureLmsModelsLoaded] Test seam for LM Studio repair.
 * @param {Function} [options.ollamaRepairFn=ensureOllamaModelsReady] Test seam for native Ollama repair.
 * @param {Function|null} [options.isAuthorityHeld=null] Live recovery-authority oracle.
 * @param {Function|null} [options.isEffectStillAdmitted=null] Live provider-demand admission oracle.
 * @returns {Promise<Object>} Provider readiness repair result.
 */
export async function repairProviderRoleSetResidency({
    config = aiConfig,
    attempts,
    delayMs,
    timeoutMs,
    log = logger,
    lmsRepairFn = ensureLmsModelsLoaded,
    ollamaRepairFn = ensureOllamaModelsReady,
    isAuthorityHeld = null,
    isEffectStillAdmitted = null
} = {}) {
    /**
     * Re-asserted immediately before the repair dispatches, after the read-only config resolution
     * above it. @neo-gpt-emmy required this and I argued against it — that a lease concern does not
     * belong in a provider-readiness module. That objection was about COUPLING; hers was about a
     * privileged effect firing without authority, which is SAFETY. Safety outranks coupling, and I
     * weighted them the wrong way round.
     *
     * A warm is not a durable mutation of shared state the way an overlay or a ledger append is, so
     * a successor re-warming is idempotent — but "the effect is recoverable" is not the same as "the
     * effect may fire unauthorised", and only the second question is this guard's business.
     */
    const assertHeld = () => {
        if (typeof isAuthorityHeld === 'function' && isAuthorityHeld() !== true) {
            const error = new Error('Authority moved before the provider residency repair; refusing.');

            error.reason = 'runtime-authority-lost';

            throw error;
        }
    };
    if (!config || typeof config !== 'object') {
        throw new TypeError('repairProviderRoleSetResidency: config is required');
    }
    if (typeof attempts !== 'number' || typeof delayMs !== 'number' || typeof timeoutMs !== 'number') {
        throw new TypeError('repairProviderRoleSetResidency: attempts, delayMs, and timeoutMs are required');
    }

    const provider = resolveGraphModelProvider(config);

    if (provider === 'ollama') {
        const readinessConfig = buildOllamaReadinessConfig(config);

        if (readinessConfig.roles.length === 0) {
            return {
                ready  : true,
                skipped: true,
                provider,
                reason : 'no-active-ollama-roles'
            };
        }

        // Last point owned before the unload/load/warm sequence leaves this process. The role
        // resolution above is read-only, so nothing has been mutated if this refuses.
        assertHeld();

        const result = await ollamaRepairFn({
            host                 : readinessConfig.host,
            roles                : readinessConfig.roles,
            keepAlive            : readinessConfig.keepAlive,
            requireParallelModels: readinessConfig.requireParallelModels,
            allowPartial         : true,
            attempts,
            delayMs,
            timeoutMs,
            log,
            // Into the helper, not merely before it: the default helper polls and warms per role,
            // so each warm sits behind its own await and only a per-mutation check binds them.
            isAuthorityHeld,
            ...(typeof isEffectStillAdmitted === 'function' ? {isEffectStillAdmitted} : {})
        });

        return {
            ...result,
            provider,
            action: 'warm-provider'
        };
    }

    if (isOpenAiCompatibleProvider(provider)) {
        if (config.orchestrator.lms.enabled !== true) {
            return {
                ready   : false,
                degraded: true,
                skipped : true,
                provider,
                reason  : 'lms-disabled',
                warning : '[provider/openAiCompatible] provider role-set repair requires orchestrator.lms.enabled=true; non-LM-Studio OpenAI-compatible endpoints remain observe-only.'
            };
        }

        const preloadConfig = buildLmsPreloadConfig(config);

        if (preloadConfig.models.length === 0) {
            return {
                ready  : true,
                skipped: true,
                provider,
                reason : 'no-active-openai-compatible-roles'
            };
        }

        // Same last-owned point on the LMS arm. Both providers reach a privileged effect from this
        // function, so fencing only the ollama branch would leave the other open — the exact
        // half-fixed shape this PR has already produced once.
        assertHeld();

        const result = await lmsRepairFn({
            // Same reason as the ollama arm: the default helper unloads and loads per model.
            isAuthorityHeld,
            host          : getOpenAiCompatibleHost(config),
            models        : preloadConfig.models,
            contextLengths: preloadConfig.contextLengths,
            parallels     : preloadConfig.parallels,
            allowPartial  : true,
            attempts,
            delayMs,
            timeoutMs,
            log
        });

        return {
            ...result,
            provider,
            host  : getOpenAiCompatibleHost(config),
            action: 'warm-provider'
        };
    }

    return {
        ready    : true,
        skipped  : true,
        provider,
        supported: false,
        reason   : 'unsupported-provider'
    };
}

/**
 * @summary Builds the provider readiness target for the resolved REM graph provider.
 * @param {Object} config
 * @returns {Object}
 */
export function getGraphProviderReadinessTarget(config = aiConfig) {
    const provider  = resolveGraphModelProvider(config);
    const supported = isGraphModelProviderSupported(provider);

    if (!supported) {
        return {
            provider,
            supported,
            endpoint      : null,
            host          : null,
            model         : null,
            embeddingModel: null,
            roles         : [],
            url           : null
        };
    }

    const isOllama = provider === 'ollama';
    const host     = isOllama
        ? config.ollama?.host
        : getOpenAiCompatibleHost(config);
    const endpoint       = isOllama ? '/api/tags' : '/v1/models';
    const model          = isOllama ? config.ollama?.model : config.openAiCompatible?.model;
    const embeddingModel = config.embeddingProvider === provider
        ? (isOllama ? config.ollama?.embeddingModel : config.openAiCompatible?.embeddingModel)
        : null;
    const roles = [{providerRole: 'graphProvider', role: 'chat', model}];

    if (config.modelProvider === provider) {
        roles.push({providerRole: 'modelProvider', role: 'chat', model});
    }
    if (embeddingModel) {
        roles.push({providerRole: 'embeddingProvider', role: 'embedding', model: embeddingModel});
    }
    const url = host ? `${host.replace(/\/+$/, '')}${endpoint}` : null;

    return {
        provider,
        supported,
        endpoint,
        host,
        model,
        embeddingModel,
        roles,
        url
    };
}

/**
 * @summary Builds the configured chat / embedding model set for capacity probes.
 * @param {Object} target Provider readiness target.
 * @returns {String[]}
 */
export function getRequiredProviderModels(target) {
    const roleModels = Array.isArray(target?.roles)
        ? target.roles.map(role => role?.model)
        : [target?.model, target?.embeddingModel];

    return [...new Set(roleModels.filter(Boolean))];
}

/**
 * @summary Creates the operator-facing warning for insufficient parallel model residency.
 * @param {Object} options
 * @returns {String}
 */
export function createParallelModelCapacityWarning({
    provider,
    model,
    embeddingModel,
    requiredModels,
    availableModels,
    missingModels,
    extraModels = [],
    observedCount,
    observedRequiredCount,
    requireParallelModels
}) {
    const available        = availableModels.length ? availableModels.join(', ') : 'none';
    const missing          = missingModels.length ? missingModels.join(', ') : 'none';
    const extra            = extraModels.length ? extraModels.join(', ') : 'none';
    const requiredObserved = Neo.isNumber(observedRequiredCount) ? observedRequiredCount : observedCount;
    const base             = `[provider/${provider}] expected ${requireParallelModels}+ required models loaded ` +
        `(chat=${model || 'unset'}, embedding=${embeddingModel || 'unset'}); observed ${requiredObserved} required / ${observedCount} total loaded ` +
        `(available=${available}, required=${requiredModels.join(', ') || 'none'}, missing=${missing}, extra=${extra}); ` +
        'model swap penalty likely;';

    if (provider === 'ollama' && missingModels.length) {
        return `${base} pull missing configured model(s): ${missingModels.map(item => `ollama pull ${item}`).join(' && ')}.`;
    }

    return provider === 'ollama'
        ? `${base} set OLLAMA_MAX_LOADED_MODELS=${requireParallelModels} in the Ollama server environment.`
        : `${base} raise the OpenAI-compatible server loaded-model cap to ${requireParallelModels} and pre-load the required model set.`;
}

/**
 * @summary Probes whether the configured graph provider has its active role models resident together.
 *
 * This is an observability check only. It never mutates provider state and it does
 * not substitute defaults for missing config leaves; callers decide whether to warn
 * or fail based on the returned envelope.
 *
 * @param {Object} options
 * @param {Object} [options.config=aiConfig] Provider-source config (aiConfig-shaped).
 * @param {Number} options.timeoutMs HTTP probe timeout. Required; no module-level default.
 * @param {Function} [options.fetchOpenAiCompatibleModels] Injectable OpenAI-compatible model-list probe.
 * @param {Function} [options.fetchOllamaModels] Injectable Ollama running-model probe.
 * @param {String} [options.modelDiscoveryFreshness='force'] Routine callers may use `routine`; diagnostics/recovery keep `force`.
 * @param {Number} [options.modelDiscoveryCacheTtlMs] Required when `modelDiscoveryFreshness` is `routine`.
 * @returns {Promise<Object>}
 */
export async function probeProviderParallelModelCapacity({
    config = aiConfig,
    timeoutMs,
    fetchOpenAiCompatibleModels = opts => fetchOpenAiCompatibleModelIds(opts),
    fetchOllamaModels           = opts => fetchOllamaRunningModelIds(opts),
    modelDiscoveryFreshness     = PROVIDER_DISCOVERY_FORCE,
    modelDiscoveryCacheTtlMs
} = {}) {
    if (!config || typeof config !== 'object') {
        throw new TypeError('probeProviderParallelModelCapacity: config is required');
    }
    if (typeof timeoutMs !== 'number') {
        throw new TypeError('probeProviderParallelModelCapacity: timeoutMs is required');
    }

    const target = getGraphProviderReadinessTarget(config);

    if (!target.supported || !target.host) {
        return {
            ready    : true,
            skipped  : true,
            provider : target.provider,
            supported: target.supported,
            reason   : target.supported ? 'missing-host' : 'unsupported-provider'
        };
    }

    const providerConfig        = config[target.provider];
    const requireParallelModels = providerConfig?.requireParallelModels;

    if (!Neo.isNumber(requireParallelModels)) {
        throw new TypeError(`probeProviderParallelModelCapacity: config.${target.provider}.requireParallelModels must be configured as a number`);
    }

    const requiredModels  = getRequiredProviderModels(target);
    const availableModels = target.provider === 'ollama'
        ? await fetchOllamaModels({host: target.host, timeoutMs})
        : await fetchOpenAiCompatibleModels({
            host      : target.host,
            timeoutMs,
            freshness : modelDiscoveryFreshness,
            cacheTtlMs: modelDiscoveryFreshness === PROVIDER_DISCOVERY_ROUTINE
                ? modelDiscoveryCacheTtlMs
                : undefined
        });
    const uniqueAvailable = [...new Set(availableModels)];
    // THE production seam: this result feeds `DeploymentStateBridgeService`, whose residency verdict
    // licenses `warmProvider`. Comparing exactly here — while the helpers below canonicalise — would
    // leave the actuator driven by the very false negative this fixes, with green helper tests over it.
    const satisfiedBy   = model => resolveRequiredModelId(model, requiredModels, target.provider);
    const missingModels = requiredModels.filter(required =>
        !uniqueAvailable.some(observed => satisfiesRequiredModelId(required, observed, target.provider)));
    const extraModels            = uniqueAvailable.filter(model => !satisfiedBy(model));
    const observedCount          = uniqueAvailable.length;
    const observedRequiredCount  = uniqueAvailable.filter(satisfiedBy).length;
    const requiredResidentModels = Math.min(requireParallelModels, requiredModels.length);
    const ready                  = observedRequiredCount >= requiredResidentModels && missingModels.length === 0;

    return {
        ready,
        provider       : target.provider,
        host           : target.host,
        model          : target.model,
        embeddingModel : target.embeddingModel,
        requireParallelModels,
        requiredModels,
        availableModels: uniqueAvailable,
        extraModels,
        missingModels,
        observedCount,
        observedRequiredCount,
        requiredResidentModels,
        warning        : ready ? null : createParallelModelCapacityWarning({
            provider             : target.provider,
            model                : target.model,
            embeddingModel       : target.embeddingModel,
            requiredModels,
            availableModels      : uniqueAvailable,
            missingModels,
            extraModels,
            observedCount,
            observedRequiredCount,
            requireParallelModels: requiredResidentModels
        })
    };
}

/**
 * @summary Emits a non-blocking warning when provider model residency cannot satisfy the REM cycle.
 *
 * The provider must already be reachable before callers invoke this helper. Probe
 * failures become WARN records, not boot blockers, because readiness itself is
 * owned by `waitForProvider()`.
 *
 * @param {Object} options
 * @param {Object} [options.config=aiConfig] Provider-source config (aiConfig-shaped).
 * @param {Number} options.timeoutMs HTTP probe timeout. Required; no module-level default.
 * @param {Object} [options.log=logger] Logger seam.
 * @returns {Promise<Object>}
 */
export async function warnProviderParallelModelCapacity({
    config = aiConfig,
    timeoutMs,
    log = logger,
    ...probeOptions
} = {}) {
    try {
        const result = await probeProviderParallelModelCapacity({
            config,
            timeoutMs,
            ...probeOptions
        });

        if (!result.ready && result.warning) {
            log.warn?.(result.warning, result);
        }

        return result;
    } catch (error) {
        const provider = config ? resolveGraphModelProvider(config) : 'unknown';
        const result   = {
            ready  : false,
            provider,
            error  : {message: error?.message || String(error)},
            warning: `[provider/${provider}] parallel-model capacity probe failed: ${error?.message || error}`
        };

        log.warn?.(result.warning, result);
        return result;
    }
}

/**
 * @summary Probes the configured graph provider used by the REM pipeline.
 * @param {Object} options
 * @param {Object} options.config Provider-source config (aiConfig-shaped).
 * @param {Number} options.timeoutMs HTTP probe abandon threshold. Required; no module-level default.
 * @param {String} [options.modelDiscoveryFreshness='force'] Routine callers may use `routine`; diagnostics/recovery keep `force`.
 * @param {Number} [options.modelDiscoveryCacheTtlMs] Required when `modelDiscoveryFreshness` is `routine`.
 * @returns {Promise<Boolean>}
 */
export function checkProvider({
    config,
    timeoutMs,
    modelDiscoveryFreshness = PROVIDER_DISCOVERY_FORCE,
    modelDiscoveryCacheTtlMs
} = {}) {
    if (typeof timeoutMs !== 'number') {
        throw new TypeError('checkProvider: timeoutMs is required (pass from config.orchestrator.providerReadiness.timeoutMs)');
    }
    const target = getGraphProviderReadinessTarget(config ?? aiConfig.data);

    if (!target.supported || !target.url) {
        return Promise.resolve(false);
    }

    if (target.provider === 'openAiCompatible') {
        return fetchOpenAiCompatibleModelIds({
            host      : target.host,
            timeoutMs,
            freshness : modelDiscoveryFreshness,
            cacheTtlMs: modelDiscoveryFreshness === PROVIDER_DISCOVERY_ROUTINE
                ? modelDiscoveryCacheTtlMs
                : undefined
        }).then(() => true, () => false);
    }

    return new Promise(resolve => {
        let   settled = false;
        const settle  = value => {
            if (!settled) {
                settled = true;
                resolve(value);
            }
        };

        const req = http.get(target.url, response => {
            response.resume();
            settle(true);
        });

        req.setTimeout(timeoutMs, () => {
            req.destroy();
            settle(false);
        });
        req.on('error', () => settle(false));
    });
}

/**
 * @summary Waits for the local graph provider readiness loop while exposing deterministic test seams.
 *
 * Probe parameters are required arguments; callers read
 * `AiConfig.orchestrator.providerReadiness` and pass the values explicitly so
 * configuration remains the single source of truth.
 *
 * @param {Object} options
 * @param {Function} [options.checkProvider] Injectable probe (defaults to `checkProvider` bound to the same `timeoutMs`).
 * @param {Number} options.attempts Retry cap.
 * @param {Number} options.delayMs Between-probe wait.
 * @param {Number} options.timeoutMs HTTP probe abandon threshold (also flows into the default `checkProvider` when no override is provided).
 * @param {String} [options.modelDiscoveryFreshness='force'] Routine callers may use `routine`; diagnostics/recovery keep `force`.
 * @param {Number} [options.modelDiscoveryCacheTtlMs] Required when `modelDiscoveryFreshness` is `routine`.
 * @param {Object} [options.output] Writable stream for dot-progress (defaults to `process.stdout`).
 * @returns {Promise<Object>}
 */
export async function waitForProvider({
    checkProvider: providerCheck,
    attempts,
    delayMs,
    timeoutMs,
    modelDiscoveryFreshness = PROVIDER_DISCOVERY_FORCE,
    modelDiscoveryCacheTtlMs,
    output = process.stdout
} = {}) {
    if (typeof attempts !== 'number' || typeof delayMs !== 'number' || typeof timeoutMs !== 'number') {
        throw new TypeError('waitForProvider: attempts, delayMs, and timeoutMs are required (pass from config.orchestrator.providerReadiness)');
    }

    const probe = providerCheck ?? (() => checkProvider({
        timeoutMs,
        modelDiscoveryFreshness,
        modelDiscoveryCacheTtlMs
    }));
    const startedAt = Date.now();

    for (let i = 0; i < attempts; i++) {
        if (await probe()) {
            return {
                running  : true,
                attempts : i + 1,
                elapsedMs: Date.now() - startedAt,
                timeoutMs: attempts * delayMs
            };
        }

        output.write('.');
        await new Promise(resolve => setTimeout(resolve, delayMs));
    }

    return {
        running  : false,
        attempts,
        elapsedMs: Date.now() - startedAt,
        timeoutMs: attempts * delayMs
    };
}

/**
 * @summary Validates the required provider-readiness config shape without substituting defaults.
 * @param {Object} readinessConfig `AiConfig.orchestrator.providerReadiness`.
 * @returns {Object}
 */
export function assertProviderReadinessConfig(readinessConfig) {
    if (!readinessConfig || typeof readinessConfig !== 'object') {
        throw new TypeError('AiConfig.orchestrator.providerReadiness is required; copy the providerReadiness block from ai/config.template.mjs or set its env-backed values in ai/config.mjs');
    }

    const missing = ['attempts', 'delayMs', 'timeoutMs', 'routineCacheTtlMs'].filter(key => typeof readinessConfig[key] !== 'number');
    if (missing.length > 0) {
        throw new TypeError(`AiConfig.orchestrator.providerReadiness.${missing.join('|')} must be configured as number(s); no code-level fallback is applied`);
    }

    return readinessConfig;
}

/**
 * @summary Builds the durable provider-timeout breadcrumb for REM-cycle callers.
 *
 * Field values flow from `config` and `waitResult` verbatim. Missing inputs
 * surface as `undefined` on the returned envelope (fail-loud); consumers MUST
 * tolerate undefined rather than relying on substitution.
 *
 * @param {Object} options
 * @param {Object} options.config Provider-source config (aiConfig-shaped).
 * @param {Object} [options.waitResult] Result envelope from `waitForProvider`; omit when emitting on the unsupported-provider path.
 * @param {Object} [options.lifecycleStatus] Consumer-sourced lifecycle snapshot; surfaces verbatim on the envelope.
 * @param {String} [options.reason] One of `'PROVIDER_READINESS_TIMEOUT'`, `'UNSUPPORTED_GRAPH_PROVIDER'`, `'PROVIDER_MODEL_RESIDENCY_DEGRADED'`.
 * @returns {Object}
 */
export function createProviderFailureDiagnostic({
    config = aiConfig,
    waitResult,
    lifecycleStatus,
    reason = 'PROVIDER_READINESS_TIMEOUT',
    capacity
} = {}) {
    const target      = getGraphProviderReadinessTarget(config);
    const unsupported = reason === 'UNSUPPORTED_GRAPH_PROVIDER';
    const degraded    = reason === 'PROVIDER_MODEL_RESIDENCY_DEGRADED';

    return {
        event          : unsupported
            ? 'runSandman.unsupported_graph_provider'
            : degraded
                ? 'runSandman.provider_model_residency_degraded'
                : 'runSandman.provider_readiness_timeout',
        reason,
        provider      : target.provider,
        graphProvider : target.provider,
        modelProvider : config.modelProvider,
        host          : target.host,
        endpoint      : target.endpoint,
        url           : target.url,
        supported     : target.supported,
        model         : target.model,
        embeddingModel: target.embeddingModel,
        attempts      : waitResult?.attempts,
        elapsedMs     : waitResult?.elapsedMs,
        timeoutMs     : waitResult?.timeoutMs,
        capacity,
        lifecycleStatus,
        nextAction    : degraded && capacity?.warning
            ? capacity.warning
            : target.supported
            ? (
                target.provider === 'openAiCompatible'
                    ? 'Start the configured OpenAI-compatible / MLX provider, then rerun npm run ai:run-sandman.'
                    : `Start the configured ${target.provider} provider, then rerun npm run ai:run-sandman.`
            )
            : "Set NEO_GRAPH_PROVIDER to 'openAiCompatible' or 'ollama', then rerun npm run ai:run-sandman."
    };
}

/**
 * @summary Records provider-readiness failure through terminal output and durable MC logging.
 * @param {Object} diagnostic
 * @param {Object} sinks
 * @param {Object} sinks.log
 * @param {Function} sinks.stderr
 * @returns {Promise<Object>}
 */
export async function recordProviderReadinessFailure(
    diagnostic,
    {
        log    = logger,
        stderr = console.error
    } = {}
) {
    const message = diagnostic.reason === 'UNSUPPORTED_GRAPH_PROVIDER'
        ? `\n❌ Unsupported Sandman graph provider '${diagnostic.graphProvider}'. Expected one of: 'ollama', 'openAiCompatible'.`
        : diagnostic.reason === 'PROVIDER_MODEL_RESIDENCY_DEGRADED'
            ? `\n❌ ${diagnostic.provider} provider model residency degraded on ${diagnostic.host}. ${diagnostic.nextAction}`
        : `\n❌ ${diagnostic.provider} provider is not running on ${diagnostic.host}${diagnostic.endpoint || ''}. Please start the configured provider manually.`;

    stderr(message);
    log.error(
        diagnostic.reason === 'UNSUPPORTED_GRAPH_PROVIDER'
            ? '[runSandman] unsupported graph provider'
            : diagnostic.reason === 'PROVIDER_MODEL_RESIDENCY_DEGRADED'
                ? `[runSandman] ${diagnostic.provider} provider model residency degraded`
            : `[runSandman] ${diagnostic.provider} provider readiness timeout`,
        diagnostic
    );

    if (typeof log.flush === 'function') {
        await log.flush();
    }

    return {message, diagnostic};
}
