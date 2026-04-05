import { test, expect } from '@playwright/test';
import '../../../../src/Neo.mjs';
import '../../../../src/core/_export.mjs';
import '../../../../src/manager/Instance.mjs';
import MC_Config from '../../../../ai/mcp/server/memory-core/config.mjs';
import ChromaManager from '../../../../ai/mcp/server/memory-core/managers/ChromaManager.mjs';

test.describe('ChromaDB Recovery Test', () => {
    let isOnline = false;

    test.beforeAll(async () => {
        try {
            await ChromaManager.ready();
            isOnline = true;
        } catch (e) {
            console.warn('Chroma server is offline. Skipping recovery tests.');
        }
    });

    test('should fetch memories gracefully without bounds errors', async () => {
        test.skip(!isOnline, 'ChromaDB is not running.');

        const col = await ChromaManager.getMemoryCollection();
        const count = await col.count();
        console.log(`Total memories: ${count}`);

        const batchSize = 100;
        let offset = 0;
        let successful = 0;

        while (offset < count) {
            try {
                const batch = await col.get({
                    include: ["documents"],
                    limit: batchSize,
                    offset: offset
                });
                successful += batch.ids.length;
            } catch (e) {
                console.error(`Failed at offset ${offset}: ${e.message}`);
                break;
            }
            offset += batchSize;
        }

        // Must successfully map exactly equal to the count, natively supporting 0 on fresh installs.
        expect(successful).toEqual(count);
    });
});
