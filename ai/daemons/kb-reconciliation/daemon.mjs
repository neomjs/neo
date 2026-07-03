/**
 * @module ai/daemons/kb-reconciliation/daemon
 * @summary Thin Node-process boot wrapper for the KB reconciliation daemon.
 *
 * Owns Neo namespace bootstrap + SIGTERM / SIGINT clean-stop signal handling +
 * `KbReconciliationService.start()` invocation. The class definition (poll loop, tenant
 * enumeration, config-version diff, telemetry, opt-in tombstone) lives in
 * `ai/daemons/kb-reconciliation/KbReconciliationService.mjs`.
 *
 * This split matches the canonical Orchestrator class+wrapper pattern: class files in
 * `ai/daemons/` never import Neo; entry-point scripts in `ai/scripts/` own the Neo +
 * core/_export + InstanceManager bootstrap chain.
 *
 * Persistent-process invocation: launchd / systemd should target this script
 * (`node ai/daemons/kb-reconciliation/daemon.mjs`), or `npm run ai:kb-reconciliation`. The
 * daemon is opt-in — it exits early unless `aiConfig.knowledgeBase.reconciliationEnabled` is
 * true; the destructive auto-tombstone is a second opt-in (`reconciliationAutoTombstone`).
 *
 * @see ai/daemons/kb-reconciliation/KbReconciliationService.mjs
 * @see ai/daemons/kb-alerting/daemon.mjs (sibling wrapper precedent)
 */

// Neo namespace bootstrap (entry-point invariant): `Neo` + `core/_export` populate
// `globalThis.Neo` so any module using `Neo.gatekeep()` / `Neo.setupClass()` at
// module-load succeeds. `InstanceManager` binds `Neo.find` / `Neo.get` aliases.
import Neo             from '../../../src/Neo.mjs';
import * as core       from '../../../src/core/_export.mjs';
import InstanceManager from '../../../src/manager/Instance.mjs';

import logger                         from '../../mcp/server/knowledge-base/logger.mjs';
import KbReconciliationService        from './KbReconciliationService.mjs';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {assertConfigFresh}            from '../../scripts/setup/initServerConfigs.mjs';
import AiConfig                       from '../../config.mjs';

const cleanShutdown = signal => {
    logger.info(`[KbReconciliationService] Received ${signal}; stopping.`);
    KbReconciliationService.stop();
    process.exit(0);
};

// Process-entry only: register signal handlers + run the stale-overlay boot guard + start the
// service ONLY when this daemon is the main module, never on import — preserves the process-entry
// isolation invariant (mirrors the orchestrator daemon). The guard targets the memory-core overlay:
// kb-* daemons read config via Memory_Config (that overlay) and own no overlay of their own.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    process.on('SIGTERM', () => cleanShutdown('SIGTERM'));
    process.on('SIGINT',  () => cleanShutdown('SIGINT'));

    const {findings} = AiConfig.validateRequiredEnv({entrypoint: 'kb-reconciliation-daemon'});
    assertConfigFresh({
        requiredFindings: findings,
        serverPath      : fileURLToPath(new URL('../../mcp/server/memory-core/', import.meta.url))
    })
        .then(() => KbReconciliationService.start())
        .catch(err => {
            logger.error('[KbReconciliationService] Daemon start failed:', err);
            process.exit(1);
        });
}
