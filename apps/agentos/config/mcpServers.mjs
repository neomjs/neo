/**
 * Fleet Manager MCP-server configuration — a thin re-export of the ONE shared Body↔Brain
 * authority (`src/ai/fleet/mcpServers.mjs`). App views keep their conventional config import path;
 * durable keys, labels, defaults, and sparse-override validation never fork here.
 */
export {
    MCP_SERVERS,
    REMOTE_HTTP_HARNESS_TYPES,
    REMOTE_MCP_CREDENTIAL_ENV_VAR,
    defaultMcpMatrix,
    listMcpServers,
    normalizeMcpOverrides,
    normalizeMcpTransport,
    resolveMcpMatrix,
    supportsRemoteMcpTransport
} from '../../../src/ai/fleet/mcpServers.mjs';
export {default} from '../../../src/ai/fleet/mcpServers.mjs';
