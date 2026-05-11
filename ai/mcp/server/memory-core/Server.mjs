import BaseServer                  from '../BaseServer.mjs';
import aiConfig                    from './config.mjs';
import logger                      from './logger.mjs';
import {
    Memory_HealthService as HealthService,
    Memory_McpIntegrationService as McpIntegrationService
} from '../../../services.mjs';
import {listTools, callTool}       from '../../../services/memory-core/toolService.mjs';

/**
 * @summary The Memory Core MCP Server application.
 *
 * Handles initialization, configuration, and lifecycle management for the Memory Core MCP server.
 * Delegated to McpIntegrationService as part of the v13 SDK Migration.
 *
 * @class Neo.ai.mcp.server.memory-core.Server
 * @extends Neo.ai.mcp.server.BaseServer
 */
class Server extends BaseServer {
    static config = {
        className: 'Neo.ai.mcp.server.memory-core.Server'
    }

    aiConfig = aiConfig
    logger   = logger

    getServerMetadata() {
        return McpIntegrationService.getServerMetadata();
    }

    getToolService() {
        return {listTools, callTool};
    }

    getHealthService() {
        return HealthService;
    }

    getHealthExemptTools() {
        return McpIntegrationService.getHealthExemptTools();
    }

    async beforeToolDispatch(context) {
        return McpIntegrationService.beforeToolDispatch(context);
    }

    async wrapDispatch(dispatch) {
        return McpIntegrationService.wrapDispatch(dispatch);
    }

    createMcpServer() {
        return McpIntegrationService.createMcpServer(super.createMcpServer());
    }

    async boot() {
        await McpIntegrationService.boot(this);
    }

    async buildRequestContext(reqAuth) {
        return McpIntegrationService.buildRequestContext(reqAuth);
    }

    onSessionClosed(sessionId, mcpServerInstance) {
        McpIntegrationService.onSessionClosed(sessionId, mcpServerInstance);
    }

    bindAgentIdentity(identity) {
        return McpIntegrationService.bindAgentIdentity(identity);
    }
}

export default Neo.setupClass(Server);
