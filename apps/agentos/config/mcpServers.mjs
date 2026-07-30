/**
 * Fleet Manager MCP-server configuration — a thin re-export of the ONE shared Body↔Brain
 * authority (`src/ai/fleet/mcpServers.mjs`). App views keep their conventional config import path;
 * durable keys, labels, defaults, and sparse-override validation never fork here.
 */
export {
    MCP_SERVERS,
    TENANT_MCP_HARNESS_TYPES,
    REMOTE_MCP_CREDENTIAL_ENV_VAR,
    defaultMcpMatrix,
    listMcpServers,
    normalizeMcpOverrides,
    normalizeMcpTarget,
    resolveMcpMatrix,
    supportsTenantMcpTarget
} from '../../../src/ai/fleet/mcpServers.mjs';
export {default} from '../../../src/ai/fleet/mcpServers.mjs';
