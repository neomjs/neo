import aiConfig                from '../../mcp/server/github-workflow/config.mjs';
import Base                    from '../../../src/core/Base.mjs';
import GraphqlService          from './GraphqlService.mjs';
import logger                  from '../../mcp/server/github-workflow/logger.mjs';
import {GET_VIEWER_PERMISSION} from './queries/repositoryQueries.mjs';
import {resolveRepositoryTarget} from './shared/repositoryTarget.mjs';

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
     * Repository-qualified permission cache. A permission read for `neomjs/neo` must never authorize
     * a mutation in `neomjs/devindex`; the key is the selected `owner/name`, not process identity.
     * `viewerPermission` above remains the backward-compatible home-repository projection.
     * @member {Map<String,String>}
     */
    viewerPermissions = new Map();

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
     * @param {Object} [options]
     * @param {String} [options.repo] Optional bare name or owner/name repository target.
     * @returns {Promise<string|Object|null>} The permission string, typed target refusal, or null on I/O failure.
     */
    async fetchAndCacheViewerPermission({repo, repositoryTarget} = {}) {
        const target = repositoryTarget || resolveRepositoryTarget(repo, {owner: aiConfig.owner, repo: aiConfig.repo});

        if (target.error) return target;

        const variables = {
            owner: target.owner,
            repo : target.repo
        };

        try {
            const data       = await GraphqlService.query(GET_VIEWER_PERMISSION, variables),
                  permission = data.repository.viewerPermission,
                  home       = resolveRepositoryTarget(undefined, {owner: aiConfig.owner, repo: aiConfig.repo});

            this.viewerPermissions.set(target.fullName, permission);

            if (target.fullName === home.fullName) {
                this.viewerPermission = permission;
            }

            // Null rather than undefined on a payload without it, so a consumer can tell "the viewer
            // has no login" from "nobody has asked yet" — a budget that cannot identify its spender
            // must refuse, and it can only refuse if the two states are distinguishable.
            this.viewerLogin      = data.viewer?.login ?? null;
            logger.info(`Fetched and cached viewer permission for ${target.fullName}: ${permission} (${this.viewerLogin || 'unknown login'})`);
            return permission;
        } catch (error) {
            logger.error(`Error fetching viewer permission for ${target.fullName} via GraphQL:`, error);
            return null;
        }
    }

    /**
     * Returns the cached permission level of the current user, wrapped in an object.
     * @param {Object} [options]
     * @param {String} [options.repo] Optional bare name or owner/name repository target.
     * @param {Object} [options.repositoryTarget] Already-resolved internal request target.
     * @returns {Promise<object>} `{permission: '...'}` or a typed repository-target refusal.
     */
    async getViewerPermission({repo} = {}) {
        const target = resolveRepositoryTarget(repo, {owner: aiConfig.owner, repo: aiConfig.repo});

        if (target.error) return target;

        const home       = resolveRepositoryTarget(undefined, {owner: aiConfig.owner, repo: aiConfig.repo});
        let   permission = this.viewerPermissions.get(target.fullName);

        if (!permission && target.fullName === home.fullName) {
            permission = this.viewerPermission;
        }

        if (!permission) {
            // This can happen if the initial fetch on startup failed.
            // We will try to fetch it again on demand.
            logger.warn(`Viewer permission for ${target.fullName} not cached, attempting to fetch now...`);
            const fetched = await this.fetchAndCacheViewerPermission({repositoryTarget: target});

            if (fetched?.error) return fetched;

            permission = fetched;
        }

        return {permission};
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
