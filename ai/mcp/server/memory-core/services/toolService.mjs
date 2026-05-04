import path                     from 'path';
import {fileURLToPath}          from 'url';
import ToolService              from '../../../ToolService.mjs';
import DatabaseService          from './DatabaseService.mjs';
import ChromaLifecycleService   from './lifecycle/ChromaLifecycleService.mjs';
import GraphService             from './GraphService.mjs';
import HealthService            from './HealthService.mjs';
import MemoryService            from './MemoryService.mjs';
import SessionService           from './SessionService.mjs';
import SummaryService           from './SummaryService.mjs';
import MailboxService           from './MailboxService.mjs';
import PermissionService        from './PermissionService.mjs';
import WakeSubscriptionService  from './WakeSubscriptionService.mjs';

const __filename      = fileURLToPath(import.meta.url);
const __dirname       = path.dirname(__filename);
const openApiFilePath = path.join(__dirname, '../openapi.yaml');

const serviceMapping = {
    add_memory            : MemoryService           .addMemory           .bind(MemoryService),
    delete_all_summaries  : SummaryService          .deleteAllSummaries  .bind(SummaryService),
    get_all_summaries     : SummaryService          .listSummaries       .bind(SummaryService),
    get_context_frontier  : MemoryService           .getContextFrontier  .bind(MemoryService),
    get_neighbors         : GraphService            .getNeighbors        .bind(GraphService),
    get_node              : GraphService            .getNode             .bind(GraphService),
    get_session_memories  : MemoryService           .listMemories        .bind(MemoryService),
    healthcheck           : HealthService           .healthcheck         .bind(HealthService),
    manage_database       : ChromaLifecycleService  .manageDatabase      .bind(ChromaLifecycleService),
    mutate_frontier       : MemoryService           .mutateFrontier      .bind(MemoryService),
    pre_brief_session     : MemoryService           .preBriefSession     .bind(MemoryService),
    query_hybrid_graph    : GraphService            .queryNodeTopology   .bind(GraphService),
    query_raw_memories    : MemoryService           .queryMemories       .bind(MemoryService),
    query_summaries       : SummaryService          .querySummaries      .bind(SummaryService),
    search_nodes          : GraphService            .searchNodes         .bind(GraphService),
    summarize_sessions    : SessionService          .summarizeSessions   .bind(SessionService),
    add_message           : MailboxService          .addMessage          .bind(MailboxService),
    list_messages         : MailboxService          .listMessages        .bind(MailboxService),
    get_message           : MailboxService          .getMessage          .bind(MailboxService),
    mark_read             : MailboxService          .markRead            .bind(MailboxService),
    transition_task       : MailboxService          .transitionTask      .bind(MailboxService),
    grant_permission      : PermissionService       .grantPermission     .bind(PermissionService),
    revoke_permission     : PermissionService       .revokePermission    .bind(PermissionService),
    list_permissions      : PermissionService       .listPermissions     .bind(PermissionService),
    manage_wake_subscription: WakeSubscriptionService.manage              .bind(WakeSubscriptionService),
    set_session_id        : SessionService          .setSessionId        .bind(SessionService),
    purge_session         : SessionService          .purgeSession        .bind(SessionService)
};

const toolService = Neo.create(ToolService, {
    openApiFilePath,
    serviceMapping
});

const callTool  = toolService.callTool .bind(toolService);
const listTools = toolService.listTools.bind(toolService);

export {callTool, listTools};
