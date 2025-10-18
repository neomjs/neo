import path from 'path';
import { fileURLToPath } from 'url';
import { initialize, listTools, callTool } from '../../toolService.mjs';
import DatabaseService from './DatabaseService.mjs';
import * as healthService from './healthService.mjs';
import * as memoryService from './memoryService.mjs';
import * as sessionService from './sessionService.mjs';
import * as summaryService from './summaryService.mjs';
import DatabaseLifecycleService from './DatabaseLifecycleService.mjs';

const __filename      = fileURLToPath(import.meta.url);
const __dirname       = path.dirname(__filename);
const openApiFilePath = path.join(__dirname, '../openapi.yaml');

const serviceMapping = {
    healthcheck         : healthService.buildHealthResponse,
    add_memory          : memoryService.addMemory,
    get_session_memories: memoryService.listMemories,
    query_raw_memories  : memoryService.queryMemories,
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
