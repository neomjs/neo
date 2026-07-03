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
 * @summary Unit coverage for projecting a live inserted grid into evidence.
 *
 * Verifies the H2 provenance seam against the REAL live-grid shape (its `columns` is a Neo collection
 * whose `.items` are the column components, its `store` a collection with a `count`): a live created
 * grid projects to the deterministic `{schema, title, columns, rows}` blueprint shape, reading only
 * safe scalar metadata — never the column components' internals (renderers, widths) or the store's
 * record data. The title falls back sensibly, a plain-array config is accepted defensively, anything
 * that is not a usable grid fails closed to `null`, and the output flows cleanly through the existing
 * `projectBlueprintEvidence` safe boundary unchanged.
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
     * A live-grid stand-in matching the real instance the `insert {index, item}` event hands the
     * controller: a class id, a columns COLLECTION (its `.items` are full column components), a store
     * COLLECTION with a count, plus extra props/methods that must NOT leak.
     */
    const liveGrid = () => ({
        className: 'Neo.grid.Container',
        id       : 'inserted-grid-h2',
        columns  : {
            count: 3,
            items: [
                {dataField: 'task',     text: 'Task',     renderer: () => 'x', cellAlign: 'left'},
                {dataField: 'owner',    text: 'Owner',    width: 140},
                {dataField: 'evidence', text: 'Evidence', hidden: false}
            ]
        },
        store: {
            count: 3,
            items: [{id: 'a'}, {id: 'b'}, {id: 'c'}]
        },
        // hostile / irrelevant surface that must never reach the evidence blueprint
        destroy      : () => 'boom',
        vdom         : {cn: [{tag: 'script'}]},
        onConstructed: 'doSomething()'
    });

    test('projects a live created grid to the deterministic blueprint shape', () => {
        const result = projectCreatedGrid(liveGrid());

        expect(result).toEqual({
            schema : 'Neo.grid.Container',
            title  : 'inserted-grid-h2',
            columns: [
                {dataField: 'task',     text: 'Task'},
                {dataField: 'owner',    text: 'Owner'},
                {dataField: 'evidence', text: 'Evidence'}
            ],
            rows: [undefined, undefined, undefined]
        })
    });

    test('reads only the four blueprint keys — no column internals, props or record data leak', () => {
        const result = projectCreatedGrid(liveGrid());

        expect(Object.keys(result).sort()).toEqual(['columns', 'rows', 'schema', 'title']);
        // column components carry renderers/widths — only dataField + text survive
        expect(Object.keys(result.columns[0]).sort()).toEqual(['dataField', 'text']);
        // row COUNT is preserved but no record data is copied through
        expect(result.rows).toHaveLength(3);
        expect(result.rows.some(row => row !== undefined)).toBe(false)
    });

    test('prefers an explicit title, then the id, then the schema', () => {
        expect(projectCreatedGrid({...liveGrid(), title: 'First Neo Grid'}).title).toBe('First Neo Grid');
        expect(projectCreatedGrid(liveGrid()).title).toBe('inserted-grid-h2'); // no title -> id
        expect(projectCreatedGrid({...liveGrid(), id: undefined}).title).toBe('Neo.grid.Container') // no title/id -> schema
    });

    test('derives the row count from store.items or a plain-array store.data when count is absent', () => {
        const noCount = liveGrid();
        delete noCount.store.count;
        expect(projectCreatedGrid(noCount).rows).toHaveLength(3); // falls to the store collection's items

        const dataShape = {...liveGrid(), store: {data: [{id: 1}, {id: 2}]}};
        expect(projectCreatedGrid(dataShape).rows).toHaveLength(2); // defensive {data} config

        const empty = {...liveGrid(), store: {count: 0, items: []}};
        expect(projectCreatedGrid(empty).rows).toHaveLength(0)
    });

    test('accepts a plain-array columns config defensively', () => {
        const arrayShape = {
            className: 'Neo.grid.Container',
            id       : 'cfg-grid',
            columns  : [{dataField: 'a', text: 'A'}, {dataField: 'b', text: 'B'}],
            store    : {count: 1, data: [{a: 1}]}
        };

        expect(projectCreatedGrid(arrayShape)).toEqual({
            schema : 'Neo.grid.Container',
            title  : 'cfg-grid',
            columns: [{dataField: 'a', text: 'A'}, {dataField: 'b', text: 'B'}],
            rows   : [undefined]
        })
    });

    test('fails closed to null when the input is not a usable grid', () => {
        const bad = [
            null, undefined, 'a string', 42, ['an', 'array'],
            {columns: {items: []}, store: {count: 0}},                  // no className
            {className: 'Neo.grid.Container', store: {count: 0}},       // no columns
            {className: 'Neo.grid.Container', columns: {items: []}},    // no store
            {className: '', columns: {items: []}, store: {count: 0}}    // empty className
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
            title      : 'inserted-grid-h2',
            columnCount: 3,
            rowCount   : 3
        })
    })
});
