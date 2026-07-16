import {setup} from '../../../../setup.mjs';

const appName = 'LaneLandscapeCensusWalkTest';

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
 * The census walk's whole job is to distinguish "the source says that is everything" from "the read
 * did not throw". These pin that distinction per branch: completeness is only ever claimed when the
 * source reported no next page, and every other exit names why it could not claim it.
 */
test.describe('laneLandscapeCensusWalk — exhaustion is proven, never assumed', () => {
    let walkCensusToExhaustion;

    // A fetcher whose pages are scripted: each entry is what the OWNING SOURCE reports for that page.
    const scriptedFetcher = pages => {
        const calls = [];

        return {
            calls,
            fetchPage: async ({cursor, limit}) => {
                calls.push({cursor, limit});
                const page = pages[calls.length - 1];

                if (page instanceof Error) throw page;

                return page
            }
        }
    };

    test.beforeAll(async () => {
        ({walkCensusToExhaustion} = await import('../../../../../../ai/services/graph/laneLandscapeCensusWalk.mjs'))
    });

    test('claims exhaustion ONLY when the source reports no next page', async () => {
        const {fetchPage} = scriptedFetcher([
            {items: [{id: 1}, {id: 2}], hasNextPage: false}
        ]);

        const result = await walkCensusToExhaustion({fetchPage, kind: 'open issues', limit: 50, maxPages: 10});

        expect(result.exhausted).toBe(true);
        expect(result.reason).toBeNull();
        expect(result.items).toHaveLength(2);
        expect(result.pages).toBe(1);
    });

    test('follows the source end cursor across pages and accumulates every item', async () => {
        const {fetchPage, calls} = scriptedFetcher([
            {items: [{id: 1}], hasNextPage: true,  endCursor: 'c1'},
            {items: [{id: 2}], hasNextPage: true,  endCursor: 'c2'},
            {items: [{id: 3}], hasNextPage: false}
        ]);

        const result = await walkCensusToExhaustion({fetchPage, kind: 'open issues', limit: 50, maxPages: 10});

        expect(result.exhausted).toBe(true);
        expect(result.items.map(item => item.id)).toEqual([1, 2, 3]);
        expect(calls.map(call => call.cursor)).toEqual([null, 'c1', 'c2']);
    });

    test('a short page does NOT end the walk — only the source ends it', async () => {
        // The assumption this module exists to kill: `items.length < limit` looks like the last page
        // and is not. Only the source's own hasNextPage may terminate a census.
        const {fetchPage} = scriptedFetcher([
            {items: [{id: 1}], hasNextPage: true, endCursor: 'c1'},
            {items: [{id: 2}], hasNextPage: false}
        ]);

        const result = await walkCensusToExhaustion({fetchPage, kind: 'open issues', limit: 50, maxPages: 10});

        expect(result.exhausted).toBe(true);
        expect(result.items).toHaveLength(2);
    });

    test('a thrown page truncates honestly and KEEPS the pages already collected', async () => {
        const {fetchPage} = scriptedFetcher([
            {items: [{id: 1}], hasNextPage: true, endCursor: 'c1'},
            new Error('network reset')
        ]);

        const result = await walkCensusToExhaustion({fetchPage, kind: 'open issues', limit: 50, maxPages: 10});

        expect(result.exhausted).toBe(false);
        expect(result.reason).toContain('page 2 failed');
        expect(result.reason).toContain('network reset');
        // partial evidence survives, labelled incomplete — an empty answer would be less honest
        expect(result.items).toHaveLength(1);
    });

    test('an error envelope truncates honestly rather than reading as an empty tail', async () => {
        const {fetchPage} = scriptedFetcher([
            {items: [{id: 1}], hasNextPage: true, endCursor: 'c1'},
            {error: 'GRAPHQL_API_ERROR'}
        ]);

        const result = await walkCensusToExhaustion({fetchPage, kind: 'open PRs', limit: 50, maxPages: 10});

        expect(result.exhausted).toBe(false);
        expect(result.reason).toContain('GRAPHQL_API_ERROR');
        expect(result.items).toHaveLength(1);
    });

    test('a next page without an end cursor is truncation, not completion', async () => {
        const {fetchPage} = scriptedFetcher([
            {items: [{id: 1}], hasNextPage: true}
        ]);

        const result = await walkCensusToExhaustion({fetchPage, kind: 'open issues', limit: 50, maxPages: 10});

        expect(result.exhausted).toBe(false);
        expect(result.reason).toContain('without an end cursor');
    });

    test('hitting the page bound is an honest truncation, never a silent stop', async () => {
        const {fetchPage} = scriptedFetcher([
            {items: [{id: 1}], hasNextPage: true, endCursor: 'c1'},
            {items: [{id: 2}], hasNextPage: true, endCursor: 'c2'}
        ]);

        const result = await walkCensusToExhaustion({fetchPage, kind: 'open issues', limit: 50, maxPages: 2});

        expect(result.exhausted).toBe(false);
        expect(result.reason).toContain('2-page bound');
        expect(result.items).toHaveLength(2);
    });

    test('fails LOUD on an unbound walk — a wiring bug must never look like an empty census', async () => {
        await expect(walkCensusToExhaustion({kind: 'open issues', limit: 50, maxPages: 10})).rejects.toThrow(/fetchPage/);
        await expect(walkCensusToExhaustion({fetchPage: async () => ({items: [], hasNextPage: false}), kind: 'x', maxPages: 10})).rejects.toThrow(/limit/);
        await expect(walkCensusToExhaustion({fetchPage: async () => ({items: [], hasNextPage: false}), kind: 'x', limit: 50})).rejects.toThrow(/maxPages/);
    });
});
