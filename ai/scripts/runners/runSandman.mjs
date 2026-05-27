import Neo from '../../../src/Neo.mjs';
import * as core from '../../../src/core/_export.mjs';
import InstanceManager from '../../../src/manager/Instance.mjs';
import Memory_Config from '../../mcp/server/memory-core/config.mjs';
import Memory_Service from '../../services/memory-core/MemoryService.mjs';
import DreamService from '../../daemons/orchestrator/services/DreamService.mjs';
import GoldenPathSynthesizer from '../../services/graph/GoldenPathSynthesizer.mjs';
import LifecycleService from '../../services/memory-core/lifecycle/SystemLifecycleService.mjs';
import InferenceLifecycleService from '../../services/memory-core/lifecycle/InferenceLifecycleService.mjs';
import GraphService from '../../services/memory-core/GraphService.mjs';
import {withHeavyMaintenanceLease} from '../../daemons/orchestrator/services/HeavyMaintenanceLeaseService.mjs';
import {
    createProviderFailureDiagnostic,
    getGraphProviderReadinessTarget,
    recordProviderReadinessFailure,
    waitForProvider
} from '../../services/graph/providerReadiness.mjs';
import {pathToFileURL} from 'url';

/**
 * @module ai/scripts/runners/runSandman
 */

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
