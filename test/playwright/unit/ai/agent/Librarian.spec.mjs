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
        // Since this now tests actual inference and GraphRAG IO, we increase the timeout block
        test.setTimeout(180_000);

        // Skip test in CI environments without API keys
        test.skip(!process.env.GEMINI_API_KEY, 'Skipping: GEMINI_API_KEY not found');

        // Note: The primary agent itself does not need any MCP servers connected.
        // It relies purely on the delegation architecture to communicate with the sub-agent.
        primaryAgent = Neo.create(Agent, {
            servers: []
        });

        await primaryAgent.initAsync();

        // We wrap the delegate method to verify it was executed correctly natively
        let delegateCalled      = false;
        let delegatedAgentAlias = null;
        
        const originalDelegate = primaryAgent.delegate;
        primaryAgent.delegate = async function(profileName, request) {
            delegateCalled      = true;
            delegatedAgentAlias = profileName;
            
            // Execute the true delegation and sub-agent boot
            return await originalDelegate.call(this, profileName, request);
        };

        // Since delegate_task is now injected natively into the Loop's tools array,
        // we can simply instruct the model to use the tool, and it will trigger it natively.
        const event = {
            type: 'user:input',
            priority: 'high',
            data: 'You must research the exact architectural purpose of Neo.component.Base. You do not have the context. Delegate this to the "librarian" sub-agent using the delegate_task tool. Once you get the result, formulate your final answer. Please include specific details retrieved from the architectural context.'
        };

        // Bypass the scheduler and force synchronous processing for the test environment
        const finalAnswer = await primaryAgent.loop.processEvent(event);

        console.log('\n--- E2E GraphRAG Synthesis Output ---\n', finalAnswer, '\n-------------------------------------\n');

        expect(delegateCalled).toBeTruthy();
        expect(delegatedAgentAlias).toBe('librarian');
        expect(typeof finalAnswer).toBe('string');
        expect(finalAnswer.length).toBeGreaterThan(50);
    });
});
