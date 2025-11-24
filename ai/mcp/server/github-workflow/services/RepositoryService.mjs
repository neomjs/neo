import aiConfig                from '../config.mjs';
import Base                    from '../../../../../src/core/Base.mjs';
import GraphqlService          from './GraphqlService.mjs';
import logger                  from '../logger.mjs';
import {GET_VIEWER_PERMISSION} from './queries/repositoryQueries.mjs';

/**
 * @summary Service for interacting with the GitHub repository itself.
 *
 * This service is responsible for repository-level checks and configurations.
 * Its primary role is to fetch and cache the current user's viewer permissions
 * (e.g., ADMIN, WRITE, READ), which are used by other services to gate
 * privileged operations like assigning issues.
 *
 * @class Neo.ai.mcp.server.github-workflow.services.RepositoryService
 * @extends Neo.core.Base
 * @singleton
 */
class RepositoryService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.server.github-workflow.services.RepositoryService'
         * @protected
         */
        className: 'Neo.ai.mcp.server.github-workflow.services.RepositoryService',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * The permission level string for the current user (e.g., 'ADMIN', 'WRITE').
     * This value is fetched and cached on server startup.
     * @member {String|null} viewerPermission=null
     */
    viewerPermission = null;

    /**
     * Fetches the current user's permission level from the API and caches it.
     * This method is intended for internal use at startup but can be called on demand.
     * @returns {Promise<string|null>} The permission string or null on failure.
     */
    async fetchAndCacheViewerPermission() {
        const variables = {
            owner: aiConfig.owner,
            repo : aiConfig.repo
        };

        try {
            const data = await GraphqlService.query(GET_VIEWER_PERMISSION, variables);
            this.viewerPermission = data.repository.viewerPermission;
            logger.info(`Fetched and cached viewer permission: ${this.viewerPermission}`);
            return this.viewerPermission;
        } catch (error) {
            logger.error('Error fetching viewer permission via GraphQL:', error);
            return null;
        }
    }

    /**
     * Returns the cached permission level of the current user, wrapped in an object.
     * @returns {Promise<object>} A promise that resolves to an object of the shape `{permission: '...'}`.
     */
    async getViewerPermission() {
        if (!this.viewerPermission) {
            // This can happen if the initial fetch on startup failed.
            // We will try to fetch it again on demand.
            logger.warn('Viewer permission not cached, attempting to fetch now...');
            await this.fetchAndCacheViewerPermission();
        }

        return {permission: this.viewerPermission};
    }
}

export default Neo.setupClass(RepositoryService);
