import { spawn } from 'child_process';
import aiConfig from '../../config.mjs';
import logger from '../../logger.mjs';
import Base from '../../../../../../src/core/Base.mjs';
import Observable from '../../../../../../src/core/Observable.mjs';

/**
 * @summary Orchestrates the daemon lifecycle specifically for the ChromaDB backend engine.
 *
 * Following the dismantling of the monolithic database service, this class is now an explicitly isolated orchestrator
 * responsible for managing the local ChromaDB vector database daemon. It handles asynchronous initialization,
 * persistent heartbeat monitoring (`waitForHeartbeat`), and safe termination sequences independently.
 * 
 * Future AI sessions should search for `chroma startup`, `vector database lifecycle`, or `daemon orchestrator`.
 *
 * @class Neo.ai.mcp.server.memory-core.services.lifecycle.ChromaLifecycleService
 * @extends Neo.core.Base
 * @singleton
 * @see Neo.ai.mcp.server.memory-core.services.lifecycle.InferenceLifecycleService
 * @see Neo.ai.mcp.server.memory-core.managers.ChromaManager
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
         * @member {String} className='Neo.ai.mcp.server.memory-core.services.lifecycle.ChromaLifecycleService'
         * @protected
         */
        className: 'Neo.ai.mcp.server.memory-core.services.lifecycle.ChromaLifecycleService',
        /**
         * @member {Object|null} chromaProcess=null
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
     * @summary Asynchronously initializes the ChromaLifecycleService, verifying engine config constraints.
     */
    async initAsync() {
        await super.initAsync();
        if (aiConfig.engine === 'chroma' || aiConfig.engine === 'both') {
            await this.startDatabase();
        }
    }

    /**
     * @summary Actively pings the Chroma backend to confirm topological readiness.
     * @returns {Promise<Boolean>}
     */
    async isDbRunning() {
        try {
            const ChromaManager = (await import('../../managers/ChromaManager.mjs')).default;
            await ChromaManager.client.heartbeat();
            return true;
        } catch (e) {
            return false;
        }
    }

    /**
     * @summary Boots the explicit local ChromaDB daemon as a detached process and awaits readiness.
     * @returns {Promise<Object>}
     */
    async startDatabase() {
        try {
            if (this.chromaProcess && !this.chromaProcess.killed) {
                return { status: 'already_running', pid: this.chromaProcess.pid, detail: 'Started by this process.' };
            }

            if (await this.isDbRunning()) {
                const result = { status: 'already_running', pid: null, detail: 'Started externally.' };
                this.fire('processActive', { pid: null, managedByService: false, detail: result.detail });
                return result;
            }

            logger.error('Starting ChromaDB (Memory Core) process...');
            await new Promise((resolve, reject) => {
                const { port, dataDir } = aiConfig.engines.chroma;
                const args = ['run', '--path', dataDir, '--port', port.toString()];

                const spawnedProcess = spawn('chroma', args, { detached: true, stdio: 'ignore' });

                spawnedProcess.on('spawn', () => {
                    this.chromaProcess = spawnedProcess;
                    logger.log(`ChromaDB process started with PID: ${this.chromaProcess.pid}`);
                    this.registerCleanup();
                    resolve();
                });

                spawnedProcess.on('error', (err) => {
                    console.error('Failed to start ChromaDB:', err);
                    this.chromaProcess = null;
                    reject(err);
                });

                spawnedProcess.unref();
            });

            await this.waitForHeartbeat();
            const result = { status: 'started', pid: this.chromaProcess.pid };
            this.fire('processActive', { pid: this.chromaProcess.pid, managedByService: true, detail: 'started by service' });
            return result;
        } catch (error) {
            logger.error('[ChromaLifecycleService] Error starting database:', error);
            return { error: 'Failed to start database', message: error.message, code: 'DATABASE_START_ERROR' };
        }
    }

    /**
     * @summary Intercepts OS signals (SIGINT, SIGTERM) to aggressively tear down the ChromaDB child engine.
     * @param {String|Number} signalOrCode 
     */
    async cleanup(signalOrCode) {
        if (this.chromaProcess) {
            logger.log(`[ChromaLifecycleService] cleanup triggered by ${signalOrCode}`);
            try {
                process.kill(-this.chromaProcess.pid, 'SIGTERM');
                this.chromaProcess = null;
            } catch (e) {}
        }
        if (typeof signalOrCode === 'string') {
            process.exit(0);
        }
    }

    /**
     * @summary Binds SIGINT and SIGTERM handlers to gracefully tear down the assigned ChromaDB child group.
     */
    registerCleanup() {
        if (!this.cleanupHandler) {
            this.cleanupHandler = this.cleanup.bind(this);
            process.on('exit', this.cleanupHandler);
            process.on('SIGINT', this.cleanupHandler);
            process.on('SIGTERM', this.cleanupHandler);
        }
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
        try {
            if (!this.chromaProcess || this.chromaProcess.killed) return { status: 'not_running' };

            return new Promise((resolve) => {
                const pid = this.chromaProcess.pid;
                this.chromaProcess.on('exit', () => {
                    logger.log(`ChromaDB process ${pid} stopped.`);
                    this.chromaProcess = null;
                    if (this.cleanupHandler) {
                        process.off('exit', this.cleanupHandler);
                        process.off('SIGINT', this.cleanupHandler);
                        process.off('SIGTERM', this.cleanupHandler);
                        this.cleanupHandler = null;
                    }
                    this.fire('processStopped', { pid, managedByService: true });
                    resolve({ status: 'stopped' });
                });
                process.kill(-this.chromaProcess.pid, 'SIGTERM');
            });
        } catch (error) {
            return { error: 'Failed to stop database', message: error.message };
        }
    }

    /**
     * @summary Resolves the current internal status and PID tracking for the ChromaDB backend engine.
     * @returns {Object}
     */
    getDatabaseStatus() {
        if (this.chromaProcess && !this.chromaProcess.killed) {
            return { running: true, pid: this.chromaProcess.pid, managed: true };
        }
        return { running: false, pid: null, managed: false };
    }

    /**
     * @summary High-level router for managing ChromaDB process state (start/stop) from the orchestrator.
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
