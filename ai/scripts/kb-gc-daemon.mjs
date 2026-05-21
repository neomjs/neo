/**
 * @module ai/scripts/kb-gc-daemon
 * @summary Thin Node-process boot wrapper for the Phase 4C KB garbage-collection daemon (#11641).
 *
 * Owns Neo namespace bootstrap + SIGTERM / SIGINT clean-stop signal handling +
 * `KbGarbageCollectionService.start()` invocation. The class definition (poll loop, tenant
 * enumeration, retention diff, opt-in delete, the defrag-recommended signal) lives in
 * `ai/daemons/KbGarbageCollectionService.mjs`.
 *
 * This split matches the canonical Orchestrator class+wrapper pattern: class files in
 * `ai/daemons/` never import Neo; entry-point scripts in `ai/scripts/` own the Neo +
 * core/_export + InstanceManager bootstrap chain.
 *
 * Persistent-process invocation: launchd / systemd should target this script
 * (`node ai/scripts/kb-gc-daemon.mjs`), or `npm run ai:kb-gc`. The daemon is opt-in — it
 * exits early unless `aiConfig.knowledgeBase.gcEnabled` is true; the destructive delete is a
 * second opt-in (`gcAutoDelete`).
 *
 * @see ai/daemons/KbGarbageCollectionService.mjs
 * @see ai/scripts/kb-reconciliation-daemon.mjs (sibling wrapper precedent)
 * @see #11641 (Phase 4C GC daemon), #11628 (Phase 4 epic)
 */

// Neo namespace bootstrap (entry-point invariant): `Neo` + `core/_export` populate
// `globalThis.Neo` so any module using `Neo.gatekeep()` / `Neo.setupClass()` at
// module-load succeeds. `InstanceManager` binds `Neo.find` / `Neo.get` aliases.
import Neo             from '../../src/Neo.mjs';
import * as core       from '../../src/core/_export.mjs';
import InstanceManager from '../../src/manager/Instance.mjs';

import logger                    from '../mcp/server/knowledge-base/logger.mjs';
import KbGarbageCollectionService from '../daemons/KbGarbageCollectionService.mjs';

const cleanShutdown = signal => {
    logger.info(`[KbGarbageCollectionService] Received ${signal}; stopping.`);
    KbGarbageCollectionService.stop();
    process.exit(0);
};

process.on('SIGTERM', () => cleanShutdown('SIGTERM'));
process.on('SIGINT',  () => cleanShutdown('SIGINT'));

KbGarbageCollectionService.start().catch(err => {
    logger.error('[KbGarbageCollectionService] Daemon start failed:', err);
    process.exit(1);
});
