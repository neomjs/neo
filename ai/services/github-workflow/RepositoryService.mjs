import aiConfig                from '../../mcp/server/github-workflow/config.mjs';
import Base                    from '../../../src/core/Base.mjs';
import GraphqlService          from './GraphqlService.mjs';
import logger                  from '../../mcp/server/github-workflow/logger.mjs';
import {GET_VIEWER_PERMISSION} from './queries/repositoryQueries.mjs';

/**
 * @summary Service for interacting with the GitHub repository itself.
 *
 * This service is responsible for repository-level checks and configurations.
 * Its primary role is to fetch and cache the current user's viewer permissions
 * (e.g., ADMIN, WRITE, READ), which are used by other services to gate
 * privileged operations like assigning issues.
 *
 * @class Neo.ai.services.github-workflow.RepositoryService
 * @extends Neo.core.Base
 * @singleton
 */
class RepositoryService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.services.github-workflow.RepositoryService'
         * @protected
         */
        className: 'Neo.ai.services.github-workflow.RepositoryService',
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
     * The authenticated user's GitHub login, cached alongside the permission it was fetched with.
     *
     * The permission answers "may this seat act?"; the login answers "which seat is acting?" — and a
     * per-family review budget needs the second question answered before it can charge a round to
     * anyone. The two are cached together because they come from the same authenticated call: asking
     * separately would invite them to disagree about who the viewer is.
     *
     * Deliberately the login rather than anything parsed from a review body. The submitting identity
     * IS the act; a signature in prose is a claim about it, and the two can differ.
     * @member {String|null} viewerLogin=null
     */
    viewerLogin = null;

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
            // Null rather than undefined on a payload without it, so a consumer can tell "the viewer
            // has no login" from "nobody has asked yet" — a budget that cannot identify its spender
            // must refuse, and it can only refuse if the two states are distinguishable.
            this.viewerLogin      = data.viewer?.login ?? null;
            logger.info(`Fetched and cached viewer permission: ${this.viewerPermission} (${this.viewerLogin || 'unknown login'})`);
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

    /**
     * @summary Returns the authenticated user's login, fetching it if the startup cache is cold.
     *
     * Shares `fetchAndCacheViewerPermission`'s single authenticated call rather than adding a second
     * round trip, because the permission and the identity must describe the same viewer.
     * @returns {Promise<String|null>} The login, or `null` when it cannot be resolved.
     */
    async getViewerLogin() {
        if (!this.viewerLogin) {
            await this.fetchAndCacheViewerPermission();
        }

        return this.viewerLogin
    }
}

export default Neo.setupClass(RepositoryService);
