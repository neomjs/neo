#!/usr/bin/env node

/**
 * Neo.mjs MCP Client CLI
 *
 * This script provides a command-line interface to interact with MCP servers
 * using the Neo.ai.mcp.client.Client.
 *
 * Usage:
 * node ai/mcp/client/mcp-cli.mjs --server <serverName> --list-tools
 * node ai/mcp/client/mcp-cli.mjs --server <serverName> --call-tool <toolName> --args '{"key": "value"}'
 */

import { Command }       from 'commander';
import Neo               from '../../../src/Neo.mjs';
import * as core         from '../../../src/core/_export.mjs'; // For Neo.core.Base setup
import InstanceManager   from '../../../src/manager/Instance.mjs'; // For Neo.core.Base setup
import Client            from './Client.mjs';
import ClientConfig      from './config.mjs';
import path              from 'path';
import { fileURLToPath } from 'url';
import dotenv            from 'dotenv';

// Load environment variables from project root
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const program = new Command();

program
    .name('mcp-cli')
    .description('CLI for interacting with MCP servers')
    .requiredOption('-s, --server <name>', 'Logical name of the MCP server to connect to (e.g., github-workflow)')
    .option('-l, --list-tools', 'List available tools on the server')
    .option('-c, --call-tool <toolName>', 'Name of the tool to call')
    .option('-a, --args <json>', 'JSON string of arguments for --call-tool', '{}')
    .option('-d, --debug', 'Enable debug logging');

program.parse(process.argv);

const options = program.opts();

async function run() {
    console.log(`🤖 MCP Client CLI starting for server: ${options.server}`);
    console.log('GH_TOKEN present:', !!process.env.GH_TOKEN); // Debug info

    const mcpClient = Neo.create(Client, {
        clientName: 'Neo.ai.MCP.CLI',
        serverName: options.server,
        env: process.env // Pass environment variables
    });

    try {
        await mcpClient.connect();
        console.log(`✅ Connected to ${options.server} MCP server.`);

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
            const result = await mcpClient.callTool(options.callTool, args);

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
        console.error('\n💥 MCP CLI Error:', error.message);
        process.exit(1);
    } finally {
        await mcpClient.close();
        console.log('\n🔌 Connection closed.');
    }
}

run();
