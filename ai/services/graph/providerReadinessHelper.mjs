import http                        from 'http';
import {execFile}                  from 'child_process';
import {Memory_Config as aiConfig} from '../../services.mjs';
import logger                      from '../../mcp/server/memory-core/logger.mjs';
import {
    isGraphModelProviderSupported,
    isOpenAiCompatibleProvider,
    resolveGraphModelProvider
} from './providerDispatch.mjs';

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
 * @returns {Promise<String[]>}
 */
export async function fetchOpenAiCompatibleModelIds({host, timeoutMs, fetchFn = fetch} = {}) {
    if (!host) {
        throw new TypeError('fetchOpenAiCompatibleModelIds: host is required');
    }
    if (typeof timeoutMs !== 'number') {
        throw new TypeError('fetchOpenAiCompatibleModelIds: timeoutMs is required');
    }

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
 * @summary Warms one native Ollama model through the role-specific Ollama endpoint.
 *
 * Native Ollama is not an OpenAI-compatible provider behind a different selector:
 * chat/generation work is warmed through `/api/chat`, while vector work is warmed
 * through `/api/embed`. `keep_alive` flows from operator config so readiness
 * matches the same residency policy used by normal provider calls.
 *
 * @param {Object} options
 * @param {String} options.host Ollama host.
 * @param {String} options.model Ollama model identifier.
 * @param {String} options.role Either `'chat'` or `'embedding'`.
 * @param {String|Number} [options.keepAlive] Ollama keep_alive value.
 * @param {Number} [options.contextLength] Native Ollama `options.num_ctx` warm-up override.
 * @param {Number} options.timeoutMs HTTP timeout. Required; no module-level default.
 * @param {Function} [options.fetchFn=fetch] Fetch seam for tests.
 * @returns {Promise<Object>}
 */
export async function warmOllamaRoleModel({
    host,
    model,
    role,
    keepAlive,
    contextLength,
    timeoutMs,
    fetchFn = fetch
} = {}) {
    if (!host) {
        throw new TypeError('warmOllamaRoleModel: host is required');
    }
    if (!model) {
        throw new TypeError('warmOllamaRoleModel: model is required');
    }
    if (typeof timeoutMs !== 'number') {
        throw new TypeError('warmOllamaRoleModel: timeoutMs is required');
    }
    if (role !== 'chat' && role !== 'embedding') {
        throw new TypeError("warmOllamaRoleModel: role must be 'chat' or 'embedding'");
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

    const response = await fetchFn(new URL(endpoint, host).toString(), {
        method : 'POST',
        headers: {'content-type': 'application/json'},
        body   : JSON.stringify(payload),
        signal : AbortSignal.timeout(timeoutMs)
    });

    if (!response.ok) {
        const text = typeof response.text === 'function' ? await response.text() : '';
        throw new Error(`Ollama ${role} model warmup failed for '${model}': HTTP ${response.status}${text ? ` - ${text}` : ''}`);
    }

    if (typeof response.text === 'function') {
        await response.text();
    }

    return {model, role, endpoint};
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
 * @returns {Promise<{stdout: String, stderr: String}>}
 */
export function loadLmsModel(model, {execFileFn = execFile, contextLength, parallel} = {}) {
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
 * @returns {{models: String[], contextLengths: Object}} Role-aware LMS preload config.
 */
export function buildLmsPreloadConfig(config = aiConfig) {
    const openAiCompatibleConfig = config.openAiCompatible ?? {},
          chatModel              = openAiCompatibleConfig.model,
          embeddingModel         = openAiCompatibleConfig.embeddingModel,
          chatContextLength      = config.localModels?.chat?.contextLimitTokens,
          embeddingContextLength = config.localModels?.embedding?.contextLimitTokens,
          chatParallel           = config.localModels?.chat?.parallel,
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
    // Only the chat role carries a configured slot count; the embedding role keeps the lms default.
    // Keyed by model id so it force-includes through the same path as contextLengths; the embedding
    // model is intentionally absent (no per-model parallel override).
    const parallels = selectedContextRole('chat') && chatModel && Neo.isNumber(chatParallel)
        ? {[chatModel]: chatParallel}
        : {};

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
    const ollamaConfig           = config.ollama ?? {},
          chatModel              = ollamaConfig.model,
          embeddingModel         = ollamaConfig.embeddingModel,
          chatContextLength      = config.localModels?.chat?.contextLimitTokens,
          embeddingContextLength = config.localModels?.embedding?.contextLimitTokens,
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
 * @summary Ensures LM Studio has all configured OpenAI-compatible models loaded.
 *
 * The orchestrator-owned `lms server start` task gets the server process running;
 * this helper adds the model-residency half by probing `/v1/models`, invoking
 * `lms load <model>` for missing chat / embedding models, then waiting until the
 * endpoint enumerates both. Parameters come from config-owned callers so the helper
 * has no hidden retry or timeout defaults.
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
 * @param {Function} [options.loadModel] Injectable model-load function.
 * @param {Object} [options.log=logger] Logger seam.
 * @returns {Promise<Object>}
 */
export async function ensureLmsModelsLoaded({
    host,
    models,
    attempts,
    delayMs,
    timeoutMs,
    contextLengths = {},
    parallels      = {},
    allowPartial   = false,
    fetchModelIds = opts => fetchOpenAiCompatibleModelIds(opts),
    loadModel     = (model, options) => loadLmsModel(model, options),
    log           = logger
} = {}) {
    if (!Array.isArray(models) || models.length === 0) {
        throw new TypeError('ensureLmsModelsLoaded: models must contain at least one configured model');
    }
    if (typeof attempts !== 'number' || typeof delayMs !== 'number' || typeof timeoutMs !== 'number') {
        throw new TypeError('ensureLmsModelsLoaded: attempts, delayMs, and timeoutMs are required');
    }

    const requiredModels = [...new Set(models.filter(Boolean))];
    if (requiredModels.length === 0) {
        throw new TypeError('ensureLmsModelsLoaded: models must contain at least one configured model');
    }

    const getMissing  = available => requiredModels.filter(model => !available.includes(model));
    const probeModels = async phase => {
        let lastError;

        for (let attempt = 1; attempt <= attempts; attempt++) {
            try {
                return {
                    attempt,
                    availableModels: await fetchModelIds({host, timeoutMs})
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

    let {availableModels} = await probeModels('initial /v1/models probe');
    const initialMissing = getMissing(availableModels);
    const failedModels   = [];

    // Force-include context-configured models in the load set even when already
    // resident in /v1/models. `/v1/models` reports presence only — it does NOT
    // expose the loaded context window, so model-id presence is insufficient to
    // confirm the loaded cap matches the operator-declared threshold. Without
    // this re-load, the exact context-window-mismatch regression survives orchestrator restarts:
    // a model loaded with the modelfile-default context window (~4K-8K) would
    // be accepted as ready while every chat invocation silently overflows.
    // Force-include each context-configured model in the load set even if resident,
    // BUT preserve the declared requiredModels input order (filter rather than concat-dedupe).
    const modelsToLoad = requiredModels.filter(model => {
        if (initialMissing.includes(model)) return true;
        return Neo.isNumber(contextLengths?.[model]) || Neo.isNumber(parallels?.[model]);
    });
    const attemptedModels = [...modelsToLoad];
    const loadedModels    = [];

    if (modelsToLoad.length === 0) {
        return {
            ready       : true,
            loadedModels: [],
            requiredModels,
            availableModels,
            attempts    : 1
        };
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
            await loadModel(model, {contextLength, parallel});
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
        ({availableModels} = await probeModels('post-load /v1/models probe'));
        missingModels = getMissing(availableModels);

        const knownUnavailable = new Set([
            ...failedModels.map(item => item.model)
        ]);
        const serviceableMissing = missingModels.filter(model => !knownUnavailable.has(model));

        if (missingModels.length === 0 || (allowPartial && serviceableMissing.length === 0)) {
            const ready = missingModels.length === 0 && failedModels.length === 0;
            return {
                ready,
                degraded : !ready,
                loadedModels,
                attemptedModels,
                failedModels,
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
    log           = logger
} = {}) {
    if (!Array.isArray(roles) || roles.length === 0) {
        throw new TypeError('ensureOllamaModelsReady: roles must contain at least one configured Ollama role');
    }
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
    const toIds                = available => available.map(item => item.id);
    const getRequiredAvailable = available => available.filter(item => requiredModelSet.has(item.id));
    const getExtraModels       = available => toIds(available.filter(item => !requiredModelSet.has(item.id)));
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
    const getMissing             = available => requiredModels.filter(model => !toIds(available).includes(model));
    const getInsufficientContext = available => available
        .filter(item => contextRequirements.has(item.id) && (!Neo.isNumber(item.contextLength) || item.contextLength < contextRequirements.get(item.id)))
        .map(item => ({
            model                : item.id,
            contextLength        : item.contextLength,
            requiredContextLength: contextRequirements.get(item.id)
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
    let availableModels;

    try {
        ({availableModels} = await probeModels('initial /api/ps probe'));
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
            error                    : {message: error.message},
            warning              : `[provider/ollama] model residency probe failed: ${error.message}`,
            attempts,
            elapsedMs            : Date.now() - startedAt
        };
    }

    const initialMissing             = getMissing(availableModels);
    const initialInsufficientContext = getInsufficientContext(availableModels);
    const initialContextModelIds     = new Set(initialInsufficientContext.map(item => item.model));
    const rolesToWarm                = roles.filter(role => initialMissing.includes(role.model) || initialContextModelIds.has(role.model));
    const warmedModels               = [];
    const failedModels               = [];
    const attemptedModels            = [];

    for (const role of rolesToWarm) {
        const roleEnvelope = toRoleEnvelope(role);

        attemptedModels.push(roleEnvelope);
        const contextSuffix = Neo.isNumber(role.contextLength) ? ` with num_ctx ${role.contextLength}` : '';
        log.info?.(`[ProviderReadinessHelper] Warming native Ollama ${role.role} model '${role.model}'${contextSuffix} via ${role.role === 'embedding' ? '/api/embed' : '/api/chat'}.`);

        try {
            const warmOptions = {host, keepAlive, timeoutMs};
            if (Neo.isNumber(role.contextLength)) {
                warmOptions.contextLength = role.contextLength;
            }

            await warmModel(role, warmOptions);
            warmedModels.push(roleEnvelope);
        } catch (error) {
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

    let missingModels             = initialMissing;
    let insufficientContextModels = initialInsufficientContext;

    for (let attempt = 1; attempt <= attempts; attempt++) {
        ({availableModels} = await probeModels('post-warm /api/ps probe'));
        missingModels = getMissing(availableModels);
        insufficientContextModels = getInsufficientContext(availableModels);

        const failedModelIds        = new Set(failedModels.map(item => item.model));
        const serviceableMissing    = missingModels.filter(model => !failedModelIds.has(model));
        const serviceableContext    = insufficientContextModels.filter(item => !failedModelIds.has(item.model));
        const observedCount         = availableModels.length;
        const observedRequiredCount = getRequiredAvailable(availableModels).length;
        const capacityReady         = observedRequiredCount >= requiredResidentModels;
        const ready                 = capacityReady && missingModels.length === 0 && insufficientContextModels.length === 0 && failedModels.length === 0;
        const capacityOnlyGap       = missingModels.length === 0 && !capacityReady;

        const contextOnlyGap = missingModels.length === 0 && serviceableContext.length > 0;

        if (ready || (allowPartial && (serviceableMissing.length === 0 || capacityOnlyGap || contextOnlyGap))) {
            const degraded       = !ready;
            const contextWarning = serviceableContext.length
                ? `[provider/ollama] loaded context too small: ${serviceableContext.map(item => `${item.model} observed=${item.contextLength ?? 'unknown'} required>=${item.requiredContextLength}`).join(', ')}; warm with options.num_ctx matching localModels context caps.`
                : null;
            return {
                ready,
                degraded,
                provider       : 'ollama',
                host,
                warmedModels,
                attemptedModels,
                failedModels,
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
                warning        : degraded ? (contextWarning || getWarning({availableModels, missingModels, observedRequiredCount})) : null,
                attempts       : attempt,
                elapsedMs      : Date.now() - startedAt
            };
        }

        if (attempt < attempts) {
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
    }

    const contextWarning = insufficientContextModels.length
        ? `[provider/ollama] loaded context too small: ${insufficientContextModels.map(item => `${item.model} observed=${item.contextLength ?? 'unknown'} required>=${item.requiredContextLength}`).join(', ')}; warm with options.num_ctx matching localModels context caps.`
        : null;
    const observedRequiredCount = getRequiredAvailable(availableModels).length;
    const warning               = contextWarning || getWarning({availableModels, missingModels, observedRequiredCount});
    if (allowPartial) {
        return {
            ready          : false,
            degraded       : true,
            provider       : 'ollama',
            host,
            warmedModels,
            attemptedModels,
            failedModels,
            missingModels,
            insufficientContextModels,
            requiredModels,
            availableModels: toIds(availableModels),
            extraModels    : getExtraModels(availableModels),
            loadedContexts : Object.fromEntries(availableModels.map(item => [item.id, item.contextLength])),
            observedCount  : availableModels.length,
            observedRequiredCount,
            requireParallelModels,
            requiredResidentModels,
            warning,
            attempts,
            elapsedMs      : Date.now() - startedAt
        };
    }

    throw new Error(
        `Ollama model readiness failed: ${warning}`
    );
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
            url           : null
        };
    }

    const isOllama = provider === 'ollama';
    const host     = isOllama
        ? config.ollama?.host
        : getOpenAiCompatibleHost(config);
    const endpoint       = isOllama ? '/api/tags' : '/v1/models';
    const model          = isOllama ? config.ollama?.model : config.openAiCompatible?.model;
    const embeddingModel = isOllama
        ? config.ollama?.embeddingModel
        : config.openAiCompatible?.embeddingModel;
    const url = host ? `${host.replace(/\/+$/, '')}${endpoint}` : null;

    return {
        provider,
        supported,
        endpoint,
        host,
        model,
        embeddingModel,
        url
    };
}

/**
 * @summary Builds the configured chat / embedding model set for capacity probes.
 * @param {Object} target Provider readiness target.
 * @returns {String[]}
 */
export function getRequiredProviderModels(target) {
    return [...new Set([target?.model, target?.embeddingModel].filter(Boolean))];
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
    const base      = `[provider/${provider}] expected ${requireParallelModels}+ required models loaded ` +
        `(chat=${model || 'unset'}, embedding=${embeddingModel || 'unset'}); observed ${requiredObserved} required / ${observedCount} total loaded ` +
        `(available=${available}, required=${requiredModels.join(', ') || 'none'}, missing=${missing}, extra=${extra}); ` +
        'model swap penalty likely;';

    if (provider === 'ollama' && missingModels.length) {
        return `${base} pull missing configured model(s): ${missingModels.map(item => `ollama pull ${item}`).join(' && ')}.`;
    }

    return provider === 'ollama'
        ? `${base} set OLLAMA_MAX_LOADED_MODELS=${requireParallelModels} in the Ollama server environment.`
        : `${base} raise the OpenAI-compatible server loaded-model cap to ${requireParallelModels} and pre-load both models.`;
}

/**
 * @summary Probes whether the configured graph provider has chat + embedding models resident together.
 *
 * This is an observability check only. It never mutates provider state and it does
 * not substitute defaults for missing config leaves; callers decide whether to warn
 * or fail based on the returned envelope.
 *
 * @param {Object} options
 * @param {Object} options.config Provider-source config (aiConfig-shaped).
 * @param {Number} options.timeoutMs HTTP probe timeout. Required; no module-level default.
 * @param {Function} [options.fetchOpenAiCompatibleModels] Injectable OpenAI-compatible model-list probe.
 * @param {Function} [options.fetchOllamaModels] Injectable Ollama running-model probe.
 * @returns {Promise<Object>}
 */
export async function probeProviderParallelModelCapacity({
    config,
    timeoutMs,
    fetchOpenAiCompatibleModels = opts => fetchOpenAiCompatibleModelIds(opts),
    fetchOllamaModels           = opts => fetchOllamaRunningModelIds(opts)
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
        : await fetchOpenAiCompatibleModels({host: target.host, timeoutMs});
    const uniqueAvailable        = [...new Set(availableModels)];
    const missingModels          = requiredModels.filter(model => !uniqueAvailable.includes(model));
    const requiredModelSet       = new Set(requiredModels);
    const extraModels            = uniqueAvailable.filter(model => !requiredModelSet.has(model));
    const observedCount          = uniqueAvailable.length;
    const observedRequiredCount  = uniqueAvailable.filter(model => requiredModelSet.has(model)).length;
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
 * @param {Object} options.config Provider-source config (aiConfig-shaped).
 * @param {Number} options.timeoutMs HTTP probe timeout. Required; no module-level default.
 * @param {Object} [options.log=logger] Logger seam.
 * @returns {Promise<Object>}
 */
export async function warnProviderParallelModelCapacity({
    config,
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
            ready: false,
            provider,
            error: {message: error?.message || String(error)},
            warning : `[provider/${provider}] parallel-model capacity probe failed: ${error?.message || error}`
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
 * @returns {Promise<Boolean>}
 */
export function checkProvider({config, timeoutMs} = {}) {
    if (typeof timeoutMs !== 'number') {
        throw new TypeError('checkProvider: timeoutMs is required (pass from config.orchestrator.providerReadiness.timeoutMs)');
    }
    const target = getGraphProviderReadinessTarget(config ?? aiConfig.data);

    if (!target.supported || !target.url) {
        return Promise.resolve(false);
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
 * @param {Object} [options.output] Writable stream for dot-progress (defaults to `process.stdout`).
 * @returns {Promise<Object>}
 */
export async function waitForProvider({
    checkProvider: providerCheck,
    attempts,
    delayMs,
    timeoutMs,
    output = process.stdout
} = {}) {
    if (typeof attempts !== 'number' || typeof delayMs !== 'number' || typeof timeoutMs !== 'number') {
        throw new TypeError('waitForProvider: attempts, delayMs, and timeoutMs are required (pass from config.orchestrator.providerReadiness)');
    }

    const probe     = providerCheck ?? (() => checkProvider({timeoutMs}));
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

    const missing = ['attempts', 'delayMs', 'timeoutMs'].filter(key => typeof readinessConfig[key] !== 'number');
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
