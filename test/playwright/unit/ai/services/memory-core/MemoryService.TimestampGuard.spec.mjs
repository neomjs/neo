import {setup} from '../../../../setup.mjs';

const appName = 'MemoryServiceTimestampGuardTest';

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

import {test, expect}                from '@playwright/test';
import Neo                           from '../../../../../../src/Neo.mjs';
import * as core                     from '../../../../../../src/core/_export.mjs';
import MemoryService                 from '../../../../../../ai/services/memory-core/MemoryService.mjs';
import StorageRouter                 from '../../../../../../ai/services/memory-core/managers/StorageRouter.mjs';
import {resolveRowTimestamp}         from '../../../../../../ai/services/memory-core/helpers/resolveRowTimestamp.mjs';
import {buildMemoryResolveCandidate} from '../../../../../../ai/services/memory-core/conceptWalkMemoryGate.mjs';

/**
 * Memory-row timestamp projection guard.
 *
 * `Date#toISOString()` raises `RangeError: Invalid time value` on an Invalid Date, and both Memory
 * Service projections called it once per row INSIDE the result map — so a single row with an absent
 * or unparseable `timestamp` threw, the method-level `catch` escalated it to a whole-call error, and
 * every well-formed co-resident row was discarded.
 *
 * This is the same defect the summaries surface carried, on the path agents fall back to when the
 * summaries surface fails — so the redundancy layer shared the hole it was covering for.
 *
 * The concept-walk gate arm is the subtle one: that projection was already ternary-guarded, but on
 * TRUTHINESS rather than parseability, so an unparseable-but-truthy stored value passed the check
 * and still threw.
 *
 * Safety: pure in-memory spy collection — `StorageRouter.getMemoryCollection` is overridden in
 * `beforeEach` and restored in `afterEach`. No call reaches real ChromaDB.
 */

/** Values a stored `timestamp` can hold that `new Date(...)` cannot project. Pinned by the control. */
const UNPROJECTABLE_TIMESTAMPS = [undefined, '', 'not-a-date', NaN, {}];

function createSpyCollection() {
    const rows = new Map();

    return {
        rows,

        async get({ids} = {}) {
            const entries = ids
                ? ids.map(id => rows.get(id)).filter(Boolean)
                : Array.from(rows.values());

            return {
                ids      : entries.map(e => e.id),
                metadatas: entries.map(e => e.metadata),
                documents: entries.map(e => e.document)
            };
        },

        async query({nResults} = {}) {
            const entries = Array.from(rows.values()).slice(0, nResults ?? rows.size);

            return {
                ids      : [entries.map(e => e.id)],
                distances: [entries.map(() => 0)],
                metadatas: [entries.map(e => e.metadata)],
                documents: [entries.map(e => e.document)]
            };
        }
    };
}

function seedMemory(spy, id, timestamp, prompt) {
    const metadata = {sessionId: 's-1', prompt, type: 'agent-interaction'};

    // Distinguish an ABSENT key from a key present with an unprojectable value.
    if (timestamp !== undefined) {
        metadata.timestamp = timestamp;
    }

    spy.rows.set(id, {id, metadata, document: prompt});
}

