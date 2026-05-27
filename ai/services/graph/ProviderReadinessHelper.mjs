import http from 'http';
import {Memory_Config as aiConfig} from '../../services.mjs';
import logger from '../../mcp/server/memory-core/logger.mjs';
import {isGraphModelProviderSupported, resolveGraphModelProvider} from './providerDispatch.mjs';

/**
 * @module ai/services/graph/ProviderReadinessHelper
 */

/**
 * @summary Resolves the OpenAI-compatible host used by one REM graph-provider option.
 * @param {Object} config
 * @returns {String|undefined}
 */
export function getOpenAiCompatibleHost(config = aiConfig.data) {
    return config.openAiCompatible?.host;
}

/**
 * @summary Builds the provider readiness target for the resolved REM graph provider.
 * @param {Object} config
 * @returns {Object}
 */
export function getGraphProviderReadinessTarget(config = aiConfig.data) {
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
    const endpoint = isOllama ? '/api/tags' : '/v1/models';
    const model    = isOllama ? config.ollama?.model : config.openAiCompatible?.model;
    const embeddingModel = isOllama
        ? config.ollama?.embeddingModel
        : config.openAiCompatible?.embeddingModel;
    const url      = host ? `${host.replace(/\/+$/, '')}${endpoint}` : null;

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

    const probe = providerCheck ?? (() => checkProvider({timeoutMs}));
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
 * @param {String} [options.reason] One of `'PROVIDER_READINESS_TIMEOUT'`, `'UNSUPPORTED_GRAPH_PROVIDER'`.
 * @returns {Object}
 */
export function createProviderFailureDiagnostic({
    config = aiConfig.data,
    waitResult,
    lifecycleStatus,
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
        modelProvider  : config.modelProvider,
        host           : target.host,
        endpoint       : target.endpoint,
        url            : target.url,
        supported      : target.supported,
        model          : target.model,
        embeddingModel : target.embeddingModel,
        attempts       : waitResult?.attempts,
        elapsedMs      : waitResult?.elapsedMs,
        timeoutMs      : waitResult?.timeoutMs,
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
