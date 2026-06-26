import 'dotenv/config';
import fs               from 'fs';
import path             from 'path';
import {fileURLToPath}  from 'url';
import yaml             from 'js-yaml';
import {buildZodSchema} from './mcp/validation/openApiValidator.mjs';

import Neo             from '../src/Neo.mjs';
import * as core       from '../src/core/_export.mjs';
import InstanceManager from '../src/manager/Instance.mjs';

// --- Shared Services ---
import Shared_DestructiveOperationGuard from './mcp/server/shared/services/DestructiveOperationGuard.mjs';

// --- GitHub Workflow Services ---
import GH_Config                    from './mcp/server/github-workflow/config.mjs';
import _GH_HealthService from './services/github-workflow/HealthService.mjs';
import _GH_IssueService from './services/github-workflow/IssueService.mjs';
import _GH_LabelService from './services/github-workflow/LabelService.mjs';
import _GH_LocalFileService from './services/github-workflow/LocalFileService.mjs';
import _GH_PullRequestService from './services/github-workflow/PullRequestService.mjs';
import _GH_RepositoryService from './services/github-workflow/RepositoryService.mjs';
import _GH_SyncService from './services/github-workflow/SyncService.mjs';

GH_Config.data.syncOnStartup = false;

// --- GitLab Workflow Services ---
import _GL_IssueService from './services/gitlab-workflow/IssueService.mjs';
import _GL_MergeRequestService from './services/gitlab-workflow/MergeRequestService.mjs';

// --- Knowledge Base Services ---
import _KB_DatabaseService from './services/knowledge-base/DatabaseService.mjs';
import _KB_LifecycleService from './services/knowledge-base/DatabaseLifecycleService.mjs';
import _KB_DocumentService from './services/knowledge-base/DocumentService.mjs';
import _KB_HealthService from './services/knowledge-base/HealthService.mjs';
import _KB_IngestionService from './services/knowledge-base/IngestionService.mjs';
import _KB_RecorderService from './services/knowledge-base/KBRecorderService.mjs';
import _KB_QueryService from './services/knowledge-base/QueryService.mjs';
import _KB_SearchService from './services/knowledge-base/SearchService.mjs';
import KB_ChromaManager             from './services/knowledge-base/ChromaManager.mjs';
import KB_Config                    from './mcp/server/knowledge-base/config.mjs';

// --- Memory Core Services ---
import _Memory_Service from './services/memory-core/MemoryService.mjs';
import _Memory_DatabaseService from './services/memory-core/DatabaseService.mjs';
import _Memory_SessionService from './services/memory-core/SessionService.mjs';
import _Memory_HealthService from './services/memory-core/HealthService.mjs';
import _Memory_GraphService from './services/memory-core/GraphService.mjs';
import _Memory_SummaryService from './services/memory-core/SummaryService.mjs';
import _Memory_ChromaLifecycleService from './services/memory-core/lifecycle/ChromaLifecycleService.mjs';
import _Memory_InferenceLifecycleService from './services/memory-core/lifecycle/InferenceLifecycleService.mjs';
import _Memory_RecorderService from './services/memory-core/MemoryCoreRecorderService.mjs';
import Memory_ChromaManager         from './services/memory-core/managers/ChromaManager.mjs';
import Memory_StorageRouter         from './services/memory-core/managers/StorageRouter.mjs';
import _Memory_LifecycleService from './services/memory-core/lifecycle/SystemLifecycleService.mjs';
import _Memory_TextEmbeddingService from './services/memory-core/TextEmbeddingService.mjs';
import _Memory_WakeSubscriptionService from './services/memory-core/WakeSubscriptionService.mjs';
import _Memory_TurnPresenceService from './services/memory-core/TurnPresenceService.mjs';
import _Memory_MailboxService from './services/memory-core/MailboxService.mjs';
import Memory_CoalescingEngineService from './services/memory-core/CoalescingEngineService.mjs';
import _Memory_PermissionService from './services/memory-core/PermissionService.mjs';
import Memory_WebhookDeliveryService from './services/memory-core/WebhookDeliveryService.mjs';
import Memory_Config                from './mcp/server/memory-core/config.mjs';

