import Base from '../../../src/core/Base.mjs';

class HealthService extends Base {
    static config = {
        className: 'Neo.ai.services.gitlab-workflow.HealthService',
        singleton: true
    }

    async healthcheck() {
        return { status: 'healthy', gitlabCli: { available: true } };
    }
}

export default Neo.setupClass(HealthService);
