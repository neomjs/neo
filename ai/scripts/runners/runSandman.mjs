import Neo from '../../../src/Neo.mjs';
import * as core from '../../../src/core/_export.mjs';
import InstanceManager from '../../../src/manager/Instance.mjs';
import AiConfig from '../../config.mjs';
import Memory_Config from '../../mcp/server/memory-core/config.mjs';
import Memory_Service from '../../services/memory-core/MemoryService.mjs';
import DreamService from '../../daemons/orchestrator/services/DreamService.mjs';
import GoldenPathSynthesizer from '../../services/graph/GoldenPathSynthesizer.mjs';
import LifecycleService from '../../services/memory-core/lifecycle/SystemLifecycleService.mjs';
import InferenceLifecycleService from '../../services/memory-core/lifecycle/InferenceLifecycleService.mjs';
import GraphService from '../../services/memory-core/GraphService.mjs';
import {withHeavyMaintenanceLease} from '../../daemons/orchestrator/services/HeavyMaintenanceLeaseService.mjs';
import {isGraphModelProviderSupported, resolveGraphModelProvider} from '../../services/graph/providerDispatch.mjs';
import logger from '../../mcp/server/memory-core/logger.mjs';
import http from 'http';
import {pathToFileURL} from 'url';

/**
 * @module ai/scripts/runners/runSandman
 */

/**
 * @summary Resolves the OpenAI-compatible host used by one Sandman graph-provider option.
 * @param {Object} config
 * @returns {String|undefined}
 */
export function getOpenAiCompatibleHost(config = Memory_Config.data) {
    return config.openAiCompatible?.host;
}

/**
 * @summary Builds the provider readiness target for the resolved Sandman graph provider.
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
 * @summary Probes the configured graph provider used by the Sandman REM pipeline.
 * @param {Object} options
 * @param {Object} options.config Provider-source config (aiConfig-shaped).
 * @param {Number} options.timeoutMs HTTP probe abandon threshold. Required; no module-level default.
 * @returns {Promise<Boolean>}
 */
export function checkProvider({config, timeoutMs} = {}) {
    if (typeof timeoutMs !== 'number') {
        throw new TypeError('checkProvider: timeoutMs is required (pass from config.orchestrator.providerReadiness.timeoutMs)');
    }
    const target = getGraphProviderReadinessTarget(config ?? Memory_Config.data);

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

        req.setTimeout(timeoutMs, () => {
            req.destroy();
            settle(false);
        });
        req.on('error', () => settle(false));
    });
}

/**
 * @summary Waits for the local provider readiness loop while exposing deterministic test seams.
 *
 * Probe parameters are required arguments — there are no module-level defaults. Callers
 * read `aiConfig.orchestrator.providerReadiness` and pass the values explicitly; this
 * keeps configuration as the single source of truth.
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
 * @summary Builds the durable Sandman provider-timeout breadcrumb for the Memory Core log.
 *
 * Field values flow from `config` and `waitResult` verbatim. Missing inputs surface as
 * `undefined` on the returned envelope (fail-loud); consumers MUST tolerate undefined
 * rather than relying on substitution.
 *
 * @param {Object} options
 * @param {Object} options.config Provider-source config (aiConfig-shaped).
 * @param {Object} [options.waitResult] Result envelope from `waitForProvider`; omit when emitting on the unsupported-provider path.
 * @param {Object} [options.lifecycleStatus] Consumer-sourced lifecycle snapshot; surfaces verbatim on the envelope.
 * @param {String} [options.reason] One of `'PROVIDER_READINESS_TIMEOUT'`, `'UNSUPPORTED_GRAPH_PROVIDER'`.
 * @returns {Object}
 */
