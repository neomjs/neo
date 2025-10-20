import path                              from 'path';
import {fileURLToPath}                   from 'url';
import HealthService                     from './HealthService.mjs';
import IssueService                      from './IssueService.mjs';
import LabelService                      from './LabelService.mjs';
import PullRequestService                from './PullRequestService.mjs';
import SyncService                       from './SyncService.mjs';
import {initialize, listTools, callTool} from '../../toolService.mjs';

const __filename      = fileURLToPath(import.meta.url);
const __dirname       = path.dirname(__filename);
const openApiFilePath = path.join(__dirname, '../openapi.yaml');

const serviceMapping = {
    add_labels           : IssueService.addLabels,
    checkout_pull_request: PullRequestService.checkoutPullRequest,
    create_comment       : PullRequestService.createComment,
    get_conversation     : PullRequestService.getConversation,
    get_pull_request_diff: PullRequestService.getPullRequestDiff,
    healthcheck          : HealthService.healthcheck,
    list_labels          : LabelService.listLabels,
    list_pull_requests   : PullRequestService.listPullRequests,
    remove_labels        : IssueService.removeLabels,
    sync_issues          : SyncService.runFullSync
};

initialize(serviceMapping, openApiFilePath);

export {
    listTools,
    callTool
};
