import { ChromaClient } from 'chromadb';
import { spawn } from 'child_process';
import aiConfig from '../../config.mjs';

// This will hold the child process object for the ChromaDB server
let chromaProcess = null;

/**
 * Checks if a ChromaDB instance is already running on the configured port.
 * @returns {Promise<boolean>}
 */
async function isDbRunning() {
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
async function start_database() {
    if (chromaProcess && !chromaProcess.killed) {
        return { status: 'already_running', pid: chromaProcess.pid, detail: 'Server was started by this process.' };
    }

    if (await isDbRunning()) {
        return { status: 'already_running', pid: null, detail: 'Server was started externally.' };
    }

    return new Promise((resolve, reject) => {
        const { port, path: dbPath } = aiConfig.memory;
        const args = ['run', '--path', dbPath, '--port', port.toString()];
        
        chromaProcess = spawn('chroma', args, {
            detached: true,
            stdio: 'ignore'
        });

        chromaProcess.on('spawn', () => {
            console.log(`ChromaDB (Memory Core) process started with PID: ${chromaProcess.pid}`);
            resolve({ status: 'started', pid: chromaProcess.pid });
        });

        chromaProcess.on('error', (err) => {
            console.error('Failed to start ChromaDB (Memory Core) process:', err);
            chromaProcess = null;
            reject(err);
        });

        chromaProcess.unref();
    });
}

/**
 * Stops the ChromaDB server process if it was started by this server.
 * @returns {Promise<object>} A promise that resolves with the status.
 */
async function stop_database() {
    if (!chromaProcess || chromaProcess.killed) {
        return { status: 'not_running', detail: 'No process was started by this server.' };
    }

    return new Promise((resolve) => {
        chromaProcess.on('exit', () => {
            console.log(`ChromaDB process with PID: ${chromaProcess.pid} has been stopped.`);
            chromaProcess = null;
            resolve({ status: 'stopped' });
        });

        process.kill(-chromaProcess.pid, 'SIGTERM');
    });
}

/**
 * Gets the status of the ChromaDB process.
 * @returns {object} The status of the ChromaDB process.
 */
function get_database_status() {
    if (chromaProcess && !chromaProcess.killed) {
        return { running: true, pid: chromaProcess.pid, managed: true };
    }
    return { running: false, pid: null, managed: false };
}

export {
    start_database,
    stop_database,
    get_database_status
};