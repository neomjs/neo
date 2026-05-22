import Base from "../../../../../src/core/Base.mjs";
class HealthService extends Base {
    static config = {
        className: "Neo.ai.mcp.server.gitlab-workflow.services.HealthService",
        singleton: true
    };
    async healthcheck() { return { status: "healthy" }; }
    async ensureHealthy() { return true; }
}
export default Neo.setupClass(HealthService);
