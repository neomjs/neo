import Base from '../../../../../src/core/Base.mjs';
import GraphqlService from './GraphqlService.mjs';
import aiConfig from '../config.mjs';
import logger from '../logger.mjs';
import { GET_VIEWER_PERMISSION } from './queries/repositoryQueries.mjs';

/**
 * Service for interacting with the GitHub repository itself.
 * @class Neo.ai.mcp.server.github-workflow.RepositoryService
 * @extends Neo.core.Base
 * @singleton
 */
class RepositoryService extends Base {
    static config = {
        className: 'Neo.ai.mcp.server.github-workflow.RepositoryService',
        singleton: true
    }

    /**
     * Fetches the current user's permission level for the repository.
     * @returns {Promise<object>} A promise that resolves to an object containing the permission level or a structured error.
     */
    async getViewerPermission() {
        const variables = {
            owner: aiConfig.owner,
            repo: aiConfig.repo
        };

        try {
            const data = await GraphqlService.query(GET_VIEWER_PERMISSION, variables);
            const permission = data.repository.viewerPermission;
            logger.info(`Viewer permission for ${aiConfig.owner}/${aiConfig.repo}: ${permission}`);
            return { permission };
        } catch (error) {
            logger.error('Error fetching viewer permission via GraphQL:', error);
            return {
                error: 'GraphQL API request failed',
                message: error.message,
                code: 'GRAPHQL_API_ERROR'
            };
        }
    }
}

export default Neo.setupClass(RepositoryService);
