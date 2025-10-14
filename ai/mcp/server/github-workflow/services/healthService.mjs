import {exec} from 'child_process';
import {promisify} from 'util';

const execAsync = promisify(exec);
const MIN_GH_VERSION = '2.0.0';

async function checkGhInstalled() {
    try {
        await execAsync('gh --version');
        return {installed: true};
    } catch (e) {
        return {installed: false, error: 'GitHub CLI is not installed. Please install it.'};
    }
}

async function checkGhAuth() {
    try {
        await execAsync('gh auth status');
        return {authenticated: true};
    } catch (e) {
        return {authenticated: false, error: 'GitHub CLI is not authenticated. Please run "gh auth login".'};
    }
}

async function checkGhVersion() {
    try {
        const {stdout} = await execAsync('gh --version');
        const versionMatch = stdout.match(/gh version ([\d.]+)/);
        if (versionMatch) {
            const currentVersion = versionMatch[1];
            if (currentVersion >= MIN_GH_VERSION) {
                return {versionOk: true, version: currentVersion};
            } else {
                return {versionOk: false, version: currentVersion, error: `gh version (${currentVersion}) is outdated. Please upgrade to at least ${MIN_GH_VERSION}.`};
            }
        }
        return {versionOk: false, error: 'Could not parse gh version.'};
    } catch (e) {
        return {versionOk: false, error: 'Could not get gh version.'};
    }
}

/**
 * Checks the status of the GitHub CLI integration.
 * @returns {Promise<object>} A promise that resolves to the health check payload.
 */
async function buildHealthResponse() {
    const payload = {
        status   : 'healthy',
        timestamp: new Date().toISOString(),
        githubCli: {
            installed    : false,
            authenticated: false,
            versionOk    : false,
            version      : null,
            details      : []
        }
    };

    const installedCheck = await checkGhInstalled();
    payload.githubCli.installed = installedCheck.installed;
    if (!installedCheck.installed) {
        payload.status = 'unhealthy';
        payload.githubCli.details.push(installedCheck.error);
        return payload;
    }

    const authCheck = await checkGhAuth();
    payload.githubCli.authenticated = authCheck.authenticated;
    if (!authCheck.authenticated) {
        payload.status = 'unhealthy';
        payload.githubCli.details.push(authCheck.error);
    }

    const versionCheck = await checkGhVersion();
    payload.githubCli.versionOk = versionCheck.versionOk;
    payload.githubCli.version = versionCheck.version;
    if (!versionCheck.versionOk) {
        payload.status = 'unhealthy';
        payload.githubCli.details.push(versionCheck.error);
    }

    if (payload.status === 'healthy') {
        payload.githubCli.details.push('GitHub CLI is installed, authenticated, and up to date.');
    }

    return payload;
}

export {
    buildHealthResponse
};