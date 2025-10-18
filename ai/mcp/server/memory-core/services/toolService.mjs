import path from 'path';
import { fileURLToPath } from 'url';
import { initialize, listTools, callTool } from '../../toolService.mjs';
import DatabaseService from './DatabaseService.mjs';
import HealthService from './HealthService.mjs';
import MemoryService from './MemoryService.mjs';
import * as sessionService from './sessionService.mjs';
import * as summaryService from './summaryService.mjs';
import DatabaseLifecycleService from './DatabaseLifecycleService.mjs';

const __filename      = fileURLToPath(import.meta.url);
const __dirname       = path.dirname(__filename);
const openApiFilePath = path.join(__dirname, '../openapi.yaml');

const serviceMapping = {
    healthcheck         : HealthService.buildHealthResponse,
    add_memory          : MemoryService.addMemory,
    get_session_memories: MemoryService.listMemories,
    query_raw_memories  : MemoryService.queryMemories,
    get_all_summaries   : summaryService.listSummaries,
    delete_all_summaries: summaryService.deleteAllSummaries,
    query_summaries     : summaryService.querySummaries,
    summarize_sessions  : sessionService.summarizeSessions,
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
