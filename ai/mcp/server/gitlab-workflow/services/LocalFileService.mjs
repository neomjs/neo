import Base from "../../../../../src/core/Base.mjs";
class LocalFileService extends Base {
    static config = {
        className: "Neo.ai.mcp.server.gitlab-workflow.services.LocalFileService",
        singleton: true
    };
}
export default Neo.setupClass(LocalFileService);
