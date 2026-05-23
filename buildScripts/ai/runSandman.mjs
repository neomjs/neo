import Neo from '../../src/Neo.mjs';
import * as core from '../../src/core/_export.mjs';
import InstanceManager from '../../src/manager/Instance.mjs';
import Memory_Config from '../../ai/mcp/server/memory-core/config.mjs';
import Memory_Service from '../../ai/services/memory-core/MemoryService.mjs';
import DreamService from '../../ai/daemons/orchestrator/services/DreamService.mjs';
import GoldenPathSynthesizer from '../../ai/services/graph/GoldenPathSynthesizer.mjs';
import LifecycleService from '../../ai/services/memory-core/lifecycle/SystemLifecycleService.mjs';
import InferenceLifecycleService from '../../ai/services/memory-core/lifecycle/InferenceLifecycleService.mjs';
import GraphService from '../../ai/services/memory-core/GraphService.mjs';
import {withHeavyMaintenanceLease} from '../../ai/daemons/orchestrator/services/HeavyMaintenanceLeaseService.mjs';
import logger from '../../ai/mcp/server/memory-core/logger.mjs';
import http from 'http';
import {pathToFileURL} from 'url';

/**
 * @module buildScripts/ai/runSandman
 */

const DEFAULT_OPENAI_COMPATIBLE_HOST = 'http://127.0.0.1:8000';
const PROVIDER_READY_ATTEMPTS        = 30;
const PROVIDER_READY_RETRY_MS        = 1000;

/**
 * @summary Resolves the OpenAI-compatible host that the Sandman REM pipeline must reach.
 * @param {Object} config
 * @returns {String}
 */
export function getOpenAiCompatibleHost(config = Memory_Config.data) {
    return config.openAiCompatible?.host || DEFAULT_OPENAI_COMPATIBLE_HOST;
}

/**
 * @summary Probes the configured OpenAI-compatible provider used by the Sandman REM pipeline.
 * @param {Object} config
 * @returns {Promise<Boolean>}
 */
export function checkProvider(config = Memory_Config.data) {
    const host = getOpenAiCompatibleHost(config);

    return new Promise(resolve => {
        let settled = false;
        const settle = value => {
            if (!settled) {
                settled = true;
                resolve(value);
            }
        };

        const req = http.get(`${host}/v1/models`, response => {
            response.resume();
            settle(true);
        });

        req.setTimeout(3000, () => {
            req.destroy();
            settle(false);
        });
        req.on('error', () => settle(false));
    });
}

/**
 * @summary Waits for the local provider readiness loop while exposing deterministic test seams.
 * @param {Object} options
 * @param {Function} options.checkProvider
 * @param {Number} options.attempts
 * @param {Number} options.delayMs
 * @param {Object} options.output
 * @returns {Promise<Object>}
 */
export async function waitForProvider({
    checkProvider: providerCheck = () => checkProvider(),
    attempts = PROVIDER_READY_ATTEMPTS,
    delayMs  = PROVIDER_READY_RETRY_MS,
    output   = process.stdout
} = {}) {
    const startedAt = Date.now();

    for (let i = 0; i < attempts; i++) {
        if (await providerCheck()) {
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
 * @param {Object} options
 * @param {Object} options.config
 * @param {Object} options.waitResult
 * @param {Object|null} options.lifecycleStatus
 * @returns {Object}
 */
export function createProviderFailureDiagnostic({
    config = Memory_Config.data,
    waitResult,
    lifecycleStatus = null
} = {}) {
    return {
        event          : 'runSandman.provider_readiness_timeout',
        reason         : 'PROVIDER_READINESS_TIMEOUT',
        provider       : 'openAiCompatible',
        modelProvider  : config.modelProvider || null,
        host           : getOpenAiCompatibleHost(config),
        model          : config.openAiCompatible?.model || null,
        embeddingModel : config.openAiCompatible?.embeddingModel || null,
        attempts       : waitResult?.attempts ?? null,
        elapsedMs      : waitResult?.elapsedMs ?? null,
        timeoutMs      : waitResult?.timeoutMs ?? null,
        lifecycleStatus,
        nextAction     : 'Start the configured OpenAI-compatible / MLX provider, then rerun npm run ai:run-sandman.'
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
    const message = `\n❌ openAiCompatible server is not running on ${diagnostic.host}. Please start your MLX provider manually.`;

    stderr(message);
    log.error('[runSandman] openAiCompatible provider readiness timeout', diagnostic);

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

    // Lane C of #11503 — wrap the REM cycle in the shared heavy-maintenance lease so this
    // CLI cannot collide with the orchestrator's `dream` task or with other manual heavy
    // scripts. The substrate-heavy work (DreamService + GoldenPathSynthesizer LLM passes
    // + Memory Core graph writes) is the contention surface the lease primitive (PR #11506 /
    // #11505) guards. On held-status, the script defers cleanly without running the decay
    // step (since no graph mutation occurred).
    let outcome;
    try {
        outcome = await withHeavyMaintenanceLease(async () => {
            // Inner try/catch/finally preserves the script's prior graceful-fail semantics for
            // provider-readiness + DreamService failures (return-without-throw at the
            // provider-fail branch; throw-and-catch for everything else) AND guarantees the
            // graph-mutating decay runs INSIDE the lease window.
            //
            // Per GPT review PR #11509 cycle 2 (PRR_kwDODSospM8AAAABAJKF8w): `withHeavyMaintenanceLease`
            // releases the lease in its own `finally` BEFORE returning, so any decay call placed
            // after the await would mutate Memory Core graph state outside the lease — defeating
            // the substrate protection this PR is shipping. Placing decay in THIS inner finally
            // pins it inside the lease window: JS guarantees the inner finally completes before
            // the awaited task settles, so the wrapper's release runs strictly after decay.
            try {
                console.log('   Waiting for Lifecycle Service to auto-boot orchestrators...');
                await LifecycleService.ready();
                console.log('   Lifecycle Service Ready. Database should be running.');

                console.log('   Waiting for MLX provider to warm up load weights into VRAM...');
                const waitResult = await waitForProvider();

                if (!waitResult.running) {
                    const diagnostic = createProviderFailureDiagnostic({
                        waitResult,
                        lifecycleStatus: InferenceLifecycleService.getStatus()
                    });

                    await recordProviderReadinessFailure(diagnostic);
                    process.exitCode = 1;
                    return {providerReady: false};
                }

                console.log('\n   ✅ openAiCompatible server is running (auto-boot successful).');

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
        }, {owner: 'sandman', reason: 'manual-cli', metadata: {script: 'buildScripts/ai/runSandman.mjs'}});
    } catch (e) {
        // withHeavyMaintenanceLease itself failed (e.g., lease-write IO error). The whole
        // point of the lease is to prevent concurrent graph mutation; if acquisition
        // failed we MUST NOT proceed to graph-mutating decay. Fail-closed per GPT review
        // PR #11509 cycle 1 (PRR_kwDODSospM8AAAABAJIdTg): GraphService.decayGlobalTopology
        // touches SQLite graph edges + _SYSTEM_STATE; running it outside the lease defeats
        // the substrate protection this PR is shipping.
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
