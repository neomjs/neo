import logger from '../../../mcp/server/memory-core/logger.mjs';
import Base   from '../../../../src/core/Base.mjs';

/**
 * @summary Readiness gate for the shared ChromaDB backend, as seen by Memory Core.
 *
 * **Unified topology (orchestrator-SSOT):** the orchestrator daemon owns the ChromaDB lifecycle.
 * Memory Core connects as a downstream client via `ChromaManager`; this service neither spawns nor
 * stops a daemon. It survives only as a readiness/observability gate: `initAsync` participates in the
 * boot sequence (awaited by `SystemLifecycleService` + `ChromaManager` via `ready()`), and
 * `getDatabaseStatus` projects an external-only status into the healthcheck (no MC-managed process).
 *
 * The managed-mode surface (`startDatabase` / `stopDatabase` / `waitForHeartbeat` / `manageDatabase`)
 * was removed once the `manage_database` MCP tool was retired and the orchestrator became the sole
 * Chroma driver — keeping it as dead code invited a future session to wire it back up.
 *
 * @class Neo.ai.services.memory-core.lifecycle.ChromaLifecycleService
 * @extends Neo.core.Base
 * @singleton
 * @see Neo.ai.services.memory-core.managers.ChromaManager
 */
class ChromaLifecycleService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.services.memory-core.lifecycle.ChromaLifecycleService'
         * @protected
         */
        className: 'Neo.ai.services.memory-core.lifecycle.ChromaLifecycleService',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * @summary Asynchronously initializes the service. In unified topology this only logs that MC
     * does not manage the shared ChromaDB process — boot ordering is owned by `SystemLifecycleService`.
     */
    async initAsync() {
        await super.initAsync();
        logger.log('[ChromaLifecycleService] Unified topology — Memory Core connects to the shared ChromaDB; no daemon spawn.');
    }

    /**
     * @summary Projects external-only database status into the healthcheck payload.
     *
     * The Chroma daemon is orchestrator-owned, so there is no MC-managed process or pid to report —
     * `running` reflects "no MC-managed process" (actual reachability is the separate
     * `database.connection.connected` field). It is the only field healthcheck consumers read.
     * @returns {{running: Boolean}}
     */
    getDatabaseStatus() {
        return {running: false};
    }
}

export default Neo.setupClass(ChromaLifecycleService);
