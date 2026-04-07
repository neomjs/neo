import { spawn } from 'child_process';
import aiConfig from '../../config.mjs';
import logger from '../../logger.mjs';
import Base from '../../../../../../src/core/Base.mjs';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const memCoreDir = path.resolve(__dirname, '../../');

/**
 * @summary Orchestrates the daemon lifecycle completely dedicated to local LLM Inference Backends (Ollama/MLX).
 *
 * Following the architectural decoupling of the monolithic database service, this class isolates the cross-platform
 * auto-startup resolution path for underlying machine learning daemons required by the Memory Core embeddings.
 * It natively identifies Apple Silicon contexts (`/opt/homebrew`), Intel architectures (`/usr/local/`), and 
 * Microsoft Windows fallback locations (`%LOCALAPPDATA%`).
 * 
 * Future AI sessions should search for `inference routing`, `ollama daemon`, `mlx python environment`, or `llm orchestrator`.
 *
 * @class Neo.ai.mcp.server.memory-core.services.lifecycle.InferenceLifecycleService
 * @extends Neo.core.Base
 * @singleton
 * @see Neo.ai.mcp.server.memory-core.services.lifecycle.ChromaLifecycleService
 */
class InferenceLifecycleService extends Base {
    static config = {
        className: 'Neo.ai.mcp.server.memory-core.services.lifecycle.InferenceLifecycleService',
        inferenceProcess: null,
        singleton: true
    }

    /**
     * @summary Asynchronously initializes the InferenceLifecycleService, bootstrapping daemon startup.
     */
    async initAsync() {
        await super.initAsync();
        await this.startInferenceServer();
    }

    /**
     * @summary Probes the active local LLM inference background port, implicitly verifying backend readiness.
     * @returns {Promise<Boolean>}
     */
    async isInferenceRunning() {
        try {
            const res = await fetch(aiConfig.openAiCompatible.host + '/v1/models');
            return res.ok;
        } catch (e) {
            return false;
        }
    }

    /**
     * @summary Spawns the required standalone LLM inference process by mapping seamlessly to the correct binary paths.
     * @returns {Promise<Object>}
     */
    async startInferenceServer() {
        try {
            if (!aiConfig.openAiCompatible.host.includes('127.0.0.1') && !aiConfig.openAiCompatible.host.includes('localhost')) {
                return { status: 'external', detail: 'External inference server configured.' };
            }

            if (await this.isInferenceRunning()) {
                return { status: 'already_running', detail: 'Inference daemon is already running.' };
            }

            // Ollama
            if (aiConfig.openAiCompatible.host.includes('11434')) {
                logger.log('[InferenceLifecycleService] Attempting to auto-start local Ollama daemon for inference...');
                
                let ollamaCmd = 'ollama';
                if (process.platform === 'win32') {
                    const localAppData = process.env.LOCALAPPDATA;
                    const winPath = localAppData ? path.join(localAppData, 'Programs', 'Ollama', 'ollama.exe') : '';
                    if (winPath && fs.existsSync(winPath)) {
                        ollamaCmd = winPath;
                    }
                } else {
                    const macSilicon = '/opt/homebrew/bin/ollama';
                    const macIntel = '/usr/local/bin/ollama';
                    if (fs.existsSync(macSilicon)) {
                        ollamaCmd = macSilicon;
                    } else if (fs.existsSync(macIntel)) {
                        ollamaCmd = macIntel;
                    }
                }

                return new Promise((resolve) => {
                    const spawnedProcess = spawn(ollamaCmd, ['serve'], { detached: true, stdio: 'ignore' });

                    spawnedProcess.on('spawn', () => {
                        this.inferenceProcess = spawnedProcess;
                        this.registerCleanup();
                        logger.log(`[InferenceLifecycleService] Ollama daemon started with PID: ${this.inferenceProcess.pid}`);
                        resolve({ status: 'started', pid: this.inferenceProcess.pid });
                    });

                    spawnedProcess.on('error', (err) => {
                        logger.error('[InferenceLifecycleService] Failed to auto-start Ollama:', err.message);
                        this.inferenceProcess = null;
                        resolve({ status: 'failed', error: err.message });
                    });
                    spawnedProcess.unref();
                });
            }
            
            // MLX
            if (aiConfig.openAiCompatible.host.includes('11435')) {
                logger.log('[InferenceLifecycleService] Attempting to auto-start MLX daemon for inference...');
                
                const venvPath = path.resolve(memCoreDir, '.venv');
                if (!fs.existsSync(venvPath)) {
                    logger.error('[InferenceLifecycleService] MLX venv not found. Please run setup_mlx.sh.');
                    return { status: 'failed', error: 'VENV_NOT_FOUND' };
                }

                // Parse the model string. We fallback to 'gemma4:31b' but hugging face names are typically different. 
                // We trust aiConfig.openAiCompatible.model is correct or mapped by the user
                const model = aiConfig.openAiCompatible.model;
                const pythonPath = path.join(venvPath, 'bin', 'python');
                
                return new Promise((resolve) => {
                    const spawnedProcess = spawn(pythonPath, ['-m', 'mlx_lm.server', '--model', model, '--port', '11435'], { 
                        detached: true, 
                        stdio: 'ignore' 
                    });

                    spawnedProcess.on('spawn', () => {
                        this.inferenceProcess = spawnedProcess;
                        this.registerCleanup();
                        logger.log(`[InferenceLifecycleService] MLX daemon started with PID: ${this.inferenceProcess.pid}`);
                        resolve({ status: 'started', pid: this.inferenceProcess.pid });
                    });

                    spawnedProcess.on('error', (err) => {
                        logger.error('[InferenceLifecycleService] Failed to auto-start MLX daemon:', err.message);
                        this.inferenceProcess = null;
                        resolve({ status: 'failed', error: err.message });
                    });
                    spawnedProcess.unref();
                });
            }

            logger.warn('[InferenceLifecycleService] Local inference server on custom port is offline.');
            return { status: 'offline', detail: 'Custom port local server is offline.' };
        } catch (error) {
            logger.error('[InferenceLifecycleService] Error handling boot:', error);
            return { status: 'failed', error: error.message };
        }
    }

