import path               from 'path';
import {fileURLToPath}    from 'url';
import HealthService      from './HealthService.mjs';
import IssueService       from './IssueService.mjs';
import LabelService       from './LabelService.mjs';
import LocalFileService   from './LocalFileService.mjs';
import PullRequestService from './PullRequestService.mjs';
import RepositoryService  from './RepositoryService.mjs';
import ToolService        from '../../../ToolService.mjs';
import SyncService        from './SyncService.mjs';

const __filename      = fileURLToPath(import.meta.url);
const __dirname       = path.dirname(__filename);
const openApiFilePath = path.join(__dirname, '../openapi.yaml');

const serviceMapping = {
    checkout_pull_request    : PullRequestService.checkoutPullRequest    .bind(PullRequestService),
    create_issue             : IssueService      .createIssue            .bind(IssueService),
    get_conversation         : PullRequestService.getConversation        .bind(PullRequestService),
    get_local_issue_by_id    : LocalFileService  .getIssueById           .bind(LocalFileService),
    get_pull_request_diff    : PullRequestService.getPullRequestDiff     .bind(PullRequestService),
    get_viewer_permission    : RepositoryService .getViewerPermission    .bind(RepositoryService),
    healthcheck              : HealthService     .healthcheck            .bind(HealthService),
    list_labels              : LabelService      .listLabels             .bind(LabelService),
    list_pull_requests       : PullRequestService.listPullRequests       .bind(PullRequestService),
    list_issues              : IssueService      .listIssues             .bind(IssueService),
    manage_issue_assignees   : IssueService      .manageIssueAssignees   .bind(IssueService),
    manage_issue_comment     : IssueService      .manageIssueComment     .bind(IssueService),
    manage_issue_labels      : IssueService      .manageIssueLabels      .bind(IssueService),
    sync_all                 : SyncService       .runFullSync            .bind(SyncService),
    update_issue_relationship: IssueService      .updateIssueRelationship.bind(IssueService)
};

const toolService = Neo.create(ToolService, {
    openApiFilePath,
    serviceMapping
});

const callTool  = toolService.callTool .bind(toolService);
const listTools = toolService.listTools.bind(toolService);

export {callTool, listTools};
