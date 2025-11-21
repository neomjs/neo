import Neo from '../src/Neo.mjs';
import '../src/core/_export.mjs';
import '../src/manager/Instance.mjs';

// --- Knowledge Base Services ---
import KB_DatabaseService          from './mcp/server/knowledge-base/services/DatabaseService.mjs';
import KB_LifecycleService         from './mcp/server/knowledge-base/services/DatabaseLifecycleService.mjs';
import KB_DocumentService          from './mcp/server/knowledge-base/services/DocumentService.mjs';
import KB_HealthService            from './mcp/server/knowledge-base/services/HealthService.mjs';
import KB_QueryService             from './mcp/server/knowledge-base/services/QueryService.mjs';
import KB_ChromaManager            from './mcp/server/knowledge-base/services/ChromaManager.mjs';
import KB_Config                   from './mcp/server/knowledge-base/config.mjs';

// --- Memory Core Services ---
import Memory_Service              from './mcp/server/memory-core/services/MemoryService.mjs';
import Memory_SessionService       from './mcp/server/memory-core/services/SessionService.mjs';
import Memory_LifecycleService     from './mcp/server/memory-core/services/DatabaseLifecycleService.mjs';
import Memory_HealthService        from './mcp/server/memory-core/services/HealthService.mjs';
import Memory_ChromaManager        from './mcp/server/memory-core/services/ChromaManager.mjs';
import Memory_Config               from './mcp/server/memory-core/config.mjs';

// --- GitHub Workflow Services ---
import GH_IssueService             from './mcp/server/github-workflow/services/IssueService.mjs';
import GH_PullRequestService       from './mcp/server/github-workflow/services/PullRequestService.mjs';
import GH_RepositoryService        from './mcp/server/github-workflow/services/RepositoryService.mjs';
import GH_HealthService            from './mcp/server/github-workflow/services/HealthService.mjs';
import GH_Config                   from './mcp/server/github-workflow/config.mjs';

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
    // Knowledge Base
    KB_Config,
    KB_ChromaManager,
    KB_DatabaseService,
    KB_LifecycleService,
    KB_DocumentService,
    KB_HealthService,
    KB_QueryService,

    // Memory Core
    Memory_Config,
    Memory_ChromaManager,
    Memory_Service,
    Memory_SessionService,
    Memory_LifecycleService,
    Memory_HealthService,

    // GitHub Workflow
    GH_Config,
    GH_HealthService,
    GH_IssueService,
    GH_PullRequestService,
    GH_RepositoryService
};
