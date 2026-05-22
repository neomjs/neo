import Base from "../../../../../src/core/Base.mjs";
class IssueService extends Base {
    static config = {
        className: "Neo.ai.mcp.server.gitlab-workflow.services.IssueService",
        singleton: true
    };
}
export default Neo.setupClass(IssueService);
