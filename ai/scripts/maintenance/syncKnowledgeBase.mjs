// Neo namespace bootstrap (entry-point invariant) — orchestrator spawn-child.
// `InstanceManager` binds Neo.find/findFirst/get aliases + consumes pre-singleton
// `Neo.idMap`; required for any consumer of the Neo singleton API.
import Neo                         from '../../../src/Neo.mjs';
import AiConfig                    from '../../config.mjs';
import * as core                   from '../../../src/core/_export.mjs';
import InstanceManager             from '../../../src/manager/Instance.mjs';
import KB_Config                   from '../../mcp/server/knowledge-base/config.mjs';
import KB_DatabaseService          from '../../services/knowledge-base/DatabaseService.mjs';
import KB_ChromaManager            from '../../services/knowledge-base/ChromaManager.mjs';
import KB_LifecycleService         from '../../services/knowledge-base/DatabaseLifecycleService.mjs';
import {withHeavyMaintenanceLease, shouldYieldHeavyMaintenanceLease} from '../../daemons/orchestrator/services/HeavyMaintenanceLeaseService.mjs';

/**
 * @module ai/scripts/maintenance/syncKnowledgeBase
 *
 * Progress/diagnostic logs go to STDERR; STDOUT carries exactly one structured outcome JSON
 * the orchestrator's `ProcessSupervisorService` captures (`captureStdoutJson`). A lease-held
 * deferral therefore records `skipped` (not a false-green `completed` that refreshes
 * `lastSuccessAt`) — the kb-sync half of the deferred-as-completed fix.
 */

/**
 * Logs supervised-child progress to STDERR (STDOUT carries the single structured outcome JSON),
 * prefixed `[INFO]` so the orchestrator's `ProcessSupervisorService` classifies it as INFO. Its
 * `getChildLogLevel` defaults UNPREFIXED child stderr to ERROR, which otherwise mis-stamps routine
 * progress as errors and camouflages real failures. Genuine failures stay on raw `console.error`
 * (unprefixed → ERROR).
 * @param {...*} args
 */
const logProgress = (...args) => console.error('[INFO]', ...args);

async function syncKnowledgeBase() {
    // Enable debug logging to see progress. B4-safe activation: drive NEO_DEBUG via the Provider
    // override API, never mutate the read-only reactive Provider.
    KB_Config.setEnvOverride('NEO_DEBUG', true);
    const staleStrategy = process.env.NEO_KB_STALE_STRATEGY || undefined;

    logProgress('⏳ Initializing Knowledge Base Services...');
    if (staleStrategy) {
        logProgress(`   Using explicit stale strategy: ${staleStrategy}`);
    }

    // Run the full sync under the shared heavy-maintenance lease so this CLI cannot
    // collide with the orchestrator's own kbSync task or with other manual graph-heavy
    // scripts.
    let outcome;
    try {
        outcome = await withHeavyMaintenanceLease(
            async (acquisition) => {
                logProgress('   Waiting for Lifecycle Service...');
                await KB_LifecycleService.ready();
                logProgress('   Lifecycle Service Ready. Database should be running.');

                logProgress('   Waiting for Chroma Manager...');
                await KB_ChromaManager.ready();
                logProgress('   Chroma Manager Ready.');

                logProgress('   Waiting for Database Service...');
                await KB_DatabaseService.ready();
                logProgress('   Database Service Ready.');

                logProgress('✅ Services Ready. Starting Synchronization...');

                // Execute the full sync (create + embed). `NEO_KB_STALE_STRATEGY=shadow-swap`
                // opts into the shadow-swap stale-data strategy; default CLI sync remains unchanged.
                // Cooperative lease-yield: a long re-embed releases the heavy-maintenance lease at a
                // batch boundary once the active hold exceeds the fairness bound, so a starved heavy task
                // (githubWorkflowSync) interleaves; the next sweep re-acquires and resumes the preserved shadow.
                // The task arg is the acquisition descriptor `{status, acquired, lease}` — pass `acquisition.lease`
                // (the payload carrying `acquiredAt`), NOT the wrapper. It is present for BOTH a fresh acquire
                // AND an inherited-active parent lease (the orchestrator spawns kbSync with
                // NEO_HEAVY_MAINTENANCE_LEASE_INHERITED_TOKEN), so the fairness bound holds on either path.
                return KB_DatabaseService.syncDatabase({
                    staleStrategy,
                    shouldYield: () => shouldYieldHeavyMaintenanceLease(acquisition.lease, {
                        maxActiveHoldMs: AiConfig.orchestrator.heavyMaintenanceLease.maxActiveHoldMs
                    })
                });
            },
            {owner: 'kbSync', reason: 'manual-cli', staleAfterMs: AiConfig.orchestrator.heavyMaintenanceLease.staleAfterMs, metadata: {script: 'ai/scripts/maintenance/syncKnowledgeBase.mjs'}}
        );
    } catch (e) {
        console.error('❌ Synchronization Failed:', e);
        process.exit(1);
    }

    if (outcome.status === 'held') {
        const held = outcome.lease;
        logProgress(`⏸️  Deferred: heavy-maintenance lease held by '${held.owner}' (reason='${held.reason}', pid=${held.pid}, acquiredAt=${held.acquiredAt}).`);
        logProgress('   This script will not run while another heavy-maintenance task is active. Re-invoke once the active owner completes.');
        // Structured outcome → ProcessSupervisorService records `skipped` (not false-green
        // `completed`), so a lease-held run does not refresh kbSync's lastSuccessAt.
        console.log(JSON.stringify({
            deferred: true,
            reason  : 'heavy-maintenance-lease-held',
            holder  : {owner: held.owner, reason: held.reason, pid: held.pid, acquiredAt: held.acquiredAt}
        }));
        process.exit(0);
    }

    logProgress(`✅ Synchronization Complete: ${JSON.stringify(outcome.result)}`);
    // Real run → `completed` (falls through the classify) + the embed/delete counts as details.
    console.log(JSON.stringify({deferred: false, ...(outcome.result || {})}));
    process.exit(0);
}

syncKnowledgeBase();
