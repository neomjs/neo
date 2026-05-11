import { test, expect } from '@playwright/test';
import '../../../../src/Neo.mjs';
import Config from '../../../../ai/config.template.mjs';

test.describe('Tier 1 Config Immutability', () => {
    test('defaultConfig remains unmutated across singleton instantiations', async () => {
        const initialPort = Config.mcpHttpPort;

        // Modify through the singleton instance
        Config.data.mcpHttpPort = 9999;
        expect(Config.mcpHttpPort).toBe(9999);

        // Re-run construct to re-clone from defaultConfig using the unwrapped instance
        Neo.ns('Neo.ai.Config').construct({});

        // The re-cloned instance should not inherit the mutated port
        expect(Neo.ns('Neo.ai.Config').data.mcpHttpPort).not.toBe(9999);
        expect(Neo.ns('Neo.ai.Config').data.mcpHttpPort).toBe(initialPort);
    });

    test('ships a machine-neutral orchestrator dev-sync root default', async () => {
        expect(Config.orchestrator.devSyncRoots).toEqual([]);
    });
});
