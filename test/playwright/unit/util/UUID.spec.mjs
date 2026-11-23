import {setup} from '../../setup.mjs';

setup({appConfig: {name: 'UUIDTest'}});

import {test, expect} from '@playwright/test';
import {generateUUID} from '../../../../src/util/UUID.mjs';

test.describe('Neo.util.UUID', () => {
    test('generates unique version-4 UUIDs without the secure-context-only API', () => {
        Object.defineProperty(crypto, 'randomUUID', {configurable: true, value: undefined});

        try {
            const ids = Array.from({length: 100}, () => generateUUID());

            expect(new Set(ids).size).toBe(100);
            ids.forEach(id => expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/))
        } finally {
            delete crypto.randomUUID
        }

        expect(typeof crypto.randomUUID, 'the test browser crypto API is restored').toBe('function')
    });
});
