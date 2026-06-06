import path                    from 'path';
import {fileURLToPath}         from 'url';
import ToolService             from '../../ToolService.mjs';
import GraphService            from '../../../services/memory-core/GraphService.mjs';
import HealthService           from '../../../services/memory-core/HealthService.mjs';
import MemoryService           from '../../../services/memory-core/MemoryService.mjs';
import SessionService          from '../../../services/memory-core/SessionService.mjs';
import SummaryService          from '../../../services/memory-core/SummaryService.mjs';
import MailboxService          from '../../../services/memory-core/MailboxService.mjs';
import PermissionService       from '../../../services/memory-core/PermissionService.mjs';
import WakeSubscriptionService from '../../../services/memory-core/WakeSubscriptionService.mjs';

const __filename      = fileURLToPath(import.meta.url);
const __dirname       = path.dirname(__filename);
const openApiFilePath = path.join(__dirname, 'openapi.yaml');

const serviceMapping = {
    add_memory              : MemoryService          .addMemory               .bind(MemoryService),
    delete_all_summaries    : SummaryService         .deleteAllSummaries      .bind(SummaryService),
    get_all_summaries       : SummaryService         .listSummaries           .bind(SummaryService),
    get_context_frontier    : MemoryService          .getContextFrontier      .bind(MemoryService),
    get_neighbors           : GraphService           .getNeighbors            .bind(GraphService),
    get_node                : GraphService           .getNode                 .bind(GraphService),
    get_session_memories    : MemoryService          .listMemories            .bind(MemoryService),
    healthcheck             : HealthService          .healthcheck             .bind(HealthService),
    mutate_frontier         : MemoryService          .mutateFrontier          .bind(MemoryService),
    pre_brief_session       : MemoryService          .preBriefSession         .bind(MemoryService),
    query_hybrid_graph      : GraphService           .queryNodeTopology       .bind(GraphService),
    query_raw_memories      : MemoryService          .queryMemories           .bind(MemoryService),
    query_summaries         : SummaryService         .querySummaries          .bind(SummaryService),
    search_nodes            : GraphService           .searchNodes             .bind(GraphService),
    add_message             : MailboxService         .addMessage              .bind(MailboxService),
    list_messages           : MailboxService         .listMessages            .bind(MailboxService),
    get_message             : MailboxService         .getMessage              .bind(MailboxService),
    get_rem_pipeline_state  : HealthService          .getRemPipelineState     .bind(HealthService),
    mark_read               : MailboxService         .markRead                .bind(MailboxService),
    archive_message         : MailboxService         .archiveMessage          .bind(MailboxService),
    delete_message          : MailboxService         .deleteMessage           .bind(MailboxService),
    transition_task         : MailboxService         .transitionTask          .bind(MailboxService),
    grant_permission        : PermissionService      .grantPermission         .bind(PermissionService),
    revoke_permission       : PermissionService      .revokePermission        .bind(PermissionService),
    list_permissions        : PermissionService      .listPermissions         .bind(PermissionService),
    manage_wake_subscription: WakeSubscriptionService.manage                  .bind(WakeSubscriptionService),
    purge_session           : SessionService         .purgeSession            .bind(SessionService),
    resume_session          : SessionService         .validateSessionForResume.bind(SessionService),
    set_session_id          : SessionService         .setSessionId            .bind(SessionService)
};

const toolService = Neo.create(ToolService, {
    openApiFilePath,
    serviceMapping
});

const callTool  = toolService.callTool .bind(toolService);
const listTools = toolService.listTools.bind(toolService);

export {callTool, listTools};