export function createProviderFailureDiagnostic({
    config = Memory_Config.data,
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
 * @summary Records the Sandman provider-timeout failure through terminal output and durable MC logging.
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

export async function runSandman() {
    // Enable debug logging to see progress
    Memory_Config.data.debug = true;

    // STRICTLY bypass daemon startup auto-queue.
    // If autoDream fires synchronously inside init(), the await processUndigestedSessions() skips.
    Memory_Config.data.autoDream = false;
    Memory_Config.data.autoSummarize = false;
    Memory_Config.data.autoGoldenPath = false;

    console.log('⏳ Initializing Sandman REM Extraction Pipeline...');

    // Run the REM cycle under the shared heavy-maintenance lease so this CLI cannot
    // collide with the orchestrator's `dream` task or with other manual graph-heavy
    // scripts. If another owner holds the lease, defer without running decay because
    // no graph mutation occurred in this process.
    let outcome;
    try {
        outcome = await withHeavyMaintenanceLease(async () => {
            // Preserve graceful failure for provider-readiness and DreamService errors while
            // keeping graph-decay inside the lease window. `withHeavyMaintenanceLease`
            // releases after the task settles, so the inner finally is the last safe place for
            // graph mutation that must stay covered by the lease.
            try {
                console.log('   Waiting for Lifecycle Service to auto-boot orchestrators...');
                await LifecycleService.ready();
                console.log('   Lifecycle Service Ready. Database should be running.');

                console.log('   Waiting for graph provider to warm up load weights into VRAM...');
                const target = getGraphProviderReadinessTarget();

                if (!target.supported) {
                    const diagnostic = createProviderFailureDiagnostic({
                        reason         : 'UNSUPPORTED_GRAPH_PROVIDER',
                        lifecycleStatus: InferenceLifecycleService.getStatus()
                    });

                    await recordProviderReadinessFailure(diagnostic);
                    process.exitCode = 1;
                    return {providerReady: false, graphProvider: target.provider};
                }

                const readinessConfig = AiConfig.orchestrator.providerReadiness;
                const waitResult = await waitForProvider({
                    attempts : readinessConfig.attempts,
                    delayMs  : readinessConfig.delayMs,
                    timeoutMs: readinessConfig.timeoutMs
                });

                if (!waitResult.running) {
                    const diagnostic = createProviderFailureDiagnostic({
                        waitResult,
                        lifecycleStatus: InferenceLifecycleService.getStatus()
                    });

                    await recordProviderReadinessFailure(diagnostic);
                    process.exitCode = 1;
                    return {providerReady: false};
                }

                console.log(`\n   ✅ ${target.provider} server is running (auto-boot successful).`);

                console.log('   Waiting for DreamService Initialization...');
                // We might need to ensure DreamService is fully inited, though it initAsync runs automatically upon Neo.setupClass
                await DreamService.ready();
                console.log('   DreamService Ready.');

                console.log('✅ Services Ready. Entering REM Sleep...');

                await runRemPipeline();
                process.exitCode = 0;
                return {providerReady: true};
            } catch (e) {
                console.error('❌ REM cycle failed:', e);
                process.exitCode = 1;
                return {providerReady: false, error: e.message};
            } finally {
                // Inside-the-lease decay (see header comment). Wrapping in try/catch preserves
                // prior graceful-fail semantics: a decay failure must not throw out of the
                // lease-wrapped task, since that would mask the inner return value AND propagate
                // to the outer catch — which is reserved for lease-acquisition failures (fail-closed).
                console.log('🧹 Triggering global topology decay & pruning mechanism...');
                try {
                    // decayGlobalTopology is synchronous; no await needed.
                    GraphService.decayGlobalTopology();
                } catch (e) {
                    console.error('❌ Failed to decay topology:', e);
                }
            }
        }, {owner: 'sandman', reason: 'manual-cli', metadata: {script: 'ai/scripts/runners/runSandman.mjs'}});
    } catch (e) {
        // If lease acquisition fails, fail closed rather than mutating Memory Core graph state
        // without concurrency protection.
        console.error('❌ REM cycle lease acquisition failed:', e);
        process.exit(1);
    }

    if (outcome?.status === 'held') {
        const held = outcome.lease;
        console.log(`⏸️  Deferred: heavy-maintenance lease held by '${held.owner}' (reason='${held.reason}', pid=${held.pid}, acquiredAt=${held.acquiredAt}).`);
        console.log('   This script will not run while another heavy-maintenance task is active. Re-invoke once the active owner completes.');
        // Skip the decay step on held — no graph mutation occurred + we don't hold the lease.
        process.exit(0);
    }

    // Reached here only when outcome.status === 'completed' — lease was acquired AND the
    // inner work + inner-finally decay both ran INSIDE the lease window (see inner finally
    // above for the release-timing invariant). Nothing further to do here besides honoring
    // the inner exitCode contract.
    process.exit(process.exitCode);
}

/**
 * Runs the Sandman REM cycle body after provider and service readiness gates pass.
 * Exposed for unit coverage so fatal DreamService failures cannot regress into
 * a misleading success log or successful process exit.
 * @param {Object} options
 * @param {Object} [options.dreamService=DreamService]
 * @param {Object} [options.goldenPathSynthesizer=GoldenPathSynthesizer]
 * @param {Object} [options.output=console]
 * @returns {Promise<void>}
 */
export async function runRemPipeline({
    dreamService          = DreamService,
    goldenPathSynthesizer = GoldenPathSynthesizer,
    output                = console
} = {}) {
    await dreamService.processUndigestedSessions();
    await goldenPathSynthesizer.synthesizeGoldenPath();

    output.log('✅ Sandman cycle complete.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    runSandman();
}
