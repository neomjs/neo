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
     * Resolved visibility of the configured repository: `'private'`, `'public'`, or `'unknown'`.
     *
     * `unknown` is a real, persistent state rather than a startup placeholder. The fetch below can
     * fail structurally — a token without repository-metadata scope, a deployment where the query is
     * unauthorized — in which case it never resolves. Consumers must therefore treat it explicitly
     * instead of defaulting it, and the confidentiality scan resolves it toward *scanning*: a
     * needless scan on a private repo costs an author a redaction, while a skipped scan on a public
     * one is the exposure the scan exists to prevent.
     * @member {String} repositoryVisibility='unknown'
     */
    repositoryVisibility = 'unknown';

    /**
     * Fetches the current user's permission level from the API and caches it.
     * This method is intended for internal use at startup but can be called on demand.
     *
     * Also caches repository visibility, which rides the SAME query: `repository` was already the
     * selection root, so `isPrivate` costs one field on a call that already happens once at boot,
     * not a lookup per write.
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

            // Only a definite boolean resolves visibility. A missing or non-boolean field leaves it
            // `unknown`, which the confidentiality boundary handles as fail-toward-scanning — reading
            // an absent field as `public` would be right by accident, and as `private` would be the
            // permissive default that makes a guard stop guarding.
            if (typeof data.repository.isPrivate === 'boolean') {
                this.repositoryVisibility = data.repository.isPrivate ? 'private' : 'public';
            }

            logger.info(`Fetched and cached viewer permission: ${this.viewerPermission}`);
            return this.viewerPermission;
        } catch (error) {
            logger.error('Error fetching viewer permission via GraphQL:', error);
            return null;
        }
    }

    /**
     * @summary Returns the cached repository visibility, never throwing and never guessing.
     * @returns {String} `'private'`, `'public'`, or `'unknown'`.
     */
    getRepositoryVisibility() {
        return this.repositoryVisibility
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
