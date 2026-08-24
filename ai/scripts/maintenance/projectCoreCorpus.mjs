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
import logger                                from '../../mcp/server/memory-core/logger.mjs';
import {Memory_GraphService as GraphService} from '../../services.mjs';
import {assertConfigFresh}                   from '../setup/initServerConfigs.mjs';

/**
 * @summary Runs one source-neutral projection cycle and emits its structured supervisor outcome.
 * @returns {Promise<void>}
 */
async function main() {
    if (!AiConfig.orchestrator.corpusProjection.enabled) {
        console.log(JSON.stringify({deferred: true, reason: 'core-corpus-projection-disabled'}));
        process.exit(0)
    }

    const {findings} = AiConfig.validateRequiredEnv({entrypoint: 'core-corpus-projection'});

    await assertConfigFresh({
        requiredFindings: findings,
        serverPath      : fileURLToPath(new URL('../../mcp/server/memory-core/', import.meta.url))
    });
    await GraphService.ready();

    const outcome = await runCoreCorpusProjectionCycle({
        config: AiConfig.orchestrator.corpusProjection
    });
    console.log(JSON.stringify({deferred: false, ...outcome}));
    process.exit(0)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main().catch(error => {
        logger.error('[core-corpus-projection] Projection cycle failed:', error);
        process.exit(1)
    })
}
