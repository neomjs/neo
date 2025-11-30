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
import Agent           from '../Agent.mjs'; // Import the new Agent base class
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({path: path.resolve(__dirname, '../../.env'), quiet: true});

async function run() {
    console.log('🤖 MCP Demo Agent Starting (via Neo.ai.Agent)...');

    // Create an Agent instance and configure its servers
    const agent = Neo.create(Agent, {
        servers: ['github-workflow', 'knowledge-base', 'memory-core'] // Example: connect to all 3
    });

    try {
        // Ensure the agent is ready (connected to all its clients)
        console.log('🔌 Agent preparing (connecting to servers)...');
        await agent.ready();
        console.log('✅ Agent ready (connected to servers).');

        // Example: List tools from GitHub Workflow Server
        console.log('Agent Clients Direct Access:', agent.clients); // Log property access
        console.log('GitHub Client Exists:', !!agent.clients?.githubWorkflow); // Safe check

        console.log('\n📋 Fetching recent issues via agent.clients.githubWorkflow.tools.listIssues()...');
        const ghResult = await agent.clients.githubWorkflow.tools.listIssues({
            limit: 5,
            state: 'open'
        });

        if (ghResult.isError) {
            console.error('❌ GitHub Tool Execution Failed:', ghResult.content[0].text);
        } else {
            const data = JSON.parse(ghResult.content[0].text);
            console.log(`✅ Found ${data.issues.length} open GitHub issues:\n`);
            data.issues.forEach(issue => {
                console.log(`   #${issue.number} ${issue.title} (@${issue.author.login})`);
            });
        }

        // Example: Perform a healthcheck on Knowledge Base
        console.log('\n🩺 Checking Knowledge Base health via agent.clients.knowledgeBase.tools.healthcheck()...');
        const kbHealthResult = await agent.clients.knowledgeBase.tools.healthcheck({});
        if (kbHealthResult.isError) {
            console.error('❌ Knowledge Base Healthcheck Failed:', kbHealthResult.content[0].text);
        } else {
            const healthData = JSON.parse(kbHealthResult.content[0].text);
            console.log('✅ Knowledge Base Health:', healthData.status);
        }

        // Example: Get all session summaries from Memory Core
        console.log('\n🧠 Getting Memory Core session summaries via agent.clients.memoryCore.tools.getAllSummaries()...');
        const memSummariesResult = await agent.clients.memoryCore.tools.getAllSummaries({ limit: 2 });
        if (memSummariesResult.isError) {
            console.error('❌ Memory Core Summaries Failed:', memSummariesResult.content[0].text);
        } else {
            const summariesData = JSON.parse(memSummariesResult.content[0].text);
            console.log(`✅ Found ${summariesData.count} Memory Core session summaries (top 2):\n`);
            summariesData.summaries.forEach(s => {
                console.log(`   - [${s.category}] ${s.title}`);
            });
        }

    } catch (error) {
        console.error('💥 Agent Error:', error);
    } finally {
        console.log('\n🔌 Agent disconnecting from servers...');
        await agent.disconnect();
        console.log('✅ Agent disconnected.');
    }
}

run();
