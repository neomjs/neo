import { test, expect } from '@playwright/test';
import '../../../../src/Neo.mjs';
import '../../../../src/core/_export.mjs';
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

    test('ships top-level deployment and maintenance policy defaults', async () => {
        expect(Config.orchestrator.deploymentMode).toBe('local');
        expect(Config.orchestrator.intervals).toMatchObject({
            pollMs          : 3000,
            summarySweepMs  : 10 * 60 * 1000,
            kbSyncMs        : 30 * 60 * 1000,
            backupMs        : 24 * 60 * 60 * 1000,
            primaryDevSyncMs: 10 * 60 * 1000,
            dreamMs         : 60 * 60 * 1000,
            goldenPathMs    : 60 * 60 * 1000,
            swarmHeartbeatMs: 15 * 60 * 1000
        });
        expect(Config.orchestrator.localOnly).toEqual({
            primaryDevSyncEnabled: null,
            kbSyncEnabled        : null,
            bridgeDaemonEnabled  : null,
            goldenPathRepoEnrichmentEnabled: null,
            swarmHeartbeatEnabled: null,
            wakeDispatchEnabled  : null
        });

        expect(Config.maintenance.backup).toEqual({
            intervalMs: 24 * 60 * 60 * 1000,
            retention: {
                keepMinimum: 3,
                maxDays    : 30
            }
        });
        expect(Config.maintenance.defrag).toEqual({
            intervalMs: 7 * 24 * 60 * 60 * 1000,
            snapshotRetention: {
                keepMinimum: 3,
                maxDays    : 7
            }
        });
    });
});
