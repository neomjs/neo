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

import logger                  from '../../mcp/server/knowledge-base/logger.mjs';
import KbReconciliationService from './KbReconciliationService.mjs';
import {fileURLToPath}         from 'node:url';
import {assertConfigFresh}     from '../../scripts/setup/initServerConfigs.mjs';

const cleanShutdown = signal => {
    logger.info(`[KbReconciliationService] Received ${signal}; stopping.`);
    KbReconciliationService.stop();
    process.exit(0);
};

process.on('SIGTERM', () => cleanShutdown('SIGTERM'));
process.on('SIGINT',  () => cleanShutdown('SIGINT'));

// Boot guard: fail fast with an actionable --migrate-config message if the consumed memory-core
// config overlay is missing a leaf its template added, rather than crashing cryptically on an
// undefined leaf later. kb-* daemons read config via Memory_Config (the memory-core overlay) and
// own no overlay of their own, so this guards THAT overlay before the service boots.
assertConfigFresh({serverPath: fileURLToPath(new URL('../../mcp/server/memory-core/', import.meta.url))})
    .then(() => KbReconciliationService.start())
    .catch(err => {
        logger.error('[KbReconciliationService] Daemon start failed:', err);
        process.exit(1);
    });
