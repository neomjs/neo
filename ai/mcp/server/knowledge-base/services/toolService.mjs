import path                              from 'path';
import {fileURLToPath}                   from 'url';
import {initialize, listTools, callTool} from '../../toolService.mjs';
import DatabaseService                   from './DatabaseService.mjs';
import DatabaseLifecycleService          from './DatabaseLifecycleService.mjs';
import DocumentService                   from './DocumentService.mjs';
import HealthService                     from './HealthService.mjs';
import QueryService                      from './QueryService.mjs';

const __filename      = fileURLToPath(import.meta.url);
const __dirname       = path.dirname(__filename);
const openApiFilePath = path.join(__dirname, '../openapi.yaml');

const serviceMapping = {
    create_knowledge_base: DatabaseService         .createKnowledgeBase.bind(DatabaseService),
    delete_database      : DatabaseService         .deleteDatabase     .bind(DatabaseService),
    embed_knowledge_base : DatabaseService         .embedKnowledgeBase .bind(DatabaseService),
    get_document_by_id   : DocumentService         .getDocumentById    .bind(DocumentService),
    healthcheck          : HealthService           .healthcheck        .bind(HealthService),
    list_documents       : DocumentService         .listDocuments      .bind(DocumentService),
    query_documents      : QueryService            .queryDocuments     .bind(QueryService),
    start_database       : DatabaseLifecycleService.startDatabase      .bind(DatabaseLifecycleService),
    stop_database        : DatabaseLifecycleService.stopDatabase       .bind(DatabaseLifecycleService),
    sync_database        : DatabaseService         .syncDatabase       .bind(DatabaseService)
};

initialize(serviceMapping, openApiFilePath);

export {callTool, listTools};
