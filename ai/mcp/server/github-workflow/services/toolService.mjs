import path                              from 'path';
import {fileURLToPath}                   from 'url';
import {initialize, listTools, callTool} from '../../toolService.mjs';
import HealthService                     from './HealthService.mjs';
import IssueService                      from './IssueService.mjs';
import LabelService                      from './LabelService.mjs';
import LocalFileService                  from './LocalFileService.mjs';
import PullRequestService                from './PullRequestService.mjs';
import RepositoryService                 from './RepositoryService.mjs';
import SyncService                       from './SyncService.mjs';

const __filename      = fileURLToPath(import.meta.url);
const __dirname       = path.dirname(__filename);
const openApiFilePath = path.join(__dirname, '../openapi.yaml');

const serviceMapping = {
    add_labels               : IssueService      .addLabels              .bind(IssueService),
    assign_issue             : IssueService      .assignIssue            .bind(IssueService),
    checkout_pull_request    : PullRequestService.checkoutPullRequest    .bind(PullRequestService),
    create_comment           : PullRequestService.createComment          .bind(PullRequestService),
    create_issue             : IssueService      .createIssue            .bind(IssueService),
    get_conversation         : PullRequestService.getConversation        .bind(PullRequestService),
    get_local_issue_by_id    : LocalFileService  .getIssueById           .bind(LocalFileService),
    get_pull_request_diff    : PullRequestService.getPullRequestDiff     .bind(PullRequestService),
    get_viewer_permission    : RepositoryService .getViewerPermission    .bind(RepositoryService),
    healthcheck              : HealthService     .healthcheck            .bind(HealthService),
    list_labels              : LabelService      .listLabels             .bind(LabelService),
    list_pull_requests       : PullRequestService.listPullRequests       .bind(PullRequestService),
    list_issues              : IssueService      .listIssues             .bind(IssueService),
    remove_labels            : IssueService      .removeLabels           .bind(IssueService),
    sync_all                 : SyncService       .runFullSync            .bind(SyncService),
    unassign_issue           : IssueService      .unassignIssue          .bind(IssueService),
    update_issue_relationship: IssueService      .updateIssueRelationship.bind(IssueService)
};

initialize(serviceMapping, openApiFilePath);

export {callTool, listTools};
