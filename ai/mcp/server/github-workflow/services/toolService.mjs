import path from 'path';
import { fileURLToPath } from 'url';
import HealthService from './HealthService.mjs';
import * as issueService from './issueService.mjs';
import * as labelService from './labelService.mjs';
import * as pullRequestService from './pullRequestService.mjs';
import { initialize, listTools, callTool } from '../../toolService.mjs';

const __filename      = fileURLToPath(import.meta.url);
const __dirname       = path.dirname(__filename);
const openApiFilePath = path.join(__dirname, '../openapi.yaml');

const serviceMapping = {
    add_labels           : issueService.addLabels,
    checkout_pull_request: pullRequestService.checkoutPullRequest,
    create_comment       : pullRequestService.createComment,
    get_conversation     : pullRequestService.getConversation,
    get_pull_request_diff: pullRequestService.getPullRequestDiff,
    healthcheck          : HealthService.healthcheck,
    list_labels          : labelService.listLabels,
    list_pull_requests   : pullRequestService.listPullRequests,
    remove_labels        : issueService.removeLabels
};

initialize(serviceMapping, openApiFilePath);

export {
    listTools,
    callTool
};
