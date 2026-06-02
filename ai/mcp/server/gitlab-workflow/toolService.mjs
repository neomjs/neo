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
 * @summary GitLab Workflow scaffold tool registry.
 *
 * The operation IDs intentionally match the initial GitHub Workflow-compatible
 * surface. Service implementations return scaffold responses until the GitLab
 * client and syncer replace them with real GitLab API behavior.
 */
const serviceMapping = {
    create_issue             : IssueService       .createIssue          .bind(IssueService),
    get_local_issue_by_id    : LocalFileService   .getIssueById         .bind(LocalFileService),
    healthcheck              : HealthService      .healthcheck          .bind(HealthService),
    list_issues              : IssueService       .listIssues           .bind(IssueService),
    list_merge_requests      : MergeRequestService.listMergeRequests    .bind(MergeRequestService),
    manage_issue_assignees   : IssueService       .manageIssueAssignees .bind(IssueService),
    manage_issue_comment     : IssueService       .manageIssueComment   .bind(IssueService),
    manage_issue_labels      : IssueService       .manageIssueLabels    .bind(IssueService)
};

const toolService = Neo.create(ToolService, {
    openApiFilePath,
    serviceMapping
});

const callTool  = toolService.callTool .bind(toolService);
const listTools = toolService.listTools.bind(toolService);

export {callTool, listTools};
