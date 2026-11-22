import BaseViewport from '../../../../../src/container/Viewport.mjs';

/**
 * @summary The window a tile of the sortable dashboard opens in. It starts empty: the dashboard moves the dragged
 * tile into it once the window connects to the shared App worker, and takes the tile back when the window closes
 * or the tile is dragged back.
 * @class Neo.examples.dashboard.sortable.childapps.widget.Viewport
 * @extends Neo.container.Viewport
 */
class Viewport extends BaseViewport {
    static config = {
        /**
         * @member {String} className='Neo.examples.dashboard.sortable.childapps.widget.Viewport'
         * @protected
         */
        className: 'Neo.examples.dashboard.sortable.childapps.widget.Viewport',
        /**
         * @member {String[]} cls=['sortable-widget-viewport']
         * @reactive
         */
        cls: ['sortable-widget-viewport'],
        /**
         * @member {Object} layout={ntype:'fit'}
         * @reactive
         */
        layout: {ntype: 'fit'}
    }
}

export default Neo.setupClass(Viewport);
