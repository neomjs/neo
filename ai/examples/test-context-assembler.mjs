#!/usr/bin/env node

import Neo from '../../src/Neo.mjs';
import * as core from '../../src/core/_export.mjs';
import ContextAssembler from './Assembler.mjs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// We need to mock the Services since we are not running inside the full server environment
// or rather, we want to verify the Assembler logic, not the DB connection.
// However, the "Thick Client" pattern implies we *can* connect to the DB if configured.
// Let's try to run it "live" if keys are present, similar to test-gemini.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({path: path.resolve(__dirname, '../../.env'), quiet: true});

async function run() {
    console.log('🧪 Testing Neo.ai.context.Assembler...');

    if (!process.env.GEMINI_API_KEY) {
        console.error('❌ Skipped: GEMINI_API_KEY not found');
        return;
    }

    const assembler = Neo.create(ContextAssembler);

    // Initialize (will connect to Memory Core if available)
    console.log('⏳ Initializing Assembler (and services)...');
    await assembler.initAsync();
    console.log('✅ Assembler Ready.');

    // Test Assembly
    const context = await assembler.assemble({
        systemPrompt: 'You are a helpful agent.',
        userQuery: 'How do I fix the button?',
        ragQuery: 'button component',
        sessionId: 'test-session-123' // Likely empty in DB, but tests the flow
    });

    console.log('\n📦 Assembled Context:');
    console.log('-----------------------------------');
    console.log('System Prompt:', context.system.substring(0, 100) + '...');
    console.log('Message Chain:', context.messages);
    console.log('-----------------------------------');

    if (context.system.includes('Relevant Documentation')) {
        console.log('✅ RAG Context successfully injected (from KB).');
    } else {
        console.log('⚠️ No RAG Context found (KB might be empty or query yielded no results).');
    }

    process.exit(0);
}

run();
