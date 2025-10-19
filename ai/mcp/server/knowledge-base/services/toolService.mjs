import path from 'path';
import { fileURLToPath } from 'url';
import * as healthService from './healthService.mjs';
import DatabaseService from './DatabaseService.mjs';
import * as queryService from './queryService.mjs';
import DocumentService from './DocumentService.mjs';
import DatabaseLifecycleService from './DatabaseLifecycleService.mjs';
import { initialize, listTools, callTool } from '../../toolService.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const openApiFilePath = path.join(__dirname, '../openapi.yaml');

const serviceMapping = {
    healthcheck          : healthService.healthcheck,
    sync_database        : DatabaseService.syncDatabase,
    create_knowledge_base: DatabaseService.createKnowledgeBase,
    embed_knowledge_base : DatabaseService.embedKnowledgeBase,
    delete_database      : DatabaseService.deleteDatabase,
    query_documents      : queryService.queryDocuments,
    list_documents       : DocumentService.listDocuments,
    get_document_by_id   : DocumentService.getDocumentById,
    start_database       : DatabaseLifecycleService.start_database,
    stop_database        : DatabaseLifecycleService.stop_database
};

initialize(serviceMapping, openApiFilePath);

export {
    listTools,
    callTool
};
