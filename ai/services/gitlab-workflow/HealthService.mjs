import aiConfig from '../../mcp/server/gitlab-workflow/config.mjs';
import Base     from '../../../src/core/Base.mjs';

/**
 * @summary Scaffold health service for the GitLab Workflow MCP server.
 *
 * The initial scaffold only registers the MCP surface. It validates that the
 * server has a GitLab host configuration and reports whether a PAT is configured,
 * without pretending that real API connectivity exists before GitLabClient lands.
 *
 * @class Neo.ai.services.gitlab-workflow.HealthService
 * @extends Neo.core.Base
 * @singleton
 */
class HealthService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.services.gitlab-workflow.HealthService'
         * @protected
         */
        className: 'Neo.ai.services.gitlab-workflow.HealthService',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * @summary Returns scaffold health and config visibility for GitLab workflow tools.
     * @returns {Promise<Object>}
     */
    async healthcheck() {
        const hostUrl = aiConfig.gitlab.hostUrl;
        const details = [];

        if (!hostUrl) {
            details.push('Missing GitLab host URL; set NEO_GITLAB_HOST or config.gitlab.hostUrl.');
        }

        return {
            status: details.length ? 'unhealthy' : 'healthy',
            gitlab: {
                hostUrl,
                tokenConfigured: Boolean(aiConfig.gitlab.token)
            },
            details
        };
    }
}

export default Neo.setupClass(HealthService);
