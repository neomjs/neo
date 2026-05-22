import path               from "path";
import {fileURLToPath}    from "url";
import HealthService      from "./HealthService.mjs";
import IssueService       from "./IssueService.mjs";
import LocalFileService   from "./LocalFileService.mjs";
import MergeRequestService from "./MergeRequestService.mjs";
import ToolService        from "../../../ToolService.mjs";

const __filename      = fileURLToPath(import.meta.url);
const __dirname       = path.dirname(__filename);
const openApiFilePath = path.join(__dirname, "../openapi.yaml");

const serviceMapping = {
    get_local_issue_by_id    : LocalFileService  .getIssueById           .bind(LocalFileService),
    healthcheck              : HealthService     .healthcheck            .bind(HealthService),
    list_merge_requests      : MergeRequestService.listMergeRequests     .bind(MergeRequestService),
    list_issues              : IssueService      .listIssues             .bind(IssueService),
    create_issue             : IssueService      .createIssue            .bind(IssueService),
    manage_issue_assignees   : IssueService      .manageIssueAssignees   .bind(IssueService),
    manage_issue_comment     : IssueService      .manageIssueComment     .bind(IssueService),
    manage_issue_labels      : IssueService      .manageIssueLabels      .bind(IssueService)
};

const toolService = Neo.create(ToolService, {
    openApiFilePath,
    serviceMapping
});

const callTool  = toolService.callTool .bind(toolService);
const listTools = toolService.listTools.bind(toolService);

export {callTool, listTools};
