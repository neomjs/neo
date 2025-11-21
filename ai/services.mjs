import Neo from '../src/Neo.mjs';
import '../src/core/_export.mjs';
import '../src/manager/Instance.mjs';

import DatabaseService          from './mcp/server/knowledge-base/services/DatabaseService.mjs';
import DatabaseLifecycleService from './mcp/server/knowledge-base/services/DatabaseLifecycleService.mjs';
import DocumentService          from './mcp/server/knowledge-base/services/DocumentService.mjs';
import HealthService            from './mcp/server/knowledge-base/services/HealthService.mjs';
import QueryService             from './mcp/server/knowledge-base/services/QueryService.mjs';
import ChromaManager            from './mcp/server/knowledge-base/services/ChromaManager.mjs';
import aiConfig                 from './mcp/server/knowledge-base/config.mjs';

/**
 * @module Neo.ai.services
 * @description
 * This module acts as a standalone SDK for the Neo.mjs AI infrastructure.
 * It allows Node.js scripts (like AI agents) to import and use the intelligent services
 * directly, bypassing the MCP server protocol.
 *
 * Usage:
 * ```javascript
 * import { QueryService } from './ai/services.mjs';
 *
 * const results = await QueryService.queryDocuments({ query: 'my query' });
 * ```
 */

export {
    aiConfig,
    ChromaManager,
    DatabaseService,
    DatabaseLifecycleService,
    DocumentService,
    HealthService,
    QueryService
};
