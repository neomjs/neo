import 'dotenv/config';
import path                                                  from 'path';
import {fileURLToPath}                                       from 'url';
import {camelToSnake, findOperation, makeSafe, safeLoadYaml} from './services/shared/serviceProxy.mjs';

// Host-plane services are constructed ONCE, in the host barrel, and re-exported here for consumers
// that have not migrated. Re-export rather than re-wrap: wrapping in both places would produce two
// distinct Proxies around the same singleton, so `a.GH_IssueService === b.GH_IssueService` would be
// false and any identity check would break silently for exactly as long as the migration lasts.
//
// Cloud importing host is the permitted direction. The reverse is what the split forbids.
import {
    GH_Config, GH_HealthService, GH_IssueService, GH_LabelService, GH_LocalFileService,
    GH_PullRequestHistoryService, GH_PullRequestService, GH_RepositoryService, GH_SyncService,
    GL_IssueService, GL_MergeRequestService,
    NeuralLink_ComponentService, NeuralLink_Config, NeuralLink_ConnectionService,
    NeuralLink_DataService, NeuralLink_DockService, NeuralLink_HealthService,
    NeuralLink_InstanceService, NeuralLink_InteractionService, NeuralLink_RuntimeService,
    Shared_DestructiveOperationGuard
} from './services.host.mjs';

import Neo             from '../src/Neo.mjs';
import * as core       from '../src/core/_export.mjs';
import InstanceManager from '../src/manager/Instance.mjs';

// --- Shared Services ---

// --- GitHub Workflow Services ---

// --- GitLab Workflow Services ---

// --- Knowledge Base Services ---
import _KB_DatabaseService  from './services/knowledge-base/DatabaseService.mjs';
import _KB_LifecycleService from './services/knowledge-base/DatabaseLifecycleService.mjs';
import _KB_DocumentService  from './services/knowledge-base/DocumentService.mjs';
import _KB_HealthService    from './services/knowledge-base/HealthService.mjs';
import _KB_IngestionService from './services/knowledge-base/IngestionService.mjs';
import _KB_RecorderService  from './services/knowledge-base/KBRecorderService.mjs';
import _KB_QueryService     from './services/knowledge-base/QueryService.mjs';
import _KB_SearchService    from './services/knowledge-base/SearchService.mjs';
import KB_ChromaManager     from './services/knowledge-base/ChromaManager.mjs';
import KB_Config            from './mcp/server/knowledge-base/config.mjs';

// --- Memory Core Services ---
import _Memory_Service                   from './services/memory-core/MemoryService.mjs';
import _Memory_DatabaseService           from './services/memory-core/DatabaseService.mjs';
import _Memory_SessionService            from './services/memory-core/SessionService.mjs';
import _Memory_HealthService             from './services/memory-core/HealthService.mjs';
import _Memory_GraphService              from './services/memory-core/GraphService.mjs';
import _Memory_SummaryService            from './services/memory-core/SummaryService.mjs';
import _Memory_ChromaLifecycleService    from './services/memory-core/lifecycle/ChromaLifecycleService.mjs';
import _Memory_InferenceLifecycleService from './services/memory-core/lifecycle/InferenceLifecycleService.mjs';
import _Memory_RecorderService           from './services/memory-core/MemoryCoreRecorderService.mjs';
import Memory_ChromaManager              from './services/memory-core/managers/ChromaManager.mjs';
import Memory_StorageRouter              from './services/memory-core/managers/StorageRouter.mjs';
import _Memory_LifecycleService          from './services/memory-core/lifecycle/SystemLifecycleService.mjs';
import _Memory_TextEmbeddingService      from './services/memory-core/TextEmbeddingService.mjs';
import _Memory_WakeSubscriptionService   from './services/memory-core/WakeSubscriptionService.mjs';
import _Memory_TurnPresenceService       from './services/memory-core/TurnPresenceService.mjs';
import _Memory_MailboxService            from './services/memory-core/MailboxService.mjs';
import Memory_CoalescingEngineService    from './services/memory-core/CoalescingEngineService.mjs';
import _Memory_PermissionService         from './services/memory-core/PermissionService.mjs';
import Memory_WebhookDeliveryService     from './services/memory-core/WebhookDeliveryService.mjs';
import Memory_Config                     from './mcp/server/memory-core/config.mjs';

