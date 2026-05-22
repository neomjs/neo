import path               from 'path';
import {fileURLToPath}    from 'url';
import HealthService      from '../../../services/gitlab-workflow/HealthService.mjs';
import IssueService       from '../../../services/gitlab-workflow/IssueService.mjs';
import MergeRequestService from '../../../services/gitlab-workflow/MergeRequestService.mjs';
import LocalFileService   from '../../../services/gitlab-workflow/LocalFileService.mjs';
import ToolService        from '../../ToolService.mjs';

const __filename      = fileURLToPath(import.meta.url);
const __dirname       = path.dirname(__filename);
const openApiFilePath = path.join(__dirname, 'openapi.yaml');

const serviceMapping = {
    healthcheck          : HealthService.healthcheck.bind(HealthService),
    get_issue            : IssueService.getIssue.bind(IssueService),
    get_merge_request    : MergeRequestService.getMergeRequest.bind(MergeRequestService),
    get_local_file       : LocalFileService.getLocalFile.bind(LocalFileService)
};

const toolService = Neo.create(ToolService, {
    openApiFilePath,
    serviceMapping
});

const callTool  = toolService.callTool .bind(toolService);
const listTools = toolService.listTools.bind(toolService);

export {callTool, listTools};
