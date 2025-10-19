import {exec}      from 'child_process';
import {promisify} from 'util';
import aiConfig    from '../../config.mjs';
import Base        from '../../../../../src/core/Base.mjs';

const execAsync = promisify(exec);

/**
 * Service for providing the health status of the GitHub workflow server.
 * Its primary purpose is to verify the server's critical dependency: the GitHub CLI (`gh`).
 * It performs a series of checks for installation, authentication, and version compatibility,
 * then consolidates these checks into a single, comprehensive health status object.
 * @class Neo.ai.mcp.server.github-workflow.HealthService
 * @extends Neo.core.Base
 * @singleton
 */
class HealthService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.server.github-workflow.HealthService'
         * @protected
         */
        className: 'Neo.ai.mcp.server.github-workflow.HealthService',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * Checks if the GitHub CLI is installed and if its version meets the minimum requirement.
     * This single check is more efficient than performing two separate commands.
     * @returns {Promise<{installed: boolean, versionOk: boolean, version: string|null, error?: string}>}
     * @private
     */
    async #checkGhVersion() {
        try {
            const {stdout}     = await execAsync('gh --version');
            const versionMatch = stdout.match(/gh version ([\d.]+)/);
            if (versionMatch) {
                const currentVersion = versionMatch[1];
                if (currentVersion >= aiConfig.githubWorkflow.minGhVersion) {
                    return {installed: true, versionOk: true, version: currentVersion};
                } else {
                    return {
                        installed: true,
                        versionOk: false,
                        version  : currentVersion,
                        error    : `gh version (${currentVersion}) is outdated. Please upgrade to at least ${aiConfig.githubWorkflow.minGhVersion}.`
                    };
                }
            }
            return {installed: true, versionOk: false, error: 'Could not parse gh version.'};
        } catch (e) {
            return {installed: false, versionOk: false, error: 'GitHub CLI is not installed. Please install it.'};
        }
    }

    /**
     * Checks the status of the GitHub CLI integration.
     * @returns {Promise<object>} A promise that resolves to the health check payload.
     */
    async healthcheck() {
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

        const versionCheck = await this.#checkGhVersion();
        payload.githubCli.installed = versionCheck.installed;
        payload.githubCli.versionOk = versionCheck.versionOk;
        payload.githubCli.version   = versionCheck.version;

        if (!versionCheck.installed) {
            payload.status = 'unhealthy';
            payload.githubCli.details.push(versionCheck.error);
            return payload;
        }

        if (!versionCheck.versionOk) {
            payload.status = 'unhealthy';
            payload.githubCli.details.push(versionCheck.error);
        }

        const authCheck = await this.#checkGhAuth();
        payload.githubCli.authenticated = authCheck.authenticated;
        if (!authCheck.authenticated) {
            payload.status = 'unhealthy';
            payload.githubCli.details.push(authCheck.error);
        }

        if (payload.status === 'healthy') {
            payload.githubCli.details.push('GitHub CLI is installed, authenticated, and up to date.');
        }

        return payload;
    }
}

export default Neo.setupClass(HealthService);
