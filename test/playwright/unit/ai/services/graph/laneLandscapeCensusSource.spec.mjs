import {setup} from '../../../../setup.mjs';

const appName = 'LaneLandscapeCensusSourceTest';

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
 * The source adapter's contract is a split of authority: the census comes from the source that OWNS the
 * facts (walked to exhaustion), while the graph supplies only the relation edges it genuinely owns.
 * These pin that split, and that the manifest never claims more than the walk actually proved.
 */
test.describe('laneLandscapeCensusSource — owning source for facts, graph for relations', () => {
    let makeLandscapeCensusSource;

    // One-page fetchers whose source-reported pagination is scripted per family.
    const page = (items, {hasNextPage = false, endCursor = null} = {}) => async () => ({items, hasNextPage, endCursor});

    // Stands in for the graph service's RLS-safe enumeration, recording what the census asked it for.
    const stubEdgeSeam = (records, {truncated = false} = {}) => {
        const calls = [];
        const seam  = args => { calls.push(args); return {records, truncated} };

        seam.calls = calls;
        return seam
    };

    const baseDeps = () => ({
        fetchIssuesPage      : page([]),
        fetchPullRequestsPage: page([]),
        listEdgeRecordsByType: stubEdgeSeam([]),
        pageLimit            : 50,
        maxPages             : 10,
        edgeLimit            : 5000
    });

    test.beforeAll(async () => {
        ({makeLandscapeCensusSource} = await import('../../../../../../ai/services/graph/laneLandscapeCensusSource.mjs'))
    });

    test('censuses BOTH families as first-class kind-discriminated rows — a PR is not edge decoration', async () => {
        const source = makeLandscapeCensusSource({
            ...baseDeps(),
            fetchIssuesPage      : page([{number: 15234, state: 'OPEN'}]),
            fetchPullRequestsPage: page([{number: 15264, state: 'OPEN'}])
        });

        const {items, manifest} = await source.queryOpenWorkCensus();

        expect(items).toHaveLength(2);
        expect(items.find(item => item.number === 15234).kind).toBe('issue');
        // the PR is its own row: an unlinked PR is still open work the landscape must not hide
        expect(items.find(item => item.number === 15264).kind).toBe('pr');
        expect(manifest.exhausted).toBe(true);
        expect(manifest.reasons).toEqual([]);
    });

    test('the manifest is exhausted only when BOTH families are — a missing family is not a complete landscape', async () => {
        const source = makeLandscapeCensusSource({
            ...baseDeps(),
            fetchIssuesPage      : page([{number: 1, state: 'OPEN'}]),
            // the PR family claims a next page but hands back no cursor: truncation, not completion
            fetchPullRequestsPage: page([{number: 2, state: 'OPEN'}], {hasNextPage: true})
        });

        const {items, manifest} = await source.queryOpenWorkCensus();

        expect(manifest.exhausted).toBe(false);
        expect(manifest.reasons.join(' ')).toContain('open pull requests');
        // the truncated family's evidence survives rather than being discarded
        expect(items).toHaveLength(2);
    });

    test('one family failing does NOT erase the other family evidence', async () => {
        const source = makeLandscapeCensusSource({
            ...baseDeps(),
            fetchIssuesPage      : page([{number: 1, state: 'OPEN'}]),
            fetchPullRequestsPage: async () => { throw new Error('graphql down') }
        });

        const {items, manifest} = await source.queryOpenWorkCensus();

        expect(items.map(item => item.number)).toEqual([1]);
        expect(manifest.exhausted).toBe(false);
        expect(manifest.reasons.join(' ')).toContain('graphql down');
    });

    test('relation edges come from the graph RLS seam — never a raw handle — bounded to landscape types', async () => {
        const seam   = stubEdgeSeam([{source: 'issue-1', target: 'issue-2', type: 'BLOCKS'}]),
              source = makeLandscapeCensusSource({...baseDeps(), listEdgeRecordsByType: seam, edgeLimit: 4096}),
              result = await source.queryRelationEdges();

        expect(result.edges).toEqual([{source: 'issue-1', target: 'issue-2', type: 'BLOCKS'}]);
        expect(result.manifest.exhausted).toBe(true);
        // a landscape is not the whole graph: only the two structural edge types are asked for
        expect(seam.calls[0]).toEqual({types: ['PARENT_OF', 'BLOCKS'], limit: 4096});
    });

    test('a CLIPPED relation read refuses to claim exhaustion — a partial topology is not the structure', async () => {
        // The item census can be provably complete while the relation read is not; a dependency path
        // built on clipped edges is missing links it cannot name, so the read must say so.
        const source = makeLandscapeCensusSource({
            ...baseDeps(),
            listEdgeRecordsByType: stubEdgeSeam([{source: 'issue-1', target: 'issue-2', type: 'BLOCKS'}], {truncated: true}),
            edgeLimit            : 1
        });

        const {edges, manifest} = await source.queryRelationEdges();

        expect(manifest.exhausted).toBe(false);
        expect(manifest.reasons.join(' ')).toContain('1-record bound');
        // the partial evidence survives, labelled — not discarded
        expect(edges).toHaveLength(1);
    });

    test('fails LOUD on an unbound source — a wiring bug must never read as an empty landscape', () => {
        expect(() => makeLandscapeCensusSource({...baseDeps(), fetchIssuesPage      : undefined})).toThrow(/fetchIssuesPage/);
        expect(() => makeLandscapeCensusSource({...baseDeps(), fetchPullRequestsPage: undefined})).toThrow(/fetchPullRequestsPage/);
        expect(() => makeLandscapeCensusSource({...baseDeps(), listEdgeRecordsByType: undefined})).toThrow(/listEdgeRecordsByType/);
        // an un-materialized config leaf must fail loud rather than fall back to a local bound
        expect(() => makeLandscapeCensusSource({...baseDeps(), edgeLimit: undefined})).toThrow(/edgeLimit/);
    });
});
