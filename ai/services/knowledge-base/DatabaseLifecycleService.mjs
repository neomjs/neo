import logger from '../../mcp/server/knowledge-base/logger.mjs';
import Base   from '../../../src/core/Base.mjs';

/**
 * @summary Readiness gate for the shared ChromaDB backend, as seen by the Knowledge Base.
 *
 * **Unified topology (orchestrator-SSOT):** the orchestrator daemon owns the ChromaDB lifecycle.
 * The Knowledge Base connects as a downstream client via `ChromaManager`; this service neither spawns
 * nor stops a daemon. It survives only as a readiness/observability gate: `initAsync` participates in
 * the boot sequence (awaited by `ChromaManager` via `ready()`), and `getDatabaseStatus` projects an
 * external-only status into the healthcheck (no KB-managed process).
 *
 * The managed-mode surface (`startDatabase` / `stopDatabase` / `waitForHeartbeat` / `manageDatabase` /
 * `cleanup`, the `chromaProcess` handle, and the `processActive` event) was removed once the
 * `manage_database` MCP tool was retired and the orchestrator became the sole Chroma driver — keeping
 * it as dead code invited a future session to wire it back up.
 *
 * @class Neo.ai.services.knowledge-base.DatabaseLifecycleService
 * @extends Neo.core.Base
 * @singleton
 * @see Neo.ai.services.knowledge-base.ChromaManager
 */
class DatabaseLifecycleService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.services.knowledge-base.DatabaseLifecycleService'
         * @protected
         */
        className: 'Neo.ai.services.knowledge-base.DatabaseLifecycleService',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * @returns {Promise<void>}
     */
    async initAsync() {
        await super.initAsync();
        logger.log('[DatabaseLifecycleService] Unified topology — Knowledge Base connects to the orchestrator-managed ChromaDB; no daemon spawn.');
    }

    /**
     * @summary Projects external-only database status into the healthcheck payload.
     *
     * The Chroma daemon is orchestrator-owned, so there is no KB-managed process or pid to report —
     * `running` reflects "no KB-managed process" (actual reachability is the separate
     * `database.connection.connected` field). It is the only field healthcheck consumers read.
     * @returns {{running: Boolean}}
     */
    getDatabaseStatus() {
        return {running: false};
    }
}

export default Neo.setupClass(DatabaseLifecycleService);
