import path from 'path';
import { fileURLToPath } from 'url';
import HealthService from './HealthService.mjs';
import IssueService from './IssueService.mjs';
import LabelService from './LabelService.mjs';
import * as pullRequestService from './pullRequestService.mjs';
import { initialize, listTools, callTool } from '../../toolService.mjs';

const __filename      = fileURLToPath(import.meta.url);
const __dirname       = path.dirname(__filename);
const openApiFilePath = path.join(__dirname, '../openapi.yaml');

const serviceMapping = {
    add_labels           : IssueService.addLabels,
    checkout_pull_request: pullRequestService.checkoutPullRequest,
    create_comment       : pullRequestService.createComment,
    get_conversation     : pullRequestService.getConversation,
    get_pull_request_diff: pullRequestService.getPullRequestDiff,
    healthcheck          : HealthService.healthcheck,
    list_labels          : LabelService.listLabels,
    list_pull_requests   : pullRequestService.listPullRequests,
    remove_labels        : IssueService.removeLabels
};

initialize(serviceMapping, openApiFilePath);

export {
    listTools,
    callTool
};
