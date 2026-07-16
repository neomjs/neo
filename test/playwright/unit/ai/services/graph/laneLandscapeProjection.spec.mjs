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
    let projectLaneLandscape, normalizeLaneLandscapeCensus;

    const now = new Date('2026-07-16T09:00:00.000Z');

    test.beforeAll(async () => {
        const mod = await import('../../../../../../ai/services/graph/laneLandscapeProjection.mjs');
        projectLaneLandscape         = mod.projectLaneLandscape;
        normalizeLaneLandscapeCensus = mod.normalizeLaneLandscapeCensus;
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

    test('normalizeLaneLandscapeCensus parses flat + properties + string-JSON rows; drops unparseable/id-less', () => {
        const {items, edges} = normalizeLaneLandscapeCensus({
            nodeRows: [
                {id: 'issue-1', data: JSON.stringify({properties: {state: 'OPEN', assignees: ['ada'], labels: ['epic']}})},
                {id: 'issue-2', data: {state: 'OPEN'}},   // object (not string) + flat shape
                {id: 'issue-3', data: '{bad json'},       // unparseable payload → still an item (id kept, fields null)
                {data: 'no id'}                            // no id → dropped
            ],
            edgeRows: [
                {source: 'issue-1', target: 'issue-2', type: 'BLOCKS'},
                {source: 'issue-1', type: 'PARENT_OF'}    // no target → dropped
            ]
        });

        expect(items.map(item => item.id)).toEqual(['issue-1', 'issue-2', 'issue-3']);
        expect(items[0]).toEqual({id: 'issue-1', state: 'OPEN', type: null, labels: ['epic'], assignee: 'ada'});
        expect(items[1].state).toBe('OPEN');
        expect(edges).toEqual([{type: 'BLOCKS', source: 'issue-1', target: 'issue-2'}]);
    });

    test('normalizeLaneLandscapeCensus output feeds projectLaneLandscape end-to-end', () => {
        const census = normalizeLaneLandscapeCensus({
            nodeRows: [
                {id: 'issue-1', data: JSON.stringify({properties: {state: 'OPEN'}})},
                {id: 'issue-2', data: JSON.stringify({properties: {state: 'OPEN', assignees: ['euclid']}})}
            ],
            edgeRows: [{source: 'issue-2', target: 'issue-1', type: 'BLOCKS'}]
        });
        const result = projectLaneLandscape({...census, now});

        expect(result.authorityCoverage.unassignedIds).toEqual(['issue-1']);
        expect(result.dependencyPath).toEqual([{id: 'issue-1', blockedBy: ['issue-2']}]);
    });
});
