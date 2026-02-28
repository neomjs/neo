import {setup} from '../../../setup.mjs';

const appName = 'DevIndexProfileTest';

setup({
    appConfig: {
        name: appName
    }
});

import {test, expect}    from '@playwright/test';
import fs                from 'fs';
import path              from 'path';
import Neo               from '../../../../../src/Neo.mjs';
import * as core         from '../../../../../src/core/_export.mjs';
import InstanceManager   from '../../../../../src/manager/Instance.mjs';
import ContributorsStore from '../../../../../apps/devindex/store/Contributors.mjs';

test.describe.serial('DevIndex Store Filtering Profile', () => {

    test('Profile first-time filter on real dataset', async () => {
        // Prevent autoLoad because StreamProxy might not work in Node.js tests easily
        const store = Neo.create(ContributorsStore, {
            autoLoad: false,
            proxy   : null
        });

        // Manually load the JSONL file for deterministic Node.js testing
        const filePath    = path.join(process.cwd(), 'apps/devindex/resources/data/users.jsonl');
        const fileContent = fs.readFileSync(filePath, 'utf-8');

        // Parse JSONL
        const data  = [];
        const lines = fileContent.split(/\r?\n/);
        for (const line of lines) {
            if (line.trim()) {
                data.push(JSON.parse(line));
            }
        }

        // Add to store
        store.add(data);
        expect(store.count).toBe(data.length);

        const start = performance.now();

        // Trigger the Country filter
        store.getFilter('countryCode').value = 'DE';

        const duration = performance.now() - start;

        // With clone: 'shallow' on items_ config, this should take < 400ms.
        // With the default clone: 'deep', it was taking ~800-1000ms.
        expect(duration).toBeLessThan(400);

        expect(store.count).toBeGreaterThan(0);
        expect(store.count).toBeLessThan(data.length);
    });
});
