import {exec} from 'child_process';
import {promisify} from 'util';

const execAsync = promisify(exec);

/**
 * Checks the status of the GitHub CLI integration.
 * @returns {Promise<object>} A promise that resolves to the health check payload.
 */
async function buildHealthResponse() {
    const payload = {
        status   : 'healthy',
        timestamp: new Date().toISOString(),
        githubCli: {
            installed    : true,
            authenticated: true,
            details      : ''
        }
    };

    try {
        const {stdout} = await execAsync('gh auth status');
        payload.githubCli.details = stdout.trim();
    } catch (error).
        payload.status = 'unhealthy';
        payload.githubCli.installed = !error.message.includes('command not found');
        payload.githubCli.authenticated = false;
        payload.githubCli.details = error.stderr.trim();
    }

    return payload;
}

export {
    buildHealthResponse
};
