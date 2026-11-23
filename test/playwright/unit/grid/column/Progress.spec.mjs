import {setup} from '../../../setup.mjs';

const appName = 'ProgressColumnTransitionTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        unitTestMode           : true,
        useDomApiRenderer      : true
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect}     from '@playwright/test';
import fs                 from 'node:fs';
import path               from 'node:path';
import {fileURLToPath}    from 'node:url';
import Neo                from '../../../../../src/Neo.mjs';
import * as core          from '../../../../../src/core/_export.mjs';
import '../../../../../src/manager/Instance.mjs';
import DomApiVnodeCreator from '../../../../../src/vdom/util/DomApiVnodeCreator.mjs';
import VdomHelper         from '../../../../../src/vdom/Helper.mjs';
import Model              from '../../../../../src/data/Model.mjs';
import RecordFactory      from '../../../../../src/data/RecordFactory.mjs';
import ProgressColumn     from '../../../../../src/grid/column/Progress.mjs';

const currentDir      = path.dirname(fileURLToPath(import.meta.url)),
      progressCssPath = path.resolve(currentDir, '../../../../../resources/css/src/grid/column/Progress.css');

/**
 * @summary Verifies Neo.grid.column.Progress record-identity transition gating and CSS contract.
 */
test.describe('Neo.grid.column.Progress same-record transition gating', () => {
    let column, gridContainer, model, recordA, recordB, row;

    test.beforeEach(() => {
        column = Neo.create(ProgressColumn, {
            appName,
            dataField: 'demand'
        });

        model = Neo.create(Model, {
            fields: [{name: 'id'}, {name: 'demand'}]
        });

        recordA = RecordFactory.createRecord(model, {id: '1', demand: 25});
        recordB = RecordFactory.createRecord(model, {id: '2', demand: 80});

        gridContainer = {
            appName,
            windowId: 'win-1',
            body    : {getStateProvider: () => null}
        };

        row = {id: 'row-1', theme: 'neo-theme-neo-dark'};
    });

    test.afterEach(() => {
        column.destroy();
        model.destroy();
    });

    test('applies neo-progress-animate only on same-record updates and clears it on pooled row recycling', async () => {
        // 1. Initial mount: no transition class
        const cellCmp = column.cellRenderer({gridContainer, record: recordA, row});

        await cellCmp.initVnode();
        cellCmp.mounted = true;

        expect(cellCmp.value).toBe(25);
        expect(cellCmp.cls).not.toContain('neo-progress-animate');
        expect(cellCmp.getVdomRoot().tag).toBe('progress');
        expect(cellCmp.getVdomRoot().cls).not.toContain('neo-progress-animate');

        // 2. Same-record in-place update: adds neo-progress-animate onto <progress>
        recordA.demand = 65;
        column.cellRenderer({component: cellCmp, gridContainer, record: recordA, row});
        await cellCmp.promiseUpdate();

        expect(cellCmp.value).toBe(65);
        expect(cellCmp.cls).toContain('neo-progress-animate');
        expect(cellCmp.getVdomRoot().cls).toContain('neo-progress-animate');

        // 3. Pooled row recycle onto recordB: removes neo-progress-animate in the same update
        column.cellRenderer({component: cellCmp, gridContainer, record: recordB, row});
        await cellCmp.promiseUpdate();

        expect(cellCmp.value).toBe(80);
        expect(cellCmp.cls).not.toContain('neo-progress-animate');
        expect(cellCmp.getVdomRoot().cls).not.toContain('neo-progress-animate');

        cellCmp.destroy();
    });

    test('respects useTransition: false while preserving custom component cls entries', () => {
        column.useTransition = false;

        const cellCmp = column.cellRenderer({
            gridContainer,
            record: recordA,
            row
        });

        recordA.demand = 50;
        column.component = () => ({cls: ['custom-demand-bar']});
        column.cellRenderer({component: cellCmp, gridContainer, record: recordA, row});

        expect(cellCmp.value).toBe(50);
        expect(cellCmp.cls).toContain('custom-demand-bar');
        expect(cellCmp.cls).toContain('neo-progress');
        expect(cellCmp.cls).not.toContain('neo-progress-animate');

        cellCmp.destroy();
    });

    test('Progress.css scopes width transition to non-scrolling neo-progress-animate and honors prefers-reduced-motion', () => {
        const css = fs.readFileSync(progressCssPath, 'utf8');

        expect(css).toContain('flex     : 1;');
        expect(css).toContain('width     : 100%;');
        expect(css).toContain('.neo-grid-body:not(.neo-is-scrolling) .neo-grid-cell .neo-progress-wrapper progress[value].neo-progress-animate');
        expect(css).toContain('transition: width 220ms ease-out;');
        expect(css).toContain('prefers-reduced-motion: reduce');
        expect(css).not.toMatch(/::-moz-progress-bar\s*,\s*&?::-webkit-progress-value/);
    });
});
