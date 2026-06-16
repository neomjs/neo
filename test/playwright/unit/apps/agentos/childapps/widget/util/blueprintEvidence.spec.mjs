import {setup} from '../../../../../../setup.mjs';

const appName = 'BlueprintEvidenceTest';

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
 * @summary Unit coverage for the safe first-widget blueprint-evidence projection.
 *
 * Verifies the safe boundary the H2 transcript/evidence pane relies on: a valid blueprint projects
 * to scalar metadata only; malformed input (non-object, unexpected keys, missing/wrong-typed required
 * fields) fails closed to a bounded `{accepted: false, reason}` state; and the raw columns/rows arrays
 * never leak into the projection, so no executable payload can reach the view.
 *
 * @see apps/agentos/childapps/widget/util/blueprintEvidence.mjs
 */
test.describe('AgentOSWidget.util.blueprintEvidence', () => {
    let projectBlueprintEvidence;

    test.beforeAll(async () => {
        ({projectBlueprintEvidence} = await import('../../../../../../../../apps/agentos/childapps/widget/util/blueprintEvidence.mjs'))
    });

    test('projects a valid grid blueprint to safe scalar metadata only', () => {
        const result = projectBlueprintEvidence({
            schema : 'Neo.grid.Container',
            title  : 'My First Grid',
            columns: [{dataField: 'id'}, {dataField: 'name'}, {dataField: 'role'}],
            rows   : [{id: 1}, {id: 2}]
        });

        expect(result).toEqual({
            accepted   : true,
            schema     : 'Neo.grid.Container',
            title      : 'My First Grid',
            columnCount: 3,
            rowCount   : 2
        });

        // the raw arrays must NOT leak through — only scalar counts reach the view
        expect(result).not.toHaveProperty('columns');
        expect(result).not.toHaveProperty('rows')
    });

    test('fails closed on non-object input', () => {
        for (const bad of [null, undefined, 'a string', 42, ['an', 'array']]) {
            const result = projectBlueprintEvidence(bad);
            expect(result.accepted).toBe(false);
            expect(typeof result.reason).toBe('string')
        }
    });

    test('fails closed on unexpected (allowlist-violating) keys', () => {
        const result = projectBlueprintEvidence({
            schema : 'Neo.grid.Container',
            title  : 'X',
            columns: [],
            rows   : [],
            onClick: 'doSomething()' // an executable-looking field must be rejected, never projected
        });

        expect(result.accepted).toBe(false);
        expect(result.reason).toMatch(/unexpected keys/);
        expect(result.reason).toMatch(/onClick/)
    });

    test('fails closed on missing or wrong-typed required metadata', () => {
        expect(projectBlueprintEvidence({title: 'X', columns: [], rows: []}).accepted).toBe(false);              // no schema
        expect(projectBlueprintEvidence({schema: 'G', columns: [], rows: []}).accepted).toBe(false);             // no title
        expect(projectBlueprintEvidence({schema: 'G', title: 'X', columns: 3, rows: []}).accepted).toBe(false);  // columns not array
        expect(projectBlueprintEvidence({schema: 'G', title: 'X', columns: [], rows: 'two'}).accepted).toBe(false) // rows not array
    })
});
