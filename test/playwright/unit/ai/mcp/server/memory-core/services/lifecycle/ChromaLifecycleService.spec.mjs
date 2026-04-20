import { setup } from '../../../../../../../setup.mjs';

const appName = 'ChromaLifecycleServiceTest';

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

import {test, expect}         from '@playwright/test';
import Neo                    from '../../../../../../../../../src/Neo.mjs';
import * as core              from '../../../../../../../../../src/core/_export.mjs';
import aiConfig               from '../../../../../../../../../ai/mcp/server/memory-core/config.mjs';
import ChromaLifecycleService from '../../../../../../../../../ai/mcp/server/memory-core/services/lifecycle/ChromaLifecycleService.mjs';

test.describe('Neo.ai.mcp.server.memory-core.services.lifecycle.ChromaLifecycleService — unified-mode bypass (#10007)', () => {
    test('startDatabase returns skipped_unified_mode when chromaUnified=true', async () => {
        const original = aiConfig.chromaUnified;

        try {
            aiConfig.chromaUnified = true;
            const result = await ChromaLifecycleService.startDatabase();

            expect(result.status).toBe('skipped_unified_mode');
            expect(result.detail).toMatch(/downstream client of the Knowledge Base/i);
            // Guard against accidental spawn: nothing should have populated chromaProcess.
            expect(ChromaLifecycleService.chromaProcess).toBeNull();
        } finally {
            aiConfig.chromaUnified = original;
        }
    });

    test('manageDatabase({action:"start"}) propagates skipped_unified_mode in unified mode', async () => {
        const original = aiConfig.chromaUnified;

        try {
            aiConfig.chromaUnified = true;
            const result = await ChromaLifecycleService.manageDatabase({action: 'start'});

            expect(result.status).toBe('skipped_unified_mode');
            expect(ChromaLifecycleService.chromaProcess).toBeNull();
        } finally {
            aiConfig.chromaUnified = original;
        }
    });

    test('shipped config template defaults chromaUnified=false — federated-mode startup path stays active', () => {
        // Default-posture guard: the shipped repository must not ship with chromaUnified=true.
        // Complements the equivalent guard in ChromaManager.spec.mjs (#10001) — both the routing
        // side and the lifecycle side must agree on the default topology.
        expect(aiConfig.chromaUnified).toBe(false);
    });
});
