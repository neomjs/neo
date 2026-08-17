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

/**
 * A structurally unreachable census source.
 *
 * A deployment can legitimately be unable to reach the source that owns the facts — the cloud-plane
 * server cannot read GitHub, because that capability is host-edge by design. That is not a wiring bug
 * and not an outage, and it has exactly two wrong answers available, both of which look reasonable:
 *
 * - **Omit the readers.** `makeLandscapeCensusSource` is fail-closed, so the tool throws and dies.
 * - **Return an empty page.** The walk reads `hasNextPage: false` as the source PROVING there is no
 *   next page, so the landscape asserts zero open issues and zero open PRs — confident and wrong.
 *
 * The second is the dangerous one, and the control below is what makes these tests mean anything: it
 * pins that an empty reader really does produce `exhausted: true`, so the refusing reader is shown to
 * differ from the tempting alternative rather than merely from nothing.
 */
test.describe('laneLandscapeCensusSource — a source this plane cannot reach (#17285)', () => {
    let makeLandscapeCensusSource, makeRefusingCensusPageReader;

    const reason       = 'the open-work census reads GitHub, which is a host-edge capability this cloud-plane server does not carry',
          emptyPage    = async () => ({items: [], hasNextPage: false}),
          stubEdgeSeam = () => ({records: [], truncated: false});

    const depsWith = readers => ({
        listEdgeRecordsByType: stubEdgeSeam,
        pageLimit            : 50,
        maxPages             : 10,
        edgeLimit            : 5000,
        ...readers
    });

    test.beforeAll(async () => {
        ({makeLandscapeCensusSource, makeRefusingCensusPageReader} =
            await import('../../../../../../ai/services/graph/laneLandscapeCensusSource.mjs'))
    });

    test('POSITIVE CONTROL: an EMPTY reader reports proven exhaustion — the confident-wrong answer', async () => {
        // Without this, the refusal test below would pass against an implementation that changed nothing:
        // it is only meaningful because the obvious alternative genuinely produces `exhausted: true`.
        const source = makeLandscapeCensusSource(depsWith({
            fetchIssuesPage      : emptyPage,
            fetchPullRequestsPage: emptyPage
        }));

        const {items, manifest} = await source.queryOpenWorkCensus();

        expect(items).toHaveLength(0);
        expect(manifest.exhausted).toBe(true);   // ← zero open work, asserted as FACT
        expect(manifest.reasons).toEqual([]);
    });

    test('a refusing reader degrades the census instead: unknown, never zero', async () => {
        const source = makeLandscapeCensusSource(depsWith({
            fetchIssuesPage      : makeRefusingCensusPageReader(reason),
            fetchPullRequestsPage: makeRefusingCensusPageReader(reason)
        }));

        const {items, manifest} = await source.queryOpenWorkCensus();

        // Same zero rows as the control — and the opposite meaning, which is the entire point.
        expect(items).toHaveLength(0);
        expect(manifest.exhausted).toBe(false);
        expect(manifest.reasons).toHaveLength(2);   // both families refused, neither erases the other

        // The boundary reaches the operator, not just the symptom: `degraded` alone would not say WHY.
        for (const entry of manifest.reasons) {
            expect(entry).toContain('host-edge');
            // rendered as a deployment fact, never as a fault — see the DISCRIMINATOR test below
            expect(entry).toContain('unavailable on this plane')
        }
        expect(manifest.unavailable).toBe(true);
        expect(manifest.reasons.some(entry => entry.includes('open issues'))).toBe(true);
        expect(manifest.reasons.some(entry => entry.includes('open pull requests'))).toBe(true);
    });

    test('the refusal degrades the census WITHOUT taking the tool down', async () => {
        // The failure mode this whole shape exists to avoid: removing the readers entirely throws from
        // the constructor, so a plane boundary would surface as a dead tool rather than a degraded one.
        expect(() => makeLandscapeCensusSource(depsWith({}))).toThrow(/fetchIssuesPage/);

        const source = makeLandscapeCensusSource(depsWith({
            fetchIssuesPage      : makeRefusingCensusPageReader(reason),
            fetchPullRequestsPage: makeRefusingCensusPageReader(reason)
        }));

        // …whereas the refusing reader resolves normally. The relation leg still works, because the
        // graph DOES own edges on this plane — only the census source is out of reach.
        await expect(source.queryOpenWorkCensus()).resolves.toBeTruthy()
    });

    test('DISCRIMINATOR: a by-design refusal and a genuine transient are not the same outcome', async () => {
        // The finding this test exists for, caught by @neo-opus-grace in review: both leave the census
        // incomplete, and rendering both as "page N failed" made them differ only by the prose inside
        // the parentheses. A consumer wanting to branch would have had to string-match, which is a
        // coupling rather than a seam — and it would have sent someone hunting a fault that does not
        // exist. Asserted as a PAIR, because "the refusal says unavailable" is worth nothing unless a
        // real fault still says failed.
        const refused = makeLandscapeCensusSource(depsWith({
            fetchIssuesPage      : makeRefusingCensusPageReader(reason),
            fetchPullRequestsPage: makeRefusingCensusPageReader(reason)
        }));

        const broken = makeLandscapeCensusSource(depsWith({
            fetchIssuesPage      : async () => { throw new Error('socket hang up') },
            fetchPullRequestsPage: async () => { throw new Error('socket hang up') }
        }));

        const refusedResult = await refused.queryOpenWorkCensus(),
              brokenResult  = await broken.queryOpenWorkCensus();

        // Identical on the axis that says "incomplete"…
        expect(refusedResult.manifest.exhausted).toBe(false);
        expect(brokenResult.manifest.exhausted).toBe(false);

        // …and separable on the axis that says "and here is what to do about it".
        expect(refusedResult.manifest.unavailable).toBe(true);
        expect(brokenResult.manifest.unavailable).toBe(false);

        // The vocabulary follows the type, so a reader is not told a deployment fact "failed".
        for (const entry of refusedResult.manifest.reasons) {
            expect(entry).toContain('unavailable on this plane');
            expect(entry).not.toContain('failed')
        }
        for (const entry of brokenResult.manifest.reasons) {
            expect(entry).toContain('failed')
        }
    });

    test('a MIXED outcome revokes the flag — one refused family cannot vouch for a broken one', async () => {
        // The narrow reading of `unavailable`: it means "nothing is broken, this plane just cannot see
        // that source". A genuine fault alongside a clean refusal has to revoke it, or the flag would
        // tell an operator to stand down while something is actually wrong.
        const source = makeLandscapeCensusSource(depsWith({
            fetchIssuesPage      : makeRefusingCensusPageReader(reason),
            fetchPullRequestsPage: async () => { throw new Error('socket hang up') }
        }));

        const {manifest} = await source.queryOpenWorkCensus();

        expect(manifest.exhausted).toBe(false);
        expect(manifest.unavailable).toBe(false);
        expect(manifest.reasons.some(entry => entry.includes('unavailable on this plane'))).toBe(true);
        expect(manifest.reasons.some(entry => entry.includes('failed'))).toBe(true)
    });

    test('an unexplained refusal is refused: the reason is required', async () => {
        // A refusal with no reason is indistinguishable from a bug once it reaches the walk's output,
        // and the caller owns the vocabulary — so an empty one fails at construction, not at read time.
        expect(() => makeRefusingCensusPageReader()).toThrow(TypeError);
        expect(() => makeRefusingCensusPageReader('')).toThrow(/reason/);
    })
});