test.describe('Neo.ai.services.memory-core.MemoryService — timestamp projection guard (#17082)', () => {
    let spy;
    let originalGetMemoryCollection;

    test.beforeEach(() => {
        spy                               = createSpyCollection();
        originalGetMemoryCollection       = StorageRouter.getMemoryCollection;
        StorageRouter.getMemoryCollection = async () => spy;
    });

    test.afterEach(() => {
        StorageRouter.getMemoryCollection = originalGetMemoryCollection;
    });

    test('the seeded malformed values really are unprojectable (positive control)', () => {
        // Without this, "the call no longer throws" could pass simply because the fixture never
        // carried a value capable of throwing under the pre-fix expression.
        UNPROJECTABLE_TIMESTAMPS.forEach(value => {
            expect(() => new Date(value).toISOString()).toThrow(/Invalid time value/);
        });
    });

    test('queryMemories returns well-formed rows instead of failing on one malformed row', async () => {
        seedMemory(spy, 'm-good-1', 1700000000000, 'Good 1');
        seedMemory(spy, 'm-bad',    'not-a-date',   'Malformed');
        seedMemory(spy, 'm-good-2', 1700000001000, 'Good 2');

        const view = await MemoryService.queryMemories({query: 'anything', nResults: 10});

        // An error envelope here is the pre-fix behavior.
        expect(view.error).toBeUndefined();
        expect(view.count).toBe(3);
        expect(view.malformedTimestamps).toBe(1);

        const malformed = view.results.find(r => r.prompt === 'Malformed');

        expect(malformed.timestamp).toBeNull();
        expect(view.results.find(r => r.prompt === 'Good 1').timestamp)
            .toBe(new Date(1700000000000).toISOString());
    });

    test('listMemories applies the same guard on the id-scoped projection', async () => {
        seedMemory(spy, 'm-good-1', 1700000000000, 'Good 1');
        seedMemory(spy, 'm-bad',    '',             'Malformed');

        const view = await MemoryService.listMemories({sessionId: 's-1', limit: 10});

        expect(view.error).toBeUndefined();
        expect(view.count).toBe(2);
        expect(view.malformedTimestamps).toBe(1);
        expect(view.memories.find(m => m.prompt === 'Malformed').timestamp).toBeNull();
    });

    test('every unprojectable shape is counted rather than thrown, on both paths', async () => {
        UNPROJECTABLE_TIMESTAMPS.forEach((value, index) => seedMemory(spy, `m-bad-${index}`, value, `Bad ${index}`));

        const queried = await MemoryService.queryMemories({query: 'anything', nResults: 20});
        const listed  = await MemoryService.listMemories({sessionId: 's-1', limit: 20});

        expect(queried.error).toBeUndefined();
        expect(listed.error).toBeUndefined();
        expect(queried.malformedTimestamps).toBe(UNPROJECTABLE_TIMESTAMPS.length);
        expect(listed.malformedTimestamps).toBe(UNPROJECTABLE_TIMESTAMPS.length);
        expect(queried.results.every(r => r.timestamp === null)).toBe(true);
        expect(listed.memories.every(m => m.timestamp === null)).toBe(true);
    });

    test('malformedTimestamps is omitted when every row projects cleanly', async () => {
        seedMemory(spy, 'm-good-1', 1700000000000, 'Good 1');
        seedMemory(spy, 'm-good-2', 1700000001000, 'Good 2');

        const queried = await MemoryService.queryMemories({query: 'anything', nResults: 10});
        const listed  = await MemoryService.listMemories({sessionId: 's-1', limit: 10});

        // Absence is the signal for "nothing malformed" — asserted so it stays a contract rather
        // than an accident of object spreading.
        expect(queried).not.toHaveProperty('malformedTimestamps');
        expect(listed).not.toHaveProperty('malformedTimestamps');
    });

    test('the concept-walk gate rejects an unparseable-but-TRUTHY timestamp that its old ternary passed', async () => {
        // The prior guard was `metadata.timestamp ? new Date(...).toISOString() : null`. A corrupted
        // string is truthy, so it passed the check and threw — the absent case was covered, the
        // unparseable case was not. This is the cell where the two guards disagree.
        expect('not-a-date' ? true : false).toBe(true);          // truthy: the old ternary admitted it
        expect(() => new Date('not-a-date').toISOString()).toThrow(/Invalid time value/); // and then threw

        const collection = {
            async get({ids}) {
                return {
                    ids,
                    metadatas: [{sessionId: 's-1', prompt: 'walked', timestamp: 'not-a-date'}],
                    documents: ['walked']
                };
            }
        };

        const resolveCandidate = buildMemoryResolveCandidate({
            collection,
            userId             : null,
            policy             : 'team',
            sharedUserId       : 'shared',
            resolveTrustTier   : () => 'peer-trusted',
            matchesMinTrustTier: () => true
        });

        const candidate = await resolveCandidate('mem-1', {neighborLabel: 'AGENT_MEMORY'});

        expect(candidate).not.toBeNull();
        expect(candidate.timestamp).toBeNull();
        expect(candidate.prompt).toBe('walked');
    });

    test('resolveRowTimestamp projects, nulls, and keeps null-coercion parity (unit-level)', () => {
        expect(resolveRowTimestamp({timestamp: 1700000000000})).toBe(new Date(1700000000000).toISOString());
        expect(resolveRowTimestamp({timestamp: '2026-08-13T22:00:00.000Z'})).toBe('2026-08-13T22:00:00.000Z');

        UNPROJECTABLE_TIMESTAMPS.forEach(value => {
            expect(resolveRowTimestamp({timestamp: value})).toBeNull();
        });

        expect(resolveRowTimestamp({})).toBeNull();
        expect(resolveRowTimestamp(undefined)).toBeNull();

        // PARITY, deliberately unchanged: `new Date(null)` is epoch 0, NOT an Invalid Date, so a
        // null-valued timestamp has always projected as 1970 rather than throwing. Narrowing that
        // would change output for already-stored rows — a corpus-data decision, not throw-safety.
        expect(resolveRowTimestamp({timestamp: null})).toBe(new Date(0).toISOString());
    });
});
