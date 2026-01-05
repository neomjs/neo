import path                     from 'path';
import {fileURLToPath}          from 'url';
import DatabaseService          from './DatabaseService.mjs';
import DatabaseLifecycleService from './DatabaseLifecycleService.mjs';
import DocumentService          from './DocumentService.mjs';
import HealthService            from './HealthService.mjs';
import QueryService             from './QueryService.mjs';
import ToolService              from '../../../ToolService.mjs';

const __filename      = fileURLToPath(import.meta.url);
const __dirname       = path.dirname(__filename);
const openApiFilePath = path.join(__dirname, '../openapi.yaml');

const serviceMapping = {
    get_document_by_id   : DocumentService         .getDocumentById    .bind(DocumentService),
    healthcheck          : HealthService           .healthcheck        .bind(HealthService),
    list_documents       : DocumentService         .listDocuments      .bind(DocumentService),
    manage_database      : DatabaseLifecycleService.manageDatabase     .bind(DatabaseLifecycleService),
    manage_knowledge_base: DatabaseService         .manageKnowledgeBase.bind(DatabaseService),
    query_documents      : QueryService            .queryDocuments     .bind(QueryService)
};

const toolService = Neo.create(ToolService, {
    openApiFilePath,
    serviceMapping
});

const callTool  = toolService.callTool .bind(toolService);
const listTools = toolService.listTools.bind(toolService);

export {callTool, listTools};
