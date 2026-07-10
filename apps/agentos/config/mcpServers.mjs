/**
 * Fleet Manager MCP-server configuration — a thin re-export of the ONE shared Body↔Brain
 * authority (`src/ai/fleet/mcpServers.mjs`). App views keep their conventional config import path;
 * durable keys, labels, defaults, and sparse-override validation never fork here.
 */
export {
    MCP_SERVERS,
    defaultMcpMatrix,
    listMcpServers,
    normalizeMcpOverrides,
    resolveMcpMatrix
} from '../../../src/ai/fleet/mcpServers.mjs';
export {default} from '../../../src/ai/fleet/mcpServers.mjs';
