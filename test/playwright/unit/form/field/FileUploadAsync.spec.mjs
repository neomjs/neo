import {setup} from '../../../setup.mjs';

setup({appConfig: {appName: 'TestApp'}});

import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';
import {test, expect} from '@playwright/test';
import FileUpload     from '../../../../../src/form/field/FileUpload.mjs';

test.describe('FileUpload Async Destruction', () => {
    let originalFetch;

    test.beforeEach(() => {
        originalFetch = globalThis.fetch;
    });

    test.afterEach(() => {
        if (originalFetch) {
            globalThis.fetch = originalFetch;
        }
    });

    test('deleteDocument() should reject when destroyed during fetch', async () => {
        let fetchResolve;
        globalThis.fetch = () => new Promise(resolve => { fetchResolve = resolve });

        const instance = Neo.create(FileUpload, {
            appName: 'TestApp',
            documentDeleteUrl: '/delete/1'
        });
        
        const deletePromise = instance.deleteDocument();

        instance.destroy();

        try {
            await deletePromise;
        } catch (e) {
            expect(e).toBe(Neo.isDestroyed);
        }

        fetchResolve({ status: 200 });
    });
});