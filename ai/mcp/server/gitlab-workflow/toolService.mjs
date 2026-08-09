import path                from 'path';
import {fileURLToPath}     from 'url';
import HealthService       from '../../../services/gitlab-workflow/HealthService.mjs';
import IssueService        from '../../../services/gitlab-workflow/IssueService.mjs';
import LocalFileService    from '../../../services/gitlab-workflow/LocalFileService.mjs';
import MergeRequestService from '../../../services/gitlab-workflow/MergeRequestService.mjs';
import ToolService         from '../../ToolService.mjs';

const __filename      = fileURLToPath(import.meta.url);
const __dirname       = path.dirname(__filename);
const openApiFilePath = path.join(__dirname, 'openapi.yaml');

/**
 * @summary GitLab Workflow tool registry.
 *
 * The operation IDs intentionally match the GitHub Workflow-compatible surface. The issue and
 * merge-request operations call the real GitLab GraphQL API via the shared `GitLabClient`; the
 * local-file syncer surface remains scaffold-level pending its subtask.
 */
const serviceMapping = {
    create_issue          : IssueService       .createIssue                .bind(IssueService),
    get_local_issue_by_id : LocalFileService   .getIssueById               .bind(LocalFileService),
    get_mcp_tool_handbook : toolId => toolService.getToolHandbook(toolId),
    get_merge_request     : MergeRequestService.getMergeRequest            .bind(MergeRequestService),
    healthcheck           : HealthService      .healthcheck                .bind(HealthService),
    list_issues           : IssueService       .listIssues                 .bind(IssueService),
    list_merge_requests   : MergeRequestService.listMergeRequests          .bind(MergeRequestService),
    manage_issue_assignees: IssueService       .manageIssueAssignees       .bind(IssueService),
    manage_issue_comment  : IssueService       .manageIssueComment         .bind(IssueService),
    manage_issue_labels   : IssueService       .manageIssueLabels          .bind(IssueService),
    manage_mr_assignees   : MergeRequestService.manageMergeRequestAssignees.bind(MergeRequestService),
    manage_mr_comment     : MergeRequestService.manageMergeRequestComment  .bind(MergeRequestService),
    manage_mr_labels      : MergeRequestService.manageMergeRequestLabels   .bind(MergeRequestService),
    manage_mr_reviewers   : MergeRequestService.manageMergeRequestReviewers.bind(MergeRequestService)
};

const toolService = Neo.create(ToolService, {
    compactToolDescriptions     : true,
    compactToolSchemas          : true,
    openApiFilePath,
    serviceMapping,
    toolListDescriptionMaxLength: 120
});

const callTool  = toolService.callTool .bind(toolService);
const listTools = toolService.listTools.bind(toolService);

export {callTool, listTools};
