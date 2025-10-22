import path                              from 'path';
import {fileURLToPath}                   from 'url';
import DatabaseService                   from './DatabaseService.mjs';
import DatabaseLifecycleService          from './DatabaseLifecycleService.mjs';
import DocumentService                   from './DocumentService.mjs';
import HealthService                     from './HealthService.mjs';
import QueryService                      from './QueryService.mjs';
import {initialize, listTools, callTool} from '../../toolService.mjs';

const __filename      = fileURLToPath(import.meta.url);
const __dirname       = path.dirname(__filename);
const openApiFilePath = path.join(__dirname, '../openapi.yaml');

const serviceMapping = {
    healthcheck          : HealthService.healthcheck.bind(HealthService),
    sync_database        : DatabaseService.syncDatabase.bind(DatabaseService),
    create_knowledge_base: DatabaseService.createKnowledgeBase.bind(DatabaseService),
    embed_knowledge_base : DatabaseService.embedKnowledgeBase.bind(DatabaseService),
    delete_database      : DatabaseService.deleteDatabase.bind(DatabaseService),
    query_documents      : QueryService.queryDocuments.bind(QueryService),
    list_documents       : DocumentService.listDocuments.bind(DocumentService),
    get_document_by_id   : DocumentService.getDocumentById.bind(DocumentService),
    start_database       : DatabaseLifecycleService.start_database.bind(DatabaseLifecycleService),
    stop_database        : DatabaseLifecycleService.stop_database.bind(DatabaseLifecycleService)
};

initialize(serviceMapping, openApiFilePath);

export {
    listTools,
    callTool
};
