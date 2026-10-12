import Viewport from '../../../../../src/container/Viewport.mjs';

import {GridContentSizedGrid, GridContentSizedStore} from '../grid-content-sized/app.mjs';

/**
 * The content-sized grid of `grid-content-sized`, with a body that animates its rows. In content-sized mode the
 * animation plugin stands aside, so a sort renders the rows at their geometry offsets.
 */
export const onStart = () => Neo.app({
    mainView: {
        module: Viewport,
        layout: 'fit',
        items : [{
            module          : GridContentSizedGrid,
            body            : {animatedRowSorting: true},
            contentSizedRows: true,
            id              : 'grid-animated-content-sized',
            rowHeight       : 32,
            store           : GridContentSizedStore,
            columns         : [
                {dataField: 'id',     text: '#',      width: 80},
                {dataField: 'name',   text: 'Name',   flex : 1},
                {dataField: 'height', text: 'Height', width: 100}
            ]
        }]
    },
    name: 'Test.Playwright.GridAnimatedContentSized'
});
