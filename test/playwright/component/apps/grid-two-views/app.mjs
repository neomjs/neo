import GridContainer from '../../../../../src/grid/Container.mjs';
import StateProvider from '../../../../../src/state/Provider.mjs';
import Viewport      from '../../../../../src/container/Viewport.mjs';

import {GridWrapTextStore} from '../grid-wrap-text/app.mjs';

/**
 * The columns of both grids. `text` takes the width its grid leaves it, so the same text wraps to a different
 * number of lines in each.
 * @returns {Object[]}
 */
const columns = () => [
    {dataField: 'id',   text: '#',    width: 80},
    {dataField: 'text', text: 'Text', flex : 1, wrapText: true}
];

/**
 * Two content-sized grids, 400px and 900px wide, bound to one store instance: row heights belong to a view, not
 * to its records, so the same record is a different height in each grid.
 */
export const onStart = () => Neo.app({
    mainView: {
        module       : Viewport,
        layout       : {ntype: 'hbox', align: 'stretch'},
        stateProvider: {module: StateProvider, stores: {records: {module: GridWrapTextStore}}},
        items        : [{
            module          : GridContainer,
            bind            : {store: 'stores.records'},
            columns         : columns(),
            contentSizedRows: true,
            flex            : 'none',
            id              : 'grid-narrow',
            width           : 400
        }, {
            module          : GridContainer,
            bind            : {store: 'stores.records'},
            columns         : columns(),
            contentSizedRows: true,
            flex            : 'none',
            id              : 'grid-wide',
            width           : 900
        }]
    },
    name: 'Test.Playwright.GridTwoViews'
});
