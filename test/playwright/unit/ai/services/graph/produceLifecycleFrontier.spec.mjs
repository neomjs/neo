import {setup} from '../../../../setup.mjs';

const appName = 'ProduceLifecycleFrontierTest';

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

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';

/**
 * The source composition: injected reads → admitted items → one honest envelope. These pin the two
 * properties a peer's next action depends on — an unattested binding reads nothing and carries nothing,
 * and a source that failed never reads as a source that was empty.
 */
test.describe('produceLifecycleFrontier — injected source reads into one honest frontier', () => {
    let produceLifecycleFrontier, LIFECYCLE_SOURCES;

    const now   = new Date('2026-07-16T12:00:00.000Z'),
          ttlMs = 5 * 60 * 1000,
          agent = '@neo-opus-ada';

    const attested = {agentId: agent, harnessInstance: 'harness-1', resolution: 'agent-instance'};

    // A PR whose CURRENT head carries CHANGES_REQUESTED — stage 1, own-PR repair.
    const repairPr = {
        id                          : 'pr-15264',
        authorId                    : agent,
        state                       : 'OPEN',
        isDraft                     : false,
        headSha                     : 'abc123',
        mergeable                   : true,
        // Source-shaped: the review names the commit it reviewed AND when it was submitted. The clock
        // owner derives repairActionableSince from exactly this, so no caller supplies it.
        reviews  : [{state: 'CHANGES_REQUESTED', commitSha: 'abc123', submittedAt: '2026-07-16T11:00:00.000Z'}],
        checks   : [{name: 'unit', required: true, conclusion: 'SUCCESS', headSha: 'abc123', completedAt: '2026-07-16T10:30:00.000Z'}],
        checkedAt: '2026-07-16T12:00:00.000Z',
        url      : 'https://github.com/neomjs/neo/pull/15264'
    };

    const sources = (overrides = {}) => ({
        readPullRequests: async () => [repairPr],
        readTasks       : async () => [],
        readMessages    : async () => [],
        ...overrides
    });

    test.beforeAll(async () => {
        const mod = await import('../../../../../../ai/services/graph/produceLifecycleFrontier.mjs');
        produceLifecycleFrontier = mod.produceLifecycleFrontier;
        LIFECYCLE_SOURCES        = mod.LIFECYCLE_SOURCES;
    });

    test('an attested agent gets a fresh, stage-ordered frontier with an explicit expiry', async () => {
        const frontier = await produceLifecycleFrontier({scope: attested, sources: sources(), now, ttlMs});

        expect(frontier.schemaVersion).toBe('lifecycle-frontier.v1');
        expect(frontier.status).toBe('fresh');
        expect(frontier.notAuthority).toBe(true);
        expect(frontier.capturedAt).toBe('2026-07-16T12:00:00.000Z');
        // a lifecycle answer is perishable — the expiry is stated, never left for a reader to assume
        expect(frontier.expiresAt).toBe('2026-07-16T12:05:00.000Z');
        expect(frontier.coverage.sources).toEqual(LIFECYCLE_SOURCES);
        expect(frontier.coverage.degradedSources).toEqual([]);
        expect(frontier.items.map(item => item.stage)).toEqual(['own-pr-repair']);
    });

    test('an UNATTESTED binding reads no source at all — never-foreign beats complete', async () => {
        // Filtering foreign rows after reading would mean another peer's obligations were already in
        // memory, one bug away from being rendered. The read must not happen.
        let reads = 0;

        const frontier = await produceLifecycleFrontier({
            scope  : {agentId: null, harnessInstance: null, resolution: 'omitted'},
            sources: sources({
                readPullRequests: async () => { reads++; return [repairPr] },
                readTasks       : async () => { reads++; return [] },
                readMessages    : async () => { reads++; return [] }
            }),
            now,
            ttlMs,
            omittedReason: 'conflicted-identity'
        });

        expect(reads).toBe(0);
        expect(frontier.items).toEqual([]);
        // missing is NOT empty: the overlay is absent, which is a different fact from "nothing awaits you"
        expect(frontier.status).toBe('missing');
        expect(frontier.scope.resolution).toBe('omitted');
        expect(frontier.scope.omittedReason).toBe('conflicted-identity');
    });

    test('a failed source degrades ONLY its own row — the others survive intact', async () => {
        const frontier = await produceLifecycleFrontier({
            scope  : attested,
            sources: sources({readTasks: async () => { throw new Error('mailbox unavailable') }}),
            now,
            ttlMs
        });

        expect(frontier.status).toBe('degraded');
        expect(frontier.coverage.degradedSources).toHaveLength(1);
        expect(frontier.coverage.degradedSources[0]).toContain('tasks: mailbox unavailable');
        // the PR source answered, so its obligation must still reach the peer
        expect(frontier.items.map(item => item.stage)).toEqual(['own-pr-repair']);
    });

    test('a degraded source with zero items is NOT an empty frontier — the one wrong answer here', async () => {
        // "Nothing awaits you" is acted upon. An unknown must never be normalized into it.
        const frontier = await produceLifecycleFrontier({
            scope  : attested,
            sources: {
                readPullRequests: async () => { throw new Error('graphql down') },
                readTasks       : async () => [],
                readMessages    : async () => []
            },
            now,
            ttlMs
        });

        expect(frontier.items).toEqual([]);
        expect(frontier.status).toBe('degraded');
        expect(frontier.status).not.toBe('empty');
        expect(frontier.coverage.degradedSources[0]).toContain('pull-requests: graphql down');
    });

    test('an honestly empty frontier is a real answer, distinct from degraded and from missing', async () => {
        const frontier = await produceLifecycleFrontier({
            scope  : attested,
            sources: {readPullRequests: async () => [], readTasks: async () => [], readMessages: async () => []},
            now,
            ttlMs
        });

        expect(frontier.status).toBe('empty');
        expect(frontier.items).toEqual([]);
        expect(frontier.coverage.degradedSources).toEqual([]);
    });

    test('a MALFORMED source answer degrades — it is never laundered into healthy emptiness', async () => {
        // The reviewer's falsifier: readPullRequests() -> {} previously became rows:[], degraded:false,
        // status:'empty' — the exact false "nothing awaits you" this module says can never happen.
        // Coercing an unusable answer to [] turns "I could not read this" into "there is nothing here".
        for (const bad of [{}, null, 'rows', 42]) {
            const frontier = await produceLifecycleFrontier({
                scope  : attested,
                sources: sources({readPullRequests: async () => bad}),
                now,
                ttlMs
            });

            expect(frontier.status).toBe('degraded');
            expect(frontier.status).not.toBe('empty');
            expect(frontier.coverage.degradedSources.join(' ')).toContain('not a row list');
            expect(frontier.items).toEqual([]);
        }
    });

    test('EVERY non-attested resolution reads nothing — the gate is an allow-list, not one bad value', async () => {
        // The reviewer's falsifier: resolution 'inferred' ran all three reads before the envelope
        // rejected it. Rejecting after the read is filtering, not never-foreign — the foreign-capable
        // obligations were already in memory, one bug away from being rendered.
        for (const resolution of ['inferred', 'conflicted', 'agent-instance-ish', undefined, null]) {
            let reads = 0;

            const frontier = await produceLifecycleFrontier({
                scope  : {agentId: agent, harnessInstance: 'h', resolution},
                sources: {
                    readPullRequests: async () => { reads++; return [repairPr] },
                    readTasks       : async () => { reads++; return [] },
                    readMessages    : async () => { reads++; return [] }
                },
                now,
                ttlMs
            });

            expect(reads).toBe(0);
            expect(frontier.status).toBe('missing');
            expect(frontier.items).toEqual([]);
            expect(frontier.scope.resolution).toBe('omitted');
        }
    });

    test('an attested resolution with NO agentId is unattested — a category alone is not an identity', async () => {
        let reads = 0;

        const frontier = await produceLifecycleFrontier({
            scope  : {agentId: '', harnessInstance: 'h', resolution: 'agent-instance'},
            sources: sources({readPullRequests: async () => { reads++; return [repairPr] }}),
            now,
            ttlMs
        });

        expect(reads).toBe(0);
        expect(frontier.status).toBe('missing');
    });

    test('fails LOUD on an unbound source or a missing clock — a wiring bug is not a degradation', async () => {
        await expect(produceLifecycleFrontier({scope: attested, sources: {readPullRequests: async () => []}, now, ttlMs}))
            .rejects.toThrow(/readPullRequests, readTasks, and readMessages/);

        await expect(produceLifecycleFrontier({scope: attested, sources: sources(), now: undefined, ttlMs}))
            .rejects.toThrow(/now must be a valid Date/);

        await expect(produceLifecycleFrontier({scope: attested, sources: sources(), now, ttlMs: undefined}))
            .rejects.toThrow(/positive ttlMs is required/);
    });
});
