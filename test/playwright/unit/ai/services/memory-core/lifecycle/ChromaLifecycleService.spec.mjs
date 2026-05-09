import { setup } from '../../../../../setup.mjs';

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
import Neo                    from '../../../../../../../src/Neo.mjs';
import * as core              from '../../../../../../../src/core/_export.mjs';
import aiConfig               from '../../../../../../../ai/mcp/server/memory-core/config.mjs';
import ChromaLifecycleService from '../../../../../../../ai/services/memory-core/lifecycle/ChromaLifecycleService.mjs';

test.describe('Neo.ai.services.memory-core.lifecycle.ChromaLifecycleService — unified-mode bypass (#10007)', () => {
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

    test('initAsync short-circuits in unified mode even when autoStartDatabase=true', async () => {
        // Explicit coverage of the `initAsync` guard. Without this test, a future edit that reorders
        // the short-circuit below the `autoStartDatabase && engine` gate — or deletes it entirely
        // — would pass the other two tests (they call `startDatabase` / `manageDatabase` directly and
        // would still see the method-level guard). This test forces the bypass to be observable at
        // the init-flow level by setting autoStartDatabase=true (which would normally trigger spawn)
        // and asserting `chromaProcess` stays null.
        const originalUnified     = aiConfig.chromaUnified;
        const originalAutoStart   = aiConfig.autoStartDatabase;
        const originalInitPromise = ChromaLifecycleService._initPromise;

        try {
            aiConfig.chromaUnified             = true;
            aiConfig.autoStartDatabase         = true;
            ChromaLifecycleService._initPromise = null;

            await ChromaLifecycleService.initAsync();

            expect(ChromaLifecycleService.chromaProcess).toBeNull();
        } finally {
            aiConfig.chromaUnified             = originalUnified;
            aiConfig.autoStartDatabase         = originalAutoStart;
            ChromaLifecycleService._initPromise = originalInitPromise;
        }
    });

    test('shipped config template defaults chromaUnified=false — federated-mode startup path stays active', () => {
        // Default-posture guard: the shipped repository must not ship with chromaUnified=true.
        // Complements the equivalent guard in ChromaManager.spec.mjs (#10001) — both the routing
        // side and the lifecycle side must agree on the default topology.
        expect(aiConfig.chromaUnified).toBe(false);
    });
});
