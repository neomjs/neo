/**
 * @module ai/scripts/maintenance/projectCoreCorpus
 * @summary Thin one-shot child for the container-owned core-corpus projection lane.
 *
 * The Orchestrator owns cadence, authority, and the shared heavy-maintenance lease. This entrypoint
 * initializes the graph once, runs one exact-revision projection cycle, prints one structured stdout
 * outcome for the supervisor, and exits. It carries no poller and cannot become a second scheduler.
 */

import {fileURLToPath, pathToFileURL} from 'node:url';
import Neo                            from '../../../src/Neo.mjs';
import * as core                      from '../../../src/core/_export.mjs';
import InstanceManager                from '../../../src/manager/Instance.mjs';
import AiConfig                       from '../../config.mjs';
import {
    runCoreCorpusProjectionCycle
} from '../../daemons/orchestrator/services/coreCorpusProjection.mjs';
import {
    resolveHeavyMaintenanceLeasePath,
    withHeavyMaintenanceLease
} from '../../daemons/orchestrator/services/HeavyMaintenanceLeaseService.mjs';
import logger                                from '../../mcp/server/memory-core/logger.mjs';
import {Memory_GraphService as GraphService} from '../../services.mjs';
import {assertConfigFresh}                   from '../setup/initServerConfigs.mjs';

/**
 * @summary Maps lease acquisition/completion into the supervisor's single structured outcome.
 * @param {Object} outcome Shared lease wrapper result.
 * @returns {Object}
 */
export function classifyCoreCorpusProjectionOutcome(outcome) {
    if (outcome?.status === 'held') {
        const held = outcome.lease || {};

        return {
            deferred: true,
            reason  : 'heavy-maintenance-lease-held',
            holder  : {
                owner     : held.owner,
                reason    : held.reason,
                pid       : held.pid,
                acquiredAt: held.acquiredAt
            },
            ...(outcome.previousStatus && {previousStatus: outcome.previousStatus})
        }
    }

    if (!['completed', 'inherited'].includes(outcome?.status)) {
        return {
            deferred   : true,
            reason     : 'heavy-maintenance-lease-unavailable',
            leaseStatus: outcome?.status || 'missing-outcome',
            ...(outcome?.previousStatus && {previousStatus: outcome.previousStatus})
        }
    }

    return {
        deferred: false,
        ...(outcome?.result || {}),
        ...(outcome?.previousStatus && {previousStatus: outcome.previousStatus})
    }
}

/**
 * @summary Runs one source-neutral projection cycle inside the shared heavy-maintenance lease and
 * emits its structured supervisor outcome.
 * @param {Object} [options] Test seams.
 * @param {Object} [options.configProvider=AiConfig]
 * @param {Object} [options.config=options.configProvider.orchestrator.corpusProjection]
 * @param {Object} [options.graphService=GraphService]
 * @param {Function} [options.runCycle=runCoreCorpusProjectionCycle]
 * @param {Function} [options.withLease=withHeavyMaintenanceLease]
 * @param {Function} [options.assertFresh=assertConfigFresh]
 * @param {Object} [options.output=console]
 * @param {Function} [options.exit=process.exit]
 * @returns {Promise<*>}
 */
export async function runProjectCoreCorpus({
    configProvider = AiConfig,
    config = configProvider.orchestrator.corpusProjection,
    graphService = GraphService,
    runCycle = runCoreCorpusProjectionCycle,
    withLease = withHeavyMaintenanceLease,
    assertFresh = assertConfigFresh,
    output = console,
    exit = code => process.exit(code)
} = {}) {
    if (!config.enabled) {
        output.log(JSON.stringify({deferred: true, reason: 'core-corpus-projection-disabled'}));
        return exit(0)
    }

    const {findings} = configProvider.validateRequiredEnv({entrypoint: 'core-corpus-projection'});

    await assertFresh({
        requiredFindings: findings,
        serverPath      : fileURLToPath(new URL('../../mcp/server/memory-core/', import.meta.url))
    });

    const outcome = await withLease(async () => {
        await graphService.ready();

        return runCycle({config})
    }, {
        leasePath   : resolveHeavyMaintenanceLeasePath({dataDir: configProvider.orchestrator.dataDir}),
        owner       : 'core-corpus-projection',
        reason      : 'projection-cycle',
        staleAfterMs: configProvider.orchestrator.heavyMaintenanceLease.staleAfterMs,
        metadata    : {script: 'ai/scripts/maintenance/projectCoreCorpus.mjs'}
    });
    output.log(JSON.stringify(classifyCoreCorpusProjectionOutcome(outcome)));

    return exit(0)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    runProjectCoreCorpus().catch(error => {
        logger.error('[core-corpus-projection] Projection cycle failed:', error);
        process.exit(1)
    })
}
