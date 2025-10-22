import path                              from 'path';
import {fileURLToPath}                   from 'url';
import {initialize, listTools, callTool} from '../../toolService.mjs';
import DatabaseService                   from './DatabaseService.mjs';
import DatabaseLifecycleService          from './DatabaseLifecycleService.mjs';
import HealthService                     from './HealthService.mjs';
import MemoryService                     from './MemoryService.mjs';
import SessionService                    from './SessionService.mjs';
import SummaryService                    from './SummaryService.mjs';

const __filename      = fileURLToPath(import.meta.url);
const __dirname       = path.dirname(__filename);
const openApiFilePath = path.join(__dirname, '../openapi.yaml');

const serviceMapping = {
    healthcheck         : HealthService.buildHealthResponse.bind(HealthService),
    add_memory          : MemoryService.addMemory.bind(MemoryService),
    get_session_memories: MemoryService.listMemories.bind(MemoryService),
    query_raw_memories  : MemoryService.queryMemories.bind(MemoryService),
    get_all_summaries   : SummaryService.listSummaries.bind(SummaryService),
    delete_all_summaries: SummaryService.deleteAllSummaries.bind(SummaryService),
    query_summaries     : SummaryService.querySummaries.bind(SummaryService),
    summarize_sessions  : SessionService.summarizeSessions.bind(SessionService),
    export_database     : DatabaseService.exportDatabase.bind(DatabaseService),
    import_database     : DatabaseService.importDatabase.bind(DatabaseService),
    start_database      : DatabaseLifecycleService.startDatabase.bind(DatabaseLifecycleService),
    stop_database       : DatabaseLifecycleService.stopDatabase.bind(DatabaseLifecycleService)
};

initialize(serviceMapping, openApiFilePath);

export {
    listTools,
    callTool
};
