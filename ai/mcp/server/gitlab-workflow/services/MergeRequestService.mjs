import Base from "../../../../../src/core/Base.mjs";
class MergeRequestService extends Base {
    static config = {
        className: "Neo.ai.mcp.server.gitlab-workflow.services.MergeRequestService",
        singleton: true
    };
}
export default Neo.setupClass(MergeRequestService);
