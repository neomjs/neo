import {test, expect}          from '@playwright/test';
import {verifyPersistedVector} from '../../../../../../ai/services/memory-core/helpers/verifyPersistedVector.mjs';

const DIM   = 4;
const VALID = [0.11, 0.22, 0.33, 0.44];

/**
 * Minimal content-store fake: only `get` (read-back) — deliberately NO `delete`, so any delete attempt
 * by the helper would throw and fail the test. That absence IS the "never deletes expected data" assertion.
 */
function fakeCollection({vectors = new Map(), failGet = false} = {}) {
    const getCalls = [];
    return {
        getCalls,
        get: async ({ids}) => {
            getCalls.push(ids);
            if (failGet) throw new Error('get down (spec)');
            const present = ids.filter(id => vectors.has(id));
            return {ids: present, embeddings: present.map(id => vectors.get(id))};
        }
    };
}

function recordingLog() {
    const warns = [];
    return {warns, warn: message => warns.push(message)};
}

test.describe('verifyPersistedVector — SessionService direct-upsert atomic-write Prevent', () => {
    test('valid persisted vector → null, no warn', async () => {
        const log    = recordingLog();
        const col    = fakeCollection({vectors: new Map([['a', [...VALID]]])});
        const reason = await verifyPersistedVector(col, 'a', DIM, log, 'session summary');

        expect(reason).toBeNull();
        expect(log.warns).toHaveLength(0);
    });

    test('metadata-only (no persisted vector) → reason + loud warn, NEVER deletes', async () => {
        const log    = recordingLog();
        const col    = fakeCollection({vectors: new Map()}); // upserted, but auto-embed left no vector
        const reason = await verifyPersistedVector(col, 'a', DIM, log, 'session summary');

        expect(reason).toBe('missing-embedding');
        expect(log.warns.join(' ')).toContain('metadata-only session summary');
        // The fake exposes no `delete`; the call completing without throwing proves the helper never deletes.
    });

    test('wrong-dimension persisted vector → wrong-dimension reason + warn', async () => {
        const log    = recordingLog();
        const col    = fakeCollection({vectors: new Map([['a', [0.1, 0.2]]])}); // dim 2 != 4
        const reason = await verifyPersistedVector(col, 'a', DIM, log, 'plan');

        expect(reason).toBe('wrong-dimension');
        expect(log.warns).toHaveLength(1);
    });

    test('read-back failure → null, warns, never throws (the persist path must not break)', async () => {
        const log    = recordingLog();
        const col    = fakeCollection({failGet: true});
        const reason = await verifyPersistedVector(col, 'a', DIM, log, 'session summary');

        expect(reason).toBeNull();
        expect(log.warns.join(' ')).toContain('read-back failed');
    });

    test('opt-in: without a known expectedDimension the verify no-ops (no read-back)', async () => {
        const log    = recordingLog();
        const col    = fakeCollection({vectors: new Map()});
        const reason = await verifyPersistedVector(col, 'a', undefined, log, 'session summary');

        expect(reason).toBeNull();
        expect(col.getCalls).toHaveLength(0);
        expect(log.warns).toHaveLength(0);
    });
});
