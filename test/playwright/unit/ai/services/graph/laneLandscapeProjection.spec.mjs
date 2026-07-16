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

        expect(result.coverage).toEqual({totalOpenItems: 2, edgeCount: 1, degraded: false, degradedReasons: []});
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
        // the partial evidence still surfaces — labelled incomplete rather than discarded
        expect(result.coverage.totalOpenItems).toBe(1);
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
        expect(result.coverage.totalOpenItems).toBe(0);
        expect(result.goalTrajectory).toEqual([]);
        expect(result.notAuthority).toBe(true);
        // the failure names itself rather than presenting as an empty landscape
        expect(result.coverage.degradedReasons.join(' ')).toContain('graphql down');
    });
});
