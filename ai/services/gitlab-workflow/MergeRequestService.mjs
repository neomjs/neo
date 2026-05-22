import Base from '../../../src/core/Base.mjs';

class MergeRequestService extends Base {
    static config = {
        className: 'Neo.ai.services.gitlab-workflow.MergeRequestService',
        singleton: true
    }

    async getMergeRequest(options) {
        return { id: options?.id || 1, title: 'Stubbed MR' };
    }
}

export default Neo.setupClass(MergeRequestService);
