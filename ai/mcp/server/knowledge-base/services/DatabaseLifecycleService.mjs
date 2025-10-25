import {spawn}       from 'child_process';
import aiConfig      from '../config.mjs';
import logger        from '../logger.mjs';
import Base          from '../../../../../src/core/Base.mjs';
import ChromaManager from './ChromaManager.mjs';

/**
 * Manages the lifecycle of the ChromaDB process for the Knowledge Base.
 * @class Neo.ai.mcp.server.knowledge-base.services.DatabaseLifecycleService
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
         * @member {String} className='Neo.ai.mcp.server.knowledge-base.services.DatabaseLifecycleService'
         * @protected
         */
        className: 'Neo.ai.mcp.server.knowledge-base.services.DatabaseLifecycleService',
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

        await ChromaManager.ready();
        await this.startDatabase();
    }

    /**
     * Checks if a ChromaDB instance is already running on the configured port.
     * @returns {Promise<boolean>}
     */
    async isDbRunning() {
        try {
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
        if (this.chromaProcess && !this.chromaProcess.killed) {
            return { status: 'already_running', pid: this.chromaProcess.pid, detail: 'Server was started by this process.' };
        }

        if (await this.isDbRunning()) {
            const result = { status: 'already_running', pid: null, detail: 'Server was started externally.' };
            this.fire('processActive', { pid: null, managedByService: false, detail: result.detail });
            return result;
        }

        return new Promise((resolve, reject) => {
            const { port, path: dbPath } = aiConfig;
            const args = ['run', '--path', dbPath, '--port', port.toString()];

            const spawnedProcess = spawn('chroma', args, {
                detached: true,
                stdio   : 'ignore'
            });

            spawnedProcess.on('spawn', () => {
                this.chromaProcess = spawnedProcess;
                logger.log(`ChromaDB (Knowledge Base) process started with PID: ${this.chromaProcess.pid}`);
                const result = { status: 'started', pid: this.chromaProcess.pid };
                this.fire('processActive', { pid: this.chromaProcess.pid, managedByService: true, detail: 'started by service' });
                resolve(result);
            });

            spawnedProcess.on('error', (err) => {
                console.error('Failed to start ChromaDB (Knowledge Base) process:', err);
                this.chromaProcess = null;
                reject(err);
            });

            spawnedProcess.unref();
        });
    }

    /**
     * Stops the ChromaDB server process if it was started by this server.
     * @returns {Promise<object>} A promise that resolves with the status.
     */
    async stopDatabase() {
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
