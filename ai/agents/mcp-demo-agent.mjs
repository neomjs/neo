#!/usr/bin/env node

/**
 * Neo.mjs MCP Demo Agent
 *
 * This script demonstrates the new "Headless Agent" pattern using the MCP Client SDK.
 * Instead of importing services directly (tight coupling), it connects to the
 * GitHub Workflow MCP Server via stdio (loose coupling).
 *
 * Usage:
 * node ai/agents/mcp-demo-agent.mjs
 */

import Neo             from '../../src/Neo.mjs';
import * as core       from '../../src/core/_export.mjs';
import InstanceManager from '../../src/manager/Instance.mjs';
import Client          from '../mcp/client/Client.mjs';

import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Load env from project root
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

async function run() {
    console.log('🤖 MCP Demo Agent Starting...');

    // 1. Define Server Config
    // In a real agent, this might come from a config file or registry
    const ghServerPath = path.resolve(__dirname, '../mcp/server/github-workflow/mcp-stdio.mjs');
    
    // 2. Create Client
    const ghClient = Neo.create(Client, {
        clientName: 'Neo.ai.Agent.Demo',
        command: 'node',
        args: [ghServerPath],
        env: process.env
    });

    try {
        // 3. Connect
        console.log('🔌 Connecting to GitHub Workflow Server...');
        await ghClient.connect();
        console.log('✅ Connected.');

        // 4. Discover Tools (Optional, but good practice)
        const tools = await ghClient.listTools();
        console.log(`🛠️  Server offers ${tools.length} tools.`);

        // 5. Execute Task: List recent issues
        console.log('\n📋 Fetching recent issues via MCP...');
        
        // Notice: We call the tool by string name, passing a plain object.
        // No import of 'GH_IssueService' required!
        const result = await ghClient.callTool('list_issues', {
            limit: 5,
            state: 'open'
        });

        if (result.isError) {
            console.error('❌ Tool Execution Failed:', result.content[0].text);
        } else {
            // Parse the JSON result
            const data = JSON.parse(result.content[0].text);
            console.log(`✅ Found ${data.issues.length} open issues:\n`);
            
            data.issues.forEach(issue => {
                console.log(`   #${issue.number} ${issue.title} (@${issue.author.login})`);
            });
        }

    } catch (error) {
        console.error('💥 Agent Error:', error);
    } finally {
        // 6. Cleanup
        await ghClient.close();
        console.log('\n🔌 Connection closed.');
    }
}

run();
