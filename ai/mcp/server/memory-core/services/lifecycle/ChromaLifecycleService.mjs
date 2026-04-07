import { spawn } from 'child_process';
import aiConfig from '../../config.mjs';
import logger from '../../logger.mjs';
import Base from '../../../../../../src/core/Base.mjs';

/**
 * @summary Manages the lifecycle of the ChromaDB process for the Memory Core.
 *
 * @class Neo.ai.mcp.server.memory-core.services.lifecycle.ChromaLifecycleService
 * @extends Neo.core.Base
 * @singleton
 */
class ChromaLifecycleService extends Base {
    static observable = true;

    static config = {
        className: 'Neo.ai.mcp.server.memory-core.services.lifecycle.ChromaLifecycleService',
        chromaProcess: null,
        singleton: true
    }

    async initAsync() {
        await super.initAsync();
        if (aiConfig.engine === 'chroma' || aiConfig.engine === 'both') {
            await this.startDatabase();
        }
    }

    async isDbRunning() {
        try {
            const ChromaManager = (await import('../../managers/ChromaManager.mjs')).default;
            await ChromaManager.client.heartbeat();
            return true;
        } catch (e) {
            return false;
        }
    }

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
                    this.cleanupHandler = this.cleanup.bind(this);
                    process.on('exit', this.cleanupHandler);
                    process.on('SIGINT', this.cleanupHandler);
                    process.on('SIGTERM', this.cleanupHandler);
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

    getDatabaseStatus() {
        if (this.chromaProcess && !this.chromaProcess.killed) {
            return { running: true, pid: this.chromaProcess.pid, managed: true };
        }
        return { running: false, pid: null, managed: false };
    }

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
