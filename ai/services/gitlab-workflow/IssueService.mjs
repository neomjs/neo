import Base from '../../../src/core/Base.mjs';

class IssueService extends Base {
    static config = {
        className: 'Neo.ai.services.gitlab-workflow.IssueService',
        singleton: true
    }

    async getIssue(options) {
        return { id: options?.id || 1, title: 'Stubbed Issue' };
    }
}

export default Neo.setupClass(IssueService);
