/**
 * Neo.mjs MCP Client CLI
 *
 * This script provides a command-line interface to interact with MCP servers
 * using the Neo.ai.mcp.client.Client.
 *
 * Usage:
 * npm run ai:mcp-client -- --server <serverName> --list-tools
 * npm run ai:mcp-client -- --server <serverName> --call-tool <toolName> --args '{"key": "value"}'
 * npm run ai:mcp-client -- -c ./my-client-config.mjs --server <serverName> --list-tools
 */

import { Command }       from 'commander';
import Neo               from '../../../src/Neo.mjs';
import * as core         from '../../../src/core/_export.mjs'; // For Neo.core.Base setup
import InstanceManager   from '../../../src/manager/Instance.mjs'; // For Neo.core.Base setup
import Client            from './Client.mjs';
import aiConfig          from './config.mjs';

const program = new Command();

program
    .name('mcp-client')
    .description('CLI for interacting with MCP servers')
    .option('-s, --server <name>', 'Logical name of the MCP server to connect to (e.g., github-workflow)')
    .option('-l, --list-tools', 'List available tools on the specified server')
    .option('-c, --config <path>', 'Path to an external client configuration file')
    .option('-t, --call-tool <toolName>', 'Name of the tool to call')
    .option('-a, --args <json>', 'JSON string of arguments for --call-tool', '{}')
    .option('-d, --debug', 'Enable debug logging');

program.parse(process.argv);

const options = program.opts();

// Apply debug flag immediately
if (options.debug) {
    aiConfig.data.debug = true;
}

async function run() {
    console.log(`🤖 MCP Client CLI starting.`);

    let mcpClient = null;

    try {
        if (!options.server) {
            console.error('❌ Error: A target server must be specified using -s, --server <name>.');
            process.exit(1);
        }

        mcpClient = Neo.create(Client, {
            clientName: 'Neo.ai.MCP.CLI',
            configFile: options.config,
            serverName: options.server,
            env: process.env // Pass environment variables
        });
        await mcpClient.ready();

        if (options.listTools) {
            console.log('\n🛠️  Listing tools...');
            const tools = await mcpClient.listTools();
            tools.forEach(tool => {
                console.log(` - ${tool.name}: ${tool.description || 'No description.'}`);
            });
            console.log(`\nFound ${tools.length} tools.`);
        } else if (options.callTool) {
            console.log(`\nCalling tool: ${options.callTool} with args: ${options.args}`);
            const args = JSON.parse(options.args);
            const toolMethod = mcpClient.tools[Neo.snakeToCamel(options.callTool)]; // Use dynamic proxy

            if (!toolMethod) {
                console.error(`❌ Error: Tool '${options.callTool}' not found on server '${options.server}'.`);
                process.exit(1);
            }

            const result = await toolMethod(args);

            if (result.isError) {
                console.error(`\n❌ Tool call failed:`);
                result.content.forEach(c => console.error(c.text));
            } else {
                console.log(`\n✅ Tool call successful:`);
                result.content.forEach(c => console.log(c.text));
            }
        } else {
            console.log('\n🤷 No action specified. Use --list-tools or --call-tool.');
        }

    } catch (error) {
        console.error('Fatal error during client initialization:', error);
        process.exit(1);
    } finally {
        if (mcpClient) {
            await mcpClient.close();
        }
        console.log('\n🔌 Connection closed.');
    }
}

run();
