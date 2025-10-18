import {ChromaClient} from 'chromadb';
import {spawn}        from 'child_process';
import aiConfig       from '../../config.mjs';
import logger         from '../../logger.mjs';
import Base           from '../../../../../src/core/Base.mjs';

/**
 * Manages the lifecycle of the ChromaDB process for the Memory Core.
 * @class AI.mcp.server.memory.DatabaseLifecycleService
 * @extends Neo.core.Base
 * @singleton
 */
class DatabaseLifecycleService extends Base {
    static config = {
        /**
         * @member {String} className='AI.mcp.server.memory.DatabaseLifecycleService'
         * @protected
         */
        className: 'AI.mcp.server.memory.DatabaseLifecycleService',
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
     * Checks if a ChromaDB instance is already running on the configured port.
     * @returns {Promise<boolean>}
     */
    async isDbRunning() {
        try {
            const { host, port } = aiConfig.memory;
            const client = new ChromaClient({ host, port });
            await client.heartbeat();
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
            return { status: 'already_running', pid: null, detail: 'Server was started externally.' };
        }

        return new Promise((resolve, reject) => {
            const { port, path: dbPath } = aiConfig.memory;
            const args = ['run', '--path', dbPath, '--port', port.toString()];

            const spawnedProcess = spawn('chroma', args, {
                detached: true,
                stdio: 'ignore'
            });

            spawnedProcess.on('spawn', () => {
                this.chromaProcess = spawnedProcess;
                logger.log(`ChromaDB (Memory Core) process started with PID: ${this.chromaProcess.pid}`);
                resolve({ status: 'started', pid: this.chromaProcess.pid });
            });

            spawnedProcess.on('error', (err) => {
                console.error('Failed to start ChromaDB (Memory Core) process:', err);
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
            this.chromaProcess.on('exit', () => {
                logger.log(`ChromaDB process with PID: ${this.chromaProcess.pid} has been stopped.`);
                this.chromaProcess = null;
                resolve({ status: 'stopped' });
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
