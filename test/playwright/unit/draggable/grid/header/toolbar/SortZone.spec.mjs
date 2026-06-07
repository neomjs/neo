import {setup} from '../../../../../setup.mjs';

const appName = 'GridHeaderSortZoneTest';

setup({
    appConfig: {
        name: appName
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../../src/core/_export.mjs';
import SortZone       from '../../../../../../../src/draggable/grid/header/toolbar/SortZone.mjs';

/**
 * @summary Regression coverage for Neo.draggable.grid.header.toolbar.SortZone multi-body resolution.
 *
 * Once the grid split into separate locked-start / center / locked-end bodies, the SortZone could
 * no longer assume a single `grid.body`: locked-column cells live in the start / end body. The
 * `gridBody` getter resolves the body paired with the dragged toolbar via its `layoutLock` region,
 * read off the durable `gridContainer` back-reference.
 */
test.describe('Neo.draggable.grid.header.toolbar.SortZone', () => {
    test('gridBody resolves the region body via owner.layoutLock off owner.gridContainer', () => {
        const getGridBody   = Object.getOwnPropertyDescriptor(SortZone.prototype, 'gridBody').get,
              gridContainer = {bodyStart: 'startBody', body: 'centerBody', bodyEnd: 'endBody'},
              resolve       = layoutLock => getGridBody.call({owner: {gridContainer, layoutLock}});

        expect(resolve('start')).toBe('startBody');     // locked-start toolbar → bodyStart
        expect(resolve('end')).toBe('endBody');         // locked-end toolbar   → bodyEnd
        expect(resolve(null)).toBe('centerBody');       // center toolbar (no layoutLock) → body
        expect(resolve(undefined)).toBe('centerBody')   // center toolbar (unset) → body
    })
});
