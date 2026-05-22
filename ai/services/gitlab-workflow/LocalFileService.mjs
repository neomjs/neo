import Base from '../../../src/core/Base.mjs';

class LocalFileService extends Base {
    static config = {
        className: 'Neo.ai.services.gitlab-workflow.LocalFileService',
        singleton: true
    }

    async getLocalFile(options) {
        return { path: options?.path || '', content: 'Stubbed File Content' };
    }
}

export default Neo.setupClass(LocalFileService);
