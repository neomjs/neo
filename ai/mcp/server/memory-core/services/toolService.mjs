import path                     from 'path';
import {fileURLToPath}          from 'url';
import ToolService              from '../../../ToolService.mjs';
import DatabaseService          from './DatabaseService.mjs';
import DatabaseLifecycleService from './DatabaseLifecycleService.mjs';
import GraphService             from './GraphService.mjs';
import HealthService            from './HealthService.mjs';
import MemoryService            from './MemoryService.mjs';
import SessionService           from './SessionService.mjs';
import SummaryService           from './SummaryService.mjs';

const __filename      = fileURLToPath(import.meta.url);
const __dirname       = path.dirname(__filename);
const openApiFilePath = path.join(__dirname, '../openapi.yaml');

const serviceMapping = {
    add_memory            : MemoryService           .addMemory           .bind(MemoryService),
    delete_all_summaries  : SummaryService          .deleteAllSummaries  .bind(SummaryService),
    get_all_summaries     : SummaryService          .listSummaries       .bind(SummaryService),
    get_neighbors         : GraphService            .getNeighbors        .bind(GraphService),
    get_node              : GraphService            .getNode             .bind(GraphService),
    get_session_memories  : MemoryService           .listMemories        .bind(MemoryService),
    healthcheck           : HealthService           .healthcheck         .bind(HealthService),
    manage_database       : DatabaseLifecycleService.manageDatabase      .bind(DatabaseLifecycleService),
    manage_database_backup: DatabaseService         .manageDatabaseBackup.bind(DatabaseService),
    query_raw_memories    : MemoryService           .queryMemories       .bind(MemoryService),
    query_summaries       : SummaryService          .querySummaries      .bind(SummaryService),
    search_nodes          : GraphService            .searchNodes         .bind(GraphService),
    summarize_sessions    : SessionService          .summarizeSessions   .bind(SessionService)
};

const toolService = Neo.create(ToolService, {
    openApiFilePath,
    serviceMapping
});

const callTool  = toolService.callTool .bind(toolService);
const listTools = toolService.listTools.bind(toolService);

export {callTool, listTools};
