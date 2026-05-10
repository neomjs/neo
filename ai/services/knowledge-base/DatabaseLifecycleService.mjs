import {spawn}  from 'child_process';
import aiConfig from '../../mcp/server/knowledge-base/config.mjs';
import logger   from '../../mcp/server/knowledge-base/logger.mjs';
import Base     from '../../../src/core/Base.mjs';
import Observable from '../../../src/core/Observable.mjs';

/**
 * @summary Manages the lifecycle of the ChromaDB process for the Knowledge Base.
 *
 * This service is responsible for starting, stopping, and monitoring the ChromaDB server process.
 * It ensures that the database is running when needed and handles graceful shutdowns.
 *
 * @class Neo.ai.services.knowledge-base.DatabaseLifecycleService
 * @extends Neo.core.Base
 * @singleton
 */
class DatabaseLifecycleService extends Base {
    /**
     * True automatically applies the core.Observable mixin
     * @member {Boolean} observable=true
     * @static
     */
    static observable = true;

    static config = {
        /**
         * @member {String} className='Neo.ai.services.knowledge-base.DatabaseLifecycleService'
         * @protected
         */
        className: 'Neo.ai.services.knowledge-base.DatabaseLifecycleService',
        /**
         * Holds the child process object for the ChromaDB server.
         * @member {ChildProcess|null} chromaProcess=null
         * @protected
         */
        chromaProcess: null,
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
        logger.log('[DatabaseLifecycleService] Knowledge Base assumes ChromaDB is managed by AgentOrchestrator.');
    }

    /**
     * Checks if a ChromaDB instance is already running on the configured port.
     * @returns {Promise<boolean>}
     */
    async isDbRunning() {
        try {
            const ChromaManager = (await import('./ChromaManager.mjs')).default;
            await ChromaManager.client.heartbeat();
            return true;
        } catch (e) {
            return false;
        }
    }

    /**
     * Manages the database lifecycle based on the provided action.
     * @param {Object} params
     * @param {String} params.action - 'start' or 'stop'
     * @returns {Promise<Object>}
     */
    async manageDatabase({action}) {
        if (action === 'start') {
            return this.startDatabase();
        } else if (action === 'stop') {
            return this.stopDatabase();
        } else {
            throw new Error(`Invalid action: ${action}. Must be 'start' or 'stop'.`);
        }
    }

    /**
     * Starts the ChromaDB server as a background process, if not already running.
     * @returns {Promise<object>} A promise that resolves with the status.
     */
    async startDatabase() {
        if (await this.isDbRunning()) {
            const result = { status: 'already_running', pid: null, detail: 'Server is managed by AgentOrchestrator.' };
            this.fire('processActive', { pid: null, managedByService: false, detail: result.detail });
            return result;
        }

        logger.log('[DatabaseLifecycleService] Knowledge Base assumes ChromaDB is managed by AgentOrchestrator. Waiting for heartbeat...');
        await this.waitForHeartbeat();

        const result = { status: 'started_externally', pid: null };
        this.fire('processActive', { pid: null, managedByService: false, detail: 'started externally' });
        return result;
    }

    /**
     * Handles process termination signals to ensure the child process is killed.
     * @param {string|number} signalOrCode
     */
    async cleanup(signalOrCode) {
        if (typeof signalOrCode === 'string') {
            process.exit(0);
        }
    }

    /**
     * Waits for the ChromaDB server to respond to a heartbeat.
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
        throw new Error('ChromaDB failed to start (timeout waiting for heartbeat).');
    }

    /**
     * Stops the ChromaDB server process if it was started by this server.
     * @returns {Promise<object>} A promise that resolves with the status.
     */
    async stopDatabase() {
        return { status: 'not_running', detail: 'Knowledge Base does not manage the ChromaDB daemon.' };
    }

    /**
     * Gets the status of the ChromaDB process.
     * @returns {object} The status of the ChromaDB process.
     */
    getDatabaseStatus() {
        return { running: false, pid: null, managed: false };
    }
}

export default Neo.setupClass(DatabaseLifecycleService);
