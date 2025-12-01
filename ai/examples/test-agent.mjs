#!/usr/bin/env node

import Neo from '../../src/Neo.mjs';
import * as core from '../../src/core/_export.mjs';
import Agent from '../Agent.mjs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({path: path.resolve(__dirname, '../.env'), quiet: true});

async function run() {
    console.log('🧪 Testing Neo.ai.Agent Integration...');

    if (!process.env.GEMINI_API_KEY) {
        console.error('❌ Skipped: GEMINI_API_KEY not found');
        return;
    }

    // 1. Create Agent (connecting to memory-core via MCP for testing if needed, but Loop uses SDK)
    // We don't strictly need MCP servers running for this test since the Loop uses "Thick Client" services.
    // But let's pass an empty servers list to keep it fast.
    const agent = Neo.create(Agent, {
        servers: [] 
    });
    
    await agent.ready();

    // 2. Feed Event
    console.log('📥 Scheduling: "Who is the CEO of Google?"');
    agent.schedule({
        type: 'user:input',
        data: 'Who is the CEO of Google?'
    });

    // 3. Start
    agent.start();

    // 4. Wait
    setTimeout(() => {
        agent.stop();
        process.exit(0);
    }, 5000);
}

run();
