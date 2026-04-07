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
 * @summary Manages the local inference server (Ollama or MLX) lifecycle.
 *
 * @class Neo.ai.mcp.server.memory-core.services.lifecycle.InferenceLifecycleService
 * @extends Neo.core.Base
 * @singleton
 */
class InferenceLifecycleService extends Base {
    static config = {
        className: 'Neo.ai.mcp.server.memory-core.services.lifecycle.InferenceLifecycleService',
        inferenceProcess: null,
        singleton: true
    }

    async initAsync() {
        await super.initAsync();
        await this.startInferenceServer();
    }

    async isInferenceRunning() {
        try {
            const res = await fetch(aiConfig.openAiCompatible.host + '/v1/models');
            return res.ok;
        } catch (e) {
            return false;
        }
    }

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

    registerCleanup() {
        if (!this.cleanupHandler) {
            this.cleanupHandler = this.cleanup.bind(this);
            process.on('exit', this.cleanupHandler);
            process.on('SIGINT', this.cleanupHandler);
            process.on('SIGTERM', this.cleanupHandler);
        }
    }

    async cleanup(signalOrCode) {
        if (this.inferenceProcess) {
            logger.log(`[InferenceLifecycleService] cleanup triggered by ${signalOrCode}`);
            try {
                process.kill(-this.inferenceProcess.pid, 'SIGTERM');
                this.inferenceProcess = null;
            } catch (e) {}
        }
        if (typeof signalOrCode === 'string') {
            process.exit(0);
        }
    }
    
    getStatus() {
        if (this.inferenceProcess && !this.inferenceProcess.killed) {
            return { running: true, pid: this.inferenceProcess.pid, managed: true };
        }
        return { running: false, pid: null, managed: false };
    }
}

export default Neo.setupClass(InferenceLifecycleService);
