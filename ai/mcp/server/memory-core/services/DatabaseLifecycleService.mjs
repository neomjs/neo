import {spawn}  from 'child_process';
import aiConfig from '../config.mjs';
import logger   from '../logger.mjs';
import Base     from '../../../../../src/core/Base.mjs';

/**
 * Manages the lifecycle of the ChromaDB process for the Memory Core.
 * @class AI.mcp.server.memory-core.services.DatabaseLifecycleService
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
         * @member {String} className='AI.mcp.server.memory-core.services.DatabaseLifecycleService'
         * @protected
         */
        className: 'AI.mcp.server.memory-core.services.DatabaseLifecycleService',
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
        await this.startDatabase();
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
     * Starts the ChromaDB server as a background process, if not already running.
     * @returns {Promise<object>} A promise that resolves with the status.
     */
    async startDatabase() {
        try {
            if (this.chromaProcess && !this.chromaProcess.killed) {
                return { status: 'already_running', pid: this.chromaProcess.pid, detail: 'Server was started by this process.' };
            }

            if (await this.isDbRunning()) {
                const result = { status: 'already_running', pid: null, detail: 'Server was started externally.' };
                this.fire('processActive', { pid: null, managedByService: false, detail: result.detail });
                return result;
            }

            logger.error('Starting ChromaDB (Memory Core) process...');

            await new Promise((resolve, reject) => {
                const { port, path: dbPath } = aiConfig.memoryDb;
                const args = ['run', '--path', dbPath, '--port', port.toString()];

                const spawnedProcess = spawn('chroma', args, {
                    detached: true,
                    stdio: 'ignore'
                });

                spawnedProcess.on('spawn', () => {
                    this.chromaProcess = spawnedProcess;
                    logger.log(`ChromaDB (Memory Core) process started with PID: ${this.chromaProcess.pid}`);
                    resolve();
                });

                spawnedProcess.on('error', (err) => {
                    console.error('Failed to start ChromaDB (Memory Core) process:', err);
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
            logger.error('[DatabaseLifecycleService] Error starting database:', error);
            return {
                error  : 'Failed to start database',
                message: error.message,
                code   : 'DATABASE_START_ERROR'
            };
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
        try {
            if (!this.chromaProcess || this.chromaProcess.killed) {
                return { status: 'not_running', detail: 'No process was started by this server.' };
            }

            return new Promise((resolve) => {
                const pid = this.chromaProcess.pid;
                this.chromaProcess.on('exit', () => {
                    logger.log(`ChromaDB process with PID: ${pid} has been stopped.`);
                    this.chromaProcess = null;
                    const result = { status: 'stopped' };
                    this.fire('processStopped', { pid, managedByService: true });
                    resolve(result);
                });

                process.kill(-this.chromaProcess.pid, 'SIGTERM');
            });
        } catch (error) {
            logger.error('[DatabaseLifecycleService] Error stopping database:', error);
            return {
                error  : 'Failed to stop database',
                message: error.message,
                code   : 'DATABASE_STOP_ERROR'
            };
        }
    }

    /**
     * Gets the status of the ChromaDB process.
     * @returns {object} The status of the ChromaDB process.
     */
    getDatabaseStatus() {
        if (this.chromaProcess && !this.chromaProcess.killed) {
            return { running: true, pid: this.chromaProcess.pid, managed: true };
        }
        return { running: false, pid: null, managed: false };
    }
}

export default Neo.setupClass(DatabaseLifecycleService);
