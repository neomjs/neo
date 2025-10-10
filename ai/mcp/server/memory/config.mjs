import dotenv from 'dotenv';
import path   from 'path';

const cwd = process.cwd();

// Load environment variables from the project root, but stay silent if the file does not exist.
dotenv.config({path: path.resolve(cwd, '.env'), quiet: true});

/**
 * Central configuration for the Memory MCP server.
 */
const serverConfig = {
    host            : process.env.MEMORY_MCP_HOST || '0.0.0.0',
    port            : parseInt(process.env.MEMORY_MCP_PORT || '8010', 10),
    logFormat       : process.env.MEMORY_MCP_LOG_FORMAT || 'dev',
    openApiFilePath : path.resolve(cwd, 'buildScripts/mcp/memory/openapi.yaml'),
    requestBodyLimit: process.env.MEMORY_MCP_BODY_LIMIT || '1mb'
};

export default serverConfig;
