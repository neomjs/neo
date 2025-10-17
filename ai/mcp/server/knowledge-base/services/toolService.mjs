import path from 'path';
import { fileURLToPath } from 'url';
import * as healthService from './healthService.mjs';
import * as databaseService from './databaseService.mjs';
import * as queryService from './queryService.mjs';
import * as documentService from './documentService.mjs';
import { initialize, listTools, callTool } from '../../toolService.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const openApiFilePath = path.join(__dirname, '../openapi.yaml');

const serviceMapping = {
    healthcheck          : healthService.healthcheck,
    sync_database        : databaseService.syncDatabase,
    create_knowledge_base: databaseService.createKnowledgeBase,
    embed_knowledge_base : databaseService.embedKnowledgeBase,
    delete_database      : databaseService.deleteDatabase,
    query_documents      : queryService.queryDocuments,
    list_documents       : documentService.listDocuments,
    get_document_by_id   : documentService.getDocumentById
};

initialize(serviceMapping, openApiFilePath);

export {
    listTools,
    callTool
};
