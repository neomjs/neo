import Base from '../../../src/core/Base.mjs';

/**
 * @summary Scaffold local-file service for GitLab issue markdown.
 *
 * The initial #11768 lane registers `get_local_issue_by_id` so clients can learn
 * the future local-cache contract. The syncer subtask owns real
 * `resources/content/gitlab/...` file IO.
 *
 * @class Neo.ai.services.gitlab-workflow.LocalFileService
 * @extends Neo.core.Base
 * @singleton
 */
class LocalFileService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.services.gitlab-workflow.LocalFileService'
         * @protected
         */
        className: 'Neo.ai.services.gitlab-workflow.LocalFileService',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * @summary Retrieves a GitLab issue markdown file once the syncer subtask lands.
     * @param {Object} options
     * @returns {Promise<Object>}
     */
    async getIssueById(options) {
        return {
            status : 'scaffolded',
            tool   : 'get_local_issue_by_id',
            message: 'GitLab local issue cache is registered; real file IO lands with the syncer subtask.',
            received: options
        };
    }
}

export default Neo.setupClass(LocalFileService);
