import Memory_Config from '../../mcp/server/memory-core/config.mjs';
import logger        from '../../mcp/server/memory-core/logger.mjs';
import http          from 'http';
import {isGraphModelProviderSupported, resolveGraphModelProvider} from './providerDispatch.mjs';

const DEFAULT_OPENAI_COMPATIBLE_HOST = 'http://127.0.0.1:8000';
const DEFAULT_OLLAMA_HOST            = 'http://127.0.0.1:11434';
const PROVIDER_READY_ATTEMPTS        = 30;
const PROVIDER_READY_RETRY_MS        = 1000;
const PROVIDER_READY_TIMEOUT_MS      = 3000;

/**
 * @summary Resolves the OpenAI-compatible host used by one graph-provider option.
 * @param {Object} config
 * @returns {String}
 */
export function getOpenAiCompatibleHost(config = Memory_Config.data) {
    return config.openAiCompatible?.host || DEFAULT_OPENAI_COMPATIBLE_HOST;
}

/**
 * @summary Builds the provider readiness target for the resolved graph provider.
 * @param {Object} config
 * @returns {Object}
 */
export function getGraphProviderReadinessTarget(config = Memory_Config.data) {
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
        ? config.ollama?.host || DEFAULT_OLLAMA_HOST
        : getOpenAiCompatibleHost(config);
    const endpoint = isOllama ? '/api/tags' : '/v1/models';
    const model    = isOllama ? config.ollama?.model || null : config.openAiCompatible?.model || null;
    const embeddingModel = isOllama
        ? config.ollama?.embeddingModel || null
        : config.openAiCompatible?.embeddingModel || null;
    const url      = `${host.replace(/\/+$/, '')}${endpoint}`;

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
 * @summary Probes the configured graph provider used by REM graph-generation lanes.
 * @param {Object} config
 * @param {Object} options
 * @param {Number} options.requestTimeoutMs
 * @returns {Promise<Boolean>}
 */
export function checkProvider(
    config = Memory_Config.data,
    {
        requestTimeoutMs = PROVIDER_READY_TIMEOUT_MS
    } = {}
) {
    const target = getGraphProviderReadinessTarget(config);

    if (!target.supported) {
        return Promise.resolve(false);
    }

    return new Promise(resolve => {
        let settled = false;
        const settle = value => {
            if (!settled) {
                settled = true;
                resolve(value);
            }
        };

        const req = http.get(target.url, response => {
            response.resume();
            settle(true);
        });

        req.setTimeout(requestTimeoutMs, () => {
            req.destroy();
            settle(false);
        });
        req.on('error', () => settle(false));
    });
}

/**
 * @summary Waits for graph-provider readiness while exposing deterministic test seams.
 * @param {Object} options
 * @param {Function} options.checkProvider
 * @param {Object} options.providerConfig
 * @param {Number} options.attempts
 * @param {Number} options.delayMs
 * @param {Number} options.requestTimeoutMs
 * @param {Object} options.output
 * @returns {Promise<Object>}
 */
export async function waitForProvider({
    checkProvider   : providerCheck = checkProvider,
    providerConfig  = Memory_Config.data,
    attempts        = PROVIDER_READY_ATTEMPTS,
    delayMs         = PROVIDER_READY_RETRY_MS,
    requestTimeoutMs = PROVIDER_READY_TIMEOUT_MS,
    output          = process.stdout
} = {}) {
    const startedAt = Date.now();

    for (let i = 0; i < attempts; i++) {
        if (await providerCheck(providerConfig, {requestTimeoutMs})) {
            return {
                running  : true,
                attempts : i + 1,
                elapsedMs: Date.now() - startedAt,
                timeoutMs: attempts * (delayMs + requestTimeoutMs)
            };
        }

        output.write('.');
        await new Promise(resolve => setTimeout(resolve, delayMs));
    }

    return {
        running  : false,
        attempts,
        elapsedMs: Date.now() - startedAt,
        timeoutMs: attempts * (delayMs + requestTimeoutMs)
    };
}

/**
 * @summary Builds the durable graph-provider failure diagnostic payload.
 * @param {Object} options
 * @param {Object} options.config
 * @param {Object} options.waitResult
 * @param {Object|null} options.lifecycleStatus
 * @param {String} options.reason
 * @returns {Object}
 */
export function createProviderFailureDiagnostic({
    config = Memory_Config.data,
    waitResult,
    lifecycleStatus = null,
    reason = 'PROVIDER_READINESS_TIMEOUT'
} = {}) {
    const target = getGraphProviderReadinessTarget(config);
    const unsupported = reason === 'UNSUPPORTED_GRAPH_PROVIDER';

    return {
        event          : unsupported
            ? 'runSandman.unsupported_graph_provider'
            : 'runSandman.provider_readiness_timeout',
        reason,
        provider       : target.provider,
        graphProvider  : target.provider,
        modelProvider  : config.modelProvider || null,
        host           : target.host,
        endpoint       : target.endpoint,
        url            : target.url,
        supported      : target.supported,
        model          : target.model,
        embeddingModel : target.embeddingModel,
        attempts       : waitResult?.attempts ?? null,
        elapsedMs      : waitResult?.elapsedMs ?? null,
        timeoutMs      : waitResult?.timeoutMs ?? null,
        lifecycleStatus,
        nextAction     : target.supported
            ? (
                target.provider === 'openAiCompatible'
                    ? 'Start the configured OpenAI-compatible / MLX provider, then rerun npm run ai:run-sandman.'
                    : `Start the configured ${target.provider} provider, then rerun npm run ai:run-sandman.`
            )
            : "Set NEO_GRAPH_PROVIDER to 'openAiCompatible' or 'ollama', then rerun npm run ai:run-sandman."
    };
}

/**
 * @summary Records a graph-provider readiness failure through terminal output and durable logging.
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
        : `\n❌ ${diagnostic.provider} provider is not running on ${diagnostic.host}${diagnostic.endpoint || ''}. Please start the configured provider manually.`;

    stderr(message);
    log.error(
        diagnostic.reason === 'UNSUPPORTED_GRAPH_PROVIDER'
            ? '[runSandman] unsupported graph provider'
            : `[runSandman] ${diagnostic.provider} provider readiness timeout`,
        diagnostic
    );

    if (typeof log.flush === 'function') {
        await log.flush();
    }

    return {message, diagnostic};
}
