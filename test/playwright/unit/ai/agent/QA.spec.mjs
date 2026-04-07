import {setup} from '../../../setup.mjs';

const appName = 'QAAgentTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: false,
        unitTestMode           : true,
        useDomApiRenderer      : false
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect}  from '@playwright/test';
import Neo             from '../../../../../src/Neo.mjs';
import * as core       from '../../../../../src/core/_export.mjs';
import Agent           from '../../../../../ai/Agent.mjs';
import Assembler       from '../../../../../ai/context/Assembler.mjs';
import path            from 'path';
import {fileURLToPath} from 'url';
import dotenv          from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
dotenv.config({path: path.resolve(__dirname, '../../../../../.env'), quiet: true});

test.describe('QA Sub-Agent Swarm Node', () => {
    let primaryAgent;
    let originalAssemble;

    test.beforeAll(() => {
        originalAssemble = Assembler.prototype.assemble;
        // Mock the ContextAssembler across the entire Swarm to prevent
        // offline Test nodes from trying to query the live MCP Vector Databases.
        Assembler.prototype.assemble = async function({systemPrompt, userQuery}) {
            return {
                system: systemPrompt,
                messages: [{ role: 'user', content: userQuery }]
            };
        };
    });

    test.afterAll(async () => {
        Assembler.prototype.assemble = originalAssemble;
        if (primaryAgent) {
            await primaryAgent.disconnect();
        }
    });

    test('Primary Agent delegates unit testing task to QA via Gemma4/Ollama', async () => {
        // Skip test in CI environments or if we explicitly don't have a local daemon
        // Since this relies on a local Ollama daemon hosting gemma-4, we just let it run locally 
        // to evaluate the Swarm's intelligence.
        test.setTimeout(120000); // Give Gemma4 up to 2 minutes to generate the test code

        // The primary orchestrator boots up
        primaryAgent = Neo.create(Agent, {
            servers: []
        });

        await primaryAgent.ready();

        const request = `
        Analyze the component 'Neo.button.Base'.
        Write a 100% complete Playwright test suite for it.
        Focus exclusively on DOM mounting and testing the 'text' configuration property mutability.
        Return ONLY the code block and nothing else.
        `;

        // We DO NOT mock the delegate method here. We want to actually hit the local Gemma-4 node 
        // through the Ollama provider to evaluate its ability to follow the System Prompt rules.
        console.log('Sending request to local Gemma4 Swarm node...');
        const generatedCode = await primaryAgent.delegate('qa', request);

        // Basic sanity checks on the raw AI output string to ensure it adhered to the Neo.mjs Testing Primitives
        expect(typeof generatedCode).toBe('string');
        expect(generatedCode.length).toBeGreaterThan(100);

        // Core assertions to ensure Gemma4 learned the rules from its System Prompt
        expect(generatedCode).toMatch(/import\s*\{\s*setup\s*\}\s*from/);
        expect(generatedCode).toMatch(/import\s*Neo\s*from\s*'.*src\/Neo\.mjs'/);
        expect(generatedCode).toContain('DomApiVnodeCreator');
        expect(generatedCode).toContain('Neo.create(');
        expect(generatedCode).toContain('initVnode()');
        expect(generatedCode).toContain('.mounted = true');
        expect(generatedCode).toContain('.set({');

        console.log('\n--- Gemma4 QA Output Start ---');
        console.log(generatedCode);
        console.log('--- Gemma4 QA Output End ---\n');
    });
});
