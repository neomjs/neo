import { spawn } from 'child_process';
import aiConfig from '../../../mcp/server/memory-core/config.mjs';
import logger from '../../../mcp/server/memory-core/logger.mjs';
import Base from '../../../../src/core/Base.mjs';
import Observable from '../../../../src/core/Observable.mjs';

/**
 * @summary Orchestrates the daemon lifecycle specifically for the ChromaDB backend engine.
 *
 * Following the dismantling of the monolithic database service, this class is now an explicitly isolated orchestrator
 * responsible for managing the local ChromaDB vector database daemon. It handles asynchronous initialization,
 * persistent heartbeat monitoring (`waitForHeartbeat`), and safe termination sequences independently.
 *
 * **Unified topology:** Memory Core connects as a downstream client via `ChromaManager` to a shared
 * ChromaDB instance. This service no longer attempts to spawn or manage a local daemon.
 *
 * @class Neo.ai.services.memory-core.lifecycle.ChromaLifecycleService
 * @extends Neo.core.Base
 * @singleton
 * @see Neo.ai.services.memory-core.lifecycle.InferenceLifecycleService
 * @see Neo.ai.services.memory-core.managers.ChromaManager
 */
class ChromaLifecycleService extends Base {
    /**
     * @member {Boolean} observable=true
     * @protected
     * @static
     */
    static observable = true;

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
     * @summary Asynchronously initializes the ChromaLifecycleService.
     *
     * In the unified-topology deployment this skips daemon-spawn so MC does not attempt to
     * manage the shared ChromaDB process.
     */
    async initAsync() {
        await super.initAsync();
        logger.log('[ChromaLifecycleService] Unified topology — skipping own ChromaDB spawn; Memory Core connects to the shared instance.');
    }

    /**
     * @summary Actively pings the Chroma backend to confirm topological readiness.
     * @returns {Promise<Boolean>}
     */
    async isDbRunning() {
        try {
            const ChromaManager = (await import('../managers/ChromaManager.mjs')).default;
            await ChromaManager.client.heartbeat();
            return true;
        } catch (e) {
            return false;
        }
    }

    /**
     * @summary Boots the explicit local ChromaDB daemon.
     *
     * In unified topology this returns `{status: 'skipped_unified_mode'}` without
     * attempting any spawn.
     * @returns {Promise<Object>}
     */
    async startDatabase() {
        return {
            status: 'skipped_unified_mode',
            detail: 'Memory Core runs as a downstream client of the shared ChromaDB in unified mode. No daemon spawn required.'
        };
    }

    /**
     * @summary Polls the managed ChromaDB daemon backend until the heartbeat API succeeds.
     * @returns {Promise<void>}
     */
    async waitForHeartbeat() {
        logger.log('Waiting for ChromaDB heartbeat...');
        for (let i = 0; i < 30; i++) {
            if (await this.isDbRunning()) {
                logger.log('ChromaDB heartbeat detected.');
                return;
            }
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        throw new Error('ChromaDB failed to start (timeout).');
    }

    /**
     * @summary Intentionally drops the ongoing ChromaDB daemon process when transitioning to offline.
     * @returns {Promise<Object>}
     */
    async stopDatabase() {
        return { status: 'not_running', detail: 'Memory Core does not manage the ChromaDB daemon in unified topology.' };
    }

    /**
     * @summary Resolves the current internal status and PID tracking for the ChromaDB backend engine.
     * @returns {Object}
     */
    getDatabaseStatus() {
        return { running: false, pid: null, managed: false };
    }

    /**
     * @summary High-level router for managing ChromaDB process state (start/stop) from the orchestrator.
     *
     * Backs the `manage_database` MCP tool (see `services/toolService.mjs`). In unified topology
     * the `start` action propagates `startDatabase`'s `{status: 'skipped_unified_mode'}` response
     * rather than spawning; the `stop` action falls through to `stopDatabase`'s existing
     * `{status: 'not_running'}` path.
     * @param {Object} args
     * @returns {Promise<Object>}
     */
    async manageDatabase(args) {
        if (args.action === 'start') {
            return await this.startDatabase();
        } else if (args.action === 'stop') {
            return await this.stopDatabase();
        }
        return { error: 'Unknown action' };
    }
}

export default Neo.setupClass(ChromaLifecycleService);