    /**
     * @summary Binds SIGINT and SIGTERM handlers to gracefully tear down the assigned inference group.
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
     * @summary Intercepts OS signals to aggressively force teardown of the MLX/Ollama child engine group.
     * @param {String|Number} signalOrCode 
     */
    async cleanup(signalOrCode) {
        if (this.inferenceProcess) {
            logger.log(`[InferenceLifecycleService] cleanup triggered by ${signalOrCode}`);
            try {
                process.kill(-this.inferenceProcess.pid, 'SIGKILL');
                this.inferenceProcess = null;
            } catch (e) {}
        }
        if (typeof signalOrCode === 'string') {
            process.exit(0);
        }
    }

    /**
     * @summary Intentionally drops the ongoing LLM daemon process when transitioning to offline.
     * @returns {Promise<Object>}
     */
    async stopInferenceServer() {
        try {
            if (!this.inferenceProcess || this.inferenceProcess.killed) return { status: 'not_running' };

            return new Promise((resolve) => {
                const pid = this.inferenceProcess.pid;
                
                // Fallback timeout in case 'exit' isn't triggered after SIGKILL
                const killTimeout = setTimeout(() => {
                    this.inferenceProcess = null;
                    if (this.cleanupHandler) {
                        process.off('exit', this.cleanupHandler);
                        process.off('SIGINT', this.cleanupHandler);
                        process.off('SIGTERM', this.cleanupHandler);
                        this.cleanupHandler = null;
                    }
                    resolve({ status: 'stopped', detail: 'timeout_force_resolve' });
                }, 2000);

                this.inferenceProcess.on('exit', () => {
                    clearTimeout(killTimeout);
                    logger.log(`[InferenceLifecycleService] process ${pid} stopped.`);
                    this.inferenceProcess = null;
                    if (this.cleanupHandler) {
                        process.off('exit', this.cleanupHandler);
                        process.off('SIGINT', this.cleanupHandler);
                        process.off('SIGTERM', this.cleanupHandler);
                        this.cleanupHandler = null;
                    }
                    resolve({ status: 'stopped' });
                });
                
                try {
                    process.kill(-this.inferenceProcess.pid, 'SIGKILL');
                } catch(e) {
                    clearTimeout(killTimeout);
                    this.inferenceProcess = null;
                    resolve({ status: 'stopped', detail: 'already_dead' });
                }
            });
        } catch (error) {
            return { error: 'Failed to stop inference server', message: error.message };
        }
    }
    
    /**
     * @summary Resolves the current internal status and PID tracking for the explicit LLM daemon process.
     * @returns {Object}
     */
    getStatus() {
        if (this.inferenceProcess && !this.inferenceProcess.killed) {
            return { running: true, pid: this.inferenceProcess.pid, managed: true };
        }
        return { running: false, pid: null, managed: false };
    }

    /**
     * @summary Router mapping for explicit manual startup and teardown orchestrations of the Inference backend.
     * @param {Object} args
     * @returns {Promise<Object>}
     */
    async manageInference(args) {
        if (args.action === 'start') {
            return await this.startInferenceServer();
        } else if (args.action === 'stop') {
            return await this.stopInferenceServer();
        }
        return { error: 'Unknown action' };
    }
}

export default Neo.setupClass(InferenceLifecycleService);
