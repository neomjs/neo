import {setup} from '../../../../setup.mjs';

const appName = 'LaneLandscapeProjectionTest';

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
 * Current-state projection tests for the explore_lane_landscape Bird View: the three dimensions
 * (authority coverage, dependency path, goal trajectory), open-only census filtering, honest
 * unknown handling, and the fail-loud injected clock.
 */
test.describe('laneLandscapeProjection — current-state lane landscape', () => {
    let projectLaneLandscape, normalizeLaneLandscapeCensus, buildLaneLandscape;

    const now = new Date('2026-07-16T09:00:00.000Z');

    test.beforeAll(async () => {
        const mod = await import('../../../../../../ai/services/graph/laneLandscapeProjection.mjs');
        projectLaneLandscape         = mod.projectLaneLandscape;
        normalizeLaneLandscapeCensus = mod.normalizeLaneLandscapeCensus;
        buildLaneLandscape           = mod.buildLaneLandscape;
    });

    test('authority coverage: open items split into assigned vs unassigned gaps', () => {
        const result = projectLaneLandscape({
            items: [
                {id: 'issue-1', state: 'OPEN', assignee: 'ada'},
                {id: 'issue-2', state: 'OPEN'},
                {id: 'issue-3', state: 'OPEN', assignees: ['euclid']}
            ],
            now
        });

        expect(result.authorityCoverage.assignedCount).toBe(2);
        expect(result.authorityCoverage.unassignedCount).toBe(1);
        expect(result.authorityCoverage.unassignedIds).toEqual(['issue-2']);
        expect(result.notAuthority).toBe(true);
    });

    test('closed items are excluded from the census (open-state only)', () => {
        const result = projectLaneLandscape({
            items: [{id: 'issue-1', state: 'OPEN'}, {id: 'issue-2', state: 'CLOSED'}],
            now
        });

        expect(result.coverage.totalOpenItems).toBe(1);
        expect(result.authorityCoverage.unassignedIds).toEqual(['issue-1']);
    });

    test('dependency path: open item blocked by an open blocker; closed/foreign blockers dropped', () => {
        const result = projectLaneLandscape({
            items: [
                {id: 'issue-10', state: 'OPEN'},
                {id: 'issue-11', state: 'OPEN'},
                {id: 'issue-12', state: 'CLOSED'}
            ],
            edges: [
                {type: 'BLOCKS', source: 'issue-11', target: 'issue-10'},  // open blocker → live block
                {type: 'BLOCKS', source: 'issue-12', target: 'issue-10'},  // closed blocker → not a live dep
                {type: 'BLOCKS', source: 'issue-11', target: 'issue-99'}   // blocked not in census → dropped
            ],
            now
        });

        expect(result.dependencyPath).toEqual([{id: 'issue-10', blockedBy: ['issue-11']}]);
    });

    test('goal trajectory: open epics (by label OR type) with still-open children only', () => {
        const result = projectLaneLandscape({
            items: [
                {id: 'issue-100', state: 'OPEN', labels: ['epic']},
                {id: 'issue-101', state: 'OPEN'},
                {id: 'issue-102', state: 'CLOSED'},
                {id: 'issue-200', state: 'OPEN', type: 'EPIC'}
            ],
            edges: [
                {type: 'PARENT_OF', source: 'issue-100', target: 'issue-101'},
                {type: 'PARENT_OF', source: 'issue-100', target: 'issue-102'}
            ],
            now
        });

        expect(result.goalTrajectory.find(entry => entry.id === 'issue-100'))
            .toEqual({id: 'issue-100', openChildCount: 1, openChildren: ['issue-101']});
        expect(result.goalTrajectory.map(entry => entry.id)).toEqual(['issue-100', 'issue-200']);
    });

    test('citations name the record behind every row, joinable by id, with an invocable drill-down', () => {
        const result = projectLaneLandscape({
            items: [
                {id: 'issue-1', number: 1,  kind: 'issue', state: 'OPEN', url: 'https://github.com/neomjs/neo/issues/1'},
                {id: 'pr-2',    number: 2,  kind: 'pr',    state: 'OPEN', url: 'https://github.com/neomjs/neo/pull/2'},
                {id: 'issue-3', number: 3,  kind: 'issue', state: 'CLOSED'}
            ],
            now
        });

        // the citation id IS the row id — a caller can join a citation to the dimension entry it supports
        expect(result.citations.map(citation => citation.id)).toEqual(['issue-1', 'pr-2']);
        expect(result.citations[0]).toEqual({
            id       : 'issue-1',
            type     : 'issue',
            ref      : 'https://github.com/neomjs/neo/issues/1',
            drillDown: {operation: 'get_conversation', arguments: {issue_number: 1}}
        });
        // a PR drills down by pr_number, not issue_number — the source addresses them differently
        expect(result.citations[1].type).toBe('pull_request');
        expect(result.citations[1].drillDown).toEqual({operation: 'get_conversation', arguments: {pr_number: 2}});
        // a closed item is not in the landscape, so it must not be cited as if it were
        expect(result.citations.some(citation => citation.id === 'issue-3')).toBe(false);
    });

    test('a row the source gave no number is still cited — without a drill-down it cannot honestly offer', () => {
        const result = projectLaneLandscape({
            items: [{id: 'issue-x', kind: 'issue', state: 'OPEN', url: null}],
            now
        });

        expect(result.citations[0]).toEqual({id: 'issue-x', type: 'issue', ref: null});
        expect(result.citations[0].drillDown).toBeUndefined();
    });

    test('the manifest fingerprints the member set: order-independent, and it moves when membership does', () => {
        const landscape = items => projectLaneLandscape({items, now}).sourceManifestHash;

        const a = {id: 'issue-1', number: 1, kind: 'issue', state: 'OPEN'},
              b = {id: 'issue-2', number: 2, kind: 'issue', state: 'OPEN'};

        // same members, different retrieval order → same fingerprint
        expect(landscape([a, b])).toBe(landscape([b, a]));
        // a member leaving the census (closed, or simply gone) moves it
        expect(landscape([a])).not.toBe(landscape([a, b]));
    });

    test('now is required (fail-loud, no hidden clock) and the result is frozen', () => {
        expect(() => projectLaneLandscape({items: [], now: undefined})).toThrow(/now must be a valid Date/);

        const result = projectLaneLandscape({items: [], now});
        expect(Object.isFrozen(result)).toBe(true);
        expect(Object.isFrozen(result.dependencyPath)).toBe(true);
        expect(result.coverage.totalOpenItems).toBe(0);
    });

    test('normalizeLaneLandscapeCensus namespaces ids by kind and reads real ownership evidence', () => {
        const {items, edges} = normalizeLaneLandscapeCensus({
            censusItems: [
                {number: 1, kind: 'issue', state: 'OPEN', labels: [{name: 'epic'}], assignees: [{login: 'ada'}]},
                {number: 2, kind: 'issue', state: 'OPEN', labels: ['bug'], assignees: ['euclid']}, // bare-string shape
                {number: 3, kind: 'pr',    state: 'OPEN', assignees: []},                          // unowned per the source
                {kind: 'issue', state: 'OPEN'}                                                     // no identity → dropped
            ],
            edgeRows: [
                {source: 'issue-1', target: 'issue-2', type: 'BLOCKS'},
                {source: 'issue-1', type: 'PARENT_OF'}    // no target → dropped
            ]
        });

        // ids are namespaced so graph relation edges resolve against the census
        expect(items.map(item => item.id)).toEqual(['issue-1', 'issue-2', 'pr-3']);
        expect(items[0]).toEqual({
            id       : 'issue-1',
            kind     : 'issue',
            number   : 1,
            state    : 'OPEN',
            type     : 'ISSUE',
            labels   : ['epic'],
            assignees: ['ada'],
            url      : null
        });
        // both the connection-object and bare-string shapes are accepted; neither is invented
        expect(items[1].assignees).toEqual(['euclid']);
        // a PR is a first-class row, and unowned means the SOURCE said so
        expect(items[2]).toMatchObject({id: 'pr-3', kind: 'pr', type: 'PULL_REQUEST', assignees: []});
        expect(edges).toEqual([{type: 'BLOCKS', source: 'issue-1', target: 'issue-2'}]);
    });

    test('normalizeLaneLandscapeCensus output feeds projectLaneLandscape end-to-end', () => {
        const census = normalizeLaneLandscapeCensus({
            censusItems: [
                {number: 1, kind: 'issue', state: 'OPEN'},
                {number: 2, kind: 'issue', state: 'OPEN', assignees: ['euclid']}
            ],
            edgeRows: [{source: 'issue-2', target: 'issue-1', type: 'BLOCKS'}]
        });
        const result = projectLaneLandscape({...census, now});

        expect(result.authorityCoverage.unassignedIds).toEqual(['issue-1']);
        expect(result.dependencyPath).toEqual([{id: 'issue-1', blockedBy: ['issue-2']}]);
    });

    test('buildLaneLandscape composes the census walk + relations into the projection', async () => {
        const result = await buildLaneLandscape({
            queryOpenWorkCensus: async () => ({
                items: [
                    {number: 1, kind: 'issue', state: 'OPEN'},
                    {number: 2, kind: 'issue', state: 'OPEN', assignees: ['ada']}
                ],
                manifest: {exhausted: true, pages: 1, reasons: []}
            }),
            queryRelationEdges: async () => ({
                edges   : [{source: 'issue-2', target: 'issue-1', type: 'BLOCKS'}],
                manifest: {exhausted: true, reasons: []}
            }),
            now
        });

        // A complete census is the one case where the total IS knowable, so both fields carry it.
        expect(result.coverage).toEqual({totalOpenItems: 2, observedOpenItems: 2, edgeCount: 1, degraded: false, degradedReasons: []});
        expect(result.authorityCoverage.unassignedIds).toEqual(['issue-1']);
        expect(result.dependencyPath).toEqual([{id: 'issue-1', blockedBy: ['issue-2']}]);
    });

    test('an UNPROVEN census degrades even though nothing threw — presence is not exhaustion', async () => {
        // The defect this contract exists to kill: a read that succeeded says nothing about whether it
        // saw everything. Only the source reporting no next page proves that.
        const result = await buildLaneLandscape({
            queryOpenWorkCensus: async () => ({
                items   : [{number: 1, kind: 'issue', state: 'OPEN'}],
                manifest: {exhausted: false, pages: 1, reasons: ['open issues: walk stopped at the bound']}
            }),
            queryRelationEdges: async () => ({edges: [], manifest: {exhausted: true, reasons: []}}),
            now
        });

        expect(result.coverage.degraded).toBe(true);
        // the partial evidence still surfaces — labelled incomplete rather than discarded — but as a
        // FLOOR, not a total: the walk stopped at a bound, so "1" is what was seen and the real
        // total is unknown. Reporting it as `totalOpenItems` would be the clipped read claiming
        // completeness it explicitly failed to prove.
        expect(result.coverage.observedOpenItems).toBe(1);
        expect(result.coverage.totalOpenItems).toBeNull();
        // and it says WHICH part is missing: a degraded flag without its reason is only half-honest
        expect(result.coverage.degradedReasons).toEqual(['open issues: walk stopped at the bound']);
    });

    test('a complete item census over a CLIPPED relation read still degrades — both legs must prove themselves', async () => {
        const result = await buildLaneLandscape({
            queryOpenWorkCensus: async () => ({
                items   : [{number: 1, kind: 'issue', state: 'OPEN'}],
                manifest: {exhausted: true, pages: 1, reasons: []}
            }),
            queryRelationEdges: async () => ({
                edges   : [],
                manifest: {exhausted: false, reasons: ['landscape relations: edge read hit the 1-record bound']}
            }),
            now
        });

        expect(result.coverage.degraded).toBe(true);
        expect(result.coverage.degradedReasons).toEqual(['landscape relations: edge read hit the 1-record bound']);
    });

    test('buildLaneLandscape fail-closed: a source read error yields an honest degraded landscape', async () => {
        const result = await buildLaneLandscape({
            queryOpenWorkCensus: async () => { throw new Error('graphql down'); },
            queryRelationEdges : async () => ({edges: [], manifest: {exhausted: true, reasons: []}}),
            now
        });

        expect(result.coverage.degraded).toBe(true);
        expect(result.goalTrajectory).toEqual([]);
        expect(result.notAuthority).toBe(true);
        // the failure names itself rather than presenting as an empty landscape
        expect(result.coverage.degradedReasons.join(' ')).toContain('graphql down');

        // THE defect, asserted directly. This line previously read `toBe(0)` — directly beneath the
        // comment above claiming the landscape does not present as empty, while asserting the exact
        // shape an empty one produces. A caller that reads a count without branching on `degraded`
        // could not tell "no open work" from "the census could not run", and for a next-lane engine
        // that is the worse direction: it reports no lanes rather than the wrong lane.
        expect(result.coverage.totalOpenItems).toBeNull();
        expect(result.authorityCoverage.assignedCount).toBeNull();
        expect(result.authorityCoverage.unassignedCount).toBeNull();
        // observed stays a real number — zero items were genuinely seen, which is true and useful
        expect(result.coverage.observedOpenItems).toBe(0);

        // The property that matters, stated as the contract rather than as three field assertions:
        // no count in a degraded landscape may be read as a quantity.
        const counts = [
            result.coverage.totalOpenItems,
            result.authorityCoverage.assignedCount,
            result.authorityCoverage.unassignedCount
        ];

        expect(counts.every(value => typeof value !== 'number')).toBe(true);
    });
});