// --- Neural Link Services ---
//
// The `autoConnect` compatibility write is NOT repeated here. This module imports
// `./services.host.mjs`, which owns it as a single site, so the policy is inherited rather than
// duplicated. That file's note explains why the write survives and what retires it.

// --- Daemons ---
import DreamService                 from './daemons/orchestrator/services/DreamService.mjs';
import HeavyMaintenanceLeaseService from './daemons/orchestrator/services/HeavyMaintenanceLeaseService.mjs';
import SemanticGraphExtractor       from './services/graph/SemanticGraphExtractor.mjs';
import TopologyInferenceEngine      from './services/graph/TopologyInferenceEngine.mjs';

// --- Concept Ontology ---
import ConceptService from './services/ConceptService.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// --- Runtime Type Safety Logic ---
//
// Moved to `services/shared/serviceProxy.mjs`: the host barrel needs this machinery, and
// importing it from here would pull this module's whole transitive graph — the cloud-plane store
// clients included — which is the reachability the split removes. The call sites stay here.


const kbSpec  = safeLoadYaml(path.join(__dirname, 'mcp/server/knowledge-base/openapi.yaml'));
const memSpec = safeLoadYaml(path.join(__dirname, 'mcp/server/memory-core/openapi.yaml'));

// --- Apply Safety Wrappers ---

// GitHub

// GitLab

// Knowledge Base
const KB_DatabaseService  = makeSafe(_KB_DatabaseService, kbSpec);
const KB_LifecycleService = makeSafe(_KB_LifecycleService, kbSpec);
const KB_DocumentService  = makeSafe(_KB_DocumentService, kbSpec);
const KB_HealthService    = makeSafe(_KB_HealthService, kbSpec);
const KB_IngestionService = makeSafe(_KB_IngestionService, kbSpec);
const KB_RecorderService  = makeSafe(_KB_RecorderService, kbSpec);
const KB_QueryService     = makeSafe(_KB_QueryService, kbSpec);
const KB_SearchService    = makeSafe(_KB_SearchService, kbSpec);

// Memory Core
const Memory_Service                   = makeSafe(_Memory_Service, memSpec);
const Memory_DatabaseService           = makeSafe(_Memory_DatabaseService, memSpec);
const Memory_SessionService            = makeSafe(_Memory_SessionService, memSpec);
const Memory_LifecycleService          = makeSafe(_Memory_LifecycleService, memSpec);
const Memory_ChromaLifecycleService    = makeSafe(_Memory_ChromaLifecycleService, memSpec);
const Memory_InferenceLifecycleService = makeSafe(_Memory_InferenceLifecycleService, memSpec);
const Memory_HealthService             = makeSafe(_Memory_HealthService, memSpec);
const Memory_GraphService              = makeSafe(_Memory_GraphService, memSpec);
const Memory_SummaryService            = makeSafe(_Memory_SummaryService, memSpec);
const Memory_RecorderService           = makeSafe(_Memory_RecorderService, memSpec);
const Memory_TextEmbeddingService      = makeSafe(_Memory_TextEmbeddingService, memSpec);
const Memory_WakeSubscriptionService   = makeSafe(_Memory_WakeSubscriptionService, memSpec);
const Memory_TurnPresenceService       = makeSafe(_Memory_TurnPresenceService, memSpec);
const Memory_MailboxService            = makeSafe(_Memory_MailboxService, memSpec);
const Memory_PermissionService         = makeSafe(_Memory_PermissionService, memSpec);

// Neural Link


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
    GH_PullRequestHistoryService,
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
    NeuralLink_DockService,
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