// --- Neural Link Services ---
import _NeuralLink_ComponentService from './services/neural-link/ComponentService.mjs';
import _NeuralLink_ConnectionService from './services/neural-link/ConnectionService.mjs';
import _NeuralLink_DataService from './services/neural-link/DataService.mjs';
import _NeuralLink_HealthService from './services/neural-link/HealthService.mjs';
import _NeuralLink_InstanceService from './services/neural-link/InstanceService.mjs';
import _NeuralLink_InteractionService from './services/neural-link/InteractionService.mjs';
import _NeuralLink_RuntimeService from './services/neural-link/RuntimeService.mjs';
import NeuralLink_Config             from './mcp/server/neural-link/config.mjs';

NeuralLink_Config.data.autoConnect = false;

// --- Daemons ---
import DreamService from './daemons/orchestrator/services/DreamService.mjs';
import HeavyMaintenanceLeaseService from './daemons/orchestrator/services/HeavyMaintenanceLeaseService.mjs';
import SemanticGraphExtractor from './services/graph/SemanticGraphExtractor.mjs';
import TopologyInferenceEngine from './services/graph/TopologyInferenceEngine.mjs';

// --- Concept Ontology ---
import ConceptService from './services/ConceptService.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// --- Runtime Type Safety Logic ---

function camelToSnake(str) {
    return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

function findOperation(spec, operationId) {
    for (const pathItem of Object.values(spec.paths)) {
        for (const operation of Object.values(pathItem)) {
            if (operation.operationId === operationId) {
                return operation;
            }
        }
    }
    return null;
}

/**
 * Wraps a service object to enforce Zod validation on its methods based on OpenAPI specs.
 * @param {Object} service - The raw service object.
 * @param {Object} spec - The parsed OpenAPI document.
 * @returns {Object} - The service object with wrapped methods (mutates original or returns proxy).
 */
function makeSafe(service, spec) {
    if (!spec) {
        console.warn(`[services.mjs] Warning: OpenAPI spec is null or invalid. Running ${service?.constructor?.name || 'Service'} in degraded mode (NO Zod validation).`);
        return service;
    }

    const wrappedMethods = new Map();
    const proto = Object.getPrototypeOf(service);
    const keys  = new Set([...Object.getOwnPropertyNames(service), ...Object.getOwnPropertyNames(proto)]);

    for (const key of keys) {
        if (key === 'constructor') continue;

        if (typeof service[key] === 'function') {
            const operationId = camelToSnake(key);
            const operation = findOperation(spec, operationId);

            if (operation) {
                const zodSchema = buildZodSchema(spec, operation);

                wrappedMethods.set(key, async (args) => {
                    const currentMethod = service[key];
                    if (args !== undefined && (typeof args !== 'object' || args === null || Array.isArray(args))) {
                        return currentMethod.call(service, args);
                    }
                    const parsedArgs = zodSchema.parse(args || {});

                    if (operation['x-pass-as-object']) {
                        return currentMethod.call(service, parsedArgs);
                    } else {
                        const paramNames = (operation.parameters || []).map(p => p.name);
                        if (operation.requestBody?.content?.['application/json']?.schema) {
                            const argValues = paramNames.map(name => parsedArgs[name]);
                            return currentMethod.call(service, ...argValues);
                        }
                        const argValues = paramNames.map(name => parsedArgs[name]);
                        return currentMethod.call(service, ...argValues);
                    }
                });
            }
        }
    }

    return new Proxy(service, {
        get(target, prop) {
            if (wrappedMethods.has(prop)) {
                return wrappedMethods.get(prop);
            }
            const value = Reflect.get(target, prop, target);
            if (typeof value === 'function') {
                return value.bind(target);
            }
            return value;
        }
    });
}


// --- Load Specs ---
/**
 * Safely loads a YAML OpenAPI specification.
 *
 * Degraded Mode Semantics (Fail-Open):
 * If a specification file is missing or contains syntax errors, this function catches the error
 * and returns `null` rather than crashing the process. This prevents a single malformed MCP
 * spec from causing a systemic boot cascade failure across all daemon services.
 * Downstream consumers (e.g., `makeSafe`) must handle `null` by skipping validation.
 */
function safeLoadYaml(filePath) {
    try {
        return yaml.load(fs.readFileSync(filePath, 'utf8'));
    } catch (err) {
        console.error(`[services.mjs] Failed to load or parse YAML at ${filePath}:`, err.message);
        return null;
    }
}

const ghSpec  = safeLoadYaml(path.join(__dirname, 'mcp/server/github-workflow/openapi.yaml'));
const kbSpec  = safeLoadYaml(path.join(__dirname, 'mcp/server/knowledge-base/openapi.yaml'));
const memSpec = safeLoadYaml(path.join(__dirname, 'mcp/server/memory-core/openapi.yaml'));
const nlSpec  = safeLoadYaml(path.join(__dirname, 'mcp/server/neural-link/openapi.yaml'));
const gitlabSpec = safeLoadYaml(path.join(__dirname, 'mcp/server/gitlab-workflow/openapi.yaml'));

// --- Apply Safety Wrappers ---

// GitHub
const GH_HealthService = makeSafe(_GH_HealthService, ghSpec);
const GH_IssueService = makeSafe(_GH_IssueService, ghSpec);
const GH_LabelService = makeSafe(_GH_LabelService, ghSpec);
const GH_LocalFileService = makeSafe(_GH_LocalFileService, ghSpec);
const GH_PullRequestService = makeSafe(_GH_PullRequestService, ghSpec);
const GH_RepositoryService = makeSafe(_GH_RepositoryService, ghSpec);
const GH_SyncService = makeSafe(_GH_SyncService, ghSpec);

// GitLab
const GL_IssueService = makeSafe(_GL_IssueService, gitlabSpec);
const GL_MergeRequestService = makeSafe(_GL_MergeRequestService, gitlabSpec);

// Knowledge Base
const KB_DatabaseService = makeSafe(_KB_DatabaseService, kbSpec);
const KB_LifecycleService = makeSafe(_KB_LifecycleService, kbSpec);
const KB_DocumentService = makeSafe(_KB_DocumentService, kbSpec);
const KB_HealthService = makeSafe(_KB_HealthService, kbSpec);
const KB_IngestionService = makeSafe(_KB_IngestionService, kbSpec);
const KB_RecorderService = makeSafe(_KB_RecorderService, kbSpec);
const KB_QueryService = makeSafe(_KB_QueryService, kbSpec);
const KB_SearchService = makeSafe(_KB_SearchService, kbSpec);

// Memory Core
const Memory_Service = makeSafe(_Memory_Service, memSpec);
const Memory_DatabaseService = makeSafe(_Memory_DatabaseService, memSpec);
const Memory_SessionService = makeSafe(_Memory_SessionService, memSpec);
const Memory_LifecycleService = makeSafe(_Memory_LifecycleService, memSpec);
const Memory_ChromaLifecycleService = makeSafe(_Memory_ChromaLifecycleService, memSpec);
const Memory_InferenceLifecycleService = makeSafe(_Memory_InferenceLifecycleService, memSpec);
const Memory_HealthService = makeSafe(_Memory_HealthService, memSpec);
const Memory_GraphService = makeSafe(_Memory_GraphService, memSpec);
const Memory_SummaryService = makeSafe(_Memory_SummaryService, memSpec);
const Memory_RecorderService = makeSafe(_Memory_RecorderService, memSpec);
const Memory_TextEmbeddingService = makeSafe(_Memory_TextEmbeddingService, memSpec);
const Memory_WakeSubscriptionService = makeSafe(_Memory_WakeSubscriptionService, memSpec);
const Memory_TurnPresenceService = makeSafe(_Memory_TurnPresenceService, memSpec);
const Memory_MailboxService = makeSafe(_Memory_MailboxService, memSpec);
const Memory_PermissionService = makeSafe(_Memory_PermissionService, memSpec);

// Neural Link
const NeuralLink_ConnectionService = makeSafe(_NeuralLink_ConnectionService, nlSpec);
const NeuralLink_ComponentService = makeSafe(_NeuralLink_ComponentService, nlSpec);
const NeuralLink_DataService = makeSafe(_NeuralLink_DataService, nlSpec);
const NeuralLink_HealthService = makeSafe(_NeuralLink_HealthService, nlSpec);
const NeuralLink_InstanceService = makeSafe(_NeuralLink_InstanceService, nlSpec);
const NeuralLink_InteractionService = makeSafe(_NeuralLink_InteractionService, nlSpec);
const NeuralLink_RuntimeService = makeSafe(_NeuralLink_RuntimeService, nlSpec);


/**
 * @module Neo.ai.services
 * @description
 * This module acts as a standalone SDK for the Neo.mjs AI infrastructure.
 * It allows Node.js scripts (like AI agents) to import and use the intelligent services
 * directly, bypassing the MCP server protocol.
 *
 * The services are grouped by domain (KnowledgeBase, Memory, GitHub) and conflicting
 * names (like DatabaseLifecycleService) are prefixed.
 *
 * Usage:
 * ```javascript
 * import { KB_QueryService, GH_IssueService } from './ai/services.mjs';
 *
 * const results = await KB_QueryService.queryDocuments({ query: 'my query' });
 * const issue   = await GH_IssueService.createIssue({ title: 'Bug found' });
 * ```
 */

export {
    // Shared Services
    Shared_DestructiveOperationGuard,

    // GitHub Workflow
    GH_Config,
    GH_HealthService,
    GH_IssueService,
    GH_LabelService,
    GH_LocalFileService,
    GH_PullRequestService,
    GH_RepositoryService,
    GH_SyncService,

    // GitLab Workflow
    GL_IssueService,
    GL_MergeRequestService,

    // Knowledge Base
    KB_Config,
    KB_ChromaManager,
    KB_DatabaseService,
    KB_LifecycleService,
    KB_DocumentService,
    KB_HealthService,
    KB_IngestionService,
    KB_RecorderService,
    KB_QueryService,
    KB_SearchService,

    // Memory Core
    Memory_Config,
    Memory_ChromaManager,
    Memory_Service,
    Memory_SessionService,
    Memory_DatabaseService,
    Memory_LifecycleService,
    Memory_ChromaLifecycleService,
    Memory_InferenceLifecycleService,
    Memory_GraphService,
    Memory_HealthService,
    Memory_RecorderService,
    Memory_StorageRouter,
    Memory_SummaryService,
    Memory_TextEmbeddingService,
    Memory_WakeSubscriptionService,
    Memory_TurnPresenceService,
    Memory_MailboxService,
    Memory_CoalescingEngineService,
    Memory_PermissionService,
    Memory_WebhookDeliveryService,

    // Neural Link
    NeuralLink_ComponentService,
    NeuralLink_Config,
    NeuralLink_ConnectionService,
    NeuralLink_DataService,
    NeuralLink_HealthService,
    NeuralLink_InstanceService,
    NeuralLink_InteractionService,
    NeuralLink_RuntimeService,

    // Daemons
    DreamService,
    HeavyMaintenanceLeaseService,
    SemanticGraphExtractor,
    TopologyInferenceEngine,

    // Concept Ontology
    ConceptService,

    // Internal Testing
    safeLoadYaml,
    makeSafe
};
