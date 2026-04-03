import {setup} from '../../../setup.mjs';

const appName = 'LibrarianAgentTest';

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
import path            from 'path';
import {fileURLToPath} from 'url';
import dotenv          from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
dotenv.config({path: path.resolve(__dirname, '../../../../../.env'), quiet: true});

test.describe('Librarian Sub-Agent Orchestration', () => {
    let primaryAgent;

    test.afterAll(async () => {
        if (primaryAgent) {
            await primaryAgent.disconnect();
        }
    });

    test('Primary Agent delegates research task to Librarian via Loop tool execution', async () => {
        // Skip test in CI environments without API keys
        test.skip(!process.env.GEMINI_API_KEY, 'Skipping: GEMINI_API_KEY not found');

        // Note: The primary agent itself does not need any MCP servers connected.
        // It relies purely on the delegation architecture to communicate with the sub-agent.
        primaryAgent = Neo.create(Agent, {
            servers: []
        });

        await primaryAgent.initAsync();

        // We wrap the delegate method to verify it was executed correctly
        let delegateCalled      = false;
        let delegatedAgentAlias = null;
        
        const originalDelegate = primaryAgent.delegate;
        primaryAgent.delegate = async function(profileName, request) {
            delegateCalled      = true;
            delegatedAgentAlias = profileName;
            
            // To ensure test speed and reliability without actually querying the real MCP graph, 
            // we mock the sub-agent's response. In a true integration test against an active Graph DB,
            // we would `return await originalDelegate.call(this, profileName, request);`
            return 'Mock Synthesis: Neo.component.Base is the foundation for all UI components.';
        };

        // We MUST mock the ContextAssembler to prevent it from attempting real DB queries
        // via thick-client connections to ChromaDB, ensuring this remains a decoupled unit test.
        primaryAgent.loop.assembler.assemble = async function({systemPrompt, userQuery}) {
            return {
                system: systemPrompt,
                messages: [{ role: 'user', content: userQuery }]
            };
        };

        // We use a highly explicit prompt to force Gemini to output a manual JSON tool call
        // so our fallback parser inside Loop.mjs intercepts it and triggers `delegate_task`.
        const event = {
            type: 'user:input',
            priority: 'high',
            data: 'You must research the architectural purpose of Neo.component.Base. You do not have the context. You MUST delegate this by outputting strictly the following JSON object and nothing else: { "tool": "delegate_task", "agent": "librarian", "query": "What is the architectural purpose of Neo.component.Base?" }'
        };

        // Bypass the scheduler and force synchronous processing for the test environment
        const finalAnswer = await primaryAgent.loop.processEvent(event);

        expect(delegateCalled).toBeTruthy();
        expect(delegatedAgentAlias).toBe('librarian');
        expect(finalAnswer).toBeDefined();
        
        // Output for debugging
        console.log('[Playwright E2E] Primary Agent resolved final answer:', finalAnswer);
    });
});
