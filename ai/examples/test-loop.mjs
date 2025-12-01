#!/usr/bin/env node

import Neo              from '../../src/Neo.mjs';
import * as core        from '../../src/core/_export.mjs';
import GeminiProvider   from '../provider/Gemini.mjs';
import ContextAssembler from '../context/Assembler.mjs';
import Scheduler        from '../agent/Scheduler.mjs';
import Loop             from '../agent/Loop.mjs';
import path             from 'path';
import {fileURLToPath}  from 'url';
import dotenv           from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({path: path.resolve(__dirname, '../../.env'), quiet: true});

async function run() {
    console.log('🧪 Testing Agent Cognitive Loop...');

    if (!process.env.GEMINI_API_KEY) {
        console.error('❌ Skipped: GEMINI_API_KEY not found');
        return;
    }

    // 1. Initialize Components
    const provider  = Neo.create(GeminiProvider);
    const assembler = Neo.create(ContextAssembler);

    await assembler.initAsync(); // Connects to memory

    const scheduler = Neo.create(Scheduler);
    const loop      = Neo.create(Loop, {
        provider,
        assembler,
        scheduler
    });

    // 2. Feed an Event
    console.log('📥 Injecting Event: user:input');
    scheduler.add({
        type: 'user:input',
        data: 'What is the capital of France?',
        priority: 'high'
    });

    // 3. Start Loop
    loop.start();

    // 4. Wait a bit then stop
    setTimeout(() => {
        loop.stop();
        process.exit(0);
    }, 5000);
}

run();
