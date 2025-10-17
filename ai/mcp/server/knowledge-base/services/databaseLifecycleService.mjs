import { spawn } from 'child_process';

// This will hold the child process object for the ChromaDB server
let chromaProcess = null;

/**
 * Starts the ChromaDB server as a background process.
 * @returns {Promise<object>} A promise that resolves with the status.
 */
async function start_database() {
    if (chromaProcess && !chromaProcess.killed) {
        return { status: 'already_running', pid: chromaProcess.pid };
    }

    return new Promise((resolve, reject) => {
        // Using 'spawn' to have detailed control over the child process
        chromaProcess = spawn('chroma', ['run', '--path', './chroma'], {
            detached: true, // Allows the child to run independently of the parent
            stdio: 'ignore'   // We don't need to pipe stdio, detaching handles it
        });

        chromaProcess.on('spawn', () => {
            console.log(`ChromaDB process started with PID: ${chromaProcess.pid}`);
            resolve({ status: 'started', pid: chromaProcess.pid });
        });

        chromaProcess.on('error', (err) => {
            console.error('Failed to start ChromaDB process:', err);
            chromaProcess = null;
            reject(err);
        });

        // Un-reference the child process to allow the parent to exit independently
        chromaProcess.unref();
    });
}

/**
 * Stops the ChromaDB server process.
 * @returns {Promise<object>} A promise that resolves with the status.
 */
async function stop_database() {
    if (!chromaProcess || chromaProcess.killed) {
        return { status: 'not_running' };
    }

    return new Promise((resolve) => {
        chromaProcess.on('exit', () => {
            console.log(`ChromaDB process with PID: ${chromaProcess.pid} has been stopped.`);
            chromaProcess = null;
            resolve({ status: 'stopped' });
        });

        // Kill the entire process group to ensure all child processes are terminated
        process.kill(-chromaProcess.pid, 'SIGTERM');
    });
}

/**
 * Gets the status of the ChromaDB process.
 * @returns {object} The status of the ChromaDB process.
 */
function get_database_status() {
    if (chromaProcess && !chromaProcess.killed) {
        return { running: true, pid: chromaProcess.pid };
    }
    return { running: false, pid: null };
}

export {
    start_database,
    stop_database,
    get_database_status
};