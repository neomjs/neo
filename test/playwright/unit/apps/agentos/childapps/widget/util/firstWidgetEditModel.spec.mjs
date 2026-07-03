import {setup} from '../../../../../../setup.mjs';

const appName = 'FirstWidgetEditModelTest';

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
import Neo            from '../../../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../../../src/core/_export.mjs';

/**
 * @summary Unit coverage for the pure first-widget edit MODEL — the mapping from a parsed edit to a
 * bounded live-grid mutation descriptor.
 *
 * Verifies the deterministic shape the controller applies to the live grid: a `rename` maps to a `{title}`
 * descriptor; a `rowCount` / `reset` maps to a `{rows}` descriptor of FRESH row objects with unique keys
 * (so a mutation can never alias the seed rows or collide store keys); the canonical seed rows survive a
 * row-count change; and an unrecognised edit maps to an empty (no-op) descriptor. This is the unit half of
 * the live-mutate proof — the render smoke proves it reaches the live grid + evidence pane.
 *
 * @see apps/agentos/childapps/widget/util/firstWidgetEditModel.mjs
 */
test.describe('AgentOSWidget.util.firstWidgetEditModel', () => {
    let firstWidgetRows, resolveWidgetEdit;

    test.beforeAll(async () => {
        ({firstWidgetRows, resolveWidgetEdit} = await import('../../../../../../../../apps/agentos/childapps/widget/util/firstWidgetEditModel.mjs'))
    });

    test('maps a rename edit to a title descriptor', () => {
        expect(resolveWidgetEdit({type: 'rename', title: 'Q3 Metrics'})).toEqual({title: 'Q3 Metrics'})
    });

    test('maps a row-count edit to exactly that many fresh rows with unique keys', () => {
        const {rows} = resolveWidgetEdit({type: 'rowCount', count: 8});

        expect(Array.isArray(rows)).toBe(true);
        expect(rows.length).toBe(8);
        // unique keys — a keyed store must not collide
        expect(new Set(rows.map(row => row.id)).size).toBe(8);
        // every row carries the full field shape
        for (const row of rows) {
            expect(typeof row.id).toBe('string');
            expect(typeof row.task).toBe('string');
            expect(typeof row.owner).toBe('string');
            expect(typeof row.evidence).toBe('string')
        }
        // the canonical seed rows survive a row-count change (first rows are the meaningful ones)
        expect(rows[0].id).toBe('intent');
        expect(rows[1].id).toBe('render');
        expect(rows[2].id).toBe('evidence')
    });

    test('maps a reset edit to the canonical seed rows', () => {
        const {rows} = resolveWidgetEdit({type: 'reset'});

        expect(rows.length).toBe(firstWidgetRows.length);
        expect(rows.map(row => row.id)).toEqual(firstWidgetRows.map(row => row.id))
    });

    test('returns FRESH row objects — never an alias of the seed rows', () => {
        const {rows} = resolveWidgetEdit({type: 'reset'});

        rows.forEach((row, index) => expect(row).not.toBe(firstWidgetRows[index]));
        // mutating a produced row must not bleed into the shared seed
        rows[0].task = 'mutated';
        expect(firstWidgetRows[0].task).toBe('Verify intent')
    });

    test('maps an unrecognised edit to an empty no-op descriptor', () => {
        expect(resolveWidgetEdit({type: 'nope'})).toEqual({});
        expect(resolveWidgetEdit(null)).toEqual({});
        expect(resolveWidgetEdit(undefined)).toEqual({})
    })
});
