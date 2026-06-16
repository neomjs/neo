import {setup} from '../../../../../../setup.mjs';

const appName = 'CreatedGridEvidenceTest';

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
 * @summary Unit coverage for projecting a live Neural-Link-created grid into evidence.
 *
 * Verifies the H2 provenance seam: a live created grid projects to the deterministic
 * `{schema, title, columns, rows}` blueprint shape, the projection reads only safe scalar metadata
 * (never the live store's record data or the grid's other props/methods), the title falls back
 * sensibly, and anything that is not a usable grid fails closed to `null`. A final case proves the
 * output flows cleanly through the existing `projectBlueprintEvidence` safe boundary unchanged.
 *
 * @see apps/agentos/childapps/widget/util/createdGridEvidence.mjs
 */
test.describe('AgentOSWidget.util.createdGridEvidence', () => {
    let projectCreatedGrid, projectBlueprintEvidence;

    test.beforeAll(async () => {
        ({projectCreatedGrid}       = await import('../../../../../../../../apps/agentos/childapps/widget/util/createdGridEvidence.mjs'));
        ({projectBlueprintEvidence} = await import('../../../../../../../../apps/agentos/childapps/widget/util/blueprintEvidence.mjs'))
    });

    /**
     * A live-grid stand-in: the shape the `insert {index, item}` event hands the controller — a class
     * id, column definitions, a live store with a count, plus extra props/methods that must NOT leak.
     */
    const liveGrid = () => ({
        className: 'Neo.grid.Container',
        id       : 'nl-created-grid-h2-proof',
        columns  : [
            {dataField: 'task',     text: 'Task'},
            {dataField: 'owner',    text: 'Owner'},
            {dataField: 'evidence', text: 'Evidence'}
        ],
        store: {
            count: 3,
            data : [{id: 'a'}, {id: 'b'}, {id: 'c'}]
        },
        // hostile / irrelevant surface that must never reach the evidence blueprint
        destroy   : () => 'boom',
        vdom      : {cn: [{tag: 'script'}]},
        onConstructed: 'doSomething()'
    });

    test('projects a live created grid to the deterministic blueprint shape', () => {
        const result = projectCreatedGrid(liveGrid());

        expect(result).toEqual({
            schema : 'Neo.grid.Container',
            title  : 'nl-created-grid-h2-proof',
            columns: [
                {dataField: 'task',     text: 'Task'},
                {dataField: 'owner',    text: 'Owner'},
                {dataField: 'evidence', text: 'Evidence'}
            ],
            rows: [undefined, undefined, undefined]
        })
    });

    test('reads only the four blueprint keys — no live grid props/methods leak', () => {
        const result = projectCreatedGrid(liveGrid());

        expect(Object.keys(result).sort()).toEqual(['columns', 'rows', 'schema', 'title']);
        // row COUNT is preserved but no record data is copied through
        expect(result.rows).toHaveLength(3);
        expect(result.rows.some(row => row !== undefined)).toBe(false)
    });

    test('prefers an explicit title, then the id, then the schema', () => {
        expect(projectCreatedGrid({...liveGrid(), title: 'First Neo Grid'}).title).toBe('First Neo Grid');
        expect(projectCreatedGrid(liveGrid()).title).toBe('nl-created-grid-h2-proof'); // no title -> id
        expect(projectCreatedGrid({...liveGrid(), id: undefined}).title).toBe('Neo.grid.Container') // no title/id -> schema
    });

    test('derives the row count from store.data when count is absent', () => {
        const grid = liveGrid();
        delete grid.store.count;
        expect(projectCreatedGrid(grid).rows).toHaveLength(3);

        const empty = liveGrid();
        empty.store = {count: 0, data: []};
        expect(projectCreatedGrid(empty).rows).toHaveLength(0)
    });

    test('fails closed to null when the input is not a usable grid', () => {
        const bad = [
            null, undefined, 'a string', 42, ['an', 'array'],
            {columns: [], store: {count: 0}},                          // no className
            {className: 'Neo.grid.Container', store: {count: 0}},       // no columns array
            {className: 'Neo.grid.Container', columns: []},             // no store
            {className: '', columns: [], store: {count: 0}}             // empty className
        ];

        for (const input of bad) {
            expect(projectCreatedGrid(input)).toBeNull()
        }
    });

    test('output flows cleanly through the projectBlueprintEvidence safe boundary', () => {
        const projected = projectCreatedGrid(liveGrid()),
              evidence  = projectBlueprintEvidence(projected);

        expect(evidence).toEqual({
            accepted   : true,
            schema     : 'Neo.grid.Container',
            title      : 'nl-created-grid-h2-proof',
            columnCount: 3,
            rowCount   : 3
        })
    })
});
