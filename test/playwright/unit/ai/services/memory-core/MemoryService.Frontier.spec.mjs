import { setup } from '../../../../setup.mjs';

const appName = 'MemoryServiceFrontierTest';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect}        from '@playwright/test';
import Neo                   from '../../../../../../src/Neo.mjs';
import * as core             from '../../../../../../src/core/_export.mjs';

test.describe('MemoryService — mutateFrontier', () => {
    let MemoryService;
    let GraphService;
    let GoldenPathSynthesizer;
    let originalMutateFrontier;
    let originalSynthesizeGoldenPath;
    let synthesizeCalled = false;

    test.beforeAll(async () => {
        // Pre-load the unified services bundle to ensure correct initialization order
        // and avoid ReferenceErrors from circular dependencies in dynamic imports.
        await import('../../../../../../ai/services.mjs');

        MemoryService = (await import('../../../../../../ai/services/memory-core/MemoryService.mjs')).default;
        GraphService = (await import('../../../../../../ai/services/memory-core/GraphService.mjs')).default;
        GoldenPathSynthesizer = (await import('../../../../../../ai/services/graph/GoldenPathSynthesizer.mjs')).default;
    });

    test.beforeEach(() => {
        synthesizeCalled = false;

        originalMutateFrontier = GraphService.mutateFrontier;
        GraphService.mutateFrontier = () => { return { success: true }; };

        originalSynthesizeGoldenPath = GoldenPathSynthesizer.synthesizeGoldenPath;
        GoldenPathSynthesizer.synthesizeGoldenPath = async () => {
            synthesizeCalled = true;
        };
    });

    test.afterEach(() => {
        GraphService.mutateFrontier = originalMutateFrontier;
        GoldenPathSynthesizer.synthesizeGoldenPath = originalSynthesizeGoldenPath;
    });

    test('mutateFrontier calls GoldenPathSynthesizer.synthesizeGoldenPath', async () => {
        const result = await MemoryService.mutateFrontier({ targetNodeId: 'test-node' });

        expect(result.message).toBe('Successfully mutated the context frontier.');

        // Let event loop clear since it's a floating promise
        await new Promise(resolve => setTimeout(resolve, 50));
        expect(synthesizeCalled).toBe(true);
    });
});
