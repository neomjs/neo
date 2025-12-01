import path                     from 'path';
import {fileURLToPath}          from 'url';
import ToolService              from '../../../ToolService.mjs';
import DatabaseService          from './DatabaseService.mjs';
import DatabaseLifecycleService from './DatabaseLifecycleService.mjs';
import HealthService            from './HealthService.mjs';
import MemoryService            from './MemoryService.mjs';
import SessionService           from './SessionService.mjs';
import SummaryService           from './SummaryService.mjs';

const __filename      = fileURLToPath(import.meta.url);
const __dirname       = path.dirname(__filename);
const openApiFilePath = path.join(__dirname, '../openapi.yaml');

const serviceMapping = {
    add_memory          : MemoryService           .addMemory          .bind(MemoryService),
    delete_all_summaries: SummaryService          .deleteAllSummaries .bind(SummaryService),
    export_database     : DatabaseService         .exportDatabase     .bind(DatabaseService),
    get_all_summaries   : SummaryService          .listSummaries      .bind(SummaryService),
    get_session_memories: MemoryService           .listMemories       .bind(MemoryService),
    healthcheck         : HealthService           .healthcheck        .bind(HealthService),
    import_database     : DatabaseService         .importDatabase     .bind(DatabaseService),
    query_raw_memories  : MemoryService           .queryMemories      .bind(MemoryService),
    query_summaries     : SummaryService          .querySummaries     .bind(SummaryService),
    start_database      : DatabaseLifecycleService.startDatabase      .bind(DatabaseLifecycleService),
    stop_database       : DatabaseLifecycleService.stopDatabase       .bind(DatabaseLifecycleService),
    summarize_sessions  : SessionService          .summarizeSessions  .bind(SessionService)
};

const toolService = Neo.create(ToolService, {
    openApiFilePath,
    serviceMapping
});

const callTool  = toolService.callTool .bind(toolService);
const listTools = toolService.listTools.bind(toolService);

export {callTool, listTools};
