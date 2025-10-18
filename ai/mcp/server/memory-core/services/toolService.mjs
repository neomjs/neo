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
    healthcheck         : HealthService.buildHealthResponse,
    add_memory          : MemoryService.addMemory,
    get_session_memories: MemoryService.listMemories,
    query_raw_memories  : MemoryService.queryMemories,
    get_all_summaries   : SummaryService.listSummaries,
    delete_all_summaries: SummaryService.deleteAllSummaries,
    query_summaries     : SummaryService.querySummaries,
    summarize_sessions  : SessionService.summarizeSessions,
    export_database     : DatabaseService.exportDatabase,
    import_database     : DatabaseService.importDatabase,
    start_database      : DatabaseLifecycleService.startDatabase,
    stop_database       : DatabaseLifecycleService.stopDatabase
};

initialize(serviceMapping, openApiFilePath);

export {
    listTools,
    callTool
};
