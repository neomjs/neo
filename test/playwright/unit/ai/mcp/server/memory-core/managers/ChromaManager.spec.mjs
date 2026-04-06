import { setup } from '../../../../../../setup.mjs';

const appName = 'ChromaManagerTest';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name: appName,
        isMounted: () => true,
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../../../src/core/_export.mjs';
import aiConfig       from '../../../../../../../../ai/mcp/server/memory-core/config.mjs';
import ChromaManager  from '../../../../../../../../ai/mcp/server/memory-core/managers/ChromaManager.mjs';

test.describe('Neo.ai.mcp.server.memory-core.managers.ChromaManager', () => {
    test('should prevent console.warn global state theft during concurrent collection fetching', async () => {
        // Set up a custom warn logger to inspect leaks
        const warningLogs = [];
        const originalWarn = console.warn;

        console.warn = (...args) => {
            warningLogs.push(args.join(' '));
        };

        try {
            await ChromaManager.ready();

            // Mock the client to simulate async latency and rogue warnings
            ChromaManager.client = {
                getOrCreateCollection: async () => {
                    // Simulate Chroma DB latency
                    await new Promise(resolve => setTimeout(resolve, 50));

                    // Simulate Chroma's hardcoded schema wrapper warning
                    console.warn("No embedding function configuration found");
                    return { dummy: true };
                }
            };

            // Clear singleton caches to force concurrent fresh executions
            ChromaManager._memoryCollectionPromise  = null;
            ChromaManager._summaryCollectionPromise = null;

            // Execute simultaneously! Before the mutex, this would steal () => {}
            // and leave global console.warn permanently corrupt.
            const [mem, summary] = await Promise.all([
                ChromaManager.getMemoryCollection(),
                ChromaManager.getSummaryCollection()
            ]);

            expect(mem).toBeDefined();
            expect(summary).toBeDefined();

            // After they resolve, console.warn MUST still be our trackable mock, NOT () => {}
            console.warn("TEST_SHOULD_WORK");

            // The DUMMY_WARNING should NOT be captured (because the Mutex suppressed it!)
            expect(warningLogs).not.toContain("No embedding function configuration found");

            // The explicit test must be captured, proving the restore was lossless
            expect(warningLogs).toContain("TEST_SHOULD_WORK");

        } finally {
            // Un-mock
            console.warn = originalWarn;
        }
    });
});
