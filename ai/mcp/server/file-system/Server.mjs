import BaseServer            from '../BaseServer.mjs';
import PolicyService         from '../shared/services/PolicyService.mjs';
import {listTools, callTool} from './services/toolService.mjs';

/**
 * @summary Minimal stderr-only logger shim for file-system MCP server. Routes all log levels
 * to `console.error` so log output never collides with the stdio MCP protocol channel
 * (stdout). file-system has no dedicated logger module — unlike the cloud-native Tier-1
 * servers — so this shim provides the BaseServer-expected logger interface.
 */
const stderrLogger = {
    debug: () => {},
    info : (...args) => console.error(...args),
    warn : (...args) => console.error(...args),
    error: (...args) => console.error(...args)
};

/**
 * @summary The File System MCP Server application.
 *
 * Provides restricted, sandboxed file operations and execution feedback for agents.
 * Tier-2 local-only server (gemma4-style local-agent surface) — NOT a deployment target.
 * Stdio transport only; no aiConfig load, no health service, no dependent services.
 *
 * @class Neo.ai.mcp.server.file-system.Server
 * @extends Neo.ai.mcp.server.BaseServer
 */
class Server extends BaseServer {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.server.file-system.Server'
         * @protected
         */
        className: 'Neo.ai.mcp.server.file-system.Server'
    }

    logger = stderrLogger

    /**
     * @summary MCP server identity for `createMcpServer()`.
     * @returns {{name: String, version: String, capabilities: Object}}
     */
    getServerMetadata() {
        return {
            name        : 'neo-file-system',
            version     : process.env.npm_package_version || '1.0.0',
            capabilities: {
                tools: {listChanged: false}
            }
        };
    }

    /**
     * @summary Per-server tool registry for ListTools / CallTool dispatch.
     * @returns {{listTools: Function, callTool: Function}}
     */
    getToolService() {
        return {listTools, callTool};
    }

    /**
     * @summary Refuses MCP file writes to the operator-ratified tenets document placeholder.
     *
     * This v0 guard hardcodes the exact repo-root path. Future
     * runtime-configurable policy must flow through AiConfig leaves; do not add
     * a parallel policy config file under `ai/`.
     * @param {Object} context
     * @param {String} context.toolName
     * @param {Object} context.args
     */
    async beforeToolDispatch({toolName, args}) {
        PolicyService.assertProtectedRepoRootWrite({
            toolName,
            args,
            protectedRelativePath: 'AGENTS_TENETS.md',
            policyId             : 'file-system.agents-tenets.write-protect',
            tenet                : '#10293',
            reason               : 'AGENTS_TENETS.md is operator-ratified tenets substrate; MCP file-system writes are refused until the multi-party update path exists.'
        });
    }
}

export default Neo.setupClass(Server);
