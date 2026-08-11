/**
 * @plane in-plane
 */
import Neo           from '../../../src/Neo.mjs';
import AiConfig      from '../../config.mjs';
import * as core     from '../../../src/core/_export.mjs';
import Memory_Config from '../../mcp/server/memory-core/config.mjs';
import DreamService  from '../../daemons/orchestrator/services/DreamService.mjs';
import {
    assertProviderReadinessConfig,
    checkProvider,
    createProviderFailureDiagnostic,
    getGraphProviderReadinessTarget,
    getOpenAiCompatibleHost,
    recordProviderReadinessFailure,
    waitForProvider
} from '../../services/graph/providerReadinessHelper.mjs';
import LifecycleService from '../../services/memory-core/lifecycle/SystemLifecycleService.mjs';
import {
    resolveHeavyMaintenanceLeasePath,
    withHeavyMaintenanceLease
} from '../../daemons/orchestrator/services/HeavyMaintenanceLeaseService.mjs';
import {pathToFileURL} from 'url';

/**
 * @module ai/scripts/runners/runSandman
 */

export {
    assertProviderReadinessConfig,
    checkProvider,
    createProviderFailureDiagnostic,
    getGraphProviderReadinessTarget,
    getOpenAiCompatibleHost,
    recordProviderReadinessFailure,
    waitForProvider
};

/**
 * @summary Emits CLI-facing REM cycle outcome text and maps the typed outcome to a process code.
 * @param {Object} outcome Result envelope returned by `DreamService.executeRemCycle()`.
 * @param {Object} options
 * @param {Object} [options.output=console] Terminal sink.
 * @returns {Promise<Number>} Process exit code.
 */
export async function recordRemCycleOutcome(outcome, {output = console} = {}) {
    const writeError = (...args) => typeof output.error === 'function'
        ? output.error(...args)
        : console.error(...args);

    if (!outcome) {
        writeError('❌ REM cycle did not return an outcome envelope.');
        return 1;
    }

    if (outcome.status === 'failed') {
        if (outcome.diagnostic) {
            await recordProviderReadinessFailure(outcome.diagnostic, {
                stderr: message => writeError(message)
            });
        } else {
            writeError('❌ REM cycle failed:', outcome.error?.message || outcome.error || outcome);
        }
        return 1;
    }

    if (outcome.status === 'skipped') {
        output.log(`⏭️  Sandman skipped: ${outcome.skipReason || 'no work performed'}.`);
        return 0;
    }

    output.log(`✅ Sandman cycle complete (${outcome.sessionsProcessed ?? 0} session(s) processed).`);
    return 0;
}

/**
 * @summary Thin CLI wrapper for the canonical DreamService REM cycle.
 *
 * `DreamService.executeRemCycle()` owns the REM contract: provider readiness,
 * zero-session semantics, failure envelopes, and graph decay. The CLI's only
 * responsibility is to initialize services, acquire the cross-process heavy
 * maintenance lease, call the canonical method inside that lease window, and
 * translate the typed result into terminal output plus an exit code.
 *
 * @param {Object} options
 * @param {Object} [options.dreamService=DreamService] Injectable DreamService facade for tests.
 * @param {Object} [options.lifecycleService=LifecycleService] Injectable lifecycle facade for tests.
 * @param {Function} [options.withLease=withHeavyMaintenanceLease] Injectable lease wrapper for tests.
 * @param {Object} [options.output=console] Terminal sink.
 * @param {Function} [options.exit=process.exit] Exit hook.
 * @returns {Promise<*>}
 */
export async function runSandman({
    dreamService     = DreamService,
    lifecycleService = LifecycleService,
    withLease        = withHeavyMaintenanceLease,
    output           = console,
    exit             = code => process.exit(code)
} = {}) {
    // Keep manual Sandman runs verbose (lease + REM progress). B4-safe activation: drive NEO_DEBUG
    // via the Provider override API, never mutate the read-only reactive Provider.
    Memory_Config.setEnvOverride('NEO_DEBUG', true);

    output.log('⏳ Initializing Sandman REM Extraction Pipeline...');

    // Run the REM cycle under the shared heavy-maintenance lease so this CLI cannot
    // collide with the orchestrator's `dream` task or with other manual graph-heavy
    // scripts. If another owner holds the lease, defer without running the cycle.
    let outcome;
    try {
        outcome = await withLease(async () => {
            output.log('   Waiting for Lifecycle Service to auto-boot orchestrators...');
            await lifecycleService.ready();
            output.log('   Lifecycle Service Ready. Database should be running.');

            output.log('   Waiting for DreamService Initialization...');
            await dreamService.ready();
            output.log('   DreamService Ready.');

            output.log('✅ Services Ready. Entering REM Sleep...');

            return dreamService.executeRemCycle({
                reason      : 'manual-cli',
                mode        : 'cli',
                includeDecay: true
            });
        }, {
            leasePath   : resolveHeavyMaintenanceLeasePath({dataDir: AiConfig.orchestrator.dataDir}),
            owner       : 'sandman',
            reason      : 'manual-cli',
            staleAfterMs: AiConfig.orchestrator.heavyMaintenanceLease.staleAfterMs,
            metadata    : {script: 'ai/scripts/runners/runSandman.mjs'}
        });
    } catch (e) {
        // If lease acquisition fails, fail closed rather than mutating Memory Core graph state
        // without concurrency protection.
        output.error('❌ REM cycle lease acquisition failed:', e);
        return exit(1);
    }

    if (outcome?.status === 'held') {
        const held = outcome.lease;
        output.log(`⏸️  Deferred: heavy-maintenance lease held by '${held.owner}' (reason='${held.reason}', pid=${held.pid}, acquiredAt=${held.acquiredAt}).`);
        output.log('   This script will not run while another heavy-maintenance task is active. Re-invoke once the active owner completes.');
        return exit(0);
    }

    const exitCode = await recordRemCycleOutcome(outcome?.result, {output});
    return exit(exitCode);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    runSandman();
}
